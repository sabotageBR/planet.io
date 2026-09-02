// ── BOT: cérebro único do servidor e do LocalServer (?local=1) ────────────────
// Produz input como um humano — {tx,ty,flags} — e nunca toca no mundo direto: quem aplica é o `emit` de quem criou
// (no servidor, sim.applyInput; no LocalServer, o World). Determinístico: toda aleatoriedade sai do rng recebido.
//
// Três camadas, nesta ordem:
//   PERCEPÇÃO+DECISÃO (`_think`, a cada THINK_TICKS)  varre o mundo UMA vez e escolhe a intenção por UTILIDADE
//     (flee · hunt · food · zone · hold · intercept · wander), com histerese (BOT.STICK) e compromisso mínimo
//     (BOT.COMMIT). Cascata fixa dava vaivém — decidir caçar, desistir, decidir de novo — que denuncia script.
//   AÇÃO (`act`, todo tick)  traduz a intenção em alvo e flags. Tudo que varre lista mora no _think; aqui só
//     entram contas O(1) e o perigo colado, relido a cada BOT.HAZ_TTL ticks.
//   MÃO (`_hand`)  o ponteiro NÃO pula para o alvo: tem tempo de reação, velocidade angular limitada, tremor e
//     "flick" para mirar. É o que mais muda a impressão de quem assiste — o movimento do jogo é
//     `pos += û(ponteiro)·vmax`, sem inércia, então apontar exato todo tick dá uma perseguição geometricamente
//     perfeita, com inversão de 180° instantânea, que nenhuma mão humana faz.
//
// Duas coisas que a matemática do jogo obriga e o cérebro velho ignorava:
//   1. PERSEGUIR NUNCA ALCANÇA. vmax = K/r^0,449 e comer exige EAT.RATIO: quem eu posso comer é sempre mais
//      rápido que eu. Os únicos fechadores são o salto do split, o míssil, o empurrão da Nova e ENCURRALAR —
//      por isso `hunt` mede o arco de fuga da presa e aproxima pelo lado que FECHA esse arco (ver _approach).
//   2. A ZONA ENTREGA O FUTURO. `w.zone` tem o círculo de destino e o tick da chegada; dá para comparar o tempo
//      de viagem com o que resta e sair na hora certa, em vez de reagir depois de já estar queimando.
// PERSONAS dá o estilo, SKILLS dá a mão (reação, pontaria, antecipação, margem da zona, taxa de erro).
// @ts-check
import {BOT,BLACKHOLE,STAR,ASTEROID,MISSILE,FOOD_TYPE,isWeaponFood,ZONE,WEAPON,WEAPONS,weaponOf,EAT,SPLIT,TICK_HZ} from "./constants.js";
import {INPUT_FLAG} from "./protocol/constants.js";
import {clamp} from "./util.js";
import {createRng} from "./rng.js";
import {vmaxFor} from "./physics/integrate.js";
import {incomingMissile,sameTeam,outOfZone,ammoOf} from "./physics/rules.js";

const HUMAN_BONUS=1.5;   // entre duas presas iguais, a humana vale mais (bot que caça bot é chato de ver)
const TAU=6.28318,PI=Math.PI;
const SPLIT_R=Math.SQRT2*EAT.RATIO;   // raio mínimo para engolir a presa DEPOIS do salto (r/√2 ≥ 1,15·rb)
const SKILL_W=BOT.SKILLS.reduce((a,x)=>a+x.w,0);
/** @type {{x:number,y:number,big:number,n:number,bx:number,by:number,vx:number,vy:number}} */
const TMP={x:0,y:0,big:0,n:0,bx:0,by:0,vx:0,vy:0};
const ZC={x:0,y:0,r:0};

/** @typedef {import("./physics/world.js").World} World */
/** @typedef {import("./physics/world.js").PlayerState} PlayerState */
/** @typedef {import("./physics/body.js").Body} Body */

/**
 * Centro, maior raio, nº de peças vivas e a VELOCIDADE da maior (para antecipar o alvo). Escreve em `out`
 * porque isto roda para todo jogador a cada decisão de cada bot.
 * @param {PlayerState} ps
 */
/**
 * A estrela é perigo para este bot? Abaixo de `STAR.PASS_R` a peça ATRAVESSA (rules.js `starPass`), então
 * ela deixa de ser parede e vira ABRIGO — e um bot que continuasse fugindo dela recusaria justamente o
 * único lugar que o salva de quem o está caçando. É o gêmeo literal da linha do buraco negro em
 * `_nearestHazard` ("só assusta quem ele consegue esmagar").
 * ⚠️ Mede a MAIOR peça: com um pedaço grande em campo o bot continua tendo o que perder.
 */
const temeEstrela=big=>big>=STAR.PASS_R;
/** Lista vazia compartilhada: trocar `w.stars` por `[]` num laço de 60 Hz não pode alocar por chamada. */
const VAZIO=[];
function centroid(ps,out){let sx=0,sy=0,big=0,n=0,bx=0,by=0,vx=0,vy=0;const arr=ps.pieces;
  for(let i=0;i<arr.length;i++){const p=arr[i];if(p.dead)continue;sx+=p.x;sy+=p.y;n++;
    if(p.r>big){big=p.r;bx=p.x;by=p.y;vx=p.svx+p.vx;vy=p.svy+p.vy;}}
  if(!n)return null;
  out.x=sx/n;out.y=sy/n;out.big=big;out.n=n;out.bx=bx;out.by=by;out.vx=vx;out.vy=vy;return out;}
/** Quanto uma comida vale para este bot agora (0 = ignora); powerup só vale se ele puder usar. @param {Body} f */
function foodValue(f,ps){
  switch(f.type){
    case FOOD_TYPE.AMMO:return ammoOf(ps)<weaponOf(ps.weapon).ammo?36:4;
    case FOOD_TYPE.SHIELD:return 40;
    case FOOD_TYPE.MAGNET:return 26;
    // Os powerups de jogador. Sem estes `case` eles cairiam no `f.r` do default e o bot passaria por cima de
    // um raro como se fosse poeira — a sala inteira ignorando o que o humano corre para pegar denuncia mais
    // que qualquer movimento. AMMO_PLUS vale como munição, mas sempre (ele fura o teto).
    case FOOD_TYPE.AUTODEF:return 34;
    case FOOD_TYPE.ZOOM:return 20;
    case FOOD_TYPE.AMMO_PLUS:return 44;
    case FOOD_TYPE.FEAST:return 48;
    default:
      // arma no chão vale pela raridade (a épica vale um desvio; a comum, quase nada se já tenho munição dela):
      // o peso do sorteio é o inverso da raridade, então 700/weight ordena Nova > Cacho > Rajada.
      if(isWeaponFood(f.type)){const wp=WEAPONS.find(x=>x.food===f.type);
        return wp?(wp.id<ps.ammo.length&&ps.ammo[wp.id]>0?12:700/wp.weight):f.r;}
      return f.r;}}
