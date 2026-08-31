// ── SOM: sintetizado no WebAudio, nenhum arquivo de áudio (ver docs/design/som.md e ./kit.js) ──
// Três camadas, cada uma no seu barramento:
//   sfx  efeitos disparados por evento (o `kind` do efeito visual é a chave da receita)
//   amb  contínuos: ambiência reativa, alerta de míssil, zumbido do ímã, carga do tiro
//   ui   telas React (cliques, loja, morte) — separado para nunca competir com o jogo
//   voz  clipes de push-to-talk de outros jogadores — o único som que NÃO é sintetizado aqui (chega em
//        µ-law pelo fio) e o único que não pode ser roubado pelo teto de vozes: perder a fala do
//        companheiro justo quando a tela enche é o pior momento possível para perdê-la
// Todos → master (volume) → DynamicsCompressor (evita estouro quando várias explosões coincidem) → saída.
// O contexto nasce no primeiro gesto do jogador (política de autoplay); o clique em JOGAR já serve.
// @ts-check
import {KIT,GAP,PRIO,ESCADA,ESCADA_RESET_MS} from "./kit.js";
import {muDecodeTo} from "./mic.js";
import {VOICE} from "@warspace/shared";

const VOICES=24;            // vozes simultâneas (acima disso o som novo ROUBA a de menor prioridade)
const FAR=2600;             // distância (px de mundo) em que o som já não se ouve
const PAN=1400;             // meia-largura do estéreo: além disso o som vem 100% de um lado
const DUCK=.55;             // quanto o alerta abaixa os efeitos: um míssil na cabeça tem que furar a poeira
// ⚠️ as duas eram USADAS em playVoice() e não existiam em lugar nenhum — nem aqui, nem no import.
// Toda chamada lançava ReferenceError, então NENHUM clipe de voz tocou desde que a voz existe.
const VOICE_HZ=VOICE.RATE_HZ;   // 8 kHz, o mesmo do µ-law que o mic.js grava
const VOICE_DUCK=.45;           // a voz abaixa os efeitos mais que o alerta: é ela que precisa ser entendida

/** @type {ReturnType<createAudio>|null} */let atual=null;

