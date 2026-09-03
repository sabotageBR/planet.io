// ── TEXTOS (pt-BR) — o dicionário BASE ────────────────────────────────────────
// Os primeiros vieram de mockups/v2/src/engine2.js. Este arquivo é o CHÃO da tradução: toda chave que
// faltar em `en.js`/`es.js` cai aqui (i18n/index.js), então ele é o único que nunca pode ter buraco —
// e é por isso que ele é o único carregado de forma estática, sem `import()`.
// O grupo `themes` guarda o que cada tema diz de diferente (hoje só o NOME e o `deadSub`: a tagline era a
// outra, e virou a mesma frase curta nos três) e o grupo
// `prefs` guarda a tela de Opções: os dois já moraram fora daqui — dentro dos três temas e cravados na
// `prefsTable` —, e enquanto moraram lá não havia como traduzi-los sem carregar 3 idiomas em cada tema.
import { SKINS, RARITY_LABELS } from "@warspace/shared/skins.js";
import { TIERS, FAMILIES } from "@warspace/shared/achievements.js";

export default {
  // ── modos, equipe, chat e voz ──
  modesTitle: "ESCOLHA O MODO", modesShort: "Modos", partyTitle: "SUA EQUIPE",
  modeFree: "LIVRE", modeFreeSub: "Arena sem fim. Cresça, devore e reine.",
  modeSolo: "BATTLE ROYALE", modeSoloSub: "A arena fecha. Sem renascer. O último leva tudo.",
  modeTeam: "EM EQUIPE",
  teamSizeLabel: "TAMANHO DA EQUIPE", duo: "DUPLA", trio: "TRIO", quad: "QUARTETO",
  soloWord: "Solo", teamWord: "Equipe", createParty: "➕ CRIAR EQUIPE", joinParty: "Entrar por código", partyCode: "Código",
  copyLink: "📋 Copiar convite", linkCopied: "Convite copiado!", fillBots: "Preencher com bots", botAlly: "bot aliado", leaveParty: "Sair da equipe",
  partyHint: "Mande o convite para os amigos. Quem faltar vira bot aliado quando a partida começar.",
  partyLeader: "líder", waitingFriends: "esperando os amigos…", startMatch: "🚀 JOGAR",
  partyGone: "A equipe se desfez.", partyStale: "reconectando à equipe…", partyNoRoom: "Nenhuma sala disponível agora — tente de novo.",
  brLobbyTitle: "BATTLE ROYALE", brWaiting: "procurando jogadores…", brStarting: "a partida começa em",
  brHint: "O último planeta de pé leva tudo. A zona fecha, e não há como renascer.",
  brCancel: "Cancelar entrada",
  aliveLeft: "RESTAM", placementWord: "colocação", zoneOut: "⚠ NO GÁS", zoneShrinking: "O GÁS ESTÁ AVANÇANDO",
  admJoin: "🟢 {n} entrou no jogo", admJoinTitle: "warspace.io",
  rosterTitle: "NA SALA",
  chatTitle: "CHAT", chatHint: "T para falar", chatHintTouch: "Toque para falar", chatTeam: "equipe", chatPlaceholder: "Mensagem…",
  chatAll: "todos", chatScopeHint: "para quem você fala", chatDeadTag: "☠ ",
  playerActions: "o que fazer com este jogador", mutePlayer: "🔇 Silenciar", reportPlayer: "⚠ Denunciar",
  reportSent: "denúncia enviada", unmuteAll: "devolver a voz a todos",
  talkHint: "K = falar", talkOn: "GRAVANDO", micDenied: "O navegador negou o microfone.", micUnsupported: "Este navegador não grava áudio.",
  micCooldown: "Espere um instante para falar de novo.", micFail: "Não deu para abrir o microfone.",
  weapons: { missile: "Míssil", burst: "Rajada", cluster: "Cacho", nova: "Nova" },
  swapWeapon: "trocar arma", keySwap: "Q",
  deadByZone: "O GÁS TE ALCANÇOU", champTeam: "EQUIPE CAMPEÃ", lastAliveTitle: "ÚLTIMO PLANETA DE PÉ",
  watching: "assistindo", specPrev: "anterior", specNext: "próximo",
  mapOpen: "🗺 MAPA", mapClose: "🗺 FECHAR", liveOpen: "📡 TEMPO REAL", liveClose: "📡 FECHAR",
  title: "WARSPACE.IO", tagline: "CONQUISTE A GALÁXIA · DIVIDA · EJETE · DEVORE",
  coinIcon: "🪙", coinWord: "moedas", nameLabel: "Nome do seu planeta", namePlaceholder: "Informe o nome do seu planeta", nickAsk: "Dê um nome ao seu planeta para jogar", swap: "Trocar",
  play: "JOGAR", playAuto: "🚀 JOGAR (AUTO)", rooms: "Salas", ranking: "Ranking", profile: "Perfil", shop: "Loja", prefs: "Opções", home: "Início",
  guestNote: "Jogando como convidado", claim: "Criar conta", login: "Entrar", logout: "Sair", guest: "convidado", registered: "conta protegida",
  // {s}/{e}: as teclas de dividir e ejetar são configuráveis (prefs keySplit/keyEject), então a dica é um MOLDE.
  hint: "mouse = mover · {s} = dividir · {e} = ejetar · F/clique = míssil (segure para mirar, {s} cancela) · botão direito = dividir",
  back: "◄", equipped: "EQUIPADA", equip: "Equipar", buy: "Comprar", locked: "Bloqueada", secret: "???",
  lbTitle: "PÓDIO", lbToggle: "Mostrar/recolher o placar", massLabel: "MASSA", scoreLabel: "pontos", youLabel: "planeta", killsWord: "abates", botTag: "◆", regTag: "✓",
  dead: "KABOOM!", deadIcon: "💥", deadSub: "— a galáxia continua sem você —", eatenBy: "DEVORADO POR", suckedBy: "SUGADO POR",
  // ── KILL FEED ──  (o nome do grupo está em GROUPS lá embaixo: sem isso um tema que sobrescreva UMA
  // chave apagaria o objeto inteiro, porque `mergeLabels` só faz merge profundo no que está em GROUPS)
  killFeed: {
    eat: "devorou", missile: "míssil", burst: "rajada", cluster: "cacho", nova: "nova",
    star: "estrela", asteroid: "asteroide", zone: "gás", hole: "buraco negro", supernova: "supernova",
    assist: "amoleceu", world: "o espaço", killed: "matou",   // o verbo: sem ele a linha é "Fulano 🍴 Beltrano" e o leitor tem que adivinhar a direção
    // prefixo `sys_` porque `zone` é as DUAS coisas: o perigo que matou alguém e o marco "o gás virou"
    sys_start: "A partida começou", sys_lead: "{n} assumiu a liderança", sys_crunch: "BIG CRUNCH em {n}",
    sys_zone: "O gás está avançando", sys_few: "Restam {n}", sys_streak: "{n} abates seguidos",
    // ⚠️ só de GENTE: preenchimento não passa por `Room.join`/`leave` (nasce em `_nasceBot`), então o log
    // é de humano por construção — e o `anonBots` do Battle Royale continua intacto sem uma linha a mais.
    sys_joined: "{n} entrou", sys_left: "{n} saiu",
  },
  // Texto desenhado DENTRO do mundo (renderer/layers/Fx.js → theme/*/index.js). Fica aqui, e não nos três
  // temas, porque a mesma string repetida em três arquivos diverge na primeira correção.
  // "Nebulosa planetária" é o nome certo do que sobra de uma estrela que morre SEM supernova de verdade —
  // e é exatamente o caso do atropelamento, o único que não larga prêmio (STAR.RAM_REWARD).
  fx: { supernova: "SUPERNOVA!", nebula: "NEBULOSA PLANETÁRIA!", shield: "ESCUDO" },
  // ⚠️ Sem emoji: o ícone vinha do TEXTO (não há <i> nos botões da tela de morte) e o 🔄 competia com
  // o próprio rótulo num botão que já é o maior da tela.
  respawn: "DE NOVO!", newMatch: "OUTRA PARTIDA", brWatchHint: "Fique para ver o pódio no fim.", toLobby: "Lobby", timeWord: "tempo", rankWord: "ranking diário", coinsEarned: "moedas ganhas",
  lobbyTitle: "SALAS", roomCode: "CÓDIGO", enter: "Entrar", create: "➕ Criar sala", autoNote: "Entra na sala mais cheia com vaga", shard: "shard", botsWord: "bots",
  rankTitle: "RANKING", scopeGlobal: "Global", scopeCountry: "Meu país", noCountry: "escolha seu país no perfil",
  muteHint: "Mudo (M)",
  zoomHint: "Zoom manual — 0 ou o botão do meio volta ao automático",
  pauseTitle: "PAUSA", pauseHint: "Menu (Esc)", resume: "Voltar ao jogo", exitMatch: "Sair da partida",
  ownRoom: "SALA SUA", ownRoomSub: "Seu modo, seu tempo, sua gente", ownOpen: "CRIAR SUA SALA", ownClose: "VOLTAR AOS MODOS",
  // o que a chave "só por convite" muda de verdade, dito na hora de escolher (ver Room.semBots)
  ownPrivateNote: "Só entra quem tem o código, e a sala não recebe preenchimento.",
  ownPublicNote: "Você entra sozinho e os preenchimentos vão chegando aos poucos.",
  ownTime: "Duração", ownPrivate: "Só por convite", ownCreate: "➕ ABRIR SALA",
  ownNeedAccount: "Precisa de conta: o dono expulsa e bane.",
  hostPanel: "SUA SALA", hostKick: "Expulsar", hostBan: "Banir", hostBanned: "Banidos", hostNobody: "Só você por aqui",
  hostInvite: "Convite copiado",
  countryLabel: "País", countryHint: "Escolha seu país para entrar no ranking regional.",
  levelWord: "nível", xpWord: "XP", levelUp: "SUBIU DE NÍVEL!", levelReq: "Nível {n}",
  lowlevelToast: "essa skin pede nível {n} — você tem {v}",
  avatarTitle: "Sua foto", avatarPick: "Escolher imagem", avatarRemove: "Remover", avatarHint: "Aparece dentro do seu planeta. Quadrada, até 256 px.",
  awards: { score: "Mais pontos", food: "Mais partículas", kills: "Mais abates", kd: "Maior K/D" }, leftTag: "saiu", periods: { all: "Geral", week: "Semanal", day: "Diário" }, metrics: { score: "Pontos", mass: "Massa", kills: "Abates", xp: "Nível", food: "Partículas", kd: "K/D" }, you: "Você", rankPos: "posição",
  profileTitle: "PERFIL", history: "HISTÓRICO", achievements: "CONQUISTAS",
  stats: { games: "partidas", kills: "abates", deaths: "mortes", kd: "K/D", foodEaten: "partículas", level: "nível", xp: "XP",
    bestScore: "melhor pontuação", bestMass: "maior massa", playTime: "tempo jogado", bestStreak: "melhor sequência" },
  causes: { eaten: "devorado", blackhole: "buraco negro", left: "saiu", shutdown: "servidor", round: "big crunch" },
  shopTitle: "LOJA DE SKINS", shopNote: "Moedas se ganham jogando. Skins de conquista desbloqueiam sozinhas.", filterAll: "Todas", unlocked: "desbloqueadas",
  shopSearch: "Buscar skin…", onlyMine: "Adquiridas", noSkins: "Nenhuma skin com esse filtro",
  skinConfirmBuy: "Comprar esta skin?", skinConfirmEquip: "Equipar esta skin?",
  avatarBadge: "sua foto",
  sortBy: { rarity: "Por raridade", price: "Por preço", name: "Por nome" },
  prefsTitle: "PREFERÊNCIAS", save: "Salvar", reset: "Restaurar padrão", saved: "Preferências salvas",
  accountTitle: "CONTA", claimTab: "Criar conta", loginTab: "Entrar", nick: "Nick", password: "Senha", password2: "Confirmar senha", email: "E-mail",
  loginUser: "Usuário", loginUserHint: "É com ele que você volta à sua conta. Não muda depois — seu nick no jogo continua livre.",
  claimNote: "Crie sua conta para levar skins e moedas para outros dispositivos.", loginNote: "Entre com o usuário que você criou.",
  orSep: "ou", googleFail: "Não deu para entrar com o Google",
  confirm: "Confirmar", cancel: "Cancelar",
  reconnTitle: "SINAL FRACO!", reconnSub: "Procurando o satélite… tentativa {n}/5",
  // servidor fora (pacote de portal): a internet do jogador está boa, quem caiu foi o nosso lado — e
  // dizer o contrário manda a pessoa reiniciar o roteador por um problema que não é dela
  privacy: "Política de privacidade", portalLogin: "Entrar",
  serverDownTitle: "SEM CONTATO COM A BASE", serverDownSub: "Não conseguimos falar com o servidor do jogo. O problema é do nosso lado, não do seu.", retry: "Tentar de novo",
  // Versão velha. No SITE basta recarregar (e o jogo já tentou uma vez sozinho); num PORTAL o jogo é uma
  // cópia hospedada por eles, então recarregar traz o mesmo arquivo — quem atualiza é o portal.
  outdatedTitle: "ESTA VERSÃO FICOU PARA TRÁS", outdatedSub: "O jogo foi atualizado. Recarregue a página para pegar a versão nova.",
  outdatedSubPortal: "O jogo foi atualizado, e esta página é uma cópia mais antiga. Volte a abri-lo pelo portal daqui a pouco.", reload: "Recarregar",
  split: "DIVIDIR", eject: "EJETAR", fire: "MÍSSIL", exit: "Sair", keySplit: "ESPAÇO", keyEject: "W", keyFire: "F",
  ammo: "mísseis",
  fireCd: "carregando", powerups: { magnet: "Ímã", shield: "Escudo", merge: "Fusão", autodef: "Auto-defesa", zoom: "Visão", feast: "Banquete" }, shieldLevel: "Nv",
  // O que cada um FAZ, numa linha. O ícone sozinho não ensina: "🍀" não diz "a comida vale o dobro", e o
  // jogador que pegava um trevo pela primeira vez não tinha como descobrir. Aparece no balão do HUD e na
  // legenda da tela de Modos, que é por onde se passa antes de entrar.
  powerupHints: {
    magnet: "Puxa comida e fragmentos até você. Só vale até 100 mil de massa.",
    shield: "Aguenta míssil e batida de rocha. Sobe de nível sozinho se você não apanhar.",
    merge: "Junta todas as suas partes na hora.",
    autodef: "Derruba sozinho um míssil que vier em você. Uma carga por interceptação.",
    zoom: "Afasta a câmera e mostra mais mundo.",
    feast: "A comida vale o dobro enquanto durar.",
  },
  powerupsTitle: "POWERUPS", powerupsNote: "Aparecem como bolinhas no mapa. Passe por cima para pegar.",
  room: "SALA", ping: "ms", fps: "fps", top5: "TOP 5 HOJE",
  roundTitle: "BIG CRUNCH", roundIcon: "🕳️", roundSub: "— o universo desabou num ponto; a próxima galáxia já está nascendo —",
  champion: "CAMPEÃO DA SALA", nextRoom: "próxima sala", enterNow: "🚀 Entrar agora", playersWord: "no placar", posWord: "#",
  podium: "PÓDIO", restOfBoard: "E o resto da galáxia",
  // ── TELA DE MORTE v2 ──
  bestOfRest: "OS MAIORES DEPOIS DELA", recordWord: "recorde", newRecord: "RECORDE!", leadersNow: "QUEM ESTÁ NA FRENTE", timesBigger: "{n}× você",
  // ── FIM DE RODADA v2: a abertura, o campeão grande e os três modelos de placar ──
  lastAliveSub: "— o gás fechou e sobrou um planeta de pé —", skipHint: "clique para pular",
  boardTop: "OS MAIORES DA SALA", champCrown: "🏆",
  // extras do shell (não existem no mockup)
  offlineNote: "Sem servidor: jogando em modo local",
  noDbNote: "Servidor sem banco: progresso não é salvo", saving: "salvando…", noRank: "sem posição", loading: "carregando…",
  noRooms: "Nenhuma sala ativa — jogue para criar uma", noHistory: "Nenhuma partida ainda", useSuggestion: "Usar sugestão",
  claimed: "Conta criada", loggedIn: "Bem-vindo de volta", loggedOut: "Você saiu da conta", nickSaved: "Nick salvo",
  bought: "Skin comprada", equippedToast: "Skin equipada", poorToast: "Moedas insuficientes", lockedToast: "Desbloqueie pela conquista", secretToast: "Segredo oculto…",
  passShort: "Senha com pelo menos 6 caracteres", passMismatch: "As senhas não conferem", nickShort: "Nick com 2 a 16 caracteres",
  loginShort: "Usuário com 2 a 16 caracteres",
  connLost: "Conexão perdida", roomFull: "Sala cheia", kicked: "Desconectado do servidor",
  // ── O QUE CADA TEMA DIZ DE DIFERENTE ──
  // Os três temas exportavam um `labels` inteiro cada um, com as MESMAS 11 chaves em pt-BR — e só a
  // tagline, o `deadSub` e o nome do tema divergiam de verdade. Manter aquilo obrigaria cada tema a
  // carregar os três idiomas. As 11 comuns subiram para a base aqui em cima (são o texto que o jogador
  // sempre viu, porque tema nenhum fica desligado) e aqui embaixo fica só o que muda com a hora do dia.
  themes: {
    dawn:   { name: "Cartoon Amanhecer",  tagline: "Conquiste a galáxia!",   deadSub: "— você virou poeira de manhã cedo —" },
    sunset: { name: "Cartoon Crepúsculo", tagline: "Conquiste a galáxia!",    deadSub: "— você virou poeira no fim da tarde —" },
    dusk:   { name: "Cartoon Anoitecer",  tagline: "Conquiste a galáxia!", deadSub: "— você virou poeira ao anoitecer —" },
  },
  // ── A TELA DE OPÇÕES ──
  // ⚠️ O grupo se chama `opt` e não `prefs` porque `prefs` JÁ É uma chave de topo — o rótulo "Opções" do
  // menu. Chamá-lo de `prefs` transformou a string num objeto e a barra de navegação tentou renderizar o
  // grupo inteiro ("Objects are not valid as a React child"). Grupo novo tem que ter nome que ninguém
  // usa; quem prova é o teste "nenhuma chave de topo vira grupo por acidente".
  // `prefsTable.js` guardava estas 55 strings CRAVADAS — era o segundo maior dicionário do cliente e o
  // único que nenhuma tradução alcançaria. Agora a tabela guarda só chaves e tipos, e o texto sai daqui.
  // Rótulo de opção segue a convenção `<chave>_<valor>`, que é o que `PrefRow` procura.
  opt: {
    g_admin: "Administração", adminNotify: "Avisar quando entrar gente", adminNotifyAsk: "Permitir",
    adminNotifyOn: "permitido", adminNotifyBlocked: "bloqueado no navegador",
    g_controls: "Controles", g_graphics: "Gráficos", g_sound: "Som", g_ui: "Interface", g_a11y: "Acessibilidade", g_help: "Ajuda",
    joystick: "Joystick virtual (celular)", rightSplit: "Botão direito divide", holdEject: "Segurar a tecla ejeta contínuo",
    wheelZoom: "Roda do mouse dá zoom (0 volta ao normal)", keySplit: "Tecla de dividir", keyEject: "Tecla de ejetar",
    theme: "Tema", theme_auto: "Automático (hora local)", theme_dawn: "Amanhecer", theme_sunset: "Crepúsculo", theme_dusk: "Anoitecer",
    quality: "Qualidade", quality_auto: "Automática", quality_low: "Baixa", quality_high: "Alta",
    showGrid: "Grade do mapa",
    lang: "Idioma", lang_auto: "Automático (do navegador)",
    muted: "Mudo (tecla M)", sound: "Efeitos sonoros", music: "Música", musicVolume: "Volume da música",
    ambience: "Ambiência", volume: "Volume", voice: "Voz dos jogadores (K para falar)", voiceVolume: "Volume da voz",
    showNames: "Mostrar nomes", showMinimap: "Minimapa", showFps: "Mostrar FPS e ping", lbSize: "Linhas do placar", chat: "Chat",
    colorblind: "Modo daltonismo", colorblind_off: "Desligado", colorblind_deutan: "Deuteranopia", colorblind_protan: "Protanopia", colorblind_tritan: "Tritanopia",
    reduceMotion: "Reduzir movimento", bigText: "Texto maior",
    deadStyle: "Tela de morte", deadStyle_duelo: "Duelo", deadStyle_balanco: "Balanço", deadStyle_sala: "Sala",
    roundStyle: "Placar final", roundStyle_podio: "Pódio", roundStyle_cinema: "Cinema", roundStyle_dossie: "Dossiê",
    roundIntro: "Abertura do fim de rodada",
  },
  // ── ERROS ──
  // O servidor manda `{error:<código>, message:<pt-BR>}` e o cliente mostrava o MESSAGE cru — o que
  // deixava a tela bilíngue no instante em que algo dava errado. Agora quem manda é o CÓDIGO, e o texto
  // do servidor é o último paraquedas (código novo num cliente velho). Ver i18n/errors.js.
  // ⚠️ Alguns códigos são reusados com sentidos diferentes conforme a rota; esses ganham uma variante
  // `<contexto>.<código>`, e o contexto é quem chama que informa.
  err: {
    unknown: "Algo deu errado.",
    noWebGL: "Não foi possível iniciar o renderizador (WebGL indisponível)", network: "Sem conexão com o servidor.", http: "Erro {n}",
    unreachable: "Servidor indisponível.", offline: "Isso precisa de conexão com o servidor.",
    internal: "Erro no servidor.", db_unavailable: "Banco indisponível; tente de novo em instantes.",
    rate_limited: "Muitas tentativas; espere um instante.", payload_too_large: "Conteúdo grande demais.",
    bad_json: "Pedido inválido.", bad_request: "Pedido inválido.", method_not_allowed: "Pedido inválido.",
    not_found: "Não encontrado.", forbidden: "Acesso restrito.", client_side: "Isso não pode ser feito daqui.",
    unauthorized: "Sua sessão expirou — entre de novo.",
    // ⚠️ Contexto como SUBOBJETO, nunca chave com ponto no nome: o dicionário é navegado por caminho
    // ("err.room.not_found"), e uma chave chamada "room.not_found" some do caminho e do teste.
    room: { not_found: "Essa sala não existe mais." },
    party: { not_found: "A equipe se desfez.", full: "A equipe está cheia." },
    nick: { not_found: "Conta não encontrada." },
    avatar: { unknown: "Não deu para subir a imagem." },
    // conta e nick
    bad_nick: "Nick inválido.", invalid_nick: "O nick precisa de 2 a 16 caracteres.",
    bad_login: "Usuário inválido.", invalid_login: "O usuário precisa de 2 a 16 caracteres, sem @.",
    login_taken: "Esse usuário já está em uso.",
    // DORMENTE: o nick ficou livre na migração 0009 e nenhum servidor novo manda mais isto. Fica porque,
    // durante um rollout, um pod velho ainda manda — e sem a chave a tela ficaria bilíngue.
    nick_reserved: "Esse nick é de outro jogador registrado.",
    invalid_credentials: "Usuário ou senha incorretos.", invalid_password: "A senha precisa de pelo menos {n} caracteres.",
    invalid_email: "E-mail inválido.", email_taken: "Esse e-mail já está em uso.",
    already_registered: "Essa conta já é registrada.", google_disabled: "O login com Google não está ligado neste servidor.",
    bad_country: "Não deu para salvar o país.",
    // loja
    skin_not_found: "Essa skin não existe.", not_purchasable: "Essa skin não está à venda.",
    not_owned: "Você não tem essa skin.", already_owned: "Você já tem essa skin.",
    insufficient_coins: "Moedas insuficientes.", level_required: "Precisa de nível {n} — você tem {v}.",
    // avatar
    empty: "Nenhuma imagem recebida.", not_square: "A imagem tem que ser quadrada.",
    bad_size: "O lado tem que ficar entre {min} e {max} px.", too_big: "A imagem tem que caber em {kb} KB.",
    bad_image: "Só PNG ou WebP.",
    // salas e equipe
    no_game: "Nenhum servidor de jogo disponível agora.", need_account: "Abrir uma sala pede uma conta.",
    bad_time: "Duração inválida para este modo.", peer_unreachable: "Um servidor não respondeu; tente de novo.",
    bad_team_size: "A equipe precisa de 2 a 4 jogadores.", not_leader: "Só quem criou a equipe pode começar.",
    started: "A equipe já entrou em partida.", slot_changed: "A equipe mudou; confira antes de começar.",
    // WebSocket (códigos MAIÚSCULOS de net/wsServer.js + os dois que o próprio cliente inventa)
    AUTH: "Não foi possível entrar.", FULL: "Sala cheia.", MODE: "Essa sala é de outro modo.",
    NICK_IN_ROOM: "Já há alguém chamado \"{nick}\" nessa sala.", NICK_RESERVED: "Esse nick é de um jogador registrado.",
    RATE: "Muitas mensagens; a conexão foi encerrada.", VERSION: "Versão do jogo desatualizada — recarregando.",
    OUTDATED: "Sua versão do jogo está desatualizada.", UPDATING: "O servidor está atualizando; um instante.",
    ROOM: "Não foi possível entrar na sala.", ROOM_BANNED: "Você foi banido dessa sala.",
    ROOM_KICKED: "O dono removeu você da sala.",
    ROOM_RESTART: "O servidor está reiniciando; tente de novo em instantes.", ROOM_EXPIRED: "Sua sessão expirou; entre de novo.",
    UNREACHABLE: "Não foi possível conectar ao servidor.", LOST: "Conexão perdida.",
  },
  // ── CATÁLOGO: raridades, conquistas e skins ──
  // O `shared/` continua sendo a fonte pt-BR (é ele que alimenta o `seedSkins` do banco e o payload do
  // servidor) e não sabe que existe idioma. Aqui é a camada de tradução, e no pt-BR ela é DERIVADA do
  // próprio catálogo: repetir 238 textos criaria uma segunda verdade que diverge na primeira skin nova.
  rarity: { ...RARITY_LABELS },
  skins: Object.fromEntries(SKINS.map(s => [s.id, { n: s.name, d: s.desc }])),
  ach: {
    tier: Object.fromEntries(TIERS.map(t => [t.id, t.name])),
    secretTitle: "???", secretDesc: "Segredo oculto",
    fam: Object.fromEntries(FAMILIES.map(f => [f.id, f.title])),
    // O molde, não a frase pronta: o número entra por `{n}` e a CONTA que o produz mora em
    // `descArg` (shared/achievements.js). `_one` é a variante de singular de quem tem meta 1.
    desc: {
      survive: "Sobreviva {n} minutos numa vida", mass: "Alcance massa {n}", streak: "{n} abates sem morrer",
      top1: "Fique em 1º por {n} minutos", eat: "Coma {n} planetas", hunt: "Coma {n} adversários",
      split: "Divida {n} vezes", eject: "Ejete massa {n} vezes", games: "Jogue {n} partidas",
      brwin: "Vença {n} partidas de Battle Royale", brwin_one: "Vença uma partida de Battle Royale",
      brtop: "Termine {n} vezes no top 10 do Battle Royale", brtop_one: "Termine no top 10 do Battle Royale",
      brteam: "Vença {n} vezes o Battle Royale em equipe", brteam_one: "Vença o Battle Royale em equipe",
      explore: "Visite os 4 quadrantes numa vida",
    },
  },
  // Unidades e moldes que apareciam cravados no meio do código (`${h}h ${m}m`, `${n} min`, `${s}s`).
  // O ORDINAL tem as quatro categorias de `Intl.PluralRules` (type:"ordinal"): em português as quatro
  // são iguais, em inglês são 1st/2nd/3rd/4th. Foi ele que aposentou o array `places` do pódio.
  fmt: { hm: "{h}h {m}m", min: "{n} min", planets: "{n} planetas", s: "{n}s", ms: "{n} ms", px: "máx. {n}px · {kb} KB", of: "de {n}", chars: "{n} caracteres" },
  ord: { one: "{n}º", two: "{n}º", few: "{n}º", other: "{n}º" },
  pageTitle: "warspace.io — conquiste a galáxia",
  radar: "RADAR",
  travellerNick: "Viajante",
  // Nome da tecla na tela (`KEY_LABEL` em shared é o mesmo mapa, e é o chão quando o idioma não traz).
  keys: { Space: "ESPAÇO", KeyW: "W", KeyE: "E", KeyD: "D", KeyC: "C", KeyZ: "Z", ShiftLeft: "SHIFT" },
};
