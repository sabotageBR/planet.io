// O JOGAR (AUTO) agrupa até o teto e daí em diante ESPALHA. O que estes testes travam é o defeito medido
// em produção em 2026-09-05: a regra era "a sala mais cheia do cluster", e ela empilhou 55 humanos e 4
// salas num shard (a 1198m de CPU, travando) contra 1 humano em cada um dos outros dois, ociosos.
import test from 'node:test';
import assert from 'node:assert/strict';
import {ROOM} from '@warspace/shared/constants.js';
import {escolheSala,cargaPorShard} from '../src/rooms/matchmaking.js';

const sala=(o={})=>({code:o.code||'0AAA',shard:o.shard|0,mode:o.mode|0,teamSize:o.teamSize||1,
  players:o.players|0,bots:o.bots|0,max:o.max||50,open:o.open!==undefined?o.open:true,
  ...(o.round!==undefined?{round:o.round}:{})});
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

test('a carga do shard soma as TRÊS coisas que custam, com o peso de cada uma', ()=>{
  // os pesos saem da medição de 2026-09-05 (ver ROOM.CUSTO_* em constants): sessão 1, bot ~.1, sala ~3.5
  const c=cargaPorShard([sala({shard:2,players:2,bots:48}),sala({shard:2,players:5,bots:0})]);
  assert.equal(Math.round(c.get(2)*10)/10,Math.round((7+48*ROOM.CUSTO_BOT+2*ROOM.CUSTO_SALA)*10)/10);
  assert.ok(c.get(2)>7,'o lobby de BR parado com 48 preenchimentos não pode aparecer como 2 pessoas');
  assert.ok(c.get(2)<55,'nem como 50: bot não custa uma sessão');
});

test('a SALA pesa mesmo vazia — seis delas num pod custam mais que vinte pessoas jogando', ()=>{
  const vazias=[];for(let i=0;i<12;i++)vazias.push(sala({code:`0V${i}`,shard:0,players:0,bots:0}));
  assert.ok(cargaPorShard(vazias).get(0)>=ROOM.SHARD_SOFT,'um pod cheio de salas vazias está cheio');
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

// ── RODADA ACABANDO ── (Fit Test 25/09: 23 primeiras vidas terminaram no BIG CRUNCH aos ~84 s)
test('sala do Livre com a rodada acabando sai do automático quando há outra', ()=>{
  const acabando=sala({code:'0AAA',players:9,round:ROOM.ROUND_LEFT_MIN_S-1}),inteira=sala({code:'0BBB',players:3,round:1500});
  assert.equal(auto([acabando,inteira]).code,'0BBB');
});

test('só salas acabando e folga aqui: abre uma NOVA (rodada inteira), não o pódio', ()=>{
  assert.equal(auto([sala({code:'0AAA',players:9,round:60})]),null);
});

test('`round` null (sala sem fim) e ausente (irmão antigo) não são "acabando"', ()=>{
  assert.equal(auto([sala({code:'0AAA',players:9,round:null})]).code,'0AAA');
  assert.equal(auto([sala({code:'0BBB',players:9})]).code,'0BBB');
});

test('sem folga em lugar nenhum, a sala acabando ainda serve — fila num .io é jogador indo embora', ()=>{
  const a=sala({code:'0AAA',players:ROOM.SHARD_SOFT,round:30});
  assert.equal(auto([a],{shard:0}).code,'0AAA');
  // e entre uma acabando e uma inteira, no teto, fica a inteira
  const b=sala({code:'1AAA',shard:1,players:ROOM.SHARD_SOFT+2,round:1200});
  assert.equal(auto([a,b],{shard:0}).code,'1AAA');
});

test('o Battle Royale não é filtrado: a sala aberta dele está no lobby', ()=>{
  const lobby=sala({code:'0AAA',mode:1,teamSize:1,players:4,round:30});
  assert.equal(auto([lobby],{mode:1,teamSize:1}).code,'0AAA');
});
