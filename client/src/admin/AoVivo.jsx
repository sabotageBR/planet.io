// ── /admin → AO VIVO: a torre de controle ────────────────────────────────────
// KPIs no topo, e embaixo três colunas: shards · salas · o fluxo de eventos. Uma conexão SSE só
// (`/api/admin/live`), agregada pelo shard que atender — ver server/src/admin/coletor.js.
//
// Toda a lógica que DECIDE alguma coisa mora em `vivo.js`, que é puro e testado sem jsdom. Aqui ficam
// JSX, efeitos e as três armadilhas de render que este arquivo existe para não ter:
//   1. o stream NUNCA chama setState — ele escreve num anel de `useRef`, e um flush de 4 Hz publica;
//   2. o cão de guarda, porque um SSE morre SEM EVENTO NENHUM e a torre congelaria numa foto verdadeira;
//   3. `key` pela chave do evento, nunca pelo índice (a lista é prepend: o índice remonta tudo).
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { abreStream, api } from "./api.js";
import { useInterval } from "../hooks/useInterval.js";
import { ordenar, proxOrdem } from "./ordenar.js";
import { ADMIN_BUS } from "@warspace/shared/constants.js";
import { fatiaFrames, criaAnel, empurra, lista, chaveDe, grupoDe, GRUPOS, iconeDe, textoDe,
  fmtHora, coalesce, limita, filtra, sparkPath, empurraSerie, proxEspera, terminal,
  escreveCursor, avancaCursor } from "./vivo.js";

