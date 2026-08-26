// ── DADOS FALSOS (determinísticos) ────────────────────────────────────────────
// Mesmos dados em todos os modelos: a comparação é só de layout/visual.
// SKINS = tabela real do jogo (client/game.js). O resto é maquete.
window.MOCKDATA=(function(){
const SKINS=[
  {id:0,name:"Planeta Padrão",emoji:"🪐",rarity:"free",price:0,color:"#4ECDC4",ring:false,glow:"#4ECDC4",desc:"Seu ponto de partida"},
  {id:1,name:"Marte",emoji:"🔴",rarity:"common",price:200,color:"#c1440e",ring:false,glow:"#ff6644",desc:"O planeta vermelho"},
  {id:2,name:"Netuno",emoji:"🔵",rarity:"common",price:200,color:"#4060c8",ring:false,glow:"#6080ff",desc:"Azul profundo"},
  {id:3,name:"Vênus",emoji:"🟡",rarity:"common",price:250,color:"#e8c87a",ring:false,glow:"#ffdd88",desc:"Dourado nebuloso"},
  {id:4,name:"Mercúrio",emoji:"⚫",rarity:"common",price:200,color:"#9090a8",ring:false,glow:"#aaaacc",desc:"Cinzento rochoso"},
  {id:5,name:"Júpiter",emoji:"🟠",rarity:"common",price:300,color:"#c88c5a",ring:false,glow:"#ffaa66",desc:"O gigante das listras"},
  {id:6,name:"Terra",emoji:"🌍",rarity:"common",price:300,color:"#4a9eff",ring:false,glow:"#44aaff",desc:"Lar doce lar"},
  {id:7,name:"Lua",emoji:"🌕",rarity:"common",price:150,color:"#d0d0d8",ring:false,glow:"#eeeeff",desc:"Satélite clássico"},
  {id:8,name:"Cometa",emoji:"☄️",rarity:"common",price:250,color:"#88ccff",ring:false,glow:"#aaddff",desc:"Velocidade cósmica"},
  {id:9,name:"Asteroide",emoji:"🪨",rarity:"common",price:200,color:"#886644",ring:false,glow:"#aa8866",desc:"Rocha espacial"},
  {id:10,name:"Saturno",emoji:"💛",rarity:"rare",price:600,color:"#c8a060",ring:true,glow:"#ffcc66",desc:"Com anel dourado"},
  {id:11,name:"Urano",emoji:"🩵",rarity:"rare",price:700,color:"#7ab8d4",ring:true,glow:"#88ddff",desc:"Gigante de gelo"},
  {id:12,name:"Estrela Cadente",emoji:"🌠",rarity:"rare",price:800,color:"#ffffaa",ring:false,glow:"#ffffff",desc:"Faísca do universo"},
  {id:13,name:"Nebulosa Rosa",emoji:"🌸",rarity:"rare",price:750,color:"#ff88bb",ring:false,glow:"#ffaad0",desc:"Nuvem cósmica"},
  {id:14,name:"Nebulosa Verde",emoji:"💚",rarity:"rare",price:750,color:"#44dd88",ring:false,glow:"#66ffaa",desc:"Gás esmeralda"},
  {id:15,name:"Pulsar",emoji:"⚡",rarity:"rare",price:900,color:"#ddff44",ring:false,glow:"#eeff66",desc:"Emite energia"},
  {id:16,name:"Anã Branca",emoji:"⭐",rarity:"rare",price:850,color:"#eeeeff",ring:false,glow:"#ffffff",desc:"Núcleo estelar"},
  {id:17,name:"Planeta Gelo",emoji:"🧊",rarity:"rare",price:700,color:"#aaddff",ring:false,glow:"#cceeFF",desc:"Congelado no espaço"},
  {id:18,name:"Planeta Lava",emoji:"🌋",rarity:"rare",price:800,color:"#ff4422",ring:false,glow:"#ff6600",desc:"Fervendo de energia"},
  {id:19,name:"Planeta Veneno",emoji:"☠️",rarity:"rare",price:700,color:"#88ff44",ring:false,glow:"#aaff66",desc:"Venenoso e letal"},
  {id:20,name:"Buraco Negro",emoji:"🕳️",rarity:"epic",price:1500,color:"#110022",ring:true,glow:"#aa00ff",desc:"Absorve tudo"},
  {id:21,name:"Quasar",emoji:"🔮",rarity:"epic",price:2000,color:"#cc44ff",ring:false,glow:"#ee66ff",desc:"Núcleo galáctico"},
  {id:22,name:"Supernova",emoji:"💥",rarity:"epic",price:2500,color:"#ff8800",ring:false,glow:"#ffcc00",desc:"Explosão estelar"},
  {id:23,name:"Planeta Cristal",emoji:"💎",rarity:"epic",price:1800,color:"#88eeff",ring:false,glow:"#aaffff",desc:"Translúcido e raro"},
  {id:24,name:"Planeta Sombra",emoji:"🌑",rarity:"epic",price:1600,color:"#222244",ring:false,glow:"#4444aa",desc:"Escuridão total"},
  {id:25,name:"Estrela Nêutron",emoji:"💫",rarity:"epic",price:2200,color:"#ffffff",ring:false,glow:"#88aaff",desc:"Ultra-densa e rápida"},
  {id:26,name:"Planeta Aurora",emoji:"🌌",rarity:"epic",price:1700,color:"#44ffcc",ring:false,glow:"#88ffee",desc:"Luzes polares"},
  {id:27,name:"Planeta Tempestade",emoji:"🌀",rarity:"epic",price:1900,color:"#6688cc",ring:false,glow:"#88aaff",desc:"Furacão eterno"},
  {id:28,name:"Anã Vermelha",emoji:"❤️",rarity:"epic",price:1600,color:"#cc2200",ring:false,glow:"#ff4400",desc:"Estrela em brasa"},
  {id:29,name:"Planeta Fantasma",emoji:"👻",rarity:"epic",price:2000,color:"#eeeeff",ring:false,glow:"#aaaaff",desc:"Semitransparente"},
  {id:30,name:"Galáxia",emoji:"🌌",rarity:"legendary",price:5000,color:"#cc88ff",ring:true,glow:"#ff88ff",desc:"Uma galáxia inteira"},
  {id:31,name:"Big Bang",emoji:"✨",rarity:"legendary",price:8000,color:"#ffffff",ring:false,glow:"#ffffff",desc:"O início de tudo"},
  {id:32,name:"Universo",emoji:"🔭",rarity:"legendary",price:10000,color:"#000088",ring:true,glow:"#0044ff",desc:"Contém tudo"},
  {id:33,name:"Deus Cósmico",emoji:"👁️",rarity:"legendary",price:15000,color:"#ffdd00",ring:true,glow:"#ffff00",desc:"Além da compreensão"},
  {id:34,name:"Dragão Estelar",emoji:"🐉",rarity:"legendary",price:7000,color:"#ff4400",ring:false,glow:"#ff8800",desc:"Lenda do cosmos"},
  {id:35,name:"Sobrevivente",emoji:"🛡️",rarity:"earned",price:0,unlockKey:"survive5",color:"#44aa88",ring:false,glow:"#66ccaa",desc:"Sobreviva 5 min"},
  {id:36,name:"Devorador",emoji:"👅",rarity:"earned",price:0,unlockKey:"eat50",color:"#ff6644",ring:false,glow:"#ff8866",desc:"Coma 50 inimigos"},
  {id:37,name:"Massivo",emoji:"⚖️",rarity:"earned",price:0,unlockKey:"mass5000",color:"#ddaa44",ring:false,glow:"#ffcc66",desc:"Massa ≥ 5.000"},
  {id:38,name:"Divisor",emoji:"✂️",rarity:"earned",price:0,unlockKey:"split100",color:"#88aaff",ring:false,glow:"#aaccff",desc:"Divida 100 vezes"},
  {id:39,name:"Campeão",emoji:"🏆",rarity:"earned",price:0,unlockKey:"top1_3min",color:"#ffcc00",ring:true,glow:"#ffee44",desc:"Nº1 por 3 minutos"},
  {id:40,name:"Veterano",emoji:"🎖️",rarity:"earned",price:0,unlockKey:"games10",color:"#cc8844",ring:false,glow:"#ddaa66",desc:"10 partidas jogadas"},
  {id:41,name:"Caçador",emoji:"🎯",rarity:"earned",price:0,unlockKey:"eatbots10",color:"#ff4488",ring:false,glow:"#ff66aa",desc:"Coma 10 bots"},
  {id:42,name:"Ejector",emoji:"💨",rarity:"earned",price:0,unlockKey:"eject200",color:"#44ccff",ring:false,glow:"#66eeff",desc:"Ejete 200 vezes"},
  {id:43,name:"Explorador",emoji:"🗺️",rarity:"earned",price:0,unlockKey:"explore4",color:"#88cc44",ring:false,glow:"#aaee66",desc:"Explore todo o mapa"},
  {id:44,name:"Imparável",emoji:"🌪️",rarity:"earned",price:0,unlockKey:"streak5",color:"#cc44ff",ring:false,glow:"#ee66ff",desc:"5 abates sem morrer"},
  {id:45,name:"???",emoji:"❓",rarity:"secret",price:0,unlockKey:"secret1",color:"#333355",ring:false,glow:"#555588",desc:"Segredo oculto"},
  {id:46,name:"???",emoji:"❓",rarity:"secret",price:0,unlockKey:"secret2",color:"#333355",ring:false,glow:"#555588",desc:"Segredo oculto"},
  {id:47,name:"???",emoji:"❓",rarity:"secret",price:0,unlockKey:"secret3",color:"#333355",ring:false,glow:"#555588",desc:"Segredo oculto"},
  {id:48,name:"???",emoji:"❓",rarity:"secret",price:0,unlockKey:"secret4",color:"#333355",ring:false,glow:"#555588",desc:"Segredo oculto"},
  {id:49,name:"Lenda Suprema",emoji:"🌟",rarity:"legendary",price:20000,color:"#ffff88",ring:true,glow:"#ffffff",desc:"O mais raro de todos"},
];
const RARITY={free:"Grátis",common:"Comum",rare:"Raro",epic:"Épico",legendary:"Lendário",earned:"Conquista",secret:"Secreto"};
const RARITY_ORDER=["free","common","rare","epic","legendary","earned","secret"];
const RARITY_COLOR={free:"#aaaaaa",common:"#88ccff",rare:"#44aaff",epic:"#aa44ff",legendary:"#ffcc00",earned:"#44ffaa",secret:"#ff4488"};
const NAMES=["Nebulox","Vortexia","Cosmara","Drakonis","Stellara","Graviton","Quasara","Pulsaris","Meteora","Darkion","Nexaris","Solaron","Astrophex","Hydraxis","Volcanix","Luminos","Aetheron","Aurorax","Voidrix","Pyronis"];
const HUMANS=["Evandro","luana_x","Kaique","MarcosVP","nina.s","Rafa","theo_br","Bia_2049","Guto","Pedro_H","clara","zeca","Duda","Fernanda","matheus.k","Ravi","Jujuba","Igor","Manu","Lipe","Sofia_R","Caio","Yasmin","Tico","Alice"];
const MODELS=[["nebula","Nebulosa"],["console","Console"],["orbit","Órbita Clara"],["toon","Cartoon"],["mono","Mínimo"],["cockpit","Cabine"]];

// gerador determinístico (mesmo da engine)
function mulberry(seed){return function(){seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}

const ME={nick:"Evandro",kind:"guest",coins:2450,skin:0,owned:[0,1,6,10,17,35,37],
  achievements:["survive5","mass5000"],
  stats:{games:47,kills:132,bestScore:18420,bestMass:9870,playTime:5*3600+42*60,bestStreak:7}};

const ROOMS=[
  {code:"1ABC",shard:1,players:7,max:20,bots:8,ping:23},
  {code:"0K7Q",shard:0,players:19,max:20,bots:1,ping:31},
  {code:"2PLN",shard:2,players:12,max:20,bots:6,ping:27},
  {code:"1ZZ9",shard:1,players:3,max:20,bots:12,ping:22},
  {code:"0MWE",shard:0,players:15,max:20,bots:4,ping:35},
  {code:"2H4T",shard:2,players:1,max:20,bots:14,ping:29},
  {code:"1RXD",shard:1,players:9,max:20,bots:7,ping:24},
  {code:"0V2C",shard:0,players:20,max:20,bots:0,ping:33},
];

// ranking: RANK[period][by] → 50 linhas {rank,nick,registered,value}; "você" fica em 37º
const PERIODS=["all","week","day"],METRICS=["score","mass","kills"];
const RANK={};
PERIODS.forEach((p,pi)=>{RANK[p]={};METRICS.forEach((m,mi)=>{
  const r=mulberry(1000+pi*10+mi);
  const base=m==="kills"?(p==="all"?900:p==="week"?120:30):(p==="all"?60000:p==="week"?22000:9000);
  const rows=[];let v=base;
  for(let i=0;i<50;i++){v=Math.round(v*(0.86+r()*0.11));
    const human=r()<.85,nick=human?HUMANS[Math.floor(r()*HUMANS.length)]+(r()<.3?Math.floor(r()*99):""):NAMES[Math.floor(r()*NAMES.length)];
    rows.push({rank:i+1,nick,registered:r()<.55,value:Math.max(1,v),delta:Math.round((r()-.5)*6)});}
  rows[36]={rank:37,nick:"Evandro",registered:false,me:true,value:rows[36].value,delta:2};
  RANK[p][m]=rows;});});

const now=Date.UTC(2026,7,26,14,0,0);
const HISTORY=(()=>{const r=mulberry(77),h=[];
  const causes=["eaten","eaten","eaten","blackhole","left","eaten","eaten","eaten","blackhole","eaten","left","eaten"];
  for(let i=0;i<12;i++){const mass=Math.round(400+r()*9000),kills=Math.floor(r()*9),dur=Math.round(60+r()*900);
    h.push({when:now-i*3.7e6-r()*2e6,room:ROOMS[Math.floor(r()*ROOMS.length)].code,mass,score:Math.round(mass*1.6),
      kills,rank:1+Math.floor(r()*18),dur,coins:Math.floor(mass/300)+kills*2+(dur>=300?25:0),cause:causes[i],
      by:causes[i]==="eaten"?(r()<.5?HUMANS[Math.floor(r()*HUMANS.length)]:NAMES[Math.floor(r()*NAMES.length)]):null});}
  return h;})();

const ACHIEVEMENTS=[
  {key:"survive5",title:"Sobrevivente",desc:"Sobreviva 5 minutos numa vida",coins:100,icon:"🛡️"},
  {key:"mass5000",title:"Massivo",desc:"Alcance massa 5.000",coins:100,icon:"⚖️"},
  {key:"eat50",title:"Devorador",desc:"Coma 50 planetas (total)",coins:100,icon:"👅",progress:[32,50]},
  {key:"split100",title:"Divisor",desc:"Divida 100 vezes (total)",coins:100,icon:"✂️",progress:[71,100]},
  {key:"top1_3min",title:"Campeão",desc:"Fique em 1º por 3 minutos",coins:100,icon:"🏆",progress:[95,180]},
  {key:"games10",title:"Veterano",desc:"Jogue 10 partidas",coins:100,icon:"🎖️",progress:[47,10]},
  {key:"eatbots10",title:"Caçador",desc:"Coma 10 bots",coins:100,icon:"🎯",progress:[6,10]},
  {key:"eject200",title:"Ejector",desc:"Ejete massa 200 vezes",coins:100,icon:"💨",progress:[140,200]},
  {key:"explore4",title:"Explorador",desc:"Visite os 4 quadrantes numa vida",coins:100,icon:"🗺️",progress:[3,4]},
  {key:"streak5",title:"Imparável",desc:"5 abates sem morrer",coins:100,icon:"🌪️",progress:[3,5]},
  {key:"secret1",title:"???",desc:"Segredo oculto",coins:250,icon:"❓",secret:true},
  {key:"secret2",title:"???",desc:"Segredo oculto",coins:250,icon:"❓",secret:true},
];

// preferências: grupos → itens {key,label,type:toggle|select|range,v,opts?}
// As chaves names/mass/trails/minimap/fps/grid/fx funcionam de verdade no mockup.
const PREFS=[
  {id:"controls",title:"Controles",items:[
    {key:"joystick",label:"Joystick virtual (celular)",type:"toggle",v:false},
    {key:"rightSplit",label:"Botão direito divide",type:"toggle",v:true},
    {key:"holdEject",label:"Segurar W ejeta contínuo",type:"toggle",v:true},
    {key:"sens",label:"Sensibilidade da mira",type:"range",v:60,min:10,max:100}]},
  {id:"graphics",title:"Gráficos",items:[
    {key:"quality",label:"Qualidade",type:"select",v:"auto",opts:[["auto","Automática"],["low","Baixa"],["high","Alta"]]},
    {key:"trails",label:"Rastros de movimento",type:"toggle",v:true},
    {key:"fx",label:"Efeitos de colisão",type:"toggle",v:true},
    {key:"grid",label:"Grade do mapa",type:"toggle",v:true},
    {key:"parallax",label:"Parallax do fundo",type:"toggle",v:true}]},
  {id:"sound",title:"Som",items:[
    {key:"sound",label:"Efeitos sonoros",type:"toggle",v:true},
    {key:"music",label:"Música",type:"toggle",v:false},
    {key:"volume",label:"Volume",type:"range",v:70,min:0,max:100}]},
  {id:"ui",title:"Interface",items:[
    {key:"names",label:"Mostrar nomes",type:"toggle",v:true},
    {key:"mass",label:"Mostrar massa nos planetas",type:"toggle",v:true},
    {key:"minimap",label:"Minimapa",type:"toggle",v:true},
    {key:"fps",label:"Mostrar FPS e ping",type:"toggle",v:true},
    {key:"lbSize",label:"Linhas do placar",type:"select",v:"8",opts:[["5","5"],["8","8"],["10","10"]]}]},
  {id:"a11y",title:"Acessibilidade",items:[
    {key:"colorblind",label:"Modo daltonismo",type:"select",v:"off",opts:[["off","Desligado"],["deutan","Deuteranopia"],["protan","Protanopia"],["tritan","Tritanopia"]]},
    {key:"reduceMotion",label:"Reduzir movimento",type:"toggle",v:false},
    {key:"bigText",label:"Texto maior",type:"toggle",v:false}]},
];
const prefsDefault=()=>{const o={};PREFS.forEach(gp=>gp.items.forEach(it=>o[it.key]=it.v));return o;};

return{SKINS,RARITY,RARITY_ORDER,RARITY_COLOR,NAMES,HUMANS,MODELS,ME,ROOMS,RANK,PERIODS,METRICS,HISTORY,ACHIEVEMENTS,PREFS,prefsDefault,mulberry};
})();
