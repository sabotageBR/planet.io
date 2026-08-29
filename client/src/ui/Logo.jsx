// ── A MARCA ───────────────────────────────────────────────────────────────────
// SVG inline no molde do `TalkRing` (Hud.jsx): sem requisição de rede, e — o que o título em emoji
// nunca conseguiu — pintado por TOKEN, então a marca se re-tinge sozinha nos três temas do relógio.
// A geometria mora em `logoArt.js`, compartilhada com a prévia dos temas e o gerador de assets.
import React from "react";
import { logoArt, PALETA_CSS } from "./logoArt.js";

/** Só o símbolo. `size` em px; as cores vêm dos tokens do tema em volta. */
export function LogoMark({ size = 64, className = "logo-mark" }) {
  return <svg className={className} viewBox="0 0 64 64" width={size} height={size} aria-hidden="true" focusable="false"
    dangerouslySetInnerHTML={{ __html: logoArt(PALETA_CSS) }} />;
}

/**
 * A marca completa: símbolo + wordmark. O wordmark é texto de verdade (`--font-display`), então
 * continua legível e selecionável — e o nome acessível da marca vai no `aria-label`.
 */
export default function Logo({ className = "", title = "WARSPACE.IO" }) {
  return <div className={"logo" + (className ? " " + className : "")} role="img" aria-label={title}>
    <LogoMark />
    <span className="logo-word" aria-hidden="true">WARSPACE<i>.IO</i></span>
  </div>;
}
