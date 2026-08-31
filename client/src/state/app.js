// ── ESTADO DO SHELL ───────────────────────────────────────────────────────────
// Só UI: sessão (usuário/skins/prefs/stats/conquistas/online), tela, overlays, sala, toast, modo,
// última partida e recompensas. A simulação vive no módulo do jogo (hudStore), não aqui.
import { createStore } from "./store.js";

export const SCREENS = ["entry", "modes", "party", "lobby", "rank", "profile", "shop", "prefs", "game", "dead", "round"];
export const NAV_SCREENS = ["entry", "lobby", "rank", "profile", "shop", "prefs"];

/** Whitelist de PATCH /api/me/prefs (docs/spec/api.md) com os padrões do cliente. */
export const PREF_DEFAULTS = Object.freeze({
  quality: "auto", showNames: true, showGrid: true, showMinimap: true, showFps: true,
  sound: true, music: false, ambience: true, volume: 70, musicVolume: 60,
  // MUDO é o interruptor geral, e existe separado dos outros porque é de outra natureza: `sound`/`music`/
  // `ambience` são gosto (o jogador escolhe uma vez e esquece), e `muted` é urgência — alguém entrou na
  // sala, o telefone tocou, o chefe passou. Por isso ele tem tecla, botão no HUD e cala TUDO de uma vez,
  // inclusive a voz dos outros jogadores, sem apagar nenhuma das outras escolhas.
  muted: false,
  // ⚠️ `holdEject` e `rightSplit` já existiram aqui — DENTRO de um comentário `//`, engolidos pela
  // explicação do joystick. Como PREF_KEYS = Object.keys(PREF_DEFAULTS), as chaves simplesmente não
  // existiam: `normalizePrefs` descartava o que o servidor devolvia e `setPref` recusava a escrita,
  // então os dois toggles da aba Controles eram botões mortos (o servidor sempre os aceitou).
  // joystick LIGADO por padrão: `game/index.js` só o arma com `(pointer: coarse)`, então no mouse
  // continua letra morta — e no dedo o analógico é o controle certo, que ninguém descobria sozinho.
  joystick: true, holdEject: true, rightSplit: true,
  // A RODA dá zoom dentro da faixa que a massa permite. Desligável porque em trackpad de laptop a rolagem
  // de dois dedos é fácil de disparar sem querer — o mesmo tipo de escape hatch que `rightSplit`.
  wheelZoom: true,
  // Teclas de dividir/ejetar: `KeyboardEvent.code`, montadas no MAP por instância (input/Keyboard.js).
  keySplit: "Space", keyEject: "KeyW",
  theme: "auto", reduceMotion: false, bigText: false, colorblind: "off", lbSize: 10,
  // IDIOMA da interface. "auto" = o do navegador (i18n/resolveLang). Ele é a única pref que precisa
  // valer ANTES de o servidor responder — daí o atalho em localStorage que `bootLang()` lê no main.jsx.
  lang: "auto",
  chat: true, voice: true, voiceVolume: 85,   // chat e voz: desligáveis, como todo o resto do som
});
export const PREF_KEYS = Object.keys(PREF_DEFAULTS);
// volume: 0..100 no cliente. Perfis antigos guardavam 0..1 (o servidor só aceitava essa faixa e o slider nunca
// persistia); sem a conversão o ganho do áudio virava 0,007 — ou seja, mudo.
export const normalizePrefs = p => { const o = { ...PREF_DEFAULTS }; if (p) for (const k of PREF_KEYS) if (p[k] !== undefined && p[k] !== null) o[k] = p[k]; o.volume = +o.volume; if (o.volume > 0 && o.volume <= 1) o.volume *= 100; o.lbSize = +o.lbSize || 10; return o; };

export const EMPTY_STATS = Object.freeze({ games: 0, kills: 0, botKills: 0, splits: 0, ejects: 0, bestScore: 0, bestMass: 0, playTime: 0, bestStreak: 0,
  foodEaten: 0, deaths: 0, kd: 0, xp: 0, level: 1, levelInto: 0, levelNeed: 1, levelPct: 0 });
