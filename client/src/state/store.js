// ── STORE EXTERNO MÍNIMO ──────────────────────────────────────────────────────
// createStore(initial) → {get,set,update,subscribe}; useStore(store, selector) via useSyncExternalStore.
// O estado é imutável: `set` troca o objeto inteiro (rasa), `update(fn)` recebe o atual e devolve o novo.
// Seletores devem devolver referências estáveis (fatias do estado), nunca objetos/arrays novos.
import { useSyncExternalStore } from "react";

export function createStore(initial) {
  let state = initial; const subs = new Set();
  const notify = () => subs.forEach(fn => fn(state));
  return {
    get: () => state,
    set(next) { if (next === state) return; state = next; notify(); },
    update(fn) { const next = typeof fn === "function" ? fn(state) : { ...state, ...fn }; if (next !== state) { state = next; notify(); } },
    subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },
  };
}
const identity = s => s;
export function useStore(store, selector = identity) {
  return useSyncExternalStore(store.subscribe, () => selector(store.get()), () => selector(store.get()));
}
/** Store derivado que só notifica a cada `ms` (HUD a 20 Hz sobre um hudStore que emite a 60 Hz). */
export function throttleStore(store, ms = 50) {
  let snap = store.get(), timer = null, last = 0; const subs = new Set();
  const push = () => { timer = null; last = performance.now(); snap = store.get(); subs.forEach(fn => fn(snap)); };
  let unsub = null;
  return {
    get: () => snap,
    subscribe(fn) {
      if (!subs.size) unsub = store.subscribe(() => { if (timer) return; timer = setTimeout(push, Math.max(0, ms - (performance.now() - last))); });
      subs.add(fn);
      return () => { subs.delete(fn); if (!subs.size && unsub) { unsub(); unsub = null; if (timer) { clearTimeout(timer); timer = null; } } };
    },
  };
}
