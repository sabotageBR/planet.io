// ── prévia estática dos temas (sem React, sem Pixi) ───────────────────────────
// Monta o MESMO DOM do mockup (ids/classes de mockups/v2/src/engine2.js) com dados
// fixos, aplica o tema pedido e desenha uma cena parada no canvas usando só o que os
// módulos de tema exportam (textures / effects / hud / world). Serve para conferir o
// porte do CSS lado a lado com mockups/v2/shots/toon-<id>-<tela>.jpg e como
// implementação de referência (canvas 2D) do que a camada Pixi precisa fazer.
//   client/theme-preview.html?theme=dawn|sunset|dusk&screen=entry|account|lobby|rank|profile|shop|prefs|game|dead|reconn|textures&mode=desktop|portrait|landscape
// Os dados falsos vêm de mockups/v2/src/data.js (importado como texto pelo Vite).
import "./all.css";
import {THEMES,applyTheme} from "./index.js";
import PT from "../i18n/pt-BR.js";
import {tier,drawPrims,mulberry} from "./util.js";
import {logoArt} from "../ui/logoArt.js";       // o SÍMBOLO (o que vira favicon), ainda desenhado
import logoUrl from "../assets/scene/logo.webp";  // e o WORDMARK, que virou arte
import {navIconSvg} from "../ui/navIconArt.js"; // e os MESMOS ícones dos seis botões

const Q=new URLSearchParams(location.search);
const themeId=THEMES[Q.get("theme")]?Q.get("theme"):"dawn",screen=Q.get("screen")||"entry",mode=Q.get("mode")||"desktop";
const TH=applyTheme(themeId);
document.title=`warspace.io — ${TH.name} · ${screen} · ${mode}`;

// ── dados falsos do mockup ────────────────────────────────────────────────────
let D=null;
try{const src=(await import("../../../mockups/v2/src/data.js?raw")).default;new Function(src)();D=window.MOCKDATA;}
catch(e){document.body.innerHTML=`<pre style="padding:20px;color:#fff;background:#300">prévia precisa de mockups/v2/src/data.js: ${e.message}</pre>`;throw e;}

