// ── MUNDO: simulação determinística a 60 Hz (servidor autoritativo; ?bench e testes) ──
// Ordem fixa do passo: inputs → integração (+ fases dos buracos e das estrelas) → grades → pares do mesmo dono →
// pares de donos diferentes → perigos (asteroides, buracos, estrelas) → comida/ejetados → mísseis → fusões →
// compactação ordenada → spawns → tick++. Remoção só por `dead` + compactação (ordem estável).
// @ts-check
import {WORLD,DT,PLAYER,SPEED,SPLIT,EJECT,FRAG,BOUNCE,WALL,FOOD,FOOD_TYPE,ASTEROID,BLACKHOLE,MISSILE,POWERUP,STAR,WEAPON,WEAPONS,BR,ZONE} from "../constants.js";
import {KIND,PIECE_FLAG,FOOD_FLAG,BH_PHASE,STAR_PHASE,FRAG_KIND} from "../protocol/constants.js";
import {createRng} from "../rng.js";
import {clamp} from "../util.js";
import {createBody,liveCount,decayPiece} from "./body.js";
import {createGrid,createPointGrid,GRID_CELL} from "./spatial-hash.js";
import {integratePiece,integrateFree} from "./integrate.js";
import {resolveBounce,separateOwn,tryMergeOwn} from "./collide.js";
import * as R from "./rules.js";

/** @typedef {import("./body.js").Body} Body */
/**
 * @typedef {object} PlayerState
 * @property {number} slot
 * @property {number} tx            alvo (px, mundo)
 * @property {number} ty
 * @property {boolean} alive
 * @property {boolean} isBot
 * @property {number} spawnTick    tick do último nascimento (graça de spawn dos bots)
 * @property {Body[]} pieces        refs (ordem de criação; compactada 1×/passo)
 * @property {number} team          equipe (-1 = sem equipe: todo mundo é inimigo). Fogo amigo e "quem come quem"
 *                                 saem daqui, não do bot — ver rules.sameTeam
 * @property {number} weapon        WEAPON.* na mão (troca com INPUT_FLAG.SWAP)
 * @property {number[]} ammo        munição POR ARMA (o jogador carrega várias); `self.missiles` no fio é o
 *                                  espelho de ammo[weapon]. Ímã e escudo continuam POR PEÇA, ver Body
 * @property {boolean} weaponPin    o jogador JÁ escolheu arma com o Q? Daí em diante pegar arma no chão só
 *                                  ABASTECE o cinto, nunca reequipa (ver rules.eatFood). Não vai ao fio:
 *                                  o `self` é de tamanho fixo e isto é estado de servidor, como aimLock*
 * @property {number} splitCdUntil
 * @property {number} ejectCdUntil
 * @property {number} fireCdUntil   carência de tiro do nascimento (MISSILE.SPAWN_CD_TICKS)
 * @property {number} autoDefN      cargas de AUTO-DEFESA (0..POWERUP.AUTODEF_MAX): cada uma puxa o gatilho por você UMA vez, e some
 * @property {number} autoFireAt    próximo tiro automático permitido (o míssil tem `cd` 0: sem isto, 60/s)
 * @property {number} zoomUntil     powerup de ZOOM (câmera afastada) — vale também para a AOI do snapshot
 * @property {number} feastUntil    powerup de comida em dobro (POWERUP.FEAST_K)
 * @property {boolean} ejectHold
 * @property {number} ejectHoldAt   próximo eject automático do hold
 * @property {number} ejectRamp     cusparadas seguidas (0..EJECT.RAMP_N): a força/alcance da pelota sobe com ela
 * @property {number} score
 * @property {boolean} splitReq
 * @property {boolean} ejectReq
 * @property {boolean} fireReq
 * @property {boolean} fireAim   tiro mirado (trava na bolinha mais próxima do ponteiro)
 * @property {number} aimLockId    alvo travado pelo último tiro mirado (id de entidade ou slot; -1 = nenhum)
 * @property {number} aimLockKind  0 = o id é um SLOT de jogador · 1 = é um id de entidade (míssil/rocha/estrela)
 * @property {number} aimLockUntil até quando a trava vale (MISSILE.AIM_HOLD_TICKS depois do tiro mirado)
 */

// códigos de par (kind de A << 3 | kind de B); A sempre do grupo inserido antes: peças, ejetados, asteroides, mísseis, buracos
const K=KIND,PP=K.PIECE<<3|K.PIECE,PE=K.PIECE<<3|K.EJECT,PA=K.PIECE<<3|K.ASTEROID,PM=K.PIECE<<3|K.MISSILE,PH=K.PIECE<<3|K.BLACKHOLE,
  PS=K.PIECE<<3|K.STAR,EA=K.EJECT<<3|K.ASTEROID,EH=K.EJECT<<3|K.BLACKHOLE,AA=K.ASTEROID<<3|K.ASTEROID,AH=K.ASTEROID<<3|K.BLACKHOLE,
  AM=K.ASTEROID<<3|K.MISSILE,MM=K.MISSILE<<3|K.MISSILE,MH=K.MISSILE<<3|K.BLACKHOLE,ES=K.EJECT<<3|K.STAR,MS=K.MISSILE<<3|K.STAR,AS=K.ASTEROID<<3|K.STAR;
// constantes locais de spawn (margens do mockup; não existem em constants.js)
const PLAYER_MARGIN=300,PLAYER_SAFE=1500,AST_MARGIN=200,BELT_MARGIN=ASTEROID.BELT_RADIUS[1]+200,BELT_RAD_JITTER=40,SPAWN_TRIES=40,STAR_MARGIN=400;
// Powerups: tabela CUMULATIVA de pesos dentro de FOOD.POWER_P (POWERUP.DROP), exatamente como a das armas.
// Eram dois tipos com peso igual; hoje são seis, e dois deles são RAROS — peso igual faria "raro" ser só
// uma palavra no comentário. ⚠️ Um sorteio ponderado tem que gastar UM `rng.next()`, como o rollWeapon:
// consumir dois deslocaria o stream do mulberry32 e mudaria todo mundo que nasce depois, em silêncio (o
// teste de determinismo compara código novo com código novo e não pegaria).
const POWER_TOTAL=POWERUP.DROP.reduce((a,x)=>a+x[1],0);
const rollPower=rng=>{let v=rng.next()*POWER_TOTAL;for(const x of POWERUP.DROP){v-=x[1];if(v<=0)return x[0];}return POWERUP.DROP[0][0];};
// Armas (só no Battle Royale, `o.weapons`): tabela CUMULATIVA de pesos — é onde mora a raridade. O míssil
// tem peso 0 e fica de fora: ele já cai como FOOD_TYPE.AMMO, a munição básica que existe nos dois modos.
const WEAPON_DROPS=WEAPONS.filter(x=>x.weight>0),WEAPON_TOTAL=WEAPON_DROPS.reduce((a,x)=>a+x.weight,0);
/** Cinto zerado com `n` de munição de míssil (a arma base, que o jogador nunca perde). */
const newAmmo=n=>{const a=new Array(WEAPONS.length).fill(0);a[WEAPON.MISSILE]=n|0;return a;};
const rollWeapon=rng=>{let v=rng.next()*WEAPON_TOTAL;for(const x of WEAPON_DROPS){v-=x.weight;if(v<=0)return x.food;}return WEAPON_DROPS[0].food;};
// FOOD_TYPE.MERGE saiu do sorteio: ele só zerava o `mergeAt` das peças, então com o planeta INTEIRO — a maior
// parte do tempo — o efeito era zero, e como caía no ramo de powerup ele nem dava massa nem pontos: a bola
// verde era literalmente pior que comer poeira. Sem HUD, sem som e sem evento, o jogador não tinha como saber.
// Eram ~37 delas vivas no mapa o tempo todo. O índice 5 fica declarado (já foi do powerup de velocidade
// removido) e volta ao sorteio com uma linha; `eatFood` mantém o ramo, dormente.
/** (x,y) está a ≥ min de todos os corpos vivos de arr? (arr null = sim) @param {Body[]|null} arr */
function farFrom(arr,min,x,y){if(!arr)return true;const m2=min*min;
  for(let i=0;i<arr.length;i++){const b=arr[i];if(!b||b.dead)continue;const dx=b.x-x,dy=b.y-y;if(dx*dx+dy*dy<m2)return false;}return true;}
