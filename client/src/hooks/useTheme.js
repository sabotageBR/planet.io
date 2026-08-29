import { useMemo, useSyncExternalStore } from "react";
import { currentTheme } from "../app/theme.js";
import { mergeLabels } from "../ui/labels.js";

const subscribe = fn => { addEventListener("warspace:theme", fn); return () => removeEventListener("warspace:theme", fn); };
/** Tema atual; re-renderiza no evento `warspace:theme`. */
export function useTheme() { return useSyncExternalStore(subscribe, currentTheme, currentTheme); }
/** LABELS mesclados com currentTheme().labels. */
export function useLabels() { const th = useTheme(); return useMemo(() => mergeLabels(th && th.labels), [th]); }
