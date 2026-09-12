// ── O TUTORIAL DE ESTREIA: O DIRETOR ──────────────────────────────────────────
// O único módulo que toca no `World` do tutorial. Ele monta a cena de cada etapa, lê os eventos do tick,
// pergunta à máquina pura (`game/tutor.js`) em que pé estamos e manda o estado ao cliente.
//
// ⚠️ Ele é INJETADO no `LocalServer` (`createLocalServer({mundo, roteiro})`), que não conhece tutorial
// nenhum: só chama `nasce()` no spawn e `passo()` depois do `w.step()`. Com `roteiro:null` aquele arquivo
// se comporta byte a byte como sempre — e é isso que faz `?local=1` e `?bench` continuarem provando que
// nada quebrou.
// ⚠️ O RELÓGIO É O DO MUNDO (`w.tick`), nunca `performance.now()`. O render pode estar congelado — pausa
// da plataforma, contexto WebGL perdido, aba escondida — com o mundo andando, e o inverso também. Um
// tutorial que avança por relógio de parede quebra nos dois casos, em silêncio.
// ⚠️ NADA AQUI ENTRA EM `shared/physics`. As travas do novato (a graça, o portão do split, a carência do
// tiro) continuam de pé no servidor de verdade; o que o tutorial faz é o que o modo `bench` já fazia —
// MUTAR o mundo local depois de criado.
// @ts-check
import {STAR,SPLIT,MISSILE,PLAYER,BOT,POWERUP,WEAPON,TICK_HZ,clamp} from "@warspace/shared";
import {STAR_PHASE} from "@warspace/shared/protocol/constants.js";
import {setR} from "@warspace/shared/physics/body.js";
import {applyFire} from "@warspace/shared/physics/rules.js";
import {passoTutor,TUTOR0,ETAPA} from "../tutor.js";

/**
 * As opções do `createLocalServer` para o tutorial.
 *
 * ⚠️ `mundo` é o que finalmente PODE esvaziar o mundo: `stars`/`asteroids` nunca eram repassados ao
 * `createWorld` e caíam nos defaults (19 estrelas, 58 asteroides). Com os quatro zerados, os laços de
 * semeadura não rodam e a fase 11 do `step` fica inerte — mundo 100% autoral.
 * ⚠️ `decay:false` porque o tutorial tem pausas de leitura e o `PLAYER.DECAY` comeria massa de quem está
 * parado entendendo a instrução. Não é risco de tempo (de 9.080 a 6.000 são 207 s contra ~80 de
 * tutorial), é higiene: a massa que a etapa 1 entregou não pode escorrer entre uma etapa e outra.
 * ⚠️ `roundTicks:0` = SEM FIM. O tutorial acaba pelo roteiro, nunca por tempo.
 */
export const OPCOES_TUTORIAL={seed:7,bots:0,food:0,roundTicks:0,code:"0TUT",
  mundo:{asteroids:false,holes:0,stars:0,decay:false}};

