// ── RADAR: canvas 2D pequeno (#radar dentro de #hud), 10 Hz, desenhado por theme.hud.radar ──
// Posicionado por estilo inline conforme radar.position/size do modo atual (não há CSS de #radar).
import {WORLD} from "@planet/shared";
import {bodyMode} from "../util.js";

export function createMinimap({hud,theme,getScene}){
  const cv=document.createElement("canvas");cv.id="radar";cv.style.cssText="position:absolute;z-index:5;pointer-events:none";
  const ctx=cv.getContext("2d");let last=0,mode="",D=0,dpr=1,th=theme();
  if(hud)hud.appendChild(cv);
  function layout(){const R0=th.hud.radar,m=bodyMode();mode=m;D=R0.size[m]||R0.size.desktop;dpr=Math.min(2,devicePixelRatio||1);
    const pad=R0.shadow?Math.max(R0.shadow.dx,R0.shadow.dy)+2:2,lab=R0.label&&(!R0.label.desktopOnly||m==="desktop")?16:0,w=D+pad+2,h=D+pad+lab+2;
    cv.width=Math.round(w*dpr);cv.height=Math.round(h*dpr);cv.style.width=w+"px";cv.style.height=h+"px";
    const P=R0.position||{corner:"top-right",margin:12},mg=P.margin==null?12:P.margin,c=P.corner||"top-right";
    cv.style.top=c.startsWith("top")?mg+"px":"auto";cv.style.bottom=c.startsWith("bottom")?mg+"px":"auto";
    cv.style.right=c.endsWith("right")?mg+"px":"auto";cv.style.left=c.endsWith("left")?mg+"px":"auto";}
  layout();
  function draw(now){const R0=th.hud.radar,m=bodyMode();if(m!==mode)layout();const S=getScene();if(!S)return;
    const c=ctx,R=D/2,cx=R+1,cy=R+1,t=now;c.setTransform(dpr,0,0,dpr,0,0);c.clearRect(0,0,cv.width,cv.height);c.lineJoin="round";
    if(R0.shadow){c.fillStyle=R0.shadow.color;c.beginPath();c.arc(cx+R0.shadow.dx,cy+R0.shadow.dy,R,0,6.283);c.fill();}
    c.fillStyle=R0.face;c.beginPath();c.arc(cx,cy,R,0,6.283);c.fill();c.strokeStyle=R0.border.color;c.lineWidth=R0.border.width;c.stroke();
    if(R0.rings){c.strokeStyle=R0.rings.color;c.lineWidth=R0.rings.width;R0.rings.at.forEach(k=>{c.beginPath();c.arc(cx,cy,R*k,0,6.283);c.stroke();});
      if(R0.rings.crosshair){c.beginPath();c.moveTo(cx-R,cy);c.lineTo(cx+R,cy);c.moveTo(cx,cy-R);c.lineTo(cx,cy+R);c.stroke();}}
    if(R0.sweep){const a=t*R0.sweep.speed;c.fillStyle=R0.sweep.fill;c.beginPath();c.moveTo(cx,cy);c.arc(cx,cy,R-2,a-R0.sweep.span,a);c.closePath();c.fill();
      c.strokeStyle=R0.sweep.line;c.lineWidth=R0.sweep.width;c.beginPath();c.moveTo(cx,cy);c.lineTo(cx+Math.cos(a)*(R-2),cy+Math.sin(a)*(R-2));c.stroke();}
    const SZ=D*(R0.mapK||.72),mx=cx-SZ/2,my=cy-SZ/2,sc=SZ/WORLD.w,st=R0.colors;c.save();c.beginPath();c.arc(cx,cy,R-2,0,6.283);c.clip();
    for(const h of S.holes){c.fillStyle=st.hole;c.beginPath();c.arc(mx+h.x*sc,my+h.y*sc,Math.max(2.2,h.ri*sc*.5),0,6.283);c.fill();}
    c.fillStyle=st.ast;for(const q of S.asteroids)c.fillRect(mx+q.x*sc-1,my+q.y*sc-1,2,2);
    for(const p of S.players){if(p.isMe)continue;c.fillStyle=p.isBot?st.bot:st.player;c.fillRect(mx+p.x*sc-1.8,my+p.y*sc-1.8,3.6,3.6);}
    const cam=S.cam,hw=cam.W/(2*cam.scale)*sc,hh=cam.H/(2*cam.scale)*sc;c.strokeStyle=st.view;c.lineWidth=1;c.strokeRect(mx+cam.x*sc-hw,my+cam.y*sc-hh,hw*2,hh*2);
    const me=S.players.find(p=>p.isMe);if(me){const md=R0.meDot;c.fillStyle=md.fill;c.strokeStyle=md.stroke;c.lineWidth=md.width;c.beginPath();c.arc(mx+me.x*sc,my+me.y*sc,md.r[m]||3,0,6.283);c.fill();c.stroke();}
    c.restore();
    if(R0.label&&(!R0.label.desktopOnly||m==="desktop")){c.font=R0.label.font;c.fillStyle=R0.label.color;c.textAlign="center";c.textBaseline="middle";c.fillText(R0.label.text,cx,cy+R+R0.label.dy+14);}}
  return{canvas:cv,
    update(now){if(now-last<100)return;last=now;draw(now);},
    setTheme(t){th=t;layout();},
    show(on){cv.style.display=on?"":"none";},
    destroy(){cv.remove();}};}
