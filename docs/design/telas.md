# Inventário de telas do planet.io v2

Independe do modelo visual escolhido. Todo modelo em `mockups/v2/` implementa exatamente estas
telas/estados sobre o mesmo DOM (gerado por `mockups/v2/src/engine2.js`) e os mesmos dados falsos
(`mockups/v2/src/data.js`). Na implementação real (Fase 2, React + PixiJS) cada tela vira um
componente em `client/src/ui/` e o HUD vira DOM sobre o canvas do Pixi.

## Telas

| # | id | Tela | Conteúdo | Dados / API (Fase 3) |
|---|---|---|---|---|
| 1 | `entry` | **Entrada** | marca, nick editável, skin equipada + Trocar, JOGAR (auto), links Salas/Ranking/Perfil/Loja/Opções, "jogando como convidado · Reivindicar conta", dicas de controle; coluna lateral com top 5 do dia e salas ativas | `GET /api/me`, `GET /api/ranking?period=day`, `GET /api/rooms` |
| 2 | `account` | **Conta** (modal) | abas Reivindicar (nick, senha, confirmar, e-mail opcional) e Entrar (nick, senha) | `POST /api/auth/claim`, `POST /api/auth/login` |
| 3 | `lobby` | **Salas** | chip do jogador (skin, nick, convidado/protegida), Jogar (auto), campo código (4 chars) + Entrar, Criar sala, lista de salas (código, shard, jogadores/max com barra, bots, ping, Entrar; cheia = desabilitada), top 5 | `GET /api/rooms`, `GET /api/auto`, WS `join {token, room?}` |
| 4 | `game` | **Jogo + HUD** | chips sala / ping·fps / Sair; placar top N + linha "você" (◆ bot, ✓ conta protegida, barra proporcional à massa); massa, pontos, nick, moedas; munição de míssil; powerups ativos com tempo; cooldowns dividir/ejetar; minimapa (asteroides, buracos negros, jogadores, viewport); botões touch DIVIDIR / EJETAR / MÍSSIL (mobile) | WS snapshots + `PLAYERS` + `LEADERBOARD` |
| 5 | `game@portrait` / `@landscape` / `@tablet` | **Jogo no dedo** | mesmo HUD reorganizado, sem tamanho de referência: o layout é fluido e a garantia é medida (ver abaixo). Botões touch ≥ 60 px, alvos tocáveis ≥ 44 px, área segura do notch respeitada | idem |
| 6 | `rank` | **Ranking** | período Geral/Semanal/Diário × métrica Pontos/Massa/Abates; top 50 (pos, nick ✓, valor, Δ posição); linha fixa "Você: 37º" | `GET /api/ranking?period&by` |
| 7 | `profile` | **Perfil** | skin, nick, status da conta, moedas, Reivindicar; 6 stats (partidas, abates, melhor pontuação, maior massa, tempo jogado, melhor sequência); histórico de 12 partidas (data, sala, massa, abates, posição, tempo, moedas, fim: devorado por / buraco negro / saiu); conquistas com progresso (secretas como ???) | `GET /api/me`, `GET /api/me/history` |
| 8 | `shop` | **Loja de skins** | skin equipada + N/50 desbloqueadas; filtro por raridade (7); 50 cards com estados: equipada / possuída (Equipar) / comprável (preço) / sem moedas / conquista (mostra condição) / secreta (???) | `GET /api/skins`, `POST /api/skins/:id/buy|equip` |
| 9 | `prefs` | **Preferências** | Controles (joystick, botão direito divide, W contínuo, sensibilidade), Gráficos (qualidade, rastros, efeitos, grade, parallax), Som (efeitos, música, volume), Interface (nomes, massa, minimapa, FPS/ping, linhas do placar), Acessibilidade (daltonismo, reduzir movimento, texto maior); Salvar / Restaurar | `PATCH /api/me/prefs` |
| 10 | `dead` | **Morte** | ABSORVIDO / SUGADO POR + nome; massa máx., abates, tempo, moedas ganhas; "ranking diário 41º → 35º"; Renascer / Lobby | WS `rewards` |
| 11 | `reconn` | **Reconectando** (overlay) | spinner, "Reconectando… tentativa n/5", Voltar ao lobby; mundo congelado atrás | WS `resume` |

