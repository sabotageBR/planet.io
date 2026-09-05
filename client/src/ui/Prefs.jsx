import React from "react";
import { useStore } from "../state/store.js";
import { app } from "../state/app.js";
import { setPref, savePrefs, resetPrefs } from "../state/actions.js";
import { useLabels } from "../hooks/useTheme.js";
import { ScreenHeader, Screen } from "./bits.jsx";
import { PREFS } from "./prefsTable.js";
import { LANG_NAMES } from "../i18n/index.js";
import { portal } from "../portal/index.js";
import { PORTAL } from "../portal/flags.js";

/** No site é caminho relativo; no pacote tem que ser absoluto — lá `privacy.html` não viaja no zip. */
const PRIVACIDADE = PORTAL ? "https://warspace.io/privacy.html" : "/privacy.html";

export default function Prefs({ on }) {
  return <Screen id="prefs" on={on} className="prefs-wrap">{on ? <Body /> : null}</Screen>;
}
const coerce = (it, raw) => (it.kind === "num" ? +raw : raw);
/**
 * O botão que pede permissão de notificação do navegador — e ele SÓ existe para quem é administrador.
 * O aviso de "entrou gente" (`{t:'adm'}`) já chega como faixa, som e linha de chat sem permissão nenhuma;
 * a notificação do SISTEMA é o que faz o aviso valer com a aba em segundo plano, e `requestPermission()`
 * exige gesto do usuário. Por isso um botão, e não uma tentativa automática no boot: pedir permissão sem
 * o jogador ter pedido nada é o padrão que os navegadores passaram anos desencorajando.
 * ⚠️ `Notification` não existe em contexto inseguro nem no iframe de um portal; tudo em try/catch, e a
 * ausência simplesmente não desenha a linha.
 */
function AvisoAdmin({ LB }) {
  const user = useStore(app, s => s.session.user) || {};
  const [estado, setEstado] = React.useState(() => {
    try { return typeof Notification === "undefined" ? null : Notification.permission; } catch { return null; }
  });
  if (!user.isAdmin || estado === null) return null;
  const pedir = () => { try { Notification.requestPermission().then(p => setEstado(p)).catch(() => {}); } catch {} };
  return <section className="card pg" id="pg-admin">
    <h2>{LB.opt.g_admin}</h2>
    <div className="prow">
      <span>{LB.opt.adminNotify}</span>
      {estado === "granted"
        ? <em className="dim">{LB.opt.adminNotifyOn}</em>
        : estado === "denied"
          ? <em className="dim">{LB.opt.adminNotifyBlocked}</em>
          : <button className="btn-secondary" onClick={pedir}>{LB.opt.adminNotifyAsk}</button>}
    </div>
  </section>;
}
/**
 * O rótulo de uma OPÇÃO. Três origens, porque nem toda opção é texto de UI: tecla é a tecla física
 * (grupo `keys`), idioma fica sempre no próprio idioma (`English`, não `Inglês`) e número é o número.
 * O resto segue a convenção `prefs[chave_valor]`, com o valor cru de reserva — assim uma opção nova
 * aparece na tela mesmo antes de alguém escrever o texto dela.
 */
const rotulo = (LB, it, v) => it.kind === "key" ? (LB.keys[v] || v)
  : it.kind === "lang" ? (v === "auto" ? LB.opt.lang_auto : LANG_NAMES[v] || v)
  : it.kind === "num" ? String(v)
  : (LB.opt[it.key + "_" + v] || String(v));
/**
 * UMA linha de preferência (toggle · select · range). Exportada porque o menu de PAUSA (ui/Pause.jsx) mostra
 * um punhado das mesmas prefs por cima do jogo — duas cópias do mesmo widget divergiriam na primeira
 * correção, e o `id`/`data-pref` que o CSS dos temas usa é justamente o que não pode divergir.
 * `pfx` diferencia os ids quando as duas telas estão montadas ao mesmo tempo (o `htmlFor` exige id único).
 */
