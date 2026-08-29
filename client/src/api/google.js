// ── GOOGLE IDENTITY SERVICES: carga SOB DEMANDA ───────────────────────────────
// O <script> do Google NÃO vai no index.html de propósito: é código de terceiro em TODA carga da
// página, para um botão que a maioria dos jogadores nunca usa. Aqui ele só desce quando aparece uma
// tela que tem o botão — e só se o servidor tiver mandado um `googleClientId` em /api/config, que é
// o único interruptor do recurso.
const SRC = "https://accounts.google.com/gsi/client";

const pronto = () => (window.google && window.google.accounts && window.google.accounts.id) || null;

let carga = null;
function carregaGsi() {
  const j = pronto(); if (j) return Promise.resolve(j);
  if (!carga) carga = new Promise((ok, falha) => {
    const s = document.createElement("script");
    s.src = SRC; s.async = true; s.defer = true;
    s.onload = () => { const id = pronto(); id ? ok(id) : falha(new Error("gsi carregou sem accounts.id")); };
    // bloqueador de anúncios, rede fora, política de rede: zera a promessa (para uma próxima tentativa
    // poder acontecer) e deixa quem chamou decidir — o modal de conta segue funcionando com senha.
    s.onerror = () => { carga = null; falha(new Error("não deu para carregar o Google Identity Services")); };
    document.head.appendChild(s);
  });
  return carga;
}

// `initialize` é SINGLETON no GSI: chamar de novo com outro callback reconfigura o mundo inteiro.
// Por isso ele roda UMA vez por clientId, e o callback real fica nesta variável — assim os dois
// botões (o da entrada e o do modal) convivem sem um desconfigurar o outro.
let iniciado = "", aoEntrar = null;
/** Garante o SDK carregado e inicializado; devolve `google.accounts.id`. */
export async function iniciaGsi(clientId, callback) {
  const id = await carregaGsi();
  aoEntrar = callback;
  if (iniciado !== clientId) {
    id.initialize({ client_id: clientId, callback: r => aoEntrar && aoEntrar(r), ux_mode: "popup", auto_select: false, cancel_on_tap_outside: true });
    iniciado = clientId;
  }
  return id;
}
