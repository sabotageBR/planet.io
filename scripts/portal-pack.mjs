// ── PACOTE PARA OS PORTAIS DE JOGO ────────────────────────────────────────────
// GameDistribution, CrazyGames, Poki, itch.io, Y8, GameMonetize, GameFlare, Playgama e GamePix pedem um
// .zip com index.html na raiz. É só o
// CLIENTE: eles hospedam os arquivos e o servidor multiplayer continua sendo warspace.io — é assim que
// todo .io vive em portal, e a própria GameDistribution abre a exceção por escrito para "Real
// Multiplayer games". O que faz isso funcionar é a origem absoluta assada no bundle (VITE_API_BASE) e
// o CORS do lado de lá (server/src/http/cors.js).
//
// uso:  node scripts/portal-pack.mjs gd|crazy|poki|itch|y8|gm|gameflare|playgama|gamepix|all
//       WARSPACE_API_BASE=https://staging.exemplo node scripts/portal-pack.mjs gd
//       WARSPACE_BUILD_VERSION=1.1 node scripts/portal-pack.mjs all   # sai warspace-<portal>-1.1.zip
//
// ⚠️ O VALOR DESTE SCRIPT SÃO AS GUARDAS. Cada uma delas corresponde a um jeito conhecido de subir um
//    zip que parece certo e está errado — e todos falham em SILÊNCIO no portal, onde não há console
//    para olhar e a resposta chega dias depois como uma reprovação.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PORTAL } from "@warspace/shared";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SAIDA = path.join(RAIZ, "portal");
const API = (process.env.WARSPACE_API_BASE || "https://warspace.io").replace(/\/+$/, "");
// ⚠️ VERSÃO DO PACOTE, não do código. O `package.json` da raiz está em 2.0.0 (o monorepo v2), mas o que
// vai para os portais é a versão do PRODUTO publicado, e nas lojas ela começa em 1.0 — os dois números
// não têm por que andar juntos, e derivar um do outro faria a primeira submissão sair como "2.0.0".
// Ela entra só no NOME do arquivo (`warspace-<portal>-<versão>.zip`): nenhum portal lê versão de dentro
// do zip, quem versiona lá é o painel deles. Serve para você não subir o pacote errado quando houver
// três gerações na mesma pasta. `WARSPACE_BUILD_VERSION=1.1 node scripts/portal-pack.mjs all` troca.
const VERSAO = process.env.WARSPACE_BUILD_VERSION || "1.0";

// `strict` liga o interruptor da regra 7 (sem conta, sem Google, sem foto). Hoje todos em false: a
// decisão foi manter o cadastro e assumir o risco. Reprovou? Vira true e o pacote seguinte já sai limpo.
// App public token do Playgama (painel → cartão do jogo → Leaderboards). Público por definição: vai
// dentro do zip. `PLAYGAMA_TOKEN=` troca sem editar o arquivo.
const PG_TOKEN = process.env.PLAYGAMA_TOKEN || "cmtjgxfnd0sxdkl0h2rx0tugt";

