# Shell React do cliente v2 (`client/src`)

```
main.jsx            monta <App/> em #app; em dev instala window.__errors (+ html[data-errors])
app/App.jsx         ordem de DOM: #game · #hud · 8 telas · 2 overlays · #toast
app/theme.js        PONTE do tema (única linha a trocar) → hoje app/themeShim.js (TODO: ../theme/index.js + all.css)
api/client.js       api.* (bearer em localStorage.warspace_token) + modo offline (localStorage.warspace_local_profile)
state/store.js      createStore / useStore (useSyncExternalStore) / throttleStore
state/app.js        estado do shell + PREF_DEFAULTS (whitelist da API)
state/actions.js    boot, go, play/leaveGame, onDead/onRewards/onConnection, prefs, loja, conta, loaders
state/game.js       registro da instância do jogo (GameHost → Hud)
game/index.js       STUB do motor (contrato no cabeçalho do arquivo)
hooks/              useTheme/useLabels · useViewportMode · useInterval
ui/                 telas e HUD (mesmo DOM de mockups/v2/src/engine2.js) · labels.js · prefsTable.js · format.js
```

## Contrato de DOM (o CSS dos temas depende disto)

- `html[data-theme=dawn|sunset|dusk]` (applyTheme) · `body[data-mode=desktop|portrait|landscape]` (viewport ou `?mode=`),
  `body[data-screen]`, `body[data-online=1|0]`, `body[data-reduce]`, `body[data-bigtext]`, `body[data-colorblind]`.
- `#app` (raiz React) › `#game` (**div**; o motor põe `canvas` dentro — use `#game canvas`, não `canvas#game`) ›
  `#hud` (`.hidden` fora do jogo) › `.screen#s-<entry|lobby|rank|profile|shop|prefs|dead>` (`.on` = visível; o conteúdo
  só é montado quando `.on`) › `.overlay#s-account` / `#s-reconn` (`.on`) › `#toast` (`.on`).
- HUD: `#hud-top` (`.chip#h-room > #v-room`, `.chip#h-net > #v-ping #v-fps`, `#h-exit`), `.panel#hud-lb > .ph + #lb-rows > .lb-row[.mine][.top][style=--p]
  > .lb-pos .lb-name(i.bot/i.reg) .lb-val`, `.panel#hud-score` (`#v-mass #v-score #v-name #v-coins`), `#hud-status` (`.chip#hud-ammo[.empty] > #v-ammo`,
  `#hud-pw > .pw.pw-<k>`), `#hud-cd > .cd#cd-split/#cd-eject[.ready][style=--p] > i.cd-fill span em`, `#touch > .tbtn#t-split/#t-eject[.cd] #t-fire[.empty] > b#t-ammo`.
- Telas: `.wrap.<tela>-wrap` › `nav.nav > .nav-btn[data-nav][.on]`, `header.sh > .btn-mini.back + h1.stitle + .coinbar.sh-coins > b.v-coins`, `.card`, `.field > label + input`,
  `.skinrow > canvas.skinprev + .skinmeta(#m-skin #m-rar) + .btn-mini`, `.btn-primary/.btn-secondary/.btn-mini/.btn-link`, `.guest-note[data-kind] > .gn-txt + .btn-link`,
  `.mini-rank#entry-top5|#lobby-top5 > .mr-row > .mr-pos .mr-nick .mr-val`, `.mini-rooms#entry-rooms`, `.me-chip > canvas.skinprev-sm + .v-nick .v-kind[data-kind]`,
  `#codeIn`, `#room-list > .room-row[.head][.full][data-code] > .code .shard .pl(i.bar[--p]) .bots .ping .act`, `.toggles > .seg#rk-period/#rk-metric > button[.on]`,
  `.rank-table > table#rk-table (tr.me, tr.top.topN; td.c-rank .c-nick .c-val .c-delta[.up/.down])`, `.rank-me#rk-me`, `.profile-head > canvas.skinprev + .pf-meta(.pf-nick .pf-kind) + .pf-claim`,
  `.stat-cards#pf-stats > .stat.card`, `.pf-hist > table#pf-table (td.cause.<eaten|blackhole|left|shutdown>)`, `.ach-grid#pf-ach > .ach[.done][.secret] > .ach-ico .ach-body(.ach-bar > i[--p]) .ach-coins`,
  `.shop-eq (#s-skin #s-rar #s-count .badge)`, `.filters#shop-filters > button[data-f][.on][--rc]`, `.shop-grid#shop-grid > .skin-card.<eq|owned|buyable|poor|locked|secret>[data-skin][data-rar][--rc] > .badge? canvas b i em`,
  `.prefs-groups#prefs-groups > section.card.pg#pg-<id> > h2 + .pref-row > label + (.toggle[role=switch][aria-checked][data-pref] | select[data-pref] | .range > input[type=range][data-pref] + b)`,
  `.prefs-foot > #pf-reset #pf-save`, `.dead-card > .dead-icon .dead-title .dead-sub .dead-by(#d-by-lab #d-by) .dead-stats(#d-mass #d-kills #d-time #d-coins) .dead-rank(#d-rank .arrow) .dead-actions`,
  `.modal.account > .modal-title .tabs(button[data-tab].on) form.tab.tab-claim/.tab-login[.on] .modal-actions`, `.modal.reconn > .spinner .modal-title.rc-title .rc-sub#rc-sub`.