export function PrefRow({ it, v, pfx = "pref-" }) {
  const LB = useLabels(), id = pfx + it.key;
  return <div className="pref-row"><label htmlFor={id}>{LB.opt[it.key] || it.key}</label>
    {it.type === "toggle" ? <button id={id} className="toggle" role="switch" aria-checked={!!v} data-pref={it.key} onClick={() => setPref(it.key, !v)}><i></i></button>
      : it.type === "select" ? <select id={id} data-pref={it.key} value={String(v)} onChange={e => setPref(it.key, coerce(it, e.target.value))}>{it.opts.map(k => <option key={k} value={String(k)}>{rotulo(LB, it, k)}</option>)}</select>
      : <span className="range"><input id={id} type="range" min={it.min} max={it.max} value={+v || 0} data-pref={it.key} onChange={e => setPref(it.key, +e.target.value)} /><b>{+v || 0}</b></span>}
  </div>;
}
// ⚠️ Os ícones vêm daqui e do `PW_ICON` do Hud — duas listas para o mesmo desenho divergem na primeira
// correção. A ordem é a de quem aparece mais no jogo (POWERUP.DROP), não a do enum.
const PW_LEGENDA = [["magnet", "🧲"], ["shield", "🛡️"], ["autodef", "🛰️"], ["feast", "🍀"], ["merge", "⚛️"]];
/**
 * AJUDA: o que cada powerup faz. Em partida ninguém lê palavra — o HUD é ícone e número, e é assim que
 * tem que ser —, mas alguém precisa dizer UMA vez o que "🍀" significa: quem pega um trevo pela primeira
 * vez não tinha como descobrir que a comida passou a valer o dobro. Isto morava na tela de MODOS, que é
 * onde se está com pressa de entrar; aqui é onde se está lendo. Sai da MESMA fonte do balão do HUD
 * (`LB.powerups` + `LB.powerupHints`), então as duas não podem divergir.
 */
function Ajuda() {
  const LB = useLabels();
  return <section className="card pg pw-legenda" id="pg-help">
    <h2>{LB.opt.g_help}</h2>
    <div className="ph">{LB.powerupsTitle}</div>
    <ul>{PW_LEGENDA.map(([k, ico]) => <li key={k}>
      <i className={"pw-l pw-" + k}>{ico}</i>
      <b>{LB.powerups[k]}</b><span>{LB.powerupHints[k]}</span></li>)}</ul>
    <span className="hint">{LB.powerupsNote}</span>
  </section>;
}
function Body() {
  const LB = useLabels(); const prefs = useStore(app, s => s.session.prefs);
  return <>
    <ScreenHeader title={LB.prefsTitle} />
    <div className="prefs-groups" id="prefs-groups">
      {PREFS.map(gp => <section className="card pg" id={"pg-" + gp.id} key={gp.id}><h2>{LB.opt["g_" + gp.id]}</h2>
        {gp.items.map(it => <PrefRow key={it.key} it={it} v={prefs[it.key]} />)}
      </section>)}
      <AvisoAdmin LB={LB} />
      <Ajuda />
    </div>
    <div className="prefs-foot"><button className="btn-secondary" id="pf-reset" onClick={resetPrefs}>{LB.reset}</button><button className="btn-primary" id="pf-save" onClick={savePrefs}>{LB.save}</button></div>
    {/* A política de privacidade é uma página ESTÁTICA (client/public/privacy.html), fora do bundle: ela
        tem que abrir mesmo com o jogo fora do ar.
        ⚠️ ELA APARECE NO PACOTE TAMBÉM, e antes não aparecia. O raciocínio de então ("link que tira o
        jogador do iframe é o que eles proíbem") estava certo pela metade: a Poki proíbe o link SOLTO e
        exige, na mesma página de requisitos, que a política seja alcançável de DENTRO do jogo — a saída
        que eles definem é `openExternalLink`, que devolve a decisão ao portal. Daí o `onClick`: no
        portal quem abre é o SDK, e só quando ele não cuida (site, dev, SDK bloqueado) é que o href vale.
        ⚠️ `privacy.html` continua PODADO do zip (o comentário em portal-pack.mjs explica), então a URL
        aqui é absoluta de propósito: dentro do iframe deles o caminho relativo não existe. */}
    <div className="prefs-legal">
      <a href={PRIVACIDADE} target="_blank" rel="noopener"
         onClick={e => { if (PORTAL && portal.linkExterno(PRIVACIDADE)) e.preventDefault(); }}>{LB.privacy}</a>
    </div>
  </>;
}
