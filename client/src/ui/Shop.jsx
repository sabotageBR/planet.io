// LOJA: busca, ordenação, filtro de raridade/"adquiridas", grade de cartões e MODAL de confirmação.
// O painel de detalhe ficava embaixo da grade, fora da vista de quem tinha acabado de clicar num cartão:
// selecionar e confirmar aconteciam a uma tela de distância um do outro, e ninguém descobria que ainda
// faltava confirmar. O modal põe as duas coisas no mesmo lugar — e mantém a trava original: clicar num
// cartão nunca gasta moeda, só abre a pergunta.
import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { SKINS, skinById, RARITY_ORDER, RARITY_COLORS, AD_GIFT_SKINS } from "@warspace/shared";
import { skinName, skinDesc, rarityLabel } from "../i18n/catalog.js";
import { currentLang } from "../i18n/index.js";
import { useStore } from "../state/store.js";
import { app } from "../state/app.js";
import { buySkin, equipSkin, ganharSkinAnuncio, loadSkins, toast } from "../state/actions.js";
import { sfx } from "../audio/index.js";
import { useLabels, useTheme } from "../hooks/useTheme.js";
import { ScreenHeader, Screen } from "./bits.jsx";
import SkinPreview from "./SkinPreview.jsx";
import AvatarPicker from "./AvatarPicker.jsx";
import { SEM_CONTA } from "../portal/flags.js";
import { portal } from "../portal/index.js";
import { fmt } from "./format.js";