const PERFIS = {
  gd:    { nome: "GameDistribution", strict: false, env: { VITE_GD_GAME_ID: "c352686e02ec4cd19e7a9ac436d38875" } },
  // ⚠️ `strict` LIGADO na CrazyGames, e não é escolha: eles proíbem, por escrito, "logging out and
  // allowing login with external options (Facebook, Google, email)". A conta ali é a DELES — o jogo
  // recebe o jogador já logado pelo SDK (ver client/src/portal/crazy.js e server/src/auth/crazygames.js).
  crazy: { nome: "CrazyGames", strict: true, env: {} },
  poki:  { nome: "Poki", strict: false, env: {} },
  // Y8: os dois ids saem da aba "SDK Initialization" do painel (developer.y8.com/games/war_space/edit).
  // O App ID identifica o ESTÚDIO/aplicativo e o Game ID identifica este jogo no inventário de anúncio —
  // são coisas diferentes e o SDK pede as duas em objetos separados (appConfig e adConfig).
  y8:    { nome: "Y8", strict: false, env: { VITE_Y8_APP_ID: "6a94f08b7d2d9d6de36661db", VITE_Y8_GAME_ID: "281845" } },
  // GameMonetize: o hash de 32 caracteres do painel deles, que é TAMBÉM o caminho em que o jogo passa a
  // ser servido (`https://html5.gamemonetize.co/<gameId>/`). Sem ele o adaptador devolve null e o pacote
  // sai sem anúncio — que é o que o "Verify Game" do painel reprova.
  gm:    { nome: "GameMonetize", strict: false, env: { VITE_GM_GAME_ID: "73u3oghoe3br3wpmg3yswmos8pkb3gt1" } },
  // ⚠️ `semSdk` NÃO é o mesmo que "env vazio": a Poki também não tem env aqui e TEM adaptador. Ele diz
  // que a ausência de chunk de adaptador é o esperado, e é o que desliga o aviso lá embaixo — que
  // existe para pegar o caso real de o SDK ter sido desligado sem querer.
  itch:  { nome: "itch.io", strict: false, semSdk: true, env: {} },
  // GameFlare (a plataforma é a GameArter): não há ID nem SDK a integrar. O SDK deles é OPCIONAL e é de
  // SITELOCK, não de anúncio — quem anuncia é a PÁGINA DELES, que roda o preroll no invólucro antes de
  // criar o iframe do jogo. Medido: um jogo HTML5 lá é servido de
  // `https://data.gameflare.com/games/<id>/<hash>/index.html`, dentro de um iframe SEM `sandbox`
  // (então a origem chega de verdade, e não como `null`) e com `allow="autoplay; fullscreen"` — sem
  // `microphone`, então o push-to-talk não existe lá.
  gameflare: { nome: "GameFlare", strict: false, semSdk: true, env: {} },
  // Playgama: não há id a assar no bundle — o Bridge descobre a plataforma pelo hostname (e eles ainda
  // penduram `?platform_id=playgama` na URL do jogo). O que este perfil tem de diferente é o `extras`:
  // o SDK deles BUSCA `./playgama-bridge-config.json` ao lado do index.html na inicialização, e sem o
  // arquivo a carga falha com CONFIG_LOAD_FAILED no console — jogo funcionando, defaults aplicados e o
  // revisor lendo um erro, contra o requisito técnico deles de "no technical messages, errors".
  // ⚠️ Ele é ESCRITO aqui e não mora em `client/public/`: lá ele iria para o site e para os OUTROS sete
  // pacotes, declarando um SDK que nenhum deles carrega. E o intervalo mínimo sai de `PORTAL.MIN_AD_MS`
  // em vez de um número copiado: o Bridge tem um relógio próprio (60 s de padrão) e, desalinhado do
  // nosso, ele reprova em FAILED anúncios que a fachada considerou legítimos.
  // GamePix: a porta de DESENVOLVEDOR (my.gamepix.com), que não tem nada a ver com a de publisher — o
  // `/ads.txt` do site, que continua sendo outra coisa (ver a PODA e docs/spec/portais.md). Não há id a
  // assar no bundle: o SDK descobre o jogo pelo player que o embute, e o `gameId` só nasce no upload.
  gamepix: { nome: "GamePix", strict: false, env: {} },
  playgama: { nome: "Playgama", strict: false, env: {}, extras: {
    "playgama-bridge-config.json": JSON.stringify({
      // ⚠️ `initialInterstitialDelay: 0` NÃO é ganância: o padrão da plataforma é 60 s CONTADOS DO
      // `game_ready` (medido no bundle deles), e é ele que recusava o PRIMEIRO anúncio de toda sessão —
      // exatamente o que a QA Tool devolveu como "No advertising is implemented". Quem decide a hora do
      // anúncio aqui é a fachada (`play()`, a passagem do menu para a partida) e quem os ESPAÇA é
      // `PORTAL.MIN_AD_MS`, que continua valendo entre um e outro.
      advertisement: { minimumDelayBetweenInterstitial: Math.round(PORTAL.MIN_AD_MS / 1000), initialInterstitialDelay: 0 },
      // ⚠️ O TOKEN É PÚBLICO POR DEFINIÇÃO — ele viaja dentro do zip, legível por qualquer jogador, e é
      // por isso que fica aqui e não num Secret. Sai do painel deles (developer.playgama.com → o cartão
      // do jogo → aba Leaderboards) e é o que autentica as chamadas SaaS (`x-public-token`). Sozinho ele
      // só carimba a analítica: quem LIGA o placar SaaS é o bloco `leaderboards.platforms` abaixo — sem
      // ele o Bridge cai no placar NATIVO da plataforma, que no Playgama não existe.
      // ⚠️ `qa_tool` junto com `playgama`: a QA Tool deles é uma PLATAFORMA à parte (`platform_id`
      // próprio), e sem essa entrada o placar simplesmente não funciona justo na ferramenta em que se
      // testa antes da moderação — a mesma lição do `.net` da QA Tool no CORS.
      saas: { publicToken: PG_TOKEN, leaderboards: { platforms: ["playgama", "qa_tool"] } },
      // o id de dentro do jogo (client/src/portal/pg.js) — tem que existir com este nome no painel
      leaderboards: [{ id: "score" }],
    }, null, 2) + "\n",
  } },
};
// O que veio de client/public e não faz sentido dentro de um iframe: ícone de app, manifest e o cartão
// de compartilhamento de uma página que ninguém cola em lugar nenhum. `favicon.svg` fica (810 bytes, e
// alguns portais o mostram).
// ⚠️ `faces/` SAI, e as duas metades do corte andam juntas: esta linha e o `!PORTAL` de `faceFile()`
// (client/src/theme/faces.js, onde o motivo está escrito por extenso). Só a guarda do cliente não basta
// — os 35 arquivos continuariam dentro do zip, e o NOME entrega a identidade sem ninguém abrir a imagem
// (`07_putin.webp` ao lado de `12_zelensky.webp`). Só a poda também não basta: sem a guarda, o cliente
// pediria `faces/*.webp` e o console do revisor encheria de 404. No SITE nada muda.
// ⚠️ `privacy.html` também sai: dentro do zip ela é peso morto (nada no jogo aponta para ela) e uma
// página de saída acessível é justamente o que os portais não querem. A URL dela vai no FORMULÁRIO deles.
// ⚠️ `ads.txt` sai pelo mesmo motivo, e é o caso mais claro de todos: um ads.txt SÓ é lido na RAIZ do
// domínio (`https://<dominio>/ads.txt`), e dentro do zip ele iria parar em `html5.gamedistribution.com/
// <id>/ads.txt`, onde ninguém o lê — mas onde ele DECLARA, no pacote de um portal, as centenas de
// parceiros de anúncio de OUTRA rede (o GamePix). São 39 KB de lista de concorrente dentro do jogo que
// se manda para revisão. Ele mora em client/public porque o SITE precisa dele; o portal, não.
const PODA = ["og.png", "icon-180.png", "icon-192.png", "icon-512.png", "manifest.webmanifest", "privacy.html", "ads.txt", "faces"];

