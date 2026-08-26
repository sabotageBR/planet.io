# Contrato sim ↔ persistência (`server/src/sim/hooks.js`)

A simulação nunca fala com o banco; ela chama hooks (objeto injetado em `createRoom({hooks})`). Default = no-op
(`server/src/sim/hooks.js` exporta `NOOP_HOOKS`). A persistência (`server/src/persist/hooks.js`) implementa:

```js
hooks.onPlayerJoin({token, fallbackNick, remoteAddr, userAgent})
  -> Promise<{ok:true, userId, nick, registered, skinId, prefs, sessionId, unsaved}
            |{ok:false, code:'AUTH'|'NICK_RESERVED', message, suggestion?}>
  // banco fora → {ok:true, userId:null, nick:fallbackNick, registered:false, skinId:0, unsaved:true}
hooks.onStat({sessionId, key:'split'|'eject'|'eat'|'eatBot'|'food'})     // contadores incrementais
hooks.onKill({sessionId, killerSessionId, victimSessionId, victimIsBot, weapon:'eat'|'missile'|'blackhole', tick})
hooks.onSample({sessionId, mass, rank, quadrant})                     // a cada 30 ticks
hooks.onMatchEnd({sessionId, cause:'eaten'|'blackhole'|'left'|'shutdown', killedBySessionId, score, maxMass, durationMs})
  -> Promise<rewards|null>   // rewards = {saved, coinsEarned, coins, achievements:[{key,title}], skinsUnlocked:[id], rank:{day}}
hooks.onShutdown() -> Promise<void>   // SIGTERM: fecha sessões 'shutdown' e drena a fila
```
`sessionId` é gerado no join (UUID) e identifica uma vida (join → morte/saída). Bots não passam pelos hooks.
Tudo é fire-and-forget exceto `onPlayerJoin` (timeout 3 s) e `onMatchEnd` (o servidor manda `rewards` quando resolver).