const norm = s => String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");   // busca sem acento
export default function Shop({ on }) {
  return <Screen id="shop" on={on} className="shop-wrap">{on ? <Body /> : null}</Screen>;
}
function Body() {
  const LB = useLabels(), theme = useTheme(), RC = (theme && theme.rarityColor) || RARITY_COLORS; const session = useStore(app, s => s.session);
  const user = session.user || {}, owned = session.skins, coins = user.coins || 0, eqId = user.equippedSkin ?? 0, eq = skinById(eqId);
  const [filter, setFilter] = useState("all"), [q, setQ] = useState(""), [sort, setSort] = useState("rarity"), [mineOnly, setMineOnly] = useState(false);
  const [sel, setSel] = useState(null);   // null = modal fechado; clicar num cartão é que o abre
  useEffect(() => { loadSkins(); }, []);
  const nivel = (session.stats && session.stats.level) | 0 || 1;
  // A ordem importa: NÍVEL antes de MOEDA. "Junte 16 mil moedas" para uma skin que ela ainda não pode
  // comprar de jeito nenhum é a informação errada.
  const stateOf = s => { const own = owned.includes(s.id);
    return s.id === eqId ? "eq" : own ? "owned" : s.rarity === "secret" ? "secret" : s.unlockKey ? "locked"
      : (s.levelReq || 0) > nivel ? "lowlevel" : s.price > coins ? "poor" : "buyable"; };
  // O anúncio DÁ a skin (`AD_GIFT_SKINS`, hoje as três mascotes), e comprar com moeda continua valendo —
  // por isso não é um ramo de `stateOf` (que decide UMA ação), e sim uma condição à parte que soma um
  // botão extra no modal. Antes isto era `AD_REWARD_SKINS` e o vídeo só DESTRAVAVA a compra; ver o
  // comentário de `AD_GIFT_SKINS` em shared/src/skins.js para por que a regra virou.
  const canWatchAd = (s, st) => AD_GIFT_SKINS.includes(s.id) && portal.temRecompensa && st !== "eq" && st !== "owned";
  const list = useMemo(() => {
    const nq = norm(q);
    // ⚠️ `SEM_CONTA` também tira a Retrato da grade: sem foto ela é uma lendária de 25 000 moedas que
    // não faz absolutamente nada — pior que não existir.
    const out = SKINS.filter(s => (filter === "all" || s.rarity === filter) && (!mineOnly || owned.includes(s.id)) && (!nq || norm(skinName(s)).includes(nq))
      && !(SEM_CONTA && s.pattern === "avatar"));
    const ri = s => RARITY_ORDER.indexOf(s.rarity);
    out.sort(sort === "price" ? (a, b) => a.price - b.price || ri(a) - ri(b)
      : sort === "name" ? (a, b) => skinName(a).localeCompare(skinName(b), currentLang())
      : (a, b) => ri(a) - ri(b) || a.price - b.price);
    return out;
  }, [filter, q, sort, mineOnly, owned]);
  // As `secret` (easter eggs e conquistas ocultas) saem da conta: ninguém as compra nem as ganha pela
  // loja, e com elas no denominador a barra de progresso nunca chegaria a 100%.
  const TOTAL_VIS = SKINS.filter(s => s.rarity !== "secret").length;
  const ownedVis = owned.filter(id => { const s = skinById(id); return s && s.rarity !== "secret"; }).length;
  const rotulo = (s, st) => st === "eq" ? "" : st === "owned" ? LB.equip : st === "secret" ? "???" : st === "locked" ? skinDesc(s)
    : st === "lowlevel" ? `🔒 ${LB.levelReq.replace("{n}", s.levelReq)}` : `${LB.coinIcon} ${fmt(s.price)}`;
  return <>
    <ScreenHeader title={LB.shopTitle} />
    {/* ⚠️ **A LOJA FICOU COM BUSCA E GRADE, E SÓ.** Saíram QUATRO blocos que moravam entre o título e a
        primeira skin — o cartão da skin equipada, a barra de progresso N/50, o seletor de ordenação e a
        fileira de nove chips (Todas · Adquiridas · 7 raridades). Somados, eles empurravam a grade para
        baixo da dobra num frame de portal, e a tela em que se COMPRA abria sem mostrar nada à venda.
        ⚠️ O ESTADO FICA INTEIRO (`filter`, `mineOnly`, `sort`, e o `useMemo` que os aplica): sem os
        controles eles valem "all", false e "rarity", e a peneira passa a ser só o campo de busca — que
        é o pedido. Devolver qualquer um deles é descomentar o bloco abaixo.
        ⚠️ A skin equipada não ficou sem sinal: o selo EQUIPADA continua no cartão dela dentro da grade.

    <div className="card shop-eq"><SkinPreview skin={eq} r={40} />
      <div className="skinmeta"><b id="s-skin">{skinName(eq)}</b><i id="s-rar" style={{ color: RC[eq.rarity] }}>{rarityLabel(eq.rarity)}</i><span className="hint" id="s-count">{ownedVis}/{TOTAL_VIS} {LB.unlocked}</span></div>
      <span className="badge">{LB.equipped}</span></div>
    <div className="shop-prog"><i style={{ width: Math.round(ownedVis / TOTAL_VIS * 100) + "%" }} /></div>
      <select value={sort} onChange={e => setSort(e.target.value)} aria-label={LB.sortBy.rarity}>
        {["rarity", "price", "name"].map(k => <option key={k} value={k}>{LB.sortBy[k]}</option>)}
      </select>
    <div className="filters" id="shop-filters">
      <button data-f="all" className={filter === "all" && !mineOnly ? "on" : ""} onClick={() => { setFilter("all"); setMineOnly(false); }}>{LB.filterAll}</button>
      <button data-f="mine" className={mineOnly ? "on" : ""} onClick={() => setMineOnly(v => !v)}>{LB.onlyMine}</button>
      {RARITY_ORDER.map(r => <button key={r} data-f={r} className={filter === r ? "on" : ""} style={{ "--rc": RC[r] }} onClick={() => setFilter(r)}>{rarityLabel(r)}</button>)}
    </div>
    */}
    <div className="shop-tools">
      <input type="search" value={q} placeholder={LB.shopSearch} onChange={e => setQ(e.target.value)} aria-label={LB.shopSearch} />
    </div>
    <div className="shop-grid" id="shop-grid">{list.map(s => { const st = stateOf(s), sec = st === "secret";
      return <div key={s.id} className={"skin-card " + st} data-skin={s.id} data-rar={s.rarity} style={{ "--rc": RC[s.rarity] }}
        onClick={() => setSel(s.id)} role="button" tabIndex={0} onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSel(s.id); } }}>
        <span className="rar-dot" />
        {st === "eq" ? <span className="badge">{LB.equipped}</span> : null}
        {/* a Retrato é a única skin que precisa de algo além da compra — a foto. Sem esta marca nada na
            grade dizia isso, e o jogador pagava 25 mil moedas sem saber que ainda havia um passo. */}
        {s.pattern === "avatar" ? <span className="badge av">{LB.avatarBadge}</span> : null}
        {canWatchAd(s, st) ? <span className="badge ad">{LB.adBadge}</span> : null}
        <SkinPreview skin={s} r={36} className="" secret={sec} />
        <b>{sec ? LB.secret : skinName(s)}</b><i>{rarityLabel(s.rarity)}</i>
        <em>{rotulo(s, st)}</em></div>; })}
      {list.length ? null : <div className="hint">{LB.noSkins}</div>}</div>
    <div className="shop-note hint">{LB.shopNote}</div>
    {sel != null ? <SkinModal id={sel} stateOf={stateOf} onClose={() => setSel(null)} /> : null}
  </>;
}

