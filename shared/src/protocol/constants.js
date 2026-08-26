// ── Enums do fio (ver docs/spec/protocol.md) ──────────────────────────────────
// @ts-check
export const PROTOCOL_VERSION=1;
export const MSG={INPUT:0x01,SNAPSHOT:0x10,PLAYERS:0x11,LEADERBOARD:0x12,EVENT:0x13,PONG:0x14};
export const KIND={PIECE:1,FOOD:2,EJECT:3,ASTEROID:4,BLACKHOLE:5,MISSILE:6};
export const INPUT_FLAG={SPLIT:1,EJECT:2,EJECT_HOLD:4,FIRE:8};
export const PIECE_FLAG={SHIELD:1,LAUNCH:2,MERGING:4,ME:8};
export const PLAYER_FLAG={BOT:1,DEAD:2,REG:4};
export const SELF_FLAG={DEAD:1};
export const POWER_BIT={speed:1,magnet:2,shield:4};
export const UPD={X_Y:1,R:2,V:4,FLAGS:8,EXTRA:16};
export const REMOVE={LEFT_AOI:0,EATEN:1,MERGED:2,POPPED:3,EXPIRED:4,SUCKED:5,DESPAWN:6};
export const EVENT={EAT:0,POP:1,MERGE:2,SPLIT:3,BH_SUCK:4,DEATH:5,CHIP:6,BOUNCE:7,BOOM:8,EXIT:9,SHOOT:10};
export const BH_PHASE={GROW:0,ACTIVE:1,FADE:2};
export const ERROR_CODE={VERSION:4400,FULL:4402,AUTH:4401,NICK_RESERVED:4409,RATE:4429,ROOM:4404};
// ── Tamanhos fixos do fio (codec.js) ─────────────────────────────────────────
export const NAME_MAX_BYTES=32; // nome no PLAYERS: utf-8 truncado em fronteira de code point
export const INPUT_BYTES=10,SNAPSHOT_HEADER_BYTES=13,SELF_BYTES=21;