## Navegação nos mockups

Barra `#devbar` (fora do `#app`) + teclas: `E` entrada · `C` conta · `S` salas · `R` ranking · `P` perfil ·

## Responsividade: a garantia é medida, não desenhada

Os mockups nasceram contra dois tamanhos fixos (390×844 e 844×390) e por muito tempo foi isso que "mobile"
significou. Não é mais: o modo agora tem quatro valores (`desktop · tablet · landscape · portrait`, com
histerese) e `body[data-pointer]` diz separadamente se o ponteiro é o **dedo** — tamanho e capacidade de
entrada são coisas diferentes, e confundi-las era o que fazia um iPad deitado receber o layout de desktop.

Quem prova que está responsivo é `node scripts/responsive-check.mjs [url]`: ele percorre **12 aparelhos ×
11 telas × 3 temas** num Chrome headless e falha se encontrar qualquer uma destas quatro coisas —

1. algo transbordando na horizontal;
2. algo **clipado por um ancestral que não rola** (conteúdo abaixo da dobra num container rolável é normal;
   inalcançável não é — foi assim que apareceu a tela de fim de rodada com os botões fora do alcance);
3. alvo tocável menor que 44 px onde o ponteiro é o dedo;
4. dois blocos do HUD se sobrepondo.

A classificação de aparelho é testada à parte, em `client/test/viewport.test.js` (tabela de 18 aparelhos +
histerese), porque o CDP não emula `pointer: coarse` de forma confiável — a matriz FIXA o modo e mede o
layout; o teste unitário mede a decisão. O canvas do Pixi não roda em headless neste ambiente, então o jogo
em si continua sendo aprovado de olho, em Chrome de verdade.

`L` loja · `O` opções · `J` jogo · `K` morte · `X` reconectando · `T` desktop→retrato→paisagem ·
`1–6` / `[` `]` trocar de modelo · `H` esconde a barra · `Esc` galeria.

Deep links: `?screen=<id>`, `?mode=portrait|landscape`, `?seed=7`, `?nobar`, `?frame=0` (sem moldura
do aparelho), `?shot=<id>` (cena estável, congela após 1,5 s, título `READY`), `?bench` / `?bench&leve`
(título `BENCH …`), `?selftest` (título `SELFTEST OK`).

## Física visível nos mockups (mesmos números da Fase 2)

Inércia (aceleração 0.14·vmax/tick, arrasto 0.92; regime de arremesso acima de 1.05·vmax com arrasto
0.94), quique elástico entre planetas com razão de raio < 1.15 (e = 0.55), engolir só com o centro do
menor bem dentro do maior; asteroides (cinturão de 6 orbitando + 6 errantes; peça ≥ 1.1× estoura em
peças, menor quica e perde 4% em lascas; massa ejetada alimenta e acima de 72 dispara um filho);
buracos negros (3; força ∝ 1/d², núcleo consome 30% da massa e teleporta para a saída pareada; ciclo
crescer → ativo → sumir); rastros; efeitos de colisão via lista `g.fx`.

## Contrato do tema

Ver cabeçalho de `mockups/v2/src/theme.nebula.js`. `tokens` → `:root{--…}` → `client/src/theme/<id>/tokens.css`
(`node mockups/v2/src/build.js --tokens <id>`). CSS do tema em seções fixas
(`BASE / HUD / ENTRADA / CONTA / LOBBY / RANKING / PERFIL / LOJA / PREFS / MORTE / RECONN / MOBILE`) para
a rodada híbrida ser recorte-e-cola.
