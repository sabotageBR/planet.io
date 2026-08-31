// ── CONQUISTAS EM FAMÍLIAS DE 4 NÍVEIS ────────────────────────────────────────────────────────────
// @ts-check
// Antes eram 19 medalhas soltas de meta única: quem cumpria "Sobreviva 5 minutos" no primeiro dia
// nunca mais tinha o que perseguir ali, e dois pares (survive5/survive10, mass5000/mass10000) já eram
// níveis da mesma coisa com nomes diferentes — a estrutura existia, sem se assumir.
//
// Agora cada objetivo é uma FAMÍLIA com quatro metas crescentes (Bronze · Prata · Ouro · Diamante).
// A lista plana `ACHIEVEMENTS` continua sendo a interface: o servidor, o Perfil e a loja iteram sobre
// ela e não sabem que ela é gerada. Chave = `familia.tier` (survive.b … survive.d).
//
// ⚠️ As chaves antigas NÃO foram migradas (decisão de projeto: recomeçar do zero). A migração 0007
// esvazia `user_achievements`; moedas já creditadas ficam, porque vivem no `coin_ledger`, e skins já
// concedidas ficam, porque vivem em `user_skins`.

/** Os quatro metais. `coins` é a recompensa do tier — subir de nível vale progressivamente mais. */
export const TIERS=[
  // ⚠️ Pela METADE do que era (100/250/600/1500). Uma medalha paga UMA vez na vida, mas as 53 juntas
  // somavam 30 500 moedas — mais que o dobro do que uma conta de 17 partidas tinha inteira, e uma única
  // partida podia render 2 600 só de medalha. Conquista é marco; renda é a partida.
  {id:"b",name:"Bronze",  roman:"I",  icon:"🥉",color:"#c87f3a",coins:50},
  {id:"s",name:"Prata",   roman:"II", icon:"🥈",color:"#b9c4d4",coins:125},
  {id:"g",name:"Ouro",    roman:"III",icon:"🥇",color:"#ffc22e",coins:300},
  {id:"d",name:"Diamante",roman:"IV", icon:"💎",color:"#6ee7f0",coins:750},
];
export const TIER_BY_ID=new Map(TIERS.map(t=>[t.id,t]));

/**
 * `per` diz de ONDE sai o número comparado com a meta:
 *   "match" = da PARTIDA que acabou (recordes de uma vida: sobreviver, massa, sequência)
 *   "stats" = do acumulado do jogador em `user_stats` (contadores que só crescem)
 * `fmt` só existe para a descrição ficar em unidade humana (segundos → minutos).
 * ⚠️ `descArg` é essa CONTA sozinha, sem o texto em volta, e `one` marca a família que tem variante de
 * singular. Os dois existem porque o cliente monta a frase no idioma do jogador (client/src/i18n) e não
 * pode reimplementar a conversão — o `desc` daqui continua sendo o pt-BR do servidor (log e payload).
 * @type {Array<{id:string,title:string,icon:string,metric:string,per:string,goals:number[],desc:(n:number)=>string,single?:boolean}>}
 */
export const FAMILIES=[
  {id:"survive",title:"Sobrevivente",icon:"🛡️",metric:"durationS", per:"match",goals:[300,600,1200,1800],descArg:n=>n/60,desc:n=>`Sobreviva ${n/60} minutos numa vida`},
  {id:"mass",   title:"Massivo",     icon:"⚖️",metric:"maxMass",   per:"match",goals:[5e3,25e3,1e5,5e5],  desc:n=>`Alcance massa ${n.toLocaleString("pt-BR")}`},
  {id:"streak", title:"Imparável",   icon:"🌪️",metric:"bestStreak",per:"match",goals:[5,10,20,35],        desc:n=>`${n} abates sem morrer`},
  {id:"top1",   title:"Campeão",     icon:"🏆",metric:"top1Ticks", per:"match",goals:[10800,36000,90000,216000],descArg:n=>Math.round(n/3600),desc:n=>`Fique em 1º por ${Math.round(n/3600)} minutos`},
  {id:"eat",    title:"Devorador",   icon:"👅",metric:"kills",     per:"stats",goals:[50,250,1000,5000],   desc:n=>`Coma ${n.toLocaleString("pt-BR")} planetas`},
  {id:"hunt",   title:"Caçador",     icon:"🎯",metric:"botKills",  per:"stats",goals:[10,100,500,2000],    desc:n=>`Coma ${n.toLocaleString("pt-BR")} adversários`},
  {id:"split",  title:"Divisor",     icon:"✂️",metric:"splits",    per:"stats",goals:[100,1000,5000,20000],desc:n=>`Divida ${n.toLocaleString("pt-BR")} vezes`},
  {id:"eject",  title:"Ejector",     icon:"💨",metric:"ejects",    per:"stats",goals:[200,2000,10000,50000],desc:n=>`Ejete massa ${n.toLocaleString("pt-BR")} vezes`},
  {id:"games",  title:"Veterano",    icon:"🎖️",metric:"games",     per:"stats",goals:[10,50,250,1000],     desc:n=>`Jogue ${n.toLocaleString("pt-BR")} partidas`},
  {id:"brwin",  title:"Último de Pé",icon:"👑",metric:"brWins",    per:"stats",goals:[1,5,25,100],one:true, desc:n=>n===1?"Vença uma partida de Battle Royale":`Vença ${n} partidas de Battle Royale`},
  {id:"brtop",  title:"Finalista",   icon:"🎗️",metric:"brTop10",   per:"stats",goals:[1,10,50,200],one:true,desc:n=>n===1?"Termine no top 10 do Battle Royale":`Termine ${n} vezes no top 10 do Battle Royale`},
  {id:"brteam", title:"Esquadrão",   icon:"🛰️",metric:"brTeamWins",per:"stats",goals:[1,5,25,100],one:true,desc:n=>n===1?"Vença o Battle Royale em equipe":`Vença ${n} vezes o Battle Royale em equipe`},
  // Visitar os 4 quadrantes não escala: 4 é o mapa inteiro. Fica de tier único — a estrutura aceita
  // famílias de um nível só, e forçar quatro aqui seria inventar meta ("visite 4 quadrantes 10 vezes")
  // que ninguém persegue de propósito.
  {id:"explore",title:"Explorador",  icon:"🗺️",metric:"quadrants", per:"match",goals:[4],single:true,      desc:()=>"Visite os 4 quadrantes numa vida"},
];
export const FAMILY_BY_ID=new Map(FAMILIES.map(f=>[f.id,f]));

