// ── PAINEL /admin ────────────────────────────────────────────────────────────
// Mesma SPA, chunk próprio, carregado só quando alguém abre `/admin` (ver main.jsx — é o mesmo padrão do
// `?sfx`). Quem só joga não baixa um byte disto, e nenhuma linha de infraestrutura muda: o nginx do
// cliente já faz `try_files ... /index.html`, então `/admin` sempre serviu a SPA.
// O painel NÃO passa por `app.screen` nem por `body[data-screen]`, e o jogo não tem link para cá.
import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { api, getToken, setToken, setOnAuthFail } from "./api.js";
import { ordenar, proxOrdem } from "./ordenar.js";
import { portalDe } from "./portais.js";
import { AoVivo } from "./AoVivo.jsx";
import "./admin.css";

// ⚠️ AO VIVO é a PRIMEIRA aba, mas NÃO é o destino do path vazio (ver `rota()` logo abaixo, que continua
// caindo em "usuarios"). São coisas diferentes: primeira da lista é onde o olho vai; padrão de `/admin`
// abriria uma conexão SSE em TODO login, inclusive o de quem só ia ajustar um parâmetro.
const TELAS = [["vivo", "Ao vivo"], ["usuarios", "Usuários"], ["salas", "Salas"], ["retencao", "Retenção"], ["aviso", "Aviso global"], ["parametros", "Parâmetros"], ["auditoria", "Auditoria"]];
const rota = () => (location.pathname.replace(/^\/admin\/?/, "").split("/")[0] || "usuarios");
const vaPara = t => { history.pushState({}, "", "/admin/" + t); dispatchEvent(new PopStateEvent("popstate")); };
const dt = s => (s ? new Date(s).toLocaleString("pt-BR") : "—");
const num = n => Number(n || 0).toLocaleString("pt-BR");
/** Segundos → "m:ss" (ou "1h02"). Duração de partida em segundos crus não se lê. */
const tempo = s => { s = Math.max(0, Math.round(+s || 0)); const h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60;
  return h ? `${h}h${String(m).padStart(2, "0")}` : `${m}:${String(s % 60).padStart(2, "0")}`; };

function Erro({ e, onClose }) {
  if (!e) return null;
  return <div className="ad-erro" role="alert"><span>{e}</span><button className="x" onClick={onClose}>✕</button></div>;
}

/**
 * Cabeçalho ordenável. UM componente para as cinco tabelas — ele só emite `(by,dir)` e deixa o pai
 * decidir se aquilo significa "buscar de novo no servidor" ou "reordenar em memória". Sem `col`, o `<th>`
 * sai cru: é o que mantém a coluna de tags e a de "Remover" sem a mão e sem a seta.
 * ⚠️ `aria-sort` vai no `th` e no máximo um por tabela tem valor diferente de "none" — daí o componente
 * receber o `ord` inteiro, e não um booleano. A seta é `aria-hidden` porque, sem isso, o leitor de tela
 * anuncia "moedas, triângulo para baixo" E "ordenado decrescente": a mesma informação duas vezes, uma
 * delas destroçada.
 */
function Th({ col, ord, set, padrao = "desc", n = false, children }) {
  if (!col) return <th className={n ? "n" : undefined}>{children}</th>;
  const ativa = ord.by === col, dir = ativa ? ord.dir : null;
  return <th className={n ? "n" : undefined} aria-sort={ativa ? (dir === "asc" ? "ascending" : "descending") : "none"}>
    <button type="button" className="ad-ord" onClick={() => set(proxOrdem(ord, col, padrao))}>
      {children}<i aria-hidden="true">{dir === "asc" ? "▲" : "▼"}</i></button></th>;
}

/**
 * O rodapé que torna "ordenado" honesto. Ordenar no servidor faz o rótulo ser verdade; DIZER que há corte
 * é o que o mantém verdade — sem esta linha, um admin rola até o fim de uma lista ordenada por "visto" e
 * conclui "ninguém está inativo há mais de X" tendo visto 50 de 5000, sem nada na tela contra o que
 * conferir a conclusão.
 */
function Paginacao({ n, more, carregando, onMais }) {
  if (!n) return null;
  return <div className="ad-pag">
    <span>mostrando {num(n)}{more ? " · há mais" : ""}</span>
    <span className="cresce" />
    {more ? <button onClick={onMais} disabled={carregando}>{carregando ? "carregando…" : "Carregar mais"}</button> : null}
  </div>;
}

function Login({ onOk }) {
  const [login, setLogin] = useState(""), [senha, setSenha] = useState(""), [e, setE] = useState(null), [ocupado, setOcupado] = useState(false);
  const entrar = async ev => {
    ev.preventDefault(); setE(null); setOcupado(true);
    try { const r = await api.login(login, senha); setToken(r.token); onOk(r.admin); }
    catch (err) { setE(err.message); } finally { setOcupado(false); }
  };
  return <form className="ad-login" onSubmit={entrar}>
    <h1>warspace.io</h1><p>painel de administração</p>
    <label>Usuário ou e-mail<input value={login} onChange={ev => setLogin(ev.target.value)} autoFocus autoComplete="username" /></label>
    <label>Senha<input type="password" value={senha} onChange={ev => setSenha(ev.target.value)} autoComplete="current-password" /></label>
    <button className="pri" disabled={ocupado || !login || !senha}>{ocupado ? "entrando…" : "Entrar"}</button>
    <Erro e={e} onClose={() => setE(null)} />
  </form>;
}

