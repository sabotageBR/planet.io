// ── Testes do codec binário (node --test) ────────────────────────────────────
// @ts-check
import {test} from "node:test";
import assert from "node:assert/strict";
import {packDir,unpackDir} from "../src/util.js";
import {WORLD} from "../src/constants.js";
import {createRng} from "../src/rng.js";
import {PIECE_FLAG,MSG,KIND,UPD,EVENT,NAME_MAX_BYTES,INPUT_BYTES,SNAPSHOT_HEADER_BYTES,SELF_BYTES,ZONE_BYTES,
  VOICE_HEADER_BYTES,VOICE_UP_HEADER_BYTES,NO_TEAM,
  createWriter,createReader,qPos,dqPos,encodeInput,decodeInput,encodeSnapshot,decodeSnapshot,encodePlayers,decodePlayers,
  encodeLeaderboard,decodeLeaderboard,encodeEvent,decodeEvent,encodePong,decodePong,decodeMessage,
  encodeZone,decodeZone,encodeVoice,decodeVoice,encodeVoiceUp,decodeVoiceUp} from "../src/protocol/index.js";

// ── Utilidades: erro máximo de quantização e geradores determinísticos ───────
const EPS_POS=WORLD.w/65535,EPS_R=.05,EPS_V=.5;
const rng=createRng(20260826);
const near=(a,b,eps,msg)=>assert.ok(Math.abs(a-b)<=eps+1e-9,`${msg}: ${a} vs ${b} (eps ${eps})`);
const rx=()=>rng.range(0,WORLD.w),ry=()=>rng.range(0,WORLD.h),rr=()=>rng.range(6,290),rv=()=>rng.range(-3000,3000),slot=()=>rng.int(0,29);
const u16=()=>rng.int(0,65535),u32=()=>rng.int(0,4294967295);
let nextId=1;
const KINDS=Object.values(KIND);
function randCreate(kind){const e={kind,id:nextId++,x:rx(),y:ry(),r:rr()};
  switch(kind){
    case KIND.PIECE:Object.assign(e,{owner:slot(),vx:rv(),vy:rv(),flags:rng.int(0,15)});break;
    case KIND.FOOD:Object.assign(e,{type:rng.int(0,10),hue:rng.int(0,11)});break;
    case KIND.EJECT:Object.assign(e,{owner:slot(),hue:rng.int(0,11),vx:rv(),vy:rv()});break;
    case KIND.ASTEROID:Object.assign(e,{seed:u16(),vx:rv(),vy:rv()});break;
    case KIND.BLACKHOLE:case KIND.STAR:Object.assign(e,{seed:u16(),influenceR:rng.int(0,3000),phase:rng.int(0,2)});break;
    case KIND.MISSILE:Object.assign(e,{owner:slot(),target:slot(),vx:rv(),vy:rv(),weapon:rng.int(0,3)});break;}
  return e;}
function assertCreate(got,exp){assert.deepEqual(Object.keys(got).sort(),Object.keys(exp).sort(),"chaves do create");
  assert.equal(got.kind,exp.kind);assert.equal(got.id,exp.id);near(got.x,exp.x,EPS_POS,"x");near(got.y,exp.y,EPS_POS,"y");near(got.r,exp.r,EPS_R,"r");
  for(const k of ["owner","flags","type","hue","seed","influenceR","phase","target","weapon"])if(k in exp)assert.equal(got[k],exp[k],k);
  for(const k of ["vx","vy"])if(k in exp)near(got[k],exp[k],EPS_V,k);}
function randUpdate(mask=rng.int(0,31)){const u={id:rng.int(1,1e6),mask};
  if(mask&UPD.X_Y){u.x=rx();u.y=ry();}if(mask&UPD.R)u.r=rr();if(mask&UPD.V){u.vx=rv();u.vy=rv();}
  if(mask&UPD.FLAGS)u.flags=rng.int(0,255);if(mask&UPD.EXTRA){u.phase=rng.int(0,2);u.influenceR=rng.int(0,3000);}return u;}
function assertUpdate(got,exp){assert.deepEqual(Object.keys(got).sort(),Object.keys(exp).sort(),"chaves do update");
  assert.equal(got.id,exp.id);assert.equal(got.mask,exp.mask);
  if("x"in exp){near(got.x,exp.x,EPS_POS,"x");near(got.y,exp.y,EPS_POS,"y");}if("r"in exp)near(got.r,exp.r,EPS_R,"r");
  if("vx"in exp){near(got.vx,exp.vx,EPS_V,"vx");near(got.vy,exp.vy,EPS_V,"vy");}
  if("flags"in exp)assert.equal(got.flags,exp.flags);if("phase"in exp){assert.equal(got.phase,exp.phase);assert.equal(got.influenceR,exp.influenceR);}}
