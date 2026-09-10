// ── SKINS: a arte sai da build ────────────────────────────────────────────────
// Duas coisas moram nesta tela, e vale não confundi-las:
//   TROCAR A ARTE de uma skin que já existe no código. É por aqui que as 35 caricaturas (84-118) saíram do
//     pacote: o id continua o mesmo, `user_skins` fica intacta, e o que muda é de onde a imagem vem.
//   CRIAR uma skin que não existe na build (`source:'db'`, ids 128-255) — o pedido literal de "criar novas
//     skins sem mexer na build".
//
// ⚠️ EDITAR nome/preço/cor de uma skin de CÓDIGO é recusado pelo servidor, e o motivo é que a edição se
// desfaria sozinha: `seedSkins` roda no BOOT de todo pod e reescreveria os campos do bundle no restart
// seguinte. O painel diria "salvo" e a mudança sumiria — o que uma skin de código aceita daqui é só a arte.
// ⚠️ A FAIXA 128-255 NÃO É GOSTO: `skinId` viaja como u8 no registro PLAYERS. Um id fora dela colide com
// uma skin de código ou vira o Planeta Padrão na tela de todo mundo, sem erro nenhum.
// (Texto em pt-BR cravado: o /admin é a exceção declarada ao i18n.)
import React, { useEffect, useState } from "react";
import { api } from "./api.js";

const RARIDADES = ["free", "common", "rare", "epic", "legendary", "earned", "secret"];
const VAZIA = { id: "", name: "", rarity: "rare", price: 1200, levelReq: 0, color: "#4ECDC4", accent: "", emoji: "🪐", desc: "" };

