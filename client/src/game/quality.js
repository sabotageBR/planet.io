// ── POLÍTICA DE QUALIDADE: quando subir/descer o nível econômico ────────────────────────────
// Pura de propósito, no molde de `modeFor` (hooks/useViewportMode.js): a decisão vivia colada ao laço de
// render, com cinco variáveis soltas (slowSince/fastSince/econAt/econLeftAt/econBackoff), e por isso a
// oscilação que fazia a tela piscar não tinha como ser conferida numa tabela. Ver client/test/quality.test.js.
//
// A entrada é o tempo REAL entre frames (não o custo de CPU: ele não enxerga a GPU, e um jogo a 20 fps
// reportava "6 ms de frame"). Saída: o nível desejado — quem aplica é o chamador, no INÍCIO do frame.
export const QUALITY={
  SLOW_MS:20,     // acima disto (menos de 50 fps) o frame conta como lento
  FAST_MS:18,     // abaixo disto (55 fps+, folga com vsync a 60 Hz) conta como rápido; entre os dois, zona morta
  MAX:2,          // 0 = cheio, 1 = econômico, 2 = mínimo
  SOBE_MS:1000,   // lentidão sustentada por 1 s sobe um nível
  DESCE_MS:2000,  // rapidez sustentada por 2 s devolve um nível
  BACKOFF_MS:30000,BACKOFF_MAX:300000,
  RECAI_MS:5000,  // se a queda volta menos de 5 s depois de uma descida, o backoff dobra
  // ⚠️ CARÊNCIA DEPOIS DE QUALQUER TROCA, e é ela que mata a piscada em série: trocar de nível reassa o céu
  // (o bake mais caro do jogo), e esse frame longo era lido como lentidão pela medição SEGUINTE, que subia
  // o nível de novo — a própria correção alimentava o gatilho. Sem isto a histerese não fecha.
  SEGURA_MS:1500,
};
/** Estado inicial da política (só números: dá para serializar e comparar em teste). */
export const qualidadeZero=()=>({lento:0,rapido:0,mudouAt:-1e9,desceuAt:-1e9,backoff:QUALITY.BACKOFF_MS});
/**
 * Um passo da política. Não muda `st` — devolve o novo.
 * @param {{lento:number,rapido:number,mudouAt:number,desceuAt:number,backoff:number}} st
 * @param {{now:number,ms:number,nivel:number}} e  now: relógio; ms: tempo real do frame; nivel: o atual
 * @returns {{st:typeof st,nivel:number}} `nivel` é o DESEJADO (igual ao atual = nada a fazer)
 */
export function passoQualidade(st,{now,ms,nivel}){
  const parado=(x={})=>({st:{...st,lento:0,rapido:0,...x},nivel});
  if(now-st.mudouAt<QUALITY.SEGURA_MS)return parado();
  if(ms>QUALITY.SLOW_MS){
    if(nivel>=QUALITY.MAX)return parado();
    const lento=st.lento||now;
    if(now-lento<=QUALITY.SOBE_MS)return{st:{...st,lento,rapido:0},nivel};
    const backoff=now-st.desceuAt<QUALITY.RECAI_MS?Math.min(QUALITY.BACKOFF_MAX,st.backoff*2):st.backoff;
    return{st:{...st,lento:0,rapido:0,backoff,mudouAt:now},nivel:nivel+1};}
  if(nivel<=0||ms>=QUALITY.FAST_MS)return parado();
  const rapido=st.rapido||now;
  if(now-rapido<=QUALITY.DESCE_MS||now-st.mudouAt<=st.backoff)return{st:{...st,lento:0,rapido},nivel};
  return{st:{...st,lento:0,rapido:0,mudouAt:now,desceuAt:now},nivel:nivel-1};}
