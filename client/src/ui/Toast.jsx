import React from "react";
import { useStore } from "../state/store.js";
import { app } from "../state/app.js";
export default function Toast() {
  const t = useStore(app, s => s.toast);
  return <div id="toast" className={t ? "on" : ""} role="status" aria-live="polite">{t ? t.msg : ""}</div>;
}
