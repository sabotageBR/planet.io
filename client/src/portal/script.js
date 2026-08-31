// Injeta o script de um portal. Molde de `api/google.js`: `onerror` não é exceção, é resposta — um
// bloqueador de anúncio derrubando o SDK é o caso COMUM, não o excepcional, e ali o jogo segue sem ele.
export const carregaScript = (src, id) => new Promise(res => {
  if (id && document.getElementById(id)) return res(true);
  const s = document.createElement("script");
  if (id) s.id = id;
  s.async = true; s.src = src;
  s.onload = () => res(true); s.onerror = () => res(false);
  document.head.appendChild(s);
});
