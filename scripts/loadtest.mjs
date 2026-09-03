#!/usr/bin/env node
// ── TESTE DE CARGA: N clientes DE VERDADE contra um servidor de verdade ───────
//
//   node scripts/loadtest.mjs --n 500 --dur 300
//   node scripts/loadtest.mjs --n 50 --dur 60 --host http://192.168.12.50:30800 --sni warspace.io
//
// Cada cliente é uma sessão completa: guest pela API, WS no shard, `join`, INPUT a
// `--hz` e ping a 1 Hz. Não há render, não há predição e o snapshot NÃO é decodificado —
// só o primeiro byte (tipo) e o tamanho. É de propósito: quem tem que ser medido é o
// servidor, e um cliente que desserializa 10 000 mensagens/s vira ele mesmo o gargalo e
// mente sobre o RTT.
//
// ⚠️ TOKEN É OBRIGATÓRIO no join (hooks.onPlayerJoin recusa token ausente com AUTH), e
// `POST /api/auth/guest` tem rate de 30/h POR IP (auth/ratelimit.js). O XFF forjado daqui
// NÃO fura esse teto — MEDIDO em produção: o ingress-nginx SUBSTITUI o X-Forwarded-For e o
// servidor loga `10.32.0.1` para todo mundo, ou seja o limite é 30/h por SHARD para o site
// inteiro (90/h no total, e é assim que jogador de verdade também é contado). O que sobra é
// cache em disco (--tokens) mais REUSO: a mesma conta em vários sockets.
//
// ⚠️ O NICK vem da CONTA, nunca do cliente, e é ÚNICO POR SALA — daí o nick derivado do
// índice, e daí o reuso espalhar os clientes por mais salas do que 500 jogadores de verdade
// ocupariam (`findOrCreateRoom` pula a sala onde o nick já está em uso).
//
// ⚠️ `protocol` NÃO é mandado no join: `wsServer` só compara quando o campo vem
// (`msg.protocol!=null`), então o mesmo script serve para um servidor de outra versão.
// Em compensação a quantização do alvo usa o `world` que a sala manda no `room`.
// @ts-check
import {WebSocket} from 'ws';
import {fork} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

// ── argumentos ───────────────────────────────────────────────────────────────
const A=(()=>{const o={};for(let i=2;i<process.argv.length;i++){const a=process.argv[i];
  if(!a.startsWith('--'))continue;const k=a.slice(2);const v=process.argv[i+1];
  if(v==null||v.startsWith('--')){o[k]=true;continue;}o[k]=v;i++;}return o;})();
const num=(k,d)=>A[k]!=null?Number(A[k]):d;
const CFG={
  n:num('n',50),                          // jogadores
  host:String(A.host||'https://warspace.io'),   // base do /api (e do /ws, se --wshost não vier)
  wshost:A.wshost?String(A.wshost):null,
  sni:A.sni?String(A.sni):null,           // Host: a mandar quando se bate direto no ingress por IP
  ramp:num('ramp',15),                    // conexões por segundo
  dur:num('dur',120),                     // segundos DEPOIS que a rampa fecha
  hz:num('hz',20),                        // INPUT/s por cliente (teto do servidor: NET.RATE_INPUTS=40)
  mode:num('mode',0),                     // 0 = Livre, 1 = Battle Royale
  team:num('team',1),
  shards:num('shards',0),                 // 0 = descobre no /api/config
  view:String(A.view||'1600x900'),
  tokens:String(A.tokens||'/tmp/claude-1000/-home-evandro-git-em-tech-planet-io/df1c3556-64f5-4eee-81de-e923c9ce80bc/scratchpad/loadtest-tokens.json'),
  prefix:String(A.prefix||'LT'),
  workers:num('workers',0),               // 0 = decide pelo n (1 processo até 150 clientes)
  csv:A.csv?String(A.csv):null,
  quiet:!!A.quiet,
};
const [VW,VH]=CFG.view.split('x').map(Number);
const WS_BASE=(CFG.wshost||CFG.host).replace(/^http/,'ws').replace(/\/+$/,'');
const API=CFG.host.replace(/\/+$/,'');
const slice=process.env.LT_SLICE!=null?JSON.parse(process.env.LT_SLICE):null;   // {de,ate} no filho

