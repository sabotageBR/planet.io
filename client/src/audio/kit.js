// ── RECEITAS DE SOM: tudo sintetizado, nenhum arquivo (mesmo espírito das texturas, que são desenhadas) ──
// Uma receita é uma lista de VOZES tocadas juntas. Cada voz: `t:"tom"` (oscilador) ou `t:"ruido"` (ruído rosa
// filtrado por bandpass). f0→f1 = glide; `at` = atraso dentro da receita; `rep`/`gap` = repetir a mesma voz.
// A regra de ouro do pacote é ATAQUE + CORPO + CAUDA: um transiente curto que dá o "toque", um tom que dá o
// corpo e uma cauda que dá o tamanho. Som de uma voz só soa fino — era o que faltava antes.
// A chave da receita é a MESMA do efeito visual (FX_OF em game/index.js), então evento novo com efeito já sai
// com áudio. Afinar um som = mexer nestes números.
// @ts-check

/** @typedef {{t?:string,f0:number,f1?:number,dur:number,gain?:number,atk?:number,type?:string,q?:number,rep?:number,gap?:number,at?:number}} Voz */

/** @type {Record<string,Voz[]>} */
export const KIT={
  // ── comer, crescer, juntar ──────────────────────────────────────────────
  food:      [{t:"ruido",f0:3400,dur:.018,gain:.05,q:2},                                    // o toque do grão
              {t:"tom",type:"triangle",f0:760,f1:1140,dur:.05,gain:.13}],                   // (a altura sobe em escada na sequência — ver `ladder`)
  eat:       [{t:"ruido",f0:1200,f1:320,dur:.16,gain:.15,q:1.1},                            // o "nhac"
              {t:"tom",type:"sine",f0:520,f1:120,dur:.26,gain:.3},                          // corpo: desce = engoliu
              {t:"tom",type:"sine",f0:150,f1:58,dur:.36,gain:.2,at:.03}],                   // cauda grave: o peso do que entrou
  grow:      [{t:"tom",type:"triangle",f0:440,f1:660,dur:.14,gain:.15},                     // carrilhão: cruzou um marco de massa
              {t:"tom",type:"sine",f0:660,f1:990,dur:.2,gain:.12,at:.09},
              {t:"tom",type:"sine",f0:880,f1:1320,dur:.28,gain:.09,at:.18}],
  merge:     [{t:"ruido",f0:900,f1:260,dur:.1,gain:.07,q:1.5},                              // as duas partes encaixando
              {t:"tom",type:"sine",f0:300,f1:520,dur:.18,gain:.24},
              {t:"tom",type:"sine",f0:150,f1:260,dur:.28,gain:.13,at:.02}],
  // ── mover-se ────────────────────────────────────────────────────────────
  split:     [{t:"tom",type:"square",f0:190,f1:120,dur:.05,gain:.13},                       // "chunk" mecânico do corte
              {t:"ruido",f0:600,f1:2400,dur:.15,gain:.19,q:3},                              // whoosh do arremesso
              {t:"tom",type:"sine",f0:240,f1:460,dur:.15,gain:.13,at:.02}],
  eject:     [{t:"ruido",f0:1700,f1:640,dur:.09,gain:.15,q:2.4},                            // "pft" pressurizado (a altura sobe com a rampa do W)
              {t:"tom",type:"triangle",f0:430,f1:240,dur:.07,gain:.09}],
  bounce:    [{t:"ruido",f0:1500,dur:.025,gain:.06,q:2},
              {t:"tom",type:"triangle",f0:240,f1:170,dur:.07,gain:.18}],
  // ── coletar ─────────────────────────────────────────────────────────────
  ammo:      [{t:"tom",type:"square",f0:660,f1:990,dur:.07,gain:.16,rep:2,gap:.07},
              {t:"ruido",f0:2600,dur:.02,gain:.05,q:3}],
  powerup:   [{t:"tom",type:"triangle",f0:520,f1:780,dur:.1,gain:.2,rep:3,gap:.08},         // arpejo subindo
              {t:"tom",type:"sine",f0:260,f1:390,dur:.3,gain:.1,at:.02}],
  // ── arma ────────────────────────────────────────────────────────────────
  fire:      [{t:"ruido",f0:1200,f1:2800,dur:.14,gain:.17,q:4},                             // o rojão saindo
              {t:"tom",type:"sawtooth",f0:520,f1:900,dur:.1,gain:.1},
              {t:"tom",type:"sine",f0:110,f1:60,dur:.2,gain:.14,at:.01}],                   // o coice
  lock:      [{t:"tom",type:"square",f0:1500,dur:.018,gain:.08},                            // a mira trocou de bolinha: "tk-tk" seco
              {t:"tom",type:"square",f0:2100,dur:.018,gain:.07,at:.05}],
  cancel:    [{t:"tom",type:"square",f0:900,f1:380,dur:.09,gain:.11},                       // desarmou o tiro
              {t:"ruido",f0:700,dur:.05,gain:.05,q:2}],
  ready:     [{t:"tom",type:"triangle",f0:700,dur:.07,gain:.12},                            // arma carregada
              {t:"tom",type:"triangle",f0:1050,dur:.13,gain:.12,at:.08}],
  shoot:     [{t:"tom",type:"square",f0:400,f1:120,dur:.14,gain:.15},                       // asteroide-vírus cuspindo um filho
              {t:"ruido",f0:900,dur:.06,gain:.07,q:1.5}],
  deflect:   [{t:"tom",type:"square",f0:900,f1:1500,dur:.08,gain:.15},
              {t:"ruido",f0:3000,dur:.04,gain:.07,q:4}],
  clash:     [{t:"ruido",f0:3200,dur:.12,gain:.19,q:6},
              {t:"tom",type:"square",f0:1500,f1:900,dur:.09,gain:.11}],
  // ── apanhar ─────────────────────────────────────────────────────────────
  boom:      [{t:"ruido",f0:2600,dur:.03,gain:.12,q:1},                                     // estalo do impacto
              {t:"ruido",f0:420,dur:.34,gain:.3,q:.7},                                      // corpo
              {t:"tom",type:"sine",f0:150,f1:40,dur:.34,gain:.3},                           // sub caindo
              {t:"ruido",f0:1500,f1:400,dur:.5,gain:.09,q:.8,at:.08}],                      // cauda de destroços
  pop:       [{t:"ruido",f0:2400,dur:.03,gain:.1,q:2},                                      // a rachadura
              {t:"ruido",f0:800,dur:.22,gain:.26,q:.9},
              {t:"tom",type:"sawtooth",f0:300,f1:80,dur:.2,gain:.17},
              {t:"ruido",f0:2000,f1:900,dur:.3,gain:.06,q:2,at:.06}],                       // estilhaços
  chip:      [{t:"ruido",f0:2600,dur:.05,gain:.15,q:1}],
  hurt:      [{t:"ruido",f0:500,f1:180,dur:.2,gain:.16,q:.9},                               // EU perdi massa (distinto da explosão)
              {t:"tom",type:"sawtooth",f0:260,f1:90,dur:.22,gain:.15}],
  shieldUp:  [{t:"tom",type:"triangle",f0:600,f1:900,dur:.12,gain:.2,rep:3,gap:.09},        // (a altura sobe com o NÍVEL)
              {t:"tom",type:"sine",f0:300,dur:.34,gain:.08,at:.04}],
  shieldHit: [{t:"tom",type:"square",f0:1400,f1:1100,dur:.09,gain:.16},                     // ting metálico
              {t:"tom",type:"square",f0:2100,f1:1650,dur:.07,gain:.07},                     // a 5ª: dá o "metal"
              {t:"ruido",f0:2400,dur:.07,gain:.09,q:3}],
  shieldBreak:[{t:"ruido",f0:2800,dur:.3,gain:.24,q:2},                                     // vidro
              {t:"tom",type:"square",f0:1200,f1:300,dur:.22,gain:.15},
              {t:"ruido",f0:1200,f1:500,dur:.45,gain:.07,q:1.5,at:.05}],
  // ── estrelas ────────────────────────────────────────────────────────────
  starBurst: [{t:"ruido",f0:1500,dur:.3,gain:.28,q:1.2},                                    // o estilhaço
              {t:"tom",type:"sawtooth",f0:700,f1:180,dur:.25,gain:.19},
              {t:"ruido",f0:5200,f1:1400,dur:.55,gain:.13,q:.7,at:.02}],                    // CHAMUSCADO: é o som da massa queimando (STAR.BURN)
  starHit:   [{t:"tom",type:"square",f0:800,f1:520,dur:.1,gain:.15},
              {t:"ruido",f0:2200,dur:.04,gain:.06,q:3}],
  starSplit: [{t:"ruido",f0:1100,dur:.35,gain:.26,q:1},
              {t:"tom",type:"sawtooth",f0:420,f1:140,dur:.3,gain:.19}],
  smash:     [{t:"ruido",f0:520,dur:.28,gain:.3,q:.8},                                      // pedrada: rocha estourando…
              {t:"tom",type:"square",f0:260,f1:70,dur:.22,gain:.21},
              {t:"ruido",f0:2200,dur:.14,gain:.13,q:3}],                                    // …e o rasgo da estrela junto
  supernova: [{t:"ruido",f0:180,f1:900,dur:.28,gain:.12,q:1.4},                             // a INSPIRAÇÃO antes do estouro
              {t:"ruido",f0:600,dur:1.1,gain:.4,q:.5,at:.26},
              {t:"tom",type:"sine",f0:200,f1:26,dur:1,gain:.38,at:.26},
              {t:"tom",type:"sawtooth",f0:900,f1:120,dur:.5,gain:.15,at:.26},
              {t:"ruido",f0:2600,f1:300,dur:1.6,gain:.1,q:.5,at:.34}],                      // cauda longa
  // ── buraco negro (dormente enquanto BLACKHOLE.COUNT = 0) ────────────────
  suck:      [{t:"tom",type:"sine",f0:560,f1:52,dur:.55,gain:.28},
              {t:"ruido",f0:300,dur:.5,gain:.13,q:.6}],
  exit:      [{t:"tom",type:"sine",f0:90,f1:680,dur:.3,gain:.24},
              {t:"ruido",f0:1400,dur:.2,gain:.11,q:2}],
  // ── vida e rodada ───────────────────────────────────────────────────────
  death:     [{t:"ruido",f0:2000,dur:.04,gain:.12,q:1},
              {t:"tom",type:"sine",f0:400,f1:52,dur:.85,gain:.32},
              {t:"ruido",f0:900,f1:200,dur:.7,gain:.15,q:.6,at:.03}],                       // a lavagem que apaga tudo
  respawn:   [{t:"ruido",f0:300,f1:1800,dur:.2,gain:.1,q:1.4},
              {t:"tom",type:"triangle",f0:300,f1:600,dur:.22,gain:.18},
              {t:"tom",type:"sine",f0:600,f1:900,dur:.28,gain:.1,at:.12}],
  countdown: [{t:"tom",type:"square",f0:880,dur:.09,gain:.22}],
  bigCrunch: [{t:"ruido",f0:300,dur:1.6,gain:.38,q:.4},
              {t:"tom",type:"sine",f0:120,f1:18,dur:1.5,gain:.4},
              {t:"ruido",f0:60,f1:2400,dur:.5,gain:.1,q:.7,at:1.4}],                        // o clarão no fim do colapso
  join:      [{t:"tom",type:"triangle",f0:400,f1:800,dur:.14,gain:.18,rep:2,gap:.1}],
  // ── telas (nada disso existia: as telas eram mudas) ─────────────────────
  uiHover:   [{t:"tom",type:"sine",f0:1200,dur:.03,gain:.035}],
  uiClick:   [{t:"tom",type:"triangle",f0:820,dur:.035,gain:.09},
              {t:"ruido",f0:3000,dur:.015,gain:.03,q:3}],
  uiOpen:    [{t:"tom",type:"triangle",f0:520,f1:780,dur:.11,gain:.09},
              {t:"tom",type:"sine",f0:780,dur:.14,gain:.05,at:.06}],
  uiClose:   [{t:"tom",type:"triangle",f0:780,f1:480,dur:.11,gain:.09}],
  buy:       [{t:"tom",type:"square",f0:1050,dur:.05,gain:.11},                             // moeda
              {t:"tom",type:"square",f0:1570,dur:.07,gain:.1,at:.05},
              {t:"tom",type:"sine",f0:2100,dur:.22,gain:.06,at:.1}],
  equip:     [{t:"tom",type:"triangle",f0:620,f1:930,dur:.12,gain:.13},
              {t:"tom",type:"sine",f0:930,dur:.18,gain:.07,at:.08}],
  error:     [{t:"tom",type:"square",f0:280,f1:180,dur:.12,gain:.13},
              {t:"tom",type:"square",f0:210,f1:140,dur:.14,gain:.11,at:.1}],
  toast:     [{t:"tom",type:"sine",f0:880,dur:.06,gain:.07},
              {t:"tom",type:"sine",f0:1320,dur:.12,gain:.055,at:.05}],
  deadScreen:[{t:"ruido",f0:900,f1:150,dur:.9,gain:.16,q:.5},                               // a tela de KABOOM (o `death` é o do mundo)
              {t:"tom",type:"sine",f0:220,f1:44,dur:1,gain:.2}],
  podium:    [{t:"tom",type:"triangle",f0:523,dur:.22,gain:.15},                             // pódio do BIG CRUNCH: 3 notas subindo
              {t:"tom",type:"triangle",f0:659,dur:.22,gain:.15,at:.2},
              {t:"tom",type:"triangle",f0:784,dur:.5,gain:.17,at:.4},
              {t:"tom",type:"sine",f0:1568,dur:.6,gain:.06,at:.4}],

  // ── modos, zona, chat e voz ─────────────────────────────────────────────
  matchStart:[{t:"tom",type:"triangle",f0:392,dur:.16,gain:.2},                             // acorde ascendente: a espera acabou
              {t:"tom",type:"triangle",f0:523,dur:.18,gain:.2,at:.12},
              {t:"tom",type:"sine",f0:784,f1:880,dur:.5,gain:.22,at:.24},
              {t:"ruido",f0:2600,f1:600,dur:.3,gain:.06,q:1.2,at:.24}],
  zoneShrink:[{t:"ruido",f0:240,f1:90,dur:.9,gain:.16,q:.7},                                // o mundo apertando: grave que desce e não resolve
              {t:"tom",type:"sawtooth",f0:98,f1:73,dur:1.1,gain:.14},
              {t:"tom",type:"sine",f0:196,f1:146,dur:1.2,gain:.08,at:.06},
              {t:"ruido",f0:1800,f1:400,dur:.22,gain:.07,q:2,at:.02}],                      // o "chiado" do anel fechando
  zoneBurn:  [{t:"ruido",f0:900,f1:2600,dur:.22,gain:.09,q:.9},                             // queimando fora: sibilo agudo, curto e repetido
              {t:"tom",type:"sawtooth",f0:220,f1:330,dur:.14,gain:.06}],
  chatIn:    [{t:"tom",type:"sine",f0:1320,dur:.045,gain:.07},                              // discreto de propósito: o chat não pode competir com o jogo
              {t:"tom",type:"sine",f0:1760,dur:.06,gain:.05,at:.04}],
  micOn:     [{t:"tom",type:"sine",f0:660,f1:990,dur:.09,gain:.11}],                        // o microfone abriu (confirmação tátil do Ctrl)
  micOff:    [{t:"tom",type:"sine",f0:880,f1:520,dur:.1,gain:.09}],
  fireUp:    [{t:"ruido",f0:900,f1:2600,dur:.55,gain:.05,q:6},                                // assobio da subida: ruído bem estreito subindo
              {t:"tom",type:"sine",f0:520,f1:1500,dur:.55,gain:.05}],
  fireBoom:  [{t:"ruido",f0:120,f1:40,dur:.5,gain:.34,q:.5},                                  // o estouro: grave que desaba
              {t:"tom",type:"sine",f0:110,f1:38,dur:.42,gain:.26},
              {t:"ruido",f0:2600,f1:900,dur:.14,gain:.14,q:1.1},                               // o "tá" seco do primeiro instante
              {t:"ruido",f0:3200,dur:.05,gain:.07,q:3,rep:9,gap:.075,at:.16}],                 // crepitação das faíscas caindo
  weapon:    [{t:"ruido",f0:600,f1:2400,dur:.1,gain:.12,q:1.4},                             // arma nova no cinto: metálico, sobe
              {t:"tom",type:"square",f0:330,f1:660,dur:.14,gain:.12},
              {t:"tom",type:"triangle",f0:990,dur:.2,gain:.1,at:.08}],
};

