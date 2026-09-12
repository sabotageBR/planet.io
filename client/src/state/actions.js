// ── AÇÕES DO SHELL ────────────────────────────────────────────────────────────
// Tudo que muda o estado passa por aqui (telas, sessão, prefs, loja, conta, partida).
import { api, isUnreachable, isGone } from "../api/client.js";
import { app, normalizePrefs, normalizeStats, PREF_DEFAULTS, PREF_KEYS, SCREENS } from "./app.js";
import { applyTheme, resolveThemeId, startThemeClock } from "../app/theme.js";
import { getLabels, setLang, currentLangPref, preenche } from "../i18n/index.js";
import { errText } from "../i18n/errors.js";
import { skinById, PROTOCOL_VERSION, SKINS, LEVEL, ROUND, MODE, PORTAL as P, playerNick, createRng, registerSkins} from "@warspace/shared";
import { clockRef, gameRef, getGame } from "./game.js";
import { partidaIniciada } from "../app/analytics.js";
import { nickSorteado } from "../util/nick.js";
import { portal } from "../portal/index.js";
import { PORTAL, SEM_MENU, entraDiretoEm, tutorialEm } from "../portal/flags.js";
import { renasceSozinho, pedagioLiberado } from "../portal/primeiraVida.js";
import { marco, evento, faixaIdade } from "../portal/marcos.js";
import { destinoDoBoot, destinoDaSaida, precisaTutorial } from "./entrada.js";
import { tutorVisto, marcaTutor, marcaMissao } from "../game/estreia.js";
import { silenciaAnuncio, sfx } from "../audio/index.js";
import { setSkinArt } from "../theme/faces.js";

const Q = new URLSearchParams(location.search);
const NICK_RE = /^.{2,16}$/;
// ⚠️ `?vida1=1` LIGA À FORÇA o fluxo da primeira vida do PACOTE (a morte sem tela, o pedágio do anúncio)
// no site de dev. Sem ele não há como PROVAR o comportamento antes de subir o zip — `PORTAL` é constante
// de BUILD e não se falsifica em 127.0.0.1 —, e o pack 1.21 exige dez sessões internas antes de gastar o
// Fit Test do dia. É o mesmo tipo de interruptor de bancada que `?bb=1`, `?local=1`, `?bench` e `?sfx`
// já são, e pelo mesmo motivo: ele não muda o que é EMPACOTADO, só o que esta aba faz.
// ⚠️ Ele NÃO entra na poda do Rollup e nem poderia: quem decide o que sai do zip é a constante literal
// `PORTAL`, e a leitura aqui é de runtime, depois dela.
const FORCA_1VIDA = Q.get("vida1") === "1";
/** Esta aba se comporta como o pacote de portal para efeito da PRIMEIRA VIDA? */
const comoPortal = () => PORTAL || FORCA_1VIDA;

// ── toast / navegação / overlays ─────────────────────────────────────────────
let toastN = 0, toastT = null;
export function toast(msg, ms = 1800) {
  clearTimeout(toastT); app.update({ toast: { msg: String(msg), n: ++toastN } });
  toastT = setTimeout(() => app.update({ toast: null }), ms);
}
export function go(screen) {
  // ⚠️ NO PACOTE A TELA INICIAL NÃO EXISTE (`SEM_MENU`): `App.jsx` não monta `Entry` nem `Scene`, e o
  // Rollup os poda do zip. Um `go("entry")` ali não dá erro nenhum — deixa o jogador olhando um shell
  // VAZIO, sem caminho de volta. O menu do pacote é a tela de MODOS, que está montada, então `entry` é
  // REDIRECIONADA em vez de bloqueada: assim o `go("entry")` do `escape()` e o "voltar" de todo
  // `ScreenHeader` continuam levando a algum lugar, sem sete `if` espalhados.
  if (SEM_MENU && screen === "entry") screen = "modes";
  if (!SCREENS.includes(screen)) return;
  // ⚠️ E DURANTE O BOOT NÃO SE NAVEGA. Foi encontrado assim, em bancada: um Esc apertado antes de o
  // `play()` do boot direto completar (`screen:"boot"`) caía no último ramo de `escape()` e tirava o
  // jogador da arena no primeiro segundo, que é justamente o que o Player Fit mede. A guarda é pela tela
  // de ORIGEM — a de DESTINO bloqueava o menu inteiro e foi o que tornou o Battle Royale inalcançável.
  if (SEM_MENU && app.get().screen === "boot") return;
  app.update(s => ({ ...s, prevScreen: s.screen === screen ? s.prevScreen : s.screen, screen,
    overlays: { account: false, pause: false, reconn: s.overlays.reconn && screen === "game" } }));
}
// O modal tem DUAS abas de novo (criar conta · entrar), então `overlays.account` volta a carregar QUAL
// delas abre — "claim" | "login", as duas truthy, que é o que `App.jsx` lê para montar o overlay.
export const openAccount = (tab) => app.update(s => ({ ...s, overlays: { ...s.overlays, account: tab === "claim" ? "claim" : "login" } }));
export const setPause = on => app.update(s => ({ ...s, overlays: { ...s.overlays, pause: !!on } }));
/**
 * O painel do TAB. ⚠️ Ele NUNCA pode passar por `setPause`: é `game.setPaused` que manda o alvo em cima do
 * próprio centróide (game/index.js), e é isso que congela o planeta — exatamente o oposto do que se quer
 * aqui. Overlay puro de leitura, com o jogo vivo por baixo.
 */
export const setRoster = on => app.update(s => (!!s.overlays.tab === !!on ? s : { ...s, overlays: { ...s.overlays, tab: !!on } }));
export const togglePause = () => { const s = app.get(); if (s.screen !== "game" && !s.overlays.pause) return; setPause(!s.overlays.pause); };
// ── O QUE ACONTECE ENQUANTO UM ANÚNCIO DE PORTAL RODA ──
// Cala o som (sem tocar em `prefs.muted` — ver `silenciaAnuncio` em audio/index.js) e, na volta, se o
// jogador estiver em partida, levanta o menu de pausa: os portais exigem que o retorno caia numa tela que
// só sai por ação dele, e o `Pause` já é exatamente isso — sai no clique do RETOMAR e larga o COMANDO sem
// derrubar a conexão. Registrado no módulo, uma vez, e não em componente: anúncio não espera montagem.
if (PORTAL) {
  // convite aceito no portal: cai direto na sala do amigo, pelo mesmo `play()` do link `?sala=`
  portal.aoEntrarNaSala(code => { if (code) entrarPorConvite(code); });
  // trocou de conta no site deles enquanto jogava: refaz a identidade
  portal.aoTrocarConta(() => { entraPeloPortal(); });
  // ⚠️ PAUSAR É PARAR, não só calar. Isto era `silenciaAnuncio(true)` e mais nada, e a certificação do
  // Playgama reprovou com "the game continues running when a system overlay is opened. Subscribe to the
  // SDK pause event and stop the game loop". Agora a pausa da plataforma faz as TRÊS coisas: cala o som,
  // levanta o menu de pausa (é ele que solta o COMANDO — `canAct`, teclado e o alvo em cima do próprio
  // centróide) e avisa o motor por evento de janela, que para o RENDER (game/index.js). O motor não
  // conhece portal nem React, e o evento é o mesmo caminho de `warspace:theme`/`warspace:lang`.
  const avisaMotor = on => { try { dispatchEvent(new CustomEvent("warspace:pause", { detail: { on } })); } catch { /**/ } };
  portal.aoPausar(() => { silenciaAnuncio(true); avisaMotor(true);
    const s = app.get(); if (s.screen === "game" && !s.overlays.pause) setPause(true); });
  portal.aoRetomar(() => { silenciaAnuncio(false); avisaMotor(false);
    const s = app.get(); if (s.screen === "game" && !s.overlays.pause) setPause(true); });
}
export const closeAccount = () => app.update(s => ({ ...s, overlays: { ...s.overlays, account: false } }));
export const setReconn = (on, attempt) => app.update(s => ({ ...s, overlays: { ...s.overlays, reconn: !!on }, reconnAttempt: on ? (attempt || s.reconnAttempt || 1) : 0 }));
/**
 * Esc: fecha modal → tira foco do input → abre/fecha a PAUSA (no jogo) → volta à entrada (fora dele).
 * ⚠️ A cadeia é resolvida AQUI, num lugar só. Há outros listeners de Escape na árvore (Chat, Shop, Dead), e
 * todos são `keydown` na JANELA: a ordem entre eles é a de REGISTRO, e como esses componentes montam DEPOIS
 * do App o de cá roda PRIMEIRO — apostar em aninhamento aqui é apostar errado. Quem cede a vez é
 * `e.defaultPrevented`, checado no listener de App.jsx: quem consumiu o Esc marca o evento. Com o campo do
 * chat em foco quem marca é o `onKeyDown` do <input>, handler React ancorado no #app — abaixo da janela na
 * bolha, portanto sempre antes daqui. Sem isso o Esc do chat abria a pausa: o campo já tinha perdido o foco
 * e a guarda de INPUT abaixo não via mais nada.
 */
export function escape() {
  const s = app.get();
  if (s.overlays.account) { closeAccount(); return true; }
  const a = document.activeElement;
  if (a && /INPUT|SELECT|TEXTAREA/.test(a.tagName)) { a.blur(); return true; }
  // o TAB vem ANTES da pausa: com o painel aberto, o Esc tem que fechá-lo, e não abrir o menu por cima
  if (s.overlays.tab) { setRoster(false); return true; }
  if (s.overlays.pause) { setPause(false); return true; }
  if (s.screen === "game") { setPause(true); return true; }
  // ⚠️ NO PACOTE O ESC TAMBÉM VALE PARA QUEM MORREU OU ESTÁ ASSISTINDO, e isso conserta um buraco que já
  // existia: em `dead` o Esc não fazia NADA (a linha de baixo exclui `dead` de propósito). No site isso
  // era só uma tecla sem resposta; aqui a pausa virou o único menu que existe, e quem morreu é justamente
  // quem tem tempo de abrir um menu.
  if (SEM_MENU && (s.screen === "dead" || s.screen === "spec")) { setPause(true); return true; }
  if (s.screen === "party") { leaveParty(); return true; }   // sair sem avisar deixa o lobby órfão até o TTL, com os amigos olhando uma equipe que não existe
  if (s.screen !== "game" && s.screen !== "dead" && s.screen !== "entry") { go("entry"); return true; }
  return false;
}

// ── sessão ───────────────────────────────────────────────────────────────────
export function applySession(me) {
  const prefs = normalizePrefs(me.prefs);
  app.update(s => ({ ...s, session: { ...s.session, user: me.user, skins: me.skins && me.skins.length ? me.skins : [0], prefs,
    stats: normalizeStats(me.stats), achievements: me.achievements || [], online: api.online, server: api.server } }));
  applyPrefsSideEffects(prefs);
}
export const patchUser = patch => app.update(s => ({ ...s, session: { ...s.session, user: { ...(s.session.user || {}), ...patch } } }));

let themeClock = null, lastThemePref = null, lastLangPref = null;
const themePref = () => app.get().session.prefs.theme || "auto";
/** Efeitos imediatos das prefs: idioma, tema (aplica já; o relógio reavalia 'auto' a cada minuto/foco), body[data-reduce|bigtext|colorblind]. */
export function applyPrefsSideEffects(prefs) {
  const b = document.body.dataset;
  b.reduce = prefs.reduceMotion ? "1" : "0"; b.bigtext = prefs.bigText ? "1" : "0"; b.colorblind = prefs.colorblind || "off";
  if (prefs.theme !== lastThemePref) { lastThemePref = prefs.theme; applyTheme(resolveThemeId(prefs.theme || "auto"), { fade: true }); }   // trocar o tema na mão também passa pelo fade
  // O idioma vem do mesmo lugar que o tema, mas SEM relógio: `navigator.language` não muda no meio da
  // sessão. `setLang` é assíncrono (o dicionário é um chunk à parte) e avisa a tela sozinho pelo evento,
  // então ninguém aqui precisa esperar por ele — a única coisa que não pode é chamá-lo a cada render.
  if (prefs.lang !== lastLangPref) { lastLangPref = prefs.lang; setLang(prefs.lang || "auto"); }
  if (!themeClock) themeClock = startThemeClock(themePref, null, { getHour: () => clockRef.get().hour });   // dentro da partida o céu segue o relógio da rodada
}

/**
 * CONTA DO PORTAL. A CrazyGames exige que quem já está logado no site DELES seja reconhecido aqui sem
 * ter que fazer nada — e que quem não está possa jogar como convidado do mesmo jeito. O JWT deles vale
 * 1 h e não é guardado: quem o troca pelo nosso token é o servidor (`/api/auth/crazygames`).
 * ⚠️ Mandamos o Bearer atual junto: se for um convidado, o servidor PROMOVE aquela conta em vez de criar
 * outra — senão quem jogou antes de logar perderia moedas e skins no primeiro login.
 * ⚠️ Falhar aqui não pode derrubar o boot: sem isso o jogador fica como convidado, que é um estado
 * legítimo e previsto por eles.
 */
