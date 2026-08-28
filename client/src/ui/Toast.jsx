import React, { useEffect } from "react";
import { useStore } from "../state/store.js";
import { app } from "../state/app.js";
import { sfx } from "../audio/index.js";
export default function Toast() {
  const t = useStore(app, s => s.toast);
  useEffect(() => { if (t) sfx("toast"); }, [t]);
  return <div id="toast" className={t ? "on" : ""} role="status" aria-live="polite">{t ? t.msg : ""}</div>;
}