/** (x,y) está dentro do círculo da zona? O mesmo critério de `outOfZone`, que é o que o jogador lê na tela. */
const inZone=(x,y,zc)=>{const dx=x-zc.x,dy=y-zc.y;return dx*dx+dy*dy<=zc.r*zc.r;};

export class World{
  /** @param {number} seed @param {number} w @param {number} h @param {{food:number,asteroids:boolean,holes:number,stars:number}} o */
  constructor(seed,w,h,o){
    this.seed=seed;this.rng=createRng(seed);this.w=w;this.h=h;this.tick=0;this.nextId=1;
    /** @type {Body[]} */this.pieces=[];/** @type {Body[]} */this.food=[];/** @type {Body[]} */this.ejected=[];
    /** @type {Body[]} */this.asteroids=[];/** @type {Body[]} */this.holes=[];/** @type {Body[]} */this.missiles=[];/** @type {Body[]} */this.stars=[];
    /** @type {Map<number,PlayerState>} */this.players=new Map();
    /** @type {any[]} */this.events=[];/** @type {Map<number,Body>} */this.entityById=new Map();
    /** @type {{cx:number,cy:number,rad:number,w:number}[]} */this.belts=[];/** @type {{belt:number,at:number}[]} */this.astQueue=[];
    /** @type {{at:number}[]} */this.starQueue=[];
    // Zona do modo Battle Royale (null = sem zona, que é o modo Livre inteiro). `peace` é o aquecimento:
    // enquanto true TODO MUNDO é aliado, então a espera não precisa de regra própria — reusa sameTeam.
    /** @type {{x0:number,y0:number,r0:number,x1:number,y1:number,r1:number,t0:number,t1:number}|null} */this.zone=null;
    this.peace=false;this._zc={x:0,y:0,r:0};this._foodScan=0;
    this.decay=o.decay!==false;this.weapons=!!o.weapons;this.foodCount=o.food;this.holeCount=o.holes;this.starCount=o.stars;this.astBase=o.asteroids?ASTEROID.BELTS*ASTEROID.PER_BELT+ASTEROID.WANDERERS:0;this.astCap=this.astBase+ASTEROID.MAX_EXTRA;
    this.grid=createGrid(w,h,GRID_CELL);
    // A comida tem grade PRÓPRIA e de outro tipo (ver createPointGrid): ela é a única população que
    // muda todo tick, e refazer 3900 índices por causa de um grão comido era o maior item do perfil.
    // O preço é o índice ter que ser estável — daí `foodFree` e o `_compact` não tocar em `this.food`.
    this.foodGrid=createPointGrid(w,h,GRID_CELL,FOOD.R_MAX);
    /** @type {number[]} slots de `food` vagos (a comida não compacta: morrer abre um buraco, nascer o reusa) */this.foodFree=[];
    this.foodAlive=0;
    /** @type {Body[]} */this.dyn=[];this._pairs=new Int32Array(4096*3);/** @type {number[]} */this._q=[];this._spot={x:0,y:0,ok:false};this._starScan=0;
    for(let i=0;i<o.food;i++)this.spawnFood();
    if(o.asteroids){const rng=this.rng;
      for(let b=0;b<ASTEROID.BELTS;b++){const rad=rng.range(ASTEROID.BELT_RADIUS[0],ASTEROID.BELT_RADIUS[1]),sp=rng.range(ASTEROID.BELT_SPEED[0],ASTEROID.BELT_SPEED[1]);
        this.belts.push({cx:rng.range(BELT_MARGIN,w-BELT_MARGIN),cy:rng.range(BELT_MARGIN,h-BELT_MARGIN),rad,w:sp/rad});
        for(let i=0;i<ASTEROID.PER_BELT;i++)this.spawnAsteroid(b,0,0,0,i/ASTEROID.PER_BELT*Math.PI*2);}
      for(let i=0;i<ASTEROID.WANDERERS;i++)this.spawnAsteroid(-1);}
    for(let i=0;i<o.holes;i++)this.spawnHole({active:i>0});
    for(let i=0;i<o.stars;i++)this.spawnStar(i>0);}

