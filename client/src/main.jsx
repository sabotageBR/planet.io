import React from "react";
import { createRoot } from "react-dom/client";
import App from "./app/App.jsx";
import "./app/theme.js"; // ponte do tema (tokens/CSS quando o módulo real existir)

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
  createRoot(document.getElementById("app")).render(<React.StrictMode><App /></React.StrictMode>);
}
