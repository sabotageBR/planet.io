// ── SOM: sintetizado no WebAudio, nenhum arquivo de áudio (ver docs/design/som.md e ./kit.js) ──
// Três camadas, cada uma no seu barramento:
//   sfx  efeitos disparados por evento (o `kind` do efeito visual é a chave da receita)
//   amb  contínuos: ambiência reativa, alerta de míssil, zumbido do ímã, carga do tiro
//   ui   telas React (cliques, loja, morte) — separado para nunca competir com o jogo
// Todos → master (volume) → DynamicsCompressor (evita estouro quando várias explosões coincidem) → saída.
// O contexto nasce no primeiro gesto do jogador (política de autoplay); o clique em JOGAR já serve.
// @ts-check
import {KIT,GAP,PRIO,ESCADA,ESCADA_RESET_MS} from "./kit.js";

const VOICES=24;            // vozes simultâneas (acima disso o som novo ROUBA a de menor prioridade)
const FAR=2600;             // distância (px de mundo) em que o som já não se ouve
const PAN=1400;             // meia-largura do estéreo: além disso o som vem 100% de um lado
const DUCK=.55;             // quanto o alerta abaixa os efeitos: um míssil na cabeça tem que furar a poeira

/** @type {ReturnType<createAudio>|null} */let atual=null;

