// ── APELIDOS GERADOS: o validador e o balde, sem rede ─────────────────────────
// A geração depende de um Ollama e de sorte; o que NÃO pode depender de nenhum dos dois é o que cerca a
// geração — recusar o que não serve e nunca fazer a sala esperar. É isso que este arquivo trava.
//   node --test server/test/botnames.test.js
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {recusa,parseLote,createBotNames} from '../src/rooms/botNames.js';
import {BOT_NICKS,BOT_NAMES,BOT_LLM,botNick,botCountry} from '@warspace/shared/constants.js';
import {baseNick} from '@warspace/shared/util.js';
import {eggSkinFor} from '@warspace/shared/eggs.js';
import {createRng} from '@warspace/shared/rng.js';

// A roleta de `botCountry` é privada de constants.js; aqui basta a lista do que ela pode devolver, e ela
// sai da própria função — 400 sorteios cobrem até o país de peso 1.
const BOT_COUNTRY_CODES=(()=>{const rng=createRng(99),s=new Set();
  for(let i=0;i<400;i++)s.add(botCountry(rng,''));return s;})();

test('validador: cada regra existe por um motivo, e o motivo volta no nome da recusa',()=>{
  // ⚠️ A MAIS IMPORTANTE. O prompt pede "nada de celebridades" e um modelo escapa uma em dez — é a mesma
  // lição que a peneira da fala já custou. Um preenchimento chamado "messi" ganharia a caricatura do Messi
  // no `_quemE` e seria tratado como ele no chat: o oposto exato de passar por gente.
  for(const n of ['messi','lula','trump','einstein','ronaldinho','elonmusk'])
    assert.equal(recusa(n),'celebridade',`"${n}" ia entrar vestido de gente famosa`);
  // Sem raiz não há MENÇÃO: `citou` compara a raiz, e o bot ficaria surdo ao próprio nome.
  assert.equal(recusa('_'),'formato');
  assert.equal(recusa('__'),'sem-raiz');
  // Apelido que é palavra comum faz o bot responder a quem NÃO o chamou (o pecado grave de `citou`).
  for(const n of ['vem','pro','nao','kkk','noob']) assert.equal(recusa(n),'palavra-comum',`"${n}"`);
  // Se confunde com campo vazio no placar, no chat e no log.
  for(const n of ['null','undefined','NaN','none']) assert.equal(recusa(n),'valor-vazio',`"${n}"`);
  // A lista temática denuncia o preenchimento pelo NOME, antes de qualquer movimento denunciar.
  assert.equal(recusa('Nebulox'),'tematico');
  // Formato: 2..16, sem espaço, sem acento, sem pontuação — é o que o resto do jogo assume.
  for(const n of ['a','','joao silva','José','nome@casa','x'.repeat(17),' pad ',null,undefined])
    assert.equal(recusa(n),'formato',`"${n}"`);
  // ...e o que PASSA é o que uma pessoa escolheria de verdade
  for(const n of ['joaozinho','pizzalover','Kaua73','vitin_09','TURBO','mari','Lucas2010'])
    assert.equal(recusa(n),null,`"${n}" foi recusado e não devia`);
});

test('validador: nenhuma das bases de sempre seria recusada pelas regras novas',()=>{
  // Se o validador reprovasse o repertório fixo, ele estaria errado — é o mesmo jogo, o mesmo placar e o
  // mesmo `citou`. As exceções conhecidas são as bases curtas que JÁ são palavra comum, e elas passam pelo
  // caminho antigo porque `botNick` costuma colar um número.
  const recusados=BOT_NICKS.filter(n=>recusa(n));
  const motivos=new Set(recusados.map(n=>recusa(n)));
  assert.ok(!motivos.has('celebridade'),`base de bot casando com easter egg: ${recusados.join(', ')}`);
  assert.ok(recusados.length<=BOT_NICKS.length*.05,
    `${recusados.length} de ${BOT_NICKS.length} bases recusadas — o validador está apertado demais: ${recusados.slice(0,8)}`);
});