async function entraPeloPortal() {
  if (!PORTAL) return;
  try {
    const t = await portal.identidade(); if (!t) return;
    const r = await api.crazyLogin(t);
    if (r && r.user) applySession(await api.bootstrap());
  } catch (e) { console.warn("[portal] login:", e && e.message); }
}
/** Botão de login do portal (só sai de um clique do jogador — é o que o SDK deles exige). */
export async function loginDoPortal() {
  try { const t = await portal.pedirLogin(); if (!t) return;
    await api.crazyLogin(t); applySession(await api.bootstrap()); toast(getLabels().welcome || "", 1800); }
  catch (e) { toast(errText(e), 3000); }
}
/** Botão "tentar de novo" da tela de servidor fora: refaz o boot inteiro. */
export async function tentarDeNovo() { app.update({ servidorFora: false, booted: false }); await boot(); }

/**
 * O `protocol` de /api/config era buscado desde sempre e NINGUÉM o comparava com nada. Agora que o
 * servidor não força mais ninguém a recarregar (ele ECOA a versão do cliente para não trancar build
 * antiga), este é quem empurra a atualização — e no lugar certo: o boot, antes de qualquer partida, e não
 * no meio de uma. Uma vez só, marcado em sessionStorage, senão volta a ser o laço que se está consertando.
 * ⚠️ No PORTAL não recarrega: o bundle é uma cópia hospedada por eles e o reload traz o mesmo arquivo.
 */
const RELOAD_KEY = "warspace_proto_reload";
function checaVersao(cfg) {
  const v = cfg && cfg.protocol;
  if (!v || v <= PROTOCOL_VERSION || PORTAL) return;
  try { if (sessionStorage.getItem(RELOAD_KEY) === String(v)) return; sessionStorage.setItem(RELOAD_KEY, String(v)); } catch { }
  location.reload();
}

/**
 * O nick que a tela inicial põe no campo. Só faz sentido para quem ainda está com a placa sorteada
 * pelo servidor (`Viajante-NNNN`): quem já escolheu um nome vê o dele.
 * ⚠️ A distinção entre `null` e `undefined` vem de `api.nickSugerido()` e é o interruptor do /admin:
 * `null` é "o parâmetro está desligado" e tem que deixar o campo VAZIO; `undefined` é a chamada que
 * falhou, e só ela cai na lista local — que é também o único caminho do `?local=1` e do modo offline.
 */
async function resolveNickSugerido(user) {
  if (!nickSorteado(user && user.nick)) return "";
  const s = await api.nickSugerido();
  if (s === null) return "";                                        // desligado no painel
  if (s) return s;
  return chaoLocalNick();
}
/**
 * O CHÃO LOCAL, extraído de `resolveNickSugerido` porque agora tem DOIS chamadores: ele (quando a rota
 * falha) e o boot (que precisa de um nome ANTES de qualquer ida ao servidor). É a mesma lista de
 * `playerNick` que o `?local=1` e o modo offline sempre usaram.
 */
function chaoLocalNick() {
  return playerNick(createRng((Date.now() ^ (Math.random() * 1e9)) | 0), new Set());
}
/**
 * Grava a sugestão ANTES de a guarda de nome ser consultada. Sem isto, quem fosse a Modos ou às Salas
 * sem tocar no campo levaria um repique de volta à tela inicial — com o campo já preenchido, ou seja
 * pedindo um nome que já está lá.
 * ⚠️ TEM que ser esperado: o nick que entra na sala é o da CONTA no instante do join (o `fallbackNick`
 * do WS só vale sem banco), então um PATCH em voo perde a corrida e o jogador entra como `Viajante-NNNN`.
 * ⚠️ Silencioso de propósito — o toast de "nick salvo" aqui é barulho a cada primeira partida, porque
 * ninguém pediu para salvar nada.
 */
async function garanteNick() {
  const st = app.get(), u = st.session.user || {};
  if (st.nomeado || !st.nickSugerido || !nickSorteado(u.nick)) return;
  await setNick(st.nickSugerido, { silencioso: true });
}
export async function boot() {
  try { applySession(await api.bootstrap()); }
  // ⚠️ O idioma sobrevive ao boot que falhou. Este ramo reaplica os PADRÕES, e `lang` é a única pref que
  // também mora fora do perfil (o atalho de localStorage que o `bootLang` lê antes do 1º render): sem
  // preservá-la aqui, um servidor fora do ar fazia o jogador que escolheu inglês ver o padrão "auto"
  // gravado por cima da escolha dele — e o idioma voltava para o do navegador no F5 seguinte.
  catch (e) { app.update({ bootError: e.message || String(e) }); applyPrefsSideEffects({ ...PREF_DEFAULTS, lang: currentLangPref() }); }
  app.update({ booted: true });
  // ⚠️ SEM `await` NO PACOTE, e isto é o gargalo do "arena visível em menos de 1 s". `entraPeloPortal`
  // abre com `portal.identidade()`, que por dentro é `await pronto` — a promessa do SDK de TERCEIRO, com
  // teto de `PORTAL.SDK_MS` (6 s). A Poki não implementa `identidade`, então o boot esperava o SDK inteiro
  // para receber `null`, e tudo o que vem depois herdava a espera. Ele continua valendo (é a promoção de
  // guest a conta do portal, o "Full" da CrazyGames), só deixa de estar no caminho crítico.
  if (SEM_MENU) entraPeloPortal(); else await entraPeloPortal();
  // ⚠️ No pacote de portal, servidor fora NÃO pode virar um toast de 3 s e uma partida contra bots: ali
  // não existe "modo local" que faça sentido (o jogador clicou num .io para jogar com gente), e o
  // silêncio faz o jogo PARECER que funcionou. Vira uma tela que fica.
  if (PORTAL && api.server === false) app.update({ servidorFora: true });
  else if (api.server === false) toast(getLabels().offlineNote, 3200);
  else if (api.online === false) toast(getLabels().noDbNote, 3200);
  // ⚠️ E BOOT QUE FALHOU TAMBÉM É TELA QUE FICA, no pacote. `bootError` sozinho não muda tela nenhuma: no
  // site ele aparece como a nota de convidado da tela inicial, e sem tela inicial isso vira SHELL PRETO —
  // o jogador olhando nada, sem nem um botão de tentar de novo. `Offline.jsx` já é essa tela e já tem o
  // botão; o que faltava era alguém acendê-la.
  if (SEM_MENU && app.get().bootError) app.update({ servidorFora: true });
  // ⚠️ `loadRooms()` SAI no pacote: é um pedido de rede, a cada boot, para uma lista que nenhuma tela
  // desenha — o mesmo defeito que a própria tela inicial já corrigiu uma vez ("A PORTA DE ENTRADA NÃO
  // ANUNCIA SALA VAZIA") e que a coluna escondida pelos temas cometeu antes dela. O TOP 5 fica: ele é
  // barato e o painel de ranking da pausa o consome.
  // ⚠️ `loadSkins()` NO BOOT, e isto é o conserto de "entrei como TRUMP e a caricatura não apareceu".
  // Ele é o ÚNICO alimentador de `setSkinArt`, e o único chamador dele era o `useEffect` de `Shop.jsx` —
  // ou seja, a arte que vem do BANCO (as 35 caricaturas de egg, desde que saíram do zip) só existia para
  // quem tivesse ABERTO A LOJA naquela carga da página. No site o defeito ficava escondido, porque
  // `faceFile` cai em `(!PORTAL && sk.face)` e o arquivo de `public/faces/` salva; no PACOTE aquele ramo é
  // `null`, então o planeta saía como disco liso — sem erro, sem 404 e sem nada na tela dizendo por quê.
  // ⚠️ Sem `await`, como os dois ao lado: a arte chegando tarde não atrasa a arena (a chave da textura
  // carrega "o bitmap já chegou?", então o planeta se reassa sozinho no frame seguinte).
  loadConfig(); loadTop5(); loadSkins(); if (!SEM_MENU) loadRooms();
  // ⚠️ O CAMPO NÃO PODE ESPERAR A REDE. O comentário que morava aqui dizia que esta rota "nunca é o
  // gargalo"; foi MEDIDO contra produção e é falso: `GET /api/nick` responde em ~0,67 s morno e 1,19 s
  // frio a partir do Brasil, e o `booted:true` logo acima já deixou a tela inicial montar. Nessa janela
  // o campo fica VAZIO — e com o campo vazio o JOGAR de `ui/Entry.jsx` cai no `toast(nickAsk)` e
  // RETORNA, ou seja o botão principal do jogo não faz NADA por mais de um segundo para quem chega e
  // clica na hora, que é exatamente o que faz alguém empurrado para dentro de um jogo por um portal.
  // O público da Poki é global, então lá é pior. Hoje o chão local entra SÍNCRONO e a sugestão do
  // servidor apenas melhora o que já está lá.
  // ⚠️ A guarda `nickSorteado` é obrigatória: quem já escolheu um nome vê o DELE, e semear aqui
  // ofereceria um nick sorteado a quem não pediu — é a mesma condição que abre `resolveNickSugerido`.
  // ⚠️ E a resposta do servidor continua podendo LIMPAR o campo: `null` é "o painel desligou"
  // (`ENTRY.NICK_AUTO`) e tem que vencer o chão local, senão o interruptor não desliga nada.
  // ⚠️ Deixou de ser `await`: segurar o boot por uma ida ao servidor é o defeito, não a solução. Quem
  // depende do valor é `garanteNick()`, lá no `play()` — e ele encontra o chão local já gravado.
  const uBoot = app.get().session.user;
  if (nickSorteado(uBoot && uBoot.nick)) app.update({ nickSugerido: chaoLocalNick() });
  resolveNickSugerido(uBoot).then(n => app.update({ nickSugerido: n }));
  // ── PARA ONDE ESTE BOOT VAI ──
  // A escolha mora em `state/entrada.js` (pura e testada); aqui só se executa o que ela decidiu. Os quatro
  // ramos de querystring continuam GANHANDO do boot direto, e o motivo é que todos já terminam numa
  // partida ou numa sala — ver o cabeçalho de `destinoDoBoot`.
  // ── O TUTORIAL DE ESTREIA ──
  // ⚠️ A LISTA JÁ ESTÁ EM MÃOS, e sem uma requisição a mais: `loadConfig()` é disparado sem `await` logo
  // acima, então `app.config` quase sempre ainda é `null` aqui — mas a sonda de `api.bootstrap()` (que É
  // `await`ada, na primeira linha desta função) pede o MESMO `/api/config` e agora GUARDA o corpo. Foi
  // esta corrida que tirou `ENTRY.NICK_AUTO` do config e o mandou para `GET /api/nick`; aqui o truque
  // que salva o `ENTRA_DIRETO` ("lido dentro do clique") não serve, porque isto É a decisão do boot.
  // ⚠️ `precisaTutorial` é conjunção de propósito: `games===0` sozinho seria verdade também quando o boot
  // falhou e quando o banco está fora (o perfil local devolve zero em toda carga), e aí o tutorial
  // ligaria para todo mundo, para sempre.
  const cfgSonda = (app.get().config || api.cfg || null);
  const st0 = app.get();
  // ⚠️ `?tutorial=1` GANHA DA LISTA TAMBÉM, e tem de ganhar: a plataforma desta aba é uma constante de
  // BUILD que não se falsifica em 127.0.0.1, então sem isso não haveria como PROVAR a tela em dev sem
  // marcar `site` no painel de produção. É o mesmo tipo de interruptor de bancada que `?vida1=1` já é.
  const forcado = Q.get("tutorial");
  const tutor = forcado === "1" ? true : forcado === "0" ? false
    : (precisaTutorial({ games: (st0.session.stats || {}).games | 0, marcado: tutorVisto(),
        online: api.online, erro: !!st0.bootError })
      && tutorialEm(cfgSonda ? cfgSonda.tutorial : null));
  const destino = destinoDoBoot({ semMenu: SEM_MENU, party: Q.get("party"), sala: Q.get("sala"), assistir: !!Q.get("assistir"), tutor });
  if (destino.tipo !== "dev" && destino.tipo !== "jogar") history.replaceState(null, "", location.pathname);
  const conv = destino.tipo === "party" ? destino.code : null;
  if (conv) { joinParty(conv); return; }   // link de convite: cai direto no lobby da equipe do amigo
  // Convite para a SALA de alguém. ⚠️ Consulta o modo ANTES de entrar: sem isso o convidado entraria com o
  // modo do estado dele, e o servidor recusaria com `MODE` — um link que não funciona sem dizer por quê.
  // `?assistir=1` entra como ESPECTADOR em vez de jogador. Quem produz esse link hoje é o painel /admin
  // (ele não tem motor de jogo, então delega para a SPA); um jogador chega por aqui pelo botão "Assistir"
  // da tela de Salas, que chama `assistir()` direto e nem passa pela URL.
  if (destino.tipo === "spec") { assistir({ room: destino.code }); return; }
  if (destino.tipo === "sala") { entrarPorConvite(destino.code); return; }
  // ── NO PACOTE, O BOOT TERMINA NA ARENA ──
  // Não há tela inicial para clicar: o jogador veio de um portal que já É a tela inicial dele, e o nosso
  // cartão era a segunda porta (17% de abandono medido em `menu/entry` no Fit Test 1.12).
  // ⚠️ `MODE.FREE` CRAVADO, nunca `st.gameMode`: um Battle Royale de uma visita anterior sobrevive no
  // estado e decidiria a partida de ESTREIA de quem acabou de chegar — e lá a estreia é um lobby de
  // espera, o oposto do que isto existe para fazer.
  // ⚠️ E é `play()`, nunca um `app.update({screen:"game"})` à mão: `play()` é a porta única onde moram o
  // anúncio de portal, o `partidaIniciada` do GA e a ORDEM que `portal/sessao.js` depende (o anúncio
  // ANTES da escrita de `screen`, senão o SDK recebe evento por trás do comercial).
  if (destino.tipo === "tutor") { entraNoTutorial(); return; }
  if (destino.tipo === "jogar") { play({ mode: MODE.FREE, teamSize: 1, party: null }); return; }
  devQuery();
}
/** ?screen=<id> (entry|account|lobby|rank|profile|shop|prefs|game|dead|round|reconn) — atalho de desenvolvimento. */
function devQuery() {
  // ⚠️ ATALHO DE DESENVOLVIMENTO, e por isso ele não existe no pacote: `?screen=reconn` põe o overlay de
  // "reconectando" por cima de um jogo saudável, e `?screen=shop` abre a loja antes de o jogador ter
  // jogado. Um revisor que esbarre nisso vê um jogo quebrado.
  if (PORTAL) return;
  const s = Q.get("screen"); if (s) mostrarTela(s);
  // A matriz de responsividade (scripts/responsive-check.mjs) precisa passar por `dead` e `round`, que não
  // têm botão de navegação nenhum — e recarregar a página com ?screen= a cada uma das ~400 combinações
  // levaria minutos. Em DEV, o mesmo atalho fica pendurado no window.
  if (import.meta.env.DEV) { window.__tela = mostrarTela; window.__hudDemo = hudDemo; }
}
/**
 * HUD de mentira, só em DEV. A matriz de responsividade precisa MEDIR a tela `game` — mas sem partida o
 * placar tem 0 linhas, o kill feed está vazio e o bloco de massa não tem número: os três ficam com altura
 * zero, o `vis()` da sonda os descarta, e a coluna direita inteira passava despercebida pelas ~400
 * combinações. Aqui a tela vira "game" de verdade (o `Hud` só some quando `screen!=="game"`) e o hudStore
 * recebe dados no pior formato plausível: nomes longos, números grandes, feed cheio.
 */
