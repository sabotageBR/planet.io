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

// ── "ENTROU" E "SAIU" NÃO APARECEM PARA NINGUÉM ──────────────────────────────
// Eles saíram do servidor (`Room.join`/`leave` não empurram mais essas linhas): numa sala do Livre o vaivém
// é constante e elas empurravam para fora do feed justamente o que interessa — quem matou quem —, porque
// `drenaFeed` corta em FEED.MAX_PER_FLUSH. Quem modera vê o vaivém na aba AO VIVO do painel, que sabe mais.
// ⚠️ O filtro FICA como defesa de rollout: um shard na build anterior ainda manda as duas linhas, e sem ele
// este cliente as mostraria a TODO MUNDO (a versão velha só as filtrava para quem não era admin).
const ENTRA_SAI = l => l.k === "sys" && (l.how === "joined" || l.how === "left");

export default function KillFeed({ h, espectando }) {
  const LB = useLabels();
  const admin = useStore(app, s => !!(s.session.user && s.session.user.isAdmin));
  const linhas = h.feed || [];
  const [, setTick] = useState(0);
  useEffect(() => { if (!linhas.length) return; const t = setInterval(() => setTick(x => x + 1), 1000); return () => clearInterval(t); }, [linhas.length]);
  const agora = Date.now();
  // ── O FEED APARECE? ─────────────────────────────────────────────────────────────────────────────
  // `FEED.SHOW` é o interruptor do /admin (escopo 'wire': chega no JSON `room`). Duas exceções, e nenhuma
  // é conforto:
  //  • QUEM ESTÁ ASSISTINDO continua vendo. `ui.css` deixa o feed ser a ÚNICA coisa que sobra na coluna
  //    direita do morto (`#hud.spec #hud-right > *:not(#kill-feed)`), então escondê-lo ali esvaziaria a
  //    tela — e o CLAUDE.md registra o feed do morto como "a informação mais óbvia de quem acabou de
  //    morrer". Esconder durante a PARTIDA e manter na arquibancada é o pedido inteiro.
  //  • O ADMINISTRADOR continua vendo dentro da partida: o interruptor é GLOBAL, e religá-lo para si
  //    seria religá-lo para todo mundo. É um dos dois caminhos de moderação que o projeto declara (o
  //    outro é a aba AO VIVO do painel).
  const mostra = FEED.SHOW || espectando || admin;
  const vivas = linhas.filter(l => agora - l.at < FEED.TTL_MS && !ENTRA_SAI(l));
  if (!vivas.length || !mostra) return null;
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