test('parser: o lote sobrevive ao lixo que sempre vem junto',()=>{
  const cru=`Here are 6 usernames:
1. joaozinho
2) pizzaman
- vitin09
* "TURBO"
messi
uma linha com espacos
  mari
\`\`\`
`;
  const v=parseLote(cru);
  assert.deepEqual(v,['joaozinho','pizzaman','vitin09','TURBO','mari']);
  assert.ok(!v.includes('messi'),'o parser aplica o validador: celebridade não passa nem aqui');
  // e o pior caso não pode LANÇAR: é chamado no meio de um `.catch()`
  for(const v of ['',null,undefined,'\n\n\n','...']) assert.doesNotThrow(()=>parseLote(v));
  assert.deepEqual(parseLote(null),[]);
});

test('balde: NUNCA faz a sala esperar, e sem LLM simplesmente não existe',()=>{
  // A regra que sustenta a feature inteira: `take` é síncrono e devolver `null` é a resposta NORMAL —
  // é ela que devolve a sala para `botNick`, que é o CHÃO.
  const vazio=createBotNames({llm:null});
  assert.equal(vazio.take(new Set()),null);
  assert.equal(vazio.size,0);
  assert.doesNotThrow(()=>{vazio.start();vazio.stop();});
  // LLM fora do ar (o disjuntor abriu): idem, e sem exceção nenhuma
  const fora=createBotNames({llm:{ok:()=>false,chat:async()=>{throw new Error('nao');}}});
  fora.start();
  assert.equal(fora.take(new Set()),null);
  fora.stop();
});

test('balde: serve o que gerou, respeita os nomes já em uso na sala e não repete',async()=>{
  let pedidos=0;
  const llm={ok:()=>true,chat:async()=>{pedidos++;
    return'joaozinho\npizzaman\nvitin09\nTURBO\nmari\nmessi\nvem';}};
  const bn=createBotNames({llm});
  bn.start();
  await new Promise(r=>setTimeout(r,30));   // o `enche` do start é assíncrono
  assert.ok(bn.size>0,'o balde encheu');
  // ⚠️ São NICK_FILL_PAR pedidos, não um: um lote é de UM país só, e um balde de um país só era servido
  // em sequência — a sala inteira nascia com a mesma bandeira. Vários lotes pequenos e simultâneos, de
  // países diferentes, custam o mesmo e dão bandeira variada.
  assert.equal(pedidos,BOT_LLM.NICK_FILL_PAR);
  const usados=new Set(['turbo']);          // já tem um TURBO na sala
  const vistos=new Set();
  for(let i=0;i<5;i++){const g=bn.take(usados);if(!g)break;
    assert.ok(!usados.has(g.nick.toLowerCase()),'serviu um nome que já estava na sala');
    assert.equal(recusa(g.nick),null,`serviu "${g.nick}", que o validador reprova`);
    assert.ok(!vistos.has(g.nick),'repetiu no mesmo balde');vistos.add(g.nick);
    assert.match(g.pais,/^[A-Z]{2}$/,'o país vem JUNTO com o apelido — é a inversão que a feature faz');}
  assert.ok(vistos.size>=3,`serviu só ${vistos.size}`);
  bn.stop();
});

test('balde: os lotes são de países DIFERENTES, e o take alterna bandeira',async()=>{
  // O defeito que este teste tranca foi visto em produção: as 7 linhas do placar com a MESMA bandeira.
  // A causa eram duas somadas — um lote inteiro de um país só e um `take` em LIFO, que serve o lote na
  // ordem em que ele chegou.
  let n=0;
  const llm={ok:()=>true,chat:async()=>{n++;return Array.from({length:6},(_,i)=>`nick${n}x${i}`).join('\n');}};
  const bn=createBotNames({llm});
  bn.start();
  await new Promise(r=>setTimeout(r,40));
  const paises=new Set();
  for(let i=0;i<6;i++){const g=bn.take(new Set());if(!g)break;paises.add(g.pais);}
  assert.ok(paises.size>=2,`seis apelidos seguidos saíram com ${paises.size} bandeira(s)`);
  bn.stop();
});