/** Diferença angular normalizada em (-π,π]. */
const angDiff=(a,b)=>{let d=a-b;while(d>PI)d-=TAU;while(d<-PI)d+=TAU;return d;};
/** Sorteia a perícia pelo peso: a sala tem que ter gente ruim, gente mediana e uns poucos assustadores. */
function pickSkill(rng){let v=rng.next()*SKILL_W;for(let i=0;i<BOT.SKILLS.length;i++){v-=BOT.SKILLS[i].w;if(v<=0)return BOT.SKILLS[i];}return BOT.SKILLS[0];}

export class BotBrain{
  /**
   * @param {World} world
   * @param {number} slot
   * @param {{next:()=>number,int:(a:number,b:number)=>number,range:(a:number,b:number)=>number,angle:()=>number,chance:(p:number)=>boolean}} rng
   * @param {(slot:number,cmd:{tx:number,ty:number,flags:number})=>void} emit  aplica o input (sim.applyInput ou o World)
   */
  constructor(world,slot,rng,emit){
    this.w=world;this.slot=slot;this.rng=rng;this.emit=emit;
    this.p=BOT.PERSONAS[rng.int(0,BOT.PERSONAS.length-1)];
    this.s=pickSkill(rng);
    // rng PRÓPRIO do tremor: a mão treme todo tick e não pode consumir a sequência da sala 49 vezes por tick.
    // A semente sai do rng da sala, então continua determinístico.
    this.r=createRng(rng.int(1,0x7ffffffe));
    this.edge=rng.next()<this.p.edge;   // parte dos bots joga o anel de dentro da borda, como gente faz em BR
    this._c={x:0,y:0,big:0,n:0,bx:0,by:0,vx:0,vy:0};this._o={x:0,y:0,big:0,n:0,bx:0,by:0,vx:0,vy:0};
    this._ap={x:0,y:0};this._ld={x:0,y:0};this._q=[];
    this._t={x:0,y:0,big:0,n:0,bx:0,by:0,vx:0,vy:0};   // vista do alvo no _plan — separado do _o do act
    this._pc={gd:0,gx:0,gy:0,br:0,bid:-1,bx:0,by:0};   // guarda e bocado de um inimigo multi-peça
    /** perigos próximos (jogador grande, estrela armada, asteroide que eu estouraria) — a lista que a fuga usa */
    this.dang=[];for(let i=0;i<BOT.DANG_N;i++)this.dang.push({x:0,y:0,w:0,d:0});this.dn=0;
    this.reset();}

  reset(){
    this.mode="wander";this.target=-1;this.tpid=-1;this.thx=0;this.thy=0;this.nextThink=0;this.commitUntil=0;
    this.wx=0;this.wy=0;this.gx=0;this.gy=0;this.zx=0;this.zy=0;this.fx=0;this.fy=0;this.zu=0;
    this.aim=this.r?this.r.next()*TAU:0;this.jit=0;this.reactAt=0;
    this.flickUntil=0;this.fkx=0;this.fky=0;this.fireReadyAt=0;
    this.wantFire=false;this.wantAim=false;this.wantSplit=false;this.wantWeapon=-1;
    this.fireAt=0;this.swapAt=0;this.swapTries=0;this.feedAt=0;this.feed=-1;
    this.ed=Infinity;this.haz=null;this.hazAt=0;this.safeAt=0;this.juke=1;this.dn=0;this.press=0;this.alive=0;this.mate=-1;this.lootUntil=0;this.open=1;}

