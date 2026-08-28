// ── BOT: cérebro único do servidor e do LocalServer (?local=1) ────────────────
// Produz input como um humano — {tx,ty,flags} — e nunca toca no mundo direto: quem aplica é o `emit` de quem criou
// (no servidor, sim.applyInput; no LocalServer, o World). Determinístico: toda aleatoriedade sai do rng recebido.
// Modos: flee (alguém maior perto) > intercept (míssil vindo) > hunt (presa) > food (comida/powerup) > wander;
// perigo colado (estrela, buraco, asteroide que ele estouraria) é override em cima de qualquer modo.
// A cada personalidade (BOT.PERSONAS) muda o quanto ele caça, foge, coleta e atira — a lógica é a mesma.
// @ts-check
import {BOT,BLACKHOLE,STAR,ASTEROID,MISSILE,FOOD_TYPE,ZONE,WEAPONS,weaponOf} from "./constants.js";
import {INPUT_FLAG} from "./protocol/constants.js";
import {clamp} from "./util.js";
import {incomingMissile,sameTeam,outOfZone} from "./physics/rules.js";

const HUMAN_BONUS=1.5;   // entre duas presas iguais, a humana vale mais (bot que caça bot é chato de ver)
const TAU=6.28318;

/** @typedef {import("./physics/world.js").World} World */
/** @typedef {import("./physics/world.js").PlayerState} PlayerState */
/** @typedef {import("./physics/body.js").Body} Body */

/** Centro, maior raio e nº de peças vivas de um PlayerState (null se nenhuma). @param {PlayerState} ps */
function centroid(ps){let sx=0,sy=0,big=0,n=0;const arr=ps.pieces;
  for(let i=0;i<arr.length;i++){const p=arr[i];if(p.dead)continue;sx+=p.x;sy+=p.y;if(p.r>big)big=p.r;n++;}
  return n?{x:sx/n,y:sy/n,big,n}:null;}
