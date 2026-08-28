// ── RADAR: canvas 2D pequeno (#radar dentro de #hud), 10 Hz, desenhado por theme.hud.radar ──
// Os inimigos vêm do PLACAR (todos os vivos, com posição, a 2 Hz) e não da AOI: o radar mostra o mapa inteiro.
// Perigos e peças próprias continuam vindo da cena, que é o que o cliente enxerga de verdade.
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
  function draw(now,zone){const R0=th.hud.radar,m=bodyMode();if(m!==mode)layout();const S=getScene();if(!S)return;
    const c=ctx,R=D/2,cx=R+1,cy=R+1,t=now;c.setTransform(dpr,0,0,dpr,0,0);c.clearRect(0,0,cv.width,cv.height);c.lineJoin="round";
    if(R0.shadow){c.fillStyle=R0.shadow.color;c.beginPath();c.arc(cx+R0.shadow.dx,cy+R0.shadow.dy,R,0,6.283);c.fill();}
    c.fillStyle=R0.face;c.beginPath();c.arc(cx,cy,R,0,6.283);c.fill();c.strokeStyle=R0.border.color;c.lineWidth=R0.border.width;c.stroke();
    if(R0.rings){c.strokeStyle=R0.rings.color;c.lineWidth=R0.rings.width;R0.rings.at.forEach(k=>{c.beginPath();c.arc(cx,cy,R*k,0,6.283);c.stroke();});
      if(R0.rings.crosshair){c.beginPath();c.moveTo(cx-R,cy);c.lineTo(cx+R,cy);c.moveTo(cx,cy-R);c.lineTo(cx,cy+R);c.stroke();}}
    if(R0.sweep){const a=t*R0.sweep.speed;c.fillStyle=R0.sweep.fill;c.beginPath();c.moveTo(cx,cy);c.arc(cx,cy,R-2,a-R0.sweep.span,a);c.closePath();c.fill();
      c.strokeStyle=R0.sweep.line;c.lineWidth=R0.sweep.width;c.beginPath();c.moveTo(cx,cy);c.lineTo(cx+Math.cos(a)*(R-2),cy+Math.sin(a)*(R-2));c.stroke();}
    const SZ=D*(R0.mapK||.72),mx=cx-SZ/2,my=cy-SZ/2,sc=SZ/WORLD.w,st=R0.colors;c.save();c.beginPath();c.arc(cx,cy,R-2,0,6.283);c.clip();
    // a ZONA vem primeiro: é o pano de fundo de tudo o mais no radar, e é para onde o jogador tem que correr
    if(zone){const zs=(R0.colors&&R0.colors.zone)||"#ff4d5e";
      c.save();c.strokeStyle=zs;c.lineWidth=1.6;c.beginPath();c.arc(mx+zone.x*sc,my+zone.y*sc,Math.max(2,zone.r*sc),0,6.283);c.stroke();
      if(zone.tr<zone.r-1){c.setLineDash([3,3]);c.lineWidth=1.2;c.beginPath();c.arc(mx+zone.tx*sc,my+zone.ty*sc,Math.max(2,zone.tr*sc),0,6.283);c.stroke();}
      c.restore();}
    for(const h of S.holes){c.fillStyle=st.hole;c.beginPath();c.arc(mx+h.x*sc,my+h.y*sc,Math.max(2.2,h.ri*sc*.5),0,6.283);c.fill();}
    for(const q of S.stars||[]){c.fillStyle=st.star;c.beginPath();c.arc(mx+q.x*sc,my+q.y*sc,Math.max(2.4,q.r*sc*1.2),0,6.283);c.fill();}
    c.fillStyle=st.ast;for(const q of S.asteroids)c.fillRect(mx+q.x*sc-1,my+q.y*sc-1,2,2);
    // mísseis: o que está MIRANDO em mim pisca e vem maior — é o mesmo alerta da seta e do bipe, no mapa
    for(const q of S.missiles||[]){const pisca=q.mira?(.45+.55*(.5+.5*Math.sin(t*.012))):.7;
      c.globalAlpha=pisca;c.fillStyle=st.missile||st.player;c.beginPath();c.arc(mx+q.x*sc,my+q.y*sc,q.mira?3.2:1.8,0,6.283);c.fill();}
    c.globalAlpha=1;
    // TODOS os inimigos vivos do mapa (vêm do placar, não da AOI); o ponto cresce com a massa, então dá para
    // ver de longe quem é ameaça — √mass·sc é o raio real no mundo, com um piso para o ponto não sumir
    for(const p of S.enemies){c.fillStyle=p.ally?((st.ally)||"#66e08a"):(p.isBot?st.bot:st.player);const rr=Math.max(2,Math.sqrt(p.mass||1)*sc);
      c.beginPath();c.arc(mx+p.x*sc,my+p.y*sc,rr,0,6.283);c.fill();}   // companheiro em cor própria: no Battle Royale em equipe, saber onde ele está é metade do jogo
    const cam=S.cam,hw=cam.W/(2*cam.scale)*sc,hh=cam.H/(2*cam.scale)*sc;c.strokeStyle=st.view;c.lineWidth=1;c.strokeRect(mx+cam.x*sc-hw,my+cam.y*sc-hh,hw*2,hh*2);
    const md=R0.meDot;c.fillStyle=md.fill;c.strokeStyle=md.stroke;c.lineWidth=md.width;
    for(const p of S.mine){c.beginPath();c.arc(mx+p.x*sc,my+p.y*sc,Math.max(md.r[m]||3,p.r*sc),0,6.283);c.fill();c.stroke();}
    c.restore();
    if(R0.label&&(!R0.label.desktopOnly||m==="desktop")){c.font=R0.label.font;c.fillStyle=R0.label.color;c.textAlign="center";c.textBaseline="middle";c.fillText(R0.label.text,cx,cy+R+R0.label.dy+14);}}
  return{canvas:cv,
    update(now,zone){if(now-last<100)return;last=now;draw(now,zone);},
    setTheme(t){th=t;layout();},
    show(on){cv.style.display=on?"":"none";},
    destroy(){cv.remove();}};}
