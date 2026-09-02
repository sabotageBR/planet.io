// ── A DETECÇÃO DO EMBUTIDOR DA BOUNTY BOARD ───────────────────────────────────
// `daBounty` decide se o site está sendo enquadrado pelo player deles — e é o que liga o adaptador
// (client/src/portal/bb.js) e desliga a voz (o `allow` do iframe deles não tem `microphone`).
// A regra é SUFIXO DE DOMÍNIO, nunca `includes`: é a mesma armadilha clássica que
// `server/src/http/cors.js` documenta, e um `includes` deixaria `bountyboard.gg.evil.tld` passar.
// node --test client/test/bounty.test.js
import test from "node:test";
import assert from "node:assert/strict";
const { daBounty } = await import("../src/portal/flags.js");

test("daBounty: o apex, os subdomínios e nada mais", () => {
  for (const ok of ["https://bountyboard.gg", "https://www.bountyboard.gg/", "https://www.bountyboard.gg/arcade/x",
    "https://staging.bountyboard.gg", "HTTPS://WWW.BOUNTYBOARD.GG"])
    assert.equal(daBounty(ok), true, ok);
  for (const nao of ["https://bountyboard.gg.evil.tld", "https://evilbountyboard.gg", "https://notbountyboard.gg",
    "https://bountyboard.com", "bountyboard.gg", "", null, undefined, "null", "about:blank"])
    assert.equal(daBounty(nao), false, String(nao));
});