function Usuarios({ erro }) {
  const [q, setQ] = useState(""), [kind, setKind] = useState(""), [banned, setBanned] = useState("");
  const [rows, setRows] = useState([]), [sel, setSel] = useState(null), [carregando, setCarregando] = useState(false);
  const [ord, setOrd] = useState({ by: "id", dir: "desc" }), [pag, setPag] = useState({ more: false, next: null });
  /**
   * ⚠️ TROCAR A ORDENAÇÃO ZERA O CURSOR (`cursor=null` sempre que não é "carregar mais"). Com um cursor
   * velho no bolso, a primeira página da ordem NOVA começaria no meio do conjunto — pulando um pedaço em
   * silêncio, que é o pior jeito de errar paginação.
   * ⚠️ E o servidor pode ter ordenado por OUTRA coisa (pod em build antiga durante um rollout): quem
   * manda no indicador é o `by`/`dir` que VOLTOU, nunca o que foi pedido.
   */
  const buscar = async (cursor = null) => {
    setCarregando(true);
    try { const p = new URLSearchParams(); if (q) p.set("q", q); if (kind) p.set("kind", kind); if (banned) p.set("banned", banned);
      p.set("by", ord.by); p.set("dir", ord.dir);
      if (cursor && cursor.before != null) p.set("before", cursor.before);
      if (cursor && cursor.offset != null) p.set("offset", cursor.offset);
      const r = await api.users("?" + p);
      setRows(cursor ? rs => rs.concat(r.users) : r.users);
      if (r.by) setOrd({ by: r.by, dir: r.dir });
      setPag({ more: !!r.more, next: r.next || null }); }
    catch (e) { erro(e.message); } finally { setCarregando(false); }
  };
  // A ordenação é do SERVIDOR, então trocá-la é buscar de novo — e é isso que faz o topo da lista ser o
  // topo da BASE, e não o topo das 50 linhas que já estavam na tela.
  // ⚠️ `kind` e `banned` entram nas MESMAS dependências: eles são decisão discreta (um clique no select), e
  // sem isso trocar o filtro só mudava o state — a lista na tela continuava a anterior até alguém apertar
  // Enter no campo de texto. `q` fica de fora de propósito: quem digita não quer uma consulta por letra, e o
  // Enter/botão já são o gatilho dele.
  useEffect(() => { buscar(); }, [ord.by, ord.dir, kind, banned]);
  const abrir = async id => { try { setSel(await api.user(id)); } catch (e) { erro(e.message); } };
  const acao = async (fn, msg) => { try { await fn(); if (sel) setSel(await api.user(sel.user.id)); buscar(); if (msg) erro(msg, "ok"); } catch (e) { erro(e.message); } };
  return <div className="ad-split">
    <div className="ad-lista">
      <div className="ad-filtros">
        <input placeholder="nick, usuário, nome, e-mail, origem ou id" value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === "Enter" && buscar()} />
        <select value={kind} onChange={e => setKind(e.target.value)}><option value="">todos</option><option value="registered">registrados</option><option value="guest">convidados</option></select>
        <select value={banned} onChange={e => setBanned(e.target.value)}><option value="">todos</option><option value="1">banidos</option><option value="0">livres</option></select>
        {/* ⚠️ `onClick={buscar}` passava o EVENTO do clique como primeiro argumento, e `buscar(cursor)` só
            testa se ele é truthy: o botão caía no ramo de "carregar mais" e EMENDAVA a lista em vez de
            trocá-la. O sintoma era indistinguível de "o filtro não funciona" — escolher `banidos`, clicar, e
            ver as linhas antigas continuarem no topo. Pelo Enter sempre funcionou (lá é `buscar()` sem
            argumento), e era isso que fazia o defeito parecer intermitente. Mesmo padrão do `Paginacao`. */}
        <button onClick={() => buscar()}>Buscar</button>
      </div>
      <div className="ad-rolo"><table className="ad-tab click">
        {/* A 7ª coluna (as tags admin/banido) NÃO é ordenável: são duas flags sem relação entre si, e o
            filtro "banidos" da barra acima já responde a pergunta. Sem `col`, ela não ganha a mão. */}
        <thead><tr>
          <Th col="id" ord={ord} set={setOrd}>#</Th>
          <Th col="nick" ord={ord} set={setOrd} padrao="asc">nick</Th>
          <Th col="kind" ord={ord} set={setOrd} padrao="asc">tipo</Th>
          {/* DE ONDE A CONTA VEIO (`users.origin`, 0010). O valor guardado é o domínio; quem o traduz é
              `portais.js`, e o domínio cru fica no `title` — quando o portal é desconhecido, ele É o
              rótulo. A busca livre também casa a origem, então digitar "poki" filtra por ela. */}
          <Th col="origem" ord={ord} set={setOrd} padrao="asc">origem</Th>
          <Th col="xp" ord={ord} set={setOrd} n>xp</Th>
          <Th col="coins" ord={ord} set={setOrd} n>moedas</Th>
          <Th col="seen" ord={ord} set={setOrd}>visto</Th>
          <Th /></tr></thead>
        <tbody>{rows.map(u => <tr key={u.id} className={sel && sel.user.id === u.id ? "on" : ""} onClick={() => abrir(u.id)}>
          <td>{u.id}</td>
          <td>{u.nick}{u.name && u.name !== u.nick ? <em> {u.name}</em> : null}</td>
          <td>{u.kind === "registered" ? "conta" : "convidado"}</td>
          <td title={u.origin || "mesma origem (site)"}>{portalDe(u.origin)}</td>
          <td className="n">{num(u.xp)}</td><td className="n">{num(u.coins)}</td>
          <td>{dt(u.lastSeenAt)}</td>
          <td>{u.isAdmin ? <b className="tag adm">admin</b> : null}{u.bannedUntil && new Date(u.bannedUntil) > new Date() ? <b className="tag ban">banido</b> : null}</td>
        </tr>)}
        {!rows.length && !carregando ? <tr><td colSpan={8} className="vazio">nada encontrado</td></tr> : null}</tbody>
      </table></div>
      <Paginacao n={rows.length} more={pag.more} carregando={carregando} onMais={() => buscar(pag.next)} />
    </div>
    {sel ? <Detalhe d={sel} acao={acao} fechar={() => setSel(null)} /> : <div className="ad-detalhe vazio">selecione uma conta</div>}
  </div>;
}

