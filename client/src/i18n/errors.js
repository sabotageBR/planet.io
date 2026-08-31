// ── ERRO DO SERVIDOR → TEXTO NO IDIOMA DO JOGADOR ─────────────────────────────
// A regra é UMA e vale para os ~20 pontos que mostram erro: **o CÓDIGO é a fonte, o `message` do
// servidor é o último paraquedas**. Era ao contrário (`toast(e.message)`), e por isso bastava algo dar
// errado para a tela ficar bilíngue. Com a inversão, um servidor mais NOVO que o cliente (código que o
// dicionário ainda não conhece) continua explicando o problema, só que em português — degrada, não quebra.
//
// ⚠️ O servidor reusa o mesmo código com sentidos diferentes conforme a rota: `not_found` é sala, lobby
// de equipe OU conta. Por isso `ctx` — sem ele, "essa sala não existe mais" e "conta não encontrada"
// viravam a mesma frase vaga. (No WS o desempate foi feito na fonte: `ROOM` virou ROOM_BANNED /
// ROOM_RESTART / ROOM_EXPIRED, porque lá "você foi banido" não podia virar "não deu para entrar".)
import { AVATAR } from "@warspace/shared";
import { getLabels, preenche } from "./index.js";

const PASSWORD_MIN = 6;   // server/src/auth/password.js — o servidor é quem manda; aqui é só o texto

/** Os dados que cada molde precisa. O que o servidor manda vem no corpo do erro; o resto o cliente já sabe. */
function dados(code, e) {
  const d = (e && e.data) || e || {};
  switch (code) {
    case "level_required": return { n: d.levelReq, v: d.level };            // já vêm no payload (api/skins.js)
    case "NICK_IN_ROOM": return { nick: d.nick || "" };
    case "bad_size": return { min: AVATAR.MIN, max: AVATAR.SIZE };          // constante compartilhada
    case "too_big": return { kb: Math.round(AVATAR.MAX_BYTES / 1024) };
    case "invalid_password": return { n: PASSWORD_MIN };
    case "http": return { n: d.status };
    default: return null;
  }
}

/**
 * Nunca lança e nunca devolve vazio. Ordem: err[ctx.code] → err[code] → message do servidor → err.unknown.
 * @param {any} e erro (ApiError, NetworkError ou o `{code,message}` do WS)
 * @param {string} [ctx] "room" | "party" | "nick" | "avatar" — desempata código reusado
 */
export function errText(e, ctx) {
  const E = getLabels().err;
  if (!e) return E.unknown;
  const code = e.code || e.error || null;
  if (!code) return e.message || E.network;                  // NetworkError não tem código
  const C = (ctx && E[ctx]) || null;
  const molde = (C && C[code]) || E[code];
  if (!molde) return e.message || (C && C.unknown) || E.unknown;
  return preenche(molde, dados(code, e));
}
