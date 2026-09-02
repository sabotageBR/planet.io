// ── MODERAÇÃO: a peneira, o nick e a denúncia ─────────────────────────────────
// Este arquivo existe porque a moderação estava do lado ERRADO: havia peneira de palavrão só na saída da
// LLM (`sanitiza`), ou seja o PREENCHIMENTO era censurado e a PESSOA não — a linha de um humano ia para a
// sala inteira depois de três transformações puramente mecânicas. O que se trava aqui é o comportamento
// que os portais pedem (PEGI 12, e o jogador conseguir se proteger de outro) e, sobretudo, os FALSOS
// POSITIVOS: mascarar "o Pinto entrou" ou "a bola rola" é pior que o palavrão que se queria pegar.
// node --test server/test/moderacao.test.js
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mascara,temGrave,nickProibido,ODIO,GRAVE,LEVE,AMBIGUO} from '../src/palavrao.js';
import {normalizeNick} from '../src/auth/nick.js';
import {sanitiza} from '../src/rooms/botChat.js';
import {CHAT} from '@warspace/shared/constants.js';

/** Roda um caso num nível de filtro e devolve o valor de CHAT.FILTRO ao que estava. */
const em=(nivel,fn)=>{const antes=CHAT.FILTRO;CHAT.FILTRO=nivel;try{return fn();}finally{CHAT.FILTRO=antes;}};

// ── O PADRÃO É LIVRE, E ISSO É DECISÃO DE PRODUTO ────────────────────────────
// Mascarar a linha de quem joga era o comportamento de estreia e o pedido do dono do jogo foi literal:
// chat livre, sem "quase". O que os portais pedem por escrito (silenciar, denunciar, kick/ban) não passa
// por aqui e continua valendo em qualquer nível.
test('padrão LIVRE: a linha da pessoa sai exatamente como foi escrita', () => {
  assert.equal(CHAT.FILTRO,'livre','o padrão do arquivo mudou sem o teste acompanhar');
  for(const s of ['que merda','you fuck','seu arrombado','vai tomar no cu'])
    assert.equal(mascara(s),s,`mascarou no nível livre: ${s}`);
});

test('livre não vale para o que o SERVIDOR gera: o bot xinga pesado, mas não inventa slur', () => {
  em('livre',()=>{
    assert.equal(sanitiza('seu arrombado'),'seu arrombado','xingar pesado é liberdade de sala');
    assert.equal(sanitiza('fuck you'),'fuck you');
    for(const t of ['seu viado','nigger','retardado'])
      assert.equal(sanitiza(t),null,`ÓDIO tem que ser recusado do bot em QUALQUER nível: ${t}`);
  });
});

test('o nick não segue o nível: ele fica na tela a partida inteira', () => {
  em('livre',()=>{
    assert.equal(normalizeNick('arrombado'),null,'nick continua recusando, mesmo com o chat livre');
    assert.equal(normalizeNick('FuckYou'),null);
    assert.equal(nickProibido('viado'),true);
    assert.equal(normalizeNick('Viajante'),'Viajante');
  });
});

test('nível PESADO: mascara insulto e slur, deixa o palavrão do dia a dia', () => {
  em('pesado',()=>{
    assert.equal(mascara('seu arrombado'),'seu a********');
    assert.equal(mascara('you fuck'),'you f***');
    assert.equal(mascara('que merda'),'que merda','`merda` é LEVE: só o nível `tudo` a pega');
  });
});

// ── E COM O FILTRO LIGADO, TUDO O QUE VALIA CONTINUA VALENDO ────────────────
// O nível `tudo` é exatamente o comportamento de estreia, e é para ele que se sobe antes de mandar um
// pacote a revisão de portal. O que estes testes protegem é o custo da peneira: o FALSO POSITIVO.
test('máscara: mantém a inicial e o tamanho, para a pessoa reconhecer o que escreveu', () => {
  em('tudo',()=>{
    assert.equal(mascara('que merda'),'que m****');
    assert.equal(mascara('you fuck'),'you f***');
    assert.equal(mascara('seu arrombado'),'seu a********');
  });
});