  // ── ids e corpos ──
  newId(){return(this.nextId++)>>>0;}
  /** @param {Body} b */_register(b){this.entityById.set(b.id,b);return b;}
  /** Cria uma peça do slot (mergeAt = agora). */
  newPiece(slot,x,y,r){const ps=this.players.get(slot);const b=createBody(KIND.PIECE,this.newId(),x,y,r);b.owner=slot;b.mergeAt=this.tick;
    this.pieces.push(b);if(ps)ps.pieces.push(b);return this._register(b);}
  /** Cria um fragmento/pellet (mass pode diferir de r² — é o que dá VALOR VARIÁVEL a cada um; `kind` = FRAG_KIND, vai no fio). */
  addEjected(x,y,vx,vy,r,mass,owner,immuneTicks,lifeTicks,kind=FRAG_KIND.PLAIN){
    if(this.ejected.length>=EJECT.MAX)this._dropOldestEject();   // teto de população: era a única lista sem limite, e segurar o W chegava a ~2.000 pelotas vivas
    const b=createBody(KIND.EJECT,this.newId(),x,y,r);b.mass=mass;b.vx=vx;b.vy=vy;b.owner=owner;b.type=kind;
    b.cdUntil=this.tick+immuneTicks;b.life=this.tick+lifeTicks;this.ejected.push(b);return this._register(b);}
  addMissile(x,y,vx,vy,owner,targetSlot){const b=createBody(KIND.MISSILE,this.newId(),x,y,MISSILE.R);b.vx=vx;b.vy=vy;b.owner=owner;b.targetId=targetSlot;
    b.life=this.tick+MISSILE.LIFE_TICKS;this.missiles.push(b);return this._register(b);}
  /**
   * Comida nova: tipo por sorteio (AMMO_P, POWER_P entre os três powerups), matiz quantizado 0..HUES-1, r especial
   * para munição/powerups. Sem posição, cai em lugar aleatório e, com NEAR_HAZARD_P, num anel em volta de uma estrela
   * ou buraco negro (risco × recompensa: aí nunca é poeira, vira cometa/rocha graúda).
   * Com `{x,y,spread}` nasce num CACHO em volta do ponto — é assim que o buraco negro cospe o que engoliu na saída e
   * que a supernova deixa um berçário onde a estrela estava.
   */
  spawnFood({x=NaN,y=NaN,spread=0}={}){const rng=this.rng,roll=rng.next();let type,r;
    if(roll<FOOD.AMMO_P){type=FOOD_TYPE.AMMO;r=FOOD.SPECIAL_R;}
    else if(this.weapons&&roll<FOOD.AMMO_P+BR.WEAPON_P){type=rollWeapon(rng);r=FOOD.SPECIAL_R;}
    // as faixas são CUMULATIVAS: com armas ligadas o ramo acima consome até AMMO_P+WEAPON_P (.105) e o teste
    // do powerup era `roll<AMMO_P+POWER_P` (.100) — inalcançável. Ímã e escudo simplesmente NÃO NASCIAM no
    // Battle Royale, que é justo o modo onde eles importam. No Livre (weapons=false) a conta é a de sempre.
    else if(roll<FOOD.AMMO_P+(this.weapons?BR.WEAPON_P:0)+FOOD.POWER_P){type=rollPower(rng);r=FOOD.SPECIAL_R;}
    else{type=rng.int(FOOD_TYPE.DUST,FOOD_TYPE.ROCK);r=rng.range(FOOD.R_MIN,FOOD.R_MAX);}
    const posta=!Number.isNaN(x);
    if(posta){const an=rng.angle(),d=spread>0?Math.sqrt(rng.next())*spread:0;   // √ para o cacho ficar uniforme no disco, não amontoado no centro
      x=clamp(x+Math.cos(an)*d,FOOD.MARGIN,this.w-FOOD.MARGIN);y=clamp(y+Math.sin(an)*d,FOOD.MARGIN,this.h-FOOD.MARGIN);}
    else{const zc=this.zoneNow();let anel=false;
      // Com zona ligada o sorteio é DENTRO do círculo (√ do disco = uniforme): repor no mapa inteiro
      // entregaria o grão ao gás, e é por isso que o círculo final virava um deserto. Sem zona (modo Livre)
      // é o mapa de sempre. O ponto ainda tem que passar em DUAS provas — longe de estrela e dentro do
      // círculo —, então isto é um sorteio com tentativas, no molde do `_farSpot`.
      for(let t=0;t<SPAWN_TRIES;t++){
        const spot=(!zc||t===0)&&rng.chance(FOOD.NEAR_HAZARD_P)?this._hazardSpot():null;
        anel=!!spot;
        if(spot){x=spot.x;y=spot.y;}
        else if(zc){const an=rng.angle(),d=Math.sqrt(rng.next())*zc.r;
          x=clamp(zc.x+Math.cos(an)*d,FOOD.MARGIN,this.w-FOOD.MARGIN);y=clamp(zc.y+Math.sin(an)*d,FOOD.MARGIN,this.h-FOOD.MARGIN);}
        else{x=rng.range(FOOD.MARGIN,this.w-FOOD.MARGIN);y=rng.range(FOOD.MARGIN,this.h-FOOD.MARGIN);}
        if(this._clearOfStars(x,y)&&(!zc||inZone(x,y,zc)))break;}
      // o prêmio do anel de perigo só vale se o ponto DELE foi o aceito: sorteado o tipo antes da prova, um
      // anel recusado deixava um cometa graúdo caído em lugar nenhum
      if(anel&&type<=FOOD_TYPE.ROCK){type=rng.chance(.5)?FOOD_TYPE.COMET:FOOD_TYPE.ROCK;r=rng.range((FOOD.R_MIN+FOOD.R_MAX)/2,FOOD.R_MAX);}}
    const f=createBody(KIND.FOOD,this.newId(),x,y,r);
    f.type=type;f.hue=rng.int(0,FOOD.HUES-1);f.seed=rng.next();
    // slot vago primeiro (LIFO, determinístico); só cresce o array quando não há buraco
    const fi=this.foodFree.length?this.foodFree.pop():this.food.length;
    f.fi=fi;this.food[fi]=f;this.foodAlive++;this.foodGrid.insert(fi,f.x,f.y);
    return this._register(f);}
  /**
   * A ÚNICA porta de saída de um grão. Marcar `dead` na mão deixa o índice na grade e o slot fora da
   * free list: o grão vira um fantasma que a consulta devolve para sempre e um buraco que ninguém reusa.
   * @param {Body} f
   */
  killFood(f){if(!f||f.dead)return;f.dead=true;this.foodAlive--;
    if(f.fi>=0){this.foodGrid.remove(f.fi);this.foodFree.push(f.fi);}}
  _hspot={x:0,y:0};/** @type {Body[]} */_haz=[];
  /** Ponto num anel NEAR_HAZARD_R em volta de uma estrela ou buraco negro vivo (null se o mundo não tem nenhum). */
  _hazardSpot(){const rng=this.rng,list=this._haz;list.length=0;
    for(let i=0;i<this.stars.length;i++){const b=this.stars[i];if(!b.dead)list.push(b);}
    for(let i=0;i<this.holes.length;i++){const b=this.holes[i];if(!b.dead)list.push(b);}
    if(!list.length)return null;
    const h=list[rng.int(0,list.length-1)],an=rng.angle(),d=rng.range(FOOD.NEAR_HAZARD_R[0],FOOD.NEAR_HAZARD_R[1]),m=FOOD.MARGIN,s=this._hspot;
    s.x=clamp(h.x+Math.cos(an)*d,m,this.w-m);s.y=clamp(h.y+Math.sin(an)*d,m,this.h-m);return s;}
  /** (x,y) tem a folga FOOD.STAR_CLEAR até a BORDA de toda estrela viva? Grão dentro do disco é isca, não comida. */
  _clearOfStars(x,y){const st=this.stars;
    for(let i=0;i<st.length;i++){const b=st[i];if(b.dead)continue;const dx=b.x-x,dy=b.y-y,m=b.r+FOOD.STAR_CLEAR;   // b.r acompanha o inchaço do fim da vida
      if(dx*dx+dy*dy<m*m)return false;}
    return true;}
  /**
   * Quanta comida o mundo mantém AGORA. Sem zona é FOOD.COUNT, como sempre foi. Com zona o estoque é do
   * CÍRCULO, não do mapa: `área/ZONE.FOOD_AREA`, com piso FOOD_MIN e teto FOOD.COUNT. Como o alvo cai mais
   * devagar que a área, cada fechamento deixa o chão MAIS denso — é o tapete de que o pequeno vive no fim.
   */
  foodTarget(){const zc=this.zoneNow();if(!zc)return this.foodCount;
    const n=Math.round(Math.PI*zc.r*zc.r/ZONE.FOOD_AREA);
    return n>this.foodCount?this.foodCount:n<ZONE.FOOD_MIN?ZONE.FOOD_MIN:n;}
  /**
   * O gás come a comida também: por tick confere ZONE.FOOD_SCAN grãos (cursor rolante, varredura completa a
   * cada ~26 ticks) e mata os que ficaram fora do círculo. Sem isso a população ficava PRESA no gás — onde
   * ninguém vai buscá-la — e o laço de reposição, que só enche até o alvo, parava de repor DENTRO.
   */
  /**
   * A estrela que o círculo deixou para trás some e volta para a FILA (sem ela a população cairia para
   * sempre, e o Battle Royale terminaria sem nenhum perigo no mapa). São 12 no total, então a varredura é
   * um cursor rolante de ZONE.STAR_SCAN por tick, no molde do `_cullFoodOutOfZone` — não porque custe,
   * mas porque somem uma de cada vez em vez de todas no mesmo quadro.
   * A folga é a MESMA do spawn (STAR_PAD): sem ela a estrela nasceria e morreria alternadamente na borda.
   * @param {{x:number,y:number,r:number}} zc
   */
  _cullStarsOutOfZone(zc){const stars=this.stars,n=stars.length;if(!n)return;
    let i=this._starScan|0;if(i>=n)i=0;
    const fim=Math.min(n,i+ZONE.STAR_SCAN),lim=Math.max(0,zc.r-ZONE.STAR_PAD),l2=lim*lim;
    for(;i<fim;i++){const st=stars[i];if(st.dead)continue;
      const dx=st.x-zc.x,dy=st.y-zc.y;if(dx*dx+dy*dy<=l2)continue;
      st.dead=true;this.queueStar(ZONE.STAR_RETRY_TICKS);}
    this._starScan=i>=n?0:i;}
  _cullFoodOutOfZone(zc){const food=this.food,n=food.length;if(!n)return;
    let i=this._foodScan|0;if(i>=n)i=0;
    const fim=Math.min(n,i+ZONE.FOOD_SCAN);
    for(;i<fim;i++){const f=food[i];if(f&&!f.dead&&!inZone(f.x,f.y,zc))this.killFood(f);}
    this._foodScan=i>=n?0:i;}
  /**
   * Asteroide: `beltIx ≥ 0` orbita o cinturão (ângulo `ang` ou aleatório, raio com jitter); `-1` é errante
   * (posição dada ou longe dos jogadores, velocidade WANDER_SPEED em direção aleatória). r 0 = sorteia.
   */
  spawnAsteroid(beltIx=-1,x=0,y=0,r=0,ang=NaN){const rng=this.rng;if(!(r>0))r=rng.range(ASTEROID.R_MIN,ASTEROID.R_MAX);
    const a=createBody(KIND.ASTEROID,this.newId(),0,0,r);a.type=beltIx;a.seed=rng.next();a.hue=rng.int(0,2);
    if(beltIx>=0){const bt=this.belts[beltIx];a.ang=Number.isNaN(ang)?rng.angle():ang;a.orbitR=bt.rad+rng.range(-BELT_RAD_JITTER,BELT_RAD_JITTER);
      a.x=bt.cx+Math.cos(a.ang)*a.orbitR;a.y=bt.cy+Math.sin(a.ang)*a.orbitR;}
    else{if(x>0||y>0){a.x=x;a.y=y;}else{const s=this._farSpot(AST_MARGIN,this.pieces,ASTEROID.SAFE_SPAWN);a.x=s.x;a.y=s.y;}
      const an=rng.angle(),sp=rng.range(ASTEROID.WANDER_SPEED[0],ASTEROID.WANDER_SPEED[1]);a.vx=Math.cos(an)*sp;a.vy=Math.sin(an)*sp;}
    a.x=clamp(a.x,a.r,this.w-a.r);a.y=clamp(a.y,a.r,this.h-a.r);this.asteroids.push(a);return this._register(a);}
  /** Mata o ejetado vivo mais antigo (o de menor `life`): é o que abre vaga quando a lista bate em EJECT.MAX. */
  _dropOldestEject(){const a=this.ejected;let k=-1,best=Infinity;
    for(let i=0;i<a.length;i++){const b=a[i];if(b.dead)continue;if(b.life<best){best=b.life;k=i;}}
    if(k>=0)a[k].dead=true;}
  /** Agenda o respawn de um asteroide (cinturão `belt` ou -1) daqui a `delay` ticks. */
  queueAsteroid(belt,delay){this.astQueue.push({belt,at:this.tick+delay});}
  /** Buraco negro: núcleo CORE_R, longe dos outros (MIN_SEP) e dos jogadores (SAFE_SPAWN). */
  spawnHole({x=NaN,y=NaN,active=false}={}){const rng=this.rng,m=R.LOCAL.HOLE_MARGIN;
    if(Number.isNaN(x)){const s=this._farSpot(m,this.holes,BLACKHOLE.MIN_SEP,this.pieces,BLACKHOLE.SAFE_SPAWN);x=s.x;y=s.y;}
    const h=createBody(KIND.BLACKHOLE,this.newId(),x,y,BLACKHOLE.CORE_R);h.seed=rng.next();h.ang=rng.angle();h.cdUntil=this.tick+BLACKHOLE.DRIFT_CHANGE_TICKS;
    if(active){h.type=BH_PHASE.ACTIVE;h.k=1;const L=BLACKHOLE.LIFE_TICKS;h.life=this.tick+rng.int(Math.floor(L[0]*.5),L[1]);}
    else{h.type=BH_PHASE.GROW;h.k=0;h.life=this.tick+BLACKHOLE.GROW_TICKS;}
    this.holes.push(h);return this._register(h);}
  /**
   * Estrela: perigo que estilhaça quem encosta e termina em supernova. Sem posição, nasce em GROW (`k` rampa) longe
   * das outras (MIN_SEP), dos buracos e dos jogadores (SAFE_SPAWN) e **fora do anel de qualquer cinturão**
   * (BELT_SAFE): com a trombada meteoro×estrela, uma estrela dentro de um cinturão vira moedor e a população
   * nunca para de repor. `active` pula a fase GROW (início do mundo e filhas de um racha, que vêm com `{x,y,r,vx,vy,life}`).
   */
  spawnStar(active=false,{x=NaN,y=NaN,r=STAR.R,vx=0,vy=0,life=0}={}){const rng=this.rng;
    if(Number.isNaN(x)){
      // Com zona (Battle Royale), a estrela nasce DENTRO do círculo — e a separação mínima afrouxa junto,
      // porque 1400 px de folga não cabem num círculo de 1400. Sem zona nada muda: mesmo sorteio de sempre.
      const zc=this.zoneNow();
      const sep=zc?Math.min(STAR.MIN_SEP,zc.r*ZONE.STAR_SEP_K):STAR.MIN_SEP;
      const s=this._farSpot(STAR_MARGIN,this.stars,sep,this.holes,BLACKHOLE.MIN_SEP,this.pieces,STAR.SAFE_SPAWN,this._notInBelt,zc,ZONE.STAR_PAD);
      // Sem zona `_farSpot` nunca "falha" de um jeito que importe (o fallback é um ponto qualquer do mapa e
      // isso sempre foi aceitável). COM zona ele pode não achar nada limpo dentro do círculo, e aí largar a
      // estrela no ponto de fallback é largá-la no gás ou em cima de alguém: melhor não nascer agora.
      if(zc&&!s.ok)return null;
      x=s.x;y=s.y;}
    const st=createBody(KIND.STAR,this.newId(),clamp(x,r,this.w-r),clamp(y,r,this.h-r),r);st.seed=rng.next();st.vx=vx;st.vy=vy;
    if(active){st.type=STAR_PHASE.ACTIVE;st.k=1;st.life=life||this.tick+rng.int(STAR.LIFE_TICKS[0],STAR.LIFE_TICKS[1]);}
    else{st.type=STAR_PHASE.GROW;st.k=0;st.life=this.tick+STAR.GROW_TICKS;}
    this.stars.push(st);this._varreComida(st);return this._register(st);}
  /**
   * A estrela nova varre a comida que estava no lugar dela. O `_clearOfStars` do spawn só resolve UMA das
   * direções: no nascimento do mundo a comida vem ANTES das estrelas (e no meio da partida a estrela
   * respawna onde quiser), então sem isto o grão acaba embaixo do disco do mesmo jeito — que é a isca que
   * não pode existir. O que morre aqui volta pelo laço de reposição, em lugar limpo.
   * @param {Body} st
   */
  _varreComida(st){const food=this.food,m=st.r+FOOD.STAR_CLEAR,m2=m*m;
    for(let i=0;i<food.length;i++){const f=food[i];if(!f||f.dead)continue;
      const dx=f.x-st.x,dy=f.y-st.y;if(dx*dx+dy*dy<m2)this.killFood(f);}}
  /** Agenda o nascimento de uma estrela nova daqui a `delay` ticks (depois de uma supernova). */
  queueStar(delay){this.starQueue.push({at:this.tick+delay});}
  /** (x,y) está a ≥ BELT_SAFE do ANEL de todo cinturão? (o teste é sobre o anel, não sobre o centro). */
  _notInBelt=(x,y)=>{const m=ASTEROID.BELT_SAFE,bs=this.belts;
    for(let i=0;i<bs.length;i++){const b=bs[i],dx=x-b.cx,dy=y-b.cy,d=Math.sqrt(dx*dx+dy*dy);if(Math.abs(d-b.rad)<m)return false;}return true;};
  /**
   * Ponto aleatório com margem a ≥ minX de cada lista (até 3; null ignora) e passando por `pred`.
   * 40 tentativas; devolve a última se falhar, mas agora DIZ que falhou em `s.ok` — quem chama é que sabe
   * se um ponto qualquer serve (asteroide errante) ou se é melhor tentar de novo depois (estrela).
   * `zc` (círculo da zona) muda a AMOSTRAGEM, não o filtro: com o círculo em 480 px de um mapa de 9600, um
   * ponto uniforme cai dentro em 0,8 % das vezes, então rejeitar não funciona — em 40 tentativas a estrela
   * nasceria no gás na maioria das vezes, calada. Sortear em polar dentro do disco (`d=√u·r`, uniforme) é
   * o mesmo caminho que `spawnFood` já usa desde que a comida passou a seguir a zona.
   */
  _farSpot(margin,arrA,minA,arrB=null,minB=0,arrC=null,minC=0,pred=null,zc=null,pad=0){const rng=this.rng,s=this._spot;
    const raio=zc?Math.max(0,zc.r-pad):0;
    s.ok=false;
    for(let t=0;t<SPAWN_TRIES;t++){
      let x,y;
      if(zc){const an=rng.angle(),d=Math.sqrt(rng.next())*raio;
        x=clamp(zc.x+Math.cos(an)*d,margin,this.w-margin);y=clamp(zc.y+Math.sin(an)*d,margin,this.h-margin);}
      else{x=rng.range(margin,this.w-margin);y=rng.range(margin,this.h-margin);}
      s.x=x;s.y=y;
      if(farFrom(arrA,minA,x,y)&&farFrom(arrB,minB,x,y)&&farFrom(arrC,minC,x,y)&&(!pred||pred(x,y))
        &&(!zc||inZone(x,y,zc))){s.ok=true;break;}}   // o clamp da margem pode ter jogado o ponto para fora do círculo
    return s;}
  /** Marca a peça morta; se era a última viva do dono, o jogador morre (PLAYER_DEAD). Retorna true se foi a última. */
  killPiece(pc,cause,bySlot){if(pc.dead)return false;pc.dead=true;const ps=this.players.get(pc.owner);
    if(ps&&ps.alive&&liveCount(ps.pieces)===0){ps.alive=false;this.events.push({type:"PLAYER_DEAD",slot:ps.slot,cause,bySlot});return true;}
    return false;}

