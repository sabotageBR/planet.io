// ── PAINEL /admin ────────────────────────────────────────────────────────────
// Mesma SPA, chunk próprio, carregado só quando alguém abre `/admin` (ver main.jsx — é o mesmo padrão do
// `?sfx`). Quem só joga não baixa um byte disto, e nenhuma linha de infraestrutura muda: o nginx do
// cliente já faz `try_files ... /index.html`, então `/admin` sempre serviu a SPA.
// O painel NÃO passa por `app.screen` nem por `body[data-screen]`, e o jogo não tem link para cá.
import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { api, getToken, setToken, setOnAuthFail } from "./api.js";
import "./admin.css";

const TELAS = [["usuarios", "Usuários"], ["salas", "Salas"], ["aviso", "Aviso global"], ["parametros", "Parâmetros"], ["auditoria", "Auditoria"]];
const rota = () => (location.pathname.replace(/^\/admin\/?/, "").split("/")[0] || "usuarios");
const vaPara = t => { history.pushState({}, "", "/admin/" + t); dispatchEvent(new PopStateEvent("popstate")); };
const dt = s => (s ? new Date(s).toLocaleString("pt-BR") : "—");
const num = n => Number(n || 0).toLocaleString("pt-BR");

function Erro({ e, onClose }) {
  if (!e) return null;
  return <div className="ad-erro" role="alert"><span>{e}</span><button onClick={onClose}>✕</button></div>;
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
  const buscar = async () => {
    setCarregando(true);
    try { const p = new URLSearchParams(); if (q) p.set("q", q); if (kind) p.set("kind", kind); if (banned) p.set("banned", banned);
      const r = await api.users("?" + p); setRows(r.users); }
    catch (e) { erro(e.message); } finally { setCarregando(false); }
  };
  useEffect(() => { buscar(); }, []);
  const abrir = async id => { try { setSel(await api.user(id)); } catch (e) { erro(e.message); } };
  const acao = async (fn, msg) => { try { await fn(); if (sel) setSel(await api.user(sel.user.id)); buscar(); if (msg) erro(msg, "ok"); } catch (e) { erro(e.message); } };
  return <div className="ad-split">
    <div className="ad-lista">
      <div className="ad-filtros">
        <input placeholder="nick, usuário, nome, e-mail ou id" value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === "Enter" && buscar()} />
        <select value={kind} onChange={e => setKind(e.target.value)}><option value="">todos</option><option value="registered">registrados</option><option value="guest">convidados</option></select>
        <select value={banned} onChange={e => setBanned(e.target.value)}><option value="">todos</option><option value="1">banidos</option><option value="0">livres</option></select>
        <button onClick={buscar}>Buscar</button>
      </div>
      <table className="ad-tab">
        <thead><tr><th>#</th><th>nick</th><th>tipo</th><th>xp</th><th>moedas</th><th>visto</th><th /></tr></thead>
        <tbody>{rows.map(u => <tr key={u.id} className={sel && sel.user.id === u.id ? "on" : ""} onClick={() => abrir(u.id)}>
          <td>{u.id}</td>
          <td>{u.nick}{u.name && u.name !== u.nick ? <em> {u.name}</em> : null}</td>
          <td>{u.kind === "registered" ? "conta" : "convidado"}</td>
          <td className="n">{num(u.xp)}</td><td className="n">{num(u.coins)}</td>
          <td>{dt(u.lastSeenAt)}</td>
          <td>{u.isAdmin ? <b className="tag adm">admin</b> : null}{u.bannedUntil && new Date(u.bannedUntil) > new Date() ? <b className="tag ban">banido</b> : null}</td>
        </tr>)}
        {!rows.length && !carregando ? <tr><td colSpan={7} className="vazio">nada encontrado</td></tr> : null}</tbody>
      </table>
    </div>
    {sel ? <Detalhe d={sel} acao={acao} fechar={() => setSel(null)} /> : <div className="ad-detalhe vazio">selecione uma conta</div>}
  </div>;
}