/**
 * O TUTORIAL de mentira, só em DEV — o irmão de `hudDemo()`, e pelo mesmo motivo: sem uma partida de
 * verdade os blocos ficam com altura zero e o `vis()` da sonda os descarta, então ~600 combinações
 * passariam por cima de uma tela inteira. Aqui a tela vira "game" e o hudStore recebe o `tutor` no pior
 * formato plausível: a frase mais longa de cada etapa.
 * `suf` = "pre" (a explosão, antes de a lição de mover começar) | "1" | "2" | "3" | "fim" |
 * "ok1".."ok3" (a tela de etapa concluída), com `@ajuda` opcional ("2@2") e `!` para forçar o par do
 * DEDO ("2!"), que tem outras frases e outro prompt.
 */
function tutorDemo(suf) {
  const g = gameRef.get().game;
  app.update({ screen: "game", played: true });
  if (!g || !g.hudStore) return;
  const [qual0, aj] = String(suf || "1").split("@");
  const dedo = qual0.endsWith("!"), qual = dedo ? qual0.slice(0, -1) : qual0;
  const fim = qual === "fim", celebra = qual.startsWith("ok"), pre = qual === "pre";
  const etapa = fim ? 4 : pre ? 1 : Math.min(3, Math.max(1, +(celebra ? qual.slice(2) : qual) || 1));
  // ⚠️ `pre` é uma CARA À PARTE da etapa 1: outra fala, sem barra e sem prompt. Fora da matriz ela não é
  // medida, e é a primeira tela que um jogador novo vê na vida.
  g.hudStore.update(h => ({ ...h, mass: 8482, room: "0TUT", ping: 0, fps: 60, ammo: 3, splitOff: etapa < 3,
    tutor: { t: "tutor", etapa, pct: etapa === 1 && !pre ? .45 : 0, ajuda: +aj || 0, festa: 0, celebra,
      auto: false, fim, pre, dedo } }));
}
function hudDemo() {
  const g = gameRef.get().game;
  app.update({ screen: "game", played: true });
  if (!g || !g.hudStore) return;
  const nome = i => ["Fodao","Stellara","Astrophex","Hydraxis","Darkion","Meteora","Nexaris","Volcanix","Nebulox","Quasara","xXcapitaoXx","trovao_137"][i % 12];
  const lb = Array.from({ length: 12 }, (_, i) => ({ slot: i, name: nome(i), mass: 183273 - i * 12000, level: 60 - i * 3, isBot: i % 3 === 0, registered: i % 4 === 0, me: i === 0, rank: i + 1 }));
  const quem = i => ({ slot: i, name: nome(i), level: 40 - i * 5, me: i === 0, bot: false, ally: i === 1 });
  const agora = Date.now();
  const feed = [
    { id: 1, at: agora, k: "kill", how: "missile", a: quem(0), b: quem(1), assist: null, mine: true },
    { id: 2, at: agora, k: "kill", how: "eat", byHow: "star", a: quem(2), b: quem(3), assist: quem(4), mine: false },
    { id: 3, at: agora, k: "hazard", how: "zone", a: null, b: quem(5), assist: null, mine: false },
    { id: 4, at: agora, k: "sys", how: "lead", a: quem(0), b: null, assist: null, n: 0, mine: true },
    { id: 5, at: agora, k: "sys", how: "crunch", a: null, b: null, assist: null, n: 300, mine: false },
    { id: 6, at: agora, k: "kill", how: "cluster", a: quem(6), b: quem(7), assist: null, mine: false },
  ];
  g.hudStore.update(h => ({ ...h, mass: 183273, score: 139933, rank: 1, coins: 2087, ammo: 3, weapon: 0, owned: 3,
    // os três FORMATOS de powerup, que é o que a matriz precisa medir: tempo (anel + segundos), nível
    // (o escudo) e CARGA (a auto-defesa, que não tem relógio nenhum e fica até ser usada)
    powerups: { magnet: 12, shield: 3, feast: 2, autodef: 1 }, lb, feed, room: "253A", ping: 49, fps: 60,
    clock: { h: 16, m: 16, leftS: 2276 }, alive: 24,
    // ⚠️ SEM `mode` A MATRIZ NUNCA MEDIU O HUD DO BATTLE ROYALE. `Hud.jsx` só desenha aquele bloco com
    // `h.mode === MODE.BR`, e este demo enchia `alive: 24` num HUD que ficava no modo Livre — as ~600
    // combinações de `responsive-check.mjs` passavam por cima de um elemento que nem existia no DOM, com o
    // id dele na lista de colisões desde sempre, como no-op. O `zoneIn` é o outro metade do bloco.
    mode: MODE.BR, zoneIn: 42, zoneShrinking: false }));
}
function mostrarTela(s) {
  if (s === "account") { go("entry"); openAccount(); }
  else if (s === "game") play({});
  // O TUTORIAL, para a matriz de responsividade e para conferir de olho. `?screen=tutor:<etapa>` fixa a
  // etapa e o degrau de ajuda no hudStore, sem precisar jogar até lá — o molde é `dead:<estilo>`.
  else if (s === "tutor" || s.startsWith("tutor:")) { if (import.meta.env.DEV) tutorDemo(s.slice(6)); }
  else if (s === "reconn") { play({}); setTimeout(() => setReconn(true, 2), 400); }
  else if (s === "dead" || s.startsWith("dead:") || s === "round" || s.startsWith("round:")) {
    if (!import.meta.env.DEV) return;
    // ⚠️ O SUFIXO `dead:<estilo>` fixa o modelo no state local (sem PATCH), como `round:<estilo>`: é o
    // que a sonda de responsividade usa para medir os três. Mais dois sufixos, que se acumulam:
    //   `:livre`  força MODE.FREE. Ele existe porque o padrão de fato SEMPRE foi o Battle Royale, por
    //             ACIDENTE: `hudDemo()` grava `mode: MODE.BR` e a tela `game` roda ANTES das de morte em
    //             cada par (aparelho, tema), então o resíduo ficava no hudStore e as ~600 combinações
    //             mediam o rodapé do BR ("OUTRA PARTIDA" + a dica de ficar) e nunca o do Livre, que tem
    //             o contador de respawn. Agora o modo é SEMEADO nos dois sentidos, nunca herdado.
    //   `@min`    abre a tela já RECOLHIDA (a barra do espectador no lugar do cartão) — o estado que o
    //             pedido do Battle Royale no celular criou, e que sem isto nenhuma combinação mediria.
    const dSuf = s.startsWith("dead:") ? s.slice(5) : "";
    const dMin = dSuf.endsWith("@min"), dSemMin = dMin ? dSuf.slice(0, -4) : dSuf;
    const dLivre = dSemMin.endsWith(":livre");
    const dEstilo = (dLivre ? dSemMin.slice(0, -6) : dSemMin) || null;
    // ⚠️ `rewards` COM UMA SKIN DESTRAVADA, e não `null`. O `DeadPrize` tem duas portas — o prêmio (que
    // sai de `rewards.skinsUnlocked`) e a OFERTA de anúncio (que exige `portal.temRecompensa`, falso em
    // dev por não haver adaptador) —, então com `null` a sonda media um cartão SEM o bloco e dava um
    // "18 limpas" que não provava nada sobre a tela que o jogador vê num portal. A porta do prêmio não
    // depende de SDK nenhum e desenha o mesmo nó, com a mesma altura.
    app.update(st => ({ ...st, room: "1ABC", played: true, conn: "connected", rewards: { skinsUnlocked: [119] }, rewardsPending: false, screen: "dead",
      session: dEstilo ? { ...st.session, prefs: { ...st.session.prefs, deadStyle: dEstilo } } : st.session,
      // os campos novos da foto da partida: quem matou tem SLOT e SKIN (o `bySlot` vem do servidor e o
      // cliente resolve skin/nível pelo PLAYERS), e o recorde ANTERIOR viaja junto para a comparação
      deadMin: dMin,   // só o demo escreve isto; em produção é `undefined` e o estado nasce aberto
      lastMatch: { by: "Nebulox", bySlot: 1, bySkin: 30, byLevel: 12, mySkin: 18, myLevel: 7, myName: "Você",
        byHole: false, score: 6900, maxMass: 4820, kills: 3, durationS: 372, placement: 4, players: 17,
        recMass: 7400, recScore: 5200, room: "1ABC", at: Date.now() } }));
    if (s === "round" || s.startsWith("round:")) { const linhas = [{ slot: 1, name: "Vortexia", mass: 12400, score: 9100, food: 610, kills: 4, kd: 2, isBot: true, skinId: 30 },
      { slot: 3, name: "Você", mass: 8200, score: 11800, food: 840, kills: 3, kd: 1.5, skinId: 18 }, { slot: 5, name: "Drakonis", mass: 3100, score: 4200, food: 300, kills: 6, kd: 3, isBot: true, skinId: 34 },
      { slot: 7, name: "Cosmara", mass: 2400, score: 3100, food: 210, kills: 1, kd: .5, isBot: true, skinId: 13 }, { slot: 9, name: "Stellara", mass: 1800, score: 2400, food: 160, kills: 0, kd: 0, isBot: true, skinId: 26 },
      { slot: 11, name: "Graviton", mass: 900, score: 1200, food: 90, kills: 0, kd: 0, isBot: true, skinId: 20 },
      { slot: 13, name: "xXcapitaoXx", mass: 640, score: 980, food: 70, kills: 1, kd: .33, isBot: true, skinId: 7, left: true },
      { slot: 15, name: "Perseu", mass: 420, score: 610, food: 44, kills: 0, kd: 0, isBot: true, skinId: 41, registered: true }];
      // com `destaques` a sonda de responsividade passa a medir também o bloco do campeão e a fileira de
      // quatro cartões — sem eles o `.awards` simplesmente não existe no DOM e as combinações passavam
      // por cima da metade da tela.
      // ⚠️ O SUFIXO `round:<estilo>` fixa o modelo E DESLIGA a abertura (só no state local, sem PATCH):
      // a sonda mede o PLACAR, e com a animação de 2 s no ar ela mediria o overlay dela. Quem quiser ver
      // a abertura usa `mostrarTela("round")` sem sufixo, que respeita as prefs.
      const estilo = s.startsWith("round:") ? s.slice(6) : null;
      // ⚠️ `round:<estilo>:eq` monta o fim de um Battle Royale em EQUIPE: `reason:"lastAlive"`, `champTeam`
      // e o `team` nas linhas. Sem um caso assim nenhuma sonda e nenhuma conferência de olho passa pelo
      // bloco da equipe campeã — que é justamente o caminho que ficou anos anunciando um vencedor só.
      const eq = estilo && estilo.endsWith(":eq");
      if (eq) { linhas[0].team = 0; linhas[1].team = 0; linhas[2].team = 1; linhas[3].team = 1; }
      app.update(st => ({ ...st, room: "1ABC", rewards: null, rewardsPending: true, screen: "round",
        session: estilo ? { ...st.session, prefs: { ...st.session.prefs, roundStyle: eq ? estilo.slice(0, -3) : estilo, roundIntro: false } } : st.session,
        roundResult: { code: "1ABC", mySlot: 3, at: Date.now(), nextInMs: 15000, total: linhas.length,
          reason: eq ? "lastAlive" : "time", champTeam: eq ? 0 : null, mode: eq ? 1 : 0,
          champion: linhas[0], board: linhas,
          destaques: { campeao: linhas[0], pontuador: linhas[1], glutao: linhas[1], carrasco: linhas[2], letal: linhas[2] } } })); }
    // A sonda de responsividade mede o HUD DE ESPECTADOR que agora existe atrás destas telas (chat + o
    // bloco de "assistindo"). Sem semear o hudStore o painel tem altura zero, o `vis()` o descarta, e as
    // ~400 combinações passariam sem ver a única coisa nova na tela.
    const g = gameRef.get().game;
    if (g && g.hudStore) { const t = Date.now();
      // `lb`/`alive` são o que o modelo "sala" da tela de morte desenha (quem está na frente AGORA, do
      // placar de 2 Hz). Sem eles aquele bloco não existe no DOM e a sonda passaria por cima dele.
      g.hudStore.update(h => ({ ...h, dead: true, map: false, room: "1ABC", spec: { slot: 1, name: "Nebulox", vivos: 12 }, alive: 12,
        // ⚠️ SEMEADO, nunca herdado: ver a nota dos sufixos acima. E `deadAt`/`armAt` fazem o contador de
        // respawn do Livre existir — sem eles `prazoDe` devolve 0, a dica de "mexa para renascer" toma o
        // lugar do contador e a sonda mede um rodapé que a partida real não tem.
        mode: dLivre ? MODE.FREE : MODE.BR,
        deadAt: performance.now(), armAt: dLivre ? performance.now() : 0,
        lb: [{ slot: 1, name: "Nebulox", mass: 12400, level: 12, rank: 1 }, { slot: 3, name: "Você", mass: 4820, level: 7, rank: 2, me: true },
          { slot: 5, name: "Drakonis", mass: 3100, level: 4, rank: 3 }, { slot: 7, name: "Cosmara", mass: 2400, level: 9, rank: 4 },
          { slot: 9, name: "Stellara", mass: 1800, level: 2, rank: 5 }],
        chat: [{ slot: 2, name: "Stellara", text: "quem pegou o buraco negro?", at: t, mine: false },
          { slot: 3, name: "xXcapitaoXx", text: "fui eu, desculpa aí", at: t, mine: false, dead: true },
          { slot: -1, name: null, text: "🎤 Meteora", at: t, mine: false }] })); }
    setTimeout(() => onRewards({ saved: true, coinsEarned: 54, coins: (app.get().session.user || {}).coins + 54 || 54, achievements: [], skinsUnlocked: [], rank: { day: 35 } }), 1200);
  }
  // ⚠️ A BARRA DE QUEM ASSISTE (`ui/Spectate.jsx`) precisa entrar na matriz como `dead` e `round` entraram:
  // ela é `position:fixed`, tem variante própria em retrato e três alvos de toque — exatamente a forma de
  // elemento que a sonda existe para cobrar. Sem semear o `spec` no hudStore o nome fica "—", a caixa
  // encolhe e a medida seria de uma barra que ninguém vê.
  else if (s === "spec") {
    if (!import.meta.env.DEV) return;
    app.update(st => ({ ...st, room: "1ABC", conn: "connected", screen: "spec" }));
    const g = gameRef.get().game;
    if (g && g.hudStore) g.hudStore.update(h => ({ ...h, dead: false, map: false, room: "1ABC",
      spec: { slot: 1, name: "xXcapitaoXx", vivos: 12 }, alive: 12 }));
  }
  else go(s);
}