  // ── jogadores ──
  /** Entra com uma peça (posição dada ou longe de perigos/jogadores). Retorna a peça. */
  addPlayer(slot,{x=NaN,y=NaN,r=PLAYER.START_R,isBot=false,missiles=0,team=-1,weapon=WEAPON.MISSILE,spawn=true}={}){
    let ps=this.players.get(slot);
    if(!ps){ps={slot,tx:0,ty:0,alive:false,isBot,spawnTick:this.tick,pieces:[],team,weapon,ammo:newAmmo(missiles),weaponPin:false,splitCdUntil:0,ejectCdUntil:0,fireCdUntil:0,autoDefN:0,autoFireAt:0,zoomUntil:0,feastUntil:0,aimLockId:-1,aimLockKind:0,aimLockUntil:0,
      ejectHold:false,ejectHoldAt:0,ejectRamp:0,score:0,splitReq:false,ejectReq:false,fireReq:false,fireAim:false,swapReq:false};this.players.set(slot,ps);}
    else{this._dropPieces(ps);ps.isBot=isBot;ps.ammo=newAmmo(missiles);ps.team=team;ps.weapon=weapon;ps.weaponPin=false;}
    // `spawn:false` = entrou na SALA mas ainda não no MAPA. É o lobby do battle royale: o jogador existe
    // (ocupa vaga, aparece no PLAYERS, escolhe equipe) e só ganha corpo na largada, via respawnPlayer.
    // Sem isso a única forma de "esperar" seria estar no mundo, comendo — que é outro jogo.
    if(!spawn){ps.alive=false;return null;}
    return this._spawnPiece(ps,x,y,r);}
  _spawnPiece(ps,x,y,r){
    // nasce longe de ESTRELA (era do buraco negro, que saiu de cena): com 12 estrelas e a queimadura de STAR.BURN,
    // cair colado numa delas custaria 30% da massa antes de encostar no primeiro grão.
    if(Number.isNaN(x)){const s=this._farSpot(PLAYER_MARGIN,this.stars,STAR.SAFE_SPAWN,this.asteroids,ASTEROID.SAFE_SPAWN,this.pieces,PLAYER_SAFE);x=s.x;y=s.y;}
    ps.alive=true;ps.tx=x;ps.ty=y;ps.ejectHold=false;ps.ejectRamp=0;ps.spawnTick=this.tick;ps.fireCdUntil=this.tick+MISSILE.SPAWN_CD_TICKS;   // carência: ninguém nasce atirando
    ps.autoDefN=0;ps.autoFireAt=0;ps.zoomUntil=0;ps.feastUntil=0;ps.aimLockId=-1;ps.aimLockUntil=0;ps.weaponPin=false;   // vida nova, powerups zerados — mesmo caminho do fireCdUntil, e é ele que cobre addPlayer, respawnPlayer e a largada do BR de uma vez
    const pc=this.newPiece(ps.slot,clamp(x,r,this.w-r),clamp(y,r,this.h-r),r);pc.cdUntil=this.tick+BLACKHOLE.CD_TICKS;return pc;}
  _dropPieces(ps){for(let i=0;i<ps.pieces.length;i++){const pc=ps.pieces[i];pc.dead=true;this.entityById.delete(pc.id);}
    ps.pieces.length=0;const arr=this.pieces;let k=0;for(let i=0;i<arr.length;i++)if(!arr[i].dead)arr[k++]=arr[i];arr.length=k;}
  /** Remove o jogador e suas peças (imediato; mísseis já lançados continuam). */
  removePlayer(slot){const ps=this.players.get(slot);if(!ps)return;this._dropPieces(ps);ps.alive=false;this.players.delete(slot);}
  /** Renasce com uma peça nova (score zera salvo `score`). Retorna a peça ou null se o slot não existe. */
  respawnPlayer(slot,{x=NaN,y=NaN,r=PLAYER.START_R,score=0}={}){const ps=this.players.get(slot);if(!ps)return null;
    this._dropPieces(ps);ps.score=score;ps.splitCdUntil=ps.ejectCdUntil=0;ps.weapon=WEAPON.MISSILE;ps.ammo=newAmmo(0);return this._spawnPiece(ps,x,y,r);}
  setTarget(slot,tx,ty){const ps=this.players.get(slot);if(!ps)return;ps.tx=clamp(tx,0,this.w);ps.ty=clamp(ty,0,this.h);}
  requestSplit(slot){const ps=this.players.get(slot);if(ps)ps.splitReq=true;}
  requestEject(slot){const ps=this.players.get(slot);if(ps)ps.ejectReq=true;}
  setEjectHold(slot,on){const ps=this.players.get(slot);if(!ps)return;if(on&&!ps.ejectHold)ps.ejectHoldAt=this.tick;
    if(!on&&ps.ejectHold)ps.ejectRamp=0;ps.ejectHold=!!on;}   // soltou o W: a próxima cusparada volta a sair perto
  /** `aim`: tiro mirado — trava na bolinha mais próxima do ponteiro (cursor no vazio: sai reto). */
  requestFire(slot,aim=false){const ps=this.players.get(slot);if(ps){ps.fireReq=true;ps.fireAim=!!aim;}}
  /** Chavear de arma (one-shot por seq, como split/eject/fire). */
  requestSwap(slot){const ps=this.players.get(slot);if(ps)ps.swapReq=true;}
  /**
   * Reconstrói a grade da comida se algo mudou (spawn, ímã, buraco negro, compactação). Os índices dela
   * apontam para `this.food`, então quem consulta fora do passo — a AOI do snapshot — precisa chamar isto
   * antes: depois da compactação os índices antigos não valem mais.
   */
  /** A grade da comida é mantida em O(1) por `spawnFood`/`killFood`/`moveFood`: não há o que refazer.
   *  Fica como no-op porque três chamadores a pediam antes de consultar, e um deles é o `shared` que vai
   *  para o bundle do `?local=1` — tirar a função obrigaria a subir cliente e servidor no mesmo minuto. */
  ensureFoodGrid(){}
  /** Grão que ANDOU (ímã, buraco negro). Só custa alguma coisa quando ele troca de célula. @param {Body} f */
  moveFood(f){if(f&&f.fi>=0&&!f.dead)this.foodGrid.move(f.fi,f.x,f.y);}
  /** Liga/desliga a zona (o servidor manda o círculo já pronto; a máquina de fases é do Room, ver shared/zone.js). */
  setZone(z){this.zone=z||null;}
  /** Círculo da zona no tick atual (null sem zona). Reusa um objeto só: isto roda por peça, todo tick. */
  zoneNow(){const z=this.zone;if(!z)return null;const out=this._zc,span=z.t1-z.t0;
    let u=span>0&&Number.isFinite(span)?(this.tick-z.t0)/span:1;u=u<0?0:u>1?1:u;
    out.x=z.x0+(z.x1-z.x0)*u;out.y=z.y0+(z.y1-z.y0)*u;out.r=z.r0+(z.r1-z.r0)*u;return out;}
  massOf(slot){const ps=this.players.get(slot);if(!ps)return 0;let m=0;for(let i=0;i<ps.pieces.length;i++){const p=ps.pieces[i];if(!p.dead)m+=p.mass;}return m;}
  piecesOf(slot){const ps=this.players.get(slot);return ps?ps.pieces:[];}