// ⚠️ QUEM NÃO TEM ZIP, e por quê. A Bounty Board (bountyboard.gg/arcade) tem DOIS trilhos e só um
// serve para um `.io` com servidor próprio: o build ENVIADO roda em `sandbox="allow-scripts
// allow-pointer-lock"` — origem OPACA, `Origin: null` em toda chamada (que o CORS recusa por
// construção) e `localStorage` que LANÇA. O trilho certo é a URL externa: eles enquadram o site, com
// `allow-same-origin`. Ou seja o "pacote" dela é a produção de warspace.io, e o adaptador
// (client/src/portal/bb.js) viaja no bundle do SITE. Isto aqui existe para o dia em que alguém tentar
// `portal-pack.mjs bountyboard` e receber uma explicação em vez de "portal desconhecido".
const SEM_ZIP = {
  bountyboard: "a Bounty Board enquadra o SITE (https://warspace.io), não recebe zip: o build enviado deles\n    roda em origem OPACA e ali o nosso servidor é inalcançável. Ver docs/spec/portais.md.",
};

const arquivos = dir => fs.readdirSync(dir, { withFileTypes: true, recursive: true })
  .filter(d => d.isFile()).map(d => path.join(d.parentPath || d.path, d.name));
const morre = m => { console.error("\n✗ " + m + "\n"); process.exit(1); };