// ── dados de apoio ───────────────────────────────────────────────────────────
export async function loadConfig() { try { const c = await api.config(); app.update({ config: c }); checaVersao(c); } catch { /* opcional */ } }
export async function loadTop5() {
  try { const r = await api.ranking("day", "score", 5);
    app.update(s => ({ ...s, top5: r.rows || [], top5At: Date.now(), session: { ...s.session, dayRank: r.me ? r.me.rank : null } })); }
  catch { /* opcional */ }
}
export async function loadRooms() {
  try { const r = await api.rooms(); app.update({ rooms: r.rooms || [], roomsAt: Date.now() }); }
  catch { /* opcional */ }
}
export async function loadSkins() {
  try { const r = await api.skins(); if (!r) return;
    // ⚠️ O CATÁLOGO DO BANCO deixou de ser descartado. Ele traz as skins criadas no /admin (que esta build
    // não conhece) e o `art_hash` das que têm arte — inclusive as de CÓDIGO, e é por aí que as caricaturas
    // passam a vir do Postgres em vez do zip. `setSkinArt` alimenta o carregador de textura; `registerSkins`
    // acrescenta as de banco ao MESMO array `SKINS` que os 16 consumidores de `skinById` já seguram, então
    // loja, render e prévia as enxergam sem uma linha de mudança.
    if (r.db) { registerSkins(r.db); setSkinArt(r.db); }
    app.update(s => ({ ...s, session: { ...s.session, skins: r.owned && r.owned.length ? r.owned : s.session.skins, adWatched: r.adWatched || s.session.adWatched, user: s.session.user ? { ...s.session.user, equippedSkin: r.equipped != null ? r.equipped : s.session.user.equippedSkin } : s.session.user } })); }
  catch { /* opcional */ }
}
export async function loadHistory(limit = 20) {
  try { const r = await api.history(limit); return r.matches || []; } catch { return []; }
}

// ── nick / conta ─────────────────────────────────────────────────────────────
/**
 * PATCH /api/me {nick}. Devolve {ok, suggestion?}.
 * ⚠️ `silencioso` existe para o nick SORTEADO (`garanteNick`): ali ninguém pediu para salvar nada, e o
 * "nick salvo" apareceria a cada primeira partida de cada convidado. O erro continua sendo dito nos dois
 * casos — falhar em silêncio é outra coisa.
 */
export async function setNick(nick, { silencioso = false } = {}) {
  nick = String(nick || "").replace(/\s+/g, " ").trim();
  const cur = (app.get().session.user || {}).nick;
  if (nick === cur) return { ok: true };
  if (!NICK_RE.test(nick)) { toast(getLabels().nickShort); return { ok: false }; }
  try { const r = await api.setNick(nick); patchUser(r && r.user ? r.user : { nick }); app.update({ nomeado: true }); if (!silencioso) toast(getLabels().nickSaved); return { ok: true }; }
  catch (e) { toast(errText(e, "nick") + (e.suggestion ? ` · ${e.suggestion}` : ""), 3000); return { ok: false, suggestion: e.suggestion, error: e }; }
}
/**
 * Reivindicar a conta. O que se escolhe aqui é o USUÁRIO (o nome de entrar), não o nick: ele congela no
 * cadastro e é o único nome único do jogo. O nick continua sendo editado na tela inicial — e é livre.
 */
export async function claim({ login, password, email }) {
  const r = await api.claim({ login, password, email });
  if (r && r.user) patchUser(r.user); else patchUser({ kind: "registered" });
  closeAccount(); toast(getLabels().claimed); return r;
}
export async function login({ login: l, password }) {
  await api.login({ login: l, password });
  applySession(await api.bootstrap());
  closeAccount(); toast(getLabels().loggedIn); loadTop5();
}
/** Entrar com Google. `credential` é o id_token que o GSI devolve; o desfecho é o mesmo do `login`. */
export async function loginGoogle(credential) {
  await api.google(credential);
  applySession(await api.bootstrap());
  closeAccount(); toast(getLabels().loggedIn); loadTop5();
}
/**
 * País do ranking regional. Otimista (a lista responde na hora) e reverte no erro, como as ações da loja.
 * `null` limpa: entrar no recorte é opcional, e sair também tem que ser.
 */
export async function setCountry(country) {
  const antes = app.get().session.user;
  app.update(s => ({ ...s, session: { ...s.session, user: { ...s.session.user, country: country || null } } }));
  try { const r = await api.setCountry(country); app.update(s => ({ ...s, session: { ...s.session, user: { ...s.session.user, ...(r.user || {}) } } })); }
  catch (e) { app.update(s => ({ ...s, session: { ...s.session, user: antes } })); toast(errText(e)); }
}
export async function logout() {
  await api.logout(); applySession(await api.bootstrap()); toast(getLabels().loggedOut); go("entry");
}

// ── preferências ─────────────────────────────────────────────────────────────
let prefsT = null, prefsDirty = {};
const schedule = () => { clearTimeout(prefsT); prefsT = setTimeout(() => flushPrefs(), 600); };
export function setPref(key, val) {
  if (!PREF_KEYS.includes(key)) return;
  app.update(s => ({ ...s, session: { ...s.session, prefs: { ...s.session.prefs, [key]: val } } }));
  applyPrefsSideEffects(app.get().session.prefs);
  prefsDirty[key] = val; schedule();
}
/**
 * MUDO, o interruptor de urgência. Passa pelo `setPref` como qualquer outra preferência — então persiste,
 * respeita a whitelist do servidor e reaproveita o `applyPrefsSideEffects`, que é quem avisa o motor de
 * áudio. Devolve o estado novo para quem quiser avisar o jogador.
 */
export function toggleMute() {
  const m = !app.get().session.prefs.muted;
  setPref("muted", m);
  return m;
}
export async function flushPrefs() {
  clearTimeout(prefsT); const d = prefsDirty; prefsDirty = {};
  if (!Object.keys(d).length) return true;
  try { await api.setPrefs(d); return true; } catch (e) { toast(errText(e), 2500); return false; }
}
export async function savePrefs() {
  const p = app.get().session.prefs; PREF_KEYS.forEach(k => { prefsDirty[k] = p[k]; });
  // salvou = acabou: volta para quem abriu as Opções. Só no SUCESSO — se o PATCH falhou, sair da tela
  // esconderia o erro e o jogador não teria como tentar de novo.
  if (!await flushPrefs()) return;
  toast(getLabels().saved);
  const s = app.get(), volta = s.prevScreen && s.prevScreen !== "prefs" ? s.prevScreen : "entry";
  go(volta);
}
export const closeLevelUp = () => app.update({ levelUp: null });
export function resetPrefs() {
  app.update(s => ({ ...s, session: { ...s.session, prefs: { ...PREF_DEFAULTS } } }));
  applyPrefsSideEffects(PREF_DEFAULTS); PREF_KEYS.forEach(k => { prefsDirty[k] = PREF_DEFAULTS[k]; }); schedule();
}

// ── loja (UI otimista) ───────────────────────────────────────────────────────
export async function equipSkin(id) {
  const before = app.get().session.user; if (!before) return;
  if (!app.get().session.skins.includes(id)) { toast(getLabels().lockedToast); return; }
  patchUser({ equippedSkin: id });
  try { const r = await api.equip(id); if (r && r.equippedSkin != null) patchUser({ equippedSkin: r.equippedSkin }); toast(getLabels().equippedToast); }
  catch (e) { patchUser({ equippedSkin: before.equippedSkin }); toast(errText(e), 2500); }
}
export async function buySkin(id) {
  const s = app.get().session, sk = skinById(id); if (!s.user) return;
  if (s.skins.includes(id)) return equipSkin(id);
  if (sk.rarity === "secret") { toast(getLabels().secretToast); return; }
  if (sk.unlockKey || sk.price <= 0) { toast(getLabels().lockedToast + ": " + sk.desc); return; }
  if (s.user.coins < sk.price) { toast(getLabels().poorToast); return; }
  const snapshot = { coins: s.user.coins, skins: s.skins, equipped: s.user.equippedSkin };
  app.update(st => ({ ...st, session: { ...st.session, skins: [...st.session.skins, id], user: { ...st.session.user, coins: st.session.user.coins - sk.price, equippedSkin: id } } }));
  try {
    const r = await api.buy(id);
    app.update(st => ({ ...st, session: { ...st.session, skins: r && r.owned ? r.owned : st.session.skins, user: { ...st.session.user, coins: r && typeof r.coins === "number" ? r.coins : st.session.user.coins } } }));
    toast(getLabels().bought);
    try { await api.equip(id); } catch { patchUser({ equippedSkin: snapshot.equipped }); }
  } catch (e) {
    app.update(st => ({ ...st, session: { ...st.session, skins: snapshot.skins, user: { ...st.session.user, coins: snapshot.coins, equippedSkin: snapshot.equipped } } }));
    toast(errText(e), 2500);
  }
}
/**
 * Assiste um anúncio recompensado (Poki `rewardedBreak`) para DESTRAVAR a compra de uma skin mascote —
 * cada mascote pede o PRÓPRIO anúncio, e assistir não dá mais a skin de graça: `buySkin` continua sendo
 * quem cobra as moedas e concede a posse, depois disto.
 * ⚠️ Só existe com `portal.temRecompensa`: ter adaptador NÃO é ter recompensa — só a Poki implementa
 * `recompensa()`, e nos outros seis o botão caía num `return false` mudo. Sem ele não há o que assistir, e o `SkinModal`
 * já não oferece este estado fora dele — esta função é o braço, `Shop.jsx` decide quando mostrar o botão.
 */