- Extras que não existem no mockup: `.form-error` (modal de conta), `.pf-logout`, `.room-row.empty`, `tr.empty`, `.mr-row.dim`, `#d-coins.pending`,
  ids `#pref-<key>` nos controles de prefs, `canvas.game-canvas` (stub).
- Botões `[data-go]` mantêm o atributo só para CSS; o clique é tratado por React (`actions.go/play/...`).

## Store (`state/app.js`)

```
booted, bootError
session: { user:{id,nick,kind:'guest'|'registered',coins,equippedSkin,createdAt}, skins:[ids], prefs:{whitelist}, stats:{games,kills,botKills,splits,ejects,bestScore,bestMass,playTime,bestStreak}, achievements:[keys], online:null|true|false, dayRank }
screen: entry|lobby|rank|profile|shop|prefs|game|dead        overlays: { account, reconn }   reconnAttempt
room (código atual)   pendingJoin:{room,n} (GameHost faz join quando muda)   conn: idle|connecting|connected|reconnecting|closed
toast:{msg,n}   mode: desktop|portrait|landscape   lastMatch:{by,byHole,score,maxMass,kills,durationS,room,at}
rewards:{saved,coinsEarned,coins,achievements,skinsUnlocked,rank:{day}}   rewardsPending (máx. 5 s "salvando…")
rooms, roomsAt, top5, config
```
`useStore(app, s => s.fatia)` — o seletor deve devolver referências estáveis.

## Motor do jogo (`game/index.js`)

`createGame({container:#game, hud:#hud, prefs, theme, onDead, onRewards, onConnection})` →
`{join({token,fallbackNick,room}), leave(), setPrefs(p), setTheme(t), resize(), destroy(), hudStore}`.
`hudStore.get()` = `{mass,score,rank,coins|null,ammo,powerups:{speed,magnet,shield} (s),splitCd,ejectCd (0..1 restante, 0 = pronto),lb:[{slot,name,mass,isBot,registered,me,rank}],room,ping,fps,dead}`.
O HUD lê via `throttleStore` (20 Hz). Botões touch emitem `CustomEvent('warspace:action',{detail:{action:'split'|'eject'|'fire',phase:'down'|'up'}})` que borbulha até `#hud`.
`onConnection({state:'connecting'|'connected'|'reconnecting'|'closed'|'error', room?, attempt?, code?, message?})` controla `#s-reconn` e a volta ao lobby.

## Dev

`cd client && npx vite --port 5173` · `?screen=<id>` (entry|account|lobby|rank|profile|shop|prefs|game|dead|reconn) · `?mode=portrait|landscape` ·
`window.__game.debug.die()/rewards()/reconn(n)` (só no stub) · `window.__errors` / `html[data-errors]`.
Sem servidor em :3001 o proxy do Vite responde 503 `{error:"unreachable"}` e o cliente entra em modo offline (perfil local, loja/prefs/histórico locais, salas/ranking vazios, conta desabilitada).
