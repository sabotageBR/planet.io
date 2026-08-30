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