/** Aceita camelCase e snake_case vindos do servidor. */
export function normalizeStats(s) {
  if (!s) return EMPTY_STATS;
  const pick = (...ks) => { for (const k of ks) if (s[k] != null) return +s[k] || 0; return 0; };
  return { games: pick("games", "matches"), kills: pick("kills"), botKills: pick("botKills", "bot_kills"), splits: pick("splits"), ejects: pick("ejects"),
    bestScore: pick("bestScore", "best_score"), bestMass: pick("bestMass", "best_mass"), playTime: pick("playTime", "play_time", "playTimeS", "play_time_s"), bestStreak: pick("bestStreak", "best_streak"),
    // `foodEaten` era gravado no banco e devolvido pela API desde sempre, e MORRIA aqui: sem a chave, o
    // perfil nunca mostrou uma partícula comida. Os outros quatro são novos.
    foodEaten: pick("foodEaten", "food_eaten"), deaths: pick("deaths"), kd: pick("kd"), xp: pick("xp"),
    level: pick("level") || 1, levelInto: pick("levelInto"), levelNeed: pick("levelNeed") || 1, levelPct: pick("levelPct") };
}

export const initialState = {
  booted: false, bootError: null,
  session: { user: null, skins: [0], prefs: { ...PREF_DEFAULTS }, stats: EMPTY_STATS, achievements: [], online: null, server: null, dayRank: null },
  screen: "entry",
  prevScreen: "entry",   // de onde se chegou à tela atual: Opções é alcançável da entrada E da <Nav>,
                         // então "salvar e voltar" tem que voltar para quem abriu, não para um lugar fixo
  played: false,         // já entrou em alguma partida NESTA carga da página? decide o body[data-shell]:
                         // menu centralizado enquanto não jogou, gaveta à direita (com a câmera à esquerda) depois
  // ⚠️ `pause` é o menu do ESC, e ele é OVERLAY e não tela: navegar para `prefs` durante a partida faz o
  // GameHost chamar `game.leave()` (a conexão cai) e o Hud esconder o #hud inteiro. Três lugares escrevem
  // este objeto — aqui, o `go()` e o `play()` —, e os dois últimos o zeram: um overlay novo que não entre
  // na conta deles some sozinho na primeira navegação.
  overlays: { account: false, reconn: false, pause: false },
  reconnAttempt: 0,
  room: null,            // código da sala atual (do evento `room` do jogo)
  pendingJoin: null,     // {room, mode, teamSize, party, n} — GameHost faz o join quando muda
  // O pedido de partida que a guarda de nome (`semNome`) segurou. Sem ele o link de convite MORRE
  // exatamente para quem ele existe — o amigo novo, que nunca nomeou nada: o código se perderia na volta
  // à tela inicial e o JOGAR o levaria a uma sala qualquer. O JOGAR retoma este pedido.
  pendingPlay: null,     // {room, mode, teamSize, party} guardado por semNome()
  // ⚠️ A guarda de nome reconhece a placa sorteada pelo PADRÃO (`Viajante-NNNN`), e um jogador tem o
  // direito de escolher justamente esse nome — aí ele salvaria, a guarda continuaria vendo a placa e ele
  // ficaria preso num laço sem explicação. Este sinal é a prova de que a pessoa DIGITOU um nome nesta
  // carga da página; não persiste de propósito (é evidência do gesto, não um dado do perfil).
  nomeado: false,
  gameMode: 0,           // MODE.* escolhido na tela de modos (NÃO confundir com `mode`, que é a orientação da tela)
  teamSize: 1,           // 1 = solo; 2..4 = equipe
  party: null,           // {code,shard,teamSize,members,...} do lobby de equipe (GET /api/party/:code)
  partyMe: null,         // {key,leader} — quem EU sou nesse lobby (só o servidor sabe: a chave é o hash do token)
  partyError: null,
  conn: "idle",          // idle|connecting|connected|reconnecting|closed
  toast: null,           // {msg, n}
  levelUp: null,         // {subiu, level, gained, into, need, pct, achievements:[key], n} — o cartão de
                         // fim de partida: subiu de nível e/ou destravou conquista. `n` força o remonte
                         // quando duas partidas seguidas rendem o mesmo conteúdo.
  mode: "desktop",       // desktop|portrait|landscape (body[data-mode])
  lastMatch: null,       // {by, byHole, score, maxMass, kills, durationS, room, at}
  roundResult: null,     // {code, champion, board:[{slot,name,mass,score,kills,isBot,registered}], nextInMs, at} — fim do mundo
  rewards: null,         // {saved, coinsEarned, coins, achievements, skinsUnlocked, rank:{day}}
  rewardsPending: false,
  rooms: [], roomsAt: 0,
  top5: [], top5At: 0,
  config: null,
};
export const app = createStore(initialState);