/**
 * O ANÚNCIO DA TELA DE MORTE: assistiu, GANHOU a skin (e já equipada).
 *
 * ⚠️ NÃO reusa `watchMascotAd`, e não é duplicação: as regras são opostas de propósito e as POOLS são
 * disjuntas. As três mascotes seguem o que a migração 0012 estabeleceu ao derrubar a 0011 — o anúncio
 * DESTRAVA a compra, as moedas continuam obrigatórias; `AD_GIFT_SKINS` é dado. Um caminho só com um `if`
 * dentro seria a mesma coisa com mais chance de alguém trocar as duas.
 * ⚠️ E o carimbo de anúncio é do PORTAL (`portal.recompensa`), que já registra o `ultimoAd` — sem isso o
 * jogador levaria o rewarded aqui e um midroll no clique seguinte em DE NOVO.
 */
export async function ganharSkinAnuncio(id) {
  const s = app.get().session; if (!s.user) return;
  if ((s.skins || []).includes(id)) return equipSkin(id);
  if (!portal.temRecompensa) { toast(getLabels().adUnavailable); return; }
  let assistiu = false;
  try { assistiu = await portal.recompensa(); } catch { assistiu = false; }
  if (!assistiu) { toast(getLabels().adSkipped); return; }
  try {
    const r = await api.adGift(id);
    app.update(st => ({ ...st, session: { ...st.session,
      skins: (r && r.skins) || [...(st.session.skins || []), id],
      user: st.session.user ? { ...st.session.user, equippedSkin: (r && r.equippedSkin) != null ? r.equippedSkin : id } : st.session.user } }));
    sfx("buy");
    toast(getLabels().prizeGot, 2600);
  } catch (e) { toast(errText(e), 2500); }
}

export async function watchMascotAd(id) {
  const s = app.get().session; if (!s.user) return;
  if (s.skins.includes(id)) return equipSkin(id);
  if (s.adWatched && s.adWatched.includes(id)) return;
  if (!portal.temRecompensa) { toast(getLabels().adUnavailable); return; }
  let assistiu = false;
  try { assistiu = await portal.recompensa(); } catch { assistiu = false; }
  if (!assistiu) { toast(getLabels().adSkipped); return; }
  try {
    const r = await api.watchAd(id);
    app.update(st => ({ ...st, session: { ...st.session, adWatched: (r && r.adWatched) || [...(st.session.adWatched || []), id] } }));
    toast(getLabels().adWatchedOk);
  } catch (e) { toast(errText(e), 2500); }
}

// ── partida ──────────────────────────────────────────────────────────────────
/** Devolve o cursor ao campo da tela inicial. Os 60 ms esperam o React montar a Entrada. */
export const focaNome = () => setTimeout(() => { const el = document.getElementById("nameIn"); if (el) { el.focus(); el.select(); } }, 60);
/**
 * ⚠️ NINGUÉM ENTRA SEM NOMEAR O PLANETA. O campo da tela inicial nasce VAZIO de propósito — o
 * `Viajante-NNNN` é placa sorteada pelo servidor (`randomGuestNick`), não escolha de ninguém —, e sem
 * esta guarda o jogador entrava com a placa: o pedido do placeholder era enfeite.
 * A validação mora no `play()`, e não no botão JOGAR, porque `play()` é a porta ÚNICA — Modos, Salas
 * (auto, código e lista), o respawn da tela de morte e a entrada automática depois do BIG CRUNCH passam
 * todos por aqui. Validar no botão cobriria um caminho de seis.
 * ⚠️ `leaveGame` e não `go` quando já se está em partida: o respawn é chamado com a conexão VIVA, e
 * trocar de tela sem derrubá-la deixaria um socket de jogo pendurado atrás do menu.
 */
/**
 * O JOGAR entra direto na partida NESTA plataforma? A lista vem do /admin por `/api/config`
 * (`ENTRY.DIRETO`); enquanto ela não chegou vale o comportamento de BUILD, que é o de hoje.
 * ⚠️ É lido DENTRO do clique, nunca renderizado — por isso não pisca quando a lista chega depois.
 */
export const entraDireto = () => entraDiretoEm((app.get().config || {}).entraDireto);

export function semNome(pedido = null) {
  // ⚠️ SÓ NA CRAZYGAMES A GUARDA NÃO VALE, e não é descuido: só ela exige, por escrito, que o jogador
  // novo caia direto no jogo ("new users should land in gameplay immediately", no máximo 1 clique). Ali
  // o primeiro clique em JOGAR não fazia NADA além de um toast pedindo um nome — o revisor deles travava
  // na tela inicial. A placa sorteada vira o nome de estreia (é o que todo .io faz) e o campo continua
  // ali, na mesma tela, para quem quiser trocar antes ou depois de jogar.
  // ⚠️ Isto já foi `if (PORTAL)`, generalizando a exigência da CrazyGames para TODOS os portais — e
  // ninguém mais tem essa exigência escrita (ver `entraDiretoEm` em portal/flags.js). Era isso que deixava
  // qualquer portal (a Poki incluída) entrar direto com `Viajante-NNNN` sem nunca pedir um nome.
  // ⚠️ NO PACOTE A GUARDA NÃO EXISTE, e não é o mesmo caso do `entraDireto()` logo abaixo: lá ela é
  // DESLIGADA por decisão do painel; aqui ela é IMPOSSÍVEL. Sem tela inicial montada não há para onde
  // mandar quem não nomeou o planeta — as duas saídas desta função (`go("entry")` e `leaveGame("entry")`)
  // deixariam o jogador diante de um shell vazio, sem erro nenhum no console. Ver `SEM_MENU`.
  if (SEM_MENU) return false;
  if (entraDireto()) return false;
  const st = app.get(), u = st.session.user || {};
  if (st.nomeado || !nickSorteado(u.nick)) return false;
  app.update({ pendingPlay: pedido });
  toast(getLabels().nickAsk, 3500);
  if (st.screen === "game") leaveGame("entry"); else go("entry");
  focaNome(); return true;
}
/**
 * ⚠️ `play()` NÃO É REENTRANTE, e a prova disso veio do Inspector da Poki. Entre o `Commercial break` e
 * o `Gameplay start` apareceram SEIS `Measure` de `menu/entry` e `connect/match` — porque durante o
 * anúncio a tela por baixo continua viva: o botão que abriu o anúncio segue com o FOCO, e uma barra de
 * espaço (ou um Enter, ou um segundo clique) o reativa. Cada reativação rodava `play()` inteiro por trás
 * do comercial. Isso quebra duas regras escritas deles de uma vez — nenhum evento de SDK durante um
 * midroll, e nada de eventos repetidos —, e ainda enfileirava conexões de WebSocket que ninguém pediu.
 * A fila de `portal.medir` (portal/index.js) cala o sintoma; o guard aqui remove a causa.
 * ⚠️ `finally`, sempre: um `entrando` que vaze deixa o botão JOGAR morto para o resto da sessão, que é
 * um defeito muito pior que o que ele conserta.
 */
let entrando = false;
export async function play(pedido = {}) {
  if (entrando) return;
  entrando = true;
  try { return await entraNaSala(pedido); } finally { entrando = false; }
}
async function entraNaSala({ room, mode, teamSize, party, semAnuncio } = {}) {
  cancelaTelaMorte();   // entrar noutra sala durante a espera: a tela de morte seria da sala que ficou
  // ANTES da guarda, e é o que a torna inerte quando há sugestão: com o campo já preenchido, mandar o
  // jogador de volta à tela inicial para pedir um nome que está lá é repique puro. Com a sugestão vazia
  // (parâmetro desligado no /admin, ou a conta já nomeada) isto é um no-op e `semNome` segue mandando.
  await garanteNick();
  if (semNome({ room, mode, teamSize, party })) return;
  // Game Events da Poki: fecha a etapa "menu" e abre "connect" — ver o `start` em ui/Entry.jsx e o
  // `complete` de "connect" em `onConnection`, mais abaixo.
  // ⚠️ O PASSO `menu/entry` SAI DO FUNIL NO PACOTE, e é uma consequência direta do boot direto: quem abre
  // aquele passo é o mount de `ui/Entry.jsx`, que ali não monta — então só o `complete` chegava ao painel
  // deles, um fechamento sem abertura. Pior que ruído: o funil 1.12 leu 17% de abandono NESSE passo, e
  // mantê-lo agora reportaria 100% de conversão numa tela que deixou de existir. O que sobra é o que
  // passou a ser verdade: `connect/match` e `session/60s|180s|300s`.
  if (PORTAL) { if (!SEM_MENU) portal.medir("menu", "entry", "complete"); portal.medir("connect", "match", "start"); matchResolvido = false; }
  // ── ANÚNCIO DE PORTAL ──
  // Ponto ÚNICO, e de propósito: `play()` é a porta por onde passam Modos, Salas (auto, código e lista),
  // o convite, a largada de equipe, o respawn da tela de morte e a entrada automática depois do BIG
  // CRUNCH. O tipo sai de `played`, que já existe e já significa "já entrou em partida nesta carga":
  // a primeira é preroll, as seguintes são midroll (a fachada guarda o intervalo mínimo).
  // ⚠️ É aqui e não no instante da MORTE: atrás da tela de morte a rodada continua correndo e o jogador
  //    está assistindo de propósito (troca de câmera, mapa, sala ao vivo) — cobrir isso com anúncio é o
  //    que a regra dos portais proíbe. No respawn não há partida rodando, então "pausado e mudo" é
  //    verdade por construção. E nada disso pode PENDURAR o botão: a fachada sempre resolve.
  // ⚠️ `semAnuncio` existe por UM chamador: `voltaAoJogo()`, a re-entrada automática do pacote. Ela também
  // passa por aqui (é a porta única, e tem que continuar sendo), e com `played` já true cada TENTATIVA de
  // reconexão pedia um MIDROLL — ou seja, o jogo que não conseguiu entrar cobrava um anúncio do jogador
  // por isso. Visto no Event Log do Inspector da Poki: `Commercial break` no meio de quatro
  // `connect/match/fail`, e antes do `Game loading finished`, que é o que eles proíbem por escrito.
  // Anúncio é preço de ENTRAR EM PARTIDA, nunca de uma falha nossa.
  // ⚠️ O MIDROLL TEM PEDÁGIO (`pedagioLiberado`), o PREROLL não: aquele é anterior à primeira vida e a
  // GameDistribution o EXIGE por escrito (§2.1) — barrá-lo trocaria uma reprova por outra. Quem não quer
  // preroll declara `semPreroll` no próprio adaptador, que é onde a regra do SDK mora.
  if (PORTAL && !semAnuncio) {
    const a0 = app.get();
    if (!a0.played) await portal.anuncio("preroll");
    else if (pedagioLiberado({ mortes: a0.mortes, kills: a0.kills, sessaoMs: performance.now() })) await portal.anuncio("midroll");
  }
  const st = app.get();
  const md = mode != null ? mode | 0 : st.gameMode | 0, ts = teamSize != null ? teamSize | 0 : st.teamSize || 1;
  const pt = party !== undefined ? party : (st.party ? st.party.code : null);
  let code = room ? String(room).toUpperCase() : null;
  if (!code) { try { const a = await api.auto({ mode: md, teamSize: ts }); if (a && a.code) code = a.code; } catch (e) { if (!isUnreachable(e)) toast(errText(e), 2500); } }
  levelUpFila = null;
  app.update(s => ({ ...s, screen: "game", played: true, interrompido: false, rewards: null, rewardsPending: false, roundPronto: false, overlays: { account: false, reconn: false, pause: false }, conn: "connecting",
    gameMode: md, teamSize: ts,
    pendingPlay: null,
    pendingJoin: { room: code, mode: md, teamSize: ts, party: pt, n: (s.pendingJoin ? s.pendingJoin.n : 0) + 1 } }));
  partidaIniciada({ mode: md, teamSize: ts, party: pt });
  // ⚠️ NADA DE `portal.jogoComecou()` AQUI. O gameplay do SDK é derivado do STORE (portal/sessao.js), e
  // é o `screen:"game"` escrito logo acima que o abre — sozinho, uma vez, e depois do anúncio. Chamá-lo
  // à mão também aqui não quebra (a fachada é idempotente), mas cria uma segunda verdade sobre "estou
  // jogando" que diverge no primeiro caminho novo — foi exatamente assim que a MORTE ficou sem `stop`.
}
/**
 * O TUTORIAL DE ESTREIA. Irmão de `assistir()`, e o que o separa de `play()` é o que ele NÃO é:
 * · **não passa por `semNome()`** — quem está aprendendo a mover um planeta não precisa nomeá-lo antes;
 * · **não chama `portal.anuncio()`** — um comercial antes do primeiro frame de quem nunca jogou é
 *   exatamente o que a CrazyGames proíbe por escrito, e a Poki recusa `commercialBreak` antes do
 *   primeiro `gameplayStart`, que ainda nem aconteceu;
 * · **não chama `api.auto`** — não há sala; o mundo roda na própria página (`game/net/tutorServer.js`);
 * · **não escreve `played`**, e esta é a linha que mais parece detalhe e menos é. Com `played:true` o
 *   `play()` do FIM do tutorial pediria MIDROLL — e `pedagioLiberado` (0 mortes) o bloquearia, então o
 *   jogador entraria na primeira partida sem anúncio nenhum, contra a §2.1 da GameDistribution. Falso,
 *   sai o PREROLL, e ele cai no melhor lugar possível: depois de a pessoa já ter gostado do jogo.
 *
 * ⚠️ A MARCA É GRAVADA AQUI, na abertura — nunca no fim. Uma tela de estreia que reaparece a cada F5 (ou
 * a cada erro de JS no meio dela) é a pior falha possível desta feature; o preço de errar para o outro
 * lado é perder 40 s de tutorial num reload. É uma tentativa por pessoa.
 */
