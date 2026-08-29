// ── TEXTOS (pt-BR) ────────────────────────────────────────────────────────────
// Copiados de mockups/v2/src/engine2.js. O tema pode sobrescrever qualquer chave
// (currentTheme().labels); os grupos aninhados são mesclados chave a chave (mergeLabels).
export const LABELS = {
  // ── modos, equipe, chat e voz ──
  modesTitle: "ESCOLHA O MODO", modesShort: "Modos", partyTitle: "SUA EQUIPE",
  modeFree: "LIVRE", modeFreeSub: "O jogo de sempre: cresça, coma e sobreviva até o fim do mundo.",
  modeSolo: "BATTLE ROYALE", modeSoloSub: "50 planetas numa arena que fecha. Sem renascer. O último de pé leva tudo.",
  modeTeam: "EM EQUIPE", modeTeamSub: "O mesmo battle royale, com quem você chamar — vocês não se comem e dividem massa.",
  teamSizeLabel: "TAMANHO DA EQUIPE", duo: "DUPLA", trio: "TRIO", quad: "QUARTETO",
  soloWord: "Solo", teamWord: "Equipe", createParty: "➕ CRIAR EQUIPE", joinParty: "Entrar por código", partyCode: "Código",
  copyLink: "📋 Copiar convite", linkCopied: "Convite copiado!", fillBots: "Preencher com bots", botAlly: "bot aliado", leaveParty: "Sair da equipe",
  partyHint: "Mande o convite para os amigos. Quem faltar vira bot aliado quando a partida começar.",
  partyLeader: "líder", waitingFriends: "esperando os amigos…", startMatch: "🚀 JOGAR",
  brLobbyTitle: "BATTLE ROYALE", brWaiting: "procurando jogadores…", brStarting: "a partida começa em",
  brHint: "O último planeta de pé leva tudo. A zona fecha, e não há como renascer.",
  aliveLeft: "RESTAM", placementWord: "colocação", zoneOut: "⚠ NO GÁS", zoneShrinking: "O GÁS ESTÁ AVANÇANDO",
  chatTitle: "CHAT", chatHint: "Enter para falar", chatTeam: "equipe", chatPlaceholder: "Mensagem…",
  talkHint: "Ctrl = falar", talkOn: "GRAVANDO", micDenied: "O navegador negou o microfone.", micUnsupported: "Este navegador não grava áudio.",
  micCooldown: "Espere um instante para falar de novo.", micFail: "Não deu para abrir o microfone.",
  weapons: { missile: "Míssil", burst: "Rajada", cluster: "Cacho", nova: "Nova" },
  swapWeapon: "trocar arma", keySwap: "Q",
  deadByZone: "O GÁS TE ALCANÇOU", champTeam: "EQUIPE CAMPEÃ", lastAliveTitle: "ÚLTIMO PLANETA DE PÉ",
  watching: "assistindo", specPrev: "anterior", specNext: "próximo",
  title: "🪐 PLANET.IO", tagline: "CONQUISTE A GALÁXIA · DIVIDA · EJETE · DEVORE",
  coinIcon: "🪙", coinWord: "moedas", nameLabel: "Nome do seu planeta", swap: "Trocar",
  play: "🚀 JOGAR", playAuto: "🚀 Jogar (auto)", rooms: "Salas", ranking: "Ranking", profile: "Perfil", shop: "Loja", prefs: "Opções", home: "Início",
  guestNote: "Jogando como convidado", claim: "Reivindicar conta", login: "Entrar", logout: "Sair", guest: "convidado", registered: "conta protegida",
  hint: "mouse = mover · ESPAÇO = dividir · W = ejetar · F/clique = míssil (segure para mirar, ESPAÇO cancela) · botão direito = dividir",
  back: "◄ Voltar", equipped: "EQUIPADA", equip: "Equipar", buy: "Comprar", locked: "Bloqueada", secret: "???",
  lbTitle: "PLACAR", massLabel: "MASSA", scoreLabel: "pontos", youLabel: "planeta", killsWord: "abates", botTag: "◆", regTag: "✓",
  dead: "ABSORVIDO", deadIcon: "💥", deadSub: "— a galáxia continua sem você —", eatenBy: "DEVORADO POR", suckedBy: "SUGADO POR",
  // ── KILL FEED ──  (o nome do grupo está em GROUPS lá embaixo: sem isso um tema que sobrescreva UMA
  // chave apagaria o objeto inteiro, porque `mergeLabels` só faz merge profundo no que está em GROUPS)
  killFeed: {
    eat: "devorou", missile: "míssil", burst: "rajada", cluster: "cacho", nova: "nova",
    star: "estrela", asteroid: "asteroide", zone: "gás", hole: "buraco negro", supernova: "supernova",
    assist: "amoleceu", world: "o espaço",
    // prefixo `sys_` porque `zone` é as DUAS coisas: o perigo que matou alguém e o marco "o gás virou"
    sys_start: "A partida começou", sys_lead: "{n} assumiu a liderança", sys_crunch: "BIG CRUNCH em {n}",
    sys_zone: "O gás está avançando", sys_few: "Restam {n}", sys_streak: "{n} abates seguidos",
  },
  respawn: "⟳ RENASCER", toLobby: "Lobby", timeWord: "tempo", rankWord: "ranking diário", coinsEarned: "moedas ganhas",
  lobbyTitle: "SALAS", roomCode: "CÓDIGO", enter: "Entrar", create: "Criar sala", autoNote: "Entra na sala mais cheia com vaga", shard: "shard", botsWord: "bots",
  rankTitle: "RANKING", scopeGlobal: "Global", scopeCountry: "Meu país", noCountry: "escolha seu país no perfil",
  countryLabel: "País", countryHint: "Escolha seu país para entrar no ranking regional.",
  levelWord: "nível", xpWord: "XP", levelUp: "SUBIU DE NÍVEL!", levelReq: "Nível {n}",
  lowlevelToast: "essa skin pede nível {n} — você tem {v}",
  avatarTitle: "Sua foto", avatarPick: "Escolher imagem", avatarRemove: "Remover", avatarHint: "Aparece dentro do seu planeta. Quadrada, até 256 px.",
  awards: { champion: "Campeão", food: "Mais partículas", kills: "Mais abates", kd: "Maior K/D" }, leftTag: "saiu", periods: { all: "Geral", week: "Semanal", day: "Diário" }, metrics: { score: "Pontos", mass: "Massa", kills: "Abates", xp: "Nível", food: "Partículas", kd: "K/D" }, you: "Você", rankPos: "posição",
  profileTitle: "PERFIL", history: "HISTÓRICO", achievements: "CONQUISTAS",
  stats: { games: "partidas", kills: "abates", deaths: "mortes", kd: "K/D", foodEaten: "partículas", level: "nível", xp: "XP",
    bestScore: "melhor pontuação", bestMass: "maior massa", playTime: "tempo jogado", bestStreak: "melhor sequência" },
  causes: { eaten: "devorado", blackhole: "buraco negro", left: "saiu", shutdown: "servidor", round: "big crunch" },
  shopTitle: "LOJA DE SKINS", shopNote: "Moedas se ganham jogando. Skins de conquista desbloqueiam sozinhas.", filterAll: "Todas", unlocked: "desbloqueadas",
  shopSearch: "Buscar skin…", onlyMine: "Só as minhas", noSkins: "Nenhuma skin com esse filtro",
  sortBy: { rarity: "Por raridade", price: "Por preço", name: "Por nome" },
  prefsTitle: "PREFERÊNCIAS", save: "Salvar", reset: "Restaurar padrão", saved: "Preferências salvas",
  accountTitle: "CONTA", claimTab: "Reivindicar", loginTab: "Entrar", nick: "Nick", password: "Senha", password2: "Confirmar senha", email: "E-mail (opcional)",
  claimNote: "Reivindicar a conta trava seu nick e leva skins e moedas para outros dispositivos.", loginNote: "Entre com um nick já reivindicado.",
  confirm: "Confirmar", cancel: "Cancelar",
  reconnTitle: "CONEXÃO PERDIDA", reconnSub: "Reconectando… tentativa {n}/5",
  split: "DIVIDIR", eject: "EJETAR", fire: "MÍSSIL", exit: "Sair", keySplit: "ESPAÇO", keyEject: "W", keyFire: "F",
  ammo: "mísseis",
  fireCd: "carregando", powerups: { magnet: "Ímã", shield: "Escudo", merge: "Fusão" }, shieldLevel: "Nv",
  room: "SALA", ping: "ms", fps: "fps", top5: "TOP 5 HOJE", activeRooms: "SALAS ATIVAS",
  roundTitle: "BIG CRUNCH", roundIcon: "🕳️", roundSub: "— o universo desabou num ponto; a próxima galáxia já está nascendo —",
  champion: "CAMPEÃO DA SALA", nextRoom: "próxima sala", enterNow: "🚀 Entrar agora", playersWord: "no placar", posWord: "#",
  podium: "PÓDIO", places: ["1º", "2º", "3º"], restOfBoard: "E o resto da galáxia",
  // extras do shell (não existem no mockup)
  offlineNote: "Sem servidor: jogando em modo local",
  noDbNote: "Servidor sem banco: progresso não é salvo", saving: "salvando…", noRank: "sem posição", loading: "carregando…",
  noRooms: "Nenhuma sala ativa — jogue para criar uma", noHistory: "Nenhuma partida ainda", useSuggestion: "Usar sugestão",
  claimed: "Conta reivindicada", loggedIn: "Bem-vindo de volta", loggedOut: "Você saiu da conta", nickSaved: "Nick salvo",
  bought: "Skin comprada", equippedToast: "Skin equipada", poorToast: "Moedas insuficientes", lockedToast: "Desbloqueie pela conquista", secretToast: "Segredo oculto…",
  passShort: "Senha com pelo menos 6 caracteres", passMismatch: "As senhas não conferem", nickShort: "Nick com 2 a 16 caracteres",
  connLost: "Conexão perdida", roomFull: "Sala cheia", kicked: "Desconectado do servidor",
};
const GROUPS = ["periods", "metrics", "stats", "powerups", "causes", "sortBy", "killFeed", "awards"];
export function mergeLabels(over) {
  if (!over) return LABELS;
  const out = { ...LABELS, ...over };
  for (const g of GROUPS) out[g] = { ...LABELS[g], ...(over[g] || {}) };
  return out;
}
