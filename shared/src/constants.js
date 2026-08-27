// ── CONSTANTES ÚNICAS (servidor e cliente importam daqui; nada duplicado) ─────
// Unidades: px, segundos, px/s. Passo fixo de 60 Hz.
// @ts-check
export const WORLD={w:7200,h:7200};
export const TICK_HZ=60,DT=1/60,SNAPSHOT_EVERY=3,LEADERBOARD_EVERY=30,SAMPLE_EVERY=30;
export const ROOM={MAX:30,BOTS:15,CODE_LEN:4,STOP_AFTER_MS:30000,REMOVE_AFTER_MS:35000,RESUME_GRACE_TICKS:600};
export const ROUND={TICKS:36000,BREAK_MS:15000,DAY_START_H:5,WARN_S:10};
// rodada de 10 min (36000 ticks a 60 Hz) = um dia inteiro no relógio do espaço, começando às DAY_START_H;
// no fim o mundo explode, define-se o campeão (maior planeta vivo) e o placar fica BREAK_MS antes da sala nova.
// WARN_S: segundos finais com a contagem gigante na tela.
export const PLAYER={START_R:30,MIN_PIECE_R:16,MAX_R:290,MAX_PIECES:8,BOT_R:[24,58]};
export const SPEED={K:13200,MIN:48,MAX:360,ACCEL:6,DRAG:9.05,LAUNCH_DRAG:4.7,LAUNCH_STEER:1.5,LAUNCH_THRESH:1.05,STOP_DIST:4};
export const SPLIT={SPEED:1150,RECOIL:.1,MIN_R:26,COOLDOWN_TICKS:15,ANIM_TICKS:20,OFFSET:.6};
export const EJECT={SPEED:1080,R:9,COOLDOWN_TICKS:6,MIN_R:26,MASS_FACTOR:1.3,OWNER_IMMUNE_TICKS:20,LIFE_TICKS:900,DRAG:3.7,HOLD_TICKS:7};
export const MERGE={BASE_TICKS:300,PER_R:2.2,DIST:.75,SEPARATE:.92,SEP_CORR:.2,SEP_E:.3,ATTRACT_RANGE:2.2,ATTRACT_A:900};   // atração só entre peças que já podem fundir a d<(ra+rb)·ATTRACT_RANGE (px/s²)
export const mergeTicks=r=>Math.floor(MERGE.BASE_TICKS+r*MERGE.PER_R);
export const EAT={RATIO:1.15,GAIN:.55,CENTER:.4,FOOD_GAIN:.16,EJECT_GAIN:.9,SCORE_FOOD:1,SCORE_PLAYER:8,SCORE_EJECT:2};
export const BOUNCE={E:.55,E_SHIELD:.9,POS_CORR:.3,FX_MIN_VN:96};
export const WALL={E:.4,E_AST:.9,E_EJECT:.5};
export const FOOD={COUNT:840,R_MIN:6,R_MAX:15,SPECIAL_R:13,AMMO_P:.055,POWER_P:.045,HUES:12,MARGIN:40,
  TYPES:["dust","comet","star","rock","missile_ammo",null,"powerup_magnet","powerup_shield"]};   // índice = FOOD_TYPE (5 vago: powerup de velocidade removido)
export const FOOD_TYPE={DUST:0,COMET:1,STAR:2,ROCK:3,AMMO:4,MAGNET:6,SHIELD:7};   // 5 vago (velocidade removida): os índices no fio não mudam
export const ASTEROID={BELTS:4,PER_BELT:6,WANDERERS:16,R_MIN:30,R_MAX:62,MASS_R_MAX:80,BELT_RADIUS:[400,700],BELT_SPEED:[15,25],BELT_SPRING:.24,BELT_DAMP:.96,
  WANDER_SPEED:[20,60],POP_RATIO:1.1,POP_DIST:.82,CHIP:.04,CHIP_CD_TICKS:30,FEED:1.6,SHOOT_AT:72,SHOOT_R:36,CHILD_R:28,CHILD_SPEED:540,
  E:.6,E_AST:.9,SAFE_SPAWN:500,RESPAWN_TICKS:300,MAX_EXTRA:6,SHIELD_VN:240};   // SHIELD_VN: batida com vn acima disso tira um nível do escudo (e o escudo absorve a lasca)
export const BLACKHOLE={COUNT:3,CORE_R:38,INFLUENCE:9,G:9.4e6,A_MAX:5000,LOSS:.3,EXIT_MIN_DIST:1500,EXIT_SPEED:900,CD_TICKS:60,
  GROW_TICKS:120,LIFE_TICKS:[2700,5400],FADE_TICKS:180,DRIFT:10,DRIFT_CHANGE_TICKS:240,MIN_SEP:900,SAFE_SPAWN:500,FOOD_PULL:6,EJECT_PULL:1.6,AST_PULL:.5,MISSILE_PULL:.8};