const randSelf=()=>({flags:rng.int(0,1),missiles:rng.int(0,3),powerBits:rng.int(0,3),magnetT:u16(),shieldLv:rng.int(0,3),score:u32(),splitCd:rng.int(0,255),ejectCd:rng.int(0,255),fireCd:u16(),rank:rng.int(0,30),mass:u32(),threat:rng.int(0,255),threatDir:rng.int(0,255),weapon:rng.int(0,3),alive:rng.int(0,255),owned:rng.int(0,255)});
const randRemove=()=>({id:rng.int(1,1e6),reason:rng.int(0,6)});
const randSnapshot=(nPerKind=6,nU=30,nR=10)=>({tick:u32(),ackSeq:u16(),creates:KINDS.flatMap(k=>Array.from({length:nPerKind},()=>randCreate(k))),
  updates:Array.from({length:nU},()=>randUpdate()),removes:Array.from({length:nR},randRemove),self:randSelf()});
const w=createWriter();

// ── writer / reader ──────────────────────────────────────────────────────────
test("writer cresce e preserva o conteúdo; toBuffer é vista exata",()=>{
  const sw=createWriter(8);for(let i=0;i<100;i++)sw.u32(i*7);sw.i16(-5).f32(1.5).str8("olá").bytes(new Uint8Array([1,2,3]));
  const b=sw.toBuffer();assert.equal(b.length,400+2+4+1+4+3);assert.equal(b.byteOffset,0);
  const rd=createReader(b);for(let i=0;i<100;i++)assert.equal(rd.u32(),i*7);assert.equal(rd.i16(),-5);assert.equal(rd.f32(),1.5);assert.equal(rd.str8(),"olá");
  assert.deepEqual([...rd.bytes(3)],[1,2,3]);assert.equal(rd.remaining(),0);
  sw.reset();assert.equal(sw.pos,0);assert.equal(sw.toBuffer().length,0);});
test("reader estoura RangeError ao passar do fim",()=>{
  const rd=createReader(new Uint8Array([1,2,3]));assert.throws(()=>rd.u32(),RangeError);assert.equal(rd.pos,0);
  rd.u8();rd.u16();assert.equal(rd.remaining(),0);assert.throws(()=>rd.u8(),RangeError);assert.throws(()=>rd.bytes(1),RangeError);
  assert.throws(()=>createReader(new Uint8Array([10,65,66])).str8(),RangeError);
  const snap=encodeSnapshot(w,randSnapshot(2,2,2));assert.throws(()=>decodeSnapshot(snap.subarray(0,snap.length-3)),RangeError);});
test("reader aceita ArrayBuffer, DataView e Buffer com byteOffset",()=>{
  const pong={clientTime:123456789,serverTick:987654321},b=encodePong(w,pong);
  assert.deepEqual(decodePong(b.slice().buffer),pong);assert.deepEqual(decodePong(new DataView(b.slice().buffer)),pong);
  const padded=Buffer.concat([Buffer.from([9,9,9]),Buffer.from(b)]).subarray(3);assert.ok(padded.byteOffset>0||padded.buffer.byteLength>padded.length);assert.deepEqual(decodePong(padded),pong);});
test("encoders reutilizam o buffer do writer (sem realocação entre chamadas)",()=>{
  const a=encodeSnapshot(w,randSnapshot(2,2,2)),ab=a.buffer,b=encodeSnapshot(w,randSnapshot(2,2,2));assert.equal(b.buffer,ab);});

// ── INPUT ────────────────────────────────────────────────────────────────────
test("INPUT: ida e volta exata na grade de quantização; seq/clientTick dão wrap",()=>{
  for(let i=0;i<50;i++){const inp={seq:u16(),tx:dqPos(qPos(rx(),WORLD.w),WORLD.w),ty:dqPos(qPos(ry(),WORLD.h),WORLD.h),flags:rng.int(0,15),clientTick:u16()};
    const b=encodeInput(inp);assert.equal(b.length,INPUT_BYTES);assert.equal(b[0],MSG.INPUT);assert.deepEqual(decodeInput(b),inp);}
  const d=decodeInput(encodeInput({seq:70000,tx:100.3,ty:7100.7,flags:9,clientTick:0x1_0005}));
  assert.equal(d.seq,70000&0xFFFF);assert.equal(d.clientTick,5);assert.equal(d.flags,9);near(d.tx,100.3,EPS_POS,"tx");near(d.ty,7100.7,EPS_POS,"ty");
  assert.equal(decodeInput(encodeInput({seq:1,tx:-50,ty:99999,flags:0,clientTick:0})).tx,0);});