/** Quanto uma comida vale para este bot agora (0 = ignora); powerup só vale se ele puder usar. @param {Body} f */
function foodValue(f,ps,c){
  switch(f.type){
    case FOOD_TYPE.AMMO:return ps.missiles<weaponOf(ps.weapon).ammo?36:4;
    case FOOD_TYPE.SHIELD:return 40;
    case FOOD_TYPE.MAGNET:return 26;
    default:
      // arma no chão vale pela raridade (a épica vale um desvio; a comum, quase nada se já tenho outra):
      // o peso do sorteio é o inverso da raridade, então 700/weight ordena Nova > Cacho > Mina > Rajada.
      if(f.type>=FOOD_TYPE.W_BURST){const wp=WEAPONS.find(x=>x.food===f.type);
        return wp?(f.type===weaponOf(ps.weapon).food?12:700/wp.weight):f.r;}
      return f.r;}}

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
    this.mode="wander";this.target=-1;this.wx=0;this.wy=0;this.nextThink=0;this._q=[];}
  reset(){this.mode="wander";this.target=-1;this.nextThink=0;}

  act(tick){
    const w=this.w,ps=w.players.get(this.slot);if(!ps||!ps.alive)return;const c=centroid(ps);if(!c)return;const rng=this.rng,p=this.p;
    const armed=ps.missiles>0&&tick>=ps.fireCdUntil;   // na carência de spawn o applyFire recusa: nem gasta o input
    if(tick>=this.nextThink){this._think(ps,c,tick);this.nextThink=tick+rng.int(BOT.THINK_TICKS[0],BOT.THINK_TICKS[1]);}
    let tx=this.wx,ty=this.wy,flags=0,shield=false;
    for(let i=0;i<ps.pieces.length;i++){const q=ps.pieces[i];if(!q.dead){shield=q.shieldLv>0;break;}}   // escudo é por peça: vale o da que atira (1ª viva)
    const fireP=BOT.FIRE_P*p.fire;
    if(this.mode==="hunt"||this.mode==="flee"){
      const o=w.players.get(this.target),oc=o&&o.alive?centroid(o):null;
      if(!oc)this._wander(c);
      else if(this.mode==="hunt"){this.wx=oc.x;this.wy=oc.y;
        const d=Math.hypot(oc.x-c.x,oc.y-c.y);
        // divide só se o salto ALCANÇA (o arremesso é curto) e sobra folga de tamanho para engolir os pedaços
        if(!shield&&d<c.big+oc.big+BOT.SPLIT_REACH&&c.big>oc.big*BOT.HUNT_RATIO*1.15&&c.n<BOT.MAX_PIECES&&rng.chance(BOT.SPLIT_P))flags|=INPUT_FLAG.SPLIT;
        if(!shield&&armed&&d<MISSILE.AIM_RANGE&&rng.chance(fireP))flags|=INPUT_FLAG.FIRE|(rng.chance(BOT.AIM_CHANCE)?INPUT_FLAG.AIM:0);}
      else{this._safeDir(c,oc.x,oc.y);
        if(!shield&&armed&&rng.chance(fireP))flags|=INPUT_FLAG.FIRE;}}   // fugindo atira sem mira: o alvo está atrás
    else if(this.mode==="intercept"){const m=w.entityById.get(this.target);
      if(!m||m.dead)this._wander(c);
      else{this._safeDir(c,m.x,m.y);if(armed)flags|=INPUT_FLAG.FIRE;}}   // sem AIM: o applyFire escolhe a interceptação
    else if(this.mode==="food"){const f=w.entityById.get(this.target);
      if(f&&!f.dead){this.wx=f.x;this.wy=f.y;
        // no caminho da comida, se der um tiro de graça em quem está no cone, dá
        if(!shield&&armed&&ps.missiles>=MISSILE.MAX_AMMO&&rng.chance(fireP*.5))flags|=INPUT_FLAG.FIRE|INPUT_FLAG.AIM;}
      else this._wander(c);}
    else if(Math.hypot(this.wx-c.x,this.wy-c.y)<BOT.WAYPOINT_DONE)this._wander(c);
    tx=this.wx;ty=this.wy;
    // ESTAR FORA DA ZONA tem prioridade sobre tudo: é o único perigo que mata sozinho, sem depender de ninguém.
    // O alvo é o CENTRO do círculo (correr para o miolo é sempre a saída mais curta), e nada de dividir no caminho.
    const zc=w.zoneNow();
    if(zc&&outOfZone(c,zc)){tx=zc.x;ty=zc.y;this.wx=tx;this.wy=ty;flags&=~INPUT_FLAG.SPLIT;this.emit(this.slot,{tx,ty,flags});return;}
    // perigo colado tem a última palavra: sai de perto e não divide de jeito nenhum
    const hz=this._nearestHazard(c);
    if(hz){this._safeDir(c,hz.x,hz.y);tx=this.wx;ty=this.wy;flags&=~INPUT_FLAG.SPLIT;}
    this.emit(this.slot,{tx,ty,flags});}

  // ── decisão (a cada THINK_TICKS) ──
  _think(ps,c,tick){
    const w=this.w,p=this.p,fleeRatio=BOT.FLEE_RATIO/p.flee,huntRatio=BOT.HUNT_RATIO/p.hunt;
    let flee=-1,fd=Infinity,hunt=-1,hv=-Infinity;
    for(const o of w.players.values()){if(o===ps||!o.alive||sameTeam(w,o.slot,this.slot))continue;const oc=centroid(o);if(!oc)continue;
      const d=Math.hypot(oc.x-c.x,oc.y-c.y);
      if(oc.big>=c.big*fleeRatio){if(d<BOT.FLEE_DIST&&d<fd){fd=d;flee=o.slot;}}
      else if(c.big>=oc.big*huntRatio&&d<BOT.HUNT_DIST){
        if(!o.isBot&&tick-o.spawnTick<BOT.SPAWN_GRACE_TICKS)continue;   // acabou de cair no mapa: deixa o humano respirar
        const v=oc.big*(o.isBot?1:HUMAN_BONUS)-d*.1;if(v>hv){hv=v;hunt=o.slot;}}}
    // míssil inimigo vindo para cima do bot: virar para ele e derrubar com outro míssil (mesmo predicado do alerta do humano)
    if(ps.missiles>0&&tick>=ps.fireCdUntil){const m=incomingMissile(w,this.slot,c.x,c.y,BOT.MISSILE_FEAR);
      if(m){this.mode="intercept";this.target=m.id;return;}}
    if(flee>=0){this.mode="flee";this.target=flee;return;}
    if(hunt>=0){this.mode="hunt";this.target=hunt;return;}
    const f=this._bestFood(ps,c);
    if(f){this.mode="food";this.target=f.id;return;}
    this._wander(c);}

  /**
   * Melhor coisa comível do alcance por valor/distância: a comida vem da grade (não varredura linear) e os
   * FRAGMENTOS entram na mesma conta valendo √mass — depois que a lasca, o míssil e o buraco negro passaram a
   * devolver a massa real, um pedaço de planetão largado na frente do bot vale mais que qualquer grão, e ignorá-lo
   * (era o que ele fazia: só olhava w.food) deixava a melhor comida do mapa parada no chão.
   */
  _bestFood(ps,c){
    const w=this.w,range=BOT.FOOD_DIST*this.p.food,r2=range*range,q=this._q,n=w.foodGrid.query(c.x,c.y,range,q);
    let best=null,bs=0;
    for(let i=0;i<n;i++){const f=w.food[q[i]];if(!f||f.dead)continue;
      const dx=f.x-c.x,dy=f.y-c.y,d2=dx*dx+dy*dy;if(d2>r2)continue;
      const s=foodValue(f,ps,c)/(Math.sqrt(d2)+120);if(s>bs){bs=s;best=f;}}
    const ej=w.ejected;
    for(let i=0;i<ej.length;i++){const e=ej[i];if(e.dead||(e.owner===this.slot&&w.tick<e.cdUntil))continue;
      const dx=e.x-c.x,dy=e.y-c.y,d2=dx*dx+dy*dy;if(d2>r2)continue;
      const s=Math.sqrt(e.mass)/(Math.sqrt(d2)+120);if(s>bs){bs=s;best=e;}}
    return best;}

  /** Perigo que está dentro da zona de fuga do bot (o mais próximo): buraco negro, estrela armada ou asteroide que ele estouraria. */
  _nearestHazard(c){
    const w=this.w;let best=null,bd=Infinity;
    const take=(b,ri)=>{const lim=ri*BOT.HOLE_AVOID,dx=c.x-b.x,dy=c.y-b.y,d2=dx*dx+dy*dy;
      if(d2<lim*lim&&d2<bd){bd=d2;best={x:b.x,y:b.y,ri};}};
    const holes=w.holes;   // buraco só assusta quem ele consegue esmagar: acima de rc·CRUSH_K a peça passa por cima
    for(let i=0;i<holes.length;i++){const h=holes[i];if(!h.dead&&h.k>0&&c.big<h.r*h.k*BLACKHOLE.CRUSH_K)take(h,h.r*BLACKHOLE.INFLUENCE*h.k);}
    const stars=w.stars;for(let i=0;i<stars.length;i++){const st=stars[i];if(!st.dead&&st.k>=STAR.ARM_K)take(st,st.r*STAR.HALO*BOT.STAR_FEAR/BOT.HOLE_AVOID);}
    const asts=w.asteroids;   // só assusta quem pode estourá-lo: o pop parte o planeta em vários pedaços
    for(let i=0;i<asts.length;i++){const a=asts[i];if(!a.dead&&c.big>a.r*ASTEROID.POP_RATIO)take(a,a.r*BOT.AST_FEAR);}
    return best;}

  /**
   * Direção de fuga: entre BOT.DIRS candidatos em volta, o que mais se afasta de (ax,ay) sem entrar num perigo
   * nem colar na parede. É o que impede o bot de fugir do caçador direto para dentro de uma estrela.
   * Grava o resultado em wx/wy (o alvo do input) e devolve.
   */
  _safeDir(c,ax,ay){
    const w=this.w,step=BOT.FLEE_STEP,m=BOT.WALL_MARGIN,base=Math.atan2(c.y-ay,c.x-ax);
    let bx=clamp(c.x+Math.cos(base)*step,m,w.w-m),by=clamp(c.y+Math.sin(base)*step,m,w.h-m),bs=-Infinity;
    for(let i=0;i<BOT.DIRS;i++){const an=base+(i-(BOT.DIRS>>1))*(TAU/(BOT.DIRS*2));   // leque de ±90° em volta do "para longe dele"
      const x=c.x+Math.cos(an)*step,y=c.y+Math.sin(an)*step;
      let s=Math.hypot(x-ax,y-ay)*.6;                                                  // quanto mais longe da ameaça, melhor
      s-=Math.max(0,m-Math.min(x,y,w.w-x,w.h-y))*3;                                    // encostar na parede é armadilha
      const holes=w.holes;for(let j=0;j<holes.length;j++){const h=holes[j];if(h.dead||h.k<=0)continue;
        const ri=h.r*BLACKHOLE.INFLUENCE*h.k,d=Math.hypot(x-h.x,y-h.y);if(d<ri*BOT.HOLE_AVOID)s-=(ri*BOT.HOLE_AVOID-d)*4;}
      const stars=w.stars;for(let j=0;j<stars.length;j++){const st=stars[j];if(st.dead||st.k<STAR.ARM_K)continue;   // encostar QUEIMA STAR.BURN: vale fugir de longe
        const ri=st.r*STAR.HALO,d=Math.hypot(x-st.x,y-st.y);if(d<ri*BOT.STAR_FEAR)s-=(ri*BOT.STAR_FEAR-d)*4;}
      const zc=w.zoneNow();if(zc){const d=Math.hypot(x-zc.x,y-zc.y);if(d>zc.r*.92)s-=(d-zc.r*.92)*6;}   // fugir para fora da zona é trocar o predador pela morte certa
      if(s>bs){bs=s;bx=clamp(x,m,w.w-m);by=clamp(y,m,w.h-m);}}
    this.wx=bx;this.wy=by;return{x:bx,y:by};}

  _wander(c){const rng=this.rng,w=this.w,m=BOT.WALL_MARGIN;
    this.mode="wander";this.target=-1;
    this.wx=clamp(c.x+rng.range(-1,1)*w.w*.35,m,w.w-m);this.wy=clamp(c.y+rng.range(-1,1)*w.h*.35,m,w.h-m);}
}

/** Cria o cérebro de um bot. @param {World} world */
export const createBotBrain=(world,slot,rng,emit)=>new BotBrain(world,slot,rng,emit);
