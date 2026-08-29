// Easter eggs: o pecado grave é o FALSO positivo — vestir de presidente quem não pediu nada.
import test from "node:test";
import assert from "node:assert/strict";
import {EGGS,EGG_SKIN_IDS,eggSkinFor} from "../src/eggs.js";
import {SKINS,SKIN_BY_ID,isPurchasable} from "../src/skins.js";
import {BOT_NICKS,BOT_NAMES} from "../src/constants.js";

test("o nick escolhe a skin, nos formatos que o baseNick desmonta",()=>{
  const bruxo=EGGS.find(e=>e.nome==="Bruxo").skinId,trump=EGGS.find(e=>e.nome==="Trump").skinId;
  for(const n of ["Bruxo","bruxo","BRUXO","xXbruxoXx","Bruxo_137","bruxo42","  bruxo  ","Ronaldinho","ronaldinho10"])
    assert.equal(eggSkinFor(n),bruxo,n);
  for(const n of ["trump","Trump","TRUMP","trump2024","Donald Trump","donaldtrump"])
    assert.equal(eggSkinFor(n),trump,n);
  assert.equal(eggSkinFor("Xi Jinping"),EGGS.find(e=>e.nome==="Xi Jinping").skinId);
  // dígito no fim é enfeite, não outro nome: baseNick já o corta, e é por isso que "trump2024" e "lula7"
  // funcionam sem nenhuma regra de prefixo (que foi justamente o que fazia "modinha" virar Modi).
  assert.equal(eggSkinFor("lula7"),EGGS.find(e=>e.nome==="Lula").skinId);
});

test("nenhum falso positivo: palavra comum, apelido de gente e TODO nick de bot",()=>{
  // As raízes ambíguas ficaram FORA da tabela de propósito (mito, dinho, namo, putinha, gaucho). Este
  // teste é o que impede alguém de reintroduzi-las achando que ganha alcance.
  const comuns=["strumpet","trumpete","gaucho","Gaucho","modinha","moda","namorada","namo","mito","mito2",
    "dinho","putinha","putz","lulu","macarrao","zeca","mano","pro","","a","xx","modelo","pu"];
  for(const n of comuns)assert.equal(eggSkinFor(n),null,`"${n}" casou e não devia`);
  for(const n of [...BOT_NICKS,...BOT_NAMES])assert.equal(eggSkinFor(n),null,`nick de bot "${n}" casou`);
});

test("toda skin de easter egg existe, é secreta e ninguém consegue comprar",()=>{
  for(const e of EGGS){
    const s=SKIN_BY_ID.get(e.skinId);
    assert.ok(s,`skin ${e.skinId} (${e.nome}) não está no catálogo`);
    assert.equal(s.rarity,"secret",e.nome);       // a loja esconde `secret`
    assert.equal(s.price,0,e.nome);
    assert.equal(s.unlockKey,undefined,e.nome);   // não é conquista: ninguém "ganha" um egg
    assert.equal(isPurchasable(s),false,e.nome);  // e a rota de compra recusa
    assert.equal(s.pattern,"face",e.nome);
  }
  assert.equal(new Set(EGG_SKIN_IDS).size,EGGS.length,"ids de egg repetidos");
  assert.equal(new Set(SKINS.map(s=>s.id)).size,SKINS.length,"ids repetidos no catálogo");
});

test("uma raiz só pertence a um egg (senão o desempate vira ordem de declaração)",()=>{
  const vistas=new Map();
  for(const e of EGGS)for(const r of e.roots){
    assert.ok(!vistas.has(r),`raiz "${r}" em ${e.nome} e em ${vistas.get(r)}`);
    assert.ok(r.length>=4,`raiz "${r}" curta demais`);
    assert.equal(r,r.toLowerCase().replace(/[^a-z0-9]/g,""),`raiz "${r}" precisa vir já normalizada`);
    vistas.set(r,e.nome);}
});