// ── SNAPSHOT ─────────────────────────────────────────────────────────────────
test("SNAPSHOT: ida e volta de todos os kinds, máscaras, remoções e self",()=>{
  for(let it=0;it<5;it++){const s=randSnapshot();const b=encodeSnapshot(w,s),d=decodeSnapshot(b);
    assert.equal(d.tick,s.tick);assert.equal(d.ackSeq,s.ackSeq);assert.equal(d.creates.length,s.creates.length);assert.equal(d.updates.length,s.updates.length);
    s.creates.forEach((e,i)=>assertCreate(d.creates[i],e));s.updates.forEach((u,i)=>assertUpdate(d.updates[i],u));
    assert.deepEqual(d.removes,s.removes);assert.deepEqual(d.self,s.self);}
  const empty=decodeSnapshot(encodeSnapshot(w,{tick:7,ackSeq:3}));
  assert.deepEqual(empty,{tick:7,ackSeq:3,creates:[],updates:[],removes:[],self:{flags:0,missiles:0,powerBits:0,magnetT:0,shieldLv:0,score:0,splitCd:0,ejectCd:0,fireCd:0,rank:0,mass:0,threat:0,threatDir:0,weapon:0,alive:0,owned:1}});});
test("SNAPSHOT: tamanho do create por kind bate com a conta manual",()=>{
  const SIZE={[KIND.PIECE]:11+7,[KIND.FOOD]:11+2,[KIND.EJECT]:11+7,[KIND.ASTEROID]:11+6,[KIND.BLACKHOLE]:11+5,[KIND.MISSILE]:11+9,[KIND.STAR]:11+5};
  for(const k of KINDS)assert.equal(encodeSnapshot(w,{tick:0,ackSeq:0,creates:[randCreate(k)]}).length,SNAPSHOT_HEADER_BYTES+SIZE[k]+SELF_BYTES,`kind ${k}`);
  assert.throws(()=>encodeSnapshot(w,{tick:0,ackSeq:0,creates:[{kind:99,id:1,x:0,y:0,r:1}]}),/kind desconhecido/);});
test("SNAPSHOT: update só escreve/lê os campos presentes na máscara (32 combinações)",()=>{
  const BYTES={[UPD.X_Y]:4,[UPD.R]:2,[UPD.V]:4,[UPD.FLAGS]:1,[UPD.EXTRA]:3};
  for(let m=0;m<32;m++){let n=5;for(const bit of [1,2,4,8,16])if(m&bit)n+=BYTES[bit];
    const u=randUpdate(m),b=encodeSnapshot(w,{tick:1,ackSeq:2,updates:[u]});
    assert.equal(b.length,SNAPSHOT_HEADER_BYTES+n+SELF_BYTES,`mask ${m}`);
    const d=decodeSnapshot(b).updates[0];assertUpdate(d,u);
    const keys=["id","mask"];if(m&UPD.X_Y)keys.push("x","y");if(m&UPD.R)keys.push("r");if(m&UPD.V)keys.push("vx","vy");if(m&UPD.FLAGS)keys.push("flags");if(m&UPD.EXTRA)keys.push("phase","influenceR");
    assert.deepEqual(Object.keys(d).sort(),keys.sort(),`chaves mask ${m}`);}
  // campos fora da máscara são ignorados mesmo se fornecidos
  const b=encodeSnapshot(w,{tick:1,ackSeq:2,updates:[{id:5,mask:UPD.R,r:40,x:100,y:100,vx:9,flags:3}]});
  assert.equal(b.length,SNAPSHOT_HEADER_BYTES+7+SELF_BYTES);assert.deepEqual(decodeSnapshot(b).updates[0],{id:5,mask:UPD.R,r:40});});