/** A coreografia, num lugar só. Ver o bloco de contas no fim do arquivo. */
export const CENA={
  DIST:480,          // ⚠️ o raio de tudo. O MENOR envelope de tela medido é 520 px de meia-altura
                     // (celular deitado, sem o zoom de novato) — um alvo a 900 px está FORA da tela.
  NOVA_ESPERA:120,   // ticks até a estrela estourar (2 s: ela já nasce inchada e cresce um pouco mais)
  NOVA_SAFE:340,     // ⚠️ e ela ESPERA se o jogador estiver mais perto que isto: o miolo que estilhaça
                     // é `blast·NOVA_SHATTER` ≈ 290 px na fase OLD, e a etapa 1 não pode abrir punindo
                     // quem obedeceu à instrução de ir até lá.
  CACO_VIDA:7200,    // ⚠️ os cacos da supernova vivem `NOVA_LIFE_TICKS` = 15 s. Um novato descobrindo o
                     // mouse não come 17 deles nesse tempo, e a etapa se esvaziaria sozinha — justo para
                     // quem esta feature existe para atender. 2 min é o tutorial inteiro, com folga.
  CACO_PUXA:150,     // px/s da deriva do 2º degrau de ajuda (ela PARA quando ele se move)
  ALVO_K:1.05,       // ⚠️ o alvo da etapa 2 É UMA RAZÃO, nunca um raio absoluto — e isso não é detalhe:
                     //   `EAT.RATIO` é 1,15 nos DOIS sentidos, então um número cravado ou é comível (e a
                     //   etapa se resolve encostando, sem atirar) ou COME o aluno. Com 1,05 ninguém come
                     //   ninguém, aconteça o que acontecer na etapa 1 — inclusive nada.
                     //   ⚠️ Um piso absoluto (que houve aqui, em 90) desfaz exatamente essa garantia:
                     //   contra um aluno que ficou em r=30 ele vira 3× o tamanho dele. O teste pega.
  PRESA_R:40,        // ⚠️ a presa tem de caber na METADE, não no planeta inteiro: com r=96 cada metade
                     //   sai em 67,9 e engole até 59. Um alvo de 60 seria comível inteiro e INCOMÍVEL
                     //   pela metade que salta — o tutorial ensinaria o gesto e puniria quem o fizesse.
  PRESA_V:1.0,       // fração da velocidade de fuga (1 = foge de verdade; a presa É mais rápida)
  SPLIT_K:1.6,       // r do jogador ao abrir a etapa 3, em múltiplos de `SPLIT.MIN_R` (o filho sai em
                     // r/√2 e tem de continuar acima do portão)
  AJUDA1_D:350,AJUDA2_D:150,   // a presa chega mais perto nos degraus de ajuda
};

const ms=w=>w.tick*(1000/TICK_HZ);
const vivas=ps=>ps?ps.pieces.filter(p=>!p.dead):[];
/** Centróide das peças vivas do jogador. */
function centro(ps){const a=vivas(ps);if(!a.length)return null;
  let x=0,y=0;for(const p of a){x+=p.x;y+=p.y;}return{x:x/a.length,y:y/a.length,r:Math.max(...a.map(p=>p.r))};}

/**
 * Um ponto a `dist` do jogador, PREFERINDO o eixo vertical.
 *
 * ⚠️ Vertical de propósito: em retrato a meia-largura é 327–491 px e a meia-altura passa de 700. Armar
 * no eixo horizontal põe o alvo fora da tela do aparelho que mais precisa do tutorial.
 * ⚠️ E ele inverte quando não cabe: o jogador anda durante a etapa, e o mundo tem borda.
 */
function perto(w,c,dist){
  const m=dist+200;
  const cima=c.y-dist>=m,baixo=c.y+dist<=w.h-m;
  const y=cima?c.y-dist:baixo?c.y+dist:clamp(c.y-dist,m,w.h-m);
  return{x:clamp(c.x,m,w.w-m),y};}

/**
 * Deixa o jogador pronto para a etapa: munição, cooldowns e — quando pedido — tamanho e graça.
 *
 * ⚠️ **É AQUI QUE AS TRÊS TRAVAS CAEM, e nenhuma delas é driblada na física.**
 *   · `fireCdUntil` — `_spawnPiece` grava `tick + MISSILE.SPAWN_CD_TICKS` (600 = **10 s**) a cada
 *     nascimento. Sem zerar, o botão MÍSSIL não responde e o novato aprende que ele está quebrado.
 *   · `ammo` — o humano nasce com ZERO mísseis no servidor local (`LocalServer`), ao contrário dos bots.
 *   · `graceUntil` — `rules.applySplit` recusa sob graça, e `sobGraca` é **re-entrante pela massa**: se
 *     ela cair abaixo de `NOVATO_MASS` com `graceUntil` ainda no futuro, o split volta a ser recusado em
 *     silêncio, com o botão já na tela. Zerar o campo é o mesmo que a terceira saída da graça
 *     (`eatPiece` zera a do matador) já faz.
 * @param {*} w @param {number} slot
 */
