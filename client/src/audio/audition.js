// ── ?sfx — MESA DE SOM: toca cada receita e deixa mexer nos números sem recarregar ───────────────
// Existe para uma coisa só: aprovar o pacote de som DE OUVIDO. Lista todo o KIT com um botão por som,
// os contínuos (alerta, ímã, carga da mira, ambiência) com controle de intensidade, e os dois eixos que
// mais mudam a sensação — `pitch` (o tamanho virando som) e a escada da sequência de grãos.
// Os ajustes valem só na página: o que ficar bom volta como números em ./kit.js.
// Nada disto entra no jogo — o painel só monta com ?sfx na URL.
import {KIT} from "./kit.js";
import {getAudio} from "./index.js";

const GRUPOS=[
  ["Comer e crescer",["food","eat","grow","merge","mergeReady"]],
  ["Mover-se",       ["split","eject","bounce"]],
  ["Coletar",        ["ammo","powerup","shieldUp"]],
  ["Arma",           ["fire","lock","cancel","ready","shoot","deflect","clash"]],
  ["Apanhar",        ["boom","pop","chip","hurt","shieldHit","shieldBreak"]],
  ["Estrelas",       ["starBurst","starHit","starSplit","smash","supernova"]],
  ["Buraco negro",   ["suck","exit"]],
  ["Vida e rodada",  ["death","respawn","countdown","bigCrunch","join"]],
  ["Telas",          ["uiHover","uiClick","uiOpen","uiClose","buy","equip","error","toast","deadScreen","podium"]],
];
const LOOPS=[["alert","alerta de míssil"],["magnet","ímã ligado"],["aimCharge","carga da mira"]];

const CSS=`
#sfx{position:fixed;inset:0;z-index:9999;overflow:auto;background:#0d0b1a;color:#ffeec2;
  font:13px/1.45 'Trebuchet MS',Verdana,sans-serif;padding:18px 20px 60px}
#sfx h1{font-size:19px;margin:0 0 2px;letter-spacing:.5px}
#sfx p.sub{opacity:.62;margin:0 0 16px;max-width:70ch}
#sfx h2{font-size:12px;letter-spacing:1.6px;text-transform:uppercase;opacity:.5;margin:20px 0 8px;font-weight:700}
#sfx .row{display:flex;flex-wrap:wrap;gap:7px}
#sfx button{background:#1e1938;color:#ffeec2;border:1px solid #3b3363;border-radius:8px;
  padding:7px 12px;cursor:pointer;font:inherit;min-width:104px;text-align:left}
#sfx button:hover{background:#2b2450;border-color:#6b5bb0}
#sfx button b{display:block;font-size:12px}
#sfx button i{opacity:.45;font-style:normal;font-size:10px}
#sfx .painel{position:sticky;top:0;background:#0d0b1ae6;backdrop-filter:blur(6px);padding:10px 0 12px;
  border-bottom:1px solid #2a2350;margin-bottom:6px;z-index:2}
#sfx .ctl{display:flex;align-items:center;gap:9px;margin:5px 0}
#sfx .ctl label{width:132px;opacity:.7;font-size:11px;letter-spacing:.4px}
#sfx .ctl input[type=range]{width:230px}
#sfx .ctl output{width:52px;opacity:.85;font-variant-numeric:tabular-nums}
#sfx .loop{display:flex;align-items:center;gap:9px;margin:5px 0}
#sfx .loop .nome{width:132px;font-size:11px;letter-spacing:.4px;opacity:.7}
#sfx .on{background:#4a2c1e;border-color:#ff8a3d}
#sfx .dica{opacity:.45;font-size:11px;margin-top:22px;max-width:80ch}
`;