  // ── AÇÃO (todo tick; só conta O(1) — o que varre lista mora no _think) ──────
  act(tick){
    const w=this.w,ps=w.players.get(this.slot);if(!ps||!ps.alive)return;
    const c=centroid(ps,this._c);if(!c)return;
    const sk=this.s;
    if(tick>=this.nextThink)this._think(ps,c,tick);
    // perigo colado relido a cada HAZ_TTL ticks: varrer estrelas+asteroides TODO tick para CADA bot era o
    // maior custo fixo do cérebro (~56 iterações × 49 bots), e o perigo não muda de lugar em 6 ticks.
    if(tick>=this.hazAt){this.haz=this._nearestHazard(c);this.hazAt=tick+BOT.HAZ_TTL;}
    let flags=0,hold=false,gx=this.gx,gy=this.gy;
    const armed=ammoOf(ps)>0&&tick>=ps.fireCdUntil;   // na carência de spawn o applyFire recusa: nem gasta o input
    // ── alvo do modo ──
    const m=this.mode;
    if(m==="hunt"||m==="flee"){
      const o=w.players.get(this.target);
      const oc=m==="hunt"?this._alvo(this._o):(o&&o.alive?centroid(o,this._o):null);
      if(!oc){this._wander(c);gx=this.wx;gy=this.wy;}
      else if(m==="hunt"){const a=this._approach(c,oc);gx=a.x;gy=a.y;
        // ⚠️ Testado e DESCARTADO: (a) segurar o ponteiro na presa pelos BOT.JUMP_TICKS do arremesso e
        // (b) só apertar com a mira dentro de um cone (HUNT.SPLIT_CONE). Medido em 24 arenas de Livre, os
        // dois PIORAM: 186 saltos → 146 (a) e → 137 (b), com os abates caindo de 86 para 74 nos dois.
        // O motivo de (a) é que `_approach` JÁ devolve o ponto de antecipação quando `dd` está dentro do
        // alcance do salto — que é exatamente a situação de quem acabou de saltar —, então a perseguição
        // só substituía o flanco (que estava ajudando) por uma linha reta. O de (b) é que a mira raramente
        // fecha antes de o `_plan` seguinte desarmar o `wantSplit`, e o salto some. As constantes
        // JUMP_TICKS e SPLIT_CONE ficam, dormentes, como BLACKHOLE.COUNT: voltam com uma janela armada.
        if(this.wantSplit&&c.n<BOT.MAX_PIECES){   // o preço do escudo já foi pago na decisão (_plan); aqui só a geometria
          const d=Math.hypot(oc.x-c.x,oc.y-c.y);
          if(d<c.big+oc.big+SPLIT.DIST*.9){flags|=INPUT_FLAG.SPLIT;this.wantSplit=false;}}}
      else{
        // DESVIO: dentro do alcance do salto, correr em linha reta para longe é correr para onde o salto CAI
        // (o arremesso é reto e cobre SPLIT.DIST). Aí a saída é atravessar a linha, não segui-la — é o que um
        // humano faz e é a única defesa real contra o split, já que fugir "para trás" é sempre mais lento.
        // (Cuspir para correr foi testado e descartado: 6 pelotas custam ~16 % da massa e devolvem 4 % de
        // velocidade, e não ajudam em nada contra o salto, que é o que realmente alcança.)
        // de quem se foge é a PEÇA que engole, relida TODO tick (o _think tem até 55 de atraso): o centróide
        // de um sujeito espalhado é espaço vazio, e fugir para lá é correr para o meio dele.
        let ax=oc.x,ay=oc.y;
        if(oc.n>1){const q=this._pecas(o,c);if(q.gd<Infinity){ax=q.gx;ay=q.gy;}}
        const perto=Math.hypot(ax-c.x,ay-c.y)<c.big+oc.big+SPLIT.DIST;
        if(tick>=this.safeAt){this._safeDir(c,ax,ay,perto?this.juke*BOT.HUNT.DODGE:0);this.safeAt=tick+3;}
        gx=this.fx;gy=this.fy;}}
    else if(m==="intercept"){const mi=w.entityById.get(this.target);
      if(!mi||mi.dead){this._wander(c);gx=this.wx;gy=this.wy;}
      else{if(tick>=this.safeAt){this._safeDir(c,mi.x,mi.y);this.safeAt=tick+3;}gx=this.fx;gy=this.fy;
        // sem AIM: o applyFire escolhe a interceptação. O `!shield` que havia aqui era consequência do
        // tiro custar um nível de escudo — o bot blindado preferia levar o míssil a gastar a blindagem.
        // Agora o tiro DEFENSIVO não cobra nada (rules.applyFire), então recusar era só morrer de graça.
        // ⚠️ revalidar o entrante: depois que o primeiro interceptador cobre o míssil, `incomingMissile`
        // com `livres` não o acha mais e o tiro seguinte sai OFENSIVO — cobrando um nível de escudo por um
        // alvo que ninguém escolheu. É o mesmo predicado que dá o desconto em applyFire.
        if(armed&&tick>=this.fireAt&&incomingMissile(w,this.slot,c.x,c.y,MISSILE.INTERCEPT_DIST,true)){
          flags|=INPUT_FLAG.FIRE;this.fireAt=tick+30;}}}
    else if(m==="food"){const f=w.entityById.get(this.target);
      if(f&&!f.dead){gx=f.x;gy=f.y;}else{this._wander(c);gx=this.wx;gy=this.wy;}}
    else if(m==="zone"){gx=this.zx;gy=this.zy;}
    else if(m==="hold"){gx=c.x;gy=c.y;hold=true;}
    else{gx=this.wx;gy=this.wy;
      if(Math.hypot(gx-c.x,gy-c.y)<BOT.WAYPOINT_DONE){this._wander(c);gx=this.wx;gy=this.wy;}}
    // ── cinto: trocar de arma é INPUT, e swapWeapon anda de um em um, então às vezes leva mais de um puxão ──
    if(this.wantWeapon>=0){
      if(ps.weapon===this.wantWeapon||this.swapTries<=0)this.wantWeapon=-1;
      else if(tick>=this.swapAt){flags|=INPUT_FLAG.SWAP;this.swapAt=tick+4;this.swapTries--;}}
    // ── tiro: mirar CUSTA movimento (o AIM escolhe pelo cursor), então é um puxão curto do ponteiro e a volta ──
    if(this.wantFire&&armed&&this.wantWeapon<0){
      if(tick>=this.fireReadyAt){flags|=INPUT_FLAG.FIRE|(this.wantAim?INPUT_FLAG.AIM:0);
        this.wantFire=false;this.fireAt=tick+this.rng.int(BOT.FIRE_CD[0],BOT.FIRE_CD[1]);}}
    if(tick<this.flickUntil){gx=this.fkx;gy=this.fky;hold=false;}
    // ── reação: intenção NOVA só chega na mão depois de skill.react ticks (o _think marca a troca) ──
    if(tick>=this.reactAt){this.gx=gx;this.gy=gy;}else{gx=this.gx;gy=this.gy;}
    // ── passar massa para o companheiro maior (a cusparada de terceiro é comível na hora, massa integral) ──
    if(this.feed>=0&&tick>=this.feedAt){const al=w.players.get(this.feed),ac=al&&al.alive?centroid(al,this._o):null;
      if(ac){gx=ac.x;gy=ac.y;flags|=INPUT_FLAG.EJECT;this.feedAt=tick+BOT.FEED_CD;}else this.feed=-1;}
    // ── ESTAR FORA DA ZONA mata sozinho e tem prioridade sobre tudo (menos uma incursão curta ao espólio) ──
    const zc=this._zoneNow();
    if(zc&&outOfZone(c,zc)&&!(tick<this.lootUntil&&this.zu<.5)){
      // o alvo sai do círculo ATUAL, não do plano do último _think: se a borda passou por cima do bot, aquele
      // ponto já está no gás e ele ficaria parado queimando. A saída mais curta é a borda mais PRÓXIMA, com folga.
      const dx=c.x-zc.x,dy=c.y-zc.y,d=Math.hypot(dx,dy)||1,k=zc.r*.8/d;
      gx=zc.x+dx*k;gy=zc.y+dy*k;this.gx=gx;this.gy=gy;flags&=~INPUT_FLAG.SPLIT;hold=false;}
    else if(this.haz){if(tick>=this.safeAt){this._safeDir(c,this.haz.x,this.haz.y);this.safeAt=tick+3;}
      gx=this.fx;gy=this.fy;flags&=~INPUT_FLAG.SPLIT;hold=false;}
    this._hand(c,gx,gy,hold,sk);
    this.emit(this.slot,{tx:this.tx,ty:this.ty,flags});}

  // ── MÃO: reação, velocidade angular, tremor ────────────────────────────────
  _hand(c,gx,gy,hold,sk){
    const w=this.w,dx=gx-c.x,dy=gy-c.y,d=Math.hypot(dx,dy);
    if(d>1){const want=Math.atan2(dy,dx),df=angDiff(want,this.aim),tr=sk.turn;
      this.aim+=df>tr?tr:df<-tr?-tr:df;}
    else this.aim+=(this.r.next()*2-1)*BOT.HAND.IDLE_TURN;
    // tremor: passeio aleatório suave, preso ao teto e puxado de volta ao centro (senão gruda no batente)
    const lim=BOT.HAND.JITTER_MAX*sk.jitter;
    this.jit=clamp(this.jit*.94+(this.r.next()*2-1)*BOT.HAND.JITTER_STEP*sk.jitter,-lim,lim);
    // a distância só importa abaixo de SPEED.RAMP (32 px), onde a peça FREIA: é assim que o bot para.
    const D=hold?BOT.HAND.STOP_R:(d<BOT.HAND.DIST?d:BOT.HAND.DIST),a=this.aim+this.jit;
    this.tx=clamp(c.x+Math.cos(a)*D,0,w.w);this.ty=clamp(c.y+Math.sin(a)*D,0,w.h);}