function Detalhe({ d, acao, fechar }) {
  const u = d.user, banido = u.bannedUntil && new Date(u.bannedUntil) > new Date();
  const [dias, setDias] = useState(7), [motivo, setMotivo] = useState(""), [moedas, setMoedas] = useState(0);
  return <div className="ad-detalhe">
    <div className="ad-cab"><h2>{u.nick} <small>#{u.id}</small></h2><button className="x" onClick={fechar}>✕</button></div>
    <dl>
      {/* o USUÁRIO é o nome de entrar (congelado no cadastro); o nick do topo é livre e o jogador troca */}
      <dt>usuário</dt><dd>{u.login || "—"}</dd>
      <dt>nome da conta</dt><dd>{u.name || "—"}</dd>
      <dt>e-mail</dt><dd>{u.email || "—"}</dd>
      <dt>tipo</dt><dd>{u.kind}{u.isAdmin ? " · administrador" : ""}</dd>
      <dt>país</dt><dd>{u.country || "—"}</dd>
      {/* De onde a conta NASCEU, não de onde ela joga hoje: `users.origin` é escrito uma vez, no
          `POST /api/auth/guest`. O domínio cru vai junto porque é ele que responde "qual build?". */}
      <dt>origem</dt><dd>{portalDe(u.origin)}{u.origin ? <em> {u.origin}</em> : null}</dd>
      <dt>moedas</dt><dd>{num(u.coins)}</dd>
      <dt>XP · partidas · abates · mortes</dt><dd>{num(u.xp)} · {num(u.games)} · {num(u.kills)} · {num(u.deaths)}</dd>
      <dt>criada · vista</dt><dd>{dt(u.createdAt)} · {dt(u.lastSeenAt)}</dd>
      {banido ? <><dt>banida até</dt><dd className="ban">{dt(u.bannedUntil)} — {u.banReason || "sem motivo"}</dd></> : null}
    </dl>
    <div className="ad-acoes">
      {banido
        ? <button onClick={() => acao(() => api.ban(u.id, 0), "desbanido")}>Desbanir</button>
        : <><input className="mini" type="number" min="1" max="3650" value={dias} onChange={e => setDias(+e.target.value)} />
            <input placeholder="motivo" value={motivo} onChange={e => setMotivo(e.target.value)} />
            <button className="per" onClick={() => acao(() => api.ban(u.id, dias, motivo), "banido")}>Banir</button></>}
    </div>
    <div className="ad-acoes">
      <input className="medio" type="number" value={moedas} onChange={e => setMoedas(+e.target.value)} />
      <button onClick={() => acao(() => api.coins(u.id, moedas, "painel"), "moedas ajustadas")}>Somar moedas</button>
      <button onClick={() => acao(() => api.revoke(u.id), "sessões derrubadas")}>Derrubar sessões</button>
      <button className={u.isAdmin ? "per" : ""} onClick={() => acao(() => api.setAdmin(u.id, !u.isAdmin))}>{u.isAdmin ? "Tirar admin" : "Tornar admin"}</button>
    </div>
    {/* ⚠️ Estas duas ordenam NO CLIENTE, e é honesto porque o conjunto é fechado no servidor (LIMIT 10 e
        LIMIT 20): não existe página 2, então ordenar o que está na tela ordena o recorte inteiro. A
        condição para isso não virar mentira é o título DIZER o recorte — daí o "(10 últimas)".
        Elas também não tinham `<thead>` nenhum: duas colunas numéricas sem rótulo, e ninguém sabia qual
        era o score e qual era a massa. E `kills`/`duration_s` já vinham no fio e eram jogados fora. */}
    <h3>Partidas recentes <small className="ad-dim">(10 últimas)</small></h3>
    <MiniTab linhas={d.matches} vazio="nenhuma" pad={{ by: "ended_at", dir: "desc" }}
      cols={[["ended_at", "quando", m => m.ended_at, m => dt(m.ended_at)],
             ["room_code", "sala", m => m.room_code, m => m.room_code],
             ["score", "score", m => m.score, m => num(m.score), true],
             ["max_mass", "massa", m => m.max_mass, m => num(m.max_mass), true],
             ["kills", "abates", m => m.kills, m => num(m.kills), true],
             ["duration_s", "tempo", m => m.duration_s, m => tempo(m.duration_s), true],
             ["cause", "fim", m => m.cause, m => m.cause]]} />
    <h3>Sessões <small className="ad-dim">(20 últimas)</small></h3>
    <MiniTab linhas={d.tokens} vazio="nenhuma" pad={{ by: "created_at", dir: "desc" }}
      cols={[["kind", "tipo", t => t.kind, t => t.kind],
             ["created_at", "criada", t => t.created_at, t => dt(t.created_at)],
             ["expires_at", "expira", t => t.revoked_at || t.expires_at, t => (t.revoked_at ? "revogado" : dt(t.expires_at))],
             ["user_agent", "navegador", t => t.user_agent, t => t.user_agent || "—", false, "ua"]]} />
  </div>;
}

/**
 * Tabela pequena de conjunto FECHADO: ordena em memória (`ordenar.js`) e não pagina, porque não há o que
 * paginar. `cols` = [chave, rótulo, valorCru, desenha, numérica?, classe].
 * ⚠️ Ordena o valor CRU, nunca o desenhado: `num()` devolve "1.234", e "1.234" < "999" em qualquer
 * comparação de texto — a coluna sairia ao contrário sem nada denunciando.
 * ⚠️ As linhas vêm CRUAS do Postgres (`ended_at`, `max_mass`), enquanto a lista de contas vem camelCase
 * pelo `toAdmin`: as chaves aqui são as do payload, não as do resto do painel.
 */
function MiniTab({ linhas, cols, vazio, pad }) {
  const [ord, setOrd] = useState(pad);
  const campos = Object.fromEntries(cols.map(([k, , cru]) => [k, cru]));
  const rows = ordenar(linhas || [], campos, ord.by, ord.dir);
  return <div className="ad-rolo"><table className="ad-tab mini">
    <thead><tr>{cols.map(([k, rot, , , n]) => <Th key={k} col={k} ord={ord} set={setOrd} n={!!n}>{rot}</Th>)}</tr></thead>
    <tbody>{rows.map((r, i) => <tr key={r.id != null ? r.id : i}>
      {cols.map(([k, , , desenha, n, cls]) => <td key={k} className={[n ? "n" : "", cls || ""].filter(Boolean).join(" ") || undefined}>{desenha(r)}</td>)}</tr>)}
      {!rows.length ? <tr><td colSpan={cols.length} className="vazio">{vazio}</td></tr> : null}</tbody>
  </table></div>;
}

