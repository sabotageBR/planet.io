# Contrato sim ↔ persistência (`server/src/sim/hooks.js`)

A simulação nunca fala com o banco; ela chama hooks (objeto injetado em `createRoom({hooks})`). Default = no-op
(`server/src/sim/hooks.js` exporta `NOOP_HOOKS`). A persistência (`server/src/persist/hooks.js`) implementa:

```js
hooks.onPlayerJoin({token, fallbackNick, remoteAddr, userAgent})
  -> Promise<{ok:true, userId, nick, registered, skinId, prefs, sessionId, unsaved}
            |{ok:false, code:'AUTH', message}>   // NICK_RESERVED morreu com a 0009: o nick é livre
  // banco fora → {ok:true, userId:null, nick:fallbackNick, registered:false, skinId:0, unsaved:true}
hooks.onStat({sessionId, key:'split'|'eject'|'eat'|'eatBot'|'food'})     // contadores incrementais
hooks.onKill({sessionId, killerSessionId, victimSessionId, victimIsBot, weapon:'eat'|'missile'|'blackhole', tick})
hooks.onSample({sessionId, mass, rank, quadrant})                     // a cada 30 ticks
hooks.onMatchEnd({sessionId, cause:'eaten'|'blackhole'|'left'|'shutdown', killedBySessionId, score, maxMass, durationMs})
  -> Promise<rewards|null>   // rewards = {saved, coinsEarned, coins, achievements:[{key,title}], skinsUnlocked:[id], rank:{day}}
hooks.onShutdown() -> Promise<void>   // SIGTERM: fecha sessões 'shutdown' e drena a fila
hooks.openSession({userId, nick, kind, skinId, roomCode}) -> sessionId|null   // vida NOVA de quem já está na sala (respawn)
hooks.dropSession(sessionId) -> boolean                                       // o join foi RECUSADO: joga fora, sem gravar
```
⚠️ **`dropSession` não é um `onMatchEnd` mais barato — é o oposto dele.** A sessão nasce em `onPlayerJoin`,
ANTES de se saber em que sala o jogador entra e antes de qualquer recusa, e os becos de `net/wsServer.js`
(sala cheia/já começou, nick em uso, banido, socket que caiu esperando, erro) fechavam com
`onMatchEnd({durationMs:0})` ou simplesmente não fechavam. O primeiro caso gravava uma linha REAL em
`matches` com `duration_s=0` — que ainda passa por `upsertStats` e SOMA 1 no `games` do perfil —, e
`repos/analytics.js` toma a linha de menor `id` por usuário como "a primeira vida": a fantasma virava a
estreia do novato. O segundo é pior: a sessão fica no Map até o `onShutdown` e é gravada como
`cause:'shutdown'` com a duração do PROCESSO INTEIRO. Ninguém jogou, então não há partida a gravar.
`sessionId` é gerado no join (UUID) e identifica uma VIDA (join → morte/saída) — não uma visita: no Livre
morrer e renascer fecha uma e abre outra por `openSession`. Quem mede a visita é `gp.entrouTick`, que o
`Sim.revive` não zera, e ele só existe para o painel AO VIVO. Bots não passam pelos hooks.
Tudo é fire-and-forget exceto `onPlayerJoin` (timeout 3 s) e `onMatchEnd` (o servidor manda `rewards` quando resolver).