test("SNAPSHOT: magnitudes saturam, contadores dão wrap",()=>{
  const d=decodeSnapshot(encodeSnapshot(w,{tick:2**32+5,ackSeq:65536+9,creates:[{kind:KIND.PIECE,id:1,x:-10,y:99999,r:99999,vx:-99999,vy:99999,flags:15}],
    self:{flags:1,missiles:999,powerBits:3,magnetT:-1,shieldLv:NaN,score:2**40,splitCd:400,ejectCd:-3,fireCd:99999,rank:1e6,mass:2**33,threat:400,threatDir:259,weapon:3,alive:999,owned:5}}));
  assert.equal(d.tick,5);assert.equal(d.ackSeq,9);const p=d.creates[0];assert.equal(p.x,0);assert.equal(p.y,WORLD.h);assert.equal(p.r,6553.5);assert.equal(p.vx,-32767);assert.equal(p.vy,32767);
  assert.deepEqual(d.self,{flags:1,missiles:255,powerBits:3,magnetT:0,shieldLv:0,score:4294967295,splitCd:255,ejectCd:0,fireCd:65535,rank:65535,mass:4294967295,threat:255,threatDir:3,weapon:3,alive:255,owned:5});
});
test("SNAPSHOT: orçamento — 150 PIECE + 100 FOOD + 100 updates(X_Y|V) + 20 removes ≤ 6 KB",t=>{
  const s={tick:1234,ackSeq:77,creates:[...Array.from({length:150},()=>randCreate(KIND.PIECE)),...Array.from({length:100},()=>randCreate(KIND.FOOD))],
    updates:Array.from({length:100},()=>randUpdate(UPD.X_Y|UPD.V)),removes:Array.from({length:20},randRemove),self:randSelf()};
  const b=encodeSnapshot(w,s);const expected=SNAPSHOT_HEADER_BYTES+150*18+100*13+100*13+20*5+SELF_BYTES;
  t.diagnostic(`snapshot 150 PIECE + 100 FOOD + 100 upd + 20 rm = ${b.length} bytes (${(b.length/1024).toFixed(2)} KB)`);
  console.log(`[protocol] snapshot de referência: ${b.length} bytes`);
  assert.equal(b.length,expected);assert.ok(b.length<=6*1024,`${b.length} > 6 KB`);
  const d=decodeSnapshot(b);assert.equal(d.creates.length,250);assert.equal(d.updates.length,100);assert.equal(d.removes.length,20);});
test("SNAPSHOT: 250 creates + 200 updates — estabilidade com writer reutilizado (sem crescer após a 1ª)",()=>{
  const big=()=>({tick:1,ackSeq:1,creates:Array.from({length:250},()=>randCreate(KINDS[rng.int(0,5)])),updates:Array.from({length:200},()=>randUpdate()),removes:[],self:randSelf()});
  encodeSnapshot(w,big());const buf=w.toBuffer().buffer;for(let i=0;i<20;i++){const s=big(),b=encodeSnapshot(w,s);assert.equal(b.buffer,buf);
    const d=decodeSnapshot(b);s.creates.forEach((e,j)=>assertCreate(d.creates[j],e));s.updates.forEach((u,j)=>assertUpdate(d.updates[j],u));}});

// ── PLAYERS / LEADERBOARD / EVENT / PONG ─────────────────────────────────────
test("PLAYERS: ida e volta com utf-8; nome truncado em ≤ 32 bytes na fronteira do code point",()=>{
  const ps=[{slot:0,flags:0,skinId:3,team:NO_TEAM,name:"Evandro",score:1234},{slot:1,flags:1,skinId:0,team:0,name:"Nebulox",score:0},{slot:2,flags:6,skinId:255,team:11,name:"Zé Ção 日本",score:4294967295},
    {slot:65535,flags:2,skinId:9,team:24,name:"😀😀😀😀😀😀😀😀",score:42},{slot:4,flags:0,skinId:1,team:NO_TEAM,name:"",score:1}];
  const d=decodePlayers(encodePlayers(w,ps));assert.deepEqual(d,ps);
  const long=[{slot:1,flags:0,skinId:0,team:NO_TEAM,name:"a".repeat(40),score:0},{slot:2,flags:0,skinId:0,team:NO_TEAM,name:"a".repeat(31)+"😀",score:0},{slot:3,flags:0,skinId:0,team:NO_TEAM,name:"é".repeat(20),score:0},{slot:4,flags:0,skinId:0,team:NO_TEAM,name:"a".repeat(30)+"😀😀",score:0}];
  const dl=decodePlayers(encodePlayers(w,long));const enc=new TextEncoder();
  assert.deepEqual(dl.map(p=>p.name),["a".repeat(32),"a".repeat(31),"é".repeat(16),"a".repeat(30)]);
  for(const p of dl)assert.ok(enc.encode(p.name).length<=NAME_MAX_BYTES);
  assert.equal(encodePlayers(w,[]).length,3);assert.deepEqual(decodePlayers(encodePlayers(w,[])),[]);});
