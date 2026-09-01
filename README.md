# warspace.io

Arena multiplayer de planetas: cinturões de asteroides, estrelas que viram supernova, mísseis teleguiados,
zona que fecha e esquadrões de até 4. Servidor autoritativo em Node 22
(WebSocket binário, física compartilhada), cliente Vite + React + PixiJS com três temas que trocam pelo horário
(Amanhecer · Crepúsculo · Anoitecer), identidade por nickname com conta reivindicável, scores/ranking/skins/preferências no Postgres,
deploy em Kubernetes (3 shards).

- Como rodar, layout e arquitetura: `CLAUDE.md`
- Specs: `docs/spec/` (protocolo, API, hooks, servidor, cliente) · Design: `docs/design/` · Mockups aprovados: `mockups/v2/index.html`