export default function Skins({ erro }) {
  const [linhas, setLinhas] = useState([]);
  const [faixa, setFaixa] = useState({ idMin: 128, idMax: 255 });
  const [sel, setSel] = useState(null);      // a skin aberta no formulário
  const [form, setForm] = useState(VAZIA);
  const [busca, setBusca] = useState("");
  const [so, setSo] = useState("");          // "" tudo · "db" só as de banco · "art" só as que têm arte
  const [v, setV] = useState(0);             // fura o cache da prévia depois de um upload

  const carregar = async () => {
    try { const r = await api.skins(); setLinhas(r.skins || []); if (r.idMin) setFaixa({ idMin: r.idMin, idMax: r.idMax }); }
    catch (e) { erro(e.message); }
  };
  useEffect(() => { carregar(); }, []);

  const q = busca.trim().toLowerCase();
  const vis = linhas.filter(s =>
    (!q || String(s.id) === q || (s.name || "").toLowerCase().includes(q)) &&
    (so !== "db" || s.source === "db") && (so !== "art" || s.art_hash));

  // O PRÓXIMO ID LIVRE da faixa de banco: sem isto o admin tem que descobrir na mão qual sobrou, e um id
  // repetido é recusado pelo servidor com 409 depois de ele já ter preenchido o formulário inteiro.
  const proximoId = () => {
    const usados = new Set(linhas.map(s => s.id));
    for (let i = faixa.idMin; i <= faixa.idMax; i++) if (!usados.has(i)) return i;
    return "";
  };
  const novo = () => { setSel({ novo: true }); setForm({ ...VAZIA, id: proximoId() }); };
  const abrir = s => { setSel(s); setForm({ id: s.id, name: s.name || "", rarity: s.rarity || "rare", price: s.price | 0,
    levelReq: s.level_req | 0, color: s.color || "#4ECDC4", accent: s.accent || "", emoji: s.emoji || "🪐", desc: s.descr || "" }); };

  const salvar = async () => {
    try { await api.saveSkin(Number(form.id), { ...form, price: Number(form.price) | 0, levelReq: Number(form.levelReq) | 0 });
      erro("skin salva", "ok"); setSel(null); carregar(); }
    catch (e) { erro(e.message); }
  };
  const ligar = async (s, on) => { try { await api.setSkinActive(s.id, on); carregar(); } catch (e) { erro(e.message); } };
  const subir = async (id, file) => {
    if (!file) return;
    try { const r = await api.uploadSkinArt(id, file); setV(x => x + 1);
      erro(`arte no ar (${r.w}px, ${Math.round(r.bytes / 1024)} KB)`, "ok"); carregar(); }
    catch (e) { erro(e.message); }
  };

  const deBanco = sel && (sel.novo || sel.source === "db");
  return <div className="ad-split">
    <section className="ad-lista">
      <div className="ad-cab">
        <h2>Skins <i>{vis.length}/{linhas.length}</i></h2>
        <div className="ad-form">
          <input placeholder="filtrar por nome ou id…" value={busca} onChange={e => setBusca(e.target.value)} />
          <select value={so} onChange={e => setSo(e.target.value)}>
            <option value="">todas</option><option value="db">só as do banco</option><option value="art">só com arte</option>
          </select>
          <button className="pri" onClick={novo}>+ nova skin</button>
        </div>
      </div>
      <div className="ad-rolo"><table className="ad-tab click">
        <thead><tr><th>id</th><th>nome</th><th>origem</th><th>arte</th><th className="n">preço</th><th>estado</th></tr></thead>
        <tbody>{vis.map(s => <tr key={s.id} onClick={() => abrir(s)} className={sel && sel.id === s.id ? "sel" : ""}>
          <td>{s.id}</td>
          <td>{s.emoji} {s.name}</td>
          <td><span className={"tag " + (s.source === "db" ? "ok" : "")}>{s.source === "db" ? "banco" : "código"}</span></td>
          <td>{s.art_hash ? <span className="tag ok">{s.w}px</span> : <span className="tag off">—</span>}</td>
          <td className="n">{s.price || "—"}</td>
          <td>{s.active ? <span className="tag ok">ativa</span> : <span className="tag off">desligada</span>}</td>
        </tr>)}</tbody>
      </table></div>
      {vis.length ? null : <p className="vazio">nenhuma skin com esse filtro</p>}
    </section>

    {!sel ? null : <section className="ad-detalhe">
      <div className="ad-cab"><h3>{sel.novo ? "Skin nova" : `${form.emoji} ${form.name}`}</h3>
        <button className="x" onClick={() => setSel(null)}>fechar</button></div>

      {/* A PRÉVIA vem da rota do PAINEL, e não da pública: aquela exige `active`, e o fluxo prescrito aqui é
          "sobe a arte → confere → ativa". Com uma rota só, a janela em que o admin precisa da prévia seria
          exatamente a janela em que ela responde 404. */}
      {sel.novo ? null : <div className="sk-previa">
        {sel.art_hash ? <img src={api.skinArtUrl(sel.id, v)} alt="" width="96" height="96" /> : <div className="vazio">sem arte</div>}
        <label className="pri sk-upload">
          {sel.art_hash ? "trocar arte" : "subir arte"}
          <input type="file" accept="image/png,image/webp" hidden
            onChange={e => { subir(sel.id, e.target.files && e.target.files[0]); e.target.value = ""; }} />
        </label>
        <p className="vazio">PNG ou WebP, QUADRADA, 64–512 px, até 48 KB. Quadrada porque ela é desenhada dentro de um disco.</p>
      </div>}

      {!deBanco
        ? <p className="vazio">Skin de CÓDIGO: só a arte é editável aqui. Nome, preço e cor vêm de
            <code> shared/src/skins.js</code> e são reescritos no boot de cada pod — o que fosse salvo aqui
            se desfaria sozinho no restart seguinte.</p>
        : <div className="ad-form sk-form">
            <label>id<input type="number" value={form.id} min={faixa.idMin} max={faixa.idMax} disabled={!sel.novo}
              onChange={e => setForm(f => ({ ...f, id: e.target.value }))} /></label>
            <label>nome<input value={form.name} maxLength={32} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></label>
            <label>emoji<input value={form.emoji} maxLength={4} onChange={e => setForm(f => ({ ...f, emoji: e.target.value }))} /></label>
            <label>raridade<select value={form.rarity} onChange={e => setForm(f => ({ ...f, rarity: e.target.value }))}>
              {RARIDADES.map(r => <option key={r} value={r}>{r}</option>)}</select></label>
            <label>preço<input type="number" min="0" value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} /></label>
            <label>nível mínimo<input type="number" min="0" value={form.levelReq} onChange={e => setForm(f => ({ ...f, levelReq: e.target.value }))} /></label>
            <label>cor<input value={form.color} placeholder="#4ECDC4" onChange={e => setForm(f => ({ ...f, color: e.target.value }))} /></label>
            <label>acento<input value={form.accent} placeholder="#a9f3ec" onChange={e => setForm(f => ({ ...f, accent: e.target.value }))} /></label>
            <label className="sk-larga">descrição<input value={form.desc} maxLength={80} onChange={e => setForm(f => ({ ...f, desc: e.target.value }))} /></label>
            <div className="sk-acoes">
              <button className="pri" onClick={salvar}>salvar</button>
              {sel.novo ? null : sel.active
                ? <button className="per" onClick={() => ligar(sel, false)}>desligar</button>
                : <button onClick={() => ligar(sel, true)} disabled={!sel.art_hash}
                    title={sel.art_hash ? "" : "sem arte ela seria um disco liso à venda na loja"}>ativar</button>}
            </div>
            {sel.novo ? <p className="vazio">Ela nasce DESLIGADA: skin ativa sem arte é um disco liso à venda,
              e a loja cobra moedas por ela. Salve, suba a arte, confira, e só então ative.</p> : null}
          </div>}
    </section>}
  </div>;
}
