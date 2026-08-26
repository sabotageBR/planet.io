import { useEffect, useRef } from "react";
/** Roda `fn` imediatamente e a cada `ms` enquanto `on` for verdadeiro. */
export function useInterval(fn, ms, on = true) {
  const ref = useRef(fn); ref.current = fn;
  useEffect(() => {
    if (!on) return;
    let alive = true; const run = () => { if (alive) ref.current(); };
    run(); const iv = setInterval(run, ms);
    return () => { alive = false; clearInterval(iv); };
  }, [ms, on]);
}