export function entraNoTutorial() {
  levelUpFila = null; cancelaTelaMorte(); marcaTutor(); marco("tutor_start");
  app.update(s => ({ ...s, screen: "game", interrompido: false, rewards: null, rewardsPending: false, roundPronto: false,
    overlays: { account: false, reconn: false, pause: false }, conn: "connecting", pendingPlay: null,
    pendingJoin: { room: null, mode: MODE.FREE, teamSize: 1, party: null, tutorial: true, n: (s.pendingJoin ? s.pendingJoin.n : 0) + 1 } }));
}
/**
 * SAIR DO TUTORIAL — pular e terminar são a MESMA saída (entrar numa sala de verdade) e diferem em uma
 * coisa só, que é uma decisão de produto e não de código:
 *
 * ⚠️ **CONCLUIR marca a missão como feita; PULAR não.** Quem concluiu já aprendeu a comer, a atirar e a
 * dividir, e entra na primeira vida direto na etapa 3 (a dica do dividir). Quem pulou não aprendeu nada e
 * precisa da faixa inteira no rodapé. Sem esta linha o cruzamento acontece sozinho e **para o lado
 * errado**: `game.leave()` chama `fimDaVida()` sempre que havia partida, e sair daqui passa por `play()`
 * → `game.join()` → `leave(true)`. O default do código é punir quem pulou.
 * ⚠️ E a saída passa por `play()` inteiro, que é a porta única do anúncio de portal, do `api.auto`, do
 * `partidaIniciada` do GA e do `connect/match` do funil. `game.join()` chama `game.leave(true)` na
 * primeira linha, que faz `local.stop()` — o servidor do tutorial morre sozinho.
 */
export function saiDoTutorial({ fim = false } = {}) {
  marcaTutor();
  if (fim) { marcaMissao(); marco("tutor_done"); } else marco("tutor_skip");
  return play({ mode: MODE.FREE, teamSize: 1, party: null });
}
/**
 * ASSISTIR a uma sala em andamento. É o irmão de `play()`, e o que o separa dele é o que assistir NÃO é:
 * · **não passa por `semNome()`** — quem só olha não precisa nomear um planeta que não vai existir;
 * · **não chama `partidaIniciada()` nem anúncio de portal** — não há partida, e um preroll antes de
 *   assistir seria cobrar pedágio por uma tela que não é gameplay (a CrazyGames proíbe isso por escrito);
 * · **não escreve `played`** — a casca da tela (`body[data-shell]`) usa `played && conn` para virar gaveta,
 *   e assistir ocupa a tela inteira, que é o ponto;
 * · **não mexe em `gameMode`/`teamSize`** — a preferência do JOGAR do jogador não muda porque ele foi ver
 *   uma partida alheia.
 * O `spec:true` viaja no `pendingJoin` → `GameHost` → `game.join({spec})` → `{t:"join",spec:true}`.
 */
export function assistir({ room } = {}) {
  const code = room ? String(room).toUpperCase() : null;
  if (!code) return;
  levelUpFila = null; cancelaTelaMorte();
  app.update(s => ({ ...s, screen: "spec", interrompido: false, rewards: null, rewardsPending: false, roundPronto: false,
    overlays: { account: false, reconn: false, pause: false }, conn: "connecting",
    pendingPlay: null,
    pendingJoin: { room: code, spec: true, n: (s.pendingJoin ? s.pendingJoin.n : 0) + 1 } }));
}
/**
 * Renascer NA MESMA SALA e na mesma conexão (Livre). O jogador morto nunca saiu da sala — o socket está
 * aberto e o chat funciona —, então mandá-lo por `play()` fechava o socket para abrir outro, o que produzia
 * um "saiu/entrou" no feed e, pior, abria uma janela em que um preenchimento podia tomar o nick dele.
 *
 * ⚠️ ELE PRECISA REFAZER O QUE `play()` FAZ E QUE NÃO É ENTRAR NA SALA. O anúncio de portal e o
 * `match_start` do GA moram lá dentro porque `play()` era a porta única; saindo por aqui, o midroll do
 * RENASCIMENTO — que é a maioria deles numa sessão — sumiria da receita em silêncio.
 * ⚠️ Recusado (socket caído, sala acabada, Battle Royale), cai no `play({room})` de sempre: o caminho
 * antigo continua inteiro e é a rede.
 *
 * ⚠️ ELE COMPARTILHA O TRINCO DE `play()`, e o defeito que isso fecha é maior do que "dois avisos". O
 * primeiro clique manda `{t:"respawn"}` ANTES do `await` do anúncio, então o `{t:"alive"}` chega durante
 * o comercial e zera o `dead` do motor; um segundo clique (o botão continua com o FOCO por trás do
 * anúncio — é o mesmo caminho que produziu os seis `Measure` do Inspector, ver `play()`) acha
 * `g.respawn()` devolvendo false e cai no `play({room})`: socket fechado e reaberto, "saiu/entrou" no
 * feed, uma janela em que um preenchimento toma o nick e um `match_start` a mais no GA. Com o respawn
 * automático em 2 s e o CTA sempre clicável, o clique e o relógio chegam juntos o tempo todo.
 * ⚠️ O fallback chama `entraNaSala` DIRETO: `play()` de dentro do trinco cairia no próprio `if (entrando)`.
 */
export async function respawnAqui(room) {
  if (entrando) return;
  entrando = true;
  try { return await renasceAqui(room); } finally { entrando = false; }
}
async function renasceAqui(room) {
  evento("respawn");   // contagem, não marco: é a razão `respawn`/`first_death` que diz se o auto disparou no iframe
  cancelaTelaMorte();   // clicou em DE NOVO durante a espera: a tela de morte não tem mais para que subir
  const g = getGame();
  if (!g || !g.respawn || !g.respawn()) return entraNaSala(room ? { room } : {});
  // ⚠️ E AQUI O PEDÁGIO MORDE DE VERDADE: o respawn é a MAIORIA dos anúncios de uma sessão, e é
  // exatamente o passo que o 1.21 existe para tornar barato. As duas primeiras mortes passam sem nada;
  // depois delas ainda é preciso um abate ou três minutos de página. Ver `portal/primeiraVida.js`.
  const a0 = app.get();
  if (PORTAL && pedagioLiberado({ mortes: a0.mortes, kills: a0.kills, sessaoMs: performance.now() })) await portal.anuncio("midroll");
  levelUpFila = null;
  const st = app.get();
  app.update(s => ({ ...s, screen: "game", interrompido: false, rewards: null, rewardsPending: false, levelUp: null,
    overlays: { ...s.overlays, account: false, pause: false } }));
  partidaIniciada({ mode: st.gameMode | 0, teamSize: st.teamSize || 1, party: st.party ? st.party.code : null });
}
// ── modos e lobby de equipe ────────────────────────────────────────────────
export function setMode(mode, teamSize = 1) { app.update({ gameMode: mode | 0, teamSize: teamSize | 0 || 1 }); }
const meNick = () => (app.get().session.user || {}).nick || "Viajante";
const meSkin = () => (app.get().session.user || {}).equippedSkin | 0;
/**
 * Abre uma sala DA PESSOA: ela escolhe o modo, a duração (0 = sem fim, só no Livre) e se é privada, e entra
 * como dona — podendo expulsar e banir. Só conta registrada: quem tem esse poder precisa de uma identidade
 * que dure mais que uma aba, e o servidor recusa com `need_account`.
 */
/** Link de convite (`?sala=ABCD`): descobre o modo da sala e entra nela. */
export async function entrarPorConvite(code) {
  const c = String(code || "").trim().toUpperCase();
  if (c.length !== 4) return;
  try { const r = await api.roomGet(c); const m = r.room.mode | 0, ts = r.room.teamSize || 1;
    app.update({ gameMode: m, teamSize: ts });
    play({ room: c, mode: m, teamSize: ts, party: null }); }
  catch (e) { toast(errText(e, "room"), 3000); go("lobby"); }
}
export async function criarSala({ mode = 0, teamSize = 1, minutes = 30, private: priv = false } = {}) {
  try { const r = await api.roomCreate({ mode, teamSize, minutes, private: priv });
    app.update({ gameMode: mode, teamSize });
    play({ room: r.room.code, mode, teamSize, party: null }); return r.room; }
  catch (e) { toast(errText(e, "room"), 3000); return null; }
}
/** Dono da sala: expulsar (`kick`) ou banir da sala (`ban`). Quem autoriza é o servidor. */
export const hostAct = (act, pid) => { const g = getGame(); if (g) g.hostAct(act, pid); };
export async function createParty(teamSize) {
  try { const r = await api.partyCreate({ mode: 1, teamSize, nick: meNick(), skinId: meSkin() });
    app.update({ party: r.party, partyMe: r.you || null, partyError: null, gameMode: 1, teamSize: r.party.teamSize, screen: "party" }); return r.party; }
  catch (e) { toast(errText(e, "party"), 2800); return null; }
}
export async function joinParty(code) {
  const c = String(code || "").trim().toUpperCase();
  if (c.length !== 4) { toast(getLabels().partyCode + ": " + preenche(getLabels().fmt.chars, { n: 4 })); return null; }
  try { const r = await api.partyJoin(c, { nick: meNick(), skinId: meSkin() });
    app.update({ party: r.party, partyMe: r.you || null, partyError: null, gameMode: 1, teamSize: r.party.teamSize, screen: "party" }); return r.party; }
  catch (e) { toast(errText(e, "party"), 2800); return null; }
}
/**
 * Recarrega o lobby (a tela faz polling a 1 Hz — é um lobby, não precisa de WebSocket).
 * SÓ um 404 desfaz a equipe: é a resposta do shard DONO dizendo que o lobby acabou (líder saiu, TTL
 * venceu, o pod voltou vazio). Qualquer outra falha — rede, 5xx, o 503 de um shard irmão mudo — é
 * passageira, e tratá-la como fim era o que fechava a tela de equipe sozinha, em um segundo.
 * `atualizando` porque o `useInterval` dispara a cada 1 s sem esperar a chamada anterior: com o salto
 * entre shards as respostas podem chegar fora de ordem, e um 200 velho reviveria a equipe já desfeita.
 */
let atualizando = false;
export async function refreshParty() {
  const p = app.get().party; if (!p || atualizando) return;
  atualizando = true;
  try { const r = await api.partyGet(p.code); app.update({ party: r.party, partyMe: r.you || app.get().partyMe, partyError: null });
    // o líder já começou: quem estava esperando entra na MESMA sala
    if (r.party.started && r.party.room && app.get().screen === "party") play({ room: r.party.room, mode: 1, teamSize: r.party.teamSize, party: r.party.code }); }
  catch (e) {
    if (!isGone(e)) { app.update({ partyError: "stale" }); return; }
    app.update({ party: null, partyMe: null, partyError: "gone" }); toast(getLabels().partyGone, 2500); go("modes"); }
  finally { atualizando = false; }
}
export async function leaveParty() {
  const p = app.get().party; if (!p) { go("modes"); return; }
  try { await api.partyLeave(p.code); } catch { /* já expirou */ }
  app.update({ party: null, partyMe: null, partyError: null }); go("modes");
}
/** O líder começa: escolhe a sala e avisa o lobby, para os companheiros caírem no mesmo código. */
export async function startParty() {
  const p = app.get().party; if (!p) return;
  let code = null;
  try { const a = await api.auto({ mode: 1, teamSize: p.teamSize }); if (a && a.code) code = a.code; } catch { /* toast abaixo */ }
  // sem sala não se começa: o servidor gravaria `room:null` e os companheiros ficariam presos para sempre
  // esperando o `started && room` do polling — o líder entraria na partida sozinho e ninguém saberia.
  if (!code) { toast(getLabels().partyNoRoom, 2500); return; }
  try { await api.partyStart(p.code, code); } catch (e) { toast(errText(e, "party"), 2500); return; }
  play({ room: code, mode: 1, teamSize: p.teamSize, party: p.code });
}
export function leaveGame(screen = "lobby") {
  // `saiuDaSala` é do "Full" da CrazyGames (deixei a sala, não convidem mais ninguém para ela) e não
  // tem nada a ver com gameplay; o `jogoParou()` que morava aqui saiu porque o `screen` escrito logo
  // abaixo já fecha o gameplay por `portal/sessao.js` — e cobria só ESTE caminho, nunca a morte.
  if (PORTAL) portal.saiuDaSala();
  levelUpFila = null; cancelaTelaMorte();
  // ⚠️ REDE DE SEGURANÇA, não a regra: no pacote a tela INICIAL não está montada, então um chamador que
  // peça `entry` (o beco de `UNREACHABLE`/`LOST`, e qualquer caminho NOVO que ninguém lembrou de
  // converter) deixaria o jogador diante de um shell vazio. O menu do pacote é `modes`, e é para lá que
  // ela é desviada — a mesma conversão de `go()`, pelo mesmo motivo. `boot` continua valendo como destino
  // explícito: quem o pede acende `servidorFora` na mesma linha, e aí a tela que fica é o `Offline`.
  if (SEM_MENU && screen === "entry") screen = "modes";
  app.update(s => ({ ...s, screen, interrompido: false, overlays: { account: false, reconn: false, pause: false }, pendingJoin: null, conn: "idle", reconnAttempt: 0 }));
}
/**
 * SAIR DA PARTIDA — o botão, nos sete lugares em que ele existe (o ☰ do HUD, o lobby do BR, o espectador,
 * o pódio, a reconexão, a tela de morte e a pausa).
 *
 * No site é a tela de SALAS; no pacote é a tela de MODOS. A escolha mora em `state/entrada.js` (pura e
 * testada) porque sete `if (PORTAL)` espalhados divergem no primeiro conserto — é a lição de
 * `useSpec`/`SpecBar`, que nasceu de duas cópias do mesmo código de espectador.
 *
 * ⚠️ **NO PACOTE ISTO RE-ENTRAVA NO LIVRE, E ERA UM BECO SEM SAÍDA.** "Leave the match" reiniciava a
 * partida em vez de sair dela, e como a tela de Modos é o ÚNICO lugar do cliente que oferece o Battle
 * Royale, o modo inteiro ficou inalcançável no pacote — sem erro, sem log e sem nada na tela dizendo
 * por quê. A regra que continua valendo é a do BOOT (quem chega cai na arena, T1); sair é um gesto
 * deliberado, e quem o faz merece a escolha do modo.
 */