/** Intervalo mínimo por tipo (ms): o que acontece muito não pode empilhar e virar metralhadora. */
export const GAP={food:45,chip:70,bounce:60,starHit:80,shieldHit:70,deflect:70,ammo:120,countdown:200,smash:150,
  eject:55,lock:70,hurt:180,uiHover:60,uiClick:40,toast:200,zoneBurn:400,chatIn:120,weapon:150,fireUp:90,fireBoom:90};

/**
 * Prioridade por som (padrão 1). No teto de vozes o som novo ROUBA a voz de menor prioridade em vez de ser
 * descartado — antes o `play()` simplesmente desistia, então justo o que mais importa (o alerta de míssil, a
 * própria morte) sumia na hora em que a tela estava mais cheia, que é quando ele mais importa.
 */
export const PRIO={uiHover:0,food:0,bounce:0,chip:0,starHit:0,chatIn:0,zoneBurn:1,fireUp:2,fireBoom:4,
  death:5,deadScreen:5,hurt:4,boom:4,supernova:4,bigCrunch:5,podium:4,starBurst:3,shieldBreak:3,countdown:3,ready:2,lock:2,cancel:2,error:2,
  zoneShrink:4,matchStart:5,weapon:3,micOn:2,micOff:2};   // o fechamento da zona é aviso de morte: não pode ser roubado pela poeira

/** Escala pentatônica maior: a sequência de grãos sobe por ela e reseta na pausa (a recompensa de comer em fila). */
export const ESCADA=[1,1.125,1.25,1.5,1.6875,2,2.25,2.5];
export const ESCADA_RESET_MS=900;
