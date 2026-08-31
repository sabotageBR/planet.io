// ── A MARCA ───────────────────────────────────────────────────────────────────
// O wordmark é a ARTE (logo.webp): letras 3D douradas com ".IO" em ciano, a mesma imagem que o cenário
// desenha grande no topo (ui/Scene.jsx). Ela substituiu o SVG por token que existia aqui — a marca
// deixou de se re-tingir com o relógio, e esse é o preço combinado: a arte tem contorno preto e lê bem
// sobre os três céus.
//
// ⚠️ O SÍMBOLO SVG NÃO SAIU (`logoArt.js`, `LogoMark`), e não é sobra: a arte nova é um wordmark
// DEITADO (742×269) e vira um borrão de 32×12 px num favicon. Quem continua virando favicon, ícone de
// app e prévia dos temas é o símbolo — o planeta anelado —, que foi desenhado em paths justamente para
// caber em 16 px e não depender de fonte carregada. Uma marca, dois usos.
import React from "react";
import { logoArt, PALETA_CSS } from "./logoArt.js";
import logoImg from "../assets/scene/logo.webp";

/** Só o símbolo, em SVG. `size` em px; as cores vêm dos tokens do tema em volta. */
export function LogoMark({ size = 64, className = "logo-mark" }) {
  return <svg className={className} viewBox="0 0 64 64" width={size} height={size} aria-hidden="true" focusable="false"
    dangerouslySetInnerHTML={{ __html: logoArt(PALETA_CSS) }} />;
}

/** A marca completa. `width/height` são os do arquivo: sem eles a página salta quando a imagem chega. */
export default function Logo({ className = "", title = "WARSPACE.IO" }) {
  return <img className={"logo" + (className ? " " + className : "")} src={logoImg} alt={title}
    width="992" height="360" decoding="async" />;
}