export function sairDaPartida() {
  const d = destinoDaSaida(SEM_MENU);
  return leaveGame(d.tela);
}
let rewardsT = null, levelUpN = 0, levelUpFila = null;
/**
 * A ESPERA ENTRE MORRER E A TELA DE MORTE (`ROUND.DEAD_DELAY_MS`). Ela era zero: `onDead` escrevia
 * `screen:"dead"` no mesmo tick da mensagem, e o modal cobria justamente o quadro em que o planeta
 * estoura. Durante a espera o jogador segue em `screen:"game"` — sem peças, com a câmera já no alvo que o
 * servidor escolheu (`Room.spectateTargetFor`, chamado junto do `dead`) —, ou seja ele vê a sala de
 * verdade, que é o ponto.
 * ⚠️ ELE PRECISA SER CANCELADO em todo caminho que troca de tela, senão a morte sobe por cima de um pódio
 * ou de uma sala nova: fim de rodada, queda/kick, sair da sala e entrar em outra. `lastMatch` é escrito na
 * HORA — o dado é dele, e quem espera é só a tela.
 */
let deadT = null, redeT = null;
const cancelaTelaMorte = () => { if (deadT) { clearTimeout(deadT); deadT = null; }
  if (redeT) { clearTimeout(redeT); redeT = null; } };
/**
 * A REDE DA MORTE SEM TELA — o beco sem saída que o respawn automático abriu.
 *
 * `mostra()` dispara `respawnAqui(...)` e não olha o resultado, e existem TRÊS jeitos de esse respawn
 * não acontecer, todos silenciosos: `respawnAqui` abre com `if (entrando) return`; `game.respawn()`
 * devolve false com o socket fechado ou sem `joined`; e o servidor pode recusar em silêncio (a sala
 * acabou, é Battle Royale) — nesse caso o `{t:"alive"}` simplesmente não chega. Nos três o jogador fica
 * em `screen:"game"`, morto, **sem tela de morte e sem vida nova**: assistindo a partida de outra pessoa
 * para sempre, sem um botão na tela. Antes do 1.21 isso não existia, porque a tela de morte subia sempre
 * e o botão ficava lá.
 *
 * ⚠️ QUEM RESPONDE "AINDA ESTOU MORTO?" É O MOTOR (`game.morto()`), nunca o store: o store foi escrito
 * otimista em `renasceAqui` e mentiria exatamente no caso que esta função existe para pegar.
 * ⚠️ `conn === "connected"` é obrigatório: o fallback de `renasceAqui` é `entraNaSala`, que reconecta —
 * subir a tela de morte por cima de uma reentrada em curso trocaria um defeito por outro.
 * ⚠️ Ela NÃO tenta renascer de novo. Um laço de respawn é como se produz a aba esquecida que renasce
 * para sempre (o motivo de `ui/deadClock.js` armar por gesto); aqui se devolve a DECISÃO ao jogador.
 */
const redeDaMorte = () => {
  clearTimeout(redeT);
  redeT = setTimeout(() => { redeT = null;
    const a = app.get(), g = getGame();
    if (a.screen !== "game" || a.conn !== "connected" || !g || !g.morto || !g.morto()) return;
    app.update({ screen: "dead", interrompido: true });
  }, (P.RESPAWN_1_MS | 0) + 2500);
};
// Game Event da Poki: se `connect/match` já foi fechado (complete OU fail) nesta tentativa. Sem isto, uma
// queda de WS que nunca chega a conectar cai em "Left" (indistinguível de desinteresse) e uma
// RECONEXÃO depois de já ter conectado reabriria/fecharia o mesmo Progress Event de novo — reset em
// `play()`, junto do "start"; marcado em `onConnection` na primeira resolução (`complete` ou `fail`).
let matchResolvido = false;
/** Callback do jogo: fim da rodada — {code, champion, board, nextInMs, tick}. Mostra o placar da sala. */
export function onRoundEnd(r) {
  clearTimeout(rewardsT); cancelaTelaMorte();
  // ⚠️ NO BATTLE ROYALE A RECOMPENSA JÁ CHEGOU, e zerá-la aqui deixava a tela final mentindo. `Sim.endRound`
  // só chama `onMatchEnd` para quem ainda está VIVO (`if(gp.isBot||gp.dead)continue`), e no BR quem está
  // vendo o pódio quase sempre morreu minutos antes — ou seja, nenhum `{t:"rewards"}` novo vem. Com o
  // `rewards:null` incondicional a tela mostrava "salvando…" por 5 s e depois "—" em MOEDAS GANHAS.
  // No Livre nada muda: lá o jogador estava vivo, `rewards` é null neste instante e a recompensa chega logo.
  app.update(s => ({ ...s, screen: "round", roundResult: { ...r, at: Date.now() }, roundPronto: false,
    levelUp: null,                                   // o cartão da MORTE dura 6,5 s e cobriria a abertura
    rewards: s.rewards || null, rewardsPending: !s.rewards }));
  if (!app.get().rewards) rewardsT = setTimeout(() => { if (app.get().rewardsPending) app.update({ rewardsPending: false }); }, 5000);
}
/**
 * A ABERTURA acabou: solta o cartão de nível/conquista que ficou esperando.
 * Ele NÃO pode ser só escondido por CSS — `LevelUp.jsx` arma o `setTimeout` de 6,5 s a partir de `lv.n`,
 * então um cartão escondido nasceria com metade da vida gasta. O que se adia é a escrita no store.
 */
