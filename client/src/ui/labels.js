// ── TEXTOS (pt-BR) ────────────────────────────────────────────────────────────
// Copiados de mockups/v2/src/engine2.js. O tema pode sobrescrever qualquer chave
// (currentTheme().labels); os grupos aninhados são mesclados chave a chave (mergeLabels).
export const LABELS = {
  title: "🪐 PLANET.IO", tagline: "CONQUISTE A GALÁXIA · DIVIDA · EJETE · DEVORE",
  coinIcon: "🪙", coinWord: "moedas", nameLabel: "Nome do seu planeta", swap: "Trocar",
  play: "🚀 JOGAR", playAuto: "🚀 Jogar (auto)", rooms: "Salas", ranking: "Ranking", profile: "Perfil", shop: "Loja", prefs: "Opções", home: "Início",
  guestNote: "Jogando como convidado", claim: "Reivindicar conta", login: "Entrar", logout: "Sair", guest: "convidado", registered: "conta protegida",
  hint: "mouse = mover · ESPAÇO = dividir · W = ejetar · F/clique = míssil · botão direito = dividir",
  back: "◄ Voltar", equipped: "EQUIPADA", equip: "Equipar", buy: "Comprar", locked: "Bloqueada", secret: "???",
  lbTitle: "PLACAR", massLabel: "MASSA", scoreLabel: "pontos", youLabel: "planeta", killsWord: "abates", botTag: "◆", regTag: "✓",
  dead: "ABSORVIDO", deadIcon: "💥", deadSub: "— a galáxia continua sem você —", eatenBy: "DEVORADO POR", suckedBy: "SUGADO POR",
  respawn: "⟳ RENASCER", toLobby: "Lobby", timeWord: "tempo", rankWord: "ranking diário", coinsEarned: "moedas ganhas",
  lobbyTitle: "SALAS", roomCode: "CÓDIGO", enter: "Entrar", create: "Criar sala", autoNote: "Entra na sala mais cheia com vaga", shard: "shard", botsWord: "bots",
  rankTitle: "RANKING", periods: { all: "Geral", week: "Semanal", day: "Diário" }, metrics: { score: "Pontos", mass: "Massa", kills: "Abates" }, you: "Você", rankPos: "posição",
  profileTitle: "PERFIL", history: "HISTÓRICO", achievements: "CONQUISTAS",
  stats: { games: "partidas", kills: "abates", bestScore: "melhor pontuação", bestMass: "maior massa", playTime: "tempo jogado", bestStreak: "melhor sequência" },
  causes: { eaten: "devorado", blackhole: "buraco negro", left: "saiu", shutdown: "servidor" },
  shopTitle: "LOJA DE SKINS", shopNote: "Moedas se ganham jogando. Skins de conquista desbloqueiam sozinhas.", filterAll: "Todas", unlocked: "desbloqueadas",
  prefsTitle: "PREFERÊNCIAS", save: "Salvar", reset: "Restaurar padrão", saved: "Preferências salvas",
  accountTitle: "CONTA", claimTab: "Reivindicar", loginTab: "Entrar", nick: "Nick", password: "Senha", password2: "Confirmar senha", email: "E-mail (opcional)",
  claimNote: "Reivindicar a conta trava seu nick e leva skins e moedas para outros dispositivos.", loginNote: "Entre com um nick já reivindicado.",
  confirm: "Confirmar", cancel: "Cancelar",
  reconnTitle: "CONEXÃO PERDIDA", reconnSub: "Reconectando… tentativa {n}/5",
  split: "DIVIDIR", eject: "EJETAR", fire: "MÍSSIL", exit: "Sair", keySplit: "ESPAÇO", keyEject: "W", keyFire: "F",
  ammo: "mísseis", powerups: { speed: "Velocidade", magnet: "Ímã", shield: "Escudo" },
  room: "SALA", ping: "ms", fps: "fps", top5: "TOP 5 HOJE", activeRooms: "SALAS ATIVAS",
  // extras do shell (não existem no mockup)
  offlineNote: "Sem servidor: jogando em modo local",
  noDbNote: "Servidor sem banco: progresso não é salvo", saving: "salvando…", noRank: "sem posição", loading: "carregando…",
  noRooms: "Nenhuma sala ativa — jogue para criar uma", noHistory: "Nenhuma partida ainda", useSuggestion: "Usar sugestão",
  claimed: "Conta reivindicada", loggedIn: "Bem-vindo de volta", loggedOut: "Você saiu da conta", nickSaved: "Nick salvo",
  bought: "Skin comprada", equippedToast: "Skin equipada", poorToast: "Moedas insuficientes", lockedToast: "Desbloqueie pela conquista", secretToast: "Segredo oculto…",
  passShort: "Senha com pelo menos 6 caracteres", passMismatch: "As senhas não conferem", nickShort: "Nick com 2 a 16 caracteres",
  connLost: "Conexão perdida", roomFull: "Sala cheia", kicked: "Desconectado do servidor",
};
const GROUPS = ["periods", "metrics", "stats", "powerups", "causes"];
export function mergeLabels(over) {
  if (!over) return LABELS;
  const out = { ...LABELS, ...over };
  for (const g of GROUPS) out[g] = { ...LABELS[g], ...(over[g] || {}) };
  return out;
}
