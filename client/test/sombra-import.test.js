// ── NENHUM IMPORT PODE SER SOMBREADO POR UMA DECLARAÇÃO LOCAL ─────────────────────────────────────
// `client/src/game/index.js` importava `marco` (o funil da primeira vida) e declarava, dentro de
// `createGame`, um `let ... marco=0` — o degrau da escada de massa. A local sombreava a função no
// módulo INTEIRO, então `marco("first_kill")` chamava o número: `TypeError` dentro do `onmessage`,
// abortando o resto do snapshot daquele tick (efeito e som dos eventos seguintes) e deixando os três
// marcos do funil sem sair NUNCA. Medidas 142 exceções em 20 s de produção; nada no jogo acusava, e
// nenhum teste podia acusar — `createGame` precisa de DOM e de Pixi.
//
// ⚠️ Isto é ANÁLISE DE TEXTO, não de sintaxe: não há parser no `node_modules` do projeto (o `acorn` da
//    máquina é do sistema, e um teste que dependa dele quebra em outra). Por isso o varredor é
//    conservador — comentários e strings saem antes, `export` sai da conta, e só se olha o nome em
//    posição de DECLARAÇÃO. Ele não pega tudo (parâmetro de função com o nome de um import, por
//    exemplo); pega a forma que custou caro.
import test from "node:test";
import assert from "node:assert/strict";
import {readdirSync,readFileSync,statSync} from "node:fs";
import {join} from "node:path";

const RAIZES=["client/src","shared/src","server/src"];
const arquivos=raiz=>{const out=[];
  (function anda(d){for(const n of readdirSync(d)){const p=join(d,n);
    if(statSync(p).isDirectory()){if(n!=="node_modules")anda(p);}
    else if(/\.(js|jsx)$/.test(n))out.push(p);}})(raiz);
  return out;};

/** Tira comentários e o miolo das strings — sobra só o esqueleto de código. */
const limpa=s=>s
  .replace(/\/\*[\s\S]*?\*\//g,"")
  .replace(/(^|[^:])\/\/[^\n]*/g,"$1")
  .replace(/`(?:\\.|[^`\\])*`/g,"``")
  .replace(/"(?:\\.|[^"\\])*"/g,'""')
  .replace(/'(?:\\.|[^'\\])*'/g,"''");

/** Os nomes que o módulo IMPORTA (com `as`, vale o apelido — é ele que fica no escopo). */
function importados(src){
  const nomes=new Set();
  for(const m of src.matchAll(/import\s+([^;]+?)\s+from\s*['"]/g)){
    const clausula=m[1];
    const chaves=clausula.match(/\{([^}]*)\}/);
    if(chaves)for(const parte of chaves[1].split(",")){
      const id=parte.includes(" as ")?parte.split(" as ")[1]:parte;
      const nome=id.trim(); if(/^\w+$/.test(nome))nomes.add(nome);}
    const antes=clausula.replace(/\{[^}]*\}/,"").replace(/\*\s+as\s+\w+/,"").split(",")[0].trim();
    if(/^\w+$/.test(antes))nomes.add(antes);
    const estrela=clausula.match(/\*\s+as\s+(\w+)/); if(estrela)nomes.add(estrela[1]);
  }
  return nomes;
}

/** Os nomes DECLARADOS no arquivo (fora de `export`, que é a própria definição do módulo). */
function declarados(src){
  const nomes=new Set();
  for(const m of src.matchAll(/(^|[^.\w$])(let|const|var)\s+([^;\n]*)/g)){
    if(/export\s*$/.test(src.slice(0,m.index+m[1].length)))continue;
    let prof=0,atual="",esperaNome=true;
    for(const ch of m[3]){
      if("([{".includes(ch))prof++;
      else if(")]}".includes(ch))prof--;
      if(prof===0&&ch===","){if(esperaNome&&/^\w+$/.test(atual.trim()))nomes.add(atual.trim());
        atual="";esperaNome=true;continue;}
      if(prof===0&&(ch==="="||ch===":")){if(esperaNome&&/^\w+$/.test(atual.trim()))nomes.add(atual.trim());
        atual="";esperaNome=false;continue;}
      atual+=ch;
    }
    if(esperaNome&&/^\w+$/.test(atual.trim()))nomes.add(atual.trim());
  }
  for(const m of src.matchAll(/(^|[^.\w$])function\s+(\w+)\s*\(/g)){
    if(/export\s*(default\s*)?$/.test(src.slice(0,m.index+m[1].length)))continue;
    nomes.add(m[2]);
  }
  return nomes;
}

test("nenhum import é sombreado por uma declaração local", () => {
  const culpados=[];
  for(const raiz of RAIZES)for(const p of arquivos(raiz)){
    const src=limpa(readFileSync(p,"utf8"));
    const imp=importados(src), dec=declarados(src);
    for(const n of imp)if(dec.has(n))culpados.push(`${p}: "${n}"`);
  }
  assert.deepEqual(culpados,[],`import sombreado por declaração local:\n  ${culpados.join("\n  ")}`);
});
