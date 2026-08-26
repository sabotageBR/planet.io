// ── CONQUISTAS (checadas no servidor no fim da partida; skins "earned" usam a mesma key) ──
// @ts-check
export const ACHIEVEMENTS=[
  {key:"survive5",title:"Sobrevivente",desc:"Sobreviva 5 minutos numa vida",coins:100,icon:"🛡️"},
  {key:"mass5000",title:"Massivo",desc:"Alcance massa 5.000",coins:100,icon:"⚖️"},
  {key:"streak5",title:"Imparável",desc:"5 abates sem morrer",coins:100,icon:"🌪️"},
  {key:"top1_3min",title:"Campeão",desc:"Fique em 1º por 3 minutos",coins:100,icon:"🏆"},
  {key:"explore4",title:"Explorador",desc:"Visite os 4 quadrantes numa vida",coins:100,icon:"🗺️"},
  {key:"eat50",title:"Devorador",desc:"Coma 50 planetas (total)",coins:100,icon:"👅"},
  {key:"eatbots10",title:"Caçador",desc:"Coma 10 bots (total)",coins:100,icon:"🎯"},
  {key:"split100",title:"Divisor",desc:"Divida 100 vezes (total)",coins:100,icon:"✂️"},
  {key:"eject200",title:"Ejector",desc:"Ejete massa 200 vezes (total)",coins:100,icon:"💨"},
  {key:"games10",title:"Veterano",desc:"Jogue 10 partidas",coins:100,icon:"🎖️"},
  {key:"secret1",title:"???",desc:"Segredo oculto",coins:250,icon:"❓",secret:true},
  {key:"secret2",title:"???",desc:"Segredo oculto",coins:250,icon:"❓",secret:true},
  {key:"secret3",title:"???",desc:"Segredo oculto",coins:250,icon:"❓",secret:true},
  {key:"secret4",title:"???",desc:"Segredo oculto",coins:250,icon:"❓",secret:true},
];
export const ACHIEVEMENT_BY_KEY=new Map(ACHIEVEMENTS.map(a=>[a.key,a]));
/** Progresso exibível (numerador, denominador) a partir de user_stats + partida atual. */
export const ACHIEVEMENT_GOALS={eat50:["kills",50],eatbots10:["botKills",10],split100:["splits",100],eject200:["ejects",200],games10:["games",10]};
/**
 * Regras avaliadas no fim da partida. `m` = resumo da partida, `s` = user_stats já atualizado.
 * @param {{durationS:number,maxMass:number,bestStreak:number,top1Ticks:number,quadrants:number}} m
 * @param {{kills:number,botKills:number,splits:number,ejects:number,games:number}} s
 */
export function unlockedAchievements(m,s){const out=[];
  if(m.durationS>=300)out.push("survive5");
  if(m.maxMass>=5000)out.push("mass5000");
  if(m.bestStreak>=5)out.push("streak5");
  if(m.top1Ticks>=3*60*60)out.push("top1_3min");
  if(m.quadrants>=4)out.push("explore4");
  if(s.kills>=50)out.push("eat50");if(s.botKills>=10)out.push("eatbots10");
  if(s.splits>=100)out.push("split100");if(s.ejects>=200)out.push("eject200");if(s.games>=10)out.push("games10");
  return out;}