  // ── passo ──
  step(){
    const tick=this.tick,ev=this.events,W=this.w,H=this.h,players=this.players,pieces=this.pieces,ejected=this.ejected,asts=this.asteroids,missiles=this.missiles,holes=this.holes,stars=this.stars;
    ev.length=0;
    // ── 1. inputs ──
    for(const ps of players.values()){
      if(ps.alive){
        if(ps.splitReq&&tick>=ps.splitCdUntil){ps.splitCdUntil=tick+SPLIT.COOLDOWN_TICKS;R.applySplit(this,ps);}
        let ej=ps.ejectReq;if(ps.ejectHold&&tick>=ps.ejectHoldAt){ej=true;ps.ejectHoldAt=tick+EJECT.HOLD_TICKS;}
        if(ej&&tick>=ps.ejectCdUntil){
          if(tick>ps.ejectCdUntil+EJECT.RAMP_RESET_TICKS)ps.ejectRamp=0;   // parou de cuspir: a força recomeça do início
          ps.ejectCdUntil=tick+EJECT.COOLDOWN_TICKS;
          if(R.applyEject(this,ps)&&ps.ejectRamp<EJECT.RAMP_N)ps.ejectRamp++;}
        if(ps.swapReq)R.swapWeapon(this,ps);   // trocar antes de atirar: no mesmo tick, o tiro sai com a arma nova
        if(ps.fireReq)R.applyFire(this,ps);
        else R.autoDefend(this,ps);}   // powerup de auto-defesa: puxa o gatilho por você — `else` porque o tiro manual tem prioridade e ninguém atira duas vezes no mesmo tick
      ps.splitReq=ps.ejectReq=ps.fireReq=ps.swapReq=false;ps.fireAim=false;}
    // ── 2. integração ──
    const zc=this.zoneNow();
    for(let i=0;i<pieces.length;i++){const pc=pieces[i];if(pc.dead)continue;const ps=players.get(pc.owner);
      integratePiece(pc,ps.tx,ps.ty,DT,W,H);if(this.decay)decayPiece(pc,DT);   // o gigante murcha se parar de comer (PLAYER.DECAY)
      if(zc&&R.zoneBurn(this,pc,zc,DT))continue;   // fora da zona: queima e, no piso, MORRE (é o que fecha a partida)
      if(pc.shieldLv>0&&pc.shieldLv<POWERUP.SHIELD_MAX_LEVEL&&tick>=pc.shieldEvolveAt){   // escudo evolui por peça: só quem tem escudo E não apanha sobe de nível
        pc.shieldLv++;pc.shieldEvolveAt=tick+POWERUP.SHIELD_EVOLVE_TICKS;ev.push({type:"SHIELD_UP",slot:pc.owner,level:pc.shieldLv,up:true,x:pc.x,y:pc.y,r:pc.r});}
      let f=pc.flags&~(PIECE_FLAG.SHIELD|PIECE_FLAG.MERGING|PIECE_FLAG.MAGNET|PIECE_FLAG.SHIELD_LV_MASK);
      if(pc.shieldLv>0)f|=PIECE_FLAG.SHIELD|(pc.shieldLv<<PIECE_FLAG.SHIELD_LV_SHIFT);if(pc.magnetUntil>tick&&pc.r<=POWERUP.MAGNET_MAX_R)f|=PIECE_FLAG.MAGNET;
      if(pc.mergeAt<=tick&&ps.pieces.length>1)f|=PIECE_FLAG.MERGING;pc.flags=f;}
    for(let i=0;i<ejected.length;i++){const e=ejected[i];if(e.dead)continue;if(tick>=e.life){e.dead=true;continue;}integrateFree(e,EJECT.DRAG,WALL.E_EJECT,DT,W,H);}
    for(let i=0;i<asts.length;i++){const a=asts[i];if(a.dead)continue;
      if(a.type>=0){const bt=this.belts[a.type];a.ang+=bt.w*DT;const tx=bt.cx+Math.cos(a.ang)*a.orbitR,ty=bt.cy+Math.sin(a.ang)*a.orbitR;
        a.vx=(a.vx+(tx-a.x)*ASTEROID.BELT_SPRING)*ASTEROID.BELT_DAMP;a.vy=(a.vy+(ty-a.y)*ASTEROID.BELT_SPRING)*ASTEROID.BELT_DAMP;}
      integrateFree(a,0,WALL.E_AST,DT,W,H);}
    for(let i=0;i<missiles.length;i++){const m=missiles[i];if(m.dead)continue;if(tick>=m.life){m.dead=true;continue;}
      R.homeMissile(this,m);if(integrateFree(m,0,0,DT,W,H))m.dead=true;}
    for(let i=0;i<holes.length;i++){const h=holes[i];if(!h.dead)R.tickHole(this,h);}
    for(let i=0;i<stars.length;i++){const st=stars[i];if(st.dead)continue;
      if(st.vx||st.vy)integrateFree(st,STAR.DRAG,WALL.E,DT,W,H);   // estrela empurrada por míssil/partícula (ou filha de um racha) desliza e freia
      R.tickStar(this,st);}   // fases da estrela (a supernova acontece aqui)
    // ── 3. grades ──
    const grid=this.grid,dyn=this.dyn;let nd=0;grid.clear();
    for(let i=0;i<pieces.length;i++){const b=pieces[i];if(b.dead)continue;dyn[nd]=b;grid.insert(nd++,b.x,b.y,b.r);}
    for(let i=0;i<ejected.length;i++){const b=ejected[i];if(b.dead)continue;dyn[nd]=b;grid.insert(nd++,b.x,b.y,b.r);}
    for(let i=0;i<asts.length;i++){const b=asts[i];if(b.dead)continue;dyn[nd]=b;grid.insert(nd++,b.x,b.y,b.r);}
    for(let i=0;i<missiles.length;i++){const b=missiles[i];if(b.dead)continue;dyn[nd]=b;grid.insert(nd++,b.x,b.y,b.r);}
    for(let i=0;i<holes.length;i++){const b=holes[i];if(b.dead)continue;const ri=b.r*BLACKHOLE.INFLUENCE*b.k;if(ri<R.LOCAL.HOLE_MIN_RI)continue;dyn[nd]=b;grid.insert(nd++,b.x,b.y,ri);}
    for(let i=0;i<stars.length;i++){const b=stars[i];if(b.dead)continue;dyn[nd]=b;grid.insert(nd++,b.x,b.y,b.r);}
    dyn.length=nd;grid.build();
    const food=this.food,fg=this.foodGrid;this.ensureFoodGrid();
    let pb=this._pairs,np=0;
    grid.forEachPair((i,j)=>{if(np+3>pb.length){const nb=new Int32Array(pb.length*2);nb.set(pb);pb=this._pairs=nb;}pb[np++]=i;pb[np++]=j;pb[np++]=dyn[i].kind<<3|dyn[j].kind;});
    // ── 4. mesmo dono, por par: separação posicional enquanto uma das duas não pode fundir (sem atração: no agar as partes se juntam pelo próprio ponteiro) ──
    for(const ps of players.values()){const arr=ps.pieces,n=arr.length;if(n<2)continue;
      for(let i=0;i<n;i++){const a=arr[i];if(a.dead)continue;const am=a.mergeAt<=tick;
        for(let j=i+1;j<n;j++){const b=arr[j];if(b.dead)continue;if(!am||b.mergeAt>tick)separateOwn(a,b);}}}
    // ── 5. donos diferentes: engolir ou quicar ──
    for(let p=0;p<np;p+=3){if(pb[p+2]!==PP)continue;const A=dyn[pb[p]],B=dyn[pb[p+1]];if(A.dead||B.dead||A.owner===B.owner)continue;R.piecePair(this,A,B);}
    // ── 6. perigos: asteroides e buracos negros ──
    for(let p=0;p<np;p+=3){const code=pb[p+2];if(code===PP||code===PE||code===EA||code===PM||code===AM||code===MM)continue;const A=dyn[pb[p]],B=dyn[pb[p+1]];if(A.dead||B.dead)continue;
      if(code===PA)R.pieceAsteroid(this,A,B);
      else if(code===PS)R.pieceStar(this,A,B);
      else if(code===MS)R.missileStar(this,A,B);
      else if(code===ES)R.ejectStar(this,A,B);
      else if(code===AS)R.asteroidStar(this,A,B);   // meteoro na estrela: os dois se partem
      else if(code===AA){const s=A.r+B.r,dx=B.x-A.x,dy=B.y-A.y;if(dx*dx+dy*dy<s*s)resolveBounce(A,B,ASTEROID.E_AST,BOUNCE.POS_CORR);}
      else if(code===PH||code===EH||code===AH||code===MH)R.holePair(this,A,B);}
    const q=this._q;
    for(let i=0;i<holes.length;i++){const h=holes[i];if(h.dead)continue;const ri=h.r*BLACKHOLE.INFLUENCE*h.k,rc=h.r*h.k;if(ri<R.LOCAL.HOLE_MIN_RI)continue;
      const n=fg.query(h.x,h.y,ri,q);let moved=false;
      for(let k=0;k<n;k++){const f=food[q[k]];if(f.dead)continue;const dx=h.x-f.x,dy=h.y-f.y;if(dx*dx+dy*dy>ri*ri)continue;moved=true;
        if(R.pullFood(h,f,rc,ri)){this.killFood(f);this.spawnFood();   // engolida: some aqui e a reposição normal a devolve em outro canto (FOOD.COUNT nunca cai)
          ev.push({type:"FOOD_CRUSH",holeId:h.id,x:h.x,y:h.y});}
        else this.moveFood(f);}}
    // ── 7. comida (ímã, comer) e ejetados (ímã, absorver, alimentar asteroide) ──
    // ímã (POR PEÇA — só a que pegou o powerup atrai): comida a d<range anda a MAGNET_PULL·(1+(MAGNET_NEAR−1)·(1−d/range)) px/s (acelera perto = sucção) e fica
    // marcada MOVED (o snapshot manda UPDATE); cometa/estrela (comida pesada) andam a MAGNET_HEAVY disso; ejetados
    // (de terceiros, ou próprios após cdUntil) ganham MAGNET_EJECT_A px/s²; asteroides ganham MAGNET_AST escalado
    // por R_MIN/r (a rocha vem junto — o ímã não escolhe o que puxa); a estrela do mundo se arrasta a MAGNET_STAR;
    // fragmento gordo (mass ≥ FRAG.RICH_MASS) vem a FRAG.MAGNET_HEAVY disso — o prêmio grande custa a chegar.
    const ov=R.LOCAL.FOOD_OVERLAP,PW=POWERUP;
    for(let i=0;i<pieces.length;i++){const pc=pieces[i];if(pc.dead)continue;const ps=players.get(pc.owner),magnet=pc.magnetUntil>tick&&pc.r<=PW.MAGNET_MAX_R;   // cresceu demais: o ímã para de valer (ver POWERUP.MAGNET_MAX_R)
      const range=magnet?Math.min(pc.r*PW.MAGNET_RANGE,PW.MAGNET_RANGE_MAX):pc.r+FOOD.R_MAX*ov,n=fg.query(pc.x,pc.y,range,q);   // teto ABSOLUTO: é ele que impede o planetão de sugar a tela inteira
      for(let k=0;k<n;k++){const f=food[q[k]];if(f.dead)continue;let dx=pc.x-f.x,dy=pc.y-f.y,d2=dx*dx+dy*dy;
        if(magnet&&d2<range*range&&d2>1e-6){const d=Math.sqrt(d2),hv=(f.type===FOOD_TYPE.COMET||f.type===FOOD_TYPE.STAR)?PW.MAGNET_HEAVY:1;
          let s=PW.MAGNET_PULL*hv*(1+(PW.MAGNET_NEAR-1)*(1-d/range))*DT;if(s>d)s=d;
          f.x+=dx/d*s;f.y+=dy/d*s;f.flags|=FOOD_FLAG.MOVED;this.moveFood(f);dx=pc.x-f.x;dy=pc.y-f.y;d2=dx*dx+dy*dy;}
        // `zc` é o círculo da zona já calculado no topo do step: quem colhe EXPOSTO ao gás recebe menos
        const lim=pc.r+f.r*ov;if(d2<lim*lim)R.eatFood(this,ps,pc,f,zc);}
      if(magnet){const m=grid.query(pc.x,pc.y,range,q);
        for(let k=0;k<m;k++){const b=dyn[q[k]];if(b.dead)continue;
          if(b.kind===KIND.EJECT){if(b.owner===pc.owner&&tick<b.cdUntil)continue;
            const ex=pc.x-b.x,ey=pc.y-b.y,ed2=ex*ex+ey*ey;if(ed2>=range*range||ed2<1e-6)continue;
            const hv=b.mass>=FRAG.RICH_MASS?FRAG.MAGNET_HEAVY:1,a=PW.MAGNET_EJECT_A*hv*DT/Math.sqrt(ed2);b.vx+=ex*a;b.vy+=ey*a;}   // pedaço gordo se arrasta (MAGNET_HEAVY), igual cometa/estrela na comida
          else if(b.kind===KIND.ASTEROID){   // o ímã puxa a rocha também: recompensa e perigo vêm juntos
            const ax=pc.x-b.x,ay=pc.y-b.y,ad2=ax*ax+ay*ay;if(ad2>=range*range||ad2<1e-6)continue;
            const a=PW.MAGNET_AST*(b.r>ASTEROID.R_MIN?ASTEROID.R_MIN/b.r:1)*DT/Math.sqrt(ad2);b.vx+=ax*a;b.vy+=ay*a;}}
        for(let k=0;k<stars.length;k++){const st=stars[k];if(st.dead)continue;const sx=pc.x-st.x,sy=pc.y-st.y,sd2=sx*sx+sy*sy;
          if(sd2>=range*range||sd2<1e-6)continue;const sd=Math.sqrt(sd2);let sp=PW.MAGNET_PULL*PW.MAGNET_STAR*DT;if(sp>sd)sp=sd;
          st.x=clamp(st.x+sx/sd*sp,st.r,W-st.r);st.y=clamp(st.y+sy/sd*sp,st.r,H-st.r);}}}
    for(let p=0;p<np;p+=3){const code=pb[p+2];if(code!==PE&&code!==EA)continue;const A=dyn[pb[p]],B=dyn[pb[p+1]];if(A.dead||B.dead)continue;
      if(code===PE)R.pieceEject(this,A,B,zc);else R.ejectAsteroid(this,A,B);}
    // ── 8. mísseis: míssil×míssil (O(n²) sobre w.missiles, teste varrido — fora da grade), depois peça×míssil e asteroide×míssil ──
    for(let i=0;i<missiles.length;i++){const A=missiles[i];if(A.dead)continue;for(let j=i+1;j<missiles.length;j++){const B=missiles[j];if(!B.dead&&R.missileMissile(this,A,B))break;}}
    for(let p=0;p<np;p+=3){const code=pb[p+2];if(code!==PM&&code!==AM)continue;const A=dyn[pb[p]],B=dyn[pb[p+1]];if(A.dead||B.dead)continue;
      if(code===PM)R.pieceMissile(this,A,B);else R.asteroidMissile(this,A,B);}
    // ── 9. fusões ──
    for(const ps of players.values()){const arr=ps.pieces,n=arr.length;if(n<2)continue;
      for(let i=0;i<n;i++){const a=arr[i];if(a.dead||a.mergeAt>tick)continue;for(let j=i+1;j<n;j++){const b=arr[j];if(b.dead)continue;
        if(tryMergeOwn(a,b,tick))ev.push({type:"MERGE",slot:ps.slot,pieceId:a.id,mergedId:b.id,x:a.x,y:a.y,r:a.r});}}}
    // ── 9b. auto-split acima de MAX_R (agar.io): pega o excesso vindo de comer E o de fundir no mesmo tick ──
    for(const ps of players.values())if(ps.alive)R.autoSplit(this,ps);
    // ── 10. compactação ordenada ──
    this._compact();
    // ── 11. spawns ──
    // a comida segue a ZONA: o que ficou no gás morre e o estoque é o do CÍRCULO (ver ZONE.FOOD_* e
    // foodTarget). A poda vem ANTES do enche: os grãos mortos deste tick já contam como vaga.
    // E com zona a reposição tem RENDA, não torneira: o círculo repõe a própria população a cada
    // ZONE.FOOD_FILL_S segundos. Repor na hora é inofensivo no mapa inteiro (ninguém cobre 92 M px²) e é
    // fonte infinita num círculo de 480 px, onde o líder cobre quase tudo e reengole cada grão no tick
    // seguinte. Sem zona (modo Livre) segue instantâneo, como sempre foi.
    if(zc)this._cullFoodOutOfZone(zc);
    const alvo=this.foodTarget();
    let vivos=this.foodAlive;   // contador, não varredura: `food` tem os buracos da free list
    let cota=zc?Math.ceil(alvo*DT/ZONE.FOOD_FILL_S)||1:Infinity;
    for(;vivos<alvo&&cota>0;vivos++,cota--)this.spawnFood();
    const aq=this.astQueue;if(aq.length){let k=0;for(let i=0;i<aq.length;i++){const e=aq[i];if(e.at<=tick){const a=this.spawnAsteroid(e.belt);ev.push({type:"ASTEROID_RESPAWN",asteroidId:a.id,x:a.x,y:a.y,r:a.r});}else aq[k++]=e;}aq.length=k;}
    while(holes.length<this.holeCount){const h=this.spawnHole();ev.push({type:"HOLE_RESPAWN",holeId:h.id,x:h.x,y:h.y});}
    const sq=this.starQueue;if(sq.length){let k=0;for(let i=0;i<sq.length;i++){const e=sq[i];
      if(e.at>tick){sq[k++]=e;continue;}
      // ADIAR, não desistir: com o círculo apertado a estrela esteriliza um quarto do tapete de comida (ver
      // ZONE.STAR_MIN_R) e vira moedor num espaço em que já não há para onde correr. A entrada volta para a
      // fila, então se a partida durar num círculo grande a população se recompõe sozinha.
      if(zc&&zc.r<ZONE.STAR_MIN_R){e.at=tick+ZONE.STAR_RETRY_TICKS;sq[k++]=e;continue;}
      const st=this.spawnStar();
      if(!st){e.at=tick+ZONE.STAR_RETRY_TICKS;sq[k++]=e;continue;}   // círculo sem lugar limpo agora: tenta de novo
      ev.push({type:"STAR_RESPAWN",starId:st.id,x:st.x,y:st.y,r:st.r});}
      sq.length=k;}
    // A estrela que o círculo deixou para trás some (e volta para a fila, senão a população cai para sempre).
    // Sem SUPERNOVA: sumiço silencioso, que o REMOVE do snapshot já conta ao cliente — explodir no gás daria
    // prêmio a ninguém e um susto em quem está do outro lado do mapa.
    if(zc)this._cullStarsOutOfZone(zc);
    this.tick=tick+1;}
  _compact(){const byId=this.entityById;
    const cp=arr=>{let k=0;for(let i=0;i<arr.length;i++){const b=arr[i];if(b.dead)byId.delete(b.id);else arr[k++]=b;}const gone=k!==arr.length;arr.length=k;return gone;};
    // ⚠️ `this.food` NÃO entra aqui: compactar reordena o array e os índices que a grade de pontos
    // guarda deixariam de valer — que é exatamente o custo que ela existe para eliminar. O grão morto
    // fica no lugar como buraco (`killFood` devolveu o slot a `foodFree`), e o `byId` dele é apagado
    // à mão logo abaixo, porque era o `cp` quem fazia isso.
    cp(this.pieces);cp(this.ejected);cp(this.asteroids);cp(this.holes);cp(this.missiles);cp(this.stars);
    const gone=this.foodFree;for(let i=0;i<gone.length;i++){const f=this.food[gone[i]];if(f&&f.dead)byId.delete(f.id);}
    for(const ps of this.players.values()){const arr=ps.pieces;let k=0;for(let i=0;i<arr.length;i++)if(!arr[i].dead)arr[k++]=arr[i];arr.length=k;}}
}

/** Cria um mundo determinístico. `food`/`holes`/`stars` são contagens; `asteroids:false` desliga cinturões e errantes. */
export function createWorld({seed=1,w=WORLD.w,h=WORLD.h,food=FOOD.COUNT,asteroids=true,holes=BLACKHOLE.COUNT,stars=STAR.COUNT,decay=true,weapons=false}={}){return new World(seed,w,h,{food,asteroids,holes,stars,decay,weapons});}
// `decay:false` existe para os testes de conservação de massa: o decaimento é uma regra de EQUILÍBRIO e mexeria
// em toda asserção de "a massa fecha em 1e-6", que é sobre a TRANSFERÊNCIA ser sem perda. O teste do decaimento
// e o de paridade da predição usam mundo com ele ligado.
