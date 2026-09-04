// ── KILL FEED: o dreno ────────────────────────────────────────────────────────
// Este arquivo existe por causa de um bug que passou despercebido justamente por não existir: `drenaFeed`
// devolvia o PRÓPRIO array da fila e logo depois o esvaziava, então 1 a 4 linhas — o caso de quase todo
// abate — saíam como `null` e o feed nunca chegava ao cliente. Só o lote de 5+ (supernova, fecho do gás)
// escapava, porque o ramo do teto já fazia `.slice()`. O `?local=1` copiava e não tinha o defeito, o que
// fez o sintoma existir só em produção. node --test server/test/feed.test.js
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {drenaFeed,createFeed} from '../src/rooms/feed.js';
import {FEED} from '@warspace/shared/constants.js';

const kill=n=>({k:'kill',a:n,b:n+1,how:'eat'});
const sys=n=>({k:'sys',a:n,b:-1,how:'lead'});

test('dreno: o lote NORMAL (1..MAX_PER_FLUSH) sai inteiro — era ele que virava null', () => {
  for(let n=1;n<=FEED.MAX_PER_FLUSH;n++){
    const fila=Array.from({length:n},(_,i)=>kill(i));
    const v=drenaFeed(fila);
    assert.ok(v,`${n} linha(s) deveria(m) sair, veio ${v}`);
    assert.equal(v.length,n);
    assert.equal(fila.length,0,'a fila é esvaziada pela chamada');}
});

test('dreno: fila vazia é null, e a saída não é o mesmo array da fila', () => {
  assert.equal(drenaFeed([]),null);
  const fila=[kill(1)],v=drenaFeed(fila);
  assert.notEqual(v,fila,'devolver o próprio array é o bug: o esvaziamento levaria o retorno junto');
});

test('dreno: acima do teto corta nas mais NOVAS e o abate ganha da linha de sistema', () => {
  const n=FEED.MAX_PER_FLUSH+3;
  const fila=Array.from({length:n},(_,i)=>kill(i));
  const v=drenaFeed(fila);
  assert.equal(v.length,FEED.MAX_PER_FLUSH);
  assert.equal(v[v.length-1].a,n-1,'a última da fila é a que sobrevive');
  // sistema só entra no espaço que os abates deixaram
  const mix=[sys(0),sys(1),sys(2),kill(3),kill(4)];
  const w=drenaFeed(mix);
  assert.equal(w.length,FEED.MAX_PER_FLUSH);
  assert.equal(w.filter(x=>x.k!=='sys').length,2,'os dois abates entram');
});

test('marcos: o primeiro líder não é notícia, e trocar exige margem, tempo e cooldown', () => {
  const f=createFeed();
  assert.equal(f.leadStep([{slot:1,mass:100},{slot:2,mass:90}],0),null,'primeiro líder não anuncia');
  // encostar não é ultrapassar
  assert.equal(f.leadStep([{slot:2,mass:101},{slot:1,mass:100}],10),null);
  const t0=100,rows=[{slot:2,mass:200},{slot:1,mass:100}];
  assert.equal(f.leadStep(rows,t0),null,'o candidato ainda não segurou o topo');
  const v=f.leadStep(rows,t0+FEED.LEAD_HOLD_TICKS);
  assert.ok(v&&v.how==='lead'&&v.a===2);
});

test('marcos: cada limiar do BIG CRUNCH avisa uma vez só', () => {
  const f=createFeed();
  const [primeiro]=FEED.CRUNCH_AT_S;
  assert.equal(f.crunchStep(primeiro+1),null);
  const v=f.crunchStep(primeiro);
  assert.ok(v&&v.how==='crunch'&&v.n===primeiro);
  assert.equal(f.crunchStep(primeiro),null,'o índice só anda para frente');
});

// ── O PAINEL NÃO HERDA O TETO DO KILL FEED ───────────────────────────────────
// `drenaFeed` corta em MAX_PER_FLUSH e DESCARTA o resto, de propósito: uma supernova que mata oito no
// mesmo tick viraria uma parede no canto da tela do jogo. Mas o /admin quer justamente as linhas
// descartadas — num fecho de gás são elas que contam a história. Por isso o fluxo ao vivo escuta
// `Sim._feed` (o funil ÚNICO, antes do teto) e nunca `Room.broadcastFeed`.
test('ao vivo: o espelho do /admin vê TUDO, inclusive o que o dreno joga fora', () => {
  const vistos=[];
  // O papel de `Sim._feed`: chama o espelho ANTES de qualquer corte. Se alguém inverter a ordem ou mover
  // a publicação para o broadcast, o painel passa a mentir calado — e nada mais neste repositório pega.
  const _feed=(fila,o)=>{vistos.push(o);if(fila.length<FEED.QUEUE_MAX)fila.push(o);};
  const fila=[],n=FEED.MAX_PER_FLUSH+4;
  for(let i=0;i<n;i++)_feed(fila,kill(i));
  const v=drenaFeed(fila);
  assert.equal(v.length,FEED.MAX_PER_FLUSH,'o JOGO continua com o teto — isto não pode mudar');
  assert.equal(vistos.length,n,'e o PAINEL recebeu as oito, não as quatro que sobreviveram ao dreno');
});

test('ao vivo: o espelho também vê o que o teto da FILA descartaria', () => {
  const vistos=[];
  const _feed=(fila,o)=>{vistos.push(o);if(fila.length<FEED.QUEUE_MAX)fila.push(o);};
  const fila=[],n=FEED.QUEUE_MAX+10;
  for(let i=0;i<n;i++)_feed(fila,kill(i));
  assert.equal(fila.length,FEED.QUEUE_MAX,'a fila do jogo satura');
  assert.equal(vistos.length,n,'o espelho não — ele é chamado antes do `if` do teto');
});
