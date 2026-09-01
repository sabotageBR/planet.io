// ── MODERAÇÃO: a peneira, o nick e a denúncia ─────────────────────────────────
// Este arquivo existe porque a moderação estava do lado ERRADO: havia peneira de palavrão só na saída da
// LLM (`sanitiza`), ou seja o PREENCHIMENTO era censurado e a PESSOA não — a linha de um humano ia para a
// sala inteira depois de três transformações puramente mecânicas. O que se trava aqui é o comportamento
// que os portais pedem (PEGI 12, e o jogador conseguir se proteger de outro) e, sobretudo, os FALSOS
// POSITIVOS: mascarar "o Pinto entrou" ou "a bola rola" é pior que o palavrão que se queria pegar.
// node --test server/test/moderacao.test.js
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mascara,temGrave,GRAVE,LEVE,AMBIGUO} from '../src/palavrao.js';
import {normalizeNick} from '../src/auth/nick.js';
import {sanitiza} from '../src/rooms/botChat.js';

test('máscara: mantém a inicial e o tamanho, para a pessoa reconhecer o que escreveu', () => {
  assert.equal(mascara('que merda'),'que m****');
  assert.equal(mascara('you fuck'),'you f***');
  assert.equal(mascara('seu arrombado'),'seu a********');
});

test('máscara: NÃO come fala legítima — é o custo que a torna aceitável', () => {
  for(const s of ['boa jogada','vem pela esquerda','o Pinto entrou','a bola rola ai','nice shot',
                  'to na frente','cuidado com a estrela','piranha do rio']){
    assert.equal(mascara(s),s,`mascarou fala normal: ${s}`);}
});

test('os buracos que a lista original tinha: `fuck` e `shit` não estavam nela', () => {
  for(const p of ['fuck','fucking','motherfucker','shit','bullshit','wtf','stfu'])
    assert.notEqual(mascara(p),p,`${p} passou inteiro`);
});

test('AMBIGUO recusa do bot e NÃO mascara do humano — os dois custos são diferentes', () => {
  for(const p of ['pinto','rola','bunda','piranha','macaco']){
    assert.ok(temGrave(p),`${p} deveria ser recusado do bot (lá o falso positivo custa uma frase enlatada)`);
    assert.equal(mascara(p),p,`${p} não pode ser mascarado na fala de uma pessoa`);}
});

test('LEVE só mascara: recusar do bot o deixaria mais MUDO, não mais limpo', () => {
  // As entradas de LEVE são padrões de regex; aqui só interessam as que são palavra literal.
  const palavras=LEVE.map(x=>x.replace(/\\b/g,'')).filter(x=>!/[\[\]()?*+|\\]/.test(x));
  assert.ok(palavras.length>=8,'a lista encolheu demais para o teste dizer alguma coisa');
  for(const t of palavras)assert.equal(temGrave(t),false,`${t} não devia recusar a fala do bot`);
});

test('nick: RECUSA, não mascara — ele fica na tela a partida inteira', () => {
  assert.equal(normalizeNick('arrombado'),null);
  assert.equal(normalizeNick('FuckYou'),null);
  assert.equal(normalizeNick('Viajante'),'Viajante');
  assert.equal(normalizeNick('puma81'),'puma81');
});

test('a peneira do bot continua valendo, e agora é a MESMA lista', () => {
  assert.equal(sanitiza('seu arrombado'),null);
  assert.equal(sanitiza('fuck you'),null);
  assert.equal(sanitiza('boa jogada'),'boa jogada');
});

test('as três listas não se cruzam: um termo em dois grupos é regra ambígua', () => {
  const set=a=>new Set(a);
  const g=set(GRAVE),l=set(LEVE),a=set(AMBIGUO);
  for(const t of l)assert.ok(!g.has(t),`${t} está em GRAVE e em LEVE`);
  for(const t of a){assert.ok(!g.has(t),`${t} está em GRAVE e em AMBIGUO`);
    assert.ok(!l.has(t),`${t} está em LEVE e em AMBIGUO`);}
});
