// O JOGAR (AUTO) agrupa até o teto e daí em diante ESPALHA. O que estes testes travam é o defeito medido
// em produção em 2026-09-05: a regra era "a sala mais cheia do cluster", e ela empilhou 55 humanos e 4
// salas num shard (a 1198m de CPU, travando) contra 1 humano em cada um dos outros dois, ociosos.
import test from 'node:test';
import assert from 'node:assert/strict';
import {ROOM} from '@warspace/shared/constants.js';
import {escolheSala,cargaPorShard} from '../src/rooms/matchmaking.js';

const sala=(o={})=>({code:o.code||'0AAA',shard:o.shard|0,mode:o.mode|0,teamSize:o.teamSize||1,
  players:o.players|0,bots:o.bots|0,max:o.max||50,open:o.open!==undefined?o.open:true});
const auto=(salas,o={})=>escolheSala(salas,{mode:0,teamSize:1,shard:0,...o});

test('sala vazia junta gente: com folga, o destino é a MAIS cheia', ()=>{
  const a=sala({code:'0AAA',players:3}),b=sala({code:'0BBB',players:9});
  assert.equal(auto([a,b]).code,'0BBB');
});

test('acima de ROOM.SOFT a sala sai do automático — sem fechar a porta dela', ()=>{
  const cheia=sala({code:'0AAA',players:ROOM.SOFT}),nova=sala({code:'0BBB',players:2});
  assert.equal(auto([cheia,nova]).code,'0BBB');
  assert.equal(cheia.open,true,'continua aberta: código, convite e equipe entram até o max');
});

test('todas no teto: cria sala NOVA neste shard (null), em vez de empilhar', ()=>{
  assert.equal(auto([sala({code:'0AAA',players:ROOM.SOFT})]),null);
});

test('o shard saturado sai do pool, mesmo com sala vazia dentro dele', ()=>{
  // o shard 2 tem uma sala vazia, mas o processo dele já está no teto de planetas
  const lotado=sala({code:'2AAA',shard:2,players:1}),carga=sala({code:'2BBB',shard:2,players:ROOM.SHARD_SOFT});
  const outra=sala({code:'1AAA',shard:1,players:5});
  assert.equal(auto([lotado,carga,outra],{shard:1}).code,'1AAA');
});

test('os PREENCHIMENTOS contam na carga do shard (o lobby de BR com 2 humanos e 48 bots)', ()=>{
  const c=cargaPorShard([sala({shard:2,players:2,bots:48})]);
  assert.equal(c.get(2),50);
  // e por isso um shard assim não recebe sala nova: o `null` viraria mais uma sala no pod que já está no teto
  const br=sala({code:'2AAA',shard:2,players:2,bots:ROOM.SHARD_SOFT});
  assert.notEqual(auto([br],{shard:2}),null);
});

test('cluster inteiro no teto: vai para a MENOS cheia (o contrário da regra velha)', ()=>{
  const a=sala({code:'0AAA',players:ROOM.SHARD_SOFT}),b=sala({code:'1AAA',shard:1,players:ROOM.SHARD_SOFT+5});
  assert.equal(auto([a,b],{shard:0}).code,'0AAA');
});

test('modo e tamanho de equipe continuam sendo filtro duro', ()=>{
  const livre=sala({code:'0AAA',players:9}),br=sala({code:'0BBB',mode:1,teamSize:2,players:9});
  assert.equal(auto([livre,br],{mode:1,teamSize:2}).code,'0BBB');
  assert.equal(auto([livre,br],{mode:1,teamSize:4}),null,'nenhuma serve: abre uma aqui');
});

test('`open:false` (BR já em partida) fica de fora; irmão em build antiga cai na conta velha', ()=>{
  assert.equal(auto([sala({code:'0AAA',players:9,open:false})]),null);
  const velho={code:'1AAA',shard:1,mode:0,teamSize:1,players:9,bots:0,max:50};   // sem `open`
  assert.equal(auto([velho]).code,'1AAA');
});

test('sala sem nada devolve null: a primeira do cluster nasce aqui', ()=>{
  assert.equal(auto([]),null);
});
