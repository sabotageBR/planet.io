// ── GOOGLE ANALYTICS ──────────────────────────────────────────────────────────
// O snippet do gtag mora no index.html e conta UMA page_view por carga da página. Só que o jogo é uma SPA
// que nunca troca de URL fora de /admin: sem o que está aqui, a tela inicial, a loja, o ranking e a partida
// seriam a MESMA linha do relatório. Cada tela vira então uma page_view VIRTUAL (`/tela/<nome>`) e a
// entrada em partida vira evento próprio.
// ⚠️ `page_location` sem hash de propósito: o GA4 deriva o "page path" da URL e DESCARTA o fragmento, então
//    `/#loja` colapsaria tudo em "/" de novo — o prefixo `/tela/` é o que deixa claro que a URL é virtual e
//    não colide com a rota real que existe (`/admin`). A tela inicial é a raiz, para somar com a carga.
// ⚠️ Nada aqui pode quebrar a tela: bloqueador de anúncio, modo offline e o dev sem rede deixam o `gtag`
//    ausente (ou mudo, empilhando no dataLayer para sempre) — daí o no-op silencioso em `envia`.
import { app } from "../state/app.js";
import { modeOf } from "@warspace/shared";

// Rótulo por tela, em pt-BR e FIXO: ele é o `page_title` do relatório, e tirá-lo do dicionário faria a
// mesma tela virar três linhas diferentes conforme o idioma de quem jogou.
const TELAS = { entry:"Início", modes:"Modos", party:"Equipe", lobby:"Salas", rank:"Ranking", profile:"Perfil",
  shop:"Loja", prefs:"Opções", game:"Partida", dead:"Morte", round:"Fim de rodada" };

const envia = (nome, params) => {
  const g = typeof window !== "undefined" && window.gtag;
  if (typeof g !== "function") return;
  try { g("event", nome, params); } catch { /* medir nunca pode derrubar o jogo */ }
};

let ultima = null, ligado = false;
/** Troca de tela → page_view virtual. Repetição não conta: `app.update` notifica a cada toast e cada pref. */
export function telaVista(screen) {
  const rotulo = TELAS[screen]; if (!rotulo || screen === ultima) return;
  ultima = screen;
  envia("page_view", { page_title: "warspace.io — " + rotulo,
    page_location: location.origin + (screen === "entry" ? "/" : "/tela/" + screen) });
}

/** Entrada em partida (`play()` é a porta única: auto, convite, sala criada e largada de equipe passam por lá). */
export function partidaIniciada({ mode = 0, teamSize = 1, party = null } = {}) {
  // o modo vai pelo NOME (`free`/`br`): um 0/1 solto no painel não diz nada seis meses depois
  envia("match_start", { mode: modeOf(mode | 0).key, team_size: teamSize | 0 || 1, party: party ? 1 : 0 });
}

/**
 * Liga o rastreio de telas. UMA assinatura do store cobre todas as trocas — inclusive as que não passam
 * pelo `go()` (partida, morte e fim de rodada escrevem `screen` direto), que são justamente as que mais
 * interessam. A tela inicial já foi contada pelo `config` do index.html, então ela nasce como `ultima`.
 */
export function iniciaAnalytics() {
  if (ligado) return; ligado = true;
  ultima = app.get().screen;
  app.subscribe(s => telaVista(s.screen));
}
