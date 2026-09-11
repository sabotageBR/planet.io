import React from "react";
import { createRoot } from "react-dom/client";
import App from "./app/App.jsx";
import "./app/theme.js"; // ponte do tema (tokens/CSS quando o módulo real existir)
import { bootLang } from "./i18n/index.js";
import { iniciaAnalytics } from "./app/analytics.js";
import { PORTAL, SEM_MENU } from "./portal/flags.js";
import { portal } from "./portal/index.js";
import { iniciaSessaoPortal } from "./portal/sessao.js";
import { app } from "./state/app.js";
import { PORTAL as P } from "@warspace/shared";

// coletor de erros para os screenshots headless (--dump-dom lê window.__errors)
if (import.meta.env.DEV) {
  window.__errors = [];
  const mark = () => document.documentElement.setAttribute("data-errors", JSON.stringify(window.__errors).slice(0, 4000));
  const push = m => { window.__errors.push(m); mark(); };
  addEventListener("error", e => push(String(e.message || e.error)));
  addEventListener("unhandledrejection", e => push("unhandledrejection: " + (e.reason && e.reason.message || e.reason)));
  const origErr = console.error.bind(console);
  console.error = (...a) => { push("console.error: " + a.map(x => (x && x.message) || String(x)).join(" ").slice(0, 300)); origErr(...a); };
}

/** Tira a tela de carga do index.html. Chamada nas TRÊS entradas: o `#boot` é irmão do `#app` e não
 *  pertence ao React, então quem o montou tem que desmontá-lo — esquecer numa delas deixa o painel
 *  /admin (ou a mesa de som) atrás de uma cortina roxa que nunca sai. */
const tiraBoot = () => { const b = document.getElementById("boot"); if (b) b.remove(); };

