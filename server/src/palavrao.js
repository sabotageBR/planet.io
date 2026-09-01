// ── PALAVREADO: UMA LISTA SÓ, DOIS COMPORTAMENTOS ─────────────────────────────
// Havia peneira de palavrão no jogo, mas só na saída da LLM (`sanitiza`, em botChat.js): a linha do
// JOGADOR HUMANO ia para a sala inteira depois de exatamente três transformações — normalizar Unicode,
// tirar caractere de controle e cortar em CHAT.MAX_CHARS. Quer dizer: o preenchimento era censurado e a
// pessoa não. Numa sala de 50, com portais que classificam o catálogo em PEGI 12, é o lado errado da
// moderação — e é requisito formal de Poki e CrazyGames ter alguma.
//
// A lista é uma só para não divergir na primeira correção, mas os DOIS lados a usam de jeitos
// diferentes, porque o custo do erro é diferente:
//   • BOT   → RECUSA a linha (`temGrave`). Ele tem repertório fixo para cair, então recusar não o deixa
//             mudo. Só o grupo GRAVE: o SYSTEM autoriza provocação e "mild swearing", e recusar palavrão
//             leve trocaria a fala gerada por uma frase enlatada — mais mudo, não mais limpo.
//   • HUMANO → MASCARA (`mascara`). Recusar a linha de uma pessoa em silêncio parece chat quebrado, e
//             ela reescreve com outra grafia; mascarar entrega a mensagem, mostra que houve filtro e não
//             dá margem a "o jogo comeu o que eu escrevi". Aqui entram GRAVE e LEVE.
//
// ⚠️ Não é filtro de segurança e não tenta ser: leetspeak, espaçamento e grafia criativa passam. O que
// ele resolve é o que um revisor de portal vê em dois minutos de sala e o palavrão casual do dia a dia.
// Moderação de verdade (denúncia, silenciar, banir) é outra coisa, e o dono da sala já tem kick e ban.

// Insulto sexual, xingamento de família e slur. É o antigo OFENSA de botChat.js, mais os buracos que a
// varredura encontrou: `fuck`/`shit` e derivados nunca estiveram lá — e são, de longe, os mais prováveis.
export const GRAVE=[
  'put[ao]s?','viado[s]?','veado[s]?','bicha[s]?','corno[s]?','vagabund[ao]s?','cuzao','cuzão',
  'buceta[s]?','pau no','cu\\b','foder','fuder','trepar','chupa[r]?','mamar',
  'fdp','filho da','vai se','vtnc','tnc','arrombad[ao]s?','desgraçad[ao]s?','retardad[ao]s?','mongol[oó]ide',
  'viadinho','baitola','traveco','crioulo','preto imundo',
  'ass\\b','asshole','bitch','cunt','fag','faggot','whore','slut','dick','pussy','suck my','blow me','retard',
  'fuck\\w*','motherfuck\\w*','wtf','stfu','nigg[ae]r?s?','tranny','cock','jerk off','rape',
  'gilipollas','pendejo','cabr[óo]n','co[ñn]o','verga','chinga\\w*','maric[óo]n','puta madre',
];
// Palavrão de todo dia. O bot pode dizer (a provocação é metade da graça); a linha da pessoa sai mascarada.
export const LEVE=[
  'merda','bosta','porra','caralho','cacete','droga\\b','inferno\\b',
  'shit\\w*','damn','crap','bullshit','piss\\w*','bastard','hell\\b',
  'mierda','joder','boludo','carajo',
];
// Ofende só em CONTEXTO — "o Pinto entrou", "a bola rola", "piranha" é peixe (e é nick de bot em
// BOT_NICKS!). Entram só na recusa do BOT, onde o falso positivo custa uma frase enlatada; na linha da
// pessoa eles ficam de fora, porque mascarar fala legítima é pior que o palavrão que se queria pegar.
export const AMBIGUO=['pinto','rola','bunda','piranha[s]?','macac[oa]s?'];
const re=(lista,flags)=>new RegExp('\\b('+lista.join('|')+')\\b',flags);
const RE_GRAVE=re(GRAVE.concat(AMBIGUO),'i'), RE_TUDO=re(GRAVE.concat(LEVE),'gi');
/** O bot disse algo que não sai na tela? (recusa a linha; ver o cabeçalho) */
export const temGrave=t=>RE_GRAVE.test(String(t||''));
/**
 * `merda` → `m****`. Mantém a inicial de propósito: a pessoa reconhece o que escreveu e entende que
 * houve filtro, em vez de achar que a mensagem se perdeu.
 * ⚠️ A regex é `g` e usada só em `replace`, que reseta o `lastIndex` — não a use com `.test()`.
 */
export const mascara=t=>String(t||'').replace(RE_TUDO,m=>m[0]+'*'.repeat(Math.max(1,m.length-1)));
