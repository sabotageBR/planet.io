// Os ícones da tela inicial. A arte mora em `navIconArt.js` (.js puro), compartilhada com
// `theme/preview.js` — duas cópias dos mesmos seis ícones divergem na primeira correção.
import React from "react";
import { navIconArt } from "./navIconArt.js";

/** Um ícone da navegação da entrada. `k` é a mesma chave do `data-go` do botão. */
export default function NavIcon({ k, className = "nav-svg" }) {
  const d = navIconArt(k); if (!d) return null;
  return <svg className={className} viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor"
    strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"
    dangerouslySetInnerHTML={{ __html: d }} />;
}