  // ── DECISÃO (a cada THINK_TICKS) ───────────────────────────────────────────
  _think(ps,c,tick){
    const w=this.w,p=this.p,sk=this.s,rng=this.rng;
    this.nextThink=tick+rng.int(BOT.THINK_TICKS[0],BOT.THINK_TICKS[1]);
    const fleeRatio=BOT.FLEE_RATIO/p.flee,huntRatio=BOT.HUNT_RATIO/p.hunt;
    // ── varredura ÚNICA de jogadores: ameaça, presa, companheiro e a lista de perigos da fuga ──
    this.dn=0;
    let prey=-1,pv=-Infinity,preyBig=0,preyX=0,preyY=0,preyPiece=-1,press=0,mate=-1,md=Infinity,mateBig=0,alive=0,threat=-1,td=Infinity,ed=Infinity,thx=0,thy=0;
    for(const o of w.players.values()){
      if(!o.alive)continue;alive++;if(o===ps)continue;
      const oc=centroid(o,TMP);if(!oc)continue;
      const dx=oc.x-c.x,dy=oc.y-c.y,d=Math.sqrt(dx*dx+dy*dy);
      if(sameTeam(w,o.slot,this.slot)){if(d<md){md=d;mate=o.slot;mateBig=oc.big;}continue;}
      if(d<ed)ed=d;   // inimigo mais próximo: é o que separa um tiro de um disparo para o vazio
      if(oc.big>=c.big*fleeRatio){
        // ele é maior NO TODO — mas "maior" é do jogador, e quem come é a PEÇA. Com ele partido, a peça que
        // me engole pode estar longe e sobrar um pedaço comível perto: é o pedido literal do dono.
        const q=oc.n>1?this._pecas(o,c):null;
        const gd=q&&q.gd<Infinity?q.gd:d,gx=q&&q.gd<Infinity?q.gx:oc.x,gy=q&&q.gd<Infinity?q.gy:oc.y;
        // ⚠️ `press` continua saindo do CENTRÓIDE: ele é contrato (Room._humor lê press>1.5 e a fala dos bots
        // lê press>1.2), e medir pela peça o infla — a sala inteira passaria a gritar que está sendo caçada.
        if(d<BOT.FLEE_DIST){press+=(1-d/BOT.FLEE_DIST)*(oc.big/c.big)*sk.flee;
          this._danger(gx,gy,oc.big*2.4,gd);
          if(gd<td){td=gd;threat=o.slot;thx=gx;thy=gy;}}
        // ── BOCADO: o pedaço solto de um gigante, se estiver LIMPO do guarda ──
        if(q&&q.bid>=0){const bd=Math.hypot(q.bx-c.x,q.by-c.y);
          if(bd<BOT.HUNT_DIST&&(q.gd===Infinity||Math.hypot(q.bx-q.gx,q.by-q.gy)>BOT.HUNT.BITE_CLEAR)){
            const v=(q.br*(o.isBot?1:HUMAN_BONUS)-bd*.1)*BOT.HUNT.BITE_PENALTY;
            if(v>pv){pv=v;prey=o.slot;preyBig=q.br;preyX=q.bx;preyY=q.by;preyPiece=q.bid;}}}}
      else if(c.big>=oc.big*huntRatio&&d<BOT.HUNT_DIST){
        if(!o.isBot&&tick-o.spawnTick<BOT.SPAWN_GRACE_TICKS)continue;   // acabou de cair no mapa: deixa o humano respirar
        const v=oc.big*(o.isBot?1:HUMAN_BONUS)-d*.1;
        if(v>pv){pv=v;prey=o.slot;preyBig=oc.big;preyX=oc.x;preyY=oc.y;preyPiece=-1;}}}
    this.press=press;this.alive=alive;this.mate=mate;this.ed=ed;
    if(threat>=0){this.thx=thx;this.thy=thy;}   // de onde se foge: a PEÇA que engole, não o centro do sujeito
    // companheiro maior e colado: passar massa para quem pode ganhar é a jogada certa em equipe
    this.feed=(mate>=0&&md<340&&mateBig>c.big*1.35&&rng.chance(sk.weapon*.5))?mate:-1;
    // ── perigos do mapa entram na mesma lista (a fuga precisa deles para não trocar predador por estrela) ──
    this._mapDangers(c);
    // ── zona: quanto do meu orçamento de tempo a viagem até o seguro já consome ──
    const zu=this._zonePlan(c,tick);this.zu=zu;
    // ── candidatos, pontuados na mesma escala ──
    let b1=-1,s1=-Infinity,t1=-1,b2=-1,s2=-Infinity,t2=-1;
    const oferta=(mode,sc,tg)=>{if(mode===this.mode)sc*=BOT.STICK;
      if(sc>s1){s2=s1;b2=b1;t2=t1;s1=sc;b1=mode;t1=tg;}else if(sc>s2){s2=sc;b2=mode;t2=tg;}};
    oferta("wander",.25,-1);
    if(zu>0)oferta("zone",zu>=sk.zoneMargin?3+zu:.35*zu,-1);
    if(press>0&&threat>=0)oferta("flee",1.5*press+(td<c.big+240?2:0),threat);
    this.open=1;
    if(prey>=0){this.open=this._openness(preyX,preyY);
      const dd=Math.hypot(preyX-c.x,preyY-c.y),fecha=1-this.open;
      // presa em campo aberto quase não pontua: perseguir quem é mais rápido que eu é perder tempo
      let sc=1.35*(.45+.55*fecha)*Math.max(.15,1-dd/(BOT.HUNT_DIST*1.4))*p.hunt*(.55+.45*sk.split);
      if(c.big>=preyBig*SPLIT_R*BOT.HUNT.SPLIT_MARGIN&&dd<c.big+preyBig+SPLIT.DIST*.9)sc+=.5*sk.split;
      oferta("hunt",sc,prey);}
    const f=this._bestFood(ps,c,tick);
    if(f)oferta("food",Math.min(1.5,f.s*8)*p.food,f.b.id);
    // parar para fundir: dividido, sem pressão e com a fusão perto — é a diferença mais visível entre gente e script
    if(c.n>1&&press<.3){let pronto=0,total=0;for(const q of ps.pieces){if(q.dead)continue;total++;if(w.tick>=q.mergeAt)pronto++;}
      if(pronto>=2&&total>1)oferta("hold",.95,-1);}
    if(ammoOf(ps)>0&&tick>=ps.fireCdUntil){const mi=incomingMissile(w,this.slot,c.x,c.y,BOT.MISSILE_FEAR,true);
      if(mi)oferta("intercept",1.9,mi.id);}
    // erro humano: de vez em quando ele escolhe a segunda melhor. É o que separa "difícil" de "desumano".
    if(b2>=0&&s2>-Infinity&&rng.chance(sk.mistake)){b1=b2;t1=t2;}
    // compromisso: trocar antes do mínimo exige folga grande (zona em urgência e perigo colado furam sozinhos)
    const preso=tick<this.commitUntil&&b1!==this.mode&&b1!=="zone"&&!(b1==="flee"&&td<c.big+240);
    if(!preso&&(b1!==this.mode||t1!==this.target)){
      this.mode=b1;this.target=t1;this.tpid=(b1==="hunt"&&t1===prey)?preyPiece:-1;
      this.juke=rng.chance(.5)?1:-1;   // o lado do desvio é escolhido ao entrar na fuga, não a cada tick
      this.commitUntil=tick+(BOT.COMMIT[b1]||40);
      this.reactAt=tick+sk.react;}   // intenção nova não chega na mão no mesmo quadro
    if(this.mode==="wander"&&Math.hypot(this.wx-c.x,this.wy-c.y)<BOT.WAYPOINT_DONE)this._wander(c);
    if(this.mode==="flee"&&this.target===threat)this._safeDir(c,thx,thy);
    else if(this.mode==="flee"){const o=w.players.get(this.target),oc=o&&o.alive?centroid(o,TMP):null;
      if(oc)this._safeDir(c,oc.x,oc.y);}
    this._plan(ps,c,tick);}