export function createAudio(prefs={}){
  if(atual){atual.setPrefs(prefs);return atual;}
  let ctx=null,master=null,limiter=null,buses=null;
  let on=prefs.sound!==false,vol=(prefs.volume==null?70:prefs.volume)/100;
  let music=!!prefs.music,ambOn=prefs.ambience!==false;
  const ultimo=new Map();
  /** @type {{prio:number,src:any,g:any,out:any,morta:boolean}[]} */const vivas=[];
  const loops=new Map();
  let escadaN=0,escadaT=0;

  /** Cria o contexto (só no 1º gesto do usuário: navegador não deixa tocar antes). */
  function ensure(){
    if(ctx||typeof window==="undefined")return ctx;
    const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return null;
    ctx=new AC();
    limiter=ctx.createDynamicsCompressor();limiter.threshold.value=-10;limiter.knee.value=12;limiter.ratio.value=8;
    master=ctx.createGain();master.gain.value=vol;
    master.connect(limiter);limiter.connect(ctx.destination);
    const mk=v=>{const g=ctx.createGain();g.gain.value=v;g.connect(master);return g;};
    buses={sfx:mk(1),amb:mk(1),ui:mk(1)};
    startLoop("ambience");
    return ctx;}
  const noiseBuf=()=>{const n=Math.floor(ctx.sampleRate*1.6),b=ctx.createBuffer(1,n,ctx.sampleRate),d=b.getChannelData(0);
    let v=0;for(let i=0;i<n;i++){v=(v+(Math.random()*2-1)*.35)*.92;d[i]=v;}   // ruído meio "rosa": menos áspero que o branco puro
    return b;};
  let nb=null;
  const hz=v=>v<20?20:v>18000?18000:v;
  /** Uma voz da receita: oscilador ou ruído filtrado, com envelope e glide. Entra na lista de vozes vivas. */
  function voz(v,t0,gain,pan,bus,prio,pitch){
    const g=ctx.createGain(),atk=v.atk==null?.004:v.atk,dur=v.dur;
    g.gain.setValueAtTime(0,t0);g.gain.linearRampToValueAtTime((v.gain==null?.2:v.gain)*gain,t0+atk);
    g.gain.exponentialRampToValueAtTime(.0001,t0+dur);
    const f0=hz(v.f0*pitch),f1=v.f1?hz(v.f1*pitch):0;
    let src;
    if(v.t==="ruido"){if(!nb)nb=noiseBuf();
      src=ctx.createBufferSource();src.buffer=nb;src.loop=true;
      const f=ctx.createBiquadFilter();f.type="bandpass";f.frequency.setValueAtTime(f0,t0);
      if(f1)f.frequency.exponentialRampToValueAtTime(f1,t0+dur);
      f.Q.value=v.q==null?1:v.q;src.connect(f);f.connect(g);}
    else{src=ctx.createOscillator();src.type=v.type||"sine";src.frequency.setValueAtTime(f0,t0);
      if(f1)src.frequency.exponentialRampToValueAtTime(f1,t0+dur);
      src.connect(g);}
    let out=g;
    if(pan&&ctx.createStereoPanner){const p=ctx.createStereoPanner();p.pan.value=pan;g.connect(p);out=p;}
    out.connect(bus);
    src.start(t0);src.stop(t0+dur+.02);
    const rec={prio,src,g,out,morta:false};vivas.push(rec);
    src.onended=()=>{rec.morta=true;const i=vivas.indexOf(rec);if(i>=0)vivas.splice(i,1);
      try{g.disconnect();if(out!==g)out.disconnect();}catch{}};}
  /**
   * Abre vaga para uma voz de prioridade `prio`. Se o teto está cheio, mata a de MENOR prioridade — e só
   * desiste se nem a mais fraca vale menos que a nova. Antes o teto descartava sempre o som novo, então o
   * alerta ou a própria morte sumiam exatamente quando a tela estava cheia de poeira sendo comida.
   */
  function vaga(prio){
    if(vivas.length<VOICES)return true;
    let k=-1,pior=prio;
    for(let i=0;i<vivas.length;i++)if(vivas[i].prio<pior){pior=vivas[i].prio;k=i;}
    if(k<0)return false;
    const r=vivas[k];r.morta=true;vivas.splice(k,1);try{r.src.stop();}catch{}
    return true;}

  // ── contínuos ───────────────────────────────────────────────────────────
  // O motor só sabia tocar one-shots: `play()` agendava início E fim na hora e não devolvia nada, então não
  // havia como manter um som e mexer nele. Um bipe que acelera conforme o míssil chega não era expressável.
  // Aqui cada loop é um punhado de nós que ficam de pé, com um `set()` para mexer em intensidade/posição.
  const osc=(type,f,dest,g0)=>{const o=ctx.createOscillator(),g=ctx.createGain();o.type=type;o.frequency.value=f;
    g.gain.value=g0;o.connect(g);g.connect(dest);o.start();return{o,g};};
  const alvo=(p,v,t=.08)=>{try{p.setTargetAtTime(v,ctx.currentTime,t);}catch{p.value=v;}};

  function build(name){
    const out=ctx.createGain();out.gain.value=0;out.connect(buses.amb);
    if(name==="alert"){
      // bipe de dois tons cortado por um LFO quadrado: a FREQUÊNCIA do LFO é a cadência, e ela sobe com a
      // proximidade. Fica no barramento amb (fora do teto de vozes) — alerta não pode ser descartado.
      const pan=ctx.createStereoPanner?ctx.createStereoPanner():null;
      const gate=ctx.createGain();gate.gain.value=0;
      if(pan){gate.connect(pan);pan.connect(out);}else gate.connect(out);
      const lfo=ctx.createOscillator(),lg=ctx.createGain();lfo.type="square";lfo.frequency.value=3;lg.gain.value=.5;
      lfo.connect(lg);lg.connect(gate.gain);gate.gain.value=.5;   // 0..1 quadrado
      const a=osc("square",660,gate,.16),b=osc("square",990,gate,.07);
      lfo.start();
      return{out,pan,lfo,a,b,nodes:[a.o,b.o,lfo],
        set(o){const k=o.k==null?0:o.k;
          alvo(lfo.frequency,2+11*k,.05);alvo(a.o.frequency,620+560*k,.05);alvo(b.o.frequency,930+840*k,.05);
          alvo(out.gain,.16+.5*k,.06);if(pan&&o.pan!=null)alvo(pan.pan,o.pan,.06);}};}
    if(name==="magnet"){
      const a=osc("triangle",1180,out,.05),b=osc("triangle",1790,out,.03);
      const lfo=ctx.createOscillator(),lg=ctx.createGain();lfo.type="sine";lfo.frequency.value=5.5;lg.gain.value=.02;
      lfo.connect(lg);lg.connect(out.gain);lfo.start();
      return{out,nodes:[a.o,b.o,lfo],set(o){alvo(out.gain,(o.k==null?1:o.k)*.05,.12);}};}
    if(name==="aimCharge"){
      const f=ctx.createBiquadFilter();f.type="lowpass";f.frequency.value=500;f.Q.value=4;f.connect(out);
      const a=osc("sawtooth",180,f,.06),b=osc("sawtooth",181.5,f,.05);
      return{out,nodes:[a.o,b.o],set(o){const k=o.k==null?0:o.k;
        alvo(a.o.frequency,170+300*k,.06);alvo(b.o.frequency,171.4+302*k,.06);
        alvo(f.frequency,420+1900*k,.06);alvo(out.gain,.18+.35*k,.06);}};}
    // ambiência: três camadas que reagem ao estado da partida
    const pad=ctx.createGain();pad.gain.value=0;pad.connect(out);
    const dan=ctx.createGain();dan.gain.value=0;dan.connect(out);
    const rnd=ctx.createGain();rnd.gain.value=0;rnd.connect(out);
    const lfo=ctx.createOscillator(),lg=ctx.createGain();lfo.type="sine";lfo.frequency.value=.05;lg.gain.value=6;
    lfo.connect(lg);lfo.start();
    const p1=osc("sine",55,pad,.5),p2=osc("sine",82.5,pad,.34),p3=osc("sine",110.4,pad,.16);
    lg.connect(p1.o.frequency);lg.connect(p2.o.frequency);
    const df=ctx.createBiquadFilter();df.type="lowpass";df.frequency.value=220;df.Q.value=6;df.connect(dan);
    const d1=osc("sawtooth",68,df,.5),d2=osc("sawtooth",72.1,df,.4);   // batimento de 4 Hz: o "errado" que dá tensão
    const rg=ctx.createGain();rg.gain.value=0;rg.connect(rnd);
    const r1=osc("sine",147,rg,.5);
    const rl=ctx.createOscillator(),rlg=ctx.createGain();rl.type="square";rl.frequency.value=1;rlg.gain.value=.5;
    rl.connect(rlg);rlg.connect(rg.gain);rg.gain.value=.5;rl.start();
    out.gain.value=1;
    return{out,nodes:[p1.o,p2.o,p3.o,d1.o,d2.o,r1.o,lfo,rl],
      set(o){
        // pad: a fundamental DESCE conforme eu viro um gigante (0 = recém-nascido, 1 = no teto)
        const m=Math.min(1,Math.max(0,o.mass==null?0:o.mass)),base=55/(1+m);
        alvo(p1.o.frequency,base,.9);alvo(p2.o.frequency,base*1.5,.9);alvo(p3.o.frequency,base*2.008,.9);
        alvo(pad.gain,music?.075:0,.6);
        // perigo: sobe ao entrar no halo da estrela mais próxima
        const d=Math.min(1,Math.max(0,o.danger==null?0:o.danger));
        alvo(dan.gain,ambOn?d*.12:0,.35);alvo(df.frequency,200+520*d,.35);
        // rodada: pulso lento que acelera no fim
        const u=Math.min(1,Math.max(0,o.urgency==null?0:o.urgency));
        alvo(rl.frequency,.7+2.6*u,.4);alvo(rnd.gain,ambOn?u*.07:0,.4);}};}

  function startLoop(name,o=null){
    const c=ensure();if(!c||!on)return;
    let L=loops.get(name);
    if(!L){L=build(name);loops.set(name,L);}
    L.set(o||{});
    if(name==="alert")duck(true);}
  function setLoop(name,o){const L=loops.get(name);if(L)L.set(o);}
  function stopLoop(name){const L=loops.get(name);if(!L)return;loops.delete(name);
    try{alvo(L.out.gain,0,.05);}catch{}
    setTimeout(()=>{try{for(const n of L.nodes)n.stop();L.out.disconnect();}catch{}},260);
    if(name==="alert")duck(false);}
  /** O alerta abaixa os efeitos: sem isso ele se perde no meio da poeira e do tiroteio. */
  function duck(no){if(buses)alvo(buses.sfx.gain,no?DUCK:1,.12);}
  function stopLoops(){for(const n of[...loops.keys()])stopLoop(n);}

  const audio={
    /**
     * Retoma o contexto (1º clique/tecla, e a cada join). `resume()` é SEMPRE chamado, sem olhar o
     * `state`: suspend/resume são mensagens assíncronas, então logo depois de um `stop()` o estado ainda
     * lê "running" e a guarda antiga engolia o resume — o contexto ficava suspenso para sempre e todo
     * `play()` saía calado. Chamar em contexto já rodando é no-op.
     */
    resume(){const c=ensure();if(!c)return;try{c.resume();}catch{/* alguns navegadores rejeitam fora de gesto */}
      if(on&&!loops.has("ambience"))startLoop("ambience");},   // o stop() da troca de sala a derruba; aqui ela volta
    /** Liga/desliga, volume, música e ambiência vêm das preferências (Opções → Som). */
    setPrefs(p){if(!p)return;
      on=p.sound!==false;vol=(p.volume==null?70:p.volume)/100;
      if(master)master.gain.value=vol;
      music=!!p.music;ambOn=p.ambience!==false;
      if(!on)stopLoops();else if(ctx){startLoop("ambience");setLoop("ambience",{});}},
    /**
     * Toca um efeito. `x,y` (mundo) + `cam` posicionam; `mine` toca em volume cheio (é comigo).
     * `r` sobe um pouco o volume de eventos grandes (explosão de um planetão soa maior).
     * `pitch` afina a receita inteira (é assim que o tamanho vira som: o que é meu soa mais grave quanto
     * maior eu estou). `ladder` sobe a escala pentatônica a cada repetição em sequência (comer em fila).
     * `bus` escolhe a camada ("sfx" padrão, "ui" para as telas).
     */
    play(kind,{x=null,y=null,r=0,mine=false,cam=null,pitch=1,ladder=false,bus="sfx"}={}){
      if(!on)return;const rec=KIT[kind];if(!rec)return;
      const now=performance.now(),gap=GAP[kind];
      if(gap&&ultimo.get(kind)>now-gap)return;
      const prio=PRIO[kind]==null?1:PRIO[kind];
      const c=ensure();if(!c)return;
      if(c.state!=="running"){audio.resume();return;}   // suspenso: religa e perde SÓ este som, em vez de emudecer a partida
      if(!vaga(prio))return;
      let g=1,pan=0;
      if(!mine&&x!=null&&cam){const dx=x-cam.x,dy=y-cam.y,d=Math.hypot(dx,dy);
        if(d>FAR)return;
        g=1-d/FAR;g*=g;                                   // cai rápido com a distância
        pan=Math.max(-.8,Math.min(.8,dx/PAN));}
      if(r)g*=Math.min(1.6,1+r/260);                       // evento grande soa maior
      if(ladder){if(now-escadaT>ESCADA_RESET_MS)escadaN=0;escadaT=now;
        pitch*=ESCADA[escadaN];if(escadaN<ESCADA.length-1)escadaN++;}
      if(gap)ultimo.set(kind,now);   // só carimba quando o som SAI (antes o cooldown começava a contar em tentativa descartada)
      const t0=c.currentTime+.001,dest=buses[bus]||buses.sfx;
      for(const v of rec){const n=v.rep||1,at=v.at||0;
        for(let i=0;i<n;i++)voz(v,t0+at+i*(v.gap||.08),g,pan,dest,prio,pitch);}},
    /** Som de tela (menus, loja, morte): vai no barramento `ui`, nunca compete com o jogo. */
    ui(kind){audio.play(kind,{mine:true,bus:"ui"});},
    startLoop,setLoop,stopLoop,
    /** Estado interno (overlay ?stats e depuração). */
    get info(){return{contexto:ctx?ctx.state:"não criado",vozes:vivas.length,loops:[...loops.keys()],ligado:on,volume:vol,musica:music,ambiencia:ambOn};},
    /**
     * Solta os contínuos e zera a contagem de vozes (troca de sala/saída). NÃO suspende o contexto: `join()`
     * começa com um `leave()`, e suspender ali derrubava o som da partida inteira. O contador precisa ser
     * zerado porque as vozes agendadas e cortadas nunca disparam `onended` — sem isso ele só sobe e, ao
     * chegar em VOICES, `play()` para de tocar mesmo com o contexto saudável.
     */
    stop(){stopLoops();vivas.length=0;ultimo.clear();escadaN=0;duck(false);},
    /** Suspende de verdade (só ao destruir o jogo: libera o áudio do navegador). */
    suspend(){stopLoops();vivas.length=0;if(ctx&&ctx.state==="running")try{ctx.suspend();}catch{}},
  };
  atual=audio;return audio;}

/** Instância única (o jogo e as telas React dividem a mesma — o contexto do navegador é caro e um só basta). */
export const getAudio=()=>atual||createAudio();
/** Atalho para as telas: `sfx("uiClick")`. */
export const sfx=kind=>{const a=getAudio();a.resume();a.ui(kind);};
