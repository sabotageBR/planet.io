// ── DTOs do protocolo (só tipos JSDoc; nada em runtime) ──────────────────────
// @ts-check
// Unidades de mundo (px, px/s, ticks) dos dois lados: o codec quantiza ao codificar e
// dequantiza ao decodificar. Campos opcionais valem por `kind` (create) ou por `mask` (update).
/**
 * Entidade que entrou na AOI.
 * @typedef {object} EntityCreate
 * @property {number} kind KIND.*
 * @property {number} id u32, incremental por sala
 * @property {number} x
 * @property {number} y
 * @property {number} r
 * @property {number} [owner] slot do dono (PIECE, EJECT, MISSILE)
 * @property {number} [vx] px/s (PIECE, EJECT, ASTEROID, MISSILE)
 * @property {number} [vy]
 * @property {number} [flags] PIECE_FLAG.* (PIECE)
 * @property {number} [type] FOOD_TYPE.* (FOOD)
 * @property {number} [hue] FOOD: 0..11 (matiz). EJECT: FRAG_KIND (tier do fragmento — PLAIN/RICH/NOVA)
 * @property {number} [seed] u16 (ASTEROID, BLACKHOLE, STAR)
 * @property {number} [influenceR] px inteiros: influência (BLACKHOLE) ou halo (STAR)
 * @property {number} [phase] BH_PHASE.* (BLACKHOLE) ou STAR_PHASE.* (STAR)
 * @property {number} [target] slot alvo (MISSILE)
 * @property {number} [weapon] WEAPON.* — qual arma disparou este projétil (MISSILE)
 */
/**
 * Delta de entidade já conhecida; só os campos ligados em `mask` (UPD.*) existem.
 * @typedef {object} EntityUpdate
 * @property {number} id
 * @property {number} mask UPD.X_Y|R|V|FLAGS|EXTRA
 * @property {number} [x] UPD.X_Y
 * @property {number} [y] UPD.X_Y
 * @property {number} [r] UPD.R
 * @property {number} [vx] UPD.V
 * @property {number} [vy] UPD.V
 * @property {number} [flags] UPD.FLAGS
 * @property {number} [phase] UPD.EXTRA (buraco negro, estrela)
 * @property {number} [influenceR] UPD.EXTRA (buraco negro, estrela)
 */
/**
 * @typedef {object} EntityRemove
 * @property {number} id
 * @property {number} reason REMOVE.*
 */
/**
 * Estado privado do próprio jogador, no fim de cada snapshot.
 * @typedef {object} SelfState
 * @property {number} flags SELF_FLAG.*
 * @property {number} missiles u8
 * @property {number} powerBits POWER_BIT.*
 * @property {number} magnetT ticks restantes do ímã (u16)
 * @property {number} shieldLv nível do escudo 0..3 (u8; 0 = sem escudo — não expira)
 * @property {number} score u32
 * @property {number} splitCd ticks (u8 saturado)
 * @property {number} ejectCd
 * @property {number} fireCd  ticks que faltam da carência de tiro do spawn (u16)
 * @property {number} rank u16 (1 = líder)
 * @property {number} mass u32
 * @property {number} threat  0 = nada vindo; 1..255 = quão perto está o míssil teleguiado que MIRA em mim (255 = colado)
 * @property {number} threatDir  direção peça→míssil em 1/256 de volta (só vale com threat > 0)
 * @property {number} weapon  WEAPON.* — a arma equipada; `missiles` é a munição DELA (u8)
 * @property {number} alive   quantos jogadores ainda estão vivos na sala (u8 saturado; o "restam N" do Battle Royale)
 * @property {number} owned   bitmask das armas com munição (bit 0 = míssil, sempre ligado): é o que o HUD
 *                            acende para dizer o que dá para chavear com a tecla de troca
 * @property {number} autoDefT ticks restantes do powerup de AUTO-DEFESA (u16)
 * @property {number} zoomT    ticks restantes do powerup de ZOOM (u16) — o cliente afasta a câmera na mesma conta da AOI
 * @property {number} feastT   ticks restantes do powerup de comida em dobro (u16)
 */
/**
 * @typedef {object} Snapshot
 * @property {number} tick u32
 * @property {number} ackSeq último INPUT.seq processado (u16)
 * @property {EntityCreate[]} creates
 * @property {EntityUpdate[]} updates
 * @property {EntityRemove[]} removes
 * @property {SelfState} self
 */
/**
 * Linha do PLAYERS.
 * @typedef {object} PlayerInfo
 * @property {number} slot
 * @property {number} flags PLAYER_FLAG.*
 * @property {number} skinId u8
 * @property {number} team equipe (u8; NO_TEAM = 255 no Livre e no Battle Royale solo)
 * @property {number} level nível do jogador (u8; 0 = sem nível — bot, convidado ou sala sem persistência)
 * @property {string} name utf-8 ≤ NAME_MAX_BYTES
 * @property {number} score u32
 */
/**
 * INPUT cliente → servidor. `tx,ty` em px de mundo.
 * @typedef {object} Input
 * @property {number} seq u16 (wrap)
 * @property {number} tx
 * @property {number} ty
 * @property {number} flags INPUT_FLAG.*
 * @property {number} clientTick só os 16 bits baixos
 */
/** @typedef {{slot:number,mass:number,x:number,y:number}} LeaderboardRow */   // x,y = centro das peças vivas (para o radar)
/** @typedef {{kind:number,x:number,y:number,r:number,slotA:number,slotB:number,extra:number}} GameEvent */
/** @typedef {{clientTime:number,serverTick:number}} Pong */
/**
 * Zona do Battle Royale: círculo de origem, de destino e os ticks das pontas (o cliente interpola).
 * Parada = origem igual ao destino. `t1` Infinity = fechou tudo e não muda mais.
 * @typedef {{x0:number,y0:number,r0:number,x1:number,y1:number,r1:number,t0:number,t1:number}} ZoneWire
 */
/** Clipe de voz subindo: bytes OPACOS (o servidor nunca decodifica). @typedef {{codec:number,durMs:number,data:Uint8Array}} VoiceUp */
/** Clipe de voz descendo, com o dono e de onde vem. @typedef {{slot:number,codec:number,durMs:number,x:number,y:number,data:Uint8Array}} VoiceClip */
export {};