  /** Intenções de tiro/salto/troca de arma, decididas junto com o modo (não sorteadas todo tick). */
  _plan(ps,c,tick){
    const w=this.w,sk=this.s,p=this.p,rng=this.rng,tudo=ammoOf(ps)>0&&tick>=ps.fireCdUntil;
    this.wantSplit=false;
    // ⚠️ UMA passada, TRÊS respostas — as duas decisões que dependem de escudo têm regras DIFERENTES, e ler
    // um booleano só para as duas estava errado nas duas pontas: `applyFire` cobra um nível da PRIMEIRA peça
    // viva, enquanto `applySplit` quebra o escudo INTEIRO de CADA peça com r ≥ SPLIT.MIN_R (a peça pequena
    // demais para dividir mantém o dela). `nSplit` é quantas peças de fato nascem.
    let shieldFire=false,lvSplit=0,nSplit=0,primeira=true,sx=c.x,sy=c.y;
    for(let i=0;i<ps.pieces.length;i++){const q=ps.pieces[i];if(q.dead)continue;
      if(primeira){shieldFire=q.shieldLv>0;sx=q.x;sy=q.y;primeira=false;}
      if(q.r>=SPLIT.MIN_R){nSplit++;if(q.shieldLv>lvSplit)lvSplit=q.shieldLv;}}
    // ── salto: o predicado REAL de comer DEPOIS do salto, e o PREÇO do que ele custa ──
    if(this.mode==="hunt"){const oc=this._alvo(this._t);   // ⚠️ _t, não TMP: _thirdParty escreve em TMP por dentro
      // o salto é o ÚNICO fechador em campo aberto (a presa é sempre mais rápida), então ele não pode exigir
      // que ela já esteja encurralada — o arco fechado entra na CHANCE, não como veto.
      // O escudo deixou de ser VETO e virou PREÇO (ver A ECONOMIA DO SALTO em constants.js): ele barrava 73 %
      // do tempo de caça por uma blindagem que vale ~4,4 % da massa contra um salto que rende até 32 %.
      // `nSplit>0` é o piso SPLIT.MIN_R, que NINGUÉM checava: a flag saía, queimava splitCdUntil e não nascia
      // peça nenhuma. E `c.n+nSplit` é o guarda certo — applySplit DOBRA as peças elegíveis, então o
      // `c.n<MAX_PIECES` de antes deixava 7 peças virarem 14.
      const ganho=oc?(oc.big*oc.big)/(c.big*c.big):0;
      const preco=(lvSplit>0?BOT.HUNT.SPLIT_GAIN_SHIELD:BOT.HUNT.SPLIT_GAIN)*(1+BOT.HUNT.SPLIT_GAIN_N*(c.n-1));
      if(oc&&nSplit>0&&c.n+nSplit<=BOT.MAX_PIECES&&ganho>=preco&&c.big>=oc.big*SPLIT_R*BOT.HUNT.SPLIT_MARGIN
        &&Math.hypot(oc.x-c.x,oc.y-c.y)<c.big+oc.big+SPLIT.DIST*1.4
        &&!this._thirdParty(oc.x,oc.y,c.big)
        &&rng.chance(sk.split*(BOT.HUNT.SPLIT_OPEN+(1-BOT.HUNT.SPLIT_OPEN)*(1-this.open))))this.wantSplit=true;}
    // ⚠️ o veto do TIRO continua inteiro: é ele que segura o gasto de escudo no gatilho, que é 92× o do salto.
    if(!tudo||tick<this.fireAt||(shieldFire&&this.mode!=="flee")){this.wantWeapon=-1;this.wantFire=false;return;}
    // ── arma da situação (só quem tem mão para isso troca) ──
    if(rng.chance(sk.weapon)){const q=this._bestWeapon(ps,c);
      if(q!==ps.weapon&&ps.ammo[q]>0){this.wantWeapon=q;this.swapTries=WEAPONS.length;this.swapAt=tick;}
      else this.wantWeapon=-1;}
    // ── alvo do tiro ──
    let tx=0,ty=0,mira=false,vale=false;
    if(this.mode==="hunt"){const oc=this._alvo(this._t);
      if(oc&&Math.hypot(oc.x-c.x,oc.y-c.y)<MISSILE.AIM_RANGE){
        const lead=this._lead(c,oc,sk);tx=lead.x;ty=lead.y;mira=rng.chance(BOT.AIM_CHANCE*(.5+.5*sk.lead));vale=true;}}
    else if(this.mode==="flee"&&this.press>0){
      // atira sem mira: o alvo está atrás. ⚠️ Mas a fuga era o único modo ISENTO da guarda de escudo, e
      // `applyFire` cobra um nível por puxão quando o tiro NÃO é interceptação — então o bot blindado
      // queimava a blindagem num tiro cego. Agora, com escudo, só puxa o gatilho quando ele sai DE GRAÇA:
      // o predicado é o MESMO de applyFire (sem mira + arma teleguiada + entrante ainda descoberto), medido
      // da primeira peça viva, que é a que paga. Sem escudo nada muda.
      if(!shieldFire||incomingMissile(w,this.slot,sx,sy,MISSILE.INTERCEPT_DIST,true)){tx=c.x;ty=c.y;mira=false;vale=true;}}
    // descarte com a munição cheia — mas só com alguém no alcance: atirar para o vazio é o tiro que só
    // queima escudo e faz barulho (BOT.MISSILE_MIN_D, não AIM_RANGE, que é largo demais para cortar algo).
    else if(this.mode==="food"&&ammoOf(ps)>=weaponOf(ps.weapon).ammo&&this.ed<BOT.MISSILE_MIN_D&&rng.chance(p.fire*.35)){tx=c.x;ty=c.y;vale=true;}
    if(!vale||!rng.chance(.38*p.fire*(.4+sk.weapon))){this.wantFire=false;return;}
    this.wantFire=true;this.wantAim=mira;
    if(mira){this.fkx=tx;this.fky=ty;this.flickUntil=tick+rng.int(BOT.HAND.FLICK[0],BOT.HAND.FLICK[1]);this.fireReadyAt=this.flickUntil-1;}
    else{this.flickUntil=0;this.fireReadyAt=tick;}}