export function createAudio(prefs={}){
  if(atual){atual.setPrefs(prefs);return atual;}
  let ctx=null,master=null,limiter=null,buses=null;
  let on=prefs.sound!==false,vol=(prefs.volume==null?70:prefs.volume)/100;
  // MUDO: um multiplicador do master, e não um `on=false`. Zerar o `sound` apagaria a ESCOLHA do jogador
  // (voltar do mudo teria que adivinhar o que estava ligado antes) e não calaria a voz, que tem barramento
  // próprio. Aqui o master vai a zero e leva tudo junto — efeitos, ambiência, trilha, telas e voz.
  let muted=!!prefs.muted;
  // ANÚNCIO DE PORTAL: o mesmo mecanismo do mudo, e pelo mesmo motivo — a regra dos portais é "pausado e
  // MUDO durante o anúncio", e mexer em `prefs.muted` para isso seria escrever numa escolha do jogador que
  // é persistida no servidor e tem tecla própria: um travamento no meio do anúncio o deixaria mudo para
  // sempre, sem saber por quê. ⚠️ E `suspend()` não serve: `sfx()` chama `resume()` a cada clique de UI, o
  // `play()` religa o contexto quando o vê parado, e o `wakeAudio` do jogo está pendurado no `pointerdown`
  // da JANELA — um clique em cima do anúncio traria o som de volta por baixo dele. Daí a trava no resume.
  let anuncio=false;
  const masterVol=()=>(muted||anuncio)?0:vol;
  let music=!!prefs.music,ambOn=prefs.ambience!==false,voiceOn=prefs.voice!==false,voiceVol=(prefs.voiceVolume==null?85:prefs.voiceVolume)/100;
  let musicVol=(prefs.musicVolume==null?60:prefs.musicVolume)/100;
  let falando=0;   // quantos clipes de voz estão tocando (o duck só volta quando o último acaba)
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
    master=ctx.createGain();master.gain.value=masterVol();
    master.connect(limiter);limiter.connect(ctx.destination);
    const mk=v=>{const g=ctx.createGain();g.gain.value=v;g.connect(master);return g;};
    // 5º barramento: a MÚSICA. Ela ia pelo `amb` junto com a ambiência, e por isso (a) o interruptor de
    // ambiência e o de música compartilhavam cadeia e (b) o `duck()` do alerta de míssil abaixava os
    // efeitos e deixava a trilha por cima — justo o contrário do que se quer quando há um míssil vindo.
    buses={sfx:mk(1),amb:mk(1),ui:mk(1),voice:mk(1),music:mk(musicVol)};
    startLoop("ambience");
    if(music)startLoop("music");
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
    if(name==="music")return buildMusica(out);
    // ⚠️ Este bloco era o `else` IMPLÍCITO de build(): qualquer nome que não caísse nos `if` acima virava
    // a ambiência, sem erro. `startLoop("qualquer coisa")` criava uma SEGUNDA ambiência inteira tocando
    // por cima da primeira. Agora ele tem nome.
    if(name!=="ambience")return null;
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

  // ══ A TRILHA ═════════════════════════════════════════════════════════════════════════════════════
  // Peça ORIGINAL na linguagem do minimalismo sinfônico (o registro que Glass, Richter e Zimmer
  // compartilham): órgão de tubos, um ostinato de colcheias que nunca para, harmonia MODAL que gira em
  // vez de resolver, e forma por ACUMULAÇÃO — as camadas entram uma a uma e a peça cresce sem mudar de
  // assunto. Nada aqui é transcrição: o que se copia é a linguagem, não a melodia de ninguém.
  //
  // Três seções, escolhidas pelo estado do jogo:
  //   menu    → só o drone e o coral, sem pulso. É a tela parada.
  //   partida → entra o ostinato e a peça começa a andar.
  //   climax  → órgão cheio, sub, e o ostinato acelera. O fim da rodada e o círculo apertado.
  //
  // Lá (A) menor eólio: a tríade i–VI–III–VII, quatro compassos que voltam ao começo. A "cor Zimmer" é
  // o VI maior depois do i menor — o acorde que soa grande sem soar alegre.
  const MUS={
    RAIZ:55,                                  // Lá1: a fundamental do drone (o órgão de 16 pés)
    // graus da escala eólia em semitons, a partir da tônica
    ACORDES:[[0,3,7,12],[8,12,15,20],[3,7,10,15],[10,14,17,22]],   // i · VI · III · VII
    OSTINATO:[0,7,12,15,12,7,12,19],          // as oito colcheias que giram: a peça inteira anda em cima disto
    BPM:[52,66,84],                           // menu · partida · clímax — a métrica acelera com a tensão
    COMP_MS:0,                                // preenchido no build (ms por compasso)
    LOOK_MS:180,                              // quanto o agendador olha à frente
    TICK_MS:40,
  };
  const semi=n=>Math.pow(2,n/12);

  /** Um "tubo" de órgão: onda + filtro suave + envelope longo. É a voz de toda a trilha. */
  function tubo(dest,tipo,freq,t0,dur,gain,atk){
    const o=ctx.createOscillator(),g=ctx.createGain();
    o.type=tipo;o.frequency.setValueAtTime(hz(freq),t0);
    g.gain.setValueAtTime(0,t0);
    g.gain.linearRampToValueAtTime(gain,t0+atk);
    g.gain.setTargetAtTime(0,t0+dur*.55,dur*.28);          // cauda longa: órgão não corta, decai na sala
    o.connect(g);g.connect(dest);
    o.start(t0);o.stop(t0+dur+.6);
    return o;
  }

  /**
   * A trilha. Um agendador look-ahead (o padrão do WebAudio: um timer impreciso que agenda notas em
   * tempo PRECISO de `ctx.currentTime`, sempre um pouco à frente) — o motor não tinha relógio musical
   * nenhum, só `setTargetAtTime` e `start(t0)` absolutos.
   * ⚠️ As notas chamam `tubo()` direto, e não `play()`: passar pelo teto de 24 vozes faria a trilha
   * competir com os efeitos e ser roubada no meio de um compasso.
   */
  function buildMusica(out){
    out.gain.value=1;out.disconnect();out.connect(buses.music);   // trilha tem barramento próprio
    // três destinos com filtro próprio, para cada camada ter timbre e não só volume
    const gDrone=ctx.createGain(),gCoral=ctx.createGain(),gOst=ctx.createGain(),gSub=ctx.createGain();
    const fCoral=ctx.createBiquadFilter();fCoral.type="lowpass";fCoral.frequency.value=1200;fCoral.Q.value=.7;
    const fOst=ctx.createBiquadFilter();fOst.type="bandpass";fOst.frequency.value=900;fOst.Q.value=.9;
    gDrone.gain.value=0;gCoral.gain.value=0;gOst.gain.value=0;gSub.gain.value=0;
    gDrone.connect(out);gCoral.connect(fCoral);fCoral.connect(out);gOst.connect(fOst);fOst.connect(out);gSub.connect(out);
    // o drone é contínuo: dois osciladores levemente desafinados (o batimento é o que dá "sala")
    const d1=ctx.createOscillator(),d2=ctx.createOscillator(),dg=ctx.createGain();
    d1.type="sine";d2.type="sine";d1.frequency.value=MUS.RAIZ;d2.frequency.value=MUS.RAIZ*1.004;
    dg.gain.value=.5;d1.connect(dg);d2.connect(dg);dg.connect(gDrone);d1.start();d2.start();
    const s1=ctx.createOscillator();s1.type="sine";s1.frequency.value=MUS.RAIZ/2;s1.connect(gSub);s1.start();

    let secao=0,inten=0,timer=null,prox=0,compasso=0;
    const bpm=()=>MUS.BPM[secao],semicolcheia=()=>60/bpm()/2;   // colcheia = meia batida

    /** Agenda tudo o que cabe na janela de look-ahead. Roda a cada TICK_MS. */
    function agenda(){
      const agora=ctx.currentTime,ate=agora+MUS.LOOK_MS/1000;
      if(prox<agora)prox=agora+.05;                            // voltou do segundo plano: reancora
      const col=semicolcheia();
      while(prox<ate){
        const passo=compasso%8, acorde=MUS.ACORDES[(compasso>>3)%4];
        // ── coral: o acorde inteiro, uma vez por compasso, com ataque lento (é o "órgão")
        if(passo===0){
          const dur=col*8;
          for(let i=0;i<acorde.length;i++)
            tubo(gCoral,"triangle",MUS.RAIZ*2*semi(acorde[i]),prox,dur,.13/(1+i*.35),dur*.22);
          // 5ª grave dobrando a fundamental: o que faz soar GRANDE sem soar mais alto
          tubo(gSub,"sine",MUS.RAIZ*semi(acorde[0]),prox,dur,.16,dur*.3);
        }
        // ── ostinato: uma colcheia por passo. É o motor da peça — e no menu ele não existe, então não
        // se agenda: com o ganho em zero as notas continuavam sendo criadas, oito osciladores mudos por
        // compasso, para sempre, na tela onde o jogo está parado.
        if(secao>0){const n=MUS.OSTINATO[passo]+acorde[0];
          tubo(gOst,"square",MUS.RAIZ*4*semi(n),prox,col*.92,.05,.012);}
        prox+=col;compasso++;
      }
    }
    function liga(){if(!timer)timer=setInterval(agenda,MUS.TICK_MS);}
    function desliga(){if(timer){clearInterval(timer);timer=null;}}

    return{out,nodes:[d1,d2,s1],
      /**
       * `intensity` 0..1 é o único controle: ele escolhe a seção e acende as camadas. Vem do mesmo
       * lugar que já alimenta a ambiência (massa, perigo, relógio da rodada) — a trilha não precisa
       * saber o que está acontecendo, só o quanto está acontecendo.
       */
      set(o){
        if(o.intensity!=null)inten=Math.min(1,Math.max(0,o.intensity));
        if(o.section!=null)secao=Math.min(2,Math.max(0,o.section|0));
        else secao=inten<.12?0:inten<.62?1:2;
        const k=inten;
        alvo(gDrone.gain,.20+.10*k,1.2);                       // sempre presente: é o chão da peça
        alvo(gCoral.gain,k<.05?.10:.16+.34*k,1.2);             // o acorde entra cedo e engrossa
        alvo(gOst.gain,secao===0?0:Math.min(1,(k-.12)/.5)*.85,.9);   // o pulso só existe fora do menu
        alvo(gSub.gain,k<.6?0:(k-.6)/.4*.5,1.4);               // o sub é do clímax
        alvo(fCoral.frequency,900+2600*k,1.0);                 // abre o brilho junto com a intensidade
        // ⚠️ o agendador roda SEMPRE que a trilha existe, inclusive no menu: é ele que toca o coral, e
        // desligá-lo lá deixava a seção "menu" com o drone sozinho — um zumbido de 55 Hz, não uma peça.
        // O que muda no menu é o ostinato ficar mudo (acima), não o relógio parar.
        liga();
      },
      stop(){desliga();}};
  }

  function startLoop(name,o=null){
    const c=ensure();if(!c||!on)return;
    let L=loops.get(name);
    if(!L){L=build(name);if(!L)return;loops.set(name,L);}
    L.set(o||{});
    if(name==="alert")duck(true);}
  function setLoop(name,o){const L=loops.get(name);if(L)L.set(o);}
  function stopLoop(name){const L=loops.get(name);if(!L)return;loops.delete(name);
    try{alvo(L.out.gain,0,.05);}catch{}
    // ⚠️ a trilha tem um `setInterval` de agendamento; sem `L.stop()` ele continuaria vivo depois do
    // `stopLoops()` de toda troca de sala, agendando notas em nós já desconectados até a página fechar.
    try{if(L.stop)L.stop();}catch{}
    setTimeout(()=>{try{for(const n of L.nodes)n.stop();L.out.disconnect();}catch{}},260);
    if(name==="alert")duck(false);}
  /** O alerta abaixa os efeitos: sem isso ele se perde no meio da poeira e do tiroteio. */
  function duck(no){if(!buses)return;alvo(buses.sfx.gain,no?DUCK:1,.12);
    // a trilha desce MAIS que os efeitos: o alerta tem que furar a música, não competir com ela
    alvo(buses.music.gain,(no?DUCK*.6:1)*musicVol,.12);}
  function stopLoops(){for(const n of[...loops.keys()])stopLoop(n);}

  const audio={
    /**
     * Retoma o contexto (1º clique/tecla, e a cada join). `resume()` é SEMPRE chamado, sem olhar o
     * `state`: suspend/resume são mensagens assíncronas, então logo depois de um `stop()` o estado ainda
     * lê "running" e a guarda antiga engolia o resume — o contexto ficava suspenso para sempre e todo
     * `play()` saía calado. Chamar em contexto já rodando é no-op.
     */
    resume(){if(anuncio)return;   // durante um anúncio de portal, ninguém religa o som por baixo dele
      const c=ensure();if(!c)return;try{c.resume();}catch{/* alguns navegadores rejeitam fora de gesto */}
      // o stop() da troca de sala derruba os contínuos; aqui eles voltam. A trilha precisa da MESMA
      // cortesia que a ambiência — sem esta linha ela sumia na primeira troca de sala e não voltava mais.
      if(on&&!loops.has("ambience"))startLoop("ambience");
      if(on&&music&&!loops.has("music"))startLoop("music");},
    /** Liga/desliga, volume, música e ambiência vêm das preferências (Opções → Som). */
    setPrefs(p){if(!p)return;
      on=p.sound!==false;vol=(p.volume==null?70:p.volume)/100;muted=!!p.muted;
      if(master)master.gain.value=masterVol();
      music=!!p.music;ambOn=p.ambience!==false;voiceOn=p.voice!==false;voiceVol=(p.voiceVolume==null?85:p.voiceVolume)/100;
      musicVol=(p.musicVolume==null?60:p.musicVolume)/100;
      if(buses){buses.voice.gain.value=voiceVol;buses.music.gain.value=musicVol;}
      if(!on){stopLoops();return;}
      if(!ctx)return;
      startLoop("ambience");setLoop("ambience",{});
      // desligar a música é PARAR a trilha, não zerar o ganho: um agendador rodando em silêncio é
      // trabalho por frame que ninguém ouve.
      if(music){startLoop("music");setLoop("music",{});}else stopLoop("music");},
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
    /** O contexto (o microfone grava no MESMO: dois AudioContext custam caro e brigam pelo dispositivo). */
    ctx(){return ensure();},
    /**
     * Clipe de voz de outro jogador. Reusa LITERALMENTE o cálculo de posição do `play()` (ganho pelo
     * quadrado da distância até FAR, pan por dx/PAN) e vai no barramento `voice`, fora do teto de vozes —
     * como o alerta, pelo mesmo motivo. `mine` = companheiro de equipe: volume cheio, venha de onde vier.
     * @param {Uint8Array} data µ-law @param {number} codec 0 = µ-law 8 kHz
     */
    playVoice(data,codec,{x=null,y=null,cam=null,mine=false}={}){
      if(!on||!voiceOn||codec!==0||!data||!data.length)return false;
      const c=ensure();if(!c)return false;
      if(c.state!=="running"){audio.resume();return false;}
      let g=1,pan=0;
      if(!mine&&x!=null&&cam){const dx=x-cam.x,dy=y-cam.y,d=Math.hypot(dx,dy);
        if(d>FAR)return false;
        g=1-d/FAR;g*=g;
        pan=Math.max(-.8,Math.min(.8,dx/PAN));}
      const buf=c.createBuffer(1,data.length,VOICE_HZ);   // 8 kHz: o navegador reamostra na hora de tocar
      muDecodeTo(data,buf.getChannelData(0));
      const srcN=c.createBufferSource();srcN.buffer=buf;
      const gn=c.createGain();gn.gain.value=g;
      let out=gn;
      if(pan&&c.createStereoPanner){const pn=c.createStereoPanner();pn.pan.value=pan;gn.connect(pn);out=pn;}
      srcN.connect(gn);out.connect(buses.voice);
      falando++;if(falando===1)alvo(buses.sfx.gain,VOICE_DUCK,.1);
      srcN.onended=()=>{falando--;if(falando<=0){falando=0;alvo(buses.sfx.gain,1,.2);}try{gn.disconnect();if(out!==gn)out.disconnect();}catch{}};
      srcN.start();
      return true;},
    startLoop,setLoop,stopLoop,
    /** Estado interno (overlay ?stats e depuração). */
    get info(){return{contexto:ctx?ctx.state:"não criado",vozes:vivas.length,loops:[...loops.keys()],ligado:on,volume:vol,musica:music,ambiencia:ambOn,voz:voiceOn,falando};},
    /**
     * Solta os contínuos e zera a contagem de vozes (troca de sala/saída). NÃO suspende o contexto: `join()`
     * começa com um `leave()`, e suspender ali derrubava o som da partida inteira. O contador precisa ser
     * zerado porque as vozes agendadas e cortadas nunca disparam `onended` — sem isso ele só sobe e, ao
     * chegar em VOICES, `play()` para de tocar mesmo com o contexto saudável.
     */
    stop(){stopLoops();vivas.length=0;ultimo.clear();escadaN=0;duck(false);falando=0;if(buses)alvo(buses.sfx.gain,1,.1);},
    /** Suspende de verdade (só ao destruir o jogo: libera o áudio do navegador). */
    suspend(){stopLoops();vivas.length=0;if(ctx&&ctx.state==="running")try{ctx.suspend();}catch{}},
    /** Silêncio enquanto o anúncio do portal roda. Não toca em preferência nenhuma (ver `anuncio`). */
    mudoDeAnuncio(on){const v=!!on;if(v===anuncio)return;anuncio=v;
      if(v)stopLoops();
      if(master)master.gain.value=masterVol();
      if(!v)audio.resume();},
  };
  atual=audio;return audio;}

/** Instância única (o jogo e as telas React dividem a mesma — o contexto do navegador é caro e um só basta). */
export const getAudio=()=>atual||createAudio();
/** Atalho para as telas: `sfx("uiClick")`. */
export const sfx=kind=>{const a=getAudio();a.resume();a.ui(kind);};
/** Cala tudo enquanto um anúncio de portal roda, e devolve o som depois. Ver `createAudio`. */
export const silenciaAnuncio=on=>{try{getAudio().mudoDeAnuncio(on);}catch{/* silêncio nunca derruba o jogo */}};