function Detalhe({ d, acao, fechar }) {
  const u = d.user, banido = u.bannedUntil && new Date(u.bannedUntil) > new Date();
  const [dias, setDias] = useState(7), [motivo, setMotivo] = useState(""), [moedas, setMoedas] = useState(0);
  return <div className="ad-detalhe">
    <div className="ad-cab"><h2>{u.nick} <small>#{u.id}</small></h2><button onClick={fechar}>✕</button></div>
    <dl>
      {/* o USUÁRIO é o nome de entrar (congelado no cadastro); o nick do topo é livre e o jogador troca */}
      <dt>usuário</dt><dd>{u.login || "—"}</dd>
      <dt>nome da conta</dt><dd>{u.name || "—"}</dd>
      <dt>e-mail</dt><dd>{u.email || "—"}</dd>
      <dt>tipo</dt><dd>{u.kind}{u.isAdmin ? " · administrador" : ""}</dd>
      <dt>país</dt><dd>{u.country || "—"}</dd>
      <dt>moedas</dt><dd>{num(u.coins)}</dd>
      <dt>XP · partidas · abates · mortes</dt><dd>{num(u.xp)} · {num(u.games)} · {num(u.kills)} · {num(u.deaths)}</dd>
      <dt>criada · vista</dt><dd>{dt(u.createdAt)} · {dt(u.lastSeenAt)}</dd>
      {banido ? <><dt>banida até</dt><dd className="ban">{dt(u.bannedUntil)} — {u.banReason || "sem motivo"}</dd></> : null}
    </dl>
    <div className="ad-acoes">
      {banido
        ? <button onClick={() => acao(() => api.ban(u.id, 0), "desbanido")}>Desbanir</button>
        : <><input type="number" min="1" max="3650" value={dias} onChange={e => setDias(+e.target.value)} style={{ width: 70 }} />
            <input placeholder="motivo" value={motivo} onChange={e => setMotivo(e.target.value)} />
            <button className="per" onClick={() => acao(() => api.ban(u.id, dias, motivo), "banido")}>Banir</button></>}
    </div>
    <div className="ad-acoes">
      <input type="number" value={moedas} onChange={e => setMoedas(+e.target.value)} style={{ width: 100 }} />
      <button onClick={() => acao(() => api.coins(u.id, moedas, "painel"), "moedas ajustadas")}>Somar moedas</button>
      <button onClick={() => acao(() => api.revoke(u.id), "sessões derrubadas")}>Derrubar sessões</button>
      <button className={u.isAdmin ? "per" : ""} onClick={() => acao(() => api.setAdmin(u.id, !u.isAdmin))}>{u.isAdmin ? "Tirar admin" : "Tornar admin"}</button>
    </div>
    <h3>Partidas recentes</h3>
    <table className="ad-tab mini"><tbody>{d.matches.map(m => <tr key={m.id}>
      <td>{dt(m.ended_at)}</td><td>{m.room_code}</td><td className="n">{num(m.score)}</td><td className="n">{num(m.max_mass)}</td><td>{m.cause}</td></tr>)}
      {!d.matches.length ? <tr><td className="vazio">nenhuma</td></tr> : null}</tbody></table>
    <h3>Sessões</h3>
    <table className="ad-tab mini"><tbody>{d.tokens.map(t => <tr key={t.id}>
      <td>{t.kind}</td><td>{dt(t.created_at)}</td><td>{t.revoked_at ? "revogado" : dt(t.expires_at)}</td>
      <td className="ua">{t.user_agent || "—"}</td></tr>)}</tbody></table>
  </div>;
}