function Salas({ erro }) {
  const [d, setD] = useState(null), [sel, setSel] = useState(null);
  const [ord, setOrd] = useState({ by: "humans", dir: "desc" }), [ordP, setOrdP] = useState({ by: "slot", dir: "asc" });
  const carregar = async () => { try { setD(await api.rooms(`?by=${ord.by}&dir=${ord.dir}`)); } catch (e) { erro(e.message); } };
  /**
   * ⚠️ `[ord.by,ord.dir]` NAS DEPENDÊNCIAS, e não `[]`. Com a lista vazia, o `carregar` do intervalo fecha
   * sobre a ordenação INICIAL para sempre: a tela reordenaria no clique e voltaria sozinha ao padrão 5
   * segundos depois, sem erro em lugar nenhum. Recriar o intervalo ainda dá de graça o refetch imediato.
   */
  useEffect(() => { carregar(); const t = setInterval(carregar, 5000); return () => clearInterval(t); }, [ord.by, ord.dir]);
  /**
   * `silencioso` = veio do relógio, não de um clique. Duas coisas mudam: o erro NÃO vira toast (uma falha
   * de rede a cada 5 s encheria a tela de avisos iguais, e o administrador não pediu nada) e o 404 FECHA o
   * detalhe — a sala acabou enquanto ele olhava, e insistir num painel de uma sala que não existe mais é
   * pior que fechá-lo.
   */
  const abrir = async (code, o = ordP, silencioso = false) => {
    try { setSel((await api.room(code, `?by=${o.by}&dir=${o.dir}`)).room); }
    catch (e) { if (!silencioso) erro(e.message); else if (e.status === 404) setSel(null); }
  };
  /**
   * ⚠️ O DETALHE TAMBÉM SE ATUALIZA SOZINHO, no mesmo relógio da lista. Ele era o único painel da tela que
   * só mudava por clique — e é justamente ele que tem os números vivos (massa, os três relógios, quem caiu):
   * ficava parado na foto do instante em que a sala foi aberta, e o administrador tinha que reclicar para
   * saber o que estava acontecendo AGORA.
   * ⚠️ A dependência é `sel.code`, NUNCA `sel`: o objeto é trocado a cada resposta, então com ele o efeito
   * se desmontaria e remontaria a cada volta, reiniciando o intervalo para sempre. É a mesma armadilha do
   * `[ord.by,ord.dir]` logo acima, de outro jeito.
   * ⚠️ Sem chamada imediata aqui: quem abre já buscou (o clique, ou o `ordenarJogadores`), e uma chamada
   * na montagem do efeito seria um segundo fetch em cima do primeiro a cada troca de ordenação.
   */
  const codeSel = sel ? sel.code : null;
  useEffect(() => {
    if (!codeSel) return;
    const t = setInterval(() => abrir(codeSel, ordP, true), 5000);
    return () => clearInterval(t);
  }, [codeSel, ordP.by, ordP.dir]);
  const ordenarJogadores = o => { setOrdP(o); if (sel) abrir(sel.code, o); };
  const remover = async (code, p) => {
    if (!confirm(`Remover ${p.name} da sala ${code}?`)) return;
    // ⚠️ `abrir(code)`, e nao `api.room(code)` cru: aquele leva o `?by=&dir=` da tabela junto. Sem ele o
    // refetch de depois do kick voltava na ordem PADRAO e a tabela pulava debaixo do cursor do admin.
    try { await api.kick(code, p.slot, p.sessionId, ""); await abrir(code); } catch (e) { erro(e.message); }
  };
  const fechar = async code => {
    if (!confirm(`FECHAR a sala ${code}? Todo mundo é desconectado.`)) return;
    try { await api.closeRoom(code); setSel(null); carregar(); } catch (e) { erro(e.message); }
  };
  if (!d) return <div className="vazio">carregando…</div>;
  return <div className="ad-split">
    <div className="ad-lista">
      {d.shards ? <div className="ad-shards">{d.shards.map((s, i) => <span key={i} className={"tag " + (s.ok ? "ok" : "off")}>shard {s.shard != null ? s.shard : "?"} {s.ok ? "ok" : "sem resposta"}</span>)}</div> : null}
      <div className="ad-rolo"><table className="ad-tab click">
        <thead><tr>
          <Th col="code" ord={ord} set={setOrd} padrao="asc">código</Th>
          <Th col="shard" ord={ord} set={setOrd} padrao="asc">shard</Th>
          <Th col="mode" ord={ord} set={setOrd} padrao="asc">modo</Th>
          <Th col="phase" ord={ord} set={setOrd} padrao="asc">fase</Th>
          <Th col="humans" ord={ord} set={setOrd} n>humanos</Th>
          <Th col="bots" ord={ord} set={setOrd} n>bots</Th></tr></thead>
        <tbody>{d.rooms.map(r => <tr key={r.code + r.shard} className={sel && sel.code === r.code ? "on" : ""} onClick={() => abrir(r.code)}>
          <td><b>{r.code}</b></td><td>{r.shard}</td><td>{r.mode === 1 ? "BR" : "livre"}</td><td>{r.phase}</td>
          <td className="n">{r.humans}</td><td className="n">{r.bots}</td></tr>)}
          {!d.rooms.length ? <tr><td colSpan={6} className="vazio">nenhuma sala ativa</td></tr> : null}</tbody>
      </table></div>
    </div>
    {sel ? <div className="ad-detalhe">
      <div className="ad-cab"><h2>Sala {sel.code} {sel.specs ? <small>· {sel.specs} assistindo</small> : null}</h2>
        {/* ⚠️ O PAINEL NÃO TEM MOTOR DE JOGO — ele é um chunk à parte da MESMA SPA, mas nunca monta o Pixi
            nem abre WebSocket de sala. Então "Assistir" DELEGA: abre o jogo numa aba nova com
            `?sala=<code>&assistir=1`, que `actions.js` lê no boot e manda para `assistir()`. Embutir uma
            partida aqui dentro significaria carregar o jogo inteiro no painel — o oposto do motivo de ele
            ser um chunk sob demanda. O administrador entra como espectador comum: sem corpo, sem vaga e
            sem aparecer no placar de ninguém. */}
        <div><a className="btn" href={`/?sala=${sel.code}&assistir=1`} target="_blank" rel="noopener">Assistir</a>
          <button className="per" onClick={() => fechar(sel.code)}>Fechar sala</button><button className="x" onClick={() => setSel(null)}>✕</button></div></div>
      <div className="ad-rolo"><table className="ad-tab">
        {/* "estado" ordena por vivo+conectado — critério COMPOSTO, declarado no servidor (`ORDEM_JOGADORES`),
            porque um cabeçalho que ordena por algo que a coluna não mostra é a mesma mentira, em miniatura. */}
        <thead><tr>
          <Th col="slot" ord={ordP} set={ordenarJogadores} padrao="asc">slot</Th>
          <Th col="name" ord={ordP} set={ordenarJogadores} padrao="asc">nome</Th>
          <Th col="level" ord={ordP} set={ordenarJogadores} n>nível</Th>
          <Th col="mass" ord={ordP} set={ordenarJogadores} n>massa</Th>
          {/* ⚠️ "na sala" é a VISITA (`gp.entrouTick`, que o respawn não zera) e "vida" é a VIDA
              (`gp.joinedTick`, o `matches.duration_s`). São dois relógios, e a diferença entre eles é o
              respawn — foi medindo pelo segundo que o painel já disse "saiu · 40s" de quem tinha passado
              vinte minutos na sala em quinze vidas. Ver server/test/visita.test.js. */}
          <Th col="desde" ord={ordP} set={ordenarJogadores} n>na sala</Th>
          <Th col="vida" ord={ordP} set={ordenarJogadores} n>vida</Th>
          {/* TERCEIRO relógio, e o único que não é desta sessão: `user_stats.play_time_s`, o acumulado da
              CONTA. Ele responde "é gente nova ou é veterano?" — que é a pergunta que muda o que se faz
              com o resto da linha. Vem do banco (`users.adminBrief`), não da memória do shard. */}
          <Th col="total" ord={ordP} set={ordenarJogadores} n>total</Th>
          <Th col="origem" ord={ordP} set={ordenarJogadores} padrao="asc">origem</Th>
          <Th col="state" ord={ordP} set={ordenarJogadores}>estado</Th>
          <Th col="ip" ord={ordP} set={ordenarJogadores} padrao="asc">ip</Th>
          <Th /></tr></thead>
        <tbody>{(sel.players || []).map(p => <tr key={p.slot}>
          <td>{p.slot}</td><td>{p.name}{p.country ? <em> {p.country}</em> : null}</td>
          <td className="n">{p.level || "—"}</td><td className="n">{num(p.mass)}</td>
          <td className="n">{p.desdeS == null ? "—" : tempo(p.desdeS)}</td>
          <td className="n">{p.vidaS == null || !p.alive ? "—" : tempo(p.vidaS)}</td>
          <td className="n">{p.totalS == null ? "—" : tempo(p.totalS)}</td>
          <td>{p.userId == null ? "—" : portalDe(p.origem)}</td>
          <td>{p.spectator ? "assiste" : p.alive ? "vivo" : "morto"}{p.connected ? "" : " · caiu"}</td>
          <td className="ua">{p.ip || "—"}</td>
          <td><button className="per" onClick={() => remover(sel.code, p)}>Remover</button></td></tr>)}
          {!(sel.players || []).length ? <tr><td colSpan={11} className="vazio">só preenchimento</td></tr> : null}</tbody>
      </table></div>
    </div> : <div className="ad-detalhe vazio">selecione uma sala</div>}
  </div>;
}