export function soltaLevelUp() {
  app.update({ roundPronto: true });
  if (levelUpFila) { const lv = levelUpFila; levelUpFila = null; app.update({ levelUp: lv }); }
}
/** Callback do jogo: {by, byHole, score, maxMass, kills, durationS}. */
export function onDead(info) {
  const s = app.get();
  // ⚠️ O RECORDE VIAJA NA FOTO DA PARTIDA, não é lido da conta na hora de desenhar. `session.stats` vem
  // do `GET /api/me` do boot e o `onRewards` não mexe em `bestMass`/`bestScore` — então, sem isto, a
  // segunda partida da sessão continuaria comparando com o recorde de antes da PRIMEIRA e diria
  // "RECORDE!" de novo com um número menor. Aqui se guarda o recorde ANTERIOR (é ele que a tela compara)
  // e se atualiza o da conta em memória, para a próxima morte comparar com o número certo.
  const st = s.session.stats || {}, recMass = +st.bestMass || 0, recScore = +st.bestScore || 0;
  const mortes = (s.mortes | 0) + 1;
  // ⚠️ O FUNIL DA PRIMEIRA MORTE (portal/marcos.js). A idade vai na FAIXA porque `measure` só aceita
  // strings — e é dela que sai o histograma que o pack 1.21 elegeu como juiz ("se a coluna 1–2 min não
  // cair, o pack falhou"). O painel da Poki não tinha NENHUM evento entre `match` e `session/60s`.
  marco("first_death");
  marco("first_death_" + faixaIdade(info.durationS));
  // ⚠️ ESTA DECISÃO SOBE PARA CÁ PORQUE ELA DECIDE DUAS COISAS, NÃO UMA. Ela já escolhia se a tela de
  // morte abre; agora escolhe também se isto é uma INTERRUPÇÃO de gameplay para o SDK — e essa segunda
  // metade precisa ser escrita no MESMO `app.update` da morte, senão o `gameplayStop` sai antes de
  // qualquer um saber que não havia interrupção nenhuma. Ver `ATIVO` em portal/sessao.js: a morte que
  // renasce sozinha em 1,2 s não tem modal, menu, anúncio nem cutscene, e fechar o gameplay ali era o
  // que produzia um `gameplayStart` sem interação do outro lado — o defeito que custou o Fit Test 1.21.
  const sozinho = renasceSozinho({ portal: comoPortal(), modo: s.gameMode | 0, mortes });
  app.update(a => ({ ...a, mortes, kills: (a.kills | 0) + (info.kills | 0), interrompido: !sozinho,
    lastMatch: { ...info, room: a.room, at: Date.now(), recMass, recScore },
    session: { ...a.session, stats: { ...st, bestMass: Math.max(recMass, +info.maxMass || 0), bestScore: Math.max(recScore, +info.score || 0) } },
    rewards: null, rewardsPending: true }));
  clearTimeout(rewardsT); rewardsT = setTimeout(() => { if (app.get().rewardsPending) app.update({ rewardsPending: false }); }, 5000);
  // A TELA espera; o DADO não. ⚠️ A guarda do disparo relê o estado: entre o agendamento e o estouro pode
  // ter chegado um fim de rodada, uma queda ou uma sala nova, e aí a tela de morte não tem mais o que
  // fazer ali. `cancelaTelaMorte` cobre os caminhos conhecidos; esta guarda cobre os que sobrarem.
  cancelaTelaMorte();
  // ── A PRIMEIRA MORTE NÃO ABRE TELA (portal/primeiraVida.js) ──
  // Ela vira um clarão e uma vida nova 1,2 s depois, no mesmo slot e na mesma sala. O que se poupa não é
  // um clique: é a decisão de fechar a aba, que no Fit Test 1.20 mora inteira na coluna de 1–2 min.
  // ⚠️ O DADO CONTINUA SENDO ESCRITO (`lastMatch`, `mortes`, `kills`, a recompensa): quem espera é só a
  // tela, exatamente como no caminho normal — é isso que mantém o `first_death` do funil e o cartão de
  // nível funcionando numa vida que ninguém chegou a ver terminar.
  // ⚠️ A GUARDA DO DISPARO RELÊ O ESTADO nos dois ramos, pela mesma razão de sempre: entre o agendamento
  // e o estouro pode ter chegado um fim de rodada, uma queda ou uma sala nova.
  const mostra = () => { deadT = null; const a = app.get();
    if (!(a.lastMatch && a.screen === "game")) return;
    if (sozinho) { app.update(x => ({ ...x, flash: x.flash + 1 })); respawnAqui(a.lastMatch.room); redeDaMorte(); }
    else app.update({ screen: "dead" }); };
  const espera = Math.max(0, (sozinho ? P.RESPAWN_1_MS : ROUND.DEAD_DELAY_MS) | 0);
  if (espera) deadT = setTimeout(mostra, espera); else mostra();
  // ⚠️ AQUI HAVIA O FUNIL QUE MENTIA PARA A POKI, e o motivo de ele ter saído está em portal/sessao.js:
  // ele fechava `survival/60s|120s|180s` com o `durationS` da VIDA, e o `start` correspondente só saía
  // em `onConnection` — que desde o respawn na mesma conexão NUNCA MAIS reabre. Quem fica 12 min e
  // morre 14 vezes mandava 3 aberturas e 42 fechamentos, quase todos `fail` com 15–40 s: o painel deles
  // dizia "saiu em segundos" sobre gente que estava na sala. Vida não é sessão, e a sessão agora é
  // medida onde ela existe — no store, por `portal/sessao.js`.
}
/** Callback do jogo: {saved, coinsEarned, coins, achievements:[{key,title}], skinsUnlocked:[id], rank:{day}} */
export function onRewards(r) {
  clearTimeout(rewardsT);
  app.update(s => {
    const sess = { ...s.session };
    if (r && sess.user) {
      const coins = typeof r.coins === "number" ? r.coins : (sess.user.coins || 0) + (r.coinsEarned || 0);
      sess.user = { ...sess.user, coins };
      if (r.achievements && r.achievements.length) sess.achievements = [...new Set([...sess.achievements, ...r.achievements.map(a => (a && a.key) || a)])];
      if (r.skinsUnlocked && r.skinsUnlocked.length) sess.skins = [...new Set([...sess.skins, ...r.skinsUnlocked])];
      if (r.rank && r.rank.day != null) sess.dayRank = r.rank.day;
      if (r.rank && r.rank.country) sess.countryRank = r.rank.country;
      // XP/nível: o servidor manda o total e o nível já derivados (a curva mora em shared/src/levels.js),
      // então aqui só se guarda — nada de recalcular e arriscar duas verdades.
      if (r.xp) sess.stats = { ...sess.stats, xp: r.xp.total, level: r.xp.level,
        levelInto: r.xp.into, levelNeed: r.xp.need, levelPct: r.xp.pct };
    }
    return { ...s, session: sess, rewards: r || null, rewardsPending: false };
  });
  // Subir de nível e destravar conquista são as duas coisas que o jogador não vai ver de novo — e as
  // duas passavam batidas: o nível saía num toast de 3,2 s dividindo a fila com todo o resto, e a
  // conquista não saía em lugar NENHUM (nem na tela de morte, nem no pódio; só aparecia no Perfil, se
  // ele fosse lá procurar). `r.xp.gained` chegava e era jogado fora. Agora as duas viram um cartão só.
  if (r) {
    const novas = (r.achievements || []).map(a => (a && a.key) || a).filter(Boolean);
    const subiu = !!(r.xp && r.xp.leveledUp);
    const st0 = app.get();
    // ⚠️ NA TELA DE MORTE, O CARTÃO SEMPRE APARECE — não só quando sobe de nível ou destrava conquista.
    // É a barra de progresso rápida que o jogador vê a cada vida, com som de moeda; fora da morte (fim de
    // rodada) o comportamento de sempre continua (só nas duas ocasiões que merecem os 6,5 s inteiros, para
    // não competir com a abertura do pódio). `rapido` marca a variante curta (LevelUp.jsx lê a duração e o
    // som a partir dela).
    const naMorte = st0.screen === "dead";
    if (subiu || novas.length || (naMorte && r.xp)) {
      // Prévia de recompensa: alguma skin com `levelReq` bate com o PRÓXIMO nível? (shared/src/skins.js —
      // só 9 níveis têm skin associada, então a linha só aparece quando fizer sentido.)
      const proxNivel = r.xp ? r.xp.level + 1 : 0;
      const proximaSkin = proxNivel > 0 && proxNivel <= LEVEL.MAX ? SKINS.find(s => s.levelReq === proxNivel) || null : null;
      const cartao = { subiu, rapido: naMorte && !subiu && !novas.length,
        level: r.xp ? r.xp.level : 0, gained: r.xp ? r.xp.gained : 0,
        into: r.xp ? r.xp.into : 0, need: r.xp ? r.xp.need : 1, pct: r.xp ? r.xp.pct : 0,
        achievements: novas, proximaSkin, n: ++levelUpN };
      // ── ONDE O CARTÃO PODE APARECER, NUM PREDICADO SÓ ────────────────────────────────────────────
      // Duas decisões diferentes moram nesta condicional, e elas TÊM que ficar juntas: escritas em dois
      // lugares, quem mexesse depois apagaria a outra em silêncio — e esta linha não tem um único teste.
      //
      // (1) NO BIG CRUNCH ELE NÃO APARECE. O pódio é o resultado da SALA, e o cartão de XP é `inset:0`
      //     com `z-index:40`: ele cobre a tela inteira por 6,5 s justo quando o jogador quer ler quem
      //     ganhou. O XP não se perde — ele já foi creditado na transação de `finishMatch`, e o Perfil o
      //     mostra. Antes o cartão ESPERAVA a abertura terminar (`levelUpFila` + `soltaLevelUp`); agora
      //     ele simplesmente não é publicado ali.
      //     ⚠️ DÍVIDA DECLARADA: com isto `levelUpFila`, `app.roundPronto` e `soltaLevelUp()` ficam
      //     WRITE-ONLY — a fila nunca mais enche, e `roundPronto` era lido só aqui (o `setPronto` de
      //     ui/Round.jsx:149 é estado LOCAL do componente, não este campo). Ficam de propósito: drenar
      //     uma fila vazia é no-op, e arrancar as chamadas de Round.jsx:149/:199 é risco de mexer na
      //     ordem da abertura por zero ganho. Some numa varredura à parte, não aqui.
      // (2) NA TELA DE MORTE COM SKIN DESTRAVADA ele também não aparece, porque o BLOCO DE PRÊMIO
      //     (ui/DeadPrize.jsx) desenha a mesma conquista no cartão de morte, e o `.lvup-wrap` cairia por
      //     cima dele — engolindo o primeiro clique do jogador. É o mesmo argumento que tirou a faixa do
      //     campeão do modelo `podio`: a mesma coisa duas vezes na mesma tela.
      const st = app.get();
      const noPodio = st.screen === "round";
      const premioNaMorte = naMorte && r.skinsUnlocked && r.skinsUnlocked.length > 0;
      if (!noPodio && !premioNaMorte) app.update({ levelUp: cartao });
    }
  }
  if (api.online === false && app.get().lastMatch) {
    const m = app.get().lastMatch, u = app.get().session.user;
    const p = api.localMatchEnd({ endedAt: new Date(m.at).toISOString(), score: m.score, maxMass: m.maxMass, kills: m.kills, durationS: m.durationS, cause: m.byHole ? "blackhole" : "eaten", by: m.by, coinsEarned: r ? r.coinsEarned : 0, roomCode: m.room }, r ? { ...r, coins: u ? u.coins : 0 } : null);
    if (p) app.update(s => ({ ...s, session: { ...s.session, stats: normalizeStats(p.stats) } }));
  }
}
/** Callback do jogo: {state:'connecting'|'connected'|'reconnecting'|'closed'|'error', room?, attempt?, code?, message?} */
export function onConnection(ev) {
  const st = ev && ev.state;
  if (st === "connected") { app.update(s => ({ ...s, conn: "connected", room: ev.room || s.room, overlays: { ...s.overlays, reconn: false }, reconnAttempt: 0 }));
    // o portal precisa saber em que sala o jogador está para oferecer "entrar com o amigo" (o Full da
    // CrazyGames). O código da nossa sala já é único no jogo inteiro, que é o que eles pedem do roomId.
    if (PORTAL && ev.room) portal.sala(ev.room, true);
    // Game Event: "connect" fecha aqui (o WS confirmou). O funil de SESSÃO não abre por conexão — ele
    // é da carga da página e mora em `portal/sessao.js`; abri-lo aqui era o que o amarrava a uma vida.
    if (PORTAL) { matchResolvido = true; portal.medir("connect", "match", "complete"); } }
  else if (st === "connecting") app.update(s => ({ ...s, conn: "connecting", room: ev.room || s.room }));
  else if (st === "reconnecting") app.update(s => ({ ...s, conn: "reconnecting", reconnAttempt: ev.attempt || 1, overlays: { ...s.overlays, reconn: true } }));
  else if (st === "closed" || st === "error") {
    const s = app.get();
    cancelaTelaMorte();   // caiu/foi expulso durante a espera: quem manda na tela agora é o erro
    app.update({ conn: "closed", overlays: { ...s.overlays, reconn: false } });
    // Game Event da Poki: a partida nunca chegou a conectar (nada de "complete" ainda) — sem isto essa
    // sessão cairia em "Left", indistinguível de quem só perdeu o interesse. Só a PRIMEIRA vez: uma queda
    // depois de já ter conectado é `reconnecting`/fim de partida normal, não falha de conexão.
    if (PORTAL && !matchResolvido) { matchResolvido = true; portal.medir("connect", "match", "fail"); }
    // NICK_IN_ROOM não é "deu erro": é "troque o nome". Desde que o nick ficou livre (dois "Messi" são
    // legais no mundo) isso deixou de ser raro — e cai bem no caminho de EQUIPE, onde todos entram pelo
    // mesmo código. Mandar para a tela de Salas era um beco: a frase não diz onde se troca o nome.
    // ⚠️ NO PACOTE NÃO HÁ ONDE TROCAR O NOME, então a recusa é resolvida SOZINHA — mas **sem tocar no
    // nick**. A tentação é aplicar a `suggestion` que o servidor manda no corpo do erro; ela grava na
    // CONTA, e o caso comum desta recusa é um F5: a sessão anterior ainda segura o nick por
    // `NET.RESUME_MS`, então cada recarga somaria um sufixo ("Sirio10" → "Sirio10_993" →
    // "Sirio10_993_6454") até o teto de 16 caracteres. Foi medido em bancada, e é permanente.
    // O que resolve de graça é RE-ENTRAR SEM CÓDIGO: `findOrCreateRoom` já pula as salas em que o nick
    // está em uso, então o automático escolhe outra e o jogador entra com o nome dele. A recusa só
    // sobrevive a isso para quem entra por CÓDIGO — e no pacote ninguém entra.
    if (SEM_MENU && ev.code === "NICK_IN_ROOM") voltaAoJogo();
    else if (s.screen === "game" && ev.code === "NICK_IN_ROOM") {
      toast(errText(ev) + (ev.suggestion ? ` · ${ev.suggestion}` : ""), 4000); leaveGame("entry"); focaNome();
    }
    // no portal, "não deu para conectar" também é a tela que fica: o toast some e o jogador acha que
    // clicou errado. `UNREACHABLE`/`LOST` são a queda de rede; o resto continua sendo erro de sala.
    // Build velha: tela que FICA, no site e no portal. Um toast de 3 s some antes de a pessoa ler, e o
    // reload automático (Connection.js) já aconteceu UMA vez — chegar aqui quer dizer que ele não bastou:
    // ou é um portal (o zip é deles) ou o servidor está à frente por algum outro motivo.
    else if (ev.code === "OUTDATED") { leaveGame("entry"); app.update({ desatualizado: true }); }
    else if (PORTAL && (ev.code === "UNREACHABLE" || ev.code === "LOST")) { leaveGame("entry"); app.update({ servidorFora: true }); }
    // REMOVIDO POR INATIVIDADE: tela que FICA, não toast. Quem foi removido por estar ausente é, por
    // definição, quem não está olhando — um toast de 3 s some antes de a pessoa voltar ao teclado, e ela
    // volta achando que o jogo caiu. O `min` vem no corpo do `{t:'error'}` (o mesmo caminho do `nick` do
    // NICK_IN_ROOM) porque um número torna a explicação verificável em vez de desculpa.
    else if (ev.code === "ROOM_IDLE") { leaveGame("lobby"); app.update({ expulsoInativo: +ev.min || 3 }); }
    // ⚠️ `dead` e `round` entram junto com `game`, e isto era um defeito ANTES desta funcionalidade: atrás
    // da tela de morte e do pódio a conexão continua viva, então uma expulsão dali (o kick e o ban do dono
    // já faziam isso) caía no toast lá embaixo e deixava a tela no ar com o socket fechado — o botão DE
    // NOVO tentando renascer numa conexão que não existe mais.
    // No pacote, "caiu por outro motivo" também termina numa partida — mas com anti-laço (ver `voltaAoJogo`).
    else if (SEM_MENU && (s.screen === "game" || s.screen === "dead" || s.screen === "round" || s.screen === "spec")) {
      toast(errText(ev), 3000); voltaAoJogo();
    }
    else if (s.screen === "game" || s.screen === "dead" || s.screen === "round") { toast(errText(ev), 3000); leaveGame("lobby"); }
    else if (ev.code || ev.message) toast(errText(ev), 3000);
  }
}
/**
 * A RE-ENTRADA AUTOMÁTICA DO PACOTE, com BACKOFF e anti-laço.
 *
 * Sem tela de menu, toda queda tem que terminar numa partida nova — mas um servidor que recusasse TUDO
 * viraria um laço de join, com o console do revisor enchendo de WebSocket.
 *
 * ⚠️ AS TENTATIVAS SÃO ESPAÇADAS, e isto veio de um defeito MEDIDO em bancada: a primeira versão desistia
 * na segunda falha dentro de 5 s e acendia `servidorFora` — e três F5 seguidos (a sessão anterior ainda
 * segura o nick por `NET.RESUME_MS` = 10 s, então cada recarga recusa com `NICK_IN_ROOM`) davam a tela
 * "SEM CONTATO COM A BASE" com o servidor de pé e respondendo. Uma tela que MENTE sobre o motivo é pior
 * que a espera que ela evita — e o caso mais comum desta função nem é o servidor: é uma recusa de sala
 * que se resolve sozinha em segundos.
 * ⚠️ Por isso a desistência é tardia (`VOLTA_MAX`) e o atraso cresce: em `NICK_IN_ROOM` o nick volta ao
 * bolo assim que a sessão velha expira, e a tentativa seguinte entra. O contador zera sozinho quando uma
 * entrada dura mais que a janela, que é a definição operacional de "deu certo".
 */
const VOLTA_JANELA_MS = 12000, VOLTA_MAX = 5, VOLTA_PASSO_MS = 900;
let voltaAt = 0, voltaN = 0, voltaT = null;
function voltaAoJogo() {
  const agora = Date.now();
  voltaN = agora - voltaAt < VOLTA_JANELA_MS ? voltaN + 1 : 1;
  voltaAt = agora;
  if (voltaT) { clearTimeout(voltaT); voltaT = null; }
  if (voltaN > VOLTA_MAX) { leaveGame("boot"); app.update({ servidorFora: true }); return; }
  const espera = (voltaN - 1) * VOLTA_PASSO_MS;   // 0 · 0,9 · 1,8 · 2,7 · 3,6 s
  // ⚠️ `semAnuncio`: isto NÃO é o jogador pedindo partida, é o jogo tentando de novo depois de uma
  // recusa. Sem a flag, cada tentativa comprava um midroll — ver o comentário em `entraNaSala`.
  const entra = () => { voltaT = null; play({ mode: MODE.FREE, teamSize: 1, party: null, semAnuncio: true }); };
  if (espera) voltaT = setTimeout(entra, espera); else entra();
}