const achKey=(fam,i)=>`${fam.id}.${TIERS[i].id}`;
/** A lista plana que todo o resto do jogo consome. Gerada, nunca escrita à mão. */
export const ACHIEVEMENTS=[
  ...FAMILIES.flatMap(f=>f.goals.map((g,i)=>({
    key:achKey(f,i),family:f.id,tier:TIERS[i].id,tierIx:i,
    // família de tier único não recebe numeral: "Explorador I" sem um II é ruído
    title:f.single?f.title:`${f.title} ${TIERS[i].roman}`,
    desc:f.desc(g),coins:TIERS[i].coins,icon:f.icon,goal:g,metric:f.metric,per:f.per,
  }))),
  // As quatro secretas continuam sem regra de destrave (nunca tiveram) — são o gancho para os eggs.
  {key:"secret1",title:"???",desc:"Segredo oculto",coins:250,icon:"❓",secret:true},
  {key:"secret2",title:"???",desc:"Segredo oculto",coins:250,icon:"❓",secret:true},
  {key:"secret3",title:"???",desc:"Segredo oculto",coins:250,icon:"❓",secret:true},
  {key:"secret4",title:"???",desc:"Segredo oculto",coins:250,icon:"❓",secret:true},
];
export const ACHIEVEMENT_BY_KEY=new Map(ACHIEVEMENTS.map(a=>[a.key,a]));

/**
 * Onde o PROGRESSO de cada métrica é lido em `user_stats`. Nem toda métrica tem par: sobreviver, ficar
 * em 1º e explorar são feitos de UMA VIDA, e o acumulado não guarda o recorde de nenhum dos três — mostrar
 * o total de horas jogadas contra uma meta de "5 minutos numa vida" seria uma barra que mente. Essas
 * ficam sem barra, como as 14 sem barra de antes.
 */
export const STAT_OF={maxMass:"bestMass",bestStreak:"bestStreak",kills:"kills",botKills:"botKills",
  splits:"splits",ejects:"ejects",games:"games",brWins:"brWins",brTop10:"brTop10",brTeamWins:"brTeamWins"};

/** Progresso exibível (numerador, denominador) a partir de user_stats. */
export const ACHIEVEMENT_GOALS=Object.fromEntries(
  ACHIEVEMENTS.filter(a=>!a.secret&&STAT_OF[a.metric]).map(a=>[a.key,[STAT_OF[a.metric],a.goal]]));

/**
 * Regras avaliadas no fim da partida. `m` = resumo da partida, `s` = user_stats JÁ atualizado.
 * Um laço só sobre as famílias: a lista de `if`s escritos à mão era o lugar exato onde uma conquista
 * nova era esquecida.
 * ⚠️ O piso do Battle Royale (`players>=10`) continua: vencer com 3 na sala não é vencer com 50, e sem
 * ele a família inteira sairia de graça numa sala vazia. Ele mora aqui e não em `brWins` porque quem
 * conta `brWins` (o servidor, ao fechar a partida) aplica o MESMO piso — ver repos/matches.js.
 * @param {Record<string,number>} m
 * @param {Record<string,number>} s
 * @returns {string[]}
 */
export function unlockedAchievements(m,s){
  const out=[];
  for(const f of FAMILIES){
    const v=f.per==="match"?Number(m&&m[f.metric])||0:Number(s&&s[f.metric])||0;
    for(let i=0;i<f.goals.length;i++)if(v>=f.goals[i])out.push(`${f.id}.${TIERS[i].id}`);
  }
  return out;
}

/** Quantos tiers de uma família o jogador já tem (0..4) — a UI do Perfil desenha os selos com isto. */
export const tierCount=(famId,owned)=>{
  const f=FAMILY_BY_ID.get(famId);if(!f)return 0;
  let n=0;for(let i=0;i<f.goals.length;i++)if(owned.includes(`${famId}.${TIERS[i].id}`))n++;
  return n;
};