function Salas({ erro }) {
  const [d, setD] = useState(null), [sel, setSel] = useState(null);
  const carregar = async () => { try { setD(await api.rooms()); } catch (e) { erro(e.message); } };
  useEffect(() => { carregar(); const t = setInterval(carregar, 5000); return () => clearInterval(t); }, []);
  const abrir = async code => { try { setSel((await api.room(code)).room); } catch (e) { erro(e.message); } };
  const remover = async (code, p) => {
    if (!confirm(`Remover ${p.name} da sala ${code}?`)) return;
    try { await api.kick(code, p.slot, p.sessionId, ""); setSel((await api.room(code)).room); } catch (e) { erro(e.message); }
  };
  const fechar = async code => {
    if (!confirm(`FECHAR a sala ${code}? Todo mundo é desconectado.`)) return;
    try { await api.closeRoom(code); setSel(null); carregar(); } catch (e) { erro(e.message); }
  };
  if (!d) return <div className="vazio">carregando…</div>;
  return <div className="ad-split">
    <div className="ad-lista">
      {d.shards ? <div className="ad-shards">{d.shards.map((s, i) => <span key={i} className={s.ok ? "ok" : "off"}>shard {s.shard != null ? s.shard : "?"} {s.ok ? "ok" : "sem resposta"}</span>)}</div> : null}
      <table className="ad-tab">
        <thead><tr><th>código</th><th>shard</th><th>modo</th><th>fase</th><th>humanos</th><th>bots</th></tr></thead>
        <tbody>{d.rooms.map(r => <tr key={r.code + r.shard} className={sel && sel.code === r.code ? "on" : ""} onClick={() => abrir(r.code)}>
          <td><b>{r.code}</b></td><td>{r.shard}</td><td>{r.mode === 1 ? "BR" : "livre"}</td><td>{r.phase}</td>
          <td className="n">{r.humans}</td><td className="n">{r.bots}</td></tr>)}
          {!d.rooms.length ? <tr><td colSpan={6} className="vazio">nenhuma sala ativa</td></tr> : null}</tbody>
      </table>
    </div>
    {sel ? <div className="ad-detalhe">
      <div className="ad-cab"><h2>Sala {sel.code}</h2>
        <div><button className="per" onClick={() => fechar(sel.code)}>Fechar sala</button><button onClick={() => setSel(null)}>✕</button></div></div>
      <table className="ad-tab">
        <thead><tr><th>slot</th><th>nome</th><th>nível</th><th>massa</th><th>estado</th><th>ip</th><th /></tr></thead>
        <tbody>{(sel.players || []).map(p => <tr key={p.slot}>
          <td>{p.slot}</td><td>{p.name}{p.country ? <em> {p.country}</em> : null}</td>
          <td className="n">{p.level || "—"}</td><td className="n">{num(p.mass)}</td>
          <td>{p.alive ? "vivo" : "morto"}{p.connected ? "" : " · caiu"}</td>
          <td className="ua">{p.ip || "—"}</td>
          <td><button className="per" onClick={() => remover(sel.code, p)}>Remover</button></td></tr>)}
          {!(sel.players || []).length ? <tr><td colSpan={7} className="vazio">só preenchimento</td></tr> : null}</tbody>
      </table>
    </div> : <div className="ad-detalhe vazio">selecione uma sala</div>}
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
    <h2>Aviso global</h2>
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
      {r.shards ? <> · {r.shards.map((s, i) => <span key={i} className={s.ok ? "ok" : "off"}>shard {s.shard != null ? s.shard : "?"}: {s.ok ? s.delivered : "falhou"}</span>)}</> : null}</div> : null}
  </div>;
}