  /** Arma certa para o momento: Nova cercado, Rajada colado, Cacho longe, senão o míssil. */
  _bestWeapon(ps,c){
    const a=ps.ammo;
    if(a[WEAPON.NOVA]>0&&this.press>=1.3)return WEAPON.NOVA;
    const oc=this.mode==="hunt"?this._alvo(this._t):null;
    const d=oc?Math.hypot(oc.x-c.x,oc.y-c.y):Infinity;
    if(a[WEAPON.BURST]>0&&d<700)return WEAPON.BURST;
    if(a[WEAPON.CLUSTER]>0&&d>900&&d<MISSILE.AIM_RANGE)return WEAPON.CLUSTER;
    return WEAPON.MISSILE;}

  /** Onde a presa VAI estar (a antecipação que um bom jogador faz; skill.lead diz quanto ele acerta). */
  _lead(c,oc,sk){
    const dx=oc.bx-c.x,dy=oc.by-c.y,d=Math.hypot(dx,dy);
    const t=Math.min(BOT.HAND.LEAD_MAX,d/Math.max(1,vmaxFor(c.big)))*sk.lead;
    const o=this._ld;o.x=oc.bx+oc.vx*t;o.y=oc.by+oc.vy*t;return o;}

  /**
   * Ponto de aproximação da caça. Correr atrás em linha reta NUNCA alcança (a presa é sempre mais rápida),
   * então o bot mira o lado que FECHA o arco de fuga dela: fica do lado oposto à parede/gás mais próximos,
   * empurrando a presa contra eles. Com o arco já fechado (open baixo), vai direto e antecipa.
   */
  _approach(c,oc){
    const o=this._ap,lead=this._lead(c,oc,this.s);
    const dd=Math.hypot(oc.x-c.x,oc.y-c.y);
    if(this.open<BOT.HUNT.OPEN*.6||dd<c.big+oc.big+SPLIT.DIST*.9){o.x=lead.x;o.y=lead.y;return o;}
    const w=this.w;
    // para onde a presa está encurralada: parede mais próxima, e a borda da zona se ela estiver mais perto
    let px=0,py=0;
    const e=[oc.x,w.w-oc.x,oc.y,w.h-oc.y];let mi=0;for(let i=1;i<4;i++)if(e[i]<e[mi])mi=i;
    px=mi===0?-1:mi===1?1:0;py=mi===2?-1:mi===3?1:0;
    const zc=this._zoneNow();
    if(zc){const dx=oc.x-zc.x,dy=oc.y-zc.y,d=Math.hypot(dx,dy);
      if(zc.r-d<e[mi]&&d>1){px=dx/d;py=dy/d;}}
    // pinça de equipe, sem estado compartilhado: se o companheiro já está de um lado, eu tomo o outro
    if(this.mate>=0){const al=this.w.players.get(this.mate),ac=al&&al.alive?centroid(al,TMP):null;
      if(ac){const ax=ac.x-oc.x,ay=ac.y-oc.y,ad=Math.hypot(ax,ay);
        if(ad<BOT.HUNT_DIST&&ad>1){px=-ax/ad*BOT.HUNT.TEAM_SIDE+px*(1-BOT.HUNT.TEAM_SIDE);py=-ay/ad*BOT.HUNT.TEAM_SIDE+py*(1-BOT.HUNT.TEAM_SIDE);}}}
    // o posto ideal é do lado oposto ao encurralamento; misturo com a linha reta para não dar a volta inteira
    const off=(c.big+oc.big)*1.6+160,k=BOT.HUNT.FLANK;
    const ix=oc.x-px*off,iy=oc.y-py*off;
    o.x=lead.x+(ix-lead.x)*k;o.y=lead.y+(iy-lead.y)*k;return o;}

  /** Fração das direções em que a presa ainda tem para onde correr (1 = campo aberto, 0 = encurralada). */
  _openness(px,py){
    const w=this.w,n=BOT.HUNT.ARC_DIRS,step=BOT.HUNT.ARC_STEP,m=BOT.WALL_MARGIN*.6,zc=this._zoneNow();
    let livre=0;
    for(let i=0;i<n;i++){const a=i/n*TAU,x=px+Math.cos(a)*step,y=py+Math.sin(a)*step;
      if(x<m||y<m||x>w.w-m||y>w.h-m)continue;
      if(zc){const dx=x-zc.x,dy=y-zc.y;if(dx*dx+dy*dy>zc.r*zc.r)continue;}
      // ⚠️ Para quem cabe dentro dela (STAR.PASS_R) a estrela não fecha o arco: ela é ABRIGO, não parede.
      let ok=true;const st=temeEstrela(this._c.big)?w.stars:VAZIO;
      for(let j=0;j<st.length;j++){const s=st[j];if(s.dead||s.k<STAR.ARM_K)continue;
        const dx=x-s.x,dy=y-s.y,ri=s.r*STAR.HALO*BOT.STAR_FEAR;if(dx*dx+dy*dy<ri*ri){ok=false;break;}}
      if(ok)livre++;}
    return livre/n;}

