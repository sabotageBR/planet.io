// ── SOM: tudo sintetizado no WebAudio, nenhum arquivo ──────────────────────────
// O projeto inteiro é procedural (as texturas são desenhadas, não são imagens) e o som segue a mesma ideia:
// cada efeito é montado com osciladores + ruído filtrado + envelope. Não há bytes para baixar, o som toca no
// mesmo frame do evento e dá para afinar qualquer efeito mexendo nos números de KIT.
//
// Uso:  const audio=createAudio(prefs); audio.resume() no 1º gesto; audio.play("boom",{x,y,r,mine}).
// Espaço: `x,y` (mundo) + a câmera dão volume por distância e um pouco de estéreo — o que acontece longe
// soa mais baixo e do lado certo. Sem posição, o som é "meu" (volume cheio, centro).
// Cortes: no máximo VOICES sons ao mesmo tempo e um intervalo mínimo por tipo (senão comer 20 grãos vira metralhadora).

const VOICES=14;            // vozes simultâneas (acima disso o som novo é descartado)
const FAR=2600;             // distância (px de mundo) em que o som já não se ouve
const PAN=1400;             // meia-largura do estéreo: além disso o som vem 100% de um lado

/** @typedef {{t?:string,f0:number,f1?:number,dur:number,gain?:number,atk?:number,type?:string,q?:number,noise?:number,sub?:number,rep?:number,gap?:number}} Voz */
// ── receitas ── t: "tom" (oscilador) ou "ruido" (branco filtrado). f0→f1: glide. sub: oscilador grave junto.
/** @type {Record<string,Voz[]>} */
const KIT={
  food:      [{t:"tom",type:"triangle",f0:820,f1:1180,dur:.05,gain:.16}],                                  // grão: blip curtinho
  ammo:      [{t:"tom",type:"square",f0:660,f1:990,dur:.07,gain:.18,rep:2,gap:.07}],
  powerup:   [{t:"tom",type:"triangle",f0:520,f1:780,dur:.1,gain:.22,rep:3,gap:.08}],                      // arpejo subindo
  merge:     [{t:"tom",type:"sine",f0:300,f1:520,dur:.16,gain:.24}],
  eat:       [{t:"tom",type:"sine",f0:440,f1:150,dur:.2,gain:.32},{t:"ruido",f0:900,dur:.12,gain:.14,q:1}], // "nhac"
  split:     [{t:"ruido",f0:700,f1:2200,dur:.16,gain:.2,q:3},{t:"tom",type:"sine",f0:220,f1:420,dur:.12,gain:.14}],
  fire:      [{t:"ruido",f0:1200,f1:2600,dur:.14,gain:.18,q:4},{t:"tom",type:"sawtooth",f0:520,f1:900,dur:.1,gain:.1}],
  bounce:    [{t:"tom",type:"triangle",f0:240,f1:170,dur:.07,gain:.2}],
  chip:      [{t:"ruido",f0:2600,dur:.05,gain:.16,q:1}],
  shoot:     [{t:"tom",type:"square",f0:400,f1:120,dur:.14,gain:.16}],
  deflect:   [{t:"tom",type:"square",f0:900,f1:1500,dur:.08,gain:.16}],
  clash:     [{t:"ruido",f0:3200,dur:.12,gain:.2,q:6},{t:"tom",type:"square",f0:1500,f1:900,dur:.09,gain:.12}],
  boom:      [{t:"ruido",f0:420,dur:.34,gain:.34,q:.7},{t:"tom",type:"sine",f0:150,f1:44,dur:.3,gain:.3}],
  pop:       [{t:"ruido",f0:800,dur:.22,gain:.28,q:.9},{t:"tom",type:"sawtooth",f0:300,f1:90,dur:.18,gain:.18}],
  suck:      [{t:"tom",type:"sine",f0:560,f1:52,dur:.55,gain:.3},{t:"ruido",f0:300,dur:.5,gain:.14,q:.6}],   // espaguetificação: descida longa
  exit:      [{t:"tom",type:"sine",f0:90,f1:680,dur:.3,gain:.26},{t:"ruido",f0:1400,dur:.2,gain:.12,q:2}],
  shieldUp:  [{t:"tom",type:"triangle",f0:600,f1:900,dur:.12,gain:.22,rep:3,gap:.09}],
  shieldHit: [{t:"tom",type:"square",f0:1400,f1:1100,dur:.09,gain:.18},{t:"ruido",f0:2400,dur:.07,gain:.1,q:3}],
  shieldBreak:[{t:"ruido",f0:2800,dur:.3,gain:.26,q:2},{t:"tom",type:"square",f0:1200,f1:300,dur:.22,gain:.16}],
  starBurst: [{t:"ruido",f0:1500,dur:.3,gain:.3,q:1.2},{t:"tom",type:"sawtooth",f0:700,f1:180,dur:.25,gain:.2}],
  starHit:   [{t:"tom",type:"square",f0:800,f1:520,dur:.1,gain:.16}],
  starSplit: [{t:"ruido",f0:1100,dur:.35,gain:.28,q:1},{t:"tom",type:"sawtooth",f0:420,f1:140,dur:.3,gain:.2}],
  smash:     [{t:"ruido",f0:520,dur:.28,gain:.32,q:.8},{t:"tom",type:"square",f0:260,f1:70,dur:.22,gain:.22},   // pedrada: rocha estourando + o rasgo da estrela rachando junto
              {t:"ruido",f0:2200,dur:.14,gain:.14,q:3}],
  supernova: [{t:"ruido",f0:600,dur:1.1,gain:.42,q:.5},{t:"tom",type:"sine",f0:200,f1:28,dur:1,gain:.38},
              {t:"tom",type:"sawtooth",f0:900,f1:120,dur:.5,gain:.16}],
  death:     [{t:"tom",type:"sine",f0:400,f1:60,dur:.8,gain:.34},{t:"ruido",f0:500,dur:.5,gain:.16,q:.8}],
  countdown: [{t:"tom",type:"square",f0:880,dur:.09,gain:.24}],
  bigCrunch: [{t:"ruido",f0:300,dur:1.6,gain:.4,q:.4},{t:"tom",type:"sine",f0:120,f1:20,dur:1.5,gain:.4}],
  join:      [{t:"tom",type:"triangle",f0:400,f1:800,dur:.14,gain:.2,rep:2,gap:.1}],
};
// intervalo mínimo por tipo (ms): o que acontece muito não pode empilhar
const GAP={food:45,chip:70,bounce:60,starHit:80,shieldHit:70,deflect:70,ammo:120,countdown:200,smash:150};