test('balde: a bandeira que a SALA já tem no teto é PULADA, não descartada',async()=>{
  // O balde é de PROCESSO e não sabe quem está em qual sala — quem conhece a diversidade da mesa é o
  // Room, e é ele que passa `evita`. O item evitado fica para a PRÓXIMA sala, que pode não ter aquela
  // bandeira; sem nada servível o balde devolve `null` e a sala volta ao chão (`botNick`), que sorteia o
  // país por conta própria.
  const llm={ok:()=>true,chat:async()=>'joaozinho\npizzaman\nvitin09\nmari'};
  const bn=createBotNames({llm});
  bn.start();
  await new Promise(r=>setTimeout(r,40));
  const tam=bn.size;
  assert.ok(tam>0,'o balde encheu');
  const veto=new Set(BOT_COUNTRY_CODES);                    // a sala já está no teto em TODAS as bandeiras
  assert.equal(bn.take(new Set(),veto),null,'serviu uma bandeira que a sala pediu para evitar');
  assert.equal(bn.size,tam,'o item evitado foi consumido — ele tinha que ficar para a próxima sala');
  assert.ok(bn.take(new Set()),'e sem veto ele continua servindo normalmente');
  bn.stop();
});

test('balde: o que sai dele nunca vira caricatura por acidente',()=>{
  // O teste de eggs varre BOT_NICKS e BOT_NAMES — as listas ESTÁTICAS. Nada que venha de fora passa por
  // lá, e é este o furo que o validador fecha.
  const cru=['messi','Messi','MESSI','messi42','lula','trump','xXmessiXx'].join('\n');
  for(const n of parseLote(cru)) assert.equal(eggSkinFor(n),null,`"${n}" saiu do parser e casa com um egg`);
});

test('balde: o apelido servido continua reconhecível quando alguém o chama',()=>{
  // `citou` compara a RAIZ. Um apelido sem raiz deixa o bot surdo ao próprio nome — e é o mesmo contrato
  // que `botNick` cumpre há tempo (botchat.test.js cobra `baseNick(n).length>=2` sobre 200 sorteios).
  const rng=createRng(4242),usados=new Set();
  for(let i=0;i<50;i++){const n=botNick(rng,usados);assert.ok(baseNick(n).length>=2);}
  for(const n of parseLote('joaozinho\npizzaman\nvitin09\nmari\nLucas2010'))
    assert.ok(baseNick(n).length>=2,`"${n}" não tem raiz`);
});

test('constantes: o lote cabe no que se pede ao modelo',()=>{
  // ⚠️ O default de NUM_PREDICT (48) é de UMA linha de chat: com ele o lote sairia cortado no meio e
  // ninguém veria — só um balde que nunca enche.
  assert.ok(BOT_LLM.NICK_NUM_PREDICT>=BOT_LLM.NICK_LOTE*8,'não cabem os apelidos pedidos no orçamento de tokens');
  assert.ok(BOT_LLM.NICK_TIMEOUT_MS>BOT_LLM.TIMEOUT_MS,'o lote não tem prazo; a fala tem — não podem usar o mesmo');
  assert.ok(BOT_LLM.NICK_POOL_MIN<BOT_LLM.NICK_POOL_MAX);
  assert.ok(BOT_LLM.NICK_LOTE>0&&BOT_LLM.NICK_LOTE<=BOT_LLM.NICK_POOL_MAX);
  // ⚠️ O balde se reabastece por BANDEIRAS além de por apelidos: pedir mais bandeiras do que a roleta
  // tem para dar seria pedir um enchimento que nunca termina — e ele é disparado a cada nascimento.
  assert.ok(BOT_LLM.NICK_PAISES_MIN<=BOT_COUNTRY_CODES.size,
    `${BOT_LLM.NICK_PAISES_MIN} bandeiras pedidas e só ${BOT_COUNTRY_CODES.size} na roleta`);
  assert.ok(BOT_LLM.NICK_FILL_PAR*BOT_LLM.NICK_LOTE<=BOT_LLM.NICK_POOL_MAX,
    'uma rodada de enchimento sozinha estoura o teto do balde');
});