function empacota(id) {
  if (SEM_ZIP[id]) morre(`${id}: ${SEM_ZIP[id]}`);
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
  for (const [nome, conteudo] of Object.entries(perfil.extras || {})) fs.writeFileSync(path.join(dist, nome), conteudo);

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

  // ⚠️ FERRAMENTA DE DEV NO PACOTE — "Remove development tools, debug code, and testing artifacts" é
  // requisito escrito da Poki, e as quatro guardas do cliente (`bench.js`, `game/index.js`, `actions.js`,
  // `main.jsx`) são `!PORTAL` sobre um literal de `define`, ou seja o Rollup PODA o corpo. Quando a poda
  // funciona, o chunk da mesa de som nem é emitido e a string não sobra em lugar nenhum. Se alguém
  // acrescentar um atalho novo sem a guarda, ou trocar o `define` por leitura defensiva (que é o que já
  // aconteceu uma vez com as flags de portal), a poda para e ISTO é o que avisa — porque o sintoma do
  // outro lado é um revisor abrindo `?sfx` e vendo uma bancada de áudio no lugar do jogo.
  const bancada = todos.filter(f => /audition|hudDemo/.test(path.basename(f)));
  if (bancada.length) morre(`ferramenta de dev no pacote (${bancada.map(f => path.basename(f)).join(", ")}): a poda de !PORTAL não pegou`);
  // ⚠️ A ATRIBUIÇÃO, não a menção: o `destroy()` do motor faz `delete window.__warspace` para limpar o
  // que ele possa ter posto, e essa linha sobrevive à poda de propósito — é uma limpeza, não uma porta.
  // Procurar o nome cru reprovava um pacote correto.
  const atalhos = texto.filter(f => /has\("sfx"\)|window\.__(warspace|hudDemo|tela)\s*=/.test(fs.readFileSync(f, "utf8")));
  if (atalhos.length) morre(`atalho de desenvolvimento vivo no pacote (${atalhos.map(f => path.basename(f)).join(", ")})`);

  const abs = [];
  for (const f of texto.filter(f => /\.(html|css)$/.test(f))) {
    const t = fs.readFileSync(f, "utf8");
    if (/(src|href)="\//.test(t) || /url\(\/[^/]/.test(t)) abs.push(path.basename(f));
  }
  // ⚠️ O .js TAMBÉM, e ele estava de fora — passava por sorte: hoje o único caminho de asset montado em
  // JS é `${import.meta.env.BASE_URL}faces/…`, que resolve certo. Um `fetch("/algo")` cravado amanhã
  // sairia daqui sem alarme e viraria 404 no subcaminho do portal, que é o modo de falha mais caro deste
  // script (a página do revisor carrega e o recurso não). `/api/` fica fora: ele passa por `apiUrl()`,
  // que assa a ORIGEM absoluta — e é justamente o que a guarda de VITE_API_BASE, logo abaixo, confere.
  for (const f of texto.filter(f => /\.js$/.test(f))) {
    const t = fs.readFileSync(f, "utf8");
    const m = t.match(/(?:fetch|import|src\s*[:=]|href\s*[:=])\s*\(?\s*["'`]\/(?!\/|api\/)[a-z0-9_-]/i);
    if (m) abs.push(path.basename(f) + ` (${m[0].slice(0, 24)}…)`);
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

  // o SDK do Google não pode viajar no pacote: a origem de um portal não é registrável no client_id, e
  // a tentativa suja o console do revisor com um 403 e o «origin is not allowed» do GSI_LOGGER
  const gsi = texto.filter(f => /accounts\.google\.com\/gsi/.test(fs.readFileSync(f, "utf8")));
  if (gsi.length) morre(`o SDK do Google ficou no pacote (${gsi.map(f => path.basename(f)).join(", ")}): a origem do portal não é registrável no client_id`);

  const adaptadores = js.filter(f => /\/(gd|crazy|poki|y8|gm|gpx|pg)-[^/]*\.js$/.test(f));
  // `import()` com variável viraria glob no Rollup e o zip da GD sairia com o código da Poki dentro
  if (adaptadores.length > 1) morre(`${adaptadores.length} adaptadores de portal no pacote: ${adaptadores.map(f => path.basename(f)).join(", ")}`);
  if (!perfil.semSdk && !adaptadores.length) console.warn("  ⚠ nenhum chunk de adaptador — confira se o SDK deste portal está mesmo ligado");

  // ── zip ────────────────────────────────────────────────────────────────────
  // ⚠️ O CONTEÚDO da pasta, nunca a pasta: um zip com `dist/index.html` dentro é a rejeição nº 1 em
  // upload de portal, porque eles procuram o index.html na RAIZ.
  const zip = path.join(SAIDA, `warspace-${id}-${VERSAO}.zip`);
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
