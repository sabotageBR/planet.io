// ── SKINS (fonte única: cliente renderiza, servidor valida preço/unlock) ──────
// @ts-check
export const RARITY_LABELS={"free":"Grátis","common":"Comum","rare":"Raro","epic":"Épico","legendary":"Lendário","earned":"Conquista","secret":"Secreto"};
export const RARITY_ORDER=["free","common","rare","epic","legendary","earned","secret"];
export const RARITY_COLORS={"free":"#aaaaaa","common":"#88ccff","rare":"#44aaff","epic":"#aa44ff","legendary":"#ffcc00","earned":"#44ffaa","secret":"#ff4488"};
/** @type {Array<{id:number,name:string,emoji:string,rarity:string,price:number,color:string,ring:boolean,glow:string,desc:string,unlockKey?:string}>} */
export const SKINS=[
  {"id":0,"name":"Planeta Padrão","emoji":"🪐","rarity":"free","price":0,"color":"#4ECDC4","ring":false,"glow":"#4ECDC4","desc":"Seu ponto de partida"},
  {"id":1,"name":"Marte","emoji":"🔴","rarity":"common","price":200,"color":"#c1440e","ring":false,"glow":"#ff6644","desc":"O planeta vermelho"},
  {"id":2,"name":"Netuno","emoji":"🔵","rarity":"common","price":200,"color":"#4060c8","ring":false,"glow":"#6080ff","desc":"Azul profundo"},
  {"id":3,"name":"Vênus","emoji":"🟡","rarity":"common","price":250,"color":"#e8c87a","ring":false,"glow":"#ffdd88","desc":"Dourado nebuloso"},
  {"id":4,"name":"Mercúrio","emoji":"⚫","rarity":"common","price":200,"color":"#9090a8","ring":false,"glow":"#aaaacc","desc":"Cinzento rochoso"},
  {"id":5,"name":"Júpiter","emoji":"🟠","rarity":"common","price":300,"color":"#c88c5a","ring":false,"glow":"#ffaa66","desc":"O gigante das listras"},
  {"id":6,"name":"Terra","emoji":"🌍","rarity":"common","price":300,"color":"#4a9eff","ring":false,"glow":"#44aaff","desc":"Lar doce lar"},
  {"id":7,"name":"Lua","emoji":"🌕","rarity":"common","price":150,"color":"#d0d0d8","ring":false,"glow":"#eeeeff","desc":"Satélite clássico"},
  {"id":8,"name":"Cometa","emoji":"☄️","rarity":"common","price":250,"color":"#88ccff","ring":false,"glow":"#aaddff","desc":"Velocidade cósmica"},
  {"id":9,"name":"Asteroide","emoji":"🪨","rarity":"common","price":200,"color":"#886644","ring":false,"glow":"#aa8866","desc":"Rocha espacial"},
  {"id":10,"name":"Saturno","emoji":"💛","rarity":"rare","price":600,"color":"#c8a060","ring":true,"glow":"#ffcc66","desc":"Com anel dourado"},
  {"id":11,"name":"Urano","emoji":"🩵","rarity":"rare","price":700,"color":"#7ab8d4","ring":true,"glow":"#88ddff","desc":"Gigante de gelo"},
  {"id":12,"name":"Estrela Cadente","emoji":"🌠","rarity":"rare","price":800,"color":"#ffffaa","ring":false,"glow":"#ffffff","desc":"Faísca do universo"},
  {"id":13,"name":"Nebulosa Rosa","emoji":"🌸","rarity":"rare","price":750,"color":"#ff88bb","ring":false,"glow":"#ffaad0","desc":"Nuvem cósmica"},
  {"id":14,"name":"Nebulosa Verde","emoji":"💚","rarity":"rare","price":750,"color":"#44dd88","ring":false,"glow":"#66ffaa","desc":"Gás esmeralda"},
  {"id":15,"name":"Pulsar","emoji":"⚡","rarity":"rare","price":900,"color":"#ddff44","ring":false,"glow":"#eeff66","desc":"Emite energia"},
  {"id":16,"name":"Anã Branca","emoji":"⭐","rarity":"rare","price":850,"color":"#eeeeff","ring":false,"glow":"#ffffff","desc":"Núcleo estelar"},
  {"id":17,"name":"Planeta Gelo","emoji":"🧊","rarity":"rare","price":700,"color":"#aaddff","ring":false,"glow":"#cceeFF","desc":"Congelado no espaço"},
  {"id":18,"name":"Planeta Lava","emoji":"🌋","rarity":"rare","price":800,"color":"#ff4422","ring":false,"glow":"#ff6600","desc":"Fervendo de energia"},
  {"id":19,"name":"Planeta Veneno","emoji":"☠️","rarity":"rare","price":700,"color":"#88ff44","ring":false,"glow":"#aaff66","desc":"Venenoso e letal"},
  {"id":20,"name":"Buraco Negro","emoji":"🕳️","rarity":"epic","price":1500,"color":"#110022","ring":true,"glow":"#aa00ff","desc":"Absorve tudo"},
  {"id":21,"name":"Quasar","emoji":"🔮","rarity":"epic","price":2000,"color":"#cc44ff","ring":false,"glow":"#ee66ff","desc":"Núcleo galáctico"},
  {"id":22,"name":"Supernova","emoji":"💥","rarity":"epic","price":2500,"color":"#ff8800","ring":false,"glow":"#ffcc00","desc":"Explosão estelar"},
  {"id":23,"name":"Planeta Cristal","emoji":"💎","rarity":"epic","price":1800,"color":"#88eeff","ring":false,"glow":"#aaffff","desc":"Translúcido e raro"},
  {"id":24,"name":"Planeta Sombra","emoji":"🌑","rarity":"epic","price":1600,"color":"#222244","ring":false,"glow":"#4444aa","desc":"Escuridão total"},
  {"id":25,"name":"Estrela Nêutron","emoji":"💫","rarity":"epic","price":2200,"color":"#ffffff","ring":false,"glow":"#88aaff","desc":"Ultra-densa e rápida"},
  {"id":26,"name":"Planeta Aurora","emoji":"🌌","rarity":"epic","price":1700,"color":"#44ffcc","ring":false,"glow":"#88ffee","desc":"Luzes polares"},
  {"id":27,"name":"Planeta Tempestade","emoji":"🌀","rarity":"epic","price":1900,"color":"#6688cc","ring":false,"glow":"#88aaff","desc":"Furacão eterno"},
  {"id":28,"name":"Anã Vermelha","emoji":"❤️","rarity":"epic","price":1600,"color":"#cc2200","ring":false,"glow":"#ff4400","desc":"Estrela em brasa"},
  {"id":29,"name":"Planeta Fantasma","emoji":"👻","rarity":"epic","price":2000,"color":"#eeeeff","ring":false,"glow":"#aaaaff","desc":"Semitransparente"},
  {"id":30,"name":"Galáxia","emoji":"🌌","rarity":"legendary","price":5000,"color":"#cc88ff","ring":true,"glow":"#ff88ff","desc":"Uma galáxia inteira"},
  {"id":31,"name":"Big Bang","emoji":"✨","rarity":"legendary","price":8000,"color":"#ffffff","ring":false,"glow":"#ffffff","desc":"O início de tudo"},
  {"id":32,"name":"Universo","emoji":"🔭","rarity":"legendary","price":10000,"color":"#000088","ring":true,"glow":"#0044ff","desc":"Contém tudo"},
  {"id":33,"name":"Deus Cósmico","emoji":"👁️","rarity":"legendary","price":15000,"color":"#ffdd00","ring":true,"glow":"#ffff00","desc":"Além da compreensão"},
  {"id":34,"name":"Dragão Estelar","emoji":"🐉","rarity":"legendary","price":7000,"color":"#ff4400","ring":false,"glow":"#ff8800","desc":"Lenda do cosmos"},
  {"id":35,"name":"Sobrevivente","emoji":"🛡️","rarity":"earned","price":0,"unlockKey":"survive5","color":"#44aa88","ring":false,"glow":"#66ccaa","desc":"Sobreviva 5 min"},
  {"id":36,"name":"Devorador","emoji":"👅","rarity":"earned","price":0,"unlockKey":"eat50","color":"#ff6644","ring":false,"glow":"#ff8866","desc":"Coma 50 inimigos"},
  {"id":37,"name":"Massivo","emoji":"⚖️","rarity":"earned","price":0,"unlockKey":"mass5000","color":"#ddaa44","ring":false,"glow":"#ffcc66","desc":"Massa ≥ 5.000"},
  {"id":38,"name":"Divisor","emoji":"✂️","rarity":"earned","price":0,"unlockKey":"split100","color":"#88aaff","ring":false,"glow":"#aaccff","desc":"Divida 100 vezes"},
  {"id":39,"name":"Campeão","emoji":"🏆","rarity":"earned","price":0,"unlockKey":"top1_3min","color":"#ffcc00","ring":true,"glow":"#ffee44","desc":"Nº1 por 3 minutos"},
  {"id":40,"name":"Veterano","emoji":"🎖️","rarity":"earned","price":0,"unlockKey":"games10","color":"#cc8844","ring":false,"glow":"#ddaa66","desc":"10 partidas jogadas"},
  {"id":41,"name":"Caçador","emoji":"🎯","rarity":"earned","price":0,"unlockKey":"eatbots10","color":"#ff4488","ring":false,"glow":"#ff66aa","desc":"Coma 10 bots"},
  {"id":42,"name":"Ejector","emoji":"💨","rarity":"earned","price":0,"unlockKey":"eject200","color":"#44ccff","ring":false,"glow":"#66eeff","desc":"Ejete 200 vezes"},
  {"id":43,"name":"Explorador","emoji":"🗺️","rarity":"earned","price":0,"unlockKey":"explore4","color":"#88cc44","ring":false,"glow":"#aaee66","desc":"Explore todo o mapa"},
  {"id":44,"name":"Imparável","emoji":"🌪️","rarity":"earned","price":0,"unlockKey":"streak5","color":"#cc44ff","ring":false,"glow":"#ee66ff","desc":"5 abates sem morrer"},
  {"id":45,"name":"???","emoji":"❓","rarity":"secret","price":0,"unlockKey":"secret1","color":"#333355","ring":false,"glow":"#555588","desc":"Segredo oculto"},
  {"id":46,"name":"???","emoji":"❓","rarity":"secret","price":0,"unlockKey":"secret2","color":"#333355","ring":false,"glow":"#555588","desc":"Segredo oculto"},
  {"id":47,"name":"???","emoji":"❓","rarity":"secret","price":0,"unlockKey":"secret3","color":"#333355","ring":false,"glow":"#555588","desc":"Segredo oculto"},
  {"id":48,"name":"???","emoji":"❓","rarity":"secret","price":0,"unlockKey":"secret4","color":"#333355","ring":false,"glow":"#555588","desc":"Segredo oculto"},
  {"id":49,"name":"Lenda Suprema","emoji":"🌟","rarity":"legendary","price":20000,"color":"#ffff88","ring":true,"glow":"#ffffff","desc":"O mais raro de todos"}
];
export const SKIN_BY_ID=new Map(SKINS.map(s=>[s.id,s]));
export const skinById=id=>SKIN_BY_ID.get(id)||SKINS[0];
export const isPurchasable=s=>s.price>0&&!s.unlockKey;
