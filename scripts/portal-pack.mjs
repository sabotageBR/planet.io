// ── PACOTE PARA OS PORTAIS DE JOGO ────────────────────────────────────────────
// GameDistribution, CrazyGames, Poki e itch.io pedem um .zip com index.html na raiz. O zip é só o
// CLIENTE: eles hospedam os arquivos e o servidor multiplayer continua sendo warspace.io — é assim que
// todo .io vive em portal, e a própria GameDistribution abre a exceção por escrito para "Real
// Multiplayer games". O que faz isso funcionar é a origem absoluta assada no bundle (VITE_API_BASE) e
// o CORS do lado de lá (server/src/http/cors.js).
//
// uso:  node scripts/portal-pack.mjs gd|crazy|poki|itch|all
//       WARSPACE_API_BASE=https://staging.exemplo node scripts/portal-pack.mjs gd
//
// ⚠️ O VALOR DESTE SCRIPT SÃO AS GUARDAS. Cada uma delas corresponde a um jeito conhecido de subir um
//    zip que parece certo e está errado — e todos falham em SILÊNCIO no portal, onde não há console
//    para olhar e a resposta chega dias depois como uma reprovação.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SAIDA = path.join(RAIZ, "portal");
const API = (process.env.WARSPACE_API_BASE || "https://warspace.io").replace(/\/+$/, "");

// `strict` liga o interruptor da regra 7 (sem conta, sem Google, sem foto). Hoje todos em false: a
// decisão foi manter o cadastro e assumir o risco. Reprovou? Vira true e o pacote seguinte já sai limpo.
const PERFIS = {
  gd:    { nome: "GameDistribution", strict: false, env: { VITE_GD_GAME_ID: "c352686e02ec4cd19e7a9ac436d38875" } },
  crazy: { nome: "CrazyGames", strict: false, env: {} },
  poki:  { nome: "Poki", strict: false, env: {} },
  itch:  { nome: "itch.io", strict: false, env: {} },   // sem SDK: o adaptador não existe e tudo vira no-op
};
// O que veio de client/public e não faz sentido dentro de um iframe: ícone de app, manifest e o cartão
// de compartilhamento de uma página que ninguém cola em lugar nenhum. `favicon.svg` fica (810 bytes, e
// alguns portais o mostram).
// ⚠️ `faces/` SAI: são caricaturas de pessoas reais, e as regras dos portais as proíbem por IP e por
// política (ver theme/faces.js). O cliente do pacote já não as pede; levá-las no zip seria só entregar
// 624 KB de material que o revisor não pode aprovar.
// ⚠️ `privacy.html` também sai: dentro do zip ela é peso morto (nada no jogo aponta para ela) e uma
// página de saída acessível é justamente o que os portais não querem. A URL dela vai no FORMULÁRIO deles.
const PODA = ["og.png", "icon-180.png", "icon-192.png", "icon-512.png", "manifest.webmanifest", "privacy.html", "faces"];

const arquivos = dir => fs.readdirSync(dir, { withFileTypes: true, recursive: true })
  .filter(d => d.isFile()).map(d => path.join(d.parentPath || d.path, d.name));
const morre = m => { console.error("\n✗ " + m + "\n"); process.exit(1); };