export function preparaJogador(w,slot,{r=0,ammo=-1,graca=null}={}){
  const ps=w.players.get(slot);if(!ps)return null;
  const pc=vivas(ps)[0];if(!pc)return null;
  if(r>0&&pc.r<r)setR(pc,r);
  if(ammo>=0){ps.ammo=ps.ammo.map(()=>0);ps.ammo[WEAPON.MISSILE]=ammo;ps.weapon=WEAPON.MISSILE;}
  ps.fireCdUntil=0;ps.splitCdUntil=0;ps.ejectCdUntil=0;
  if(graca===false)ps.graceUntil=0;
  return ps;}

/** Apaga o que a etapa anterior deixou: cacos, comida, estrelas, o alvo e a FILA de estrelas. */
function limpa(w,st,api){
  for(const e of w.ejected)if(!e.dead)e.dead=true;
  for(const f of w.food)if(f&&!f.dead)w.killFood(f);
  for(const s of w.stars)if(!s.dead)s.dead=true;
  // ⚠️ `supernova()` chama `w.queueStar(STAR.RESPAWN_TICKS)`, e a fila é drenada INCONDICIONALMENTE na
  // fase 11 do `step` — `stars:0` não a impede. Sem esta linha uma estrela nasce em ponto sorteado do
  // mapa 10 s depois da explosão, no meio da etapa 2 ou 3.
  w.starQueue.length=0;
  if(st.alvo>=0){api.tiraAlvo(st.alvo);st.alvo=-1;}}

/**
 * Monta a cena de uma etapa. EXPORTADA porque é o que o teste exercita — ele roda o tutorial inteiro
 * headless, contra um `createWorld` de verdade, sem navegador.
 * @param {*} w @param {*} api @param {number} etapa @param {number} slot @param {*} st
 */
export function montaEtapa(w,api,etapa,slot,st){
  const ps=w.players.get(slot);if(!ps)return;
  limpa(w,st,api);
  const c=centro(ps);if(!c)return;
  if(etapa===ETAPA.NOVA){
    const p=perto(w,c,CENA.DIST);
    const s=w.spawnStar(true,{x:p.x,y:p.y});
    if(s){
      // Já em OLD: ela nasce inchada e cresce mais um pouco antes de estourar — o telegrama que o cliente
      // desenha de graça (`effects.star.nursery`). `spawnStar(true)` sozinho sortearia 40 a 70 s de vida.
      s.type=STAR_PHASE.OLD;s.life=w.tick+CENA.NOVA_ESPERA;st.estrela=s.id;}
    st.base=w.massOf(slot);
    return;}
  if(etapa===ETAPA.TIRO){
    preparaJogador(w,slot,{ammo:MISSILE.MAX_AMMO});
    const p=perto(w,c,CENA.DIST);
    const r=c.r*CENA.ALVO_K;
    st.alvo=api.alvo({x:p.x,y:p.y,r});
    return;}
  if(etapa===ETAPA.SPLIT){
    // ⚠️ As duas travas do split caem JUNTAS e aqui, não lá na frente: o tamanho (o portão `SPLIT.MIN_R`)
    // e a graça (que o servidor local avisa com `{t:"grace"}`, e é ele que devolve o `#t-split` à tela).
    // `SPLIT.MIN_R` é lido A CADA CHAMADA, nunca capturado na carga do módulo: ele é tunable 'wire'.
    preparaJogador(w,slot,{r:SPLIT.MIN_R*CENA.SPLIT_K,graca:false});
    api.json({t:"grace",why:"tutor"});
    const p=perto(w,c,CENA.DIST);
    st.alvo=api.alvo({x:p.x,y:p.y,r:CENA.PRESA_R});
    return;}}

/**
 * O roteiro, pronto para ser injetado no `LocalServer`.
 * @returns {{nasce:Function, passo:Function, estado:Function}}
 */
