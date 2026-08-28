// ── Enums do fio (ver docs/spec/protocol.md) ──────────────────────────────────
// @ts-check
export const PROTOCOL_VERSION=9;   // 9: MODOS DE JOGO — PLAYERS leva `team`, `self` leva `weapon`/`alive`, MISSILE leva `weapon`, e entram ZONE/VOICE/VOICE_UP
// 8: `self` leva threat/threatDir (míssil teleguiado vindo em mim) · 7: fireCd (carência de tiro do spawn) · 6: LEADERBOARD leva x,y de TODOS os vivos
// 5: o `hue` do EJECT deixou de ser o skinId (que o cliente ignorava) e virou FRAG_KIND
export const MSG={INPUT:0x01,VOICE_UP:0x02,SNAPSHOT:0x10,PLAYERS:0x11,LEADERBOARD:0x12,EVENT:0x13,PONG:0x14,ZONE:0x15,VOICE:0x16};
// VOICE_UP (cliente→servidor) e VOICE (servidor→cliente) carregam bytes opacos de áudio: o servidor
// valida tamanho/duração/cooldown e RELAYA, nunca decodifica. ZONE é o círculo da zona, na cadência do
// LEADERBOARD (2 Hz) — o cliente interpola entre origem e destino como faz com todo o resto.
export const KIND={PIECE:1,FOOD:2,EJECT:3,ASTEROID:4,BLACKHOLE:5,MISSILE:6,STAR:7};   // 3 bits: entra nos códigos de par do mundo e no `known` do snapshot
export const INPUT_FLAG={SPLIT:1,EJECT:2,EJECT_HOLD:4,FIRE:8,AIM:16};   // AIM acompanha FIRE: tiro mirado (persegue a bolinha mais próxima do ponteiro)
export const PIECE_FLAG={SHIELD:1,LAUNCH:2,MERGING:4,ME:8,MAGNET:16,SHIELD_LV_SHIFT:5,SHIELD_LV_MASK:96};   // nível do escudo (1..3) = (flags>>SHIELD_LV_SHIFT)&3
export const FOOD_FLAG={MOVED:1};   // interno ao mundo (ímã/buraco negro moveu a comida desde o último snapshot); não vai no fio
export const FRAG_KIND={PLAIN:0,RICH:1,NOVA:2};   // ejetado: tier do fragmento, no `hue` do create (PLAIN = pelota comum; RICH = pedaço gordo, mass ≥ FRAG.RICH_MASS; NOVA = estilhaço de supernova, brilha)
export const PLAYER_FLAG={BOT:1,DEAD:2,REG:4,TALK:8};   // TALK: está mandando áudio agora (o cliente acende o ícone)
export const NO_TEAM=255;   // linha do PLAYERS: sem equipe (modo Livre e Battle Royale solo)
export const SELF_FLAG={DEAD:1,RESYNC:2,LOBBY:4,ZONE_HURT:8};
// RESYNC: a sessão esqueceu o que o cliente conhece (socket congestionado) — o cliente descarta tudo e recria com este snapshot
// LOBBY: a partida ainda não começou (o jogador está na sala, não no mapa); ZONE_HURT: estou FORA da zona, queimando
export const POWER_BIT={magnet:1,shield:2};
export const UPD={X_Y:1,R:2,V:4,FLAGS:8,EXTRA:16};
export const REMOVE={LEFT_AOI:0,EATEN:1,MERGED:2,POPPED:3,EXPIRED:4,SUCKED:5,DESPAWN:6};
export const EVENT={EAT:0,POP:1,MERGE:2,SPLIT:3,BH_SUCK:4,DEATH:5,CHIP:6,BOUNCE:7,BOOM:8,EXIT:9,SHOOT:10,SHIELD_BREAK:11,CLASH:12,DEFLECT:13,SHIELD_HIT:14,SHIELD_UP:15,
  STAR_BURST:16,SUPERNOVA:17,STAR_HIT:18,STAR_SPLIT:19,SMASH:20,ZONE_SHRINK:21,ZONE_BURN:22};
// ZONE_SHRINK: a zona começou a fechar (r = raio de destino, extra = ticks do fechamento).
// STAR_HIT: tiro/partícula empurrou a estrela; STAR_SPLIT: 3 hits e ela rachou em várias; SMASH: meteoro trombou na estrela (os dois se partem)
// ZONE_BURN: uma peça está queimando fora dela (extra = massa perdida). Kinds novos entram no FIM —
// EXIT (9) e STAR_SPLIT (19) continuam sem emissor e NÃO são reciclados, para não versionar o fio à toa.
export const BH_PHASE={GROW:0,ACTIVE:1,FADE:2};
export const STAR_PHASE={GROW:0,ACTIVE:1,OLD:2};   // OLD = inchando para a supernova
export const ERROR_CODE={VERSION:4400,FULL:4402,AUTH:4401,NICK_RESERVED:4409,RATE:4429,ROOM:4404,MODE:4405};
// ── Tamanhos fixos do fio (codec.js) ─────────────────────────────────────────
export const NAME_MAX_BYTES=32; // nome no PLAYERS: utf-8 truncado em fronteira de code point
export const INPUT_BYTES=10,SNAPSHOT_HEADER_BYTES=13,SELF_BYTES=24,ZONE_BYTES=21,VOICE_HEADER_BYTES=12,VOICE_UP_HEADER_BYTES=6;
// SELF_BYTES: 18 + u16 fireCd (protocolo 7) + 2×u8 threat/threatDir (8) + 2×u8 weapon/alive (9).
// O INPUT continua com 10 bytes: a arma é ÚNICA por jogador (pegar outra troca) e o push-to-talk tem
// mensagem própria, então nada disso precisou de flag nova.