// ── util ─────────────────────────────────────────────────────────────────────
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const pct=(a,p)=>{if(!a.length)return 0;const s=[...a].sort((x,y)=>x-y);return s[Math.min(s.length-1,Math.floor(s.length*p))];};
const fmtB=b=>b>=1048576?`${(b/1048576).toFixed(1)} MB`:b>=1024?`${(b/1024).toFixed(0)} KB`:`${b} B`;
// XFF próprio por conta: é o que faz o rate de 30/h por IP não morder. 10.0.0.0/8, que
// nenhum jogador de verdade usa — o log do servidor mostra de onde veio.
const xff=i=>`10.${(i>>16)&255}.${(i>>8)&255}.${i&255}`;
const headers=extra=>({'content-type':'application/json','user-agent':'warspace-loadtest/1',...(CFG.sni?{host:CFG.sni}:{}),...extra});

// ── contas (cache em disco) ──────────────────────────────────────────────────
async function pegaTokens(n){
  // `--anon`: servidor SEM banco aceita join sem token (hooks.onPlayerJoin cai em `unsaved`), e aí o
  // nick é o `fallbackNick`. É o modo da bancada local — em produção o banco está no ar e isto não vale.
  if(A.anon)return Array.from({length:n},(_,i)=>({nick:`${CFG.prefix}${String(i).padStart(4,'0')}`,token:null}));
  /** @type {{nick:string,token:string}[]} */let cache=[];
  try{cache=JSON.parse(readFileSync(CFG.tokens,'utf8'));}catch{}
  if(cache.length>=n)return cache.slice(0,n);
  const faltam=n-cache.length;
  console.log(`contas: ${cache.length} em cache, criando ${faltam}…`);
  const novos=[];let erros=0;
  const CONC=12;
  let idx=cache.length;
  await Promise.all(Array.from({length:CONC},async()=>{
    for(;;){
      const i=idx++;if(i>=n)return;
      const nick=`${CFG.prefix}${String(i).padStart(4,'0')}`;
      try{
        const r=await fetch(`${API}/api/auth/guest`,{method:'POST',headers:headers({'x-forwarded-for':xff(i+1)}),body:JSON.stringify({nick})});
        if(!r.ok){erros++;if(erros<5)console.warn(`  guest ${nick}: HTTP ${r.status} ${(await r.text()).slice(0,120)}`);continue;}
        const j=await r.json();novos.push({nick:j.user&&j.user.nick||nick,token:j.token});
      }catch(e){erros++;if(erros<5)console.warn(`  guest ${nick}: ${e.message}`);}
    }}));
  const todos=cache.concat(novos);
  try{mkdirSync(dirname(CFG.tokens),{recursive:true});writeFileSync(CFG.tokens,JSON.stringify(todos));}catch(e){console.warn('cache de tokens:',e.message);}
  if(erros)console.warn(`  ${erros} falha(s) ao criar conta`);
  if(todos.length<n)console.warn(`  só ${todos.length} conta(s) disponíveis (pedidas ${n})`);
  return todos.slice(0,n);
}