/** A pergunta: skin grande, o que ela é, e as duas saídas. Fecha sozinho depois de equipar/comprar. */
function SkinModal({ id, stateOf, onClose }) {
  const LB = useLabels(), theme = useTheme(), RC = (theme && theme.rarityColor) || RARITY_COLORS;
  const session = useStore(app, s => s.session), nivel = (session.stats && session.stats.level) | 0 || 1;
  const cur = skinById(id), st = stateOf(cur);
  // ⚠️ O ANÚNCIO DEIXOU DE SER PRÉ-REQUISITO E VIROU ATALHO: ele DÁ a skin (`AD_GIFT_SKINS`), então não
  // trava mais nada — o botão de moeda fica livre, e quem quiser pagar paga. `precisaAnuncio` some com a
  // mecânica que a 0012 tinha criado (ver `AD_GIFT_SKINS` em shared/src/skins.js).
  // ⚠️ `podeAnuncio` continua exigindo `portal.temRecompensa`: ter adaptador NÃO é ter recompensa (só a
  // Poki implementa `recompensa()`), e um botão que não abre vídeo nenhum é pior que botão nenhum.
  const podeAnuncio = AD_GIFT_SKINS.includes(cur.id) && portal.temRecompensa && st !== "eq" && st !== "owned";
  useEffect(() => { const kd = e => { if (e.key === "Escape") { e.preventDefault(); onClose(); } };
    addEventListener("keydown", kd); return () => removeEventListener("keydown", kd); }, [onClose]);
  // ⚠️ `ganharSkinAnuncio` e não `watchMascotAd`: o vídeo DÁ a skin. É o MESMO braço que a tela de morte
  // usa, de propósito — dois caminhos para a mesma promessa divergem no primeiro conserto. Ele já equipa,
  // já registra o `ultimoAd` do portal (senão o clique seguinte levaria um midroll em cima) e já trata o
  // "não assistiu até o fim". O modal FECHA depois: a skin virou posse, não há segunda ação a tomar aqui.
  const assistir = async () => { sfx("buy"); await ganharSkinAnuncio(cur.id); onClose(); };
  const act = () => {
    // `st==="eq"` não tem ramo aqui: o botão fica desabilitado nesse estado.
    if (st === "owned") { sfx("equip"); equipSkin(cur.id); return onClose(); }
    if (st === "buyable") { sfx("buy"); buySkin(cur.id); return onClose(); }
    sfx("error");   // sem moeda / secreta / travada: o "não pode" tem que soar diferente do "pode"
    if (st === "lowlevel") return toast(LB.lowlevelToast.replace("{n}", cur.levelReq).replace("{v}", nivel));
    if (st === "poor") return toast(LB.poorToast);
    if (st === "secret") return toast(LB.secretToast);
    if (st === "locked") return toast(LB.lockedToast + ": " + skinDesc(cur));
  };
  const actLabel = st === "eq" ? LB.equipped : st === "owned" ? LB.equip : st === "secret" ? "???" : st === "locked" ? LB.locked
    : st === "lowlevel" ? `🔒 ${LB.levelReq.replace("{n}", cur.levelReq)}` : `${LB.coinIcon} ${fmt(cur.price)}`;
  const pergunta = st === "owned" ? LB.skinConfirmEquip : st === "buyable" ? LB.skinConfirmBuy : "";
  // ⚠️ PORTAL, e não é preciosismo: o `.overlay` é `position:absolute` e o bloco contentor dele seria o
  // `.wrap` da loja, que é absoluto, ROLA e ainda tem `transform:translateX(-50%)`. Daí os dois defeitos:
  // o `top:50%` do modal centrava no meio da CAIXA (não da tela) e o modal descia junto com a rolagem da
  // grade. `position:fixed` não resolveria — um `transform` no ancestral também captura elementos fixos.
  // Montado na raiz, o ancestral posicionado passa a ser `#app{position:fixed;inset:0}` e o CSS que já
  // existe (base.css `.overlay` + ui.css `.card.modal`) centra sozinho, como já faz no AccountModal.
  return createPortal(<div className="overlay on" id="s-skinmodal" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
    <div className="card modal skin-modal" style={{ "--rc": RC[cur.rarity] }} role="dialog" aria-modal="true" aria-label={cur.name}>
      <SkinPreview skin={cur} r={48} className="" secret={st === "secret"} />
      <div className="sm-info"><b>{st === "secret" ? LB.secret : cur.name}</b>
        <i>{rarityLabel(cur.rarity)}</i><span>{skinDesc(cur)}</span>
        {pergunta ? <em className="sm-ask">{pergunta}</em> : null}</div>
      {/* a foto vem AQUI, não escondida no fim da tela: quem acabou de equipar a Retrato está olhando
          exatamente para este cartão, e é este o momento em que a foto faz sentido */}
      {cur.pattern === "avatar" && (st === "eq" || st === "owned") ? <AvatarPicker /> : null}
      <div className="sm-actions">
        <button className="btn-secondary" onClick={onClose}>{LB.cancel}</button>
        {/* o anúncio é ALTERNATIVA à compra, não pré-requisito dela: os dois botões ficam ativos lado a
            lado (mesma classe `btn-primary`, então nenhum fica menor que o outro) e o jogador escolhe
            entre pagar e assistir. Ele só existe onde há `rewardedBreak` de verdade. */}
        {/* ⚠️ `prizeWatch` ("Assistir e GANHAR"), nunca `watchAd` ("Assistir anúncio"): o rótulo é a única
            coisa que diz o que o vídeo entrega, e é a MESMA promessa da tela de morte — duas frases para a
            mesma mecânica é como se produz um jogador que acha que foi enganado. */}
        {podeAnuncio ? <button className="btn-primary act ad" onClick={assistir}>{LB.prizeWatch}</button> : null}
        <button className="btn-primary act" disabled={st === "eq"} onClick={act}>{actLabel}</button>
      </div>
    </div>
  </div>, document.getElementById("app"));
}
