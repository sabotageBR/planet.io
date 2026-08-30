// ── O CARTÃO DE FIM DE PARTIDA: subiu de nível · destravou conquista ───────────────────────────────
// As duas coisas que o jogador não vai ver de novo. Antes o nível saía num toast de 3,2 s (a mesma fila
// de UM item que "Preferências salvas" usa, então qualquer outra mensagem o derrubava) e a conquista não
// saía em lugar nenhum — nem em `Dead.jsx`, nem no pódio. Aqui elas ganham o lugar que merecem: por cima
// da tela de morte, que é exatamente quando o `{t:"rewards"}` chega.
//
// ⚠️ O XP é creditado no FIM DA PARTIDA (server/src/persist/hooks.js, dentro da transação de
// `finishMatch`) — não existe level-up em tempo real, então este cartão não pode aparecer no meio do
// jogo. Ele aparece no instante em que o resultado chega, que é o instante em que o nível de fato subiu.
import React, { useEffect } from "react";
import { ACHIEVEMENT_BY_KEY, TIER_BY_ID } from "@warspace/shared";
import { useStore } from "../state/store.js";
import { app } from "../state/app.js";
import { closeLevelUp } from "../state/actions.js";
import { useLabels } from "../hooks/useTheme.js";
import { sfx } from "../audio/index.js";
import { fmt } from "./format.js";

const DURACAO = 6500;   // sai sozinho: ninguém deve ter que fechar uma notícia boa

export default function LevelUp() {
  const lv = useStore(app, s => s.levelUp);
  useEffect(() => {
    if (!lv) return;
    sfx(lv.subiu ? "levelUp" : "achievement");
    const t = setTimeout(closeLevelUp, DURACAO);
    return () => clearTimeout(t);
  }, [lv && lv.n]);
  if (!lv) return null;
  return <div className="lvup-wrap" onClick={closeLevelUp} role="status" aria-live="polite"><Card lv={lv} /></div>;
}

function Card({ lv }) {
  const LB = useLabels();
  return <div className={"card lvup" + (lv.subiu ? " up" : " ach-only")}>
    {lv.subiu ? <>
      <div className="lvup-badge"><b>{lv.level}</b></div>
      <div className="lvup-title">{LB.levelUp}</div>
      <div className="lvup-sub">{LB.levelWord} {lv.level}{lv.gained ? ` · +${fmt(lv.gained)} ${LB.xpWord}` : ""}</div>
      <span className="lv-bar"><i style={{ "--p": Math.max(0, Math.min(1, lv.pct || 0)) }} /></span>
      <span className="lvup-next">{fmt(lv.into)} / {fmt(lv.need)} {LB.xpWord}</span>
    </> : null}
    {lv.achievements.length ? <div className="lvup-achs">
      {!lv.subiu ? <div className="lvup-title sm">{LB.achievements}</div> : null}
      {lv.achievements.map(k => { const a = ACHIEVEMENT_BY_KEY.get(k); if (!a) return null;
        const t = a.tier ? TIER_BY_ID.get(a.tier) : null;
        return <div className="lvup-ach" key={k} style={t ? { "--tc": t.color } : undefined}>
          <span className="ach-ico">{a.icon}</span>
          <div><b>{a.title}</b><i>{a.desc}</i></div>
          <em>+{a.coins}</em>
          {t ? <span className="lvup-metal" title={t.name}>{t.icon}</span> : null}
        </div>; })}
    </div> : null}
  </div>;
}
