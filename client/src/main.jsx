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

createRoot(document.getElementById("app")).render(<React.StrictMode><App /></React.StrictMode>);
