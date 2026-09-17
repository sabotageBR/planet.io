// ── ESTADO DO SHELL ───────────────────────────────────────────────────────────
// Só UI: sessão (usuário/skins/prefs/stats/conquistas/online), tela, overlays, sala, toast, modo,
// última partida e recompensas. A simulação vive no módulo do jogo (hudStore), não aqui.
import { createStore } from "./store.js";
import { SEM_MENU } from "../portal/flags.js";

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
  // ── A TELA DE FIM DE RODADA: qual dos três modelos, e se ela tem abertura ──
  // Os três desenham os MESMOS dados (campeão, pódio, destaques, placar) e mudam o que a tela põe em
  // primeiro plano: `podio` é o pódio de sempre com o campeão em tamanho de campeão, `cinema` entrega a
  // tela inteira a ele, `dossie` é o relatório da partida em duas colunas. Ninguém perde informação
  // escolhendo — o cartão do resto do placar é o mesmo nos três.
  // `roundIntro` é o colapso de 2 s antes do placar. Ela também obedece a `reduceMotion`, mas tem chave
  // própria porque são pedidos diferentes: um é acessibilidade (vale para o jogo inteiro) e o outro é
  // pressa de quem entra em sala nova o dia todo e já viu a animação cem vezes.
  roundStyle: "dossie", roundIntro: true,
  // ── A TELA DE MORTE, no mesmo molde: três respostas à pergunta que se faz ao morrer (ui/Dead.jsx) ──
  // `duelo` mostra quem te pegou e o quanto ele era maior, `balanco` mede a vida contra o SEU recorde,
  // `sala` mostra quem está na frente agora — para quem vai ficar assistindo.
  deadStyle: "duelo",
  // PLACAR ABERTO OU RECOLHIDO, em DUAS chaves — uma para o celular em pé e outra para o resto. Não é
  // duplicação: os padrões são opostos porque as telas são (no desktop e no deitado a lateral é sobra e o
  // placar nasce aberto; em pé a lateral É o jogo, e lá o chip do topo já dá massa e posição), e as prefs
  // viajam com a CONTA. Com uma chave só, recolher no desktop reabriria o placar no celular do jogador —
  // desfazendo, à distância, exatamente o padrão que existe para não tapar a área de jogo dele.
  lbShow: true, lbShowPortrait: false,
  // IDIOMA da interface. "auto" = o do navegador (i18n/resolveLang). Ele é a única pref que precisa
  // valer ANTES de o servidor responder — daí o atalho em localStorage que `bootLang()` lê no main.jsx.
  lang: "auto",
  chat: true, voice: true, voiceVolume: 85,   // chat e voz: desligáveis, como todo o resto do som
  // O CONVITE DE BATTLE ROYALE (`{t:"brStart"}` → ui/BrInvite.jsx). Toda sala de BR pública criada no
  // cluster manda um card para quem está no Livre, e não havia como dizer "chega": `dismissBrInvite` só
  // apagava o card da vez. Nasce LIGADO — ele é como se descobre o outro modo —, e desligar é uma escolha
  // que viaja com a conta, feita no próprio card ou nas Opções.
  brInvite: true,
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
  session: { user: null, skins: [0], adWatched: [], prefs: { ...PREF_DEFAULTS }, stats: EMPTY_STATS, achievements: [], online: null, server: null, dayRank: null },
  // ⚠️ NO PACOTE A TELA INICIAL NÃO EXISTE (`SEM_MENU`), então o shell nasce num estado que NENHUM
  // componente casa: o `#app` fica vazio e quem cobre a espera é a cortina `#boot` do index.html, até o
  // `play()` do fim de `boot()` escrever `screen:"game"`.
  // ⚠️ `"boot"` fica FORA de `SCREENS` de propósito — aquela é a lista branca de `go()`, e é isso que
  // torna `go("boot")` impossível por construção. O precedente é `"spec"`, que `assistir()` escreve
  // direto no store e também nunca esteve lá.
  // ⚠️ E NÃO pode ser `"game"`. Parece atalho e quebra duas coisas de uma vez: `ATIVO`/`RETIDO` de
  // portal/sessao.js passariam a valer ANTES de existir partida — `gameplayStart` sem jogo (que a Poki
  // cobra por escrito) e o funil de sessão começando a contar no carregamento da página.
  screen: SEM_MENU ? "boot" : "entry",
  prevScreen: "entry",   // de onde se chegou à tela atual: Opções é alcançável da entrada E da <Nav>,
                         // então "salvar e voltar" tem que voltar para quem abriu, não para um lugar fixo
  played: false,         // já entrou em alguma partida NESTA carga da página? decide o body[data-shell]:
                         // menu centralizado enquanto não jogou, gaveta à direita (com a câmera à esquerda) depois
  // ⚠️ `pause` é o menu do ESC, e ele é OVERLAY e não tela: navegar para `prefs` durante a partida faz o
  // GameHost chamar `game.leave()` (a conexão cai) e o Hud esconder o #hud inteiro. Três lugares escrevem
  // este objeto — aqui, o `go()` e o `play()` —, e os dois últimos o zeram: um overlay novo que não entre
  // na conta deles some sozinho na primeira navegação.
  // `tab` é o painel de QUEM ESTÁ NA SALA, aberto enquanto o TAB está pressionado. Ele NÃO é uma pausa:
  // o planeta continua seguindo o mouse por baixo (ver `escape` e a nota em Roster.jsx).
  overlays: { account: false, reconn: false, pause: false, tab: false },
  // ⚠️ FORA de `overlays`, de propósito, e é o parágrafo acima que explica por quê: `go()` e `play()`
  // reescrevem aquele objeto inteiro. Este aviso precisa do contrário — ele tem que GRUDAR até o
  // servidor voltar, porque sem servidor não há o que jogar.
  servidorFora: false,
  // Mesmo argumento, outro motivo: a build DESTE cliente ficou para trás do servidor. Também gruda, e por
  // uma razão a mais — num portal recarregar não conserta (o zip é deles), então o aviso é tudo o que há.
  desatualizado: false,
  // Removido da sala por inatividade — guarda os MINUTOS que o servidor cobrou, para o texto poder dizer o
  // número em vez de uma vaguidade. Campo de topo pelo mesmo motivo dos dois acima: `leaveGame` reescreve
  // `overlays` inteiro, e este aviso precisa sobreviver justamente à saída da sala que o causou. `0` = não
  // aconteceu (nunca é um número de minutos válido).
  expulsoInativo: 0,
  // Até QUANDO (ms de `Date.now()`) a faixa de PARABÉNS do tutorial fica por cima da partida
  // (`ui/TutorParabens.jsx`). Escrito por `saiDoTutorial({fim:true})` — o tutorial não tem mais tela de fim,
  // então o elogio e a promessa da skin acompanham o jogador para DENTRO da primeira sala. Campo de topo
  // pelo motivo dos três acima: quem o escreve chama `play()` na linha seguinte, e `play()` reescreve
  // `overlays` inteiro. `0` = não há faixa.
  parabensAte: 0,
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
  // O nick que a tela inicial põe no campo quando a conta ainda está com a placa `Viajante-NNNN`
  // (ver ENTRY.NICK_AUTO). É SUGESTÃO: não persiste, não é o nick da conta, e só vira nick de verdade
  // quando o jogador entra numa partida (`garanteNick` em actions.js) ou sai do campo com ele.
  // ⚠️ VAZIO tem significado: ou o parâmetro do /admin está desligado, ou a resposta ainda não chegou.
  // Nos dois casos o campo nasce vazio e a guarda `semNome()` volta a valer — que é o de sempre.
  nickSugerido: "",
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
  // ── O QUE JÁ ACONTECEU NESTA CARGA DA PÁGINA (client/src/portal/primeiraVida.js) ──
  // `mortes` e `kills` são ACUMULADOS da carga, nunca da vida: é com eles que se decide a tela de morte
  // da primeira morte e o pedágio do primeiro anúncio. Não zeram ao trocar de sala — a pergunta que eles
  // respondem ("esta pessoa já viu o jogo funcionar?") é da PESSOA, não da partida.
  mortes: 0,
  kills: 0,
  // `interrompido` é o terceiro estado do gameplay do SDK, e o NOME é a correção mais importante dele:
  // ele nasceu chamado `morto` e escrito `true` em TODA morte, o que fez a morte SEM TELA — 1,2 s de
  // clarão entre duas vidas, sem modal, sem menu e sem anúncio — emitir um `gameplayStop` e, logo
  // depois, um `gameplayStart` que o SDK da Poki recusa por não ter interação atrás (ver `ATIVO` em
  // portal/sessao.js). A pergunta que este campo responde nunca foi "o jogador está morto?": é "há uma
  // INTERRUPÇÃO de gameplay agora?", que é a palavra que eles usam por escrito ("gameplayStop() must
  // fire on any gameplay interruption (pause, menu open, level end, cutscene)"). Com o nome certo,
  // `interrompido: !sozinho` em `onDead` se lê sozinho.
  interrompido: false,
  flash: 0,              // contador do clarão da morte sem tela (ui/Hud.jsx): só muda de valor, nunca é lido
  roundResult: null,     // {code, champion, board:[{slot,name,mass,score,kills,isBot,registered}], nextInMs, at} — fim do mundo
  roundPronto: false,    // a ABERTURA do fim de rodada já acabou? É o portão do cartão de recompensa: o
                         // `{t:"rewards"}` chega ~200-800 ms depois do `roundEnd`, ou seja NO MEIO dos 2 s
                         // de animação, e o <LevelUp/> é o último filho de App.jsx com z-index maior que o
                         // da abertura — o cartão pulava por cima do BIG CRUNCH. Ver `soltaLevelUp`.
  rewards: null,         // {saved, coinsEarned, coins, achievements, skinsUnlocked, rank:{day}}
  rewardsPending: false,
  rooms: [], roomsAt: 0,
  top5: [], top5At: 0,
  config: null,
};
export const app = createStore(initialState);
