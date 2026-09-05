// ── O NICK SORTEADO PARA O JOGADOR: o validador, a lista fixa e a rota ────────
// A tela inicial entrega o campo de nome já preenchido. A LLM é a primeira escolha e depende de um
// Ollama e de sorte; o que NÃO pode depender de nenhum dos dois é o que cerca a geração — recusar o
// que não serve, nunca entregar um nome que a sala vai recusar, e obedecer ao interruptor do /admin.
//   node --test server/test/nickpool.test.js
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {recusaJogador,createNickPool} from '../src/auth/nickPool.js';
import {normalizeNick} from '../src/auth/nick.js';
import {nickProibido} from '../src/palavrao.js';
import {COMUNS} from '../src/rooms/botChat.js';
import {PLAYER_NICKS,ENTRY} from '@warspace/shared/constants.js';
import {baseNick,normalizar} from '@warspace/shared/util.js';

const {startServer}=await import('../src/index.js');
const LOG='error';

test('a lista fixa passa nas peneiras do SERVIDOR, não só nas do shared',()=>{
  // Estas duas regras não cabem em `shared/test/nicks.test.js` (shared não conhece o servidor), e são
  // justamente as que decidem se o nick sobrevive à entrada: `nickProibido` RECUSA o nick — ele fica no
  // placar, no feed e no radar a partida inteira —, e uma raiz que é palavra comum faz o bot responder
  // a quem NÃO o chamou.
  for(const n of PLAYER_NICKS){
    assert.ok(!nickProibido(n),`nick proibido: ${n}`);
    assert.ok(!COMUNS.has(normalizar(n)),`palavra comum: ${n}`);
    assert.ok(!COMUNS.has(baseNick(n)),`raiz é palavra comum: ${n}`);
    // e o servidor tem que aceitá-lo COMO ESTÁ: `normalizeNick` recusa (não apara) o que não serve
    assert.equal(normalizeNick(n),n,`normalizeNick mudou ou recusou: ${n}`);
  }
});

test('validador: tudo que `recusa()` já cobra, mais a fronteira com o preenchimento',()=>{
  // A regra PRÓPRIA daqui. Nick igual ao de um bot na mesma sala faz `Room.nickTaken` recusar a entrada
  // do jogador com NICK_IN_ROOM — uma recusa aleatória, na porta, sem nada explicando.
  for(const n of ['Lucas','ninja','kraken','tapioca','cowboy'])
    assert.equal(recusaJogador(n),'nome-de-bot',`"${n}" também é nick de preenchimento`);
  // e o que ele herda de `recusa()` continua valendo
  for(const n of ['messi','lula','einstein'])assert.equal(recusaJogador(n),'celebridade',`"${n}"`);
  for(const n of ['null','undefined','NaN'])assert.equal(recusaJogador(n),'valor-vazio',`"${n}"`);
  assert.equal(recusaJogador('a b'),'formato');
  assert.equal(recusaJogador(' pad '),'formato','não pode APARAR: valida o que vai ser usado');
  // o que serve, passa
  for(const n of ['Quasar','nebula_42','ORBITA','pudim9'])assert.equal(recusaJogador(n),null,`"${n}"`);
});

test('o balde sem LLM é inerte: `take` devolve null e ninguém espera',()=>{
  // É a resposta NORMAL — sem OLLAMA_URL, com o disjuntor aberto ou com o balde vazio, quem chama volta
  // a `playerNick`. E `start()` sem `llm` não pode nem criar o relógio.
  const pool=createNickPool({llm:null});
  pool.start();
  assert.equal(pool.take(new Set()),null);
  assert.equal(pool.size,0);
  pool.stop();
  // com um llm que diz "não estou disponível", idem — e sem lançar
  const mudo=createNickPool({llm:{ok:()=>false,chat:async()=>{throw new Error('não devia ser chamado');}}});
  assert.equal(mudo.take(new Set()),null);
});

test('o balde peneira o lote e nunca entrega um nome ocupado',async()=>{
  // Um "Ollama" de mentira: devolve a lista crua, com o lixo que sempre vem junto (numeração, prefácio,
  // aspas) e com dois nomes que TÊM que ser recusados — um nick de bot e uma celebridade.
  const llm={ok:()=>true,chat:async()=>`Here are the names:
1. Quasar_77
2. kraken
- "pudim9"
messi
Nebulosa42
`};
  const pool=createNickPool({llm});
  pool.start();
  await new Promise(r=>setTimeout(r,20));
  const saiu=new Set();
  for(let i=0;i<3;i++){const n=pool.take(new Set());if(n)saiu.add(n);}
  assert.ok(saiu.has('Quasar_77')&&saiu.has('pudim9')&&saiu.has('Nebulosa42'),`saiu: ${[...saiu]}`);
  assert.ok(!saiu.has('kraken'),'entregou um nick de preenchimento');
  assert.ok(!saiu.has('messi'),'entregou uma celebridade');
  pool.stop();
  // e o `usados` da sala descarta o item em vez de devolvê-lo
  const p2=createNickPool({llm});p2.start();
  await new Promise(r=>setTimeout(r,20));
  const ocupados=new Set(['quasar_77','pudim9','nebulosa42']);
  assert.equal(p2.take(ocupados),null,'entregou um nome que já está na sala');
  p2.stop();
});

test('GET /api/nick: sorteia fora do que está em uso, e o interruptor do /admin manda',async()=>{
  const srv=await startServer({port:0,databaseUrl:'',logLevel:LOG});
  const base=`http://127.0.0.1:${srv.port}`;
  const pedir=async()=>(await (await fetch(`${base}/api/nick`)).json());
  try{
    // uma sala viva: os nicks dela (humanos E preenchimentos) são o "em uso naquele momento"
    const room=srv.rooms.findOrCreateRoom({});
    assert.ok(room.usedNicks.size>0,'a sala nasceu sem preenchimento nenhum');
    const usados=new Set(room.usedNicks);
    for(let i=0;i<120;i++){
      const {nick}=await pedir();
      assert.ok(nick,'não veio nick');
      assert.ok(!usados.has(String(nick).toLowerCase()),`entregou um nick que está na sala: ${nick}`);
      assert.equal(normalizeNick(nick),nick,`o servidor recusaria o próprio sorteio: ${nick}`);
    }
    // ⚠️ O INTERRUPTOR. `null` é uma RESPOSTA e não uma falha: é assim que o cliente distingue "o admin
    // desligou" (campo vazio) de "a chamada falhou" (lista local).
    ENTRY.NICK_AUTO=false;
    assert.deepEqual(await pedir(),{nick:null});
    ENTRY.NICK_AUTO=true;
    assert.ok((await pedir()).nick,'não voltou ao religar');
  }finally{ENTRY.NICK_AUTO=true;await srv.close();}
});

test('sem balde, a rota ainda responde — a lista fixa é o chão',async()=>{
  // O caminho de produção sem `OLLAMA_URL`, que é o caso normal: `nickPool` nem é criado.
  const srv=await startServer({port:0,databaseUrl:'',logLevel:LOG});
  try{
    const {nick}=await (await fetch(`http://127.0.0.1:${srv.port}/api/nick`)).json();
    assert.ok(nick,'não veio nick');
    assert.ok(PLAYER_NICKS.some(b=>String(nick).toLowerCase().startsWith(b.toLowerCase())),
      `não saiu da lista fixa: ${nick}`);
  }finally{await srv.close();}
});
