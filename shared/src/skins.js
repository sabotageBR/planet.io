// ── SKINS (fonte única: cliente renderiza, servidor valida preço/unlock) ──────
// `pattern` é a textura procedural desenhada por client/src/theme/patterns.js dentro do disco (nada de imagem:
// tudo canvas, assado uma vez por skin/tier). `accent` é a 2ª cor do padrão; `ring` desenha o anel de Saturno.
// Padrões: plain·stripes·clouds·storm·swirl·galaxy·craters·continents·lava·ice·poison·aurora·checker·crystal·
// rings2·eye·sparkle·void·nebula·metal·scales·plasma; as LENDÁRIAS de nível acrescentam
// belt·magma·prism·orbits·tide·crown·phoenix·singular, `avatar` é a foto do jogador e `face` são as
// caricaturas dos easter eggs (o `egg` de shared/src/eggs.js escolhe qual, pelo id da skin).
// `mascote` são os TRÊS personagens do jogo (Marte, Terra e Lua), a mesma arte que o cenário do menu e os
// cartões da tela de modos já usam — e é por isso que elas NÃO são cortadas no pacote de portal como as
// caricaturas: aquelas são 35 pessoas reais, estas são nossas. O campo `mascot` diz qual.
// `levelReq` (opcional) é o nível MÍNIMO para comprar: quem valida é POST /api/skins/:id/buy, e o
// `seedSkins` do migrate replica a coluna para o banco. Ids nunca mudam (o banco guarda o que cada um comprou).
// @ts-check
export const RARITY_LABELS={"free":"Grátis","common":"Comum","rare":"Raro","epic":"Épico","legendary":"Lendário","earned":"Conquista","secret":"Secreto"};
export const RARITY_ORDER=["free","common","rare","epic","legendary","earned","secret"];
export const RARITY_COLORS={"free":"#aaaaaa","common":"#88ccff","rare":"#44aaff","epic":"#aa44ff","legendary":"#ffcc00","earned":"#44ffaa","secret":"#ff4488"};
/** @type {Array<{id:number,name:string,emoji:string,rarity:string,price:number,color:string,ring:boolean,glow:string,desc:string,pattern?:string,accent?:string,unlockKey?:string,levelReq?:number,face?:string,mascot?:string}>} */
export const SKINS=[
  {"id": 0, "name": "Planeta Padrão", "emoji": "🪐", "rarity": "free", "price": 0, "color": "#4ECDC4", "ring": false, "glow": "#4ECDC4", "desc": "Seu ponto de partida", "pattern": "clouds", "accent": "#a9f3ec"},
  {"id": 1, "name": "Marte", "emoji": "🔴", "rarity": "common", "price": 200, "color": "#c1440e", "ring": false, "glow": "#ff6644", "desc": "O planeta vermelho", "pattern": "craters", "accent": "#e07a4a"},
  {"id": 2, "name": "Netuno", "emoji": "🔵", "rarity": "common", "price": 200, "color": "#4060c8", "ring": false, "glow": "#6080ff", "desc": "Azul profundo", "pattern": "storm", "accent": "#8fd0ff"},
  {"id": 3, "name": "Vênus", "emoji": "🟡", "rarity": "common", "price": 250, "color": "#e8c87a", "ring": false, "glow": "#ffdd88", "desc": "Dourado nebuloso", "pattern": "clouds", "accent": "#fff0c0"},
  {"id": 4, "name": "Mercúrio", "emoji": "⚫", "rarity": "common", "price": 200, "color": "#9090a8", "ring": false, "glow": "#aaaacc", "desc": "Cinzento rochoso", "pattern": "craters", "accent": "#c9c9dd"},
  {"id": 5, "name": "Júpiter", "emoji": "🟠", "rarity": "common", "price": 300, "color": "#c88c5a", "ring": false, "glow": "#ffaa66", "desc": "O gigante das listras", "pattern": "stripes", "accent": "#d1442f"},
  {"id": 6, "name": "Terra", "emoji": "🌍", "rarity": "common", "price": 300, "color": "#4a9eff", "ring": false, "glow": "#44aaff", "desc": "Lar doce lar", "pattern": "continents", "accent": "#46c46b"},
  {"id": 7, "name": "Lua", "emoji": "🌕", "rarity": "common", "price": 150, "color": "#d0d0d8", "ring": false, "glow": "#eeeeff", "desc": "Satélite clássico", "pattern": "craters", "accent": "#f0f0ff"},
  {"id": 8, "name": "Cometa", "emoji": "☄️", "rarity": "common", "price": 250, "color": "#88ccff", "ring": false, "glow": "#aaddff", "desc": "Velocidade cósmica", "pattern": "sparkle", "accent": "#ffffff"},
  {"id": 9, "name": "Asteroide", "emoji": "🪨", "rarity": "common", "price": 200, "color": "#886644", "ring": false, "glow": "#aa8866", "desc": "Rocha espacial", "pattern": "craters", "accent": "#c0a080"},
  {"id": 10, "name": "Saturno", "emoji": "💛", "rarity": "rare", "price": 600, "color": "#c8a060", "ring": true, "glow": "#ffcc66", "desc": "Com anel dourado", "pattern": "stripes", "accent": "#e8d29a"},
  {"id": 11, "name": "Urano", "emoji": "🩵", "rarity": "rare", "price": 700, "color": "#7ab8d4", "ring": true, "glow": "#88ddff", "desc": "Gigante de gelo", "pattern": "clouds", "accent": "#dff4ff"},
  {"id": 12, "name": "Estrela Cadente", "emoji": "🌠", "rarity": "rare", "price": 800, "color": "#ffffaa", "ring": false, "glow": "#ffffff", "desc": "Faísca do universo", "pattern": "sparkle", "accent": "#ffffff"},
  {"id": 13, "name": "Nebulosa Rosa", "emoji": "🌸", "rarity": "rare", "price": 750, "color": "#ff88bb", "ring": false, "glow": "#ffaad0", "desc": "Nuvem cósmica", "pattern": "nebula", "accent": "#ffd0e8"},
  {"id": 14, "name": "Nebulosa Verde", "emoji": "💚", "rarity": "rare", "price": 750, "color": "#44dd88", "ring": false, "glow": "#66ffaa", "desc": "Gás esmeralda", "pattern": "nebula", "accent": "#baffd8"},
  {"id": 15, "name": "Pulsar", "emoji": "⚡", "rarity": "rare", "price": 900, "color": "#ddff44", "ring": false, "glow": "#eeff66", "desc": "Emite energia", "pattern": "plasma", "accent": "#ffffff"},
  {"id": 16, "name": "Anã Branca", "emoji": "⭐", "rarity": "rare", "price": 850, "color": "#eeeeff", "ring": false, "glow": "#ffffff", "desc": "Núcleo estelar", "pattern": "plasma", "accent": "#cfe6ff"},
  {"id": 17, "name": "Planeta Gelo", "emoji": "🧊", "rarity": "rare", "price": 700, "color": "#aaddff", "ring": false, "glow": "#cceeFF", "desc": "Congelado no espaço", "pattern": "ice", "accent": "#ffffff"},
  {"id": 18, "name": "Planeta Lava", "emoji": "🌋", "rarity": "rare", "price": 800, "color": "#ff4422", "ring": false, "glow": "#ff6600", "desc": "Fervendo de energia", "pattern": "lava", "accent": "#ffcc33"},
  {"id": 19, "name": "Planeta Veneno", "emoji": "☠️", "rarity": "rare", "price": 700, "color": "#88ff44", "ring": false, "glow": "#aaff66", "desc": "Venenoso e letal", "pattern": "poison", "accent": "#3fbf2f"},
  {"id": 20, "name": "Buraco Negro", "emoji": "🕳️", "rarity": "epic", "price": 1500, "color": "#110022", "ring": true, "glow": "#aa00ff", "desc": "Absorve tudo", "pattern": "void", "accent": "#aa00ff"},
  {"id": 21, "name": "Quasar", "emoji": "🔮", "rarity": "epic", "price": 2000, "color": "#cc44ff", "ring": false, "glow": "#ee66ff", "desc": "Núcleo galáctico", "pattern": "plasma", "accent": "#ffe6ff"},
  {"id": 22, "name": "Supernova", "emoji": "💥", "rarity": "epic", "price": 2500, "color": "#ff8800", "ring": false, "glow": "#ffcc00", "desc": "Explosão estelar", "pattern": "plasma", "accent": "#fff2a0"},
  {"id": 23, "name": "Planeta Cristal", "emoji": "💎", "rarity": "epic", "price": 1800, "color": "#88eeff", "ring": false, "glow": "#aaffff", "desc": "Translúcido e raro", "pattern": "crystal", "accent": "#ffffff"},
  {"id": 24, "name": "Planeta Sombra", "emoji": "🌑", "rarity": "epic", "price": 1600, "color": "#222244", "ring": false, "glow": "#4444aa", "desc": "Escuridão total", "pattern": "nebula", "accent": "#5b5bd6"},
  {"id": 25, "name": "Estrela Nêutron", "emoji": "💫", "rarity": "epic", "price": 2200, "color": "#ffffff", "ring": false, "glow": "#88aaff", "desc": "Ultra-densa e rápida", "pattern": "swirl", "accent": "#88aaff"},
  {"id": 26, "name": "Planeta Aurora", "emoji": "🌌", "rarity": "epic", "price": 1700, "color": "#44ffcc", "ring": false, "glow": "#88ffee", "desc": "Luzes polares", "pattern": "aurora", "accent": "#b388ff"},
  {"id": 27, "name": "Planeta Tempestade", "emoji": "🌀", "rarity": "epic", "price": 1900, "color": "#6688cc", "ring": false, "glow": "#88aaff", "desc": "Furacão eterno", "pattern": "storm", "accent": "#d8e8ff"},
  {"id": 28, "name": "Anã Vermelha", "emoji": "❤️", "rarity": "epic", "price": 1600, "color": "#cc2200", "ring": false, "glow": "#ff4400", "desc": "Estrela em brasa", "pattern": "plasma", "accent": "#ff8844"},
  {"id": 29, "name": "Planeta Fantasma", "emoji": "👻", "rarity": "epic", "price": 2000, "color": "#eeeeff", "ring": false, "glow": "#aaaaff", "desc": "Semitransparente", "pattern": "nebula", "accent": "#aaaaff"},
  {"id": 30, "name": "Galáxia", "emoji": "🌌", "rarity": "legendary", "price": 5000, "color": "#cc88ff", "ring": true, "glow": "#ff88ff", "desc": "Uma galáxia inteira", "pattern": "galaxy", "accent": "#ff9ce8"},
  {"id": 31, "name": "Big Bang", "emoji": "✨", "rarity": "legendary", "price": 8000, "color": "#ffffff", "ring": false, "glow": "#ffffff", "desc": "O início de tudo", "pattern": "sparkle", "accent": "#ffd24a"},
  {"id": 32, "name": "Universo", "emoji": "🔭", "rarity": "legendary", "price": 10000, "color": "#000088", "ring": true, "glow": "#0044ff", "desc": "Contém tudo", "pattern": "galaxy", "accent": "#66aaff"},
  {"id": 33, "name": "Deus Cósmico", "emoji": "👁️", "rarity": "legendary", "price": 15000, "color": "#ffdd00", "ring": true, "glow": "#ffff00", "desc": "Além da compreensão", "pattern": "eye", "accent": "#6b3fd6"},
  {"id": 34, "name": "Dragão Estelar", "emoji": "🐉", "rarity": "legendary", "price": 7000, "color": "#ff4400", "ring": false, "glow": "#ff8800", "desc": "Lenda do cosmos", "pattern": "scales", "accent": "#ffcc33"},
  {"id": 35, "name": "Sobrevivente", "emoji": "🛡️", "rarity": "earned", "price": 0, "color": "#44aa88", "ring": false, "glow": "#66ccaa", "desc": "Sobreviva 5 min", "pattern": "metal", "accent": "#cfe6dd", "unlockKey": "survive.b"},
  {"id": 36, "name": "Devorador", "emoji": "👅", "rarity": "earned", "price": 0, "color": "#ff6644", "ring": false, "glow": "#ff8866", "desc": "Coma 50 inimigos", "pattern": "swirl", "accent": "#ffd0c0", "unlockKey": "eat.b"},
  {"id": 37, "name": "Massivo", "emoji": "⚖️", "rarity": "earned", "price": 0, "color": "#ddaa44", "ring": false, "glow": "#ffcc66", "desc": "Massa ≥ 5.000", "pattern": "stripes", "accent": "#fff0c0", "unlockKey": "mass.b"},
  {"id": 38, "name": "Divisor", "emoji": "✂️", "rarity": "earned", "price": 0, "color": "#88aaff", "ring": false, "glow": "#aaccff", "desc": "Divida 100 vezes", "pattern": "checker", "accent": "#dfe8ff", "unlockKey": "split.b"},
  {"id": 39, "name": "Campeão", "emoji": "🏆", "rarity": "earned", "price": 0, "color": "#ffcc00", "ring": true, "glow": "#ffee44", "desc": "Nº1 por 3 minutos", "pattern": "metal", "accent": "#fff0b0", "unlockKey": "top1.b"},
  {"id": 40, "name": "Veterano", "emoji": "🎖️", "rarity": "earned", "price": 0, "color": "#cc8844", "ring": false, "glow": "#ddaa66", "desc": "10 partidas jogadas", "pattern": "metal", "accent": "#f0d0a0", "unlockKey": "games.b"},
  {"id": 41, "name": "Caçador", "emoji": "🎯", "rarity": "earned", "price": 0, "color": "#ff4488", "ring": false, "glow": "#ff66aa", "desc": "Coma 10 bots", "pattern": "rings2", "accent": "#ffd0e0", "unlockKey": "hunt.b"},
  {"id": 42, "name": "Ejector", "emoji": "💨", "rarity": "earned", "price": 0, "color": "#44ccff", "ring": false, "glow": "#66eeff", "desc": "Ejete 200 vezes", "pattern": "swirl", "accent": "#d0f4ff", "unlockKey": "eject.b"},
  {"id": 43, "name": "Explorador", "emoji": "🗺️", "rarity": "earned", "price": 0, "color": "#88cc44", "ring": false, "glow": "#aaee66", "desc": "Explore todo o mapa", "pattern": "continents", "accent": "#d8b271", "unlockKey": "explore.b"},
  {"id": 44, "name": "Imparável", "emoji": "🌪️", "rarity": "earned", "price": 0, "color": "#cc44ff", "ring": false, "glow": "#ee66ff", "desc": "5 abates sem morrer", "pattern": "storm", "accent": "#ffd0ff", "unlockKey": "streak.b"},
  {"id": 45, "name": "???", "emoji": "❓", "rarity": "secret", "price": 0, "color": "#333355", "ring": false, "glow": "#555588", "desc": "Segredo oculto", "pattern": "plain", "unlockKey": "secret1"},
  {"id": 46, "name": "???", "emoji": "❓", "rarity": "secret", "price": 0, "color": "#333355", "ring": false, "glow": "#555588", "desc": "Segredo oculto", "pattern": "plain", "unlockKey": "secret2"},
  {"id": 47, "name": "???", "emoji": "❓", "rarity": "secret", "price": 0, "color": "#333355", "ring": false, "glow": "#555588", "desc": "Segredo oculto", "pattern": "plain", "unlockKey": "secret3"},
  {"id": 48, "name": "???", "emoji": "❓", "rarity": "secret", "price": 0, "color": "#333355", "ring": false, "glow": "#555588", "desc": "Segredo oculto", "pattern": "plain", "unlockKey": "secret4"},
  {"id": 49, "name": "Lenda Suprema", "emoji": "🌟", "rarity": "legendary", "price": 20000, "color": "#ffff88", "ring": true, "glow": "#ffffff", "desc": "O mais raro de todos", "pattern": "sparkle", "accent": "#ffffff"},
  {"id": 50, "name": "Titã", "emoji": "🌫️", "rarity": "rare", "price": 700, "color": "#d9a441", "ring": false, "glow": "#ffd88a", "desc": "Lua de metano e névoa", "pattern": "clouds", "accent": "#ffe3a8"},
  {"id": 51, "name": "Europa", "emoji": "🧊", "rarity": "rare", "price": 750, "color": "#dfe8f5", "ring": false, "glow": "#bcd8ff", "desc": "Oceano sob o gelo", "pattern": "ice", "accent": "#7fb3ff"},
  {"id": 52, "name": "Io", "emoji": "🌋", "rarity": "rare", "price": 800, "color": "#ffd257", "ring": false, "glow": "#ffb020", "desc": "Vulcões sem descanso", "pattern": "lava", "accent": "#ff6a2a"},
  {"id": 53, "name": "Plutão", "emoji": "🤍", "rarity": "rare", "price": 650, "color": "#c9b7a8", "ring": false, "glow": "#e8dcd0", "desc": "Pequeno e teimoso", "pattern": "craters", "accent": "#8f7d70"},
  {"id": 54, "name": "Anel Duplo", "emoji": "💫", "rarity": "rare", "price": 900, "color": "#9fd3ff", "ring": true, "glow": "#d8f0ff", "desc": "Dois anéis, um planeta", "pattern": "rings2", "accent": "#ffffff"},
  {"id": 55, "name": "Xadrez Cósmico", "emoji": "♟️", "rarity": "rare", "price": 700, "color": "#e8e8e8", "ring": false, "glow": "#ffffff", "desc": "Vitória em oito casas", "pattern": "checker", "accent": "#333355"},
  {"id": 56, "name": "Recife Estelar", "emoji": "🐚", "rarity": "rare", "price": 850, "color": "#2fd6b4", "ring": false, "glow": "#7dffe4", "desc": "Corais que brilham no vácuo", "pattern": "nebula", "accent": "#ffd6a0"},
  {"id": 57, "name": "Cinturão de Ferro", "emoji": "⛓️", "rarity": "rare", "price": 900, "color": "#8d99ae", "ring": false, "glow": "#c8d4e6", "desc": "Casco de aço frio", "pattern": "metal", "accent": "#d8e2ef"},
  {"id": 58, "name": "Planeta Girassol", "emoji": "🌻", "rarity": "epic", "price": 1500, "color": "#ffc93c", "ring": false, "glow": "#ffe98a", "desc": "Sempre virado para a luz", "pattern": "plasma", "accent": "#ff8a3d"},
  {"id": 59, "name": "Tempestade Elétrica", "emoji": "🌩️", "rarity": "epic", "price": 1700, "color": "#4a4e8c", "ring": false, "glow": "#8f9bff", "desc": "Raios que não param", "pattern": "storm", "accent": "#ffe14a"},
  {"id": 60, "name": "Coração Púrpura", "emoji": "💜", "rarity": "epic", "price": 1600, "color": "#8b46d6", "ring": false, "glow": "#c98aff", "desc": "Bate no ritmo do cosmos", "pattern": "aurora", "accent": "#ff8ad6"},
  {"id": 61, "name": "Mundo Espelho", "emoji": "🪞", "rarity": "epic", "price": 1900, "color": "#cfd8e3", "ring": false, "glow": "#ffffff", "desc": "Reflete quem te olha", "pattern": "crystal", "accent": "#ffffff"},
  {"id": 62, "name": "Serpente Solar", "emoji": "🐍", "rarity": "epic", "price": 2000, "color": "#ff7a3d", "ring": false, "glow": "#ffb070", "desc": "Escamas de fogo", "pattern": "scales", "accent": "#ffd24a"},
  {"id": 63, "name": "Olho do Abismo", "emoji": "👁️‍🗨️", "rarity": "epic", "price": 2400, "color": "#1b2a4a", "ring": false, "glow": "#37d6c1", "desc": "Ele te viu primeiro", "pattern": "eye", "accent": "#37d6c1"},
  {"id": 64, "name": "Jardim Suspenso", "emoji": "🌿", "rarity": "epic", "price": 1800, "color": "#3fbf6f", "ring": false, "glow": "#8fe8a8", "desc": "Vida onde ninguém esperava", "pattern": "continents", "accent": "#2a7a4a"},
  {"id": 65, "name": "Vórtice Gelado", "emoji": "❄️", "rarity": "epic", "price": 2100, "color": "#7fd6ff", "ring": false, "glow": "#d8f4ff", "desc": "Um furacão congelado", "pattern": "swirl", "accent": "#ffffff"},
  {"id": 66, "name": "Núcleo Fundido", "emoji": "🔥", "rarity": "epic", "price": 2300, "color": "#ff4d2a", "ring": false, "glow": "#ff9a4a", "desc": "Rachado por dentro", "pattern": "lava", "accent": "#ffe14a"},
  {"id": 67, "name": "Constelação", "emoji": "🔯", "rarity": "epic", "price": 1900, "color": "#2b2a6b", "ring": false, "glow": "#8f9bff", "desc": "Um mapa do céu", "pattern": "sparkle", "accent": "#ffe98a"},
  {"id": 68, "name": "Nebulosa Dourada", "emoji": "🥇", "rarity": "legendary", "price": 5000, "color": "#ffcf4a", "ring": false, "glow": "#fff0a0", "desc": "Poeira que virou ouro", "pattern": "nebula", "accent": "#ff7a3d"},
  {"id": 69, "name": "Espiral Prateada", "emoji": "🌪️", "rarity": "legendary", "price": 6000, "color": "#dfe6ef", "ring": true, "glow": "#ffffff", "desc": "Braços de prata girando", "pattern": "galaxy", "accent": "#7fb3ff"},
  {"id": 70, "name": "Coroa Solar", "emoji": "👑", "rarity": "legendary", "price": 9000, "color": "#ffb02e", "ring": true, "glow": "#ffe9a8", "desc": "A coroa de uma estrela", "pattern": "plasma", "accent": "#fff6c9"},
  {"id": 71, "name": "Aurora Eterna", "emoji": "🎆", "rarity": "legendary", "price": 12000, "color": "#35e0c0", "ring": true, "glow": "#a8fff0", "desc": "A noite que nunca apaga", "pattern": "aurora", "accent": "#b388ff"},
  {"id": 72, "name": "Dragão de Obsidiana", "emoji": "🐲", "rarity": "legendary", "price": 16000, "color": "#241a3a", "ring": false, "glow": "#ff4d2a", "desc": "Escamas de vidro vulcânico", "pattern": "scales", "accent": "#ff4d2a"},
  {"id": 73, "name": "Sentinela", "emoji": "⚔️", "rarity": "earned", "price": 0, "color": "#6b8cff", "ring": false, "glow": "#b8caff", "desc": "Sobreviva 10 min numa vida", "pattern": "metal", "accent": "#dfe8ff", "unlockKey": "survive.s"},
  {"id": 74, "name": "Colosso", "emoji": "🗿", "rarity": "earned", "price": 0, "color": "#a8b0c0", "ring": false, "glow": "#dfe4ee", "desc": "Alcance massa 10.000", "pattern": "craters", "accent": "#6b7488", "unlockKey": "mass.s"},
  {"id": 75, "name": "Cinturão de Órion", "emoji": "🎽", "rarity": "legendary", "price": 6000, "levelReq": 10, "color": "#2a2f6b", "ring": false, "glow": "#ffe98a", "desc": "Três estrelas em fila", "pattern": "belt", "accent": "#ffe98a"},
  {"id": 76, "name": "Coração de Magma", "emoji": "🌋", "rarity": "legendary", "price": 8000, "levelReq": 15, "color": "#1c0d0d", "ring": false, "glow": "#ff5a1f", "desc": "Racha de dentro para fora", "pattern": "magma", "accent": "#ff5a1f"},
  {"id": 77, "name": "Prisma Quântico", "emoji": "🔷", "rarity": "legendary", "price": 10000, "levelReq": 20, "color": "#0e1030", "ring": false, "glow": "#7cf5ff", "desc": "Seis faces, uma luz", "pattern": "prism", "accent": "#7cf5ff"},
  {"id": 78, "name": "Anéis de Vênus", "emoji": "💫", "rarity": "legendary", "price": 12000, "levelReq": 25, "color": "#e8c87a", "ring": true, "glow": "#fff0c0", "desc": "Três luas em órbita", "pattern": "orbits", "accent": "#fff0c0"},
  {"id": 79, "name": "Maré Abissal", "emoji": "🌊", "rarity": "legendary", "price": 14000, "levelReq": 30, "color": "#04263f", "ring": false, "glow": "#37d6c1", "desc": "O oceano que não tem fundo", "pattern": "tide", "accent": "#37d6c1"},
  {"id": 80, "name": "Coroa de Ferro", "emoji": "⚙️", "rarity": "legendary", "price": 16000, "levelReq": 35, "color": "#3a3f4d", "ring": false, "glow": "#c8d4e6", "desc": "Pesada de usar", "pattern": "crown", "accent": "#c8d4e6"},
  {"id": 81, "name": "Fênix Solar", "emoji": "🔥", "rarity": "legendary", "price": 20000, "levelReq": 40, "color": "#ff7a1f", "ring": false, "glow": "#fff3c0", "desc": "Renasce toda rodada", "pattern": "phoenix", "accent": "#fff3c0"},
  {"id": 82, "name": "Singularidade", "emoji": "🕳️", "rarity": "legendary", "price": 30000, "levelReq": 50, "color": "#0a0612", "ring": true, "glow": "#c56bff", "desc": "O fim de todas as órbitas", "pattern": "singular", "accent": "#c56bff"},
  {"id": 83, "name": "Retrato", "emoji": "🖼️", "rarity": "legendary", "price": 25000, "levelReq": 30, "color": "#2b2540", "ring": true, "glow": "#ffd479", "desc": "Sua foto dentro do planeta", "pattern": "avatar", "accent": "#ffd479"},
  {"id": 84, "name": "Trump", "emoji": "🇺🇸", "rarity": "secret", "price": 0, "color": "#e8a05a", "ring": false, "glow": "#f2d16b", "desc": "Segredo oculto", "pattern": "face", "face": "01_trump", "accent": "#f2d16b"},
  {"id": 85, "name": "Bruxo", "emoji": "🪄", "rarity": "secret", "price": 0, "color": "#7a4a2a", "ring": false, "glow": "#2ecc71", "desc": "Segredo oculto", "pattern": "face", "face": "02_ronaldinho", "accent": "#2ecc71"},
  {"id": 86, "name": "Lula", "emoji": "🇧🇷", "rarity": "secret", "price": 0, "color": "#d9b48a", "ring": false, "glow": "#e03b3b", "desc": "Segredo oculto", "pattern": "face", "face": "05_lula", "accent": "#e03b3b"},
  {"id": 87, "name": "Bolsonaro", "emoji": "🫡", "rarity": "secret", "price": 0, "color": "#d9b48a", "ring": false, "glow": "#1f8a4c", "desc": "Segredo oculto", "pattern": "face", "face": "06_bolsonaro", "accent": "#1f8a4c"},
  {"id": 88, "name": "Putin", "emoji": "🇷🇺", "rarity": "secret", "price": 0, "color": "#e2cdbd", "ring": false, "glow": "#b03030", "desc": "Segredo oculto", "pattern": "face", "face": "07_putin", "accent": "#b03030"},
  {"id": 89, "name": "Milei", "emoji": "🇦🇷", "rarity": "secret", "price": 0, "color": "#dcb894", "ring": false, "glow": "#6fc3e8", "desc": "Segredo oculto", "pattern": "face", "face": "08_milei", "accent": "#6fc3e8"},
  {"id": 90, "name": "Macron", "emoji": "🇫🇷", "rarity": "secret", "price": 0, "color": "#e3c3a6", "ring": false, "glow": "#2b4bd0", "desc": "Segredo oculto", "pattern": "face", "face": "09_macron", "accent": "#2b4bd0"},
  {"id": 91, "name": "Xi Jinping", "emoji": "🇨🇳", "rarity": "secret", "price": 0, "color": "#e6c9a3", "ring": false, "glow": "#d81f26", "desc": "Segredo oculto", "pattern": "face", "face": "10_xi_jinping", "accent": "#d81f26"},
  {"id": 92, "name": "Modi", "emoji": "🇮🇳", "rarity": "secret", "price": 0, "color": "#c08a5a", "ring": false, "glow": "#ff9933", "desc": "Segredo oculto", "pattern": "face", "face": "11_modi", "accent": "#ff9933"},
  {"id": 93, "name": "Zelensky", "emoji": "🇺🇦", "rarity": "secret", "price": 0, "color": "#d8b394", "ring": false, "glow": "#ffd700", "desc": "Segredo oculto", "pattern": "face", "face": "12_zelensky", "accent": "#ffd700"},
  {"id": 94, "name": "Pelé", "emoji": "🐐", "rarity": "secret", "price": 0, "color": "#3a2418", "ring": false, "glow": "#f5d90a", "desc": "Segredo oculto", "pattern": "face", "face": "03_pele", "accent": "#f5d90a"},
  {"id": 95, "name": "Maradona", "emoji": "✋", "rarity": "secret", "price": 0, "color": "#2a1c12", "ring": false, "glow": "#74acdf", "desc": "Segredo oculto", "pattern": "face", "face": "04_maradona", "accent": "#74acdf"},
  {"id": 96, "name": "CR7", "emoji": "🇵🇹", "rarity": "secret", "price": 0, "color": "#2b2018", "ring": false, "glow": "#2ecc71", "desc": "Segredo oculto", "pattern": "face", "face": "13_cristiano_ronaldo", "accent": "#2ecc71"},
  {"id": 97, "name": "Haaland", "emoji": "🇳🇴", "rarity": "secret", "price": 0, "color": "#e8d8a8", "ring": false, "glow": "#9bd94a", "desc": "Segredo oculto", "pattern": "face", "face": "14_haaland", "accent": "#9bd94a"},
  {"id": 98, "name": "Messi", "emoji": "🐐", "rarity": "secret", "price": 0, "color": "#2f2218", "ring": false, "glow": "#4fc3f7", "desc": "Segredo oculto", "pattern": "face", "face": "15_messi", "accent": "#4fc3f7"},
  {"id": 99, "name": "LeBron", "emoji": "🏀", "rarity": "secret", "price": 0, "color": "#3a2a1e", "ring": false, "glow": "#f2f2f2", "desc": "Segredo oculto", "pattern": "face", "face": "16_lebron_james", "accent": "#f2f2f2"},
  {"id": 100, "name": "Michael Jackson", "emoji": "🕺", "rarity": "secret", "price": 0, "color": "#1e1a26", "ring": false, "glow": "#8e5cff", "desc": "Segredo oculto", "pattern": "face", "face": "17_michael_jackson", "accent": "#8e5cff"},
  {"id": 101, "name": "Madonna", "emoji": "🎤", "rarity": "secret", "price": 0, "color": "#e8c98a", "ring": false, "glow": "#ff6bb5", "desc": "Segredo oculto", "pattern": "face", "face": "18_madonna", "accent": "#ff6bb5"},
  {"id": 102, "name": "Fenômeno", "emoji": "⚽", "rarity": "secret", "price": 0, "color": "#3a2a1e", "ring": false, "glow": "#ffd54a", "desc": "Segredo oculto", "pattern": "face", "face": "19_ronaldo_fenomeno", "accent": "#ffd54a"},
  {"id": 103, "name": "Luva de Pedreiro", "emoji": "🧤", "rarity": "secret", "price": 0, "color": "#3a2a1e", "ring": false, "glow": "#f5d90a", "desc": "Segredo oculto", "pattern": "face", "face": "20_luva_de_pedreiro", "accent": "#f5d90a"},
  {"id": 104, "name": "Neymar", "emoji": "🇧🇷", "rarity": "secret", "price": 0, "color": "#3a2a1e", "ring": false, "glow": "#f5d90a", "desc": "Segredo oculto", "pattern": "face", "face": "21_neymar", "accent": "#f5d90a"},
  {"id": 105, "name": "Snoop Dogg", "emoji": "🎤", "rarity": "secret", "price": 0, "color": "#2a1e18", "ring": false, "glow": "#3ddc5f", "desc": "Segredo oculto", "pattern": "face", "face": "22_snoop_dogg", "accent": "#3ddc5f"},
  {"id": 106, "name": "Eminem", "emoji": "🎧", "rarity": "secret", "price": 0, "color": "#e8d8c8", "ring": false, "glow": "#b9c4d4", "desc": "Segredo oculto", "pattern": "face", "face": "23_eminem", "accent": "#b9c4d4"},
  {"id": 107, "name": "2Pac", "emoji": "💿", "rarity": "secret", "price": 0, "color": "#4a3324", "ring": false, "glow": "#ffc22e", "desc": "Segredo oculto", "pattern": "face", "face": "24_2pac", "accent": "#ffc22e"},
  {"id": 108, "name": "Jim Morrison", "emoji": "🎸", "rarity": "secret", "price": 0, "color": "#3a2a1e", "ring": false, "glow": "#c56bff", "desc": "Segredo oculto", "pattern": "face", "face": "25_jim_morrison", "accent": "#c56bff"},
  {"id": 109, "name": "Jordan", "emoji": "🏀", "rarity": "secret", "price": 0, "color": "#3a2a1e", "ring": false, "glow": "#e03b3b", "desc": "Segredo oculto", "pattern": "face", "face": "26_michael_jordan", "accent": "#e03b3b"},
  {"id": 110, "name": "Bieber", "emoji": "🎙️", "rarity": "secret", "price": 0, "color": "#e8d0b0", "ring": false, "glow": "#7fa8ff", "desc": "Segredo oculto", "pattern": "face", "face": "27_justin_bieber", "accent": "#7fa8ff"},
  {"id": 111, "name": "Lincoln", "emoji": "🎩", "rarity": "secret", "price": 0, "color": "#2a2018", "ring": false, "glow": "#8a7a6a", "desc": "Segredo oculto", "pattern": "face", "face": "28_abraham_lincoln", "accent": "#8a7a6a"},
  {"id": 112, "name": "Elon Musk", "emoji": "🚀", "rarity": "secret", "price": 0, "color": "#e0c0a0", "ring": false, "glow": "#4fc3f7", "desc": "Segredo oculto", "pattern": "face", "face": "29_elon_musk", "accent": "#4fc3f7"},
  {"id": 113, "name": "Zuckerberg", "emoji": "💻", "rarity": "secret", "price": 0, "color": "#e8cfb8", "ring": false, "glow": "#2b4bd0", "desc": "Segredo oculto", "pattern": "face", "face": "30_mark_zuckerberg", "accent": "#2b4bd0"},
  {"id": 114, "name": "Senna", "emoji": "🏁", "rarity": "secret", "price": 0, "color": "#3a2a1e", "ring": false, "glow": "#f5d90a", "desc": "Segredo oculto", "pattern": "face", "face": "31_ayrton_senna", "accent": "#f5d90a"},
  {"id": 115, "name": "Schumacher", "emoji": "🏎️", "rarity": "secret", "price": 0, "color": "#e8cfb8", "ring": false, "glow": "#e03b3b", "desc": "Segredo oculto", "pattern": "face", "face": "32_michael_schumacher", "accent": "#e03b3b"},
  {"id": 116, "name": "Hamilton", "emoji": "🏆", "rarity": "secret", "price": 0, "color": "#4a3324", "ring": false, "glow": "#3ddc5f", "desc": "Segredo oculto", "pattern": "face", "face": "33_lewis_hamilton", "accent": "#3ddc5f"},
  {"id": 117, "name": "Churchill", "emoji": "🎖️", "rarity": "secret", "price": 0, "color": "#e8d0bc", "ring": false, "glow": "#b9c4d4", "desc": "Segredo oculto", "pattern": "face", "face": "34_winston_churchill", "accent": "#b9c4d4"},
  {"id": 118, "name": "Einstein", "emoji": "🧠", "rarity": "secret", "price": 0, "color": "#e8ded0", "ring": false, "glow": "#c56bff", "desc": "Segredo oculto", "pattern": "face", "face": "35_albert_einstein", "accent": "#c56bff"},
  {"id": 119, "name": "Marte Bravo", "emoji": "😡", "rarity": "epic", "price": 2100, "color": "#e8450a", "ring": false, "glow": "#ff7a3c", "desc": "O encrenqueiro vermelho", "pattern": "mascote", "mascot": "marte", "accent": "#8c2606"},
  {"id": 120, "name": "Terra Brava", "emoji": "🌍", "rarity": "epic", "price": 2100, "color": "#0a72cc", "ring": false, "glow": "#4fb4ff", "desc": "A encrenqueira azul", "pattern": "mascote", "mascot": "terra", "accent": "#2eae5a"},
  {"id": 121, "name": "Lua Soldado", "emoji": "🪖", "rarity": "epic", "price": 1900, "color": "#a8a8b2", "ring": false, "glow": "#e6e9f2", "desc": "De capacete e mau humor", "pattern": "mascote", "mascot": "lua", "accent": "#6e727e"}
];
export const SKIN_BY_ID=new Map(SKINS.map(s=>[s.id,s]));
export const skinById=id=>SKIN_BY_ID.get(id)||SKINS[0];
export const isPurchasable=s=>s.price>0&&!s.unlockKey;
/** Nível mínimo para comprar (0 = nenhum). */
export const levelReqOf=s=>(s&&s.levelReq)|0;
/** As skins resgatáveis assistindo um anúncio recompensado (hoje: as 3 mascote). Derivado do catálogo,
 *  não uma lista cravada em dois lugares — um mascote novo entra aqui sozinho. */
export const AD_REWARD_SKINS=SKINS.filter(s=>s.mascot).map(s=>s.id);
/** A conta nova sorteia UMA destas para nascer equipada (grátis + as 9 comuns, ids 0..9 — o mesmo
 *  conjunto que a loja mostra como "grátis"/"comum"). Derivado do catálogo pelo mesmo motivo de
 *  AD_REWARD_SKINS: uma skin nova nessa faixa entra sozinha, sem precisar editar dois lugares. */
export const STARTER_SKINS=SKINS.filter(s=>s.rarity==="free"||s.rarity==="common").map(s=>s.id);
/** Skin que o jogador nunca vê na loja (easter egg ou conquista secreta): não entra na conta de progresso. */
export const isHiddenSkin=s=>s.rarity==="secret";