// ── um cliente ───────────────────────────────────────────────────────────────
// INPUT de 10 bytes (protocol/codec.js: encodeInput) escrito à mão para não arrastar o
// bundle do shared — e porque o `world` é o da SALA, não o da constante local.
const MSG_INPUT=0x01,MSG_SNAP=0x10,MSG_PONG=0x14;
function criaCliente(i,conta,st){
  const buf=Buffer.alloc(10);buf[0]=MSG_INPUT;
  const shard=st.vivos[i%st.vivos.length];
  const url=`${WS_BASE}/ws/${shard}`;
  const c={i,ws:null,dentro:false,seq:0,tick:0,world:12000,cx:0,cy:0,fase:Math.random()*6.28,
    raio:900+Math.random()*2600,vel:.4+Math.random()*.8,pingAt:0,timerI:0,timerP:0,vivo:true};
  const ws=new WebSocket(url,{headers:CFG.sni?{host:CFG.sni,origin:`https://${CFG.sni}`}:{},perMessageDeflate:false,maxPayload:1<<20});
  c.ws=ws;ws.binaryType='nodebuffer';
  ws.on('open',()=>{
    st.abertos++;
    ws.send(JSON.stringify({t:'join',token:conta.token,fallbackNick:conta.nick,mode:CFG.mode,teamSize:CFG.team,view:{w:VW,h:VH,z:1}}));
  });
  ws.on('message',(d,bin)=>{
    st.bytes+=d.length;st.msgs++;
    if(!bin){let m;try{m=JSON.parse(d.toString('utf8'));}catch{return;}
      if(m.t==='room'){
        if(!c.dentro){c.dentro=true;st.dentro++;}
        c.world=(m.world&&m.world.w)||12000;
        c.cx=c.world*(.2+Math.random()*.6);c.cy=c.world*(.2+Math.random()*.6);
        // INPUT e ping só começam DEPOIS do room: antes disso não há slot e o servidor descarta.
        // ⚠️ E LIMPAM os anteriores: morrer manda `join` de novo, o que traz um segundo `room` — sem
        // isto cada respawn somava um timer, a taxa de INPUT dobrava e o servidor derrubava o cliente
        // por `RATE` (4429). O sintoma ficava parecido com saturação do servidor e não era.
        clearInterval(c.timerI);clearInterval(c.timerP);
        c.timerI=setInterval(()=>manda(),Math.max(10,Math.round(1000/CFG.hz)));
        c.timerP=setInterval(()=>{if(ws.readyState===1){c.pingAt=Date.now();ws.send(JSON.stringify({t:'ping',c:c.pingAt>>>0}));}},1000);
      }else if(m.t==='error'){st.erros.set(m.code||'?',(st.erros.get(m.code||'?')||0)+1);}
      else if(m.t==='dead'){st.mortes++;
        // renascer é `leave`+`join`, exatamente como o botão DE NOVO do jogo faz
        setTimeout(()=>{if(ws.readyState===1)ws.send(JSON.stringify({t:'join',token:conta.token,fallbackNick:conta.nick,mode:CFG.mode,teamSize:CFG.team,view:{w:VW,h:VH,z:1}}));},1500+Math.random()*2000);}
      return;}
    const t=d[0];
    if(t===MSG_SNAP)st.snaps++;
    else if(t===MSG_PONG){const ct=d.readUInt32LE(1);const rtt=((Date.now()>>>0)-ct)|0;if(rtt>=0&&rtt<60000)st.rtt.push(rtt);}
  });
  ws.on('close',code=>{para();if(c.dentro)st.dentro--;st.abertos--;st.fechados++;
    if(code!==1000&&code!==1005)st.closeCodes.set(code,(st.closeCodes.get(code)||0)+1);});
  ws.on('error',e=>{st.sockErr.set(e.code||e.message.slice(0,40),(st.sockErr.get(e.code||e.message.slice(0,40))||0)+1);});
  function para(){c.vivo=false;clearInterval(c.timerI);clearInterval(c.timerP);}
  function manda(){
    if(ws.readyState!==1)return;
    // alvo em círculo: o planeta anda de verdade, a AOI muda de verdade e a comida é
    // consumida de verdade. Parado, o servidor faria o trabalho mais barato que existe.
    c.fase+=c.vel*.06;
    const tx=c.cx+Math.cos(c.fase)*c.raio,ty=c.cy+Math.sin(c.fase)*c.raio;
    const W=c.world;
    const qx=Math.max(0,Math.min(65535,Math.round(tx/W*65535))),qy=Math.max(0,Math.min(65535,Math.round(ty/W*65535)));
    const seq=(c.seq=(c.seq+1)&0xFFFF),ct=(c.tick=(c.tick+1)&0xFFFF);
    // dividir de vez em quando (flag SPLIT=1): é o que faz o servidor criar peça, e peça
    // nova é o que mais pesa no snapshot de todo mundo em volta
    const flags=(seq%600===0)?1:0;
    buf[1]=seq&255;buf[2]=seq>>8;buf[3]=qx&255;buf[4]=qx>>8;buf[5]=qy&255;buf[6]=qy>>8;buf[7]=flags;buf[8]=ct&255;buf[9]=ct>>8;
    ws.send(buf);st.enviados++;
  }
  return c;
}

