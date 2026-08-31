import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Em dev o backend (server/) roda em :3001; /api e /ws são proxiados.
// Sem servidor, o proxy responde 503 {error:"unreachable"} e o cliente entra em modo offline (api.online=false).
const API = process.env.WARSPACE_API || "http://localhost:3001";
const WS = API.replace(/^http/, "ws");

function unreachable(proxy) {
  proxy.on("error", (err, req, res) => {
    if (!res || typeof res.writeHead !== "function" || res.headersSent) return;
    res.writeHead(503, { "Content-Type": "application/json", "Cache-Control": "no-store" });
    res.end(JSON.stringify({ error: "unreachable", message: "Servidor indisponível" }));
  });
}

// ── MODO "portal" (`vite build --mode portal`) ────────────────────────────────
// O mesmo cliente vira um .zip que os portais de jogos servem do domínio DELES, de um SUBCAMINHO
// (`https://html5.gamedistribution.com/<gameId>/`) e dentro de um iframe. Duas coisas mudam:
//   base "./"  — com a base absoluta o dist pede /assets/index-x.js e a página fica BRANCA lá.
//   sem .map   — 5,2 dos 8,1 MB, e um sourcemap publicado entrega o fonte inteiro (protocolo, predição)
//                a quem quiser escrever trapaça.
// ⚠️ `base:"./"` NÃO pode ser global: /admin/<sub> é URL viva no site (main.jsx casa o pathname e o
//    nginx faz try_files), e ali o relativo resolveria para /admin/assets/… → painel branco.
//
// O plugin abaixo faz a cirurgia no index.html só nesse modo. É plugin e não um segundo arquivo HTML
// porque duas cópias do mesmo HTML divergem na primeira correção — a mesma lição do dicionário e do
// theme/port.js.
function htmlDoPortal() {
  return {
    name: "warspace-html-portal", apply: "build", enforce: "pre",
    transformIndexHtml: { order: "pre", handler(html) {
      return html
        // regra 7 da GameDistribution: nenhum tracker de terceiro, e ela cita o Google Analytics pelo
        // nome. `app/analytics.js` já é no-op sem `window.gtag`, então tirar daqui basta.
        .replace(/\s*<!-- Google Analytics[\s\S]*?<\/script>\s*<script>[\s\S]*?<\/script>/, "")
        // manifest e apple-touch-icon são de app instalado; dentro de um iframe são ruído e 404.
        .replace(/\s*<link rel="manifest"[^>]*>/, "")
        .replace(/\s*<link rel="apple-touch-icon"[^>]*>/, "")
        // cartão de compartilhamento não existe para uma página que ninguém cola em lugar nenhum
        .replace(/\s*<!-- cartão de compartilhamento[\s\S]*?<meta name="twitter:card"[^>]*>/, "")
        .replace('href="/favicon.svg"', 'href="favicon.svg"');
    } },
  };
}

export default defineConfig(({ mode }) => {
  const portal = mode === "portal";
  return {
    base: portal ? "./" : "/",
    plugins: [react(), ...(portal ? [htmlDoPortal()] : [])],
    resolve: { dedupe: ["react", "react-dom"] },
    optimizeDeps: { exclude: ["@warspace/shared"] },
    server: {
      port: 5173,
      proxy: {
        "/api": { target: API, changeOrigin: true, configure: unreachable },
        "/ws": { target: WS, ws: true, changeOrigin: true, configure: unreachable },
      },
    },
    build: { outDir: "dist", sourcemap: !portal, target: "es2022" },
  };
});
