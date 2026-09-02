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
//             dá margem a "o jogo comeu o que eu escrevi".
//
// ⚠️ Não é filtro de segurança e não tenta ser: leetspeak, espaçamento e grafia criativa passam. O que
// ele resolve é o que um revisor de portal vê em dois minutos de sala e o palavrão casual do dia a dia.
// Moderação de verdade (denúncia, silenciar, banir) é outra coisa, e o dono da sala já tem kick e ban.
//
// ── O NÍVEL É ESCOLHA, E O PADRÃO É LIVRE (`CHAT.FILTRO`, combo em /admin) ────────────────────────────
// Xingar faz parte de um .io e mascarar a linha de quem joga é decisão de PRODUTO, não de engenharia — o
// pedido do dono do jogo foi literal: chat livre. Então o nível vira parâmetro (`livre` · `pesado` ·
// `tudo`) e o padrão é `livre`. Os portais continuam atendidos pelo que sempre importou para eles: o
// jogador consegue SILENCIAR e DENUNCIAR (`game.mute`, `Room.report`), e o dono da sala tem kick e ban —
// é isso que Poki e CrazyGames pedem por escrito. Antes de mandar um pacote para revisão, subir para
// `pesado` é um clique, sem deploy.
//
// ⚠️ DUAS COISAS NÃO SEGUEM O NÍVEL, e não é censura escondida — é escopo:
//   1. O que o SERVIDOR GERA. Um slur na boca de um preenchimento não é liberdade do jogador: é o nosso
//      processo inventando a palavra. Por isso a lista de ÓDIO ficou separada do palavrão pesado e o bot
//      é barrado por ela em qualquer nível. Xingar pesado ele pode — inventar slur, não.
//   2. O NICK (`auth/nick.js`), que fica no placar, no feed e no radar a partida INTEIRA e é escolhido
//      uma vez, não dito no calor de uma briga. Ele continua com a regra de sempre (`nickProibido`).

import {CHAT} from '@warspace/shared/constants.js';

// ÓDIO: slur racial, homofóbico, transfóbico e capacitista, mais estupro. Saiu de GRAVE porque tem regra
// PRÓPRIA — é a única coisa que o bot não diz em nível nenhum. Não é "palavrão forte": é o vocabulário que
// ataca a pessoa pelo que ela é, e que um servidor não deve gerar sozinho nem com o filtro desligado.
export const ODIO=[
  'viado[s]?','veado[s]?','bicha[s]?','viadinho','baitola','traveco','crioulo','preto imundo',
  'retardad[ao]s?','mongol[oó]ide','macac[oa] preto',
  'fag','faggot','nigg[ae]r?s?','tranny','retard','rape',
  'maric[óo]n',
];
// Insulto sexual e xingamento de família — o palavrão PESADO. É o antigo OFENSA de botChat.js menos os
// slurs (que foram para ODIO), mais os buracos que a varredura encontrou: `fuck`/`shit` e derivados nunca
// estiveram lá — e são, de longe, os mais prováveis num portal internacional.
export const GRAVE=[
  'put[ao]s?','corno[s]?','vagabund[ao]s?','cuzao','cuzão',
  'buceta[s]?','pau no','cu\\b','foder','fuder','trepar','chupa[r]?','mamar',
  'fdp','filho da','vai se','vtnc','tnc','arrombad[ao]s?','desgraçad[ao]s?',
  'ass\\b','asshole','bitch','cunt','whore','slut','dick','pussy','suck my','blow me',
  'fuck\\w*','motherfuck\\w*','wtf','stfu','cock','jerk off',
  'gilipollas','pendejo','cabr[óo]n','co[ñn]o','verga','chinga\\w*','puta madre',
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
// ⚠️ As regex são montadas UMA vez, na carga: o nível escolhe entre elas, nunca recompila. `_pushChat`
// roda em toda linha de chat de todas as salas do shard, e `new RegExp` com 60 alternativas ali seria
// trabalho por mensagem para um valor que muda uma vez por mês.
const RE_ODIO=re(ODIO,'i');
const RE_BOT=re(ODIO.concat(GRAVE,AMBIGUO),'i');
const RE_NICK=re(ODIO.concat(GRAVE,AMBIGUO),'i');
const RE_PESADO=re(ODIO.concat(GRAVE),'gi'), RE_TUDO=re(ODIO.concat(GRAVE,LEVE),'gi');
/**
 * O bot disse algo que não sai na tela? (recusa a linha; ver o cabeçalho)
 * ⚠️ No nível `livre` sobra só o ÓDIO — o preenchimento xinga pesado como qualquer um, mas continua sem
 * inventar slur, porque essa linha é escrita pelo NOSSO processo e não por um jogador.
 */
export const temGrave=t=>(CHAT.FILTRO==='livre'?RE_ODIO:RE_BOT).test(String(t||''));
/** O nick não segue o nível: ele fica na tela a partida inteira e é escolhido a frio. Ver o cabeçalho. */
export const nickProibido=t=>RE_NICK.test(String(t||''));
/**
 * `merda` → `m****`. Mantém a inicial de propósito: a pessoa reconhece o que escreveu e entende que
 * houve filtro, em vez de achar que a mensagem se perdeu.
 * ⚠️ A regex é `g` e usada só em `replace`, que reseta o `lastIndex` — não a use com `.test()`.
 * ⚠️ No nível `livre` ela devolve a linha INTACTA: é o padrão, e é o pedido — nada de "quase livre".
 */
export const mascara=t=>{
  const s=String(t||'');
  if(CHAT.FILTRO==='livre')return s;
  return s.replace(CHAT.FILTRO==='tudo'?RE_TUDO:RE_PESADO,m=>m[0]+'*'.repeat(Math.max(1,m.length-1)));};