const fmt=n=>Math.round(n).toLocaleString("pt-BR");
const fmtTime=s=>{s=Math.round(s);const m=Math.floor(s/60),h=Math.floor(m/60);return h?`${h}h ${m%60}m`:`${m}:${String(s%60).padStart(2,"0")}`;};
const fmtDate=ms=>{const d=new Date(ms);return d.toLocaleDateString("pt-BR",{day:"2-digit",month:"2-digit"})+" "+d.toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"});};

// rótulos padrão do engine2 + overrides do tema
const LABELS={
  title:"WARSPACE.IO",tagline:"CONQUISTE A GALÁXIA · DIVIDA · EJETE · DEVORE",
  coinIcon:"🪙",coinWord:"moedas",nameLabel:"Nome do seu planeta",swap:"Trocar",
  modesShort:"Modos",play:"JOGAR",playAuto:"🚀 Jogar (auto)",rooms:"Salas",ranking:"Ranking",profile:"Perfil",shop:"Loja",prefs:"Opções",home:"Início",
  guestNote:"Jogando como convidado",claim:"Reivindicar conta",login:"Entrar",logout:"Sair",guest:"convidado",registered:"conta protegida",
  hint:"mouse = mover · ESPAÇO = dividir · W = ejetar · F/clique = míssil · botão direito = dividir",
  back:"◄ Voltar",equipped:"EQUIPADA",equip:"Equipar",buy:"Comprar",locked:"Bloqueada",secret:"???",
  lbTitle:"PLACAR",massLabel:"MASSA",scoreLabel:"pontos",youLabel:"planeta",killsWord:"abates",botTag:"◆",regTag:"✓",
  dead:"ABSORVIDO",deadIcon:"💥",deadSub:"— a galáxia continua sem você —",eatenBy:"DEVORADO POR",suckedBy:"SUGADO POR",
  respawn:"⟳ RENASCER",toLobby:"Lobby",timeWord:"tempo",rankWord:"ranking diário",coinsEarned:"moedas ganhas",
  lobbyTitle:"SALAS",roomCode:"CÓDIGO",enter:"Entrar",create:"Criar sala",autoNote:"Entra na sala mais cheia com vaga",shard:"shard",botsWord:"bots",
  rankTitle:"RANKING",periods:{all:"Geral",week:"Semanal",day:"Diário"},metrics:{score:"Pontos",mass:"Massa",kills:"Abates"},you:"Você",rankPos:"posição",
  profileTitle:"PERFIL",history:"HISTÓRICO",achievements:"CONQUISTAS",
  stats:{games:"partidas",kills:"abates",bestScore:"melhor pontuação",bestMass:"maior massa",playTime:"tempo jogado",bestStreak:"melhor sequência"},
  causes:{eaten:"devorado",blackhole:"buraco negro",left:"saiu",shutdown:"servidor"},
  shopTitle:"LOJA DE SKINS",shopNote:"Moedas se ganham jogando. Skins de conquista desbloqueiam sozinhas.",filterAll:"Todas",unlocked:"desbloqueadas",
  prefsTitle:"PREFERÊNCIAS",save:"Salvar",reset:"Restaurar padrão",saved:"Preferências salvas",
  accountTitle:"CONTA",claimTab:"Reivindicar",loginTab:"Entrar",nick:"Nick",password:"Senha",password2:"Confirmar senha",email:"E-mail (opcional)",
  claimNote:"Reivindicar a conta trava seu nick e leva skins e moedas para outros dispositivos.",loginNote:"Entre com um nick já reivindicado.",
  confirm:"Confirmar",cancel:"Cancelar",
  reconnTitle:"CONEXÃO PERDIDA",reconnSub:"Reconectando… tentativa {n}/5",
  split:"DIVIDIR",eject:"EJETAR",fire:"MÍSSIL",exit:"Sair",keySplit:"ESPAÇO",keyEject:"W",keyFire:"F",
  ammo:"mísseis",powerups:{magnet:"Ímã",shield:"Escudo"},
  room:"SALA",ping:"ms",fps:"fps",top5:"TOP 5 HOJE",activeRooms:"SALAS ATIVAS",
};
// O que cada tema diz de diferente mora no dicionário (i18n/pt-BR.js, grupo `themes`) desde que os
// `labels` saíram dos temas — repetidos nos três, eles impediam traduzir sem carregar 3 idiomas em cada um.
const LB=Object.assign({},LABELS,(PT.themes&&PT.themes[TH.id])||{});
const SKINS=D.SKINS,RARITY=D.RARITY,RC=TH.rarityColor||D.RARITY_COLOR,ME=D.ME,mySkin=SKINS[ME.skin];

// ── modo: no app real a viewport é o aparelho; aqui emulamos o tamanho do mockup para comparar com os shots ──
document.body.dataset.mode=mode;
// a casca é escrita pelo App.jsx, que a prévia não roda: sem ela a tela inicial fica sem o grid de duas colunas
document.body.dataset.shell=Q.get("shell")||"center";
const app=document.getElementById("app");
if(mode==="portrait"||mode==="landscape"){const [w,h]=mode==="portrait"?[390,844]:[844,390];
  Object.assign(app.style,{inset:"auto",left:"50%",top:"50%",width:w+"px",height:h+"px",transform:"translate(-50%,-50%)"});
  document.body.style.background="#111";}

// ── DOM (cópia do template de engine2.js) ─────────────────────────────────────
// Mesma lista e mesmo markup de ui/bits.jsx — inclusive o `modes`, que faltava aqui, e o SVG dentro do
// `<i>`: a prévia existe para conferir o tema, e conferir um DOM que o app não usa não confere nada.
const NAV=[["entry",LB.home],["modes",LB.modesShort],["lobby",LB.rooms],["rank",LB.ranking],["profile",LB.profile],["shop",LB.shop],["prefs",LB.prefs]];
const nav=cur=>`<nav class="nav">${NAV.map(([s,l])=>`<button class="nav-btn ${s===cur?"on":""}" data-go="${s}" data-nav="${s}"><i class="nav-ico">${navIconSvg(s)}</i><span>${l}</span></button>`).join("")}</nav>`;
const header=(title)=>`<header class="sh"><button class="btn-mini back" data-go="entry">${LB.back}</button><h1 class="stitle">${title}</h1><span class="coinbar sh-coins">${LB.coinIcon} <b class="v-coins"></b></span></header>`;
const field=(id,label,type,extra)=>`<div class="field"><label for="${id}">${label}</label><input id="${id}" type="${type||"text"}" ${extra||""}></div>`;
app.innerHTML=`
  <canvas id="game"></canvas>
  <div id="hud" class="hidden">
    <div id="hud-top">
      <span class="chip" id="h-room"><i>${LB.room}</i> <b id="v-room">1ABC</b></span>
      <span class="chip" id="h-net"><b id="v-ping">24</b><i>${LB.ping}</i> <b id="v-fps">60</b><i>${LB.fps}</i></span>
      <button class="btn-mini" id="h-exit" data-go="lobby">${LB.exit}</button>
    </div>
    <div class="panel" id="hud-lb"><div class="ph">${LB.lbTitle}</div><div id="lb-rows"></div></div>
    <div class="panel" id="hud-score">
      <div class="score-big"><span id="v-mass">0</span></div>
      <div class="score-sub">${LB.massLabel}</div>
      <div class="score-row"><span class="k">${LB.scoreLabel}</span> <b id="v-score">0</b></div>
      <div class="score-row"><span class="k">${LB.youLabel}</span> <b id="v-name"></b></div>
      <div class="score-row"><span class="k">${LB.coinIcon}</span> <b id="v-coins"></b></div>
    </div>
    <div id="hud-status">
      <div class="chip" id="hud-ammo"><i>🚀</i> <b id="v-ammo">0</b> <span>${LB.ammo}</span></div>
      <div id="hud-pw"></div>
    </div>
    <div id="hud-cd">
      <div class="cd" id="cd-split"><i class="cd-fill"></i><span>${LB.split}</span><em>${LB.keySplit}</em></div>
      <div class="cd" id="cd-eject"><i class="cd-fill"></i><span>${LB.eject}</span><em>${LB.keyEject}</em></div>
    </div>
    <div id="touch">
      <button class="tbtn" id="t-split"><span>${LB.split}</span></button>
      <button class="tbtn" id="t-eject"><span>${LB.eject}</span></button>
      <button class="tbtn" id="t-fire"><span>${LB.fire}</span><b id="t-ammo">0</b></button>
    </div>
  </div>

  <div class="screen" id="s-entry"><div class="wrap entry-wrap entry-v2">
    <div class="brand-block">
      <img class="logo" src="${logoUrl}" alt="${LB.title}" width="992" height="360">
      <div class="logo-oculto" hidden>
        <svg class="logo-mark" viewBox="0 0 64 64" aria-hidden="true">${logoArt()}</svg>
      </div>
      <div class="tagline">${LB.tagline}</div>
    </div>
    <div class="card entry-main">
      <div class="coinbar">${LB.coinIcon} <b class="v-coins"></b> <span>${LB.coinWord}</span></div>
      <div class="entry-id">
        <button class="id-skin" data-go="shop"><canvas class="skinprev" width="112" height="112"></canvas><span class="id-swap">${LB.swap}</span></button>
        <div class="id-fields">
          ${field("nameIn",LB.nameLabel,"text",'maxlength="16" autocomplete="off"')}
          <div class="skinmeta"><b id="m-skin"></b><i id="m-rar"></i></div>
        </div>
      </div>
      <button class="btn-primary" data-go="game">${LB.play}</button>
      <div class="entry-links">
        ${["modes","lobby","rank","profile","shop","prefs"].map((k,i)=>
          `<button class="btn-secondary" data-go="${k}">${navIconSvg(k)}<span>${[LB.modesShort,LB.rooms,LB.ranking,LB.profile,LB.shop,LB.prefs][i]}</span></button>`).join("")}
      </div>
      <div class="guest-note"><span class="gn-txt">${LB.guestNote}</span><button class="btn-link" data-go="account">${LB.claim}</button></div>
      <div class="hint">${LB.hint}</div>
    </div>
    <aside class="card entry-side">
      <div class="side-block"><div class="ph">${LB.top5}</div><div class="mini-rank" id="entry-top5"></div></div>
      <div class="side-block"><div class="ph">${LB.activeRooms}</div><div class="mini-rooms" id="entry-rooms"></div></div>
    </aside>
  </div></div>

  <div class="screen" id="s-lobby"><div class="wrap lobby-wrap">
    ${nav("lobby")}${header(LB.lobbyTitle)}
    <div class="card lobby-hero">
      <div class="me-chip"><canvas class="skinprev-sm" width="56" height="56"></canvas><div><b class="v-nick"></b><i class="v-kind"></i></div></div>
      <button class="btn-primary" data-go="game">${LB.playAuto}</button><span class="hint">${LB.autoNote}</span>
      <div class="code-row"><input id="codeIn" maxlength="4" placeholder="${LB.roomCode}" autocomplete="off">
        <button class="btn-secondary" data-go="game">${LB.enter}</button><button class="btn-secondary" data-go="game">${LB.create}</button></div>
    </div>
    <div class="card room-list" id="room-list"></div>
    <aside class="card lobby-side"><div class="ph">${LB.top5}</div><div class="mini-rank" id="lobby-top5"></div></aside>
  </div></div>

  <div class="screen" id="s-rank"><div class="wrap rank-wrap">
    ${nav("rank")}${header(LB.rankTitle)}
    <div class="toggles">
      <div class="seg" id="rk-period">${D.PERIODS.map(p=>`<button data-p="${p}" class="${p==="all"?"on":""}">${LB.periods[p]}</button>`).join("")}</div>
      <div class="seg" id="rk-metric">${D.METRICS.map(m=>`<button data-m="${m}" class="${m==="score"?"on":""}">${LB.metrics[m]}</button>`).join("")}</div>
    </div>
    <div class="card rank-table"><table id="rk-table"><thead><tr><th class="c-rank">#</th><th class="c-nick">${LB.youLabel}</th><th class="c-val num" id="rk-valh">${LB.metrics.score}</th><th class="c-delta num">Δ</th></tr></thead><tbody></tbody></table></div>
    <div class="card rank-me" id="rk-me"></div>
  </div></div>

  <div class="screen" id="s-profile"><div class="wrap profile-wrap">
    ${nav("profile")}${header(LB.profileTitle)}
    <div class="card profile-head">
      <canvas class="skinprev" width="112" height="112"></canvas>
      <div class="pf-meta"><b class="v-nick pf-nick"></b><i class="v-kind pf-kind"></i><span class="coinbar">${LB.coinIcon} <b class="v-coins"></b></span></div>
      <button class="btn-secondary pf-claim" data-go="account">${LB.claim}</button>
    </div>
    <div class="stat-cards" id="pf-stats"></div>
    <div class="card pf-hist"><div class="ph">${LB.history}</div><table id="pf-table"><thead><tr><th>data</th><th>sala</th><th class="num">massa</th><th class="num">${LB.killsWord}</th><th class="num">pos.</th><th class="num">${LB.timeWord}</th><th class="num">${LB.coinIcon}</th><th>fim</th></tr></thead><tbody></tbody></table></div>
    <div class="card pf-ach"><div class="ph">${LB.achievements}</div><div class="ach-grid" id="pf-ach"></div></div>
  </div></div>

  <div class="screen" id="s-shop"><div class="wrap shop-wrap">
    ${nav("shop")}${header(LB.shopTitle)}
    <div class="card shop-eq"><canvas class="skinprev" width="112" height="112"></canvas>
      <div class="skinmeta"><b id="s-skin"></b><i id="s-rar"></i><span class="hint" id="s-count"></span></div><span class="badge">${LB.equipped}</span></div>
    <div class="filters" id="shop-filters"><button data-f="all" class="on">${LB.filterAll}</button>${D.RARITY_ORDER.map(r=>`<button data-f="${r}" style="--rc:${RC[r]}">${RARITY[r]}</button>`).join("")}</div>
    <div class="shop-grid" id="shop-grid"></div>
    <div class="shop-note hint">${LB.shopNote}</div>
  </div></div>

  <div class="screen" id="s-prefs"><div class="wrap prefs-wrap">
    ${nav("prefs")}${header(LB.prefsTitle)}
    <div class="prefs-groups" id="prefs-groups"></div>
    <div class="prefs-foot"><button class="btn-secondary" id="pf-reset">${LB.reset}</button><button class="btn-primary" id="pf-save">${LB.save}</button></div>
  </div></div>

  <div class="screen" id="s-dead"><div class="card dead-card">
    <div class="dead-icon">${LB.deadIcon}</div>
    <div class="dead-title">${LB.dead}</div>
    <div class="dead-sub">${LB.deadSub}</div>
    <div class="dead-by"><span id="d-by-lab">${LB.eatenBy}</span><b id="d-by">Drakonis</b></div>
    <div class="dead-stats">
      <div><b id="d-mass">4.820</b><i>${LB.massLabel}</i></div>
      <div><b id="d-kills">3</b><i>${LB.killsWord}</i></div>
      <div><b id="d-time">6:12</b><i>${LB.timeWord}</i></div>
      <div><b id="d-coins">+54</b><i>${LB.coinsEarned}</i></div>
    </div>
    <div class="dead-rank"><span>${LB.rankWord}</span><b id="d-rank">41º <span class="arrow">→</span> 30º</b></div>
    <div class="dead-actions"><button class="btn-primary" data-go="game">${LB.respawn}</button><button class="btn-secondary" data-go="lobby">${LB.toLobby}</button></div>
  </div></div>

  <div class="overlay" id="s-account"><div class="card modal account">
    <div class="modal-title">${LB.accountTitle}</div>
    <div class="tabs"><button data-tab="claim" class="on">${LB.claimTab}</button><button data-tab="login">${LB.loginTab}</button></div>
    <form class="tab tab-claim on" onsubmit="return false">
      <p class="hint">${LB.claimNote}</p>
      ${field("ac-nick",LB.nick,"text",'value="Evandro"')}${field("ac-pass",LB.password,"password")}${field("ac-pass2",LB.password2,"password")}${field("ac-mail",LB.email,"email")}
      <div class="modal-actions"><button class="btn-secondary" data-go="entry">${LB.cancel}</button><button class="btn-primary" data-go="entry">${LB.confirm}</button></div>
    </form>
    <form class="tab tab-login" onsubmit="return false">
      <p class="hint">${LB.loginNote}</p>
      ${field("lg-nick",LB.nick,"text")}${field("lg-pass",LB.password,"password")}
      <div class="modal-actions"><button class="btn-secondary" data-go="entry">${LB.cancel}</button><button class="btn-primary" data-go="entry">${LB.login}</button></div>
    </form>
  </div></div>

  <div class="overlay" id="s-reconn"><div class="card modal reconn">
    <div class="spinner"></div>
    <div class="modal-title rc-title">${LB.reconnTitle}</div>
    <div class="rc-sub" id="rc-sub">${LB.reconnSub.replace("{n}",2)}</div>
    <button class="btn-secondary" data-go="lobby">${LB.toLobby}</button>
  </div></div>`;

const $=s=>document.querySelector(s),$$=s=>Array.from(document.querySelectorAll(s));
document.addEventListener("click",e=>{const b=e.target.closest("[data-go]");if(!b)return;Q.set("screen",b.dataset.go);location.search=Q.toString();});

// ── prévias de skin (paintSkin do tema) ───────────────────────────────────────
function paintSkinPreview(canvas,sk,r){const c=canvas.getContext("2d");c.clearRect(0,0,canvas.width,canvas.height);
  c.save();c.translate(canvas.width/2,canvas.height/2);TH.textures.paintSkin(c,sk,r*(canvas.width/112));c.restore();}

// ── preenchimento estático ────────────────────────────────────────────────────
$$(".v-coins").forEach(e=>e.textContent=fmt(ME.coins));$$(".v-nick").forEach(e=>e.textContent=ME.nick);
$$(".v-kind").forEach(e=>{e.textContent=LB.guest;e.dataset.kind="guest";});
$("#nameIn").value=ME.nick;$("#m-skin").textContent=mySkin.name;$("#m-rar").textContent=RARITY[mySkin.rarity];$("#m-rar").style.color=RC[mySkin.rarity];
$(".guest-note").dataset.kind="guest";
const miniRank=(el,n)=>{el.innerHTML=D.RANK.day.score.slice(0,n).map(r=>`<div class="mr-row"><span class="mr-pos">${r.rank}</span><span class="mr-nick">${r.nick}${r.registered?` <i class="reg">${LB.regTag}</i>`:""}</span><b class="mr-val">${fmt(r.value)}</b></div>`).join("");};
miniRank($("#entry-top5"),5);miniRank($("#lobby-top5"),5);
$("#entry-rooms").innerHTML=D.ROOMS.slice(0,4).map(r=>`<div class="mr-row"><b class="code">${r.code}</b><span>${r.players}/${r.max}</span><span class="dim">${r.ping} ms</span></div>`).join("");
$("#room-list").innerHTML=`<div class="room-row head"><span class="code">${LB.roomCode}</span><span class="shard">${LB.shard}</span><span class="pl">${LB.youLabel}s</span><span class="bots">${LB.botsWord}</span><span class="ping">${LB.ping}</span><span class="act"></span></div>`+
  D.ROOMS.map(r=>`<div class="room-row ${r.players>=r.max?"full":""}" data-code="${r.code}"><b class="code">${r.code}</b><span class="shard">${r.shard}</span>
    <span class="pl"><i class="bar" style="--p:${r.players/r.max}"></i>${r.players}/${r.max}</span><span class="bots">${r.bots}</span><span class="ping">${r.ping}</span>
    <span class="act"><button class="btn-mini" data-go="game" ${r.players>=r.max?"disabled":""}>${LB.enter}</button></span></div>`).join("");
{const rows=D.RANK.all.score;
  $("#rk-table tbody").innerHTML=rows.map(r=>`<tr class="${r.me?"me":""} ${r.rank<=3?"top top"+r.rank:""}"><td class="c-rank">${r.rank}</td><td class="c-nick">${r.nick}${r.registered?` <i class="reg">${LB.regTag}</i>`:""}</td><td class="c-val num">${fmt(r.value)}</td><td class="c-delta num ${r.delta>0?"up":r.delta<0?"down":""}">${r.delta>0?"▲"+r.delta:r.delta<0?"▼"+(-r.delta):"·"}</td></tr>`).join("");
  const me=rows.find(r=>r.me);$("#rk-me").innerHTML=`<span>${LB.you}</span><b>${me.rank}º</b><span>${fmt(me.value)} ${LB.metrics.score.toLowerCase()}</span>`;}
{const s=ME.stats;
  $("#pf-stats").innerHTML=[["games",s.games],["kills",s.kills],["bestScore",fmt(s.bestScore)],["bestMass",fmt(s.bestMass)],["playTime",fmtTime(s.playTime)],["bestStreak",s.bestStreak]]
    .map(([k,v])=>`<div class="stat card"><b>${v}</b><i>${LB.stats[k]}</i></div>`).join("");
  $("#pf-table tbody").innerHTML=D.HISTORY.map(h=>`<tr><td>${fmtDate(h.when)}</td><td class="code">${h.room}</td><td class="num">${fmt(h.mass)}</td><td class="num">${h.kills}</td><td class="num">${h.rank}º</td><td class="num">${fmtTime(h.dur)}</td><td class="num">+${h.coins}</td><td class="cause ${h.cause}">${LB.causes[h.cause]}${h.by?` <i>${h.by}</i>`:""}</td></tr>`).join("");
  $("#pf-ach").innerHTML=D.ACHIEVEMENTS.map(a=>{const done=ME.achievements.includes(a.key),pr=a.progress?Math.min(1,a.progress[0]/a.progress[1]):done?1:0;
    return`<div class="ach ${done?"done":""} ${a.secret?"secret":""}"><span class="ach-ico">${a.icon}</span><div class="ach-body"><b>${a.title}</b><i>${a.desc}</i>
      <span class="ach-bar"><i style="--p:${pr}"></i></span></div><em class="ach-coins">+${a.coins}</em></div>`;}).join("");}
{$("#s-skin").textContent=mySkin.name;$("#s-rar").textContent=RARITY[mySkin.rarity];$("#s-rar").style.color=RC[mySkin.rarity];
  $("#s-count").textContent=`${ME.owned.length}/${SKINS.length} ${LB.unlocked}`;
  $("#shop-grid").innerHTML=SKINS.map(s=>{const own=ME.owned.includes(s.id),eq=s.id===mySkin.id,sec=s.rarity==="secret"&&!own,earned=s.rarity==="earned"&&!own;
    const st=eq?"eq":own?"owned":sec?"secret":earned?"locked":s.price>ME.coins?"poor":"buyable";
    return`<div class="skin-card ${st}" data-skin="${s.id}" data-rar="${s.rarity}" style="--rc:${RC[s.rarity]}">
      ${eq?`<span class="badge">${LB.equipped}</span>`:""}<canvas width="112" height="112"></canvas>
      <b>${sec?LB.secret:s.name}</b><i>${RARITY[s.rarity]}</i>
      <em>${own?(eq?"":LB.equip):sec?"???":earned?s.desc:LB.coinIcon+" "+fmt(s.price)}</em></div>`;}).join("");
  $$("#shop-grid .skin-card").forEach(el=>{const s=SKINS[+el.dataset.skin];paintSkinPreview(el.querySelector("canvas"),el.classList.contains("secret")?Object.assign({},s,{emoji:"❓"}):s,36);});}
{const prefs=D.prefsDefault();
  $("#prefs-groups").innerHTML=D.PREFS.map(gp=>`<section class="card pg" id="pg-${gp.id}"><h2>${gp.title}</h2>${gp.items.map(it=>{const v=prefs[it.key];
    const ctl=it.type==="toggle"?`<button class="toggle" role="switch" aria-checked="${v}" data-pref="${it.key}"><i></i></button>`
      :it.type==="select"?`<select data-pref="${it.key}">${it.opts.map(([k,l])=>`<option value="${k}" ${k===v?"selected":""}>${l}</option>`).join("")}</select>`
      :`<span class="range"><input type="range" min="${it.min}" max="${it.max}" value="${v}" data-pref="${it.key}"><b>${v}</b></span>`;
    return`<div class="pref-row"><label>${it.label}</label>${ctl}</div>`;}).join("")}</section>`).join("");}
$$(".skinprev").forEach(c=>paintSkinPreview(c,mySkin,40));$$(".skinprev-sm").forEach(c=>paintSkinPreview(c,mySkin,20));

// HUD do jogo (valores fixos parecidos com o ?shot=game do mockup)
const LBROWS=[{rank:1,name:"Vortexia",isBot:true,mass:9210},{rank:2,name:"Evandro",me:true,mass:2704},{rank:3,name:"Kaique",registered:true,mass:2380},
  {rank:4,name:"Drakonis",isBot:true,mass:1900},{rank:5,name:"luana_x",registered:true,mass:1520},{rank:6,name:"Cosmara",isBot:true,mass:1210},{rank:7,name:"nina.s",mass:980},{rank:8,name:"Stellara",isBot:true,mass:640}];
$("#lb-rows").innerHTML=LBROWS.map(r=>`<div class="lb-row ${r.me?"mine":""} ${r.rank<=3?"top":""}" style="--p:${(r.mass/LBROWS[0].mass).toFixed(3)}">
  <span class="lb-pos">${r.rank}</span><span class="lb-name">${r.name}${r.isBot?` <i class="bot">${LB.botTag}</i>`:""}${r.registered?` <i class="reg">${LB.regTag}</i>`:""}</span><b class="lb-val">${fmt(r.mass)}</b></div>`).join("");
$("#v-mass").textContent=fmt(2704);$("#v-score").textContent=fmt(1832);$("#v-name").textContent=ME.nick;$("#v-coins").textContent=fmt(ME.coins);
$("#v-ammo").textContent=2;$("#t-ammo").textContent=2;
$("#hud-pw").innerHTML=[["magnet",5],["shield",7]].map(([k,s])=>`<span class="pw pw-${k}"><i>${{magnet:"🧲",shield:"🛡️"}[k]}</i>${LB.powerups[k]} <b>${s}s</b></span>`).join("");
$("#cd-split").style.setProperty("--p","1");$("#cd-eject").style.setProperty("--p",".4");

// ── tela pedida ───────────────────────────────────────────────────────────────
const MAIN=["entry","lobby","rank","profile","shop","prefs","dead","game"];
const main=screen==="account"?"entry":screen==="reconn"?"game":screen==="textures"?"game":screen;
MAIN.forEach(k=>{const el=$("#s-"+k);if(el)el.classList.toggle("on",k===main);});
$("#hud").classList.toggle("hidden",main!=="game"||screen==="textures");
$("#s-account").classList.toggle("on",screen==="account");$("#s-reconn").classList.toggle("on",screen==="reconn");
document.body.dataset.screen=main;

// ── cena parada no canvas: fundo assado + mundo (props/grade/borda) + objetos via textures + fx + radar ──
const cv=$("#game"),W=cv.width=cv.offsetWidth,H=cv.height=cv.offsetHeight,ctx=cv.getContext("2d");
const _spr=new Map();
function sprite(key,size,draw){let c=_spr.get(key);if(c)return c;c=document.createElement("canvas");c.width=c.height=size;const x=c.getContext("2d");x.translate(size/2,size/2);draw(x,size);_spr.set(key,c);return c;}
const TX=TH.textures,SC=TX.scale;
const spr={
  planet:(sk,isMe,size)=>sprite(TX.key("planet",{skin:sk,isMe},size),size,(c,s)=>TX.planet(c,s,{skin:sk,isMe})),
  food:f=>sprite(TX.key("food",f),64,(c,s)=>TX.food(c,s,f)),
  ejected:col=>sprite(TX.key("ejected",{color:col}),40,(c,s)=>TX.ejected(c,s,{color:col})),
  asteroid:(v,size)=>sprite(TX.key("asteroid",{variant:v},size),size,(c,s)=>TX.asteroid(c,s,{variant:v})),
  blackHole:()=>sprite(TX.key("blackHole",{},512),512,(c,s)=>TX.blackHole(c,s,{})),
  star:v=>sprite(TX.key("star",{variant:v}),32,(c,s)=>TX.star(c,s,{variant:v})),
  prop:(p,i)=>sprite(TX.key("prop",{i}),256,(c,s)=>TX.prop(c,s,{prop:p,i})),
  missile:()=>sprite(TX.key("missile"),64,(c,s)=>TX.missile(c,s,{})),
};
const WW=3000,WH=3000,t=1000;
const band=TX.bandLayers({WW,WH});
let bgCache=null;
function drawBg(c,cam){c.setTransform(1,0,0,1,0,0);
  if(!bgCache||bgCache.width!==W||bgCache.height!==H){bgCache=document.createElement("canvas");bgCache.width=W;bgCache.height=H;TX.background(bgCache.getContext("2d"),W,H,{});}   // assado uma vez por resolução
  c.drawImage(bgCache,0,0);
  const Y0=H*band.fade.y0,FD=H*band.fade.d,T=band.tile;
  band.layers.forEach(l=>{c.fillStyle=l.color;const ox=((-cam.x*l.f*cam.scale)%T+T)%T,oy=((-cam.y*l.f*cam.scale)%T+T)%T;
    l.stars.forEach(s=>{const bx=(s.x+ox)%T,by=(s.y+oy)%T;for(let x=bx;x<W;x+=T)for(let y=by;y<H;y+=T){if(y>Y0)continue;c.globalAlpha=s.a*Math.min(1,(Y0-y)/FD);c.fillRect(x,y,s.s,s.s);}});});
  const l=band.bigStars,ox=((-cam.x*l.f*cam.scale)%T+T)%T,oy=((-cam.y*l.f*cam.scale)%T+T)%T;
  l.stars.forEach(s=>{const bx=(s.x+ox)%T,by=(s.y+oy)%T,h=s.s/2;for(let x=bx;x<W;x+=T)for(let y=by;y<H;y+=T){if(y>Y0-FD*.5)continue;c.globalAlpha=l.alpha*Math.min(1,(Y0-y)/FD);c.drawImage(spr.star(s.v),x-h,y-h,s.s,s.s);}});
  c.globalAlpha=1;}
function drawWorld(c,cam){const hw=W/(2*cam.scale),hh=H/(2*cam.scale),wd=TH.world;c.globalAlpha=band.propsAlpha;
  band.props.forEach((p,i)=>{const R=p.r*SC.prop(p);if(Math.abs(p.x-cam.x)>hw+R||Math.abs(p.y-cam.y)>hh+R)return;c.drawImage(spr.prop(p,i),p.x-R,p.y-R,R*2,R*2);});
  c.globalAlpha=1;c.strokeStyle=wd.grid.color;c.lineWidth=wd.grid.width;c.beginPath();
  for(let x=0;x<=WW;x+=wd.grid.step){c.moveTo(x,0);c.lineTo(x,WH);}for(let y=0;y<=WH;y+=wd.grid.step){c.moveTo(0,y);c.lineTo(WW,y);}c.stroke();
  wd.border.forEach(b=>{c.strokeStyle=b.color;c.lineWidth=b.width;c.setLineDash(b.dash||[]);c.strokeRect(0,0,WW,WH);c.setLineDash([]);});}
function drawLabels(c,x,y,r,name,mass){const L=TH.hud.labels;if(r<=L.minR)return;const fs=L.size(r);c.save();c.translate(x,y);
  const out=(txt,dy,size,fill)=>{c.font=`bold ${size}px ${L.font}`;c.textAlign="center";c.textBaseline="middle";c.lineJoin="round";c.strokeStyle=L.stroke;c.lineWidth=L.strokeWidth(size);c.strokeText(txt,0,dy);c.fillStyle=fill;c.fillText(txt,0,dy);};
  // ⚠️ `nameY` passou a receber o RAIO junto com o corpo da fonte (a legenda vive no rodapé do disco, e
  // rodapé é uma fração de r, não de fs). Chamar com um argumento só devolve NaN e o nome some da prévia.
  out(name,L.nameY(fs,r),fs,L.nameColor);out(fmt(mass),L.massY(fs),fs*L.massK,L.massColor);c.restore();}
function drawPlanet(c,p){const sk=p.skin,d=p.r*SC.planet(sk);
  if(p.trail){const tr=TH.hud.trail;c.strokeStyle=tr.color(sk,p.isMe);c.lineWidth=tr.width(p.r);c.lineCap="round";c.lineJoin="round";c.setLineDash(tr.dash(p.r));
    c.beginPath();p.trail.forEach((q,i)=>i?c.lineTo(q.x,q.y):c.moveTo(q.x,q.y));c.lineTo(p.x,p.y);c.stroke();c.setLineDash([]);}
  c.drawImage(spr.planet(sk,p.isMe,tier(p.r)),p.x-d,p.y-d,d*2,d*2);
  const cell=TH.hud.cell;c.save();c.translate(p.x,p.y);c.lineCap="round";
  if(p.merge){c.strokeStyle=cell.merge.color;c.lineWidth=cell.merge.width(p.r);c.beginPath();c.arc(0,0,p.r*cell.merge.radiusK,-1.5708,-1.5708+p.merge*6.283);c.stroke();}
  (p.powerups||[]).forEach((k,i)=>{const pw=cell.powerups,a0=t*pw.spin*(i%2?-1:1);c.strokeStyle=pw.colors[k];c.lineWidth=pw.width(p.r);c.globalAlpha=pw.alpha[0]+(pw.alpha[1]-pw.alpha[0])*(.5+.5*Math.sin(t*pw.pulse+i));
    c.setLineDash(pw.dash(p.r));c.beginPath();c.arc(0,0,pw.ringR(p.r,i),a0,a0+6.283);c.stroke();c.setLineDash([]);c.globalAlpha=1;});
  c.restore();drawLabels(c,p.x,p.y,p.r,p.name+(p.registered?" ✓":""),p.r*p.r);}
function drawRadar(c,scene){const R0=TH.hud.radar,D=R0.size[mode]||R0.size.desktop,MP=R0.position.margin,R=D/2,cx=W-MP-R,cy=MP+R;c.setTransform(1,0,0,1,0,0);c.lineJoin="round";
  c.fillStyle=R0.shadow.color;c.beginPath();c.arc(cx+R0.shadow.dx,cy+R0.shadow.dy,R,0,6.283);c.fill();
  c.fillStyle=R0.face;c.beginPath();c.arc(cx,cy,R,0,6.283);c.fill();c.strokeStyle=R0.border.color;c.lineWidth=R0.border.width;c.stroke();
  c.strokeStyle=R0.rings.color;c.lineWidth=R0.rings.width;R0.rings.at.forEach(k=>{c.beginPath();c.arc(cx,cy,R*k,0,6.283);c.stroke();});
  if(R0.rings.crosshair){c.beginPath();c.moveTo(cx-R,cy);c.lineTo(cx+R,cy);c.moveTo(cx,cy-R);c.lineTo(cx,cy+R);c.stroke();}
  const a=t*R0.sweep.speed;c.fillStyle=R0.sweep.fill;c.beginPath();c.moveTo(cx,cy);c.arc(cx,cy,R-2,a-R0.sweep.span,a);c.closePath();c.fill();
  c.strokeStyle=R0.sweep.line;c.lineWidth=R0.sweep.width;c.beginPath();c.moveTo(cx,cy);c.lineTo(cx+Math.cos(a)*(R-2),cy+Math.sin(a)*(R-2));c.stroke();
  const S=D*R0.mapK,mx=cx-S/2,my=cy-S/2,sc=S/WW,st=R0.colors;c.save();c.beginPath();c.arc(cx,cy,R-2,0,6.283);c.clip();
  scene.holes.forEach(h=>{c.fillStyle=st.hole;c.beginPath();c.arc(mx+h.x*sc,my+h.y*sc,Math.max(2.2,h.ri*sc*.5),0,6.283);c.fill();});
  scene.asteroids.forEach(q=>{c.fillStyle=st.ast;c.fillRect(mx+q.x*sc-1,my+q.y*sc-1,2,2);});
  scene.players.forEach(p=>{c.fillStyle=p.isMe?st.me:p.isBot?st.bot:st.player;const d=p.isMe?2.6:1.8;c.fillRect(mx+p.x*sc-d,my+p.y*sc-d,d*2,d*2);});
  const cam=scene.cam,hw=W/(2*cam.scale)*sc,hh=H/(2*cam.scale)*sc;c.strokeStyle=st.view;c.lineWidth=1;c.strokeRect(mx+cam.x*sc-hw,my+cam.y*sc-hh,hw*2,hh*2);
  const me=scene.players.find(p=>p.isMe);c.fillStyle=R0.meDot.fill;c.strokeStyle=R0.meDot.stroke;c.lineWidth=R0.meDot.width;c.beginPath();c.arc(mx+me.x*sc,my+me.y*sc,R0.meDot.r[mode]||3,0,6.283);c.fill();c.stroke();
  c.restore();
  if(!R0.label.desktopOnly||mode==="desktop"){c.font=R0.label.font;c.fillStyle=R0.label.color;c.textAlign="center";c.textBaseline="middle";c.fillText(R0.label.text,cx,cy+R+R0.label.dy);}}

function scene(){const rand=mulberry(7),rnd=(a,b)=>a+rand()*(b-a),sk=i=>SKINS[i%SKINS.length];
  const me={x:1500,y:1500,r:52,skin:mySkin,isMe:true,name:ME.nick,powerups:["magnet","shield"],trail:Array.from({length:14},(_,i)=>({x:1500-i*22-Math.sin(i*.5)*8,y:1500+i*14}))};
  const bots=[[1,-330,-90,44,"Vortexia",true],[6,300,190,38,"Kaique",false,true],[10,-140,270,30,"Drakonis",true],[13,520,-260,26,"luana_x",false,true],[3,-520,220,20,"Cosmara",true],[22,140,-360,58,"Stellara",true],[7,-600,-300,16,"nina.s",false]]
    .map(([s,dx,dy,r,name,isBot,reg])=>({x:1500+dx,y:1500+dy,r,skin:sk(s),isBot,name,registered:!!reg,merge:isBot?0:.6,trail:Array.from({length:8},(_,i)=>({x:1500+dx+i*10,y:1500+dy-i*6}))}));
  const food=Array.from({length:120},()=>{const roll=rand();const type=roll<.06?"missile_ammo":roll<.11?["powerup_magnet","powerup_shield"][Math.floor(rand()*3)]:["dust","comet","star","rock"][Math.floor(rand()*4)];
    return{x:rnd(700,2300),y:rnd(900,2100),r:type.startsWith("p")||type==="missile_ammo"?13:rnd(6,15),type,hue:Math.floor(rand()*12),color:`hsl(${Math.floor(rand()*12)*30},80%,68%)`,seed:rand()*6};});
  return{cam:{x:1500,y:1500,scale:mode==="desktop"?.9:.75},players:[me,...bots],food,
    asteroids:[{x:1280,y:1620,r:48,rot:.4,variant:0},{x:2050,y:1330,r:36,rot:1.6,variant:1},{x:960,y:1200,r:58,rot:2.5,variant:2}],
    holes:[{x:1760,y:1360,rc:32,ri:280,spin:.8}],ejected:[[1390,1440],[1370,1462],[1352,1490]].map(([x,y])=>({x,y,r:8,color:mySkin.color})),
    missile:{x:1640,y:1470,vx:1,vy:-.35,r:11,trail:Array.from({length:12},(_,i)=>({x:1640-i*9,y:1470+i*3}))},
    fx:[["bounce",.3,{x:1500+300-40,y:1500+190-20,r:30,nx:.8,ny:.6,power:.9}],["pop",.35,{x:1280+30,y:1620-60,r:40}],["eat",.4,{x:1600,y:1640,r:12}],["shoot",.3,{x:1500,y:1500,r:52}],["boom",.4,{x:1120,y:1760,r:36}]]};}

function drawScene(c){const S=scene(),cam=S.cam;drawBg(c,cam);
  c.save();c.translate(W/2,H/2);c.scale(cam.scale,cam.scale);c.translate(-cam.x,-cam.y);drawWorld(c,cam);
  const BH=TH.effects.blackHole;S.holes.forEach(h=>{c.strokeStyle=BH.ring.color;c.globalAlpha=BH.ring.alpha[0];c.lineWidth=BH.ring.width;c.setLineDash(BH.ring.dash);c.beginPath();c.arc(h.x,h.y,h.ri,h.spin*BH.ring.spinK,h.spin*BH.ring.spinK+6.283);c.stroke();c.setLineDash([]);c.globalAlpha=1;
    const R=h.rc*SC.blackHole;c.drawImage(spr.blackHole(),h.x-R,h.y-R,R*2,R*2);});   // sem rotate: a perspectiva do disco é fixa (igual ao jogo)
  const FA=TH.world.foodAnim;S.food.forEach(f=>{const p=f.type==="star"?1+Math.sin(t*FA.starPulse.speed+f.seed)*FA.starPulse.amp:1,r=f.r*SC.food*p,s=spr.food(f);
    if(f.type==="rock"||f.type==="comet"){c.save();c.translate(f.x,f.y);c.rotate(f.seed);c.drawImage(s,-r,-r,r*2,r*2);c.restore();return;}
    const bob=f.type.startsWith("p")||f.type==="missile_ammo"?Math.sin(t*FA.bob.speed+f.seed)*FA.bob.amp:0;c.drawImage(s,f.x-r,f.y-r+bob,r*2,r*2);});
  S.ejected.forEach(e=>{const r=e.r*SC.ejected;c.drawImage(spr.ejected(e.color),e.x-r,e.y-r,r*2,r*2);});
  S.asteroids.forEach(a=>{const r=a.r*SC.asteroid;c.save();c.translate(a.x,a.y);c.rotate(a.rot);c.drawImage(spr.asteroid(a.variant,tier(a.r)),-r,-r,r*2,r*2);c.restore();});
  {const m=S.missile,MT=TH.effects.missileTrail;m.trail.forEach((pt,i)=>{if(i%MT.every)return;const a=1-i/m.trail.length;c.fillStyle=MT.color;c.globalAlpha=a*MT.alphaK;c.beginPath();c.arc(pt.x,pt.y,m.r*MT.radiusK*a,0,6.283);c.fill();});c.globalAlpha=1;
    const R=m.r*SC.missile;c.save();c.translate(m.x,m.y);c.rotate(Math.atan2(m.vy,m.vx));c.drawImage(spr.missile(),-R,-R,R*2,R*2);c.restore();}
  S.players.slice().sort((a,b)=>a.r-b.r).forEach(p=>drawPlanet(c,p));
  S.fx.forEach(([kind,k,f])=>drawPrims(c,TH.effects.fx(kind,k,f)));
  c.restore();
  if(main==="game")drawRadar(c,S);}

// ── ?screen=textures: folha de sprites (planetas de 6 skins × eu/outro, comidas, asteroides, buraco negro, estrelas, props, míssil, fx) ──
function drawSheet(c){c.setTransform(1,0,0,1,0,0);c.fillStyle=TH.tokens.surface;c.fillRect(0,0,W,H);c.fillStyle=TH.tokens.text;c.font="bold 16px "+TH.hud.labels.font;c.textAlign="left";
  c.fillText(`texturas · ${TH.name} (${TH.id})`,16,26);let x=16,y=48;const cell=(img,label,w=96)=>{if(x+w>W-16){x=16;y+=w+26;}c.drawImage(img,x,y,w,w);c.font="11px "+TH.hud.labels.font;c.fillStyle=TH.tokens.muted;c.fillText(label,x,y+w+13);x+=w+10;};
  [0,10,20,30,33,49,13,18].forEach(i=>{const sk=SKINS[i];cell(spr.planet(sk,false,256),sk.name);cell(spr.planet(sk,true,256),sk.name+" (eu)");});
  x=16;y+=122;["dust","comet","star","rock","missile_ammo","powerup_magnet","powerup_shield"].forEach((type,i)=>cell(spr.food({type,hue:i,color:`hsl(${i*30},80%,68%)`}),type,64));
  cell(spr.ejected(mySkin.color),"ejected",64);[0,1].forEach(v=>cell(spr.star(v),"star "+v,64));cell(spr.missile(),"missile",64);
  x=16;y+=90;[0,1,2].forEach(v=>cell(spr.asteroid(v,256),"asteroid "+v,128));cell(spr.blackHole(),"blackHole",128);
  band.props.slice(0,4).forEach((p,i)=>cell(spr.prop(p,i),"prop "+i+(p.ring?" ring":""),128));
  x=16;y+=160;c.font="bold 13px "+TH.hud.labels.font;c.fillStyle=TH.tokens.text;c.fillText("effects.fx (k=.35)",16,y);y+=20;
  ["bounce","pop","boom","eat","suck","split","chip","shoot","rock"].forEach((kind,i)=>{const fx=TH.effects.fx(kind,.35,{x:70+i*135,y:y+60,r:28,nx:.7,ny:.7,power:1});drawPrims(c,fx);c.font="11px "+TH.hud.labels.font;c.fillStyle=TH.tokens.muted;c.textAlign="center";c.fillText(kind,70+i*135,y+125);});
  c.textAlign="left";y+=150;c.font="bold 13px "+TH.hud.labels.font;c.fillStyle=TH.tokens.text;c.fillText("hud.radar / labels / trail",16,y);
  const S=scene();drawRadar(c,S);c.save();c.translate(120,y+80);c.scale(.8,.8);drawPlanet(c,Object.assign({},S.players[0],{x:0,y:0,trail:S.players[0].trail.map(q=>({x:q.x-1500,y:q.y-1500}))}));c.restore();}

if(screen==="textures")drawSheet(ctx);else drawScene(ctx);
window.__ready=true;
