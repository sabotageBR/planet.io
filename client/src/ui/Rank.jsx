import React, { useEffect, useState } from "react";
import { api } from "../api/client.js";
import { useStore } from "../state/store.js";
import { app } from "../state/app.js";
import { useLabels } from "../hooks/useTheme.js";
import { ScreenHeader, Screen } from "./bits.jsx";
import { fmt, ord } from "./format.js";
import { flagOf, kdOf } from "@warspace/shared";
import { countryNameIn } from "../i18n/catalog.js";

// ⚠️ O SEGMENTO DE MÉTRICA SAIU. Ele reordenava a mesma tabela por seis critérios diferentes — e a tabela
// já mostra os cinco números (nível, partículas, abates, K/D) em colunas, lado a lado, então trocar a
// ordenação não mostrava nada de novo: mostrava a mesma coisa de outro jeito. Três fileiras de botões
// empilhadas (período, métrica, escopo) ocupavam metade da caixa e a lista começava cortada.
// A ordenação fica no NÍVEL, que é o número que resume uma conta.
const PERIODS = ["all", "week", "day"], BY = "xp";
export default function Rank({ on }) {
  return <Screen id="rank" on={on} className="rank-wrap">{on ? <Body /> : null}</Screen>;
}
function Body() {
  const LB = useLabels(); const user = useStore(app, s => s.session.user);
  const [period, setPeriod] = useState("all"); const by = BY;
  const pais = user && user.country;
  const [scope, setScope] = useState("global");
  const country = scope === "country" ? pais : null;
  const [data, setData] = useState({ rows: [], me: null, loading: true });
  useEffect(() => { let alive = true; setData(d => ({ ...d, loading: true }));
    api.ranking(period, by, 50, country).then(r => { if (alive) setData({ rows: r.rows || [], me: r.me || null, loading: false }); }).catch(() => { if (alive) setData({ rows: [], me: null, loading: false }); });
    return () => { alive = false; }; }, [period, by, country]);
  // sem país escolhido não dá para entrar no recorte regional — o botão fica desabilitado com a dica
  useEffect(() => { if (scope === "country" && !pais) setScope("global"); }, [scope, pais]);
  const myId = user && user.id, convidado = !!user && user.kind !== "registered";
  return <>
    <ScreenHeader title={LB.rankTitle} />
    <div className="toggles">
      <div className="seg" id="rk-period">{PERIODS.map(p => <button key={p} data-p={p} className={p === period ? "on" : ""} onClick={() => setPeriod(p)}>{LB.periods[p]}</button>)}</div>
      <div className="seg" id="rk-scope">
        <button className={scope === "global" ? "on" : ""} onClick={() => setScope("global")}>{LB.scopeGlobal}</button>
        <button className={scope === "country" ? "on" : ""} disabled={!pais} title={pais ? countryNameIn(pais) : LB.noCountry}
          onClick={() => pais && setScope("country")}>{pais ? `${flagOf(pais)} ${countryNameIn(pais)}` : LB.scopeCountry}</button>
      </div>
    </div>
    <div className="card rank-table"><table id="rk-table">
      {/* A coluna Δ saiu: ela lia `r.delta`, que o servidor NUNCA mandou — era um "·" fixo ocupando espaço
          que agora vale mais como nível, partículas e K/D, que é o que o jogador pediu para ver. */}
      {/* A coluna final era a MÉTRICA ESCOLHIDA, e com o seletor fora ela repetia o nível da coluna 3.
          Virou XP, que é o número por trás do nível e o único que faltava na tabela. */}
      <thead><tr><th className="c-rank">#</th><th className="c-nick">{LB.youLabel}</th>
        <th className="c-lvl num">{LB.stats.level}</th><th className="c-food num">{LB.stats.foodEaten}</th>
        <th className="c-kills num">{LB.stats.kills}</th><th className="c-kd num">{LB.stats.kd}</th>
        <th className="c-val num" id="rk-valh">{LB.stats.xp}</th></tr></thead>
      <tbody>{data.rows.map(r => { const me = r.me || (myId != null && r.userId === myId);
        return <tr key={r.userId || r.rank} className={(me ? "me" : "") + (r.rank <= 3 ? ` top top${r.rank}` : "")}>
          <td className="c-rank">{r.rank}</td>
          {/* O NOME DA CONTA, não o nick da partida. O nick o jogador troca a cada entrada — e o ranking
              sempre somou por `user_id`, então trocar de nick nunca fez ninguém perder posição; o que
              faltava era o pódio DIZER de quem é a marca. Quem entrou com Google tem o nome de lá
              (`users.display_name`); quem não tem cai no nick, que é o que sempre foi. */}
          <td className="c-nick">{r.country ? <i className="flag" title={countryNameIn(r.country)}>{flagOf(r.country)}</i> : null}
            {r.name || r.nick}{r.name && r.name !== r.nick ? <em className="c-alias">{r.nick}</em> : null}</td>
          <td className="c-lvl num">{r.level}</td><td className="c-food num">{fmt(r.foodEaten)}</td>
          <td className="c-kills num">{fmt(r.kills)}</td><td className="c-kd num">{kdOf(r.kills, r.deaths).toFixed(2)}</td>
          <td className="c-val num">{fmt(r.value)}</td></tr>; })}
        {!data.rows.length ? <tr className="empty"><td colSpan={7} className="dim">{data.loading ? LB.loading : LB.noRank}</td></tr> : null}</tbody>
    </table></div>
    {/* O ranking é só de CONTA (ver repos/ranking.js): o convidado escolhe outro nick a cada entrada, e um
        pódio feito disso não diz de quem é a marca. Ele não perde nada — o `user_stats` continua somando
        por `user_id` e o histórico inteiro aparece no dia em que ele registrar —, mas precisa LER isso
        aqui, senão "sem posição" parece defeito. */}
    {/* ⚠️ `sem posição` NÃO vai no <b>: ele é a tipografia do ORDINAL (24 px), e uma frase de duas palavras
        ali quebra em duas linhas gigantes e empurra o resto da faixa para fora. Número grande é número;
        texto é texto. */}
    {convidado
      ? <div className="card rank-me guest" id="rk-me"><span>{LB.you}</span><span className="rk-none">{LB.noRank}</span><span className="hint">{LB.rankGuest}</span></div>
      : <div className="card rank-me" id="rk-me"><span>{LB.you}</span>
          {data.me && data.me.rank != null ? <b>{ord(data.me.rank)}</b> : <span className="rk-none">{LB.noRank}</span>}
          <span>{data.me ? `${fmt(data.me.value)} ${LB.stats.xp}` : ""}</span></div>}
  </>;
}
