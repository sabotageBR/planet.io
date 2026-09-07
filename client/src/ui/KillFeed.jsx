// ── KILL FEED (estilo Counter-Strike), no alto da coluna DIREITA ──────────────
// Uma linha por morte: matador → ícone de COMO → vítima. As linhas em que EU apareço (matando, morrendo ou
// dando assistência) vêm destacadas, que é o que faz o feed valer a atenção num canto da tela.
//
// ⚠️ A DIREÇÃO É UMA SETA, NÃO UMA PALAVRA. O verbo ocupava ~34 px de uma linha que no celular tem 178, e
// com os dois badges de nível sobravam 50 px para os DOIS nomes — duas letras cada ("p.. 🍴 matou 21 B.."),
// ou seja, o feed deixava de responder a única pergunta que existe para responder. Hoje a seta sai do
// `::after` do próprio `.kf-how` (ui.css), colada ao ícone, e o nível não é desenhado aqui (o selo continua
// no placar e no chat, que têm largura para ele). A frase por extenso vive no `aria-label`: `killFeed.killed`
// segue vivo nos três dicionários e quem usa leitor de tela continua ouvindo "Fulano matou Beltrano".
// `title=` não serviria para isso — o feed é `pointer-events:none` e o balão nativo nunca apareceria.
//
// ⚠️ Uma coisa que o jogo obriga a contar direito: `killPiece` só é chamado com `eaten`, `zone` e
// `blackhole` — míssil, estrela, asteroide e supernova NUNCA matam sozinhos (todos param no piso
// MIN_PIECE_R). Eles AMOLECEM. Por isso `how` (com o quê) e o matador são campos separados, e existe a
// assistência: a linha honesta é "⭐ · Fulano devorou Beltrano", não "Beltrano morreu na estrela".
//
// As linhas somem pela IDADE (FEED.TTL_MS), com o mesmo relógio de 1 Hz que o Chat usa — sem ele a última
// linha ficaria eterna até chegar outra.
import React, { useEffect, useState } from "react";
import { FEED } from "@warspace/shared";
import { preenche } from "../i18n/index.js";
import { useStore } from "../state/store.js";
import { app } from "../state/app.js";
import { useLabels } from "../hooks/useTheme.js";
import { HOW_ICON, SYS_ICON } from "./icons.js";
import { Nick } from "./bits.jsx";

// ── "ENTROU" E "SAIU" SÓ PARA O ADMINISTRADOR ────────────────────────────────
// Para quem joga, essas duas linhas nunca responderam a uma pergunta: numa sala do Livre o vaivém é
// constante e elas empurram para fora do feed justamente o que interessa — quem matou quem —, porque
// `drenaFeed` corta em FEED.MAX_PER_FLUSH e a coluna tem quatro linhas de altura.
// ⚠️ Quem MODERA continua vendo, e por dois caminhos independentes: a aba AO VIVO do painel tem
// `entrou`/`saiu` PRÓPRIOS, que sabem mais (se é conta, quanto durou, quantos abates e a causa — o que
// distingue um kick de uma desistência), e o administrador que está DENTRO da partida continua com a
// linha no canto da tela, que é onde ele está olhando.
// ⚠️ O corte é aqui e não em `Room._pushFeed`: no servidor o feed é um só, difundido à sala inteira, e
// filtrar por sessão custaria uma fila por jogador para poupar ~60 bytes por entrada. E o painel /admin
// não é o único leitor — o administrador jogando é o segundo, e ele se perderia junto.
const ENTRA_SAI = l => l.k === "sys" && (l.how === "joined" || l.how === "left");

export default function KillFeed({ h }) {
  const LB = useLabels();
  const admin = useStore(app, s => !!(s.session.user && s.session.user.isAdmin));
  const linhas = h.feed || [];
  const [, setTick] = useState(0);
  useEffect(() => { if (!linhas.length) return; const t = setInterval(() => setTick(x => x + 1), 1000); return () => clearInterval(t); }, [linhas.length]);
  const agora = Date.now();
  const vivas = linhas.filter(l => agora - l.at < FEED.TTL_MS && (admin || !ENTRA_SAI(l)));
  if (!vivas.length) return null;
  const F = LB.killFeed || {};
  const sysText = l => (F["sys_" + l.how] || l.how).replace("{n}", l.how === "crunch" ? crunchLabel(LB, l.n) : (l.a && l.a.name) || l.n);
  // o que a seta diz sem escrever: "Fulano matou Beltrano". Só para leitor de tela.
  const frase = l => `${l.a ? l.a.name : F.world} ${F.killed} ${l.b ? l.b.name : ""}`.trim();
  return <div id="kill-feed">
    {/* mais nova em cima, como no CS */}
    {[...vivas].reverse().map(l => l.k === "sys"
      ? <div key={l.id} className={"kf-row kf-sys" + (l.mine ? " mine" : "")}>
          <i className="kf-ico">{SYS_ICON[l.how] || "•"}</i><span>{sysText(l)}</span></div>
      : <div key={l.id} className={"kf-row" + (l.mine ? " mine" : "") + (l.a && l.a.ally ? " ally" : "")} aria-label={frase(l)}>
          {l.a ? <Nick p={l.a} /> : <span className="kf-who dim">{F.world}</span>}
          {/* Com assistência, os DOIS ícones aparecem: o que amoleceu (esmaecido) e o que finalizou. */}
          <span className="kf-how" title={(l.assist ? `${F[l.byHow] || l.byHow} ${F.assist} · ` : "") + (F[l.how] || l.how)}>
            {l.assist ? <><i className="kf-ico assist">{HOW_ICON[l.byHow] || "•"}</i><span className="kf-plus">+</span></> : null}
            <i className="kf-ico">{HOW_ICON[l.how] || "•"}</i></span>
          {l.b ? <Nick p={l.b} /> : null}</div>)}
  </div>;
}
// "faltam 2 min" / "faltam 30s" — a unidade é texto, e em inglês "min" vira "min" mas o "s" pode virar
// outra coisa. Os dois moldes vivem no grupo `fmt` do dicionário.
const crunchLabel = (LB, s) => s >= 60 ? preenche(LB.fmt.min, { n: Math.round(s / 60) }) : preenche(LB.fmt.s, { n: s });