// ── PARÂMETROS ───────────────────────────────────────────────────────────────
// A tela é montada INTEIRAMENTE a partir do descritor que o servidor manda (shared/src/tunables.js): as
// seções saem de `grupo`, e que controle desenhar sai de `type`. Parâmetro novo aparece aqui — na seção
// certa e com o controle certo — sem uma linha de painel.
function Parametros({ erro }) {
  const [ts, setTs] = useState([]), [grupos, setGrupos] = useState([]), [edit, setEdit] = useState({});
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
  const voltar = async t => { try { await api.resetSetting(t.key); carregar(); } catch (e) { erro(e.message); } };
  const val = t => (edit[t.key] !== undefined ? edit[t.key] : t.value);
  const sujo = t => edit[t.key] !== undefined;
  // Seção sem nenhum parâmetro não é desenhada; o que sobrar de um grupo não declarado cai em "Outros",
  // que é a rede de segurança para um descritor com `grupo` errado — melhor visível do que sumido.
  const secoes = [...grupos, ["", "Outros"]]
    .map(([g, titulo]) => [titulo, ts.filter(t => (t.grupo || "") === g)])
    .filter(([, linhas]) => linhas.length);

  const linha = t => <tr key={t.key} className={t.changed ? "mudado" : ""}>
    <td><b>{t.label}</b><em>{t.key}</em></td>
    <td className={t.type === "opt" ? "" : "n"}>
      {t.scope !== "server"
        ? <span>{num(t.value)}</span>
        : t.type === "opt"
          // A escolha grava no CHANGE: um `<select>` com botão "Salvar" ao lado é um passo a mais para
          // uma decisão que já foi tomada no instante em que o item foi escolhido.
          ? <select value={val(t)} onChange={e => salvar(t, e.target.value)}>
              {t.options.map(o => <option key={o.v} value={o.v}>{o.label}</option>)}
            </select>
          : <input type="number" min={t.min} max={t.max} step={t.step} value={val(t)}
              onChange={e => setEdit(x => ({ ...x, [t.key]: e.target.value }))} />}
      {t.unit ? <small> {t.unit}</small> : null}</td>
    <td className={t.type === "opt" ? "" : "n"}>
      {t.type === "opt" ? <small>{(t.options.find(o => o.v === t.def) || {}).label || t.def}</small> : num(t.def)}</td>
    <td className="n">{t.type === "opt" ? <small>{t.options.length} opções</small> : <small>{t.min} – {t.max}</small>}</td>
    <td>{t.scope === "server"
      ? <>{sujo(t) ? <button className="pri" onClick={() => salvar(t, Number(edit[t.key]))}>Salvar</button> : null}
         {t.changed ? <button onClick={() => voltar(t)}>Restaurar</button> : null}</>
      : <small className="dica">também lido pelo cliente</small>}</td>
  </tr>;

  return <div className="ad-form larga">
    <h2>Parâmetros de jogo</h2>
    <p className="dica">Valem para as salas deste momento em diante, em todos os shards. Os parâmetros que o
      CLIENTE também lê ficam desabilitados: mudá-los de um lado só faria a predição divergir.</p>
    {secoes.map(([titulo, linhas]) => <section key={titulo} className="ad-grupo">
      <h3>{titulo}</h3>
      <table className="ad-tab">
        <thead><tr><th>parâmetro</th><th>valor</th><th>padrão</th><th>faixa</th><th /></tr></thead>
        <tbody>{linhas.map(linha)}</tbody>
      </table>
    </section>)}
    {!secoes.length ? <p className="vazio">…</p> : null}
  </div>;
}

function Auditoria({ erro }) {
  const [rows, setRows] = useState([]);
  useEffect(() => { api.audit().then(r => setRows(r.rows)).catch(e => erro(e.message)); }, []);
  return <div className="ad-form larga"><h2>Auditoria</h2>
    <table className="ad-tab"><thead><tr><th>quando</th><th>quem</th><th>ação</th><th>alvo</th><th>detalhe</th></tr></thead>
      <tbody>{rows.map(r => <tr key={r.id}><td>{dt(r.at)}</td><td>{r.adminNick || "#" + r.adminId}</td>
        <td><b>{r.action}</b></td><td>{r.target || "—"}</td><td className="ua">{JSON.stringify(r.detail)}</td></tr>)}
        {!rows.length ? <tr><td colSpan={5} className="vazio">nada ainda</td></tr> : null}</tbody></table></div>;
}

function App() {
  const [admin, setAdmin] = useState(null), [tela, setTela] = useState(rota()), [msg, setMsg] = useState(null), [pronto, setPronto] = useState(false);
  const erro = (t, tipo) => { setMsg(t); if (tipo === "ok") setTimeout(() => setMsg(null), 2000); };
  useEffect(() => { setOnAuthFail(() => setAdmin(null));
    if (!getToken()) { setPronto(true); return; }
    api.me().then(r => setAdmin(r.admin)).catch(() => {}).finally(() => setPronto(true));
  }, []);
  useEffect(() => { const f = () => setTela(rota()); addEventListener("popstate", f); return () => removeEventListener("popstate", f); }, []);
  if (!pronto) return <div className="vazio">…</div>;
  if (!admin) return <Login onOk={setAdmin} />;
  const T = { usuarios: Usuarios, salas: Salas, aviso: Aviso, parametros: Parametros, auditoria: Auditoria }[tela] || Usuarios;
  return <div className="ad">
    <header className="ad-topo">
      <b>warspace.io <span>admin</span></b>
      <nav>{TELAS.map(([k, l]) => <button key={k} className={k === tela ? "on" : ""} onClick={() => vaPara(k)}>{l}</button>)}</nav>
      <span className="quem">{admin.nick}<button onClick={() => { api.logout().catch(() => {}); setToken(""); setAdmin(null); }}>sair</button></span>
    </header>
    <Erro e={msg} onClose={() => setMsg(null)} />
    <main><T erro={erro} /></main>
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