test('máscara: NÃO come fala legítima — é o custo que a torna aceitável', () => {
  em('tudo',()=>{
    for(const s of ['boa jogada','vem pela esquerda','o Pinto entrou','a bola rola ai','nice shot',
                    'to na frente','cuidado com a estrela','piranha do rio']){
      assert.equal(mascara(s),s,`mascarou fala normal: ${s}`);}
  });
});

test('os buracos que a lista original tinha: `fuck` e `shit` não estavam nela', () => {
  em('tudo',()=>{
    for(const p of ['fuck','fucking','motherfucker','shit','bullshit','wtf','stfu'])
      assert.notEqual(mascara(p),p,`${p} passou inteiro`);
  });
});

test('AMBIGUO recusa do bot e NÃO mascara do humano — os dois custos são diferentes', () => {
  em('tudo',()=>{
    for(const p of ['pinto','rola','bunda','piranha','macaco']){
      assert.ok(temGrave(p),`${p} deveria ser recusado do bot (lá o falso positivo custa uma frase enlatada)`);
      assert.equal(mascara(p),p,`${p} não pode ser mascarado na fala de uma pessoa`);}
  });
});

test('LEVE só mascara: recusar do bot o deixaria mais MUDO, não mais limpo', () => {
  em('tudo',()=>{
    // As entradas de LEVE são padrões de regex; aqui só interessam as que são palavra literal.
    const palavras=LEVE.map(x=>x.replace(/\\b/g,'')).filter(x=>!/[\[\]()?*+|\\]/.test(x));
    assert.ok(palavras.length>=8,'a lista encolheu demais para o teste dizer alguma coisa');
    for(const t of palavras)assert.equal(temGrave(t),false,`${t} não devia recusar a fala do bot`);
  });
});

test('nick: RECUSA, não mascara — e não segue o nível do chat', () => {
  em('tudo',()=>{
    assert.equal(normalizeNick('arrombado'),null);
    assert.equal(normalizeNick('FuckYou'),null);
    assert.equal(normalizeNick('Viajante'),'Viajante');
    assert.equal(normalizeNick('puma81'),'puma81');
  });
});

test('a peneira do bot continua valendo, e é a MESMA lista', () => {
  em('tudo',()=>{
    assert.equal(sanitiza('seu arrombado'),null);
    assert.equal(sanitiza('fuck you'),null);
    assert.equal(sanitiza('boa jogada'),'boa jogada');
  });
});

test('as quatro listas não se cruzam: um termo em dois grupos é regra ambígua', () => {
  const set=a=>new Set(a);
  const o=set(ODIO),g=set(GRAVE),l=set(LEVE),a=set(AMBIGUO);
  for(const t of g)assert.ok(!o.has(t),`${t} está em ODIO e em GRAVE`);
  for(const t of l){assert.ok(!o.has(t),`${t} está em ODIO e em LEVE`);
    assert.ok(!g.has(t),`${t} está em GRAVE e em LEVE`);}
  for(const t of a){assert.ok(!o.has(t),`${t} está em ODIO e em AMBIGUO`);
    assert.ok(!g.has(t),`${t} está em GRAVE e em AMBIGUO`);
    assert.ok(!l.has(t),`${t} está em LEVE e em AMBIGUO`);}
});

test('ODIO é o PISO do bot: recusado em todos os níveis, e mascarado quando o filtro está ligado', () => {
  for(const nivel of ['livre','pesado','tudo'])
    em(nivel,()=>{for(const t of ['nigger','seu viado','faggot','tranny'])
      assert.equal(sanitiza(t),null,`${t} passou na fala do bot no nível ${nivel}`);});
  em('pesado',()=>assert.notEqual(mascara('seu viado'),'seu viado','com o filtro ligado, ÓDIO também é mascarado'));
});