/**
 * RETENÇÃO. A tela existe para responder UMA pergunta — "o jogador fica 3 minutos?" — e o painel que a
 * responde é o da VISITA, não o da vida: `matches` guarda uma linha por VIDA, e no Livre morrer e
 * renascer abre outra. A visita é reconstruída no SQL agrupando as partidas por intervalo.
 * ⚠️ Só leitura, e nada aqui audita (o mesmo contrato de todo GET do painel).
 */
function Retencao({ erro }) {
  const [d, setD] = useState(null), [janela, setJanela] = useState("14d"), [carregando, setCarregando] = useState(false);
  // A lista de janelas é do SERVIDOR (lista branca em `repos/analytics.js`). Duplicá-la aqui a faria
  // divergir na primeira janela nova — e o `<select>` ofereceria um valor que a rota recusa com 400.
  const [janelas, setJanelas] = useState([]);
  useEffect(() => { let vivo = true;
    api.retencaoJanelas().then(r => { if (vivo) setJanelas(r.janelas || []); }).catch(() => {});
    return () => { vivo = false; }; }, []);
  useEffect(() => { let vivo = true; setCarregando(true);
    api.retencao(janela).then(r => { if (vivo) setD(r); }).catch(e => erro(e.message)).finally(() => { if (vivo) setCarregando(false); });
    return () => { vivo = false; }; }, [janela]);
  if (!d) return <div className="vazio">{carregando ? "carregando…" : "sem dados"}</div>;
  const v = d.visita, p = d.primeira;
  /**
   * ⚠️ O MODO SAI DA RESPOSTA, NUNCA DO `janela` DO ESTADO. Abaixo de um dia a base deixa de ser a coorte
   * de contas novas e passa a ser quem JOGOU na janela — os painéis medem outra coisa, e por isso os
   * títulos mudam junto. Lendo o pedido em vez do que voltou, um pod em build antiga (que ignora `janela`
   * e responde 14 dias) faria a tela anunciar "1 hora" sobre números de duas semanas. Mesmo contrato do
   * eco de `by`/`dir` das tabelas ordenáveis.
   */
  const atividade = d.modo === "atividade";
  const pc = (a, b) => (b ? Math.round(100 * a / b) + "%" : "—");
  // O histograma vem em baldes de 30 s (width_bucket de 0..600 em 20). Barra por largura relativa — nada
  // de biblioteca de gráfico para cinco números.
  const maxH = Math.max(1, ...d.histograma.map(h => h.n));
  return <div className="ad-form larga">
    <div className="ad-cab"><h2>Retenção</h2>
      <select value={janela} onChange={e => setJanela(e.target.value)}>
        {(janelas.length ? janelas : [{ id: "14d", rotulo: "14 dias" }]).map(j =>
          <option key={j.id} value={j.id}>{j.rotulo}</option>)}</select></div>
    {/* A janela curta troca a PERGUNTA, e a tela tem que dizer isso — senão o mesmo título passa a cobrir
        dois recortes diferentes. "dia atual" é do relógio do banco, que pode não ser o do operador. */}
    {atividade ? <p className="ad-dim">Janela curta: os painéis medem <b>quem jogou</b> na janela, não quem
      criou conta nela. O corte é o relógio do servidor.</p> : null}

    {/* ⚠️ A visita é RELÓGIO DE PAREDE, e o subtítulo diz isso porque já não foi: ela era `sum(duration_s)`,
        soma de VIDAS, e descontava justamente o tempo em que a pessoa está na tela de morte olhando o jogo
        — quem morria aos 30 s, assistia 4 min e morria aos 30 s aparecia aqui como um minuto. As duas
        medidas ficam lado a lado de propósito: a distância entre elas é a tela de morte, o pódio e o
        anúncio, e é ela que diz se o problema é a partida ou o que vem depois dela. */}
    <h3>A visita <small className="ad-dim">a resposta à pergunta dos 3 minutos — quanto a pessoa FICA, não
      quanto ela joga. É o único painel que não muda com a janela: ele sempre mediu atividade</small></h3>
    {v && v.visitas ? <div className="ad-kpis">
      <div className="kpi"><b>{v.pct_3min}%</b><span>passam de 3 min</span></div>
      <div className="kpi"><b>{tempo(v.mediana_s)}</b><span>mediana da visita</span></div>
      <div className="kpi"><b>{tempo(v.mediana_jogo_s)}</b><span>disso, em partida</span></div>
      <div className="kpi"><b>{num(v.visitas)}</b><span>visitas</span></div>
      <div className="kpi"><b>{v.vidas_por_visita}</b><span>vidas por visita</span></div>
    </div> : <div className="vazio">nenhuma visita no período</div>}

    <h3>{atividade ? "As vidas da janela" : "A primeira vida"} <small className="ad-dim">{atividade
      ? "toda vida encerrada na janela" : "de quem criou conta no período"}</small></h3>
    {p && p.n ? <>
      <div className="ad-kpis">
        <div className="kpi"><b>{tempo(p.mediana_s)}</b><span>mediana</span></div>
        <div className="kpi"><b>{tempo(p.p90_s)}</b><span>p90</span></div>
        <div className="kpi"><b>{pc(p.acima_3min, p.n)}</b><span>acima de 3 min</span></div>
        <div className="kpi"><b>{num(p.massa_media)}</b><span>massa média</span></div>
      </div>
      <div className="ad-barras">{d.histograma.map(h => <div key={h.balde} className="bar" title={`${h.n} vidas`}>
        <i style={{ width: (100 * h.n / maxH) + "%" }} /><span>{h.balde > 20 ? "10min+" : `${(h.balde - 1) * 30}s`}</span><b>{h.n}</b></div>)}</div>
    </> : <div className="vazio">nenhuma conta nova jogou no período</div>}

    <h3>{atividade ? "Quem mata" : "Quem mata o novato"} <small className="ad-dim">razão = massa do algoz ÷ massa da vítima</small></h3>
    <div className="ad-rolo"><table className="ad-tab">
      <thead><tr><th>fim</th><th>algoz</th><th>via</th><th className="n">n</th><th className="n">tempo médio</th>
        <th className="n">massa algoz</th><th className="n">massa vítima</th><th className="n">razão</th></tr></thead>
      <tbody>{d.algoz.map((a, i) => <tr key={i}>
        <td>{a.cause}</td><td>{a.algoz}</td><td>{a.via}</td><td className="n">{num(a.n)}</td>
        <td className="n">{tempo(a.s_medio)}</td><td className="n">{a.massa_algoz == null ? "—" : num(a.massa_algoz)}</td>
        <td className="n">{num(a.massa_vitima)}</td><td className="n">{a.razao == null ? "—" : a.razao + "×"}</td></tr>)}
        {!d.algoz.length ? <tr><td colSpan={8} className="vazio">nada ainda</td></tr> : null}</tbody></table></div>

    <h3>{atividade ? "Funil por hora" : "Funil por dia"} <small className="ad-dim">{atividade
      ? "contas ativas → passaram de 3 min" : "contas criadas → jogaram → passaram de 3 min"}</small></h3>
    <div className="ad-rolo"><table className="ad-tab">
      <thead><tr><th>{atividade ? "hora" : "dia"}</th><th>origem</th><th className="n">contas</th>
        {/* "jogaram" seria 100% por construção no modo atividade — a base É quem jogou. Coluna cravada
            num valor não informa nada, só ocupa a linha. */}
        {atividade ? null : <th className="n">jogaram</th>}
        <th className="n">3 min+</th><th className="n">2+ vidas</th><th className="n">tempo médio</th></tr></thead>
      <tbody>{d.funil.map((f, i) => <tr key={i}>
        <td>{dt(f.dia).split(",")[0]}</td><td title={f.origem}>{portalDe(f.origem)}</td><td className="n">{num(f.contas)}</td>
        {atividade ? null : <td className="n">{num(f.jogaram)} <em>{pc(f.jogaram, f.contas)}</em></td>}
        <td className="n">{num(f.tres_min)} <em>{pc(f.tres_min, f.contas)}</em></td>
        <td className="n">{num(f.duas_vidas)}</td><td className="n">{tempo(f.s_medio)}</td></tr>)}
        {!d.funil.length ? <tr><td colSpan={atividade ? 6 : 7} className="vazio">{atividade
          ? "ninguém jogou na janela" : "nenhuma conta criada no período"}</td></tr> : null}</tbody></table></div>

    {/* ⚠️ COORTES SÓ EM JANELA DE DIAS, e o servidor devolve lista vazia nas curtas: o painel compara
        `dia + interval '1 day'`, ou seja é DIÁRIO por definição. Numa hora ele daria uma linha com
        D1/D7/D30 zerados — três colunas de zero que se leem como "ninguém volta". */}
    {atividade ? <><h3>Coortes <small className="ad-dim">só em janela de dias — D1/D7/D30 é medida
      diária</small></h3><div className="vazio">escolha 7 dias ou mais</div></> : <>
    <h3>Coortes <small className="ad-dim">quantos voltaram no dia seguinte, na semana e no mês</small></h3>
    <div className="ad-rolo"><table className="ad-tab">
      <thead><tr><th>dia</th><th className="n">coorte</th><th className="n">D1</th><th className="n">D7</th><th className="n">D30</th><th className="n">voltou</th></tr></thead>
      <tbody>{d.coortes.map((c, i) => <tr key={i}>
        <td>{dt(c.dia).split(",")[0]}</td><td className="n">{num(c.coorte)}</td>
        <td className="n">{num(c.d1)}</td><td className="n">{num(c.d7)}</td><td className="n">{num(c.d30)}</td>
        <td className="n">{num(c.voltou)} <em>{pc(c.voltou, c.coorte)}</em></td></tr>)}
        {!d.coortes.length ? <tr><td colSpan={6} className="vazio">sem coortes no período</td></tr> : null}</tbody></table></div></>}
  </div>;
}