// ── um processo de carga (pai sem workers, ou filho) ─────────────────────────
async function roda(de,ate,contas){
  const st={abertos:0,dentro:0,fechados:0,mortes:0,bytes:0,msgs:0,snaps:0,enviados:0,rtt:[],
    erros:new Map(),closeCodes:new Map(),sockErr:new Map(),shards:CFG.shards,vivos:null};
  // ⚠️ O SHARD VEM DO POD QUE ATENDE, NÃO DA CONTAGEM. `/api/config` anuncia `shards` como o TETO
  // (o `SHARDS` do ConfigMap, hoje 24 por causa do HPA), e o índice vivo pode ser qualquer
  // subconjunto dele — `i % shards` mandava metade dos clientes para `/ws/12..23`, que ainda não têm
  // pod, e o 503 parecia saturação do jogo. O cliente de verdade usa o campo `shard` da resposta
  // (`game/index.js`), que só pode vir de um pod PRONTO porque o Service da API balanceia entre eles;
  // aqui a mesma coisa, amostrada algumas vezes para achar o conjunto inteiro.
  if(!st.vivos){
    const achados=new Set();
    for(let i=0;i<40&&achados.size<(st.shards||99);i++){
      try{const r=await fetch(`${API}/api/config`,{headers:headers(),cache:'no-store'});const j=await r.json();
        if(j.shard!=null)achados.add(j.shard|0);if(j.shards)st.shards=j.shards;}catch{}}
    st.vivos=achados.size?[...achados].sort((a,b)=>a-b):[0];
    if(!slice)console.log(`shards vivos: ${st.vivos.join(',')} (teto anunciado: ${st.shards||'?'})`);}
  const clientes=[];
  const total=ate-de,porTick=Math.max(1,Math.round(CFG.ramp/10));
  // ⚠️ REUSO DE CONTA: `POST /api/auth/guest` tem rate de 30/h por (shard, IP) e o ingress-nginx
  // SUBSTITUI o X-Forwarded-For — o servidor vê 10.32.0.1 para todo mundo —, então não há como criar
  // uma conta por cliente. A mesma conta em N sockets é aceita (cada join abre a própria MatchSession);
  // o que ela NÃO pode é repetir DENTRO de uma sala, e `findOrCreateRoom` já pula a sala onde o nick
  // está em uso. O efeito colateral é espalhar mais: com poucas contas, mais salas.
  for(let k=0;k<total;k++){
    clientes.push(criaCliente(de+k,contas[(de+k)%contas.length],st));
    if((k+1)%porTick===0)await sleep(100);
  }
  const relata=()=>{const r={abertos:st.abertos,dentro:st.dentro,fechados:st.fechados,mortes:st.mortes,
      bytes:st.bytes,msgs:st.msgs,snaps:st.snaps,enviados:st.enviados,rtt:st.rtt,
      erros:[...st.erros],closeCodes:[...st.closeCodes],sockErr:[...st.sockErr]};
    st.bytes=0;st.msgs=0;st.snaps=0;st.enviados=0;st.rtt=[];st.fechados=0;st.mortes=0;
    st.erros.clear();st.closeCodes.clear();st.sockErr.clear();return r;};
  return {st,clientes,relata,
    fecha(){for(const c of clientes){try{if(c.ws.readyState===1){c.ws.send(JSON.stringify({t:'quit'}));c.ws.close(1000);}else c.ws.terminate();}catch{}}}};
}

// ── agregação e saída ────────────────────────────────────────────────────────
function zero(){return{abertos:0,dentro:0,fechados:0,mortes:0,bytes:0,msgs:0,snaps:0,enviados:0,rtt:[],erros:new Map(),closeCodes:new Map(),sockErr:new Map()};}
function soma(acc,r){acc.abertos+=r.abertos;acc.dentro+=r.dentro;acc.fechados+=r.fechados;acc.mortes+=r.mortes;
  acc.bytes+=r.bytes;acc.msgs+=r.msgs;acc.snaps+=r.snaps;acc.enviados+=r.enviados;acc.rtt.push(...r.rtt);
  for(const [k,v] of r.erros)acc.erros.set(k,(acc.erros.get(k)||0)+v);
  for(const [k,v] of r.closeCodes)acc.closeCodes.set(k,(acc.closeCodes.get(k)||0)+v);
  for(const [k,v] of r.sockErr)acc.sockErr.set(k,(acc.sockErr.get(k)||0)+v);return acc;}
const mapa=m=>[...m].map(([k,v])=>`${k}:${v}`).join(' ')||'—';