test("LEADERBOARD: ida e volta com posição (é o que dá o radar de todos os inimigos); > 255 linhas estoura",()=>{
  const rows=Array.from({length:30},()=>({slot:slot(),mass:u32(),x:rx(),y:ry()}));
  const back=decodeLeaderboard(encodeLeaderboard(w,rows));
  assert.equal(back.length,rows.length);
  for(let i=0;i<rows.length;i++){assert.equal(back[i].slot,rows[i].slot);assert.equal(back[i].mass,rows[i].mass);
    assert.ok(Math.abs(back[i].x-rows[i].x)<=WORLD.w/65535&&Math.abs(back[i].y-rows[i].y)<=WORLD.h/65535,"posição dentro da quantização u16");}
  assert.equal(encodeLeaderboard(w,rows).length,2+30*10);
  assert.throws(()=>encodeLeaderboard(w,new Array(256).fill({slot:0,mass:0,x:0,y:0})),RangeError);});
test("EVENT: ida e volta dentro da quantização",()=>{
  for(let i=0;i<30;i++){const e={kind:rng.int(0,15),x:rx(),y:ry(),r:rr(),slotA:slot(),slotB:slot(),extra:u32()};const b=encodeEvent(w,e);assert.equal(b.length,16);const d=decodeEvent(b);
    assert.equal(d.kind,e.kind);near(d.x,e.x,EPS_POS,"x");near(d.y,e.y,EPS_POS,"y");near(d.r,e.r,EPS_R,"r");assert.equal(d.slotA,e.slotA);assert.equal(d.slotB,e.slotB);assert.equal(d.extra,e.extra);}
  const d=decodeEvent(encodeEvent(w,{kind:EVENT.SHOOT,x:0,y:0,r:0,slotA:0,slotB:0,extra:-1}));assert.equal(d.extra,4294967295);
  for(const k of [EVENT.SHIELD_BREAK,EVENT.CLASH,EVENT.DEFLECT,EVENT.SHIELD_HIT,EVENT.SHIELD_UP])assert.equal(decodeEvent(encodeEvent(w,{kind:k,x:1,y:1,r:1,slotA:0,slotB:0,extra:0})).kind,k);
  const pd=unpackDir(decodeEvent(encodeEvent(w,{kind:EVENT.DEFLECT,x:1,y:1,r:1,slotA:0,slotB:0,extra:packDir(-.6,.8,300)})).extra);
  assert.ok(Math.abs(pd.nx+.6)<.01&&Math.abs(pd.ny-.8)<.01&&pd.vn===300,"packDir/unpackDir");
  const c=decodeSnapshot(encodeSnapshot(w,{tick:1,ackSeq:0,creates:[{kind:KIND.PIECE,id:1,x:1,y:1,r:1,owner:0,vx:0,vy:0,flags:PIECE_FLAG.SHIELD|PIECE_FLAG.MAGNET|(3<<PIECE_FLAG.SHIELD_LV_SHIFT)}]})).creates[0];
  assert.equal(c.flags,PIECE_FLAG.SHIELD|PIECE_FLAG.MAGNET|96);assert.equal((c.flags>>PIECE_FLAG.SHIELD_LV_SHIFT)&3,3);});
test("PONG: ida e volta exata",()=>{for(let i=0;i<10;i++){const p={clientTime:u32(),serverTick:u32()};const b=encodePong(w,p);assert.equal(b.length,9);assert.deepEqual(decodePong(b),p);}});

