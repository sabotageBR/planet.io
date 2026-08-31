// ── O TOKEN DA CRAZYGAMES ────────────────────────────────────────────────────
// A conta do jogador no portal vira conta aqui, e a ÚNICA coisa entre um token forjado e uma conta é o
// que `auth/crazygames.js` confere. Diferente do Google (que tem um `tokeninfo` do outro lado), aqui a
// verificação é nossa — então ela é testada com um par de chaves DE VERDADE, gerado no teste.
// Sem banco e sem rede: o `fetch` da chave pública é injetado.
// node --test server/test/crazygames.test.js
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,createSign} from 'node:crypto';
import {createCrazyGames} from '../src/auth/crazygames.js';

const GAME_ID='20267';
const {publicKey,privateKey}=generateKeyPairSync('rsa',{modulusLength:2048,
  publicKeyEncoding:{type:'spki',format:'pem'},privateKeyEncoding:{type:'pkcs8',format:'pem'}});
const outro=generateKeyPairSync('rsa',{modulusLength:2048,
  publicKeyEncoding:{type:'spki',format:'pem'},privateKeyEncoding:{type:'pkcs8',format:'pem'}});

const b64=o=>Buffer.from(JSON.stringify(o)).toString('base64url');
/** Monta um JWT RS256 como o do SDK deles. */
function jwt(claims,{key=privateKey,alg='RS256'}={}){
  const h=b64({alg,typ:'JWT'}),p=b64(claims);
  const s=createSign('RSA-SHA256');s.update(`${h}.${p}`);s.end();
  return `${h}.${p}.${s.sign(key).toString('base64url')}`;
}
const agora=()=>Math.floor(Date.now()/1000);
const bom=(extra={})=>({userId:'UOuZBKgjwpY9k4TSBB2NPugbsHD3',gameId:GAME_ID,username:'RustyCake.ZU9H',
  profilePictureUrl:'https://images.crazygames.com/x.png',iat:agora()-10,exp:agora()+3600,...extra});

let buscas=0;
const fake=(pem=publicKey)=>async()=>{buscas++;return{ok:true,json:async()=>({publicKey:pem})};};
const cria=(o={})=>createCrazyGames({config:{crazyGameId:GAME_ID},fetchImpl:fake(o.pem),...o});

test('desligado sem CRAZY_GAME_ID', async () => {
  const cg=createCrazyGames({config:{},fetchImpl:fake()});
  assert.equal(cg.enabled,false);
  await assert.rejects(cg.verify(jwt(bom())),/desligado/);
});

test('token válido: devolve a identidade, e o userId é a identidade (não o username)', async () => {
  const id=await cria().verify(jwt(bom()));
  assert.deepEqual(id,{subject:'UOuZBKgjwpY9k4TSBB2NPugbsHD3',name:'RustyCake.ZU9H',
    avatar:'https://images.crazygames.com/x.png'});
});

test('recusa o que precisa recusar', async () => {
  const cg=cria();
  // assinado com OUTRA chave: é o caso do token forjado
  await assert.rejects(cg.verify(jwt(bom(),{key:outro.privateKey})),/assinatura/);
  // ⚠️ gameId de outro jogo da rede — sem esta checagem, qualquer token da CrazyGames entraria aqui
  await assert.rejects(cg.verify(jwt(bom({gameId:'99999'}))),/gameId/);
  await assert.rejects(cg.verify(jwt(bom({exp:agora()-5}))),/expirado/);
  await assert.rejects(cg.verify(jwt(bom({iat:agora()+3600}))),/iat/);
  await assert.rejects(cg.verify(jwt(bom({userId:undefined}))),/userId/);
  // `alg:none` é o ataque clássico de JWT (o cabeçalho manda e a verificação some), e ele chega de duas
  // formas: sem assinatura nenhuma — que morre antes, no formato — e com lixo no lugar dela.
  await assert.rejects(cg.verify(`${b64({alg:'none',typ:'JWT'})}.${b64(bom())}.`),/malformado/);
  await assert.rejects(cg.verify(`${b64({alg:'none',typ:'JWT'})}.${b64(bom())}.xx`),/alg/);
  await assert.rejects(cg.verify('nada'),/malformado/);
  await assert.rejects(cg.verify(''),/inválido/);
});

test('a chave é cacheada, e re-buscada quando a assinatura falha', async () => {
  buscas=0;
  const cg=cria();
  await cg.verify(jwt(bom()));
  await cg.verify(jwt(bom()));
  assert.equal(buscas,1,'a segunda verificação usa o cache');
  // token de outra chave: tenta com o cache, falha, re-busca (e falha de novo, porque é forjado mesmo)
  await assert.rejects(cg.verify(jwt(bom(),{key:outro.privateKey})),/assinatura/);
  assert.equal(buscas,2,'o re-fetch é o caminho do dia em que eles trocarem a chave');
});
