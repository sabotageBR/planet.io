// Miniatura da skin: usa currentTheme().textures.paintSkin(ctx, skin, r) quando existir (contrato dos temas
// em client/src/theme/<id>/index.js, igual ao paintSkin do mockup), senão um planeta simples desenhado aqui.
import React, { useEffect, useRef } from "react";
import { useTheme } from "../hooks/useTheme.js";
import { onFaceReady } from "../theme/faces.js";

const INK = "#141026";
function shade(hex, a) { const n = parseInt(hex.slice(1), 16), r = n >> 16, g = n >> 8 & 255, b = n & 255;
  const f = x => Math.max(0, Math.min(255, Math.round(a > 0 ? x + (255 - x) * a : x * (1 + a)))); return `rgb(${f(r)},${f(g)},${f(b)})`; }
function fallback(c, sk, r, secret) {
  const col = /^#[0-9a-f]{6}$/i.test(sk.color) ? sk.color : "#4ECDC4", lw = Math.max(2.5, r * .1);
  c.lineJoin = "round"; c.lineCap = "round";
  const band = (a0, a1) => { c.beginPath(); c.ellipse(0, 0, r * 1.85, r * .56, 0, a0, a1, false); c.ellipse(0, 0, r * 1.3, r * .39, 0, a1, a0, true); c.closePath(); c.fill(); c.stroke(); };
  if (sk.ring) { c.fillStyle = shade(col, .3); c.strokeStyle = INK; c.lineWidth = lw * .7; band(Math.PI, Math.PI * 2); }
  c.fillStyle = col; c.beginPath(); c.arc(0, 0, r, 0, 6.283); c.fill();
  c.save(); c.beginPath(); c.arc(0, 0, r, 0, 6.283); c.clip();
  c.fillStyle = "rgba(20,16,38,.3)"; c.beginPath(); c.arc(r * .38, r * .4, r * 1.05, 0, 6.283); c.fill();
  c.fillStyle = "rgba(255,255,255,.38)"; c.beginPath(); c.ellipse(-r * .36, -r * .38, r * .34, r * .2, -.75, 0, 6.283); c.fill();
  c.globalAlpha = secret ? .5 : .16; c.font = `${r * 1.3}px serif`; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText(secret ? "❓" : sk.emoji, r * .05, r * .15); c.globalAlpha = 1;
  c.restore();
  if (sk.ring) { c.fillStyle = shade(col, .3); c.strokeStyle = INK; c.lineWidth = lw * .7; band(0, Math.PI); }
  c.strokeStyle = INK; c.lineWidth = lw; c.beginPath(); c.arc(0, 0, r, 0, 6.283); c.stroke();
}
export function paintSkin(cv, sk, r, theme, secret = false) {
  const c = cv.getContext("2d"); if (!c) return;
  c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, cv.width, cv.height);
  const k = cv.width / 112, rr = r * k, tx = theme && theme.textures;
  const skin = secret ? { ...sk, emoji: "❓" } : sk;
  // tema real: textures.paintSkin(ctx, skin, r) desenha centrado na origem (mesmo contrato do mockup)
  if (tx && typeof tx.paintSkin === "function") {
    c.save(); c.translate(cv.width / 2, cv.height / 2);
    try { tx.paintSkin(c, skin, rr); c.restore(); return; } catch { c.restore(); }
  }
  c.save(); c.translate(cv.width / 2, cv.height / 2 + 2 * k);
  fallback(c, skin, rr, secret); c.restore();
}
export default function SkinPreview({ skin, r = 40, size = 112, className = "skinprev", secret = false }) {
  const ref = useRef(null); const theme = useTheme();
  useEffect(() => { if (ref.current && skin) paintSkin(ref.current, skin, r, theme, secret); }, [skin, r, size, theme, secret]);
  // A caricatura é uma IMAGEM que chega depois. Este canvas é pintado uma vez, então sem o aviso a skin
  // ficaria no disco liso até o React repintar por acaso — e na grade da loja isso é para sempre.
  useEffect(() => {
    if (!skin || !skin.face) return;
    return onFaceReady(f => { if (f === skin.face && ref.current) paintSkin(ref.current, skin, r, theme, secret); });
  }, [skin, r, theme, secret]);
  return <canvas ref={ref} className={className} width={size} height={size} />;
}