// Três entradas, e as duas primeiras são import DINÂMICO: quem só quer jogar não baixa um byte delas.
//   /admin → painel de administração (nenhuma linha de infraestrutura muda: o nginx do cliente já faz
//            `try_files … /index.html`, então /admin sempre serviu esta SPA)
//   ?sfx   → mesa de som (aprovar o pacote de áudio de ouvido, sem entrar em partida)
// ⚠️ No pacote de portal o painel NÃO existe: um revisor esbarrando numa tela de login de administração
// é péssimo, e sem o `import()` o chunk do /admin nem chega a ser emitido no zip.
if (!PORTAL && (location.pathname === "/admin" || location.pathname.startsWith("/admin/"))) {
  import("./admin/mount.jsx").then(m => { tiraBoot(); m.mountAdmin(); });
// ⚠️ `!PORTAL` como no /admin logo acima, e pelo mesmo motivo: `?sfx` substitui o jogo INTEIRO por uma
// mesa de som de tela cheia, em português, com um botão por efeito e sliders de pitch. Era a única das
// três entradas sem a guarda — e sem ela o chunk ainda era emitido dentro do zip.
} else if (!PORTAL && new URLSearchParams(location.search).has("sfx")) {
  import("./audio/audition.js").then(m => { tiraBoot(); m.mountAudition(); });
} else {
  // O idioma tem que estar DECIDIDO antes do primeiro render: as prefs do jogador só chegam com o
  // `GET /api/me` do boot, e um dicionário é um chunk à parte. `bootLang()` lê o atalho de localStorage
  // (ou o navegador, na primeira visita) e resolve os dois — é o gêmeo do `data-theme="dawn"` cravado
  // no index.html. Nunca rejeita: falhando a carga, fica no pt-BR e a tela sobe do mesmo jeito.
  // O gtag do index.html conta a CARGA; daqui para a frente quem conta tela e partida é o analytics,
  // que só assina o store — fora do React de propósito, para não depender de montagem nem remontar.
  // ⚠️ Analytics NÃO no pacote de portal: a regra deles proíbe tracker de terceiro e cita o Google
  // Analytics pelo nome. O script já foi tirado do HTML pelo plugin do vite.config; esta linha é a outra
  // metade (sem ela, `envia()` seria só um no-op silencioso — mas o silêncio esconde a intenção).
  if (!PORTAL) iniciaAnalytics();
  bootLang().then(() => {
    createRoot(document.getElementById("app")).render(<React.StrictMode><App /></React.StrictMode>);
    // ── A CORTINA FICA ATÉ A ARENA ABRIR (só no pacote) ──
    // No site o primeiro render JÁ tem o que mostrar: a tela inicial. No pacote não há tela inicial
    // nenhuma (`SEM_MENU`), então tirar o `#boot` aqui descobriria um shell VAZIO — sobre o `background`
    // preto do `#app` — pelo tempo do `/api/auth/guest` mais o handshake do WS. Que é, exatamente, a
    // janela que o Player Fit mede como "não carregou".
    // ⚠️ A REDE DE SEGURANÇA NÃO É OPCIONAL: cortina presa é pior que qualquer tela feia, e é o mesmo
    // princípio do `prazo()` de portal/index.js — nada aqui pode ficar pendurado. O teto soma o do SDK
    // porque o preroll da Poki desenha por CIMA da cortina (é overlay do iframe deles, fora do nosso DOM).
    // ⚠️ E as três telas-que-ficam entram na condição: `Offline.jsx` é o que aparece quando o servidor
    // está fora, a build está velha ou o jogador foi removido por inatividade — com a cortina por cima,
    // ele não veria nem isso.
    // ⚠️ **A ARENA SÓ ESTÁ ABERTA QUANDO DÁ PARA JOGAR NELA**, e por isso `caiu` cobra `conn`. Ele dizia
    // só `screen === "game"` — e `play()` escreve essa tela ANTES de conectar, então a cortina saía no
    // começo do handshake (até `JOIN_TIMEOUT_MS` = 3 s) e descobria um céu vazio onde o jogador não podia
    // dar input nenhum. Medido no pacote com o SDK instrumentado: `gameLoadingFinished` aos 109 ms e o
    // primeiro `gameplayStart` aos 370 ms — ou seja o jogo ANUNCIAVA ter carregado antes de existir, e no
    // meio ficava um vão que numa rede de verdade é de segundos. É esse vão que o Inspector da Poki lê
    // como "o gameplayStart não está no começo do gameplay".
    // ⚠️ As três telas-que-ficam continuam derrubando a cortina: `Offline.jsx` é o que aparece quando o
    // servidor está fora, a build está velha ou o jogador foi removido por inatividade — com a cortina por
    // cima, ele não veria nem isso. E a REDE DE SEGURANÇA não é opcional (cortina presa é pior que
    // qualquer tela feia, o mesmo princípio do `prazo()` de portal/index.js): o teto soma o do SDK porque
    // o anúncio de um portal desenha por CIMA dela, fora do nosso DOM.
    const pronto = st => (st.screen === "game" && st.conn === "connected")
      || st.servidorFora || st.desatualizado || (st.expulsoInativo | 0) > 0;
    // CrazyGames e Poki contam "o jogo carregou" para decidir a hora do anúncio; a GD não tem equivalente.
    // ⚠️ NO PACOTE ELE SAI JUNTO COM A CORTINA, não no primeiro render: é a MESMA pergunta ("já dá para
    // jogar?"), e responder duas vezes em dois lugares é como se produz um `gameLoadingFinished` que
    // mente. Assim o tempo de carga que o painel deles mostra é o real e o `gameplayStart` encosta nele.
    // ⚠️ SEM o `if (PORTAL)` no caminho do site: a Bounty Board enquadra o SITE (ver portal/flags.js) e o
    // `gameLoadingFinished` dela sai por aqui. A fachada é no-op quando não há adaptador vivo, então no
    // site normal isto continua não fazendo nada — e o SDK só desce se um embutidor conhecido pediu.
    // ⚠️ CAVEAT PARA QUEM REEMPACOTAR A PLAYGAMA: lá o preroll VOLTOU e o `initialInterstitialDelay: 0`
    // do config conta a partir do `game_ready`, que é o que `pg.js:carregou()` manda. Com o marco agora
    // atrasado até a arena abrir, o preroll de `play()` passa a sair ANTES dele — rode a QA Tool deles
    // antes de submeter. Na Poki não há esse risco: o preroll está desligado (`semPreroll`).
    if (!SEM_MENU) { tiraBoot(); portal.carregou(); }
    else {
      let t = 0;
      const abre = () => { tiraBoot(); portal.carregou(); };
      const off = app.subscribe(st => { if (pronto(st)) { off(); clearTimeout(t); abre(); } });
      t = setTimeout(() => { off(); abre(); }, P.SDK_MS + 4000);
      if (pronto(app.get())) { off(); clearTimeout(t); abre(); }
    }
    // ⚠️ E o CICLO DE VIDA: quem diz ao portal "comecei/parei de jogar" e quanto tempo a pessoa está
    // aqui é `portal/sessao.js`, assinando o store — não os chamadores. Sem esta linha o pacote volta
    // a mandar `gameplayStart` sem nunca fechar na morte, e o funil da sessão simplesmente não existe.
    // Sem `if (PORTAL)` pelo mesmo motivo do `carregou()` logo acima: a fachada é no-op sem adaptador.
    iniciaSessaoPortal();
  });
}