  /**
   * UMA passada pelas peças de um inimigo, com as duas respostas que o centróide não dá:
   *  · o GUARDA — a peça mais próxima que me ENGOLE. É dela que se foge: o centróide de um jogador espalhado
   *    é espaço VAZIO, e a fuga mirava esse vazio (medido: 15 % dos encontros têm a maior peça a mais de um
   *    raio do centróide).
   *  · o BOCADO — a MAIOR peça que eu engulo depois do salto. Um gigante partido em pedaços é a presa mais
   *    gorda do jogo, e comparar `big` com `big` fazia dele só uma ameaça: os pedaços eram invisíveis.
   * `gd` volta Infinity quando ninguém ali me come, e `bid` −1 quando não há bocado.
   * @param {PlayerState} o
   */
  _pecas(o,c){
    const q=this._pc;q.gd=Infinity;q.gx=0;q.gy=0;q.br=0;q.bid=-1;q.bx=0;q.by=0;
    const comeMe=c.big*EAT.RATIO,comivel=c.big/(SPLIT_R*BOT.HUNT.SPLIT_MARGIN),arr=o.pieces;
    let bd2=Infinity;
    for(let i=0;i<arr.length;i++){const p=arr[i];if(p.dead)continue;
      const dx=p.x-c.x,dy=p.y-c.y,d2=dx*dx+dy*dy;
      if(p.r>=comeMe){const d=Math.sqrt(d2);if(d<q.gd){q.gd=d;q.gx=p.x;q.gy=p.y;}}
      // maior primeiro (vale mais massa) e, entre iguais, a mais PERTO — um gigante se parte em pedaços do
      // mesmo tamanho, e sem o desempate ele iria atrás do primeiro do array, que pode ser o do outro lado.
      else if(p.r<=comivel&&(p.r>q.br||(p.r===q.br&&d2<bd2))){q.br=p.r;q.bid=p.id;q.bx=p.x;q.by=p.y;bd2=d2;}}
    return q;}
  /**
   * A vista do alvo da CAÇA: a PEÇA, quando o bot escolheu morder um pedaço (`tpid`), ou o jogador inteiro.
   * Devolve a mesma forma do `centroid`, então _approach, _lead, _bestWeapon e o predicado do salto não
   * precisam saber a diferença. `this.target` continua sendo o SLOT — é o que Room._estado/_humor leem.
   */
  _alvo(buf){
    const w=this.w,o=w.players.get(this.target);
    if(!o||!o.alive){this.tpid=-1;return null;}
    if(this.tpid>=0){const pc=w.entityById.get(this.tpid);
      if(pc&&!pc.dead&&pc.owner===this.target){
        buf.x=buf.bx=pc.x;buf.y=buf.by=pc.y;buf.big=pc.r;buf.n=1;buf.vx=pc.svx+pc.vx;buf.vy=pc.svy+pc.vy;return buf;}
      this.tpid=-1;}   // o pedaço foi comido ou se fundiu: volta a caçar o dono
    return centroid(o,buf);}
  /** Terceiro maior que eu no raio da queda do salto: dividir na frente dele é entregar as duas metades. */
  _thirdParty(x,y,big){
    const w=this.w,R=BOT.HUNT.THIRD_R;
    for(const o of w.players.values()){if(!o.alive||o.slot===this.slot||sameTeam(w,o.slot,this.slot))continue;
      const oc=centroid(o,TMP);if(!oc)continue;
      if(oc.big>=big/Math.SQRT2*EAT.RATIO){const dx=oc.x-x,dy=oc.y-y;if(dx*dx+dy*dy<R*R)return true;}}
    return false;}

  // ── ZONA ───────────────────────────────────────────────────────────────────
  /** Cópia do círculo atual (`zoneNow` devolve um singleton mutável, não dá para guardar a referência). */
  _zoneNow(){const z=this.w.zoneNow();if(!z)return null;ZC.x=z.x;ZC.y=z.y;ZC.r=z.r;return ZC;}
  /**
   * Escreve o ponto seguro em zx/zy e devolve a URGÊNCIA: fração do tempo que resta já comprometida com a
   * viagem. Fechando, o destino `(x1,y1,r1)` é conhecido; parado, o centro seguinte ainda não foi sorteado
   * nem pelo servidor, mas a deriva é limitada — encostar no miolo atual é a aposta certa.
   */
  _zonePlan(c,tick){
    const w=this.w,z=w.zone;if(!z)return 0;
    const zc=this._zoneNow();if(!zc)return 0;
    const fechando=z.r1<z.r0-.5;
    const cx=fechando?z.x1:zc.x,cy=fechando?z.y1:zc.y,cr=fechando?z.r1:Math.max(ZONE.MIN_R,zc.r*BOT.GAS.RING);
    const prazo=Math.max(1,(fechando?z.t1:z.t1+(ZONE.SHRINK_TICKS[z.stage|0]||ZONE.SHRINK_TICKS[0]))-tick);
    let k=this.edge?BOT.GAS.EDGE:BOT.GAS.RING;
    if(this.alive&&this.alive<=BOT.GAS.LATE_ALIVE)k/=BOT.GAS.LATE_PULL;   // fim de partida: mais perto do miolo
    // ⚠️ desconta o PRÓPRIO raio: a queimadura mede a fatia do disco que está no gás, não o centro. Sem
    // isso o bot mira o centro dele em EDGE·R e passa a partida inteira com a borda queimando — e num
    // planetão grande a "margem" some por completo.
    const alvo=Math.max(0,cr*k-c.big),dx=c.x-cx,dy=c.y-cy,d=Math.hypot(dx,dy);
    if(d>alvo&&d>1){const q=alvo/d;this.zx=cx+dx*q;this.zy=cy+dy*q;}else{this.zx=c.x;this.zy=c.y;}
    const falta=Math.max(0,d-alvo),viagem=falta/Math.max(1,vmaxFor(c.big))*TICK_HZ;
    return viagem/prazo;}