export function criaRoteiro(){
  const st={etapa:TUTOR0,slot:-1,alvo:-1,estrela:-1,base:0,montada:0,
    sobrou:0,ultimo:0,acertou:false,comeu:false,moveu:false,ultEnv:""};

  function nasce(w,slot,api){
    st.slot=slot;
    // ⚠️ Posição FIXA no centro do mundo: tudo o mais é relativo a ela, e o `_spawnPiece` com x/y dados
    // pula o sorteio inteiro (que num mundo vazio devolveria qualquer canto de 12000×12000).
    w.addPlayer(slot,{x:w.w/2,y:w.h/2,r:PLAYER.SPAWN_R,missiles:0});
    preparaJogador(w,slot,{});
    // ⚠️ O ÍMÃ DE NASCENÇA SAI. Ele arrasta os cacos (`FRAG.MAGNET_HEAVY` só freia os gordos, e os da
    // supernova têm massa 316 < 600), e com ele o jogador ganha a etapa 1 SEM SE MOVER — que é justamente
    // o que a etapa 1 existe para ensinar. Ele volta a valer na sala de verdade, como sempre.
    const pc=vivas(w.players.get(slot))[0];if(pc)pc.magnetUntil=0;
    st.base=w.massOf(slot);}

  function passo(w,api){
    if(st.slot<0)return;
    const ps=w.players.get(st.slot);
    const agora=ms(w),et=st.etapa.etapa;

    // ── o que aconteceu NESTE tick ──
    for(const ev of w.events){
      if(ev.type==="SUPERNOVA"){
        // ⚠️ **OS CACOS EXPIRAM EM 15 s** (`STAR.NOVA_LIFE_TICKS`=900, consumido em `world.js`), e um
        // novato descobrindo o mouse não come 17 deles nesse tempo: a etapa 1 se esvaziaria sozinha e ele
        // ficaria num mundo sem nada, sem entender por quê — justo o jogador para quem esta feature
        // existe. Estender a vida no mundo LOCAL é uma linha e não toca em física nenhuma.
        for(const e of w.ejected)if(!e.dead)e.life=w.tick+CENA.CACO_VIDA;
        // E a fila de respawn de estrela some junto: `supernova()` enfileira uma para daqui a 10 s, e ela
        // nasceria em ponto sorteado do mapa no meio da etapa 2 ou 3.
        w.starQueue.length=0;st.estrela=-1;}
      else if(ev.type==="EJECT_EATEN"&&ev.slot===st.slot)st.ultimo=agora;
      else if(ev.type==="FOOD_EATEN"&&ev.slot===st.slot)st.ultimo=agora;
      else if(ev.type==="BOOM"&&ev.bySlot===st.slot)st.acertou=true;
      else if(ev.type==="EAT"&&ev.killerSlot===st.slot)st.comeu=true;}
    st.sobrou=w.ejected.reduce((n,e)=>n+(e.dead?0:1),0);

    // a estrela só estoura com o jogador a salvo do miolo — ver CENA.NOVA_SAFE
    if(st.estrela>=0){const s=w.stars.find(x=>x.id===st.estrela&&!x.dead);
      if(!s)st.estrela=-1;
      else{const c=centro(ps);
        if(c&&Math.hypot(c.x-s.x,c.y-s.y)<CENA.NOVA_SAFE&&w.tick>=s.life-1)s.life=w.tick+30;}}

    // ── a decisão ──
    const c=centro(ps);
    const ctx={vivo:!!(ps&&ps.alive&&c),massa:ps?w.massOf(st.slot):0,base:st.base,
      meta:Math.max(BOT.NOVATO_MASS,SPLIT.MIN_R*SPLIT.MIN_R*1.05)||6000,
      sobrou:st.sobrou,ultimo:st.ultimo,acertou:st.acertou,comeu:st.comeu};
    const r=passoTutor(st.etapa,ctx,agora);
    st.etapa=r.est;

    // montar a cena da etapa que acabou de abrir (e só uma vez por etapa)
    if(r.etapa!==st.montada&&r.etapa<ETAPA.FIM&&st.etapa.desde){
      st.montada=r.etapa;st.acertou=false;st.comeu=false;st.ultimo=0;
      montaEtapa(w,api,r.etapa,st.slot,st);}

    // ── a ajuda que mexe no MUNDO (a que é só texto mora na tela) ──
    if(ps&&c)ajuda(w,api,r,st,ps,c);

    // ── o estado, só quando muda ──
    const env=r.etapa+"|"+Math.round(r.pct*100)+"|"+r.ajuda+"|"+(r.fim?1:0);
    if(env!==st.ultEnv||r.festa){st.ultEnv=env;
      api.json({t:"tutor",etapa:r.etapa,pct:+r.pct.toFixed(3),ajuda:r.ajuda,
        festa:r.festa,auto:r.auto,fim:r.fim});}}

  /** Os degraus 2 e 3 de cada etapa, do lado do mundo. O degrau 1 é sempre só texto. */
  function ajuda(w,api,r,st,ps,c){
    if(r.etapa===ETAPA.NOVA&&r.ajuda>=2&&!r.fim){
      // os cacos derivam até ele — e PARAM no instante em que ele se move (quem executa o gesto é ele)
      const pc=vivas(ps)[0],parado=pc&&Math.hypot(pc.svx||0,pc.svy||0)<20;
      if(parado)for(const e of w.ejected){if(e.dead)continue;
        const dx=c.x-e.x,dy=c.y-e.y,d=Math.hypot(dx,dy)||1;
        e.vx+=dx/d*CENA.CACO_PUXA*(1/TICK_HZ)*8;e.vy+=dy/d*CENA.CACO_PUXA*(1/TICK_HZ)*8;}}
    if(r.etapa===ETAPA.NOVA&&r.ajuda>=3){
      // O TETO: ele não chegou à meta sozinho. Concede a massa — e a tela DIZ que concedeu (`auto`).
      // Fazer por alguém em silêncio é a pior das três opções, porque a pessoa sai achando que aprendeu.
      const pc=vivas(ps)[0],meta=Math.max(BOT.NOVATO_MASS,SPLIT.MIN_R*SPLIT.MIN_R*1.05);
      if(pc&&pc.mass<meta)setR(pc,Math.sqrt(meta*1.05));}
    if(r.etapa===ETAPA.TIRO&&r.ajuda>=1&&st.alvo>=0){
      // o alvo AVANÇA. Ele não pode comer ninguém (ratio 1,05), então é ameaça sem risco.
      const a=w.players.get(st.alvo);if(a&&a.alive)w.setTarget(st.alvo,c.x,c.y);}
    if(r.etapa===ETAPA.TIRO&&r.ajuda>=3&&st.alvo>=0){
      // o teto: o tutorial atira por ele. Quem DIZ que atirou é a tela.
      const p=w.players.get(st.slot);if(p){w.setTarget(st.slot,...alvoXY(w,st));applyFire(w,p);}}
    if(r.etapa===ETAPA.SPLIT&&st.alvo>=0){
      const a=w.players.get(st.alvo);if(!a||!a.alive)return;
      const ac=centro(a);if(!ac)return;
      const d=Math.hypot(ac.x-c.x,ac.y-c.y);
      if(r.ajuda>=2){w.setTarget(st.alvo,ac.x,ac.y);   // parou de fugir
        if(d>CENA.AJUDA2_D)aproxima(w,st.alvo,c,CENA.AJUDA2_D);}
      else if(r.ajuda>=1){w.setTarget(st.alvo,ac.x,ac.y);
        if(d>CENA.AJUDA1_D)aproxima(w,st.alvo,c,CENA.AJUDA1_D);}
      else{const dx=ac.x-c.x,dy=ac.y-c.y,n=Math.hypot(dx,dy)||1;   // foge
        w.setTarget(st.alvo,clamp(ac.x+dx/n*900,0,w.w),clamp(ac.y+dy/n*900,0,w.h));}}}

  function aproxima(w,slot,c,dist){
    const a=w.players.get(slot),pc=vivas(a)[0];if(!pc)return;
    const dx=pc.x-c.x,dy=pc.y-c.y,n=Math.hypot(dx,dy)||1;
    pc.x=clamp(c.x+dx/n*dist,pc.r,w.w-pc.r);pc.y=clamp(c.y+dy/n*dist,pc.r,w.h-pc.r);
    pc.vx=pc.vy=0;w.setTarget(slot,pc.x,pc.y);}

  function alvoXY(w,st){const a=w.players.get(st.alvo),c=centro(a);return c?[c.x,c.y]:[w.w/2,w.h/2];}

  return{nasce,passo,estado:()=>st};}