function Aviso({ erro }) {
  const [text, setText] = useState(""), [level, setLevel] = useState("info"), [ttl, setTtl] = useState(12000), [r, setR] = useState(null);
  const mandar = async () => {
    if (!text.trim()) return;
    if (!confirm("Mandar este aviso para TODOS os jogadores em partida?")) return;
    try { setR(await api.broadcast(text, level, ttl)); setText(""); } catch (e) { erro(e.message); }
  };
  return <div className="ad-form">
    <div className="ad-cab"><h2>Aviso global</h2></div>
    <p className="dica">Chega a quem está EM PARTIDA: uma faixa no alto da tela e uma linha no chat.
      Quem está no menu não recebe.</p>
    <textarea maxLength={200} value={text} onChange={e => setText(e.target.value)} placeholder="Manutenção em 10 minutos." />
    <div className="ad-acoes">
      <span className="cont">{text.length}/200</span>
      <select value={level} onChange={e => setLevel(e.target.value)}><option value="info">informação</option><option value="warn">alerta</option></select>
      <select value={ttl} onChange={e => setTtl(+e.target.value)}><option value={8000}>8 s</option><option value={12000}>12 s</option><option value={30000}>30 s</option></select>
      <button className="pri" onClick={mandar} disabled={!text.trim()}>Mandar</button>
    </div>
    <div className={"previa " + level}><i>{level === "warn" ? "⚠️" : "📣"}</i><span>{text || "prévia da faixa"}</span></div>
    {r ? <div className="ad-ok">entregue a {r.delivered} jogador(es) em {r.rooms} sala(s)
      {r.shards ? <> · {r.shards.map((s, i) => <span key={i} className={"tag " + (s.ok ? "ok" : "off")}>shard {s.shard != null ? s.shard : "?"}: {s.ok ? s.delivered : "falhou"}</span>)}</> : null}</div> : null}
  </div>;
}