function empacota(id) {
  const perfil = PERFIS[id]; if (!perfil) morre(`portal desconhecido: ${id} (${Object.keys(PERFIS).join("|")})`);
  const dist = path.join(SAIDA, id, "dist");
  console.log(`\n── ${perfil.nome} ──`);

  // ⚠️ NUNCA em client/dist: aquele é o artefato do SITE, que o client/Dockerfile produz e que o dev
  // pode ter em disco. Sobrescrevê-lo com um bundle que fala com uma origem absoluta é a receita para
  // publicar no site um cliente de portal.
  const r = spawnSync("npx", ["vite", "build", "--mode", "portal", "--outDir", dist, "--emptyOutDir"], {
    cwd: path.join(RAIZ, "client"), stdio: "inherit",
    env: { ...process.env, VITE_PORTAL: "1", VITE_PORTAL_ID: id, VITE_API_BASE: API,
      VITE_PORTAL_STRICT: perfil.strict ? "1" : "0", ...perfil.env },
  });
  if (r.status !== 0) morre("o build falhou");

  for (const f of PODA) fs.rmSync(path.join(dist, f), { force: true, recursive: true });

  // ── guardas ────────────────────────────────────────────────────────────────
  const todos = arquivos(dist);
  const html = path.join(dist, "index.html");
  if (!fs.existsSync(html)) morre("não há index.html na raiz do pacote");
  const mapas = todos.filter(f => f.endsWith(".map"));
  if (mapas.length) morre(`${mapas.length} sourcemap(s) no pacote: eles entregam o fonte inteiro (protocolo, predição) a quem quiser trapacear`);

  const texto = todos.filter(f => /\.(html|js|css)$/.test(f));
  const rastro = texto.filter(f => /googletagmanager|gtag\(|G-40CHSTVFQT/.test(fs.readFileSync(f, "utf8")));
  // a regra 7 da GameDistribution proíbe tracker de terceiro e cita o Google Analytics pelo nome; é uma
  // das poucas que reprovam sozinhas
  if (rastro.length) morre(`Google Analytics no pacote (${rastro.map(f => path.basename(f)).join(", ")})`);

  const abs = [];
  for (const f of texto.filter(f => /\.(html|css)$/.test(f))) {
    const t = fs.readFileSync(f, "utf8");
    if (/(src|href)="\//.test(t) || /url\(\/[^/]/.test(t)) abs.push(path.basename(f));
  }
  // caminho absoluto é a PÁGINA BRANCA: o portal serve de um subcaminho, e /assets/… lá é 404
  if (abs.length) morre(`caminho absoluto em ${abs.join(", ")} — no subcaminho do portal isso é 404 e a página fica branca`);

  const js = todos.filter(f => f.endsWith(".js"));
  // prova que a injeção da origem pegou: sem ela o jogo cai em modo local e PARECE ter funcionado
  if (!js.some(f => fs.readFileSync(f, "utf8").includes(API))) morre(`a origem ${API} não aparece no bundle: a injeção de VITE_API_BASE não pegou`);

  // o painel de administração não pode viajar no pacote: um revisor esbarrando numa tela de login de
  // admin é péssimo, e é a poda de `portal/flags.js` que o remove — se ela parar de funcionar (uma
  // mudança na forma de ler a env basta), isto avisa na hora em vez de no dia da revisão
  const admin = todos.filter(f => /admin/i.test(path.basename(f)));
  if (admin.length) morre(`o painel /admin foi parar no pacote: ${admin.map(f => path.basename(f)).join(", ")}`);

  const adaptadores = js.filter(f => /\/(gd|crazy|poki)-[^/]*\.js$/.test(f));
  // `import()` com variável viraria glob no Rollup e o zip da GD sairia com o código da Poki dentro
  if (adaptadores.length > 1) morre(`${adaptadores.length} adaptadores de portal no pacote: ${adaptadores.map(f => path.basename(f)).join(", ")}`);
  if (id !== "itch" && !adaptadores.length) console.warn("  ⚠ nenhum chunk de adaptador — confira se o SDK deste portal está mesmo ligado");

  // ── zip ────────────────────────────────────────────────────────────────────
  // ⚠️ O CONTEÚDO da pasta, nunca a pasta: um zip com `dist/index.html` dentro é a rejeição nº 1 em
  // upload de portal, porque eles procuram o index.html na RAIZ.
  const zip = path.join(SAIDA, `warspace-${id}.zip`);
  fs.rmSync(zip, { force: true });
  let z = spawnSync("zip", ["-r", "-X", "-9", "-q", zip, "."], { cwd: dist });
  if (z.status !== 0) {
    z = spawnSync("python3", ["-c", `import shutil,sys;shutil.make_archive(sys.argv[1],'zip',root_dir=sys.argv[2])`, zip.replace(/\.zip$/, ""), dist]);
    if (z.status !== 0) morre("não consegui zipar (nem `zip` nem python3/shutil)");
  }
  const kb = Math.round(fs.statSync(zip).size / 1024);
  console.log(`  ✓ ${path.relative(RAIZ, zip)} — ${kb} KB, ${todos.length} arquivos`);
  console.log(`    API ${API} · strict ${perfil.strict ? "on (sem conta/Google/foto)" : "off"}`);
}

const alvo = (process.argv[2] || "").toLowerCase();
if (!alvo) morre(`uso: node scripts/portal-pack.mjs ${Object.keys(PERFIS).join("|")}|all`);
fs.mkdirSync(SAIDA, { recursive: true });
for (const id of alvo === "all" ? Object.keys(PERFIS) : [alvo]) empacota(id);
