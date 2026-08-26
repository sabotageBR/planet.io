import { useEffect } from "react";
import { app } from "../state/app.js";

const FORCED = new URLSearchParams(location.search).get("mode");
/** desktop | portrait | landscape a partir do viewport (ou ?mode=… forçado). */
export function computeMode() {
  if (FORCED === "portrait" || FORCED === "landscape" || FORCED === "desktop") return FORCED;
  const w = innerWidth, h = innerHeight, coarse = matchMedia("(pointer: coarse)").matches;
  if (h > w && (w <= 820 || coarse)) return "portrait";
  if (w > h && (h <= 500 || (coarse && w <= 1100))) return "landscape";
  return "desktop";
}
/** Mantém app.mode e body[data-mode] em dia no resize/orientação. */
export function useViewportMode() {
  useEffect(() => {
    const apply = () => { const m = computeMode(); document.body.dataset.mode = m; if (app.get().mode !== m) app.update({ mode: m }); };
    apply();
    addEventListener("resize", apply); addEventListener("orientationchange", apply);
    return () => { removeEventListener("resize", apply); removeEventListener("orientationchange", apply); };
  }, []);
}