async function principal(){
  if(slice){   // ── filho ──
    const contas=JSON.parse(readFileSync(process.env.LT_CONTAS,'utf8'));
    const h=await roda(slice.de,slice.ate,contas);
    process.on('message',m=>{if(m==='relata')process.send(h.relata());
      else if(m==='fecha'){h.fecha();setTimeout(()=>process.exit(0),1500);}});
    process.send('pronto');
    return;
  }
  // ── pai ──
  console.log(`warspace loadtest · alvo ${CFG.host} · ${CFG.n} jogadores · rampa ${CFG.ramp}/s · ${CFG.dur}s · INPUT ${CFG.hz} Hz`);
  const contas=await pegaTokens(CFG.n);
  if(A.prep){console.log(`${contas.length} conta(s) prontas em ${CFG.tokens}`);return;}   // só semeia o cache e sai
  const n=CFG.n;
  if(contas.length<n)console.log(`⚠ ${contas.length} conta(s) para ${n} clientes: cada uma entra em ~${Math.ceil(n/contas.length)} salas diferentes`);
  const W=CFG.workers||(n<=150?1:Math.min(8,Math.ceil(n/150)));
  const t0=Date.now();
  const linhas=[];
  let filhos=[],local=null;
  if(W>1){
    const arq='/tmp/claude-1000/-home-evandro-git-em-tech-planet-io/df1c3556-64f5-4eee-81de-e923c9ce80bc/scratchpad/lt-contas.json';
    mkdirSync(dirname(arq),{recursive:true});writeFileSync(arq,JSON.stringify(contas));
    const passo=Math.ceil(n/W);
    console.log(`${W} processos × ~${passo} clientes`);
    for(let w=0;w<W;w++){
      const de=w*passo,ate=Math.min(n,(w+1)*passo);if(de>=ate)break;
      const f=fork(fileURLToPath(import.meta.url),process.argv.slice(2),
        {env:{...process.env,LT_SLICE:JSON.stringify({de,ate}),LT_CONTAS:arq},stdio:['ignore','inherit','inherit','ipc']});
      filhos.push(f);
    }
  }else{
    local=await roda(0,n,contas);
  }
  const coleta=()=>new Promise(res=>{
    if(!filhos.length)return res([local.relata()]);
    const out=[];let pend=filhos.length;const tm=setTimeout(()=>res(out),900);
    for(const f of filhos){const h=m=>{if(m==='pronto')return;f.off('message',h);out.push(m);if(--pend===0){clearTimeout(tm);res(out);}};f.on('message',h);f.send('relata');}
  });
  const espera=(CFG.n/CFG.ramp)+CFG.dur+3;
  const iv=setInterval(async()=>{
    const rs=await coleta();const a=rs.reduce(soma,zero());
    const s=Math.round((Date.now()-t0)/1000);
    const l={s,dentro:a.dentro,abertos:a.abertos,kbs:Math.round(a.bytes/1024),msgs:a.msgs,snaps:a.snaps,env:a.enviados,
      p50:pct(a.rtt,.5),p95:pct(a.rtt,.95),max:a.rtt.length?Math.max(...a.rtt):0,quedas:a.fechados,mortes:a.mortes};
    linhas.push(l);
    if(!CFG.quiet)console.log(`[${String(s).padStart(4)}s] dentro ${String(l.dentro).padStart(4)} · rx ${String(l.kbs).padStart(6)} KB/s (${String(l.snaps).padStart(5)} snap/s) · tx ${String(l.env).padStart(5)} in/s · rtt ${String(l.p50).padStart(4)}/${String(l.p95).padStart(5)}/${String(l.max).padStart(5)} ms · quedas ${l.quedas} · mortes ${l.mortes}${a.erros.size?` · ERRO ${mapa(a.erros)}`:''}${a.closeCodes.size?` · close ${mapa(a.closeCodes)}`:''}${a.sockErr.size?` · sock ${mapa(a.sockErr)}`:''}`);
    if(s>=espera)fim();
  },1000);
  let acabando=false;
  async function fim(){
    if(acabando)return;acabando=true;clearInterval(iv);
    console.log('\n── encerrando ──');
    if(filhos.length)for(const f of filhos)f.send('fecha');else local.fecha();
    await sleep(2000);
    const estaveis=linhas.filter(l=>l.dentro>=n*.9);
    const base=estaveis.length?estaveis:linhas;
    const med=k=>base.length?Math.round(base.reduce((s,l)=>s+l[k],0)/base.length):0;
    console.log(`\nRESUMO (${base.length}s com ≥90% dos clientes dentro)`);
    console.log(`  jogadores no jogo   : máx ${Math.max(0,...linhas.map(l=>l.dentro))} de ${n}`);
    console.log(`  RTT                 : p50 ${med('p50')} ms · p95 ${med('p95')} ms · pico ${Math.max(0,...base.map(l=>l.max))} ms`);
    console.log(`  banda para o cliente: ${med('kbs')} KB/s no total · ${(med('kbs')/Math.max(1,med('dentro'))).toFixed(1)} KB/s por jogador`);
    console.log(`  snapshots           : ${med('snaps')}/s (esperado ~${Math.round(med('dentro')*20)}/s a 20 Hz)`);
    console.log(`  INPUT enviado       : ${med('env')}/s`);
    console.log(`  quedas              : ${linhas.reduce((s,l)=>s+l.quedas,0)} · mortes ${linhas.reduce((s,l)=>s+l.mortes,0)}`);
    if(CFG.csv){writeFileSync(CFG.csv,'s,dentro,kbs,snaps,env,p50,p95,max,quedas,mortes\n'+linhas.map(l=>[l.s,l.dentro,l.kbs,l.snaps,l.env,l.p50,l.p95,l.max,l.quedas,l.mortes].join(',')).join('\n'));
      console.log(`  csv                 : ${CFG.csv}`);}
    setTimeout(()=>process.exit(0),1200);
  }
  process.on('SIGINT',fim);
}
principal().catch(e=>{console.error(e);process.exit(1);});