  // ── PERCEPÇÃO ──────────────────────────────────────────────────────────────
  /** Guarda os BOT.DANG_N perigos mais próximos: é a lista curta que a fuga consulta (8 direções × 6). */
  _danger(x,y,ri,d){
    const a=this.dang;
    if(this.dn<a.length){const s=a[this.dn++];s.x=x;s.y=y;s.w=ri;s.d=d;return;}
    let pior=0;for(let i=1;i<a.length;i++)if(a[i].d>a[pior].d)pior=i;
    if(a[pior].d>d){const s=a[pior];s.x=x;s.y=y;s.w=ri;s.d=d;}}
  /** Estrelas armadas, asteroides que EU estouraria e buracos que me esmagam entram na lista de perigos. */
  _mapDangers(c){
    const w=this.w,st=w.stars,as=w.asteroids,ho=w.holes;
    if(temeEstrela(c.big))for(let i=0;i<st.length;i++){const s=st[i];if(s.dead||s.k<STAR.ARM_K)continue;
      const ri=s.r*STAR.HALO*BOT.STAR_FEAR,d=Math.hypot(c.x-s.x,c.y-s.y);if(d<ri*1.6)this._danger(s.x,s.y,ri,d);}
    for(let i=0;i<as.length;i++){const a=as[i];if(a.dead||c.big<=a.r*ASTEROID.POP_RATIO)continue;
      const ri=a.r*BOT.AST_FEAR*BOT.HOLE_AVOID,d=Math.hypot(c.x-a.x,c.y-a.y);if(d<ri*1.6)this._danger(a.x,a.y,ri,d);}
    for(let i=0;i<ho.length;i++){const h=ho[i];if(h.dead||h.k<=0||c.big>=h.r*h.k*BLACKHOLE.CRUSH_K)continue;
      const ri=h.r*BLACKHOLE.INFLUENCE*h.k*BOT.HOLE_AVOID,d=Math.hypot(c.x-h.x,c.y-h.y);if(d<ri*1.6)this._danger(h.x,h.y,ri,d);}}
  /** Perigo colado (o mais próximo dentro do raio de medo): é o override de última palavra do `act`. */
  _nearestHazard(c){
    const w=this.w;let best=null,bd=Infinity;
    const take=(b,ri)=>{const dx=c.x-b.x,dy=c.y-b.y,d2=dx*dx+dy*dy;if(d2<ri*ri&&d2<bd){bd=d2;best=b;}};
    const holes=w.holes;   // buraco só assusta quem ele consegue esmagar: acima de rc·CRUSH_K a peça passa por cima
    for(let i=0;i<holes.length;i++){const h=holes[i];if(!h.dead&&h.k>0&&c.big<h.r*h.k*BLACKHOLE.CRUSH_K)take(h,h.r*BLACKHOLE.INFLUENCE*h.k*BOT.HOLE_AVOID);}
    // estrela só assusta quem ela consegue queimar: abaixo de STAR.PASS_R a peça atravessa e se esconde
    const stars=temeEstrela(c.big)?w.stars:VAZIO;
    for(let i=0;i<stars.length;i++){const st=stars[i];if(!st.dead&&st.k>=STAR.ARM_K)take(st,st.r*STAR.HALO*BOT.STAR_FEAR);}
    const asts=w.asteroids;   // só assusta quem pode estourá-lo: o pop parte o planeta em vários pedaços
    for(let i=0;i<asts.length;i++){const a=asts[i];if(!a.dead&&c.big>a.r*ASTEROID.POP_RATIO)take(a,a.r*BOT.AST_FEAR*BOT.HOLE_AVOID);}
    return best;}
  /**
   * Melhor coisa comível do alcance por valor/distância: a comida vem da grade e os FRAGMENTOS entram na
   * mesma conta valendo √mass — um pedaço de planetão largado na frente do bot vale mais que qualquer grão.
   * Fora da zona só vale a pena para quem é grande, e por pouco tempo (a incursão tem prazo).
   */
  _bestFood(ps,c,tick){
    const w=this.w;w.ensureFoodGrid();   // a grade guarda ÍNDICES: depois do _compact() ela precisa ser refeita
    const range=BOT.FOOD_DIST*this.p.food,r2=range*range,q=this._q,n=w.foodGrid.query(c.x,c.y,range,q);
    const zc=this._zoneNow(),grande=c.big>=BOT.GAS.LOOT_MIN_R;
    let best=null,bs=0,fora=false;
    const gas=(x,y)=>{if(!zc)return 1;const dx=x-zc.x,dy=y-zc.y;return dx*dx+dy*dy<=zc.r*zc.r?1:(grande?BOT.GAS.LOOT_R:0);};
    for(let i=0;i<n;i++){const f=w.food[q[i]];if(!f||f.dead)continue;
      const dx=f.x-c.x,dy=f.y-c.y,d2=dx*dx+dy*dy;if(d2>r2)continue;
      const g=gas(f.x,f.y);if(g<=0)continue;
      const s=foodValue(f,ps)/(Math.sqrt(d2)+120)*g;if(s>bs){bs=s;best=f;fora=g<1;}}
    const ej=w.ejected;
    for(let i=0;i<ej.length;i++){const e=ej[i];if(e.dead||(e.owner===this.slot&&w.tick<e.cdUntil))continue;
      const dx=e.x-c.x,dy=e.y-c.y,d2=dx*dx+dy*dy;if(d2>r2)continue;
      const g=gas(e.x,e.y);if(g<=0)continue;
      const s=Math.sqrt(e.mass)/(Math.sqrt(d2)+120)*g;if(s>bs){bs=s;best=e;fora=g<1;}}
    if(!best)return null;
    if(fora)this.lootUntil=tick+BOT.GAS.LOOT_TICKS;   // a incursão ao espólio tem prazo: o gás não perdoa
    return{b:best,s:bs};}

  /**
   * Direção de fuga: entre BOT.DIRS candidatos em volta, o que mais se afasta de (ax,ay) sem entrar em perigo,
   * sem colar na parede e sem sair da zona. A lista `dang` (montada no _think) traz TODOS os perigos perto —
   * inclusive os OUTROS jogadores grandes, senão o bot foge de um predador direto para a boca do outro.
   * `off` gira o leque inteiro: é o desvio de quem está no alcance do salto do caçador.
   */
  _safeDir(c,ax,ay,off=0){
    const w=this.w,step=BOT.FLEE_STEP,m=BOT.WALL_MARGIN,base=Math.atan2(c.y-ay,c.x-ax)+off,zc=this._zoneNow();
    let bx=clamp(c.x+Math.cos(base)*step,m,w.w-m),by=clamp(c.y+Math.sin(base)*step,m,w.h-m),bs=-Infinity;
    for(let i=0;i<BOT.DIRS;i++){const an=base+(i-(BOT.DIRS>>1))*(TAU/(BOT.DIRS*2));   // leque de ±90° em volta do "para longe dele"
      const x=c.x+Math.cos(an)*step,y=c.y+Math.sin(an)*step;
      let s=Math.hypot(x-ax,y-ay)*.6;                                                  // quanto mais longe da ameaça, melhor
      s-=Math.max(0,m-Math.min(x,y,w.w-x,w.h-y))*3;                                    // encostar na parede é armadilha
      for(let j=0;j<this.dn;j++){const g=this.dang[j],dx=x-g.x,dy=y-g.y,d=Math.hypot(dx,dy);
        if(d<g.w)s-=(g.w-d)*4;}
      if(zc){const d=Math.hypot(x-zc.x,y-zc.y);if(d>zc.r*.92)s-=(d-zc.r*.92)*6;}       // fugir para fora é trocar o predador pela morte certa
      if(s>bs){bs=s;bx=clamp(x,m,w.w-m);by=clamp(y,m,w.h-m);}}
    this.fx=bx;this.fy=by;return this.fx;}

  _wander(c){const rng=this.rng,w=this.w,m=BOT.WALL_MARGIN;
    this.wx=clamp(c.x+rng.range(-1,1)*w.w*.35,m,w.w-m);this.wy=clamp(c.y+rng.range(-1,1)*w.h*.35,m,w.h-m);}
}

/** Cria o cérebro de um bot. @param {World} world */
export const createBotBrain=(world,slot,rng,emit)=>new BotBrain(world,slot,rng,emit);
