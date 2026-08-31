import React, { useEffect, useRef, useState } from "react";
import { useStore } from "../state/store.js";
import { app } from "../state/app.js";
import { loginGoogle, toast } from "../state/actions.js";
import { iniciaGsi } from "../api/google.js";
import { useTheme, useLabels, useLang } from "../hooks/useTheme.js";
import { SEM_CONTA } from "../portal/flags.js";

// O widget é DESENHADO pelo Google (a marca dele tem regras), então o que dá para escolher é a
// aparência: contorno no tema claro, preenchido escuro nos outros.
const aparencia = id => (id === "dawn" ? "outline" : "filled_black");

/**
 * Botão "Entrar com Google".
 *
 * O interruptor é UM só e é do servidor: `googleClientId` vem de /api/config e, vazio, este
 * componente não renderiza nada — nem o SDK desce. Sem banco (`session.online === false`) também
 * some, porque não haveria conta para entrar.
 *
 * `type="icon"` é a variante redonda, para a faixa da entrada, onde o botão largo não cabe.
 */
export default function GoogleButton({ type = "standard" }) {
  const LB = useLabels(), th = useTheme();
  // ⚠️ o hook é chamado SEMPRE (chamada condicional de hook é bug esperando acontecer); o interruptor
  // entra depois. Com ele ligado o botão não renderiza E o SDK do Google nem é baixado, porque o efeito
  // abaixo sai cedo em `!cid` — vale para as duas superfícies do botão, a da entrada e a do modal.
  const cidCfg = useStore(app, s => (s.config || {}).googleClientId) || "";
  const cid = SEM_CONTA ? "" : cidCfg;
  const online = useStore(app, s => s.session.online);
  const ref = useRef(null);
  const [falhou, setFalhou] = useState(false);
  const temaId = (th && th.id) || "dawn", lang = useLang();
  useEffect(() => {
    if (!cid || online === false || !ref.current) return;
    let vivo = true;
    iniciaGsi(cid, async r => {
      try { await loginGoogle(r && r.credential); }
      catch (e) { toast(errText(e) || LB.googleFail, 3000); }
    })
      .then(id => {
        if (!vivo || !ref.current) return;
        ref.current.innerHTML = "";   // re-render de tema: o widget é reassado, não empilhado
        id.renderButton(ref.current, { type, theme: aparencia(temaId), size: "large", shape: "pill",
          text: "continue_with", locale: lang, logo_alignment: "left" });
      })
      // bloqueador de anúncios ou rede fora: o botão some e o resto da tela continua inteiro
      .catch(e => { if (vivo) { setFalhou(true); console.warn("[google]", e && e.message); } });
    return () => { vivo = false; };
  }, [cid, online, type, temaId, lang]);   // eslint-disable-line react-hooks/exhaustive-deps
  if (!cid || online === false || falhou) return null;
  return <div className={"gsi-wrap" + (type === "icon" ? " gsi-icon" : "")} ref={ref} />;
}