// ── PARÂMETROS ───────────────────────────────────────────────────────────────
// A tela é montada INTEIRAMENTE a partir do descritor que o servidor manda (shared/src/tunables.js): as
// seções saem de `grupo`, e que controle desenhar sai de `type`. Parâmetro novo aparece aqui — na seção
// certa e com o controle certo — sem uma linha de painel.
// ⚠️ CARTÕES, e não uma tabela. Cada parâmetro tem cinco informações (nome, chave, valor, padrão e
// faixa) e um controle, e nenhuma delas é comparável entre linhas — ninguém lê "0,002" contra "600" em
// coluna. Numa tabela isso vira uma coluna larga de rótulos e quatro estreitas de números soltos, e o
// controle, que é a única coisa clicável, fica espremido no meio. O cartão põe o controle no centro e a
// metainformação embaixo, em voz baixa, que é a hierarquia real desta tela.
function Parametros({ erro }) {
  const [ts, setTs] = useState([]), [grupos, setGrupos] = useState([]), [edit, setEdit] = useState({}), [busca, setBusca] = useState("");
  const [aba, setAba] = useState("");
  const carregar = async () => {
    try { const r = await api.settings(); setTs(r.tunables); setGrupos(r.grupos || []); }
    catch (e) { erro(e.message); }
  };
  useEffect(() => { carregar(); }, []);
  // ⚠️ O valor vai CRU. Com `Number()` aqui, o tipo de conversa viraria NaN a caminho do servidor — o
  // descritor é quem sabe converter, e ele mora do outro lado.
  const salvar = async (t, v) => {
    try { await api.setSetting(t.key, v); setEdit(e => ({ ...e, [t.key]: undefined })); carregar(); }
    catch (e) { erro(e.message); }
  };
  const voltar = async t => { try { await api.resetSetting(t.key); setEdit(e => ({ ...e, [t.key]: undefined })); carregar(); } catch (e) { erro(e.message); } };

  const q = busca.trim().toLowerCase();
  const casa = t => !q || t.label.toLowerCase().includes(q) || t.key.toLowerCase().includes(q);
  // Seção sem nenhum parâmetro não é desenhada; o que sobrar de um grupo não declarado cai em "Outros",
  // que é a rede de segurança para um descritor com `grupo` errado — melhor visível do que sumido.
  const secoes = [...grupos, ["", "Outros"]]
    .map(([g, titulo]) => [titulo, ts.filter(t => (t.grupo || "") === g && casa(t))])
    .filter(([, itens]) => itens.length);
  const mudados = ts.filter(t => t.changed).length;

  const cartao = t => {
    // só 'both' é fixo: a FÍSICA do cliente lê aquele número e a rota recusa (501). 'wire' é gravável —
    // o servidor entrega o valor ao cliente no JSON da sala (ver wireValues/aplicaWire em shared/tunables).
    const fixo = t.scope === "both";
    const sujo = edit[t.key] !== undefined;
    const val = sujo ? edit[t.key] : t.value;
    const rotulo = o => (t.options.find(x => x.v === o) || {}).label || o;
    return <article key={t.key} className={"pm" + (t.changed ? " mudado" : "") + (fixo ? " fixo" : "")}>
      <header>
        <b>{t.label}</b>
        {t.changed ? <span className="tag warn">alterado</span> : null}
      </header>
      <code>{t.key}</code>
      <div className="pm-campo">
        {fixo
          ? <span className="pm-ro">{num(t.value)} <small>{t.unit}</small></span>
          : t.type === "opt"
            // A escolha grava no CHANGE: um `<select>` com "Salvar" ao lado é um passo a mais para uma
            // decisão que já foi tomada no instante em que o item foi escolhido.
            ? <select value={val} onChange={e => salvar(t, e.target.value)}>
                {t.options.map(o => <option key={o.v} value={o.v}>{o.label}</option>)}
              </select>
            : t.type === "bool"
              // Mesmo padrão do `opt`: grava no clique, sem Salvar/Cancelar. `.checked`, não `.value`
              // — um checkbox não tem valor booleano de verdade em `.value`.
              ? <label className="pm-bool">
                  <input type="checkbox" checked={!!val} onChange={e => salvar(t, e.target.checked)} />
                  {val ? "Exibindo" : "Oculto"}
                </label>
              : <><input type="number" min={t.min} max={t.max} step={t.step} value={val}
                    onChange={e => setEdit(x => ({ ...x, [t.key]: e.target.value }))}
                    onKeyDown={e => { if (e.key === "Enter" && sujo) salvar(t, Number(edit[t.key])); }} />
                 {t.unit ? <small>{t.unit}</small> : null}</>}
      </div>
      <footer>
        <span className="pm-meta">
          {t.type === "opt"
            ? <>padrão <i>{rotulo(t.def)}</i></>
            : t.type === "bool"
              ? <>padrão <i>{t.def ? "Exibindo" : "Oculto"}</i></>
              : <>padrão <i>{num(t.def)}</i> · faixa <i>{num(t.min)} – {num(t.max)}</i></>}
        </span>
        <span className="pm-acoes">
          {fixo ? <em>lido pela física do cliente</em> : null}
          {sujo ? <button className="pri" onClick={() => salvar(t, Number(edit[t.key]))}>Salvar</button> : null}
          {sujo ? <button onClick={() => setEdit(x => ({ ...x, [t.key]: undefined }))}>Cancelar</button> : null}
          {!sujo && t.changed ? <button onClick={() => voltar(t)}>Restaurar</button> : null}
        </span>
      </footer>
    </article>;
  };

  // ⚠️ A ABA ATIVA precisa sobreviver ao `carregar()` (que troca `grupos` inteiro depois de cada gravação)
  // e a um grupo que sumiu. `visiveis` é a lista de abas DEPOIS do filtro: com a busca no ar, uma aba sem
  // resultado não deve existir para ser clicada.
  const visiveis = secoes.map(([titulo]) => titulo);
  const atual = visiveis.includes(aba) ? aba : visiveis[0];
  // ⚠️ Com BUSCA no ar a aba é ignorada e TODOS os grupos que casam aparecem: quem digita num campo
  // "filtrar…" espera achar a chave onde quer que ela esteja, e não "nada com esse nome" porque o
  // resultado caiu na aba de trás. É o mesmo motivo pelo qual a contagem de cada aba já vem filtrada.
  const mostrar = q ? secoes : secoes.filter(([titulo]) => titulo === atual);

  return <div className="pm-tela">
    <div className="pm-topo">
      <div>
        <h2>Parâmetros de jogo</h2>
        <p className="dica">Valem para as salas deste momento em diante, em todos os shards.
          {mudados ? <> <b>{mudados}</b> fora do padrão.</> : null}</p>
      </div>
      <input className="pm-busca" type="search" placeholder="filtrar…" value={busca}
        onChange={e => setBusca(e.target.value)} />
    </div>
    {/* A lista cresceu para 40 parâmetros em 10 grupos, e uma página corrida põe o teto do ímã ao lado do
        tamanho do mundo como se fossem a mesma decisão. As abas saem do MESMO descritor que já dava as
        seções — grupo novo aparece aqui sem uma linha de painel. */}
    <div className="pm-corpo">
      <aside className="pm-abas" role="tablist" aria-label="Grupos de parâmetros">
        {secoes.map(([titulo, itens]) => {
          const fora = itens.filter(t => t.changed).length;
          return <button key={titulo} role="tab" aria-selected={titulo === atual}
            className={"pm-aba" + (titulo === atual && !q ? " on" : "")} onClick={() => { setAba(titulo); setBusca(""); }}>
            <span>{titulo}</span>
            <i className="tag mudo">{itens.length}</i>
            {fora ? <i className="tag warn">{fora}</i> : null}
          </button>;
        })}
      </aside>
      <div className="pm-conteudo">
        {mostrar.map(([titulo, itens]) => <section key={titulo} className="pm-grupo">
          {q ? <h3>{titulo} <span className="tag mudo">{itens.length}</span></h3> : null}
          <div className="pm-grade">{itens.map(cartao)}</div>
        </section>)}
        {!secoes.length ? <p className="vazio">{ts.length ? "nada com esse nome" : "…"}</p> : null}
      </div>
    </div>
  </div>;
}

