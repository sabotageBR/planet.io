// ── RECORTE E REDUÇÃO DA FOTO DO JOGADOR (a skin "Retrato") ───────────────────
// Tudo no cliente e sem dependência: `createImageBitmap` + canvas. O servidor NÃO redimensiona — ele só
// confere o cabeçalho (server/src/api/imagemeta.js) —, então quem tem que entregar a imagem no tamanho e
// no peso certos é esta função.
// @ts-check
import { AVATAR } from "@planet/shared";

/**
 * Reduz para um QUADRADO de `size` px recortando o centro (cover), e comprime até caber em MAX_BYTES.
 * A busca de qualidade é uma escada, não uma conta: WebP não tem relação previsível entre qualidade e
 * bytes, e tentar adivinhar custaria mais que tentar.
 * @param {Blob|File} file @param {{zoom?:number,dy?:number}} ajuste
 * @returns {Promise<Blob>}
 */
export async function prepararAvatar(file, { zoom = 1, dy = 0 } = {}) {
  const bmp = await createImageBitmap(file);
  try {
    for (const lado of [AVATAR.SIZE, 192, AVATAR.FALLBACK_SIZE]) {
      const c = desenhar(bmp, lado, zoom, dy);
      for (let q = 0.82; q >= 0.4; q -= 0.1) {
        const b = await toBlob(c, "image/webp", q);
        // Safari antigo ignora o tipo pedido e devolve PNG: o `type` de volta é a única forma de saber.
        if (b && b.type === "image/webp" && b.size <= AVATAR.MAX_BYTES) return b;
        if (!b || b.type !== "image/webp") break;
      }
      // sem WebP: PNG só cabe no tamanho pequeno, e é por isso que FALLBACK_SIZE existe
      if (lado === AVATAR.FALLBACK_SIZE) {
        const b = await toBlob(c, "image/png");
        if (b && b.size <= AVATAR.MAX_BYTES) return b;
      }
    }
  } finally { if (bmp.close) bmp.close(); }
  throw new Error("imagem pesada demais mesmo depois de reduzir");
}

/** Recorte circular já no arquivo: dentro do planeta ele é redondo de qualquer jeito, e ver o resultado
 *  final na hora de escolher é o que faz a foto parecer intencional em vez de cortada por acidente. */
function desenhar(bmp, lado, zoom, dy) {
  const c = document.createElement("canvas"); c.width = c.height = lado;
  const x = c.getContext("2d");
  x.save(); x.beginPath(); x.arc(lado / 2, lado / 2, lado / 2, 0, 6.2832); x.clip();
  const k = Math.max(lado / bmp.width, lado / bmp.height) * Math.max(1, zoom);
  const w = bmp.width * k, h = bmp.height * k;
  x.drawImage(bmp, (lado - w) / 2, (lado - h) / 2 + dy * lado, w, h);
  x.restore();
  return c;
}
const toBlob = (c, tipo, q) => new Promise(res => c.toBlob(res, tipo, q));
