// ── A FOTO DA SKIN "RETRATO" ──────────────────────────────────────────────────
// Escolher, enquadrar (arrastar + zoom) e subir. O que sai daqui é um WebP quadrado de ≤256 px e poucos
// KB — o servidor confere o cabeçalho e guarda os bytes no Postgres, que é o único armazenamento durável
// do cluster.
import React, { useRef, useState } from "react";
import { AVATAR } from "@planet/shared";
import { useStore } from "../state/store.js";
import { app } from "../state/app.js";
import { useLabels } from "../hooks/useTheme.js";
import { api } from "../api/client.js";
import { prepararAvatar } from "../util/image.js";
import { toast } from "../state/actions.js";

export default function AvatarPicker() {
  const LB = useLabels();
  const user = useStore(app, s => s.session.user) || {};
  const [file, setFile] = useState(null), [zoom, setZoom] = useState(1), [dy, setDy] = useState(0);
  const [busy, setBusy] = useState(false), [prev, setPrev] = useState(null);
  const inp = useRef(null);

  const escolher = async e => {
    const f = e.target.files && e.target.files[0]; if (!f) return;
    setFile(f); setZoom(1); setDy(0); await previa(f, 1, 0);
  };
  const previa = async (f, z, d) => {
    try { const b = await prepararAvatar(f, { zoom: z, dy: d }); setPrev(URL.createObjectURL(b)); }
    catch { setPrev(null); }
  };
  const subir = async () => {
    if (!file || busy) return; setBusy(true);
    try {
      const blob = await prepararAvatar(file, { zoom, dy });
      const r = await api.uploadAvatar(blob);
      app.update(s => ({ ...s, session: { ...s.session, user: { ...s.session.user, avatar: r.avatar } } }));
      setFile(null); setPrev(null); toast(LB.avatarTitle + " ✓");
    } catch (e) { toast(e.message || "não deu para subir a imagem"); }
    finally { setBusy(false); }
  };
  const remover = async () => {
    setBusy(true);
    try { await api.removeAvatar(); app.update(s => ({ ...s, session: { ...s.session, user: { ...s.session.user, avatar: null } } })); }
    catch { /* já não havia */ } finally { setBusy(false); }
  };
  const atual = user.avatar ? api.avatarUrl(user.id, user.avatar) : null;
  return <div className="card avatar-picker">
    <div className="ap-head"><b>{LB.avatarTitle}</b><span className="hint">{LB.avatarHint}</span></div>
    <div className="ap-body">
      <div className="ap-prev">{prev || atual ? <img src={prev || atual} alt="" /> : <span className="ap-empty">🖼️</span>}</div>
      <div className="ap-ctrl">
        <input ref={inp} type="file" accept="image/png,image/jpeg,image/webp" onChange={escolher} hidden />
        <button className="btn-secondary" onClick={() => inp.current && inp.current.click()}>{LB.avatarPick}</button>
        {file ? <>
          <label className="ap-range">🔍<input type="range" min="1" max="3" step="0.05" value={zoom}
            onChange={e => { const z = +e.target.value; setZoom(z); previa(file, z, dy); }} /></label>
          <label className="ap-range">↕<input type="range" min="-0.3" max="0.3" step="0.02" value={dy}
            onChange={e => { const d = +e.target.value; setDy(d); previa(file, zoom, d); }} /></label>
          <button className="btn-primary" disabled={busy} onClick={subir}>{busy ? "…" : "OK"}</button>
        </> : null}
        {atual && !file ? <button className="btn-mini" disabled={busy} onClick={remover}>{LB.avatarRemove}</button> : null}
      </div>
    </div>
    <span className="hint dim">máx. {AVATAR.SIZE}px · {Math.round(AVATAR.MAX_BYTES / 1024)} KB</span>
  </div>;
}