function Auditoria({ erro }) {
  const [rows, setRows] = useState([]), [carregando, setCarregando] = useState(false);
  const [ord, setOrd] = useState({ by: "id", dir: "desc" }), [pag, setPag] = useState({ more: false, next: null });
  // `detail` é jsonb e não entra na lista branca do servidor: ordenar jsonb ordena pela representação
  // interna, que não é nada que um humano tenha pedido. Por isso a última coluna sai sem `col`.
  const carregar = async (cursor = null) => {
    setCarregando(true);
    try { const p = new URLSearchParams({ by: ord.by, dir: ord.dir });
      if (cursor && cursor.before != null) p.set("before", cursor.before);
      if (cursor && cursor.offset != null) p.set("offset", cursor.offset);
      const r = await api.audit("?" + p);
      setRows(cursor ? rs => rs.concat(r.rows) : r.rows);
      if (r.by) setOrd({ by: r.by, dir: r.dir });
      setPag({ more: !!r.more, next: r.next || null }); }
    catch (e) { erro(e.message); } finally { setCarregando(false); }
  };
  useEffect(() => { carregar(); }, [ord.by, ord.dir]);
  return <div className="ad-form larga">
    <div className="ad-cab"><h2>Auditoria</h2></div>
    <div className="ad-rolo"><table className="ad-tab"><thead><tr>
      <Th col="at" ord={ord} set={setOrd}>quando</Th>
      <Th col="admin" ord={ord} set={setOrd} padrao="asc">quem</Th>
      <Th col="action" ord={ord} set={setOrd} padrao="asc">ação</Th>
      <Th col="target" ord={ord} set={setOrd} padrao="asc">alvo</Th>
      <Th>detalhe</Th></tr></thead>
      <tbody>{rows.map(r => <tr key={r.id}><td>{dt(r.at)}</td><td>{r.adminNick || "#" + r.adminId}</td>
        <td><b>{r.action}</b></td><td>{r.target || "—"}</td><td className="ua ad-mono">{JSON.stringify(r.detail)}</td></tr>)}
        {!rows.length && !carregando ? <tr><td colSpan={5} className="vazio">nada ainda</td></tr> : null}</tbody></table></div>
    <Paginacao n={rows.length} more={pag.more} carregando={carregando} onMais={() => carregar(pag.next)} />
  </div>;
}

function App() {
  const [admin, setAdmin] = useState(null), [tela, setTela] = useState(rota()), [msg, setMsg] = useState(null), [pronto, setPronto] = useState(false);
  const erro = (t, tipo) => { setMsg(t); if (tipo === "ok") setTimeout(() => setMsg(null), 2000); };
  useEffect(() => { setOnAuthFail(() => setAdmin(null));
    if (!getToken()) { setPronto(true); return; }
    api.me().then(r => setAdmin(r.admin)).catch(() => {}).finally(() => setPronto(true));
  }, []);
  useEffect(() => { const f = () => setTela(rota()); addEventListener("popstate", f); return () => removeEventListener("popstate", f); }, []);
  // ⚠️ `ad` junto com `vazio`: este retorno acontece ANTES de o shell `.ad` existir, e os tokens do painel
  // (--dim inclusive) são declarados EM `.ad`. Sem a classe, a cor do "…" de boot é o que o CSS do jogo
  // estiver pintando no body naquela hora.
  if (!pronto) return <div className="ad vazio">…</div>;
  if (!admin) return <Login onOk={setAdmin} />;
  const T = { vivo: AoVivo, usuarios: Usuarios, salas: Salas, retencao: Retencao, aviso: Aviso, parametros: Parametros, auditoria: Auditoria }[tela] || Usuarios;
  return <div className="ad">
    <header className="ad-topo">
      <b>warspace.io <span>admin</span></b>
      <nav>{TELAS.map(([k, l]) => <button key={k} className={k === tela ? "on" : ""} onClick={() => vaPara(k)}>{l}</button>)}</nav>
      <span className="quem">{admin.nick}<button onClick={() => { api.logout().catch(() => {}); setToken(""); setAdmin(null); }}>sair</button></span>
    </header>
    <Erro e={msg} onClose={() => setMsg(null)} />
    {/* ⚠️ `ad-centro` e não `ad-wrap` — um bloqueador de anúncios esconde a segunda (ver admin.css). */}
    <main><div className="ad-centro"><T erro={erro} /></div></main>
  </div>;
}

export function mountAdmin() {
  document.title = "warspace.io — admin";
  // ⚠️ `data-admin` no <html>, e não um `:has()` no CSS: o `index.html` carrega os TEMAS do jogo, que
  // pintam `body`/`#app` com a cor do relógio. O painel não é tematizado — uma ferramenta de operação que
  // troca de cor às 16h é uma ferramenta pior —, então ele precisa de um seletor que ganhe com folga.
  document.documentElement.dataset.admin = "1";
  createRoot(document.getElementById("app")).render(<App />);
}