/** Monta a mesa de som (só com ?sfx). Devolve o nó, ou null se a flag não está na URL. */
export function mountAudition(){
  const a=getAudio();a.resume();
  const el=document.createElement("div");el.id="sfx";
  const st=document.createElement("style");st.textContent=CSS;el.appendChild(st);
  const h=(tag,txt,cls)=>{const n=document.createElement(tag);if(txt!=null)n.textContent=txt;if(cls)n.className=cls;return n;};

  el.appendChild(h("h1","Mesa de som — planet.io"));
  el.appendChild(h("p","Cada botão toca uma receita de ./kit.js. `pitch` é o eixo que carrega o pacote: tudo que é MEU "
    +"soa mais grave quanto maior eu estou (no jogo ele sai de 1,0 no recém-nascido a ~0,48 no gigante). "
    +"A escada faz a sequência de grãos subir de nota e resetar na pausa — clique em `food` várias vezes seguidas.","sub"));

  // ── painel fixo: pitch, volume, escada e os contínuos ──
  const painel=h("div",null,"painel");
  let pitch=1,ladder=false;
  const slider=(rot,min,max,val,step,fn)=>{
    const l=h("div",null,"ctl");l.appendChild(h("label",rot));
    const i=document.createElement("input");i.type="range";i.min=min;i.max=max;i.value=val;i.step=step;
    const o=document.createElement("output");o.textContent=(+val).toFixed(2);
    i.oninput=()=>{o.textContent=(+i.value).toFixed(2);fn(+i.value);};
    l.appendChild(i);l.appendChild(o);painel.appendChild(l);return i;};
  slider("pitch (tamanho)",.4,1.6,1,.01,v=>{pitch=v;});
  slider("volume",0,1,.7,.01,v=>a.setPrefs({sound:true,volume:v*100,music:musicOn,ambience:true}));
  const esc=h("button","escada da sequência: off");esc.onclick=()=>{ladder=!ladder;
    esc.textContent="escada da sequência: "+(ladder?"ON":"off");esc.classList.toggle("on",ladder);};
  const linha=h("div",null,"row");linha.appendChild(esc);
  let musicOn=false;
  const mus=h("button","música (pad): off");mus.onclick=()=>{musicOn=!musicOn;
    mus.textContent="música (pad): "+(musicOn?"ON":"off");mus.classList.toggle("on",musicOn);
    a.setPrefs({sound:true,volume:70,music:musicOn,ambience:true});};
  linha.appendChild(mus);painel.appendChild(linha);
  el.appendChild(painel);

  // ── contínuos ──
  el.appendChild(h("h2","Contínuos (o alerta do míssil é o do item 4)"));
  for(const [nome,desc] of LOOPS){
    const l=h("div",null,"loop");l.appendChild(h("span",`${nome} — ${desc}`,"nome"));
    let ligado=false;
    const b=h("button","tocar");
    const i=document.createElement("input");i.type="range";i.min=0;i.max=1;i.step=.01;i.value=0;i.style.width="230px";
    const o=document.createElement("output");o.textContent="0.00";
    i.oninput=()=>{o.textContent=(+i.value).toFixed(2);if(ligado)a.setLoop(nome,{k:+i.value,pan:0});};
    b.onclick=()=>{ligado=!ligado;b.textContent=ligado?"parar":"tocar";b.classList.toggle("on",ligado);
      if(ligado)a.startLoop(nome,{k:+i.value,pan:0});else a.stopLoop(nome);};
    l.appendChild(b);l.appendChild(i);l.appendChild(o);el.appendChild(l);}
  // ambiência: três eixos independentes
  const amb=h("div");amb.appendChild(h("h2","Ambiência (reage ao estado da partida)"));
  el.appendChild(amb);
  const A={mass:0,danger:0,urgency:0};
  const ambSlider=(rot,k)=>{const l=h("div",null,"ctl");l.appendChild(h("label",rot));
    const i=document.createElement("input");i.type="range";i.min=0;i.max=1;i.step=.01;i.value=0;
    const o=document.createElement("output");o.textContent="0.00";
    i.oninput=()=>{o.textContent=(+i.value).toFixed(2);A[k]=+i.value;a.startLoop("ambience",A);};
    l.appendChild(i);l.appendChild(o);el.appendChild(l);};
  ambSlider("meu tamanho","mass");ambSlider("perigo (estrela)","danger");ambSlider("fim da rodada","urgency");

  // ── o catálogo ──
  const listados=new Set();
  for(const [titulo,nomes] of GRUPOS){
    el.appendChild(h("h2",titulo));
    const row=h("div",null,"row");
    for(const k of nomes){listados.add(k);row.appendChild(botao(k));}
    el.appendChild(row);}
  const resto=Object.keys(KIT).filter(k=>!listados.has(k));
  if(resto.length){el.appendChild(h("h2","Fora dos grupos"));
    const row=h("div",null,"row");for(const k of resto)row.appendChild(botao(k));el.appendChild(row);}

  function botao(k){const rec=KIT[k];const b=h("button");
    b.appendChild(h("b",k));b.appendChild(h("i",`${rec.length} voz${rec.length>1?"es":""}`));
    b.onclick=()=>a.play(k,{mine:true,pitch,ladder});return b;}

  el.appendChild(h("p","Tudo é sintetizado no WebAudio: nenhum arquivo de áudio, nenhuma licença. Afinar um som "
    +"é mexer nos números de KIT em client/src/audio/kit.js — frequência, duração, ganho, tipo de onda, "
    +"e o `at` de cada voz, que é o que dá o ataque + corpo + cauda.","dica"));
  document.body.appendChild(el);return el;}