export const STAR={COUNT:3,R:46,SWELL:1.75,ARM_K:.5,GROW_TICKS:120,LIFE_TICKS:[2400,4200],OLD_TICKS:480,RESPAWN_TICKS:600,HALO:2.2,
  SHATTER_MIN_R:24,SHATTER_N:[3,6],SHATTER_SPEED:900,SHATTER_CD_TICKS:45,PUSH_TOUCH:420,
  NOVA_R:8,NOVA_PARTICLES:24,NOVA_SPEED:[380,820],NOVA_PART_R:8,NOVA_LIFE_TICKS:900,AST_KICK:1500,PUSH:900,SAFE_SPAWN:700,MIN_SEP:1400};
// estrela: nasce em GROW (k rampa em GROW_TICKS), vive LIFE_TICKS em ACTIVE, incha até R·SWELL em OLD_TICKS e explode.
// Encostar (com k ≥ ARM_K) estilhaça a peça em SHATTER_N pedaços a SHATTER_SPEED (cooldown SHATTER_CD_TICKS por peça; abaixo de
// SHATTER_MIN_R só empurra a PUSH_TOUCH). Supernova: raio r·NOVA_R — NOVA_PARTICLES ejetados, asteroides a AST_KICK e peças a PUSH (só empurrão).
export const MISSILE={SPEED:720,TURN:.07,LIFE_TICKS:500,MAX_AMMO:3,R:11,HIT_SHRINK:.78,HIT_DEBRIS:5,DEBRIS_SPEED:540,
  INTERCEPT_DIST:1100,AST_KICK:420,AIM_CONE:.45,AIM_RANGE:2200};   // INTERCEPT_DIST: míssil inimigo mirando em mim a menos disso vira o alvo do meu tiro; AST_KICK: Δv (px/s) dado a um asteroide r=R_MIN (escala R_MIN/r)
// tiro mirado (segurar o botão): trava no objeto mais próximo dentro do cone ±AIM_CONE rad em volta da flecha e a até AIM_RANGE px; sem nada no cone sai reto
export const POWERUP={TICKS:420,MAGNET_RANGE:5.5,MAGNET_PULL:170,MAGNET_NEAR:2.2,MAGNET_EJECT_A:900,MAGNET_HEAVY:.45,MAGNET_STAR:.12,
  SHIELD_MAX_LEVEL:3,SHIELD_EVOLVE_TICKS:900};
// ímã: comida a d<r·MAGNET_RANGE anda a MAGNET_PULL·(1+(MAGNET_NEAR−1)·(1−d/alcance)) px/s; ejetados ganham MAGNET_EJECT_A px/s² (drag 3.7/s → ~240 px/s)
// cometa/estrela (comida pesada) andam a MAGNET_HEAVY disso; a estrela do mundo se arrasta a MAGNET_STAR (é um perigo enorme vindo até você)
// escudo: não expira; nível 1..SHIELD_MAX_LEVEL (N mísseis para destruir), sobe 1 nível a cada SHIELD_EVOLVE_TICKS sem ser atingido; cai ao disparar/dividir
// ímã e escudo valem POR PEÇA: só a parte que pegou o powerup se beneficia; ao fundir, os poderes das duas se juntam (escudo soma até o teto, ímã soma o tempo restante)
export const BOT={THINK_TICKS:[25,70],FLEE_RATIO:1.25,FLEE_DIST:620,HUNT_RATIO:1.3,HUNT_DIST:760,FOOD_DIST:420,MAX_PIECES:4,SPLIT_P:.05,FIRE_P:.012,HOLE_AVOID:1.3,RESPAWN_SCORE:.3};
export const BOT_NAMES=["Nebulox","Vortexia","Cosmara","Drakonis","Stellara","Graviton","Quasara","Pulsaris","Meteora","Darkion","Nexaris","Solaron","Astrophex","Hydraxis","Volcanix","Luminos","Aetheron","Aurorax","Voidrix","Pyronis"];
export const NET={INPUT_HZ:30,KEEPALIVE_HZ:10,INTERP_DELAY_MS:100,INTERP_MAX_MS:150,EXTRAP_MAX_MS:100,SNAP_DIST:120,AOI_PAD:.3,AOI_PAD_OUT:.45,
  RATE_INPUTS:40,RATE_BURST:60,RATE_JSON:5,HEARTBEAT_MS:5000,DEAD_MS:15000,RESUME_MS:10000};
export const SCORE_COINS=(score,kills,botKills,durationS)=>Math.min(500,Math.floor(score/300)+2*kills+botKills+(durationS>=300?25:0));
