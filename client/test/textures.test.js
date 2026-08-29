// ── As texturas dos TRÊS temas têm que ASSAR sem estourar ─────────────────────
// O `patterns.test.js` cobre `paintPattern`; este cobre a camada de cima, `textures.planet`, que é quem o
// renderer chama de verdade. A diferença custou caro: um `p.avatarBmp` num escopo onde `p` não existia
// passou por todos os testes, pelo build e pelo deploy, e derrubava a assadura de TODO planeta — o render
// morria no meio do frame, `pushHud` nunca rodava, e o jogo virava uma tela de fundo com o HUD zerado.
// Nada disso aparecia no console do servidor nem quebrava o socket: chat e som continuavam funcionando.
import test from "node:test";
import assert from "node:assert/strict";
import { SKINS } from "@planet/shared/skins.js";

/** Contexto 2D de mentira: aceita tudo, nunca lança, e registra o que foi chamado. */
function ctxFalso() {
  const alvo = { canvas: { width: 512, height: 512 }, fillStyle: "#000", strokeStyle: "#000", lineWidth: 1,
    lineCap: "butt", lineJoin: "miter", globalAlpha: 1, font: "10px sans", textAlign: "left", textBaseline: "top",
    shadowBlur: 0, shadowColor: "#000", shadowOffsetX: 0, shadowOffsetY: 0, filter: "none", globalCompositeOperation: "source-over" };
  return new Proxy(alvo, {
    get(o, k) { if (k in o) return o[k];
      return (...a) => (k === "createLinearGradient" || k === "createRadialGradient" || k === "createPattern")
        ? { addColorStop() {} } : (k === "measureText" ? { width: 10 } : undefined); },
    set(o, k, v) { o[k] = v; return true; }, has: () => true });
}

const TEMAS = ["dawn", "sunset", "dusk"];
for (const id of TEMAS) {
  test(`tema ${id}: planet() assa toda skin do catálogo`, async () => {
    const { default: tema } = await import(`../src/theme/${id}/index.js`);
    const TX = tema.textures;
    for (const skin of SKINS) for (const size of [128, 256]) {
      assert.doesNotThrow(() => TX.planet(ctxFalso(), size, { skin, isMe: false }),
        `${id}: skin ${skin.id} "${skin.name}" (${skin.pattern}) estourou em ${size}px`);
    }
    // com a foto do jogador presente (a skin "Retrato") e sem ela
    const foto = SKINS.find(s => s.pattern === "avatar");
    assert.doesNotThrow(() => TX.planet(ctxFalso(), 256, { skin: foto, isMe: true, avatarBmp: { width: 256, height: 256 } }));
    assert.doesNotThrow(() => TX.planet(ctxFalso(), 256, { skin: foto, isMe: true }));
    // e a prévia da loja/perfil, que passa pelo mesmo caminho
    assert.doesNotThrow(() => TX.paintSkin(ctxFalso(), SKINS[0], 40));
    // a CHAVE de cache tem que separar avatares diferentes, senão dois jogadores colidem na mesma textura
    const k0 = TX.key("planet", { skin: foto, isMe: false }, 256);
    const k1 = TX.key("planet", { skin: foto, isMe: false, avatar: "9:abc" }, 256);
    const k2 = TX.key("planet", { skin: foto, isMe: false, avatar: "9:xyz" }, 256);
    assert.notEqual(k0, k1); assert.notEqual(k1, k2);
  });
}