export function createAudio(prefs={}){
  let ctx=null,master=null,limiter=null,vozes=0,musicNodes=null;
  let on=prefs.sound!==false,vol=(prefs.volume==null?70:prefs.volume)/100,music=!!prefs.music;
  const ultimo=new Map();
  /** Cria o contexto (só no 1º gesto do usuário: navegador não deixa tocar antes). */
  function ensure(){
    if(ctx||typeof window==="undefined")return ctx;
    const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return null;
    ctx=new AC();
    limiter=ctx.createDynamicsCompressor();limiter.threshold.value=-10;limiter.knee.value=12;limiter.ratio.value=8;
    master=ctx.createGain();master.gain.value=vol;
    master.connect(limiter);limiter.connect(ctx.destination);
    if(music)startMusic();
    return ctx;}
  const noiseBuf=()=>{const n=Math.floor(ctx.sampleRate*1.6),b=ctx.createBuffer(1,n,ctx.sampleRate),d=b.getChannelData(0);
    let v=0;for(let i=0;i<n;i++){v=(v+(Math.random()*2-1)*.35)*.92;d[i]=v;}   // ruído meio "rosa": menos áspero que o branco puro
    return b;};
  let nb=null;
  /** Uma voz da receita: oscilador ou ruído filtrado, com envelope e glide. */
  function voz(v,t0,gain,pan){
    const g=ctx.createGain(),atk=v.atk==null?.004:v.atk,dur=v.dur;
    g.gain.setValueAtTime(0,t0);g.gain.linearRampToValueAtTime((v.gain==null?.2:v.gain)*gain,t0+atk);
    g.gain.exponentialRampToValueAtTime(.0001,t0+dur);
    let src;
    if(v.t==="ruido"){if(!nb)nb=noiseBuf();
      src=ctx.createBufferSource();src.buffer=nb;src.loop=true;
      const f=ctx.createBiquadFilter();f.type="bandpass";f.frequency.setValueAtTime(v.f0,t0);
      if(v.f1)f.frequency.exponentialRampToValueAtTime(v.f1,t0+dur);
      f.Q.value=v.q==null?1:v.q;src.connect(f);f.connect(g);}
    else{src=ctx.createOscillator();src.type=v.type||"sine";src.frequency.setValueAtTime(v.f0,t0);
      if(v.f1)src.frequency.exponentialRampToValueAtTime(Math.max(20,v.f1),t0+dur);
      src.connect(g);}
    let out=g;
    if(pan&&ctx.createStereoPanner){const p=ctx.createStereoPanner();p.pan.value=pan;g.connect(p);out=p;}
    out.connect(master);
    src.start(t0);src.stop(t0+dur+.02);
    vozes++;src.onended=()=>{vozes--;try{g.disconnect();if(out!==g)out.disconnect();}catch{}};}
  // ── música: um drone lento de duas vozes (fica atrás de tudo; a preferência vem desligada) ──
  function startMusic(){
    if(!ctx||musicNodes)return;
    const g=ctx.createGain();g.gain.value=.055;g.connect(master);
    const lfo=ctx.createOscillator(),lg=ctx.createGain();lfo.frequency.value=.05;lg.gain.value=6;lfo.connect(lg);
    const osc=[];for(const f of [55,82.5]){const o=ctx.createOscillator();o.type="sine";o.frequency.value=f;lg.connect(o.frequency);o.connect(g);o.start();osc.push(o);}
    lfo.start();musicNodes={g,osc,lfo};}
  function stopMusic(){if(!musicNodes)return;const{g,osc,lfo}=musicNodes;musicNodes=null;
    try{for(const o of osc)o.stop();lfo.stop();g.disconnect();}catch{}}

  const audio={
    /**
     * Retoma o contexto (1º clique/tecla, e a cada join). `resume()` é SEMPRE chamado, sem olhar o
     * `state`: suspend/resume são mensagens assíncronas, então logo depois de um `stop()` o estado ainda
     * lê "running" e a guarda antiga engolia o resume — o contexto ficava suspenso para sempre e todo
     * `play()` saía calado. Chamar em contexto já rodando é no-op.
     */
    resume(){const c=ensure();if(c)try{c.resume();}catch{/* alguns navegadores rejeitam fora de gesto */}},
    /** Liga/desliga e volume vêm das preferências (Opções → Som). */
    setPrefs(p){if(!p)return;
      on=p.sound!==false;vol=(p.volume==null?70:p.volume)/100;
      if(master)master.gain.value=vol;
      if(!!p.music!==music){music=!!p.music;if(music)startMusic();else stopMusic();}},
    /**
     * Toca um efeito. `x,y` (mundo) + `cam` posicionam; `mine` toca em volume cheio (é comigo).
     * `r` sobe um pouco o volume de eventos grandes (explosão de um planetão soa maior).
     */
    play(kind,{x=null,y=null,r=0,mine=false,cam=null}={}){
      if(!on)return;const rec=KIT[kind];if(!rec)return;
      const now=performance.now(),gap=GAP[kind];
      if(gap&&ultimo.get(kind)>now-gap)return;
      if(vozes>=VOICES)return;
      const c=ensure();if(!c)return;
      if(c.state!=="running"){audio.resume();return;}   // suspenso: religa e perde SÓ este som, em vez de emudecer a partida
      let g=1,pan=0;
      if(!mine&&x!=null&&cam){const dx=x-cam.x,dy=y-cam.y,d=Math.hypot(dx,dy);
        if(d>FAR)return;
        g=1-d/FAR;g*=g;                                   // cai rápido com a distância
        pan=Math.max(-.8,Math.min(.8,dx/PAN));}
      if(r)g*=Math.min(1.6,1+r/260);                       // evento grande soa maior
      if(gap)ultimo.set(kind,now);   // só carimba quando o som SAI (antes o cooldown começava a contar em tentativa descartada)
      const t0=c.currentTime+.001;
      for(const v of rec){const n=v.rep||1;
        for(let i=0;i<n;i++)voz(v,t0+i*(v.gap||.08),g,pan);}},
    /** Estado interno (overlay ?stats e depuração). */
    get info(){return{contexto:ctx?ctx.state:"não criado",vozes,ligado:on,volume:vol,musica:music};},
    /**
     * Solta a música e zera a contagem de vozes (troca de sala/saída). NÃO suspende o contexto: `join()`
     * começa com um `leave()`, e suspender ali derrubava o som da partida inteira. O contador precisa ser
     * zerado porque as vozes agendadas e cortadas nunca disparam `onended` — sem isso ele só sobe e, ao
     * chegar em VOICES, `play()` para de tocar mesmo com o contexto saudável.
     */
    stop(){stopMusic();vozes=0;ultimo.clear();},
    /** Suspende de verdade (só ao destruir o jogo: libera o áudio do navegador). */
    suspend(){stopMusic();vozes=0;if(ctx&&ctx.state==="running")try{ctx.suspend();}catch{}},
  };
  return audio;}
