import React from "react";
import { createRoot } from "react-dom/client";
import App from "./app/App.jsx";
import "./app/theme.js"; // ponte do tema (tokens/CSS quando o módulo real existir)
import { bootLang } from "./i18n/index.js";
import { iniciaAnalytics } from "./app/analytics.js";

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

// Três entradas, e as duas primeiras são import DINÂMICO: quem só quer jogar não baixa um byte delas.
//   /admin → painel de administração (nenhuma linha de infraestrutura muda: o nginx do cliente já faz
//            `try_files … /index.html`, então /admin sempre serviu esta SPA)
//   ?sfx   → mesa de som (aprovar o pacote de áudio de ouvido, sem entrar em partida)
if (location.pathname === "/admin" || location.pathname.startsWith("/admin/")) {
  import("./admin/mount.jsx").then(m => m.mountAdmin());
} else if (new URLSearchParams(location.search).has("sfx")) {
  import("./audio/audition.js").then(m => m.mountAudition());
} else {
  // O idioma tem que estar DECIDIDO antes do primeiro render: as prefs do jogador só chegam com o
  // `GET /api/me` do boot, e um dicionário é um chunk à parte. `bootLang()` lê o atalho de localStorage
  // (ou o navegador, na primeira visita) e resolve os dois — é o gêmeo do `data-theme="dawn"` cravado
  // no index.html. Nunca rejeita: falhando a carga, fica no pt-BR e a tela sobe do mesmo jeito.
  // O gtag do index.html conta a CARGA; daqui para a frente quem conta tela e partida é o analytics,
  // que só assina o store — fora do React de propósito, para não depender de montagem nem remontar.
  iniciaAnalytics();
  bootLang().then(() => createRoot(document.getElementById("app")).render(<React.StrictMode><App /></React.StrictMode>));
}