const num = n => Number(n || 0).toLocaleString("pt-BR");
const MODO = { 0: "livre", 1: "BR" };
/** Segundos que faltam → "4:12". `null` é sala sem fim, e ela não mostra relógio nenhum. */
const restam = s => s == null ? "—" : `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

// ── A SPARKLINE ──────────────────────────────────────────────────────────────
/**
 * Uma série, sem legenda (o rótulo do cartão nomeia a série) e sem biblioteca — a mesma postura das
 * barras da tela de Retenção: "nada de biblioteca de gráfico para cinco números".
 * ⚠️ `preserveAspectRatio="none"` e `vector-effect="non-scaling-stroke"` ANDAM JUNTOS. O primeiro estica
 * o viewBox até a largura do cartão sem recalcular coordenada nenhuma; sem o segundo, a escala
 * não-uniforme deixa o traço grosso na horizontal e fio de cabelo na vertical, o que parece bug de
 * renderização e ninguém descobre de onde vem.
 * ⚠️ Vários `<polyline>`: `sparkPath` QUEBRA a linha onde a série tem lacuna. Emendar por cima de uma
 * reconexão desenharia uma queda a zero que não aconteceu.
 */
const Spark = React.memo(function Spark({ serie, cor }) {
  const segs = useMemo(() => sparkPath(serie), [serie]);
  if (!segs.length) return <svg className="lv-spark" viewBox="0 0 60 20" aria-hidden="true" />;
  const nums = serie.filter(v => typeof v === "number");
  return <svg className="lv-spark" viewBox="0 0 60 20" preserveAspectRatio="none" aria-hidden="true">
    <title>{`último minuto — mín ${num(Math.min(...nums))} · máx ${num(Math.max(...nums))}`}</title>
    {segs.map((p, i) => <polyline key={i} points={p} fill="none" stroke={cor || "var(--acc)"}
      strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />)}
  </svg>;
});

/**
 * Um número grande, o rótulo e a tendência do último minuto.
 * ⚠️ O ESTADO NUNCA VAI SÓ NA COR. Medido com o validador de paleta: o verde (#3ddc5f) e o âmbar
 * (#ffb020) dos tokens do painel ficam com ΔE 6,7 em protanopia — um daltônico protan não distingue os
 * dois. Por isso todo KPI com estado carrega o número ou a palavra junto ("24/24", "ok"/"falha"), e a cor
 * é reforço, nunca a informação.
 */
const Kpi = React.memo(function Kpi({ rot, valor, serie, cor, sub }) {
  return <div className="lv-kpi">
    <b style={cor ? { color: cor } : undefined}>{valor}</b>
    <span>{rot}{sub ? <em> {sub}</em> : null}</span>
    <Spark serie={serie} cor={cor} />
  </div>;
});

const Linha = React.memo(function Linha({ ev, onSala }) {
  const g = ev.kind === "resumo" ? ev.grupo : grupoDe(ev.kind);
  const aviso = ev.kind === "lacuna" || ev.kind === "corte";
  return <div className={`lv-linha g-${g}${aviso ? " aviso" : ""}`}>
    <i className="lv-h">{fmtHora(ev.at)}</i>
    <i className="lv-ic" aria-hidden="true">{ev.kind === "resumo" ? "≡" : iconeDe(ev)}</i>
    <span className="lv-txt">
      {ev.kind === "resumo" ? `+${ev.n_} evento(s) além do teto de ${ADMIN_BUS.TETO_S}/s` : textoDe(ev)}
      {ev.n_ && ev.kind !== "resumo" ? <b className="lv-x">×{ev.n_}</b> : null}
    </span>
    {ev.sala
      ? <button className="lv-sala" title="filtrar por esta sala" onClick={() => onSala(ev.sala)}>{ev.sala}</button>
      : <i className="lv-sala vazia" aria-hidden="true">—</i>}
  </div>;
});

// ── O HOOK DO STREAM ─────────────────────────────────────────────────────────
function useVivo(onErro) {
  const [estado, setEstado] = useState("ligando");   // ligando · ligado · reconectando · negado
  const [tentativa, setTentativa] = useState(0);
  const [kpi, setKpi] = useState(null);
  const [linhas, setLinhas] = useState([]);
  const [pausado, setPausado] = useState(false);
  const [filtro, setFiltro] = useState({ grupos: new Set(), sala: "", nick: "" });
  const [series, setSeries] = useState({ online: [], salas: [], bots: [], joins: [], tick: [], mbps: [], congela: [] });

  const anel = useRef(criaAnel());
  const sujo = useRef(0);
  const pausadoRef = useRef(false); pausadoRef.current = pausado;
  const filtroRef = useRef(filtro); filtroRef.current = filtro;
  const cursor = useRef(new Map());

  // Publicação: o único caminho de `setLinhas`, a 4 Hz. É o que separa "60 eventos por segundo" de
  // "60 renders por segundo" — o mesmo argumento do pushHud a 8 Hz do jogo.
  const publica = useCallback(() => {
    sujo.current = 0;
    // ⚠️ ORDEM OBRIGATÓRIA: coalescer → limitar → filtrar. Filtrar antes separaria um `×3` que devia ser
    // uma linha só, e a contagem passaria a depender do filtro — uma tela que mente.
    setLinhas(filtra(limita(coalesce(lista(anel.current))), filtroRef.current));
  }, []);

  useInterval(() => {
    // ⚠️ Aba escondida: para de RENDERIZAR, nunca de receber. O anel é limitado, então a memória é
    // constante — e quem volta de um alt-tab tem que encontrar os últimos minutos, não uma tela vazia.
    if (!sujo.current || pausadoRef.current || (typeof document !== "undefined" && document.hidden)) return;
    publica();
  }, ADMIN_BUS.FLUSH_MS);

  // Um flush de recuperação na volta da aba, e outro ao despausar/trocar de filtro.
  useEffect(() => {
    const f = () => { if (!document.hidden && !pausadoRef.current) publica(); };
    document.addEventListener("visibilitychange", f);
    return () => document.removeEventListener("visibilitychange", f);
  }, [publica]);
  useEffect(() => { if (!pausado) publica(); }, [pausado, filtro, publica]);

  useEffect(() => {
    let vivo = true, n = 0, timer = 0, ac = null, cao = 0, ultimoId = "";
    const dec = new TextDecoder();
    let acc = "";

    const mataCao = () => { if (cao) { clearTimeout(cao); cao = 0; } };
    // ⚠️ O CÃO DE GUARDA É A PEÇA MAIS IMPORTANTE DAQUI. Um SSE morre sem evento nenhum — proxy que corta
    // ocioso, aba congelada pelo Chrome, wifi que troca — e o `read()` simplesmente não volta nunca. Sem
    // ele a torre congela numa foto das 19:42 e o operador ACREDITA nela, que é pior que a tela em branco.
    const armaCao = () => { mataCao(); cao = setTimeout(() => { try { ac && ac.abort(); } catch { } }, ADMIN_BUS.CAO_MS); };

    const aplica = f => {
      if (f.id) ultimoId = f.id;
      if (f.evento === "kpi") {
        const k = f.dados;
        setKpi(k);
        setSeries(s => ({
          online: empurraSerie(s.online, k.online), salas: empurraSerie(s.salas, k.salas),
          bots: empurraSerie(s.bots, k.bots), joins: empurraSerie(s.joins, k.joinsMin),
          tick: empurraSerie(s.tick, k.tickPior ? k.tickPior.ms : 0), mbps: empurraSerie(s.mbps, k.mbps),
          congela: empurraSerie(s.congela, k.congelaMin || 0),
        }));
        return;
      }
      if (f.evento !== "ev" || !Array.isArray(f.dados)) return;
      avancaCursor(cursor.current, f.dados);
      for (const ev of f.dados) empurra(anel.current, ev);
      sujo.current += f.dados.length;
    };

    async function conecta() {
      ac = new AbortController();
      try {
        const r = await abreStream(`/live?since=${escreveCursor(cursor.current)}`, { signal: ac.signal, lastId: ultimoId });
        if (!vivo) return;
        // ⚠️ TERMINAL, nunca reagenda: reconectar com backoff contra um token revogado é um laço quente
        // contra o balde de login — e o `abreStream` já derrubou a sessão do painel.
        if (terminal(r.status)) { setEstado("negado"); return; }
        if (!r.ok || !r.body) throw new Error("http " + r.status);
        setEstado("ligado"); armaCao();
        const rd = r.body.getReader();
        let saudavel = setTimeout(() => { n = 0; setTentativa(0); }, 5000);
        for (;;) {
          const { value, done } = await rd.read();
          if (!vivo) return;
          if (done) break;
          armaCao();   // ⚠️ o heartbeat `:` conta como toque, senão uma noite calma derruba a conexão
          // ⚠️ `{stream:true}` E o MESMO decoder entre chunks: um chunk pode cortar uma sequência UTF-8
          // ao meio e "Kauã" vira "Kau�" — e como o resto continua chegando, ninguém liga o defeito
          // ao decoder. Decodificar cada chunk isolado é o bug clássico.
          acc += dec.decode(value, { stream: true });
          const { frames, resto } = fatiaFrames(acc);
          acc = resto;
          for (const f of frames) aplica(f);
        }
        clearTimeout(saudavel);
        throw new Error("stream fechado");
      } catch (e) {
        // ⚠️ AbortError NÃO é erro: sem esta guarda, trocar de aba do painel pisca "The user aborted a
        // request" na tarja de erro.
        if (!vivo || (e && e.name === "AbortError")) return;
        if (onErro && n === 0) onErro("o fluxo ao vivo caiu — reconectando");
        reagenda();
      } finally { mataCao(); }
    }
    function reagenda() {
      setEstado("reconectando"); setTentativa(n + 1);
      timer = setTimeout(conecta, proxEspera(n++));
    }
    conecta();
    return () => { vivo = false; clearTimeout(timer); mataCao(); if (ac) try { ac.abort(); } catch { } };
  }, [onErro]);

  return { estado, tentativa, kpi, linhas, pausado, setPausado, filtro, setFiltro, series, novos: sujo };
}

// ── A TELA ───────────────────────────────────────────────────────────────────
export function AoVivo({ erro }) {
  const { estado, tentativa, kpi, linhas, pausado, setPausado, filtro, setFiltro, series, novos } = useVivo(null);
  const [ord, setOrd] = useState({ by: "humans", dir: "desc" });
  const feed = useRef(null);
  const [noFim, setNoFim] = useState(true);

  // Auto-scroll só quando o operador já está no fim. Rolou para cima para ler uma linha, o feed para de
  // empurrar — é a razão real de 80% dos pedidos de "pausar", e custa duas linhas.
  useEffect(() => { if (noFim && feed.current) feed.current.scrollTop = 0; }, [linhas, noFim]);

  const salas = useMemo(() => ordenar(kpi && kpi.salasLista || [], {
    code: r => r.code, shard: r => r.shard | 0, mode: r => r.mode | 0, phase: r => r.phase,
    humans: r => r.humans | 0, bots: r => r.bots | 0, restam: r => r.restam == null ? -1 : r.restam,
  }, ord.by, ord.dir), [kpi, ord]);

  const grupo = g => setFiltro(f => {
    const s = new Set(f.grupos); s.has(g) ? s.delete(g) : s.add(g); return { ...f, grupos: s };
  });

  const shardsOk = kpi ? kpi.shardsOk === kpi.shardsTot : true;
  return <div className="lv">
    <div className="lv-topo">
      <span className={`lv-estado ${estado}`}>
        {estado === "ligado" ? "● ao vivo"
          : estado === "negado" ? "○ sem acesso"
            : estado === "ligando" ? "◌ conectando"
              : `○ reconectando (${tentativa})`}
      </span>
      {kpi ? <span className="ad-dim">atualizado {fmtHora(kpi.at)}</span> : null}
    </div>

    <div className="lv-kpis">
      <Kpi rot="online" valor={num(kpi ? kpi.online : 0)} serie={series.online} />
      <Kpi rot="salas" valor={num(kpi ? kpi.salas : 0)} serie={series.salas} />
      <Kpi rot="preenchimento" valor={num(kpi ? kpi.bots : 0)} serie={series.bots} />
      <Kpi rot="entradas" sub="/min" valor={num(kpi ? kpi.joinsMin : 0)} serie={series.joins} />
      {/* O tick é o PIOR shard, com o número dele: a média de 24 p99 não é o p99 de nada, e é no pior
          shard que alguém está jogando mal. */}
      <Kpi rot="tick p99" sub={kpi && kpi.tickPior && kpi.tickPior.shard >= 0 ? `s${kpi.tickPior.shard}` : ""}
        valor={`${kpi && kpi.tickPior ? kpi.tickPior.ms.toFixed(2) : "0"} ms`} serie={series.tick}
        cor={kpi && kpi.tickPior && kpi.tickPior.ms > 1.5 ? "var(--warn)" : undefined} />
      {/* ⚠️ O KPI QUE FALTAVA. "tick p99" mede quanto o passo CUSTA; isto mede quantas vezes o processo
          ficou PARADO (≥40 ms sem a thread principal gastar CPU) — cota de CPU do contêiner, preempção. O
          engasgo do jogo morava aqui, invisível, com o tick p99 verde. Qualquer valor acima de 0 é notícia. */}
      <Kpi rot="congelamentos" sub={kpi && kpi.congelaPior && kpi.congelaPior.shard >= 0 ? `/min · s${kpi.congelaPior.shard}` : "/min"}
        valor={num(kpi ? kpi.congelaMin || 0 : 0)} serie={series.congela}
        cor={kpi && kpi.congelaMin > 0 ? "var(--warn)" : undefined} />
      <Kpi rot="banda" sub="MB/s" valor={kpi ? kpi.mbps : 0} serie={series.mbps} />
      {/* O número JÁ é o rótulo do estado — a cor é reforço (ver o comentário do Kpi). */}
      <Kpi rot="shards" valor={kpi ? `${kpi.shardsOk}/${kpi.shardsTot}` : "—"}
        serie={null} cor={shardsOk ? undefined : "var(--per)"} />
      <Kpi rot="fala dos bots" valor={kpi ? (kpi.llmRuins ? `${kpi.llmRuins} com falha` : "ok") : "—"}
        serie={null} cor={kpi && kpi.llmRuins ? "var(--warn)" : undefined} />
    </div>

    <div className="lv-torre">
      <div className="lv-col lv-shards">
        <h3>Shards</h3>
        <div className="ad-shards">
          {(kpi && kpi.shards || []).map((s, i) =>
            <span key={i} className={"tag " + (s.ok ? "ok" : "off")}>
              s{s.shard != null ? s.shard : "?"}{s.ok ? "" : " mudo"}
            </span>)}
          {!kpi ? <span className="vazio">…</span> : null}
        </div>
      </div>

      <div className="lv-col lv-salas">
        <h3>Salas <small className="ad-dim">todas as salas dos {kpi ? kpi.shardsTot : "—"} shards</small></h3>
        <div className="ad-rolo"><table className="ad-tab mini">
          <thead><tr>
            {[["code", "código", "asc"], ["shard", "shard", "asc"], ["mode", "modo", "asc"],
            ["phase", "fase", "asc"], ["humans", "hum", "desc"], ["bots", "bots", "desc"], ["restam", "restam", "desc"]]
              .map(([k, r, p]) => <th key={k} className={ord.by === k ? "on" : ""}
                aria-sort={ord.by === k ? (ord.dir === "asc" ? "ascending" : "descending") : "none"}>
                <button onClick={() => setOrd(o => proxOrdem(o, k, p))}>{r}
                  <i aria-hidden="true">{ord.by === k ? (ord.dir === "asc" ? "▲" : "▼") : ""}</i></button></th>)}
          </tr></thead>
          <tbody>
            {salas.map(r => <tr key={r.shard + r.code} className={filtro.sala === r.code ? "on" : ""}
              onClick={() => setFiltro(f => ({ ...f, sala: f.sala === r.code ? "" : r.code }))}>
              <td><b>{r.code}</b></td><td>{r.shard}</td><td>{MODO[r.mode] || r.mode}</td>
              <td>{r.phase}</td><td className="n">{r.humans}</td><td className="n">{r.bots}</td>
              <td className="n">{restam(r.restam)}</td></tr>)}
            {!salas.length ? <tr><td colSpan={7} className="vazio">nenhuma sala</td></tr> : null}
          </tbody>
        </table></div>
      </div>

      <div className="lv-col lv-eventos">
        <h3>Eventos</h3>
        <div className="lv-barra">
          <div className="lv-chips">
            {GRUPOS.map(([g, rot]) =>
              <button key={g} className={filtro.grupos.has(g) ? "on" : ""} onClick={() => grupo(g)}>{rot}</button>)}
          </div>
          <input placeholder="sala" value={filtro.sala} maxLength={4}
            onChange={e => setFiltro(f => ({ ...f, sala: e.target.value }))} />
          <input placeholder="nick ou texto" value={filtro.nick}
            onChange={e => setFiltro(f => ({ ...f, nick: e.target.value }))} />
          <button className={pausado ? "pri" : ""} onClick={() => setPausado(p => !p)}>
            {pausado ? `▶ ${novos.current ? `${novos.current} novos` : "continuar"}` : "❚❚ pausar"}
          </button>
        </div>
        <div className="lv-feed" ref={feed}
          onScroll={e => setNoFim(e.currentTarget.scrollTop <= 4)}>
          {linhas.map(ev => <Linha key={chaveDe(ev)} ev={ev}
            onSala={s => setFiltro(f => ({ ...f, sala: f.sala === s ? "" : s }))} />)}
          {!linhas.length ? <div className="vazio">
            {estado === "ligado" ? "nada aconteceu ainda" : "sem fluxo"}</div> : null}
        </div>
        {!noFim ? <button className="lv-novos" onClick={() => { setNoFim(true); if (feed.current) feed.current.scrollTop = 0; }}>
          ▲ ir para o mais recente</button> : null}
      </div>
    </div>
  </div>;
}
