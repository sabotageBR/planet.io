export const fmt = n => Math.round(+n || 0).toLocaleString("pt-BR");
export const fmtTime = s => { s = Math.round(+s || 0); const m = Math.floor(s / 60), h = Math.floor(m / 60); return h ? `${h}h ${m % 60}m` : `${m}:${String(s % 60).padStart(2, "0")}`; };
export const fmtDate = v => { const d = new Date(v); if (isNaN(d)) return "—"; return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) + " " + d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }); };
export const ord = n => (n == null ? "—" : `${n}º`);
