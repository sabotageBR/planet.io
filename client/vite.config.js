import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Em dev o backend (server/) roda em :3001; /api e /ws são proxiados.
// Sem servidor, o proxy responde 503 {error:"unreachable"} e o cliente entra em modo offline (api.online=false).
const API = process.env.PLANET_API || "http://localhost:3001";
const WS = API.replace(/^http/, "ws");

function unreachable(proxy) {
  proxy.on("error", (err, req, res) => {
    if (!res || typeof res.writeHead !== "function" || res.headersSent) return;
    res.writeHead(503, { "Content-Type": "application/json", "Cache-Control": "no-store" });
    res.end(JSON.stringify({ error: "unreachable", message: "Servidor indisponível" }));
  });
}

export default defineConfig({
  plugins: [react()],
  resolve: { dedupe: ["react", "react-dom"] },
  optimizeDeps: { exclude: ["@planet/shared"] },
  server: {
    port: 5173,
    proxy: {
      "/api": { target: API, changeOrigin: true, configure: unreachable },
      "/ws": { target: WS, ws: true, changeOrigin: true, configure: unreachable },
    },
  },
  build: { outDir: "dist", sourcemap: true, target: "es2022" },
});
