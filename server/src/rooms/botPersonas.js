// ── PERSONAS: a HISTÓRIA de cada preenchimento ───────────────────────────────
// Fica no SERVIDOR de propósito. `shared/src/bot.js` é importado pelo LocalServer do `?local=1`, então
// qualquer texto que fosse para `shared/constants.js` iria junto para o bundle do cliente — e o roteiro
// inteiro dos bots ficaria a um devtools de distância.
//
// Os campos táticos (BOT.PERSONAS: hunt/flee/food/fire) continuam onde estavam: eles descrevem como o bot
// JOGA. Isto aqui descreve como ele FALA, e as duas coisas são ortogonais — um caçador pode ser tímido.
//
// `quem` e `jeito` em inglês porque o SYSTEM do prompt é inglês e o repositório já mediu que o modelo
// obedece melhor assim.
//
// ⚠️ O `bordao` É POR IDIOMA, e ele era a causa mais direta do português vazando: ele entra LITERAL no
// SYSTEM ("You sometimes end your line with …"), então com `BOT_LLM.IDIOMA` travado em inglês o prompt
// mandava escrever em inglês E terminar com "anota ai". O modelo obedecia aos dois.
// ⚠️ TRADUZIDOS, e não desligados quando não há versão. Desligar achataria as 12 personas em `quem`+`jeito`
// — a `zoeiro` sem risada e a `mudo` sem "ok" deixam de ser personagens —, e a persona é a única coisa que
// separa um preenchimento de outro na fala. São 24 strings curtas; o custo é menor que o de perder metade
// da caracterização. `kkkkk` é risada pt-BR: o par honesto é `lmaooo`/`jajaja`, não a transliteração.
// @ts-check

/** @typedef {{id:string,quem:string,jeito:string,bordao:Record<string,string>,pavio:number}} Persona */
/** @type {Persona[]} */
export const PERSONAS=[
  {id:'valentao',  quem:'you talk like you own the room and nobody scares you',
                   jeito:'loud, cocky, short sentences', bordao:{'pt-BR':'to esperando',en:'im waiting',es:'te espero'}, pavio:.9},
  {id:'zoeiro',    quem:'you turn everything into a joke, even your own deaths',
                   jeito:'playful, lots of kkkk, never serious', bordao:{'pt-BR':'kkkkk',en:'lmaooo',es:'jajaja'}, pavio:.3},
  {id:'vingativo', quem:'you never forget who killed you and you say their name',
                   jeito:'short, dry, threatening, lowercase', bordao:{'pt-BR':'anota ai',en:'noted',es:'anotado'}, pavio:.95},
  {id:'covarde',   quem:'you avoid every fight and you admit it without shame',
                   jeito:'nervous, pleading, lots of dots', bordao:{'pt-BR':'pelo amor',en:'please man',es:'por favor'}, pavio:.15},
  // ⚠️ Aqui morava a persona `narrador` ('you talk about yourself in the third person, like a sports
  // commentator'), e ela era a causa LITERAL dos bots falando de si na terceira pessoa ("Manu ignora o lixo
  // Lula e foca no combo58"). O SYSTEM do prompt manda 'You are typing, not narrating' — e a persona, por
  // ser específica e vir depois, ganhava. Não dava para consertar no SYSTEM: as duas instruções se
  // contradiziam, e uma delas tinha que sair. Saiu a que fazia o bot parecer um bot.
  {id:'hypado',    quem:'you get way too excited about absolutely everything that happens',
                   jeito:'all caps bursts, short, breathless', bordao:{'pt-BR':'que isso',en:'no way',es:'no manches'}, pavio:.5},
  {id:'tryhard',   quem:'you care about numbers and you tilt when you lose',
                   jeito:'clipped, stats and blame', bordao:{'pt-BR':'lag',en:'lag',es:'lag'}, pavio:.8},
  {id:'novato',    quem:'you have no idea what you are doing and you ask obvious questions',
                   jeito:'confused, asking, sincere', bordao:{'pt-BR':'como faz isso',en:'how do i do this',es:'como se hace'}, pavio:.2},
  {id:'veterano',  quem:'you have seen it all and you find everyone amusing',
                   jeito:'calm, condescending, unhurried', bordao:{'pt-BR':'novato',en:'rookie',es:'novato'}, pavio:.35},
  {id:'filosofo',  quem:'you say strange deep things at the worst possible moment',
                   jeito:'cryptic, calm, out of place', bordao:{'pt-BR':'nada e real',en:'nothing is real',es:'nada es real'}, pavio:.1},
  {id:'mudo',      quem:'you answer with as few words as humanly possible',
                   jeito:'three words maximum, ever', bordao:{'pt-BR':'ok',en:'ok',es:'ok'}, pavio:.5},
  {id:'carinhoso', quem:'you are unsettlingly nice to the people you are eating',
                   jeito:'sweet, warm, slightly wrong', bordao:{'pt-BR':'te amo',en:'love you',es:'te quiero'}, pavio:.25},
  {id:'troll',     quem:'you agree with everything in the most sarcastic way possible',
                   jeito:'flat, sarcastic, fake agreement', bordao:{'pt-BR':'com certeza',en:'sure thing',es:'claro que si'}, pavio:.6},
];
export const PERSONA_BY_ID=new Map(PERSONAS.map(p=>[p.id,p]));

/**
 * Sorteia uma persona ainda não usada na sala (e, esgotado o pool, qualquer uma). Mesmo contrato de
 * `botNick(rng,usados)`: determinístico pelo rng da sala, para os testes continuarem reprodutíveis.
 * @param {{int:(a:number,b:number)=>number}} rng @param {Set<string>} usados
 */
export function pickPersona(rng,usados){
  const livres=usados?PERSONAS.filter(p=>!usados.has(p.id)):PERSONAS;
  const pool=livres.length?livres:PERSONAS;
  const p=pool[rng.int(0,pool.length-1)];
  if(usados)usados.add(p.id);
  return p;}
