import React from "react";
import { createRoot } from "react-dom/client";
import App from "./app/App.jsx";
import "./app/theme.js"; // ponte do tema (tokens/CSS quando o módulo real existir)
import { bootLang } from "./i18n/index.js";
import { iniciaAnalytics } from "./app/analytics.js";
import { PORTAL } from "./portal/flags.js";
import { portal } from "./portal/index.js";
import { iniciaSessaoPortal } from "./portal/sessao.js";

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
} else if (new URLSearchParams(location.search).has("sfx")) {
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
    tiraBoot();
    // CrazyGames e Poki contam "o jogo carregou" para decidir a hora do anúncio; a GD não tem equivalente.
    // ⚠️ SEM o `if (PORTAL)`: a Bounty Board enquadra o SITE (ver portal/flags.js) e o
    // `gameLoadingFinished` dela sai por aqui. A fachada é no-op quando não há adaptador vivo, então no
    // site normal isto continua não fazendo nada — e o SDK só desce se um embutidor conhecido pediu.
    portal.carregou();
    // ⚠️ E o CICLO DE VIDA: quem diz ao portal "comecei/parei de jogar" e quanto tempo a pessoa está
    // aqui é `portal/sessao.js`, assinando o store — não os chamadores. Sem esta linha o pacote volta
    // a mandar `gameplayStart` sem nunca fechar na morte, e o funil da sessão simplesmente não existe.
    // Sem `if (PORTAL)` pelo mesmo motivo do `carregou()` logo acima: a fachada é no-op sem adaptador.
    iniciaSessaoPortal();
  });
}