// ── ZONE / VOICE ─────────────────────────────────────────────────────────────
test("ZONE: ida e volta do círculo, e t1 infinito sobrevive ao fio",()=>{
  const z={x0:rx(),y0:ry(),r0:5952,x1:rx(),y1:ry(),r1:144,t0:u32(),t1:u32()};
  const b=encodeZone(w,z);assert.equal(b.length,ZONE_BYTES);
  const d=decodeZone(b);
  near(d.x0,z.x0,EPS_POS,"x0");near(d.y0,z.y0,EPS_POS,"y0");near(d.r0,z.r0,EPS_R,"r0");
  near(d.x1,z.x1,EPS_POS,"x1");near(d.y1,z.y1,EPS_POS,"y1");near(d.r1,z.r1,EPS_R,"r1");
  assert.equal(d.t0,z.t0);assert.equal(d.t1,z.t1);
  const fim=decodeZone(encodeZone(w,{...z,t1:Infinity}));
  assert.equal(fim.t1,Infinity,"zona parada de vez volta como Infinity, não como 4294967295");});
test("VOICE: os bytes do áudio atravessam intactos (o servidor nunca decodifica)",()=>{
  const data=new Uint8Array(Array.from({length:4000},(_,i)=>(i*7+i%13)&255));
  const up=encodeVoiceUp(w,{codec:0,durMs:2500,data});
  assert.equal(up.length,VOICE_UP_HEADER_BYTES+data.length);
  const du=decodeVoiceUp(up);assert.equal(du.codec,0);assert.equal(du.durMs,2500);assert.deepEqual([...du.data],[...data]);
  const down=encodeVoice(w,{slot:7,codec:0,durMs:2500,x:1234,y:5678,data});
  assert.equal(down.length,VOICE_HEADER_BYTES+data.length);
  const dd=decodeVoice(down);assert.equal(dd.slot,7);assert.equal(dd.durMs,2500);
  near(dd.x,1234,EPS_POS,"x");near(dd.y,5678,EPS_POS,"y");assert.deepEqual([...dd.data],[...data]);
  const vazio=decodeVoiceUp(encodeVoiceUp(w,{codec:1,durMs:0,data:new Uint8Array(0)}));
  assert.equal(vazio.data.length,0);});

// ── decodeMessage ────────────────────────────────────────────────────────────
test("decodeMessage despacha pelo primeiro byte; desconhecido/vazio → null",()=>{
  const s=randSnapshot(1,2,1),snapB=encodeSnapshot(w,s).slice();assert.deepEqual(decodeMessage(snapB),{type:MSG.SNAPSHOT,...decodeSnapshot(snapB)});
  const inp={seq:5,tx:dqPos(100,WORLD.w),ty:dqPos(200,WORLD.h),flags:2,clientTick:9};assert.deepEqual(decodeMessage(encodeInput(inp)),{type:MSG.INPUT,...inp});
  const ps=[{slot:1,flags:0,skinId:2,team:NO_TEAM,name:"X",score:3}];assert.deepEqual(decodeMessage(encodePlayers(w,ps)),{type:MSG.PLAYERS,players:ps});
  const rows=[{slot:1,mass:900,x:dqPos(qPos(1234,WORLD.w),WORLD.w),y:dqPos(qPos(5678,WORLD.h),WORLD.h)}];assert.deepEqual(decodeMessage(encodeLeaderboard(w,rows)),{type:MSG.LEADERBOARD,rows});
  const ev={kind:EVENT.EAT,x:dqPos(10,WORLD.w),y:dqPos(20,WORLD.h),r:3.5,slotA:1,slotB:2,extra:7};assert.deepEqual(decodeMessage(encodeEvent(w,ev)),{type:MSG.EVENT,...ev});
  const pong={clientTime:1,serverTick:2};assert.deepEqual(decodeMessage(encodePong(w,pong)),{type:MSG.PONG,...pong});
  const zw={x0:0,y0:0,r0:100,x1:0,y1:0,r1:100,t0:1,t1:2};assert.deepEqual(decodeMessage(encodeZone(w,zw)),{type:MSG.ZONE,zone:decodeZone(encodeZone(w,zw))});
  const vc={slot:3,codec:0,durMs:900,x:0,y:0,data:new Uint8Array([1,2,3])};const vb=encodeVoice(w,vc).slice();
  assert.deepEqual(decodeMessage(vb),{type:MSG.VOICE,...decodeVoice(vb)});
  const vu={codec:0,durMs:900,data:new Uint8Array([9,8])};const ub=encodeVoiceUp(w,vu).slice();
  assert.deepEqual(decodeMessage(ub),{type:MSG.VOICE_UP,...decodeVoiceUp(ub)});
  assert.equal(decodeMessage(new Uint8Array([0x7f,1,2,3])),null);assert.equal(decodeMessage(new Uint8Array(0)),null);assert.equal(decodeMessage(new ArrayBuffer(0)),null);
});
