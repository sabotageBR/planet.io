// ── RADAR: canvas 2D pequeno (#radar dentro de #hud), 10 Hz, desenhado por theme.hud.radar ──
// Os inimigos vêm do PLACAR (todos os vivos, com posição, a 2 Hz) e não da AOI: o radar mostra o mapa inteiro.
// Perigos e peças próprias continuam vindo da cena, que é o que o cliente enxerga de verdade.
// Posicionado por estilo inline conforme radar.position/size do modo atual (não há CSS de #radar) — por
// isso MOVER o radar é editar `hud.radar.position.corner` nos três theme/<id>/index.js (que NÃO são
// gerados pelo port.js), e não escrever CSS: estilo inline vence qualquer folha.
import {WORLD} from "@warspace/shared";
// A LEGENDA e o número do radar são texto de UI: a fonte e a cor continuam vindo do tema, mas a palavra
// "RADAR" e o separador de milhar seguem o idioma do jogador.
import {getLabels} from "../../i18n/index.js";
import {fmt} from "../../ui/format.js";
import {bodyMode} from "../util.js";

export function createMinimap({hud,theme,getScene,onPick}){
  const cv=document.createElement("canvas");cv.id="radar";cv.style.cssText="position:absolute;z-index:5;pointer-events:none";
  const ctx=cv.getContext("2d");let last=0,mode="",D=0,dpr=1,th=theme(),vista="",mapa=null,alvo=-1;
  const big=()=>vista!=="";const live=()=>vista==="live";
  if(hud)hud.appendChild(cv);
  // ── MAPA GRANDE (só para quem morreu) ──
  // É o MESMO radar, ampliado e centralizado: ele já desenha o mapa inteiro, porque os inimigos vêm do
  // PLACAR (todos os vivos, a 2 Hz) e não da AOI. Afastar a câmera não serviria — a AOI do servidor tem teto
  // (VIEW_MIN/VIEW_MAX em net/Session.js), então fora da janela de quem se assiste não chega entidade nenhuma.
  // Ampliar o que já existe também mantém a pintura do tema: nenhuma arte nova, nenhum tema tocado.
  // "map" = mostrador ampliado (o radar de sempre, maior). "live" = a VISÃO DA SALA: ocupa o espaço todo,
  // sem o teto de 720, porque ali o objetivo é ver os planetas e ler os nomes, não consultar um instrumento.
  function bigD(){const w=hud?hud.clientWidth:innerWidth,h=hud?hud.clientHeight:innerHeight;
    return live()?Math.max(240,Math.min(w,h)*.96):Math.max(180,Math.min(Math.min(w,h)*.8,720));}
  function layout(){const R0=th.hud.radar,m=bodyMode();mode=m;D=big()?bigD():(R0.size[m]||R0.size.desktop);dpr=Math.min(2,devicePixelRatio||1);
    // no tamanho grande o rótulo "RADAR" sai: ele é assinatura de um mostrador de canto, e no mapa aberto
    // cairia fora do canvas (o `dy` do tema conta com um diâmetro de 150 px, não de 700)
    const pad=R0.shadow?Math.max(R0.shadow.dx,R0.shadow.dy)+2:2,lab=!big()&&R0.label&&(!R0.label.desktopOnly||m==="desktop")?16:0,w=D+pad+2,h=D+pad+lab+2;
    cv.width=Math.round(w*dpr);cv.height=Math.round(h*dpr);cv.style.width=w+"px";cv.style.height=h+"px";
    if(big()){   // centralizado no #hud, que em `rail` já é a área da câmera: o mapa não nasce atrás da gaveta
      cv.style.left="50%";cv.style.top="50%";cv.style.right="auto";cv.style.bottom="auto";
      cv.style.transform="translate(-50%,-50%)";cv.style.pointerEvents="auto";cv.style.cursor="pointer";}
    else{
      const P=R0.position||{corner:"top-right",margin:12},mg=P.margin==null?12:P.margin,c=P.corner||"top-right";
      cv.style.top=c.startsWith("top")?mg+"px":"auto";cv.style.bottom=c.startsWith("bottom")?mg+"px":"auto";
      cv.style.right=c.endsWith("right")?mg+"px":"auto";cv.style.left=c.endsWith("left")?mg+"px":"auto";
      cv.style.transform="none";cv.style.pointerEvents="none";cv.style.cursor="";}
    // Publica a altura MEDIDA para o CSS: o chat fica logo abaixo do radar, e o tamanho dele muda por tema
    // e por data-mode. Repetir 150/120/92/84 no ui.css sairia do ar na primeira mudança de tema.
    // (Seguro porque Hud.jsx renderiza #hud sem prop `style`: o React não gerencia esse atributo e não o
    // reverte no próximo render.)
    if(hud&&hud.style)hud.style.setProperty("--radar-h",h+"px");}
  layout();
  function draw(now,zone){const R0=th.hud.radar,m=bodyMode();if(m!==mode)layout();const S=getScene();if(!S)return;
    const c=ctx,R=D/2,cx=R+1,cy=R+1,t=now;c.setTransform(dpr,0,0,dpr,0,0);c.clearRect(0,0,cv.width,cv.height);c.lineJoin="round";
    if(R0.shadow){c.fillStyle=R0.shadow.color;c.beginPath();c.arc(cx+R0.shadow.dx,cy+R0.shadow.dy,R,0,6.283);c.fill();}
    c.fillStyle=R0.face;c.beginPath();c.arc(cx,cy,R,0,6.283);c.fill();c.strokeStyle=R0.border.color;c.lineWidth=R0.border.width;c.stroke();
    if(R0.rings){c.strokeStyle=R0.rings.color;c.lineWidth=R0.rings.width;R0.rings.at.forEach(k=>{c.beginPath();c.arc(cx,cy,R*k,0,6.283);c.stroke();});
      if(R0.rings.crosshair){c.beginPath();c.moveTo(cx-R,cy);c.lineTo(cx+R,cy);c.moveTo(cx,cy-R);c.lineTo(cx,cy+R);c.stroke();}}
    if(R0.sweep){const a=t*R0.sweep.speed;c.fillStyle=R0.sweep.fill;c.beginPath();c.moveTo(cx,cy);c.arc(cx,cy,R-2,a-R0.sweep.span,a);c.closePath();c.fill();
      c.strokeStyle=R0.sweep.line;c.lineWidth=R0.sweep.width;c.beginPath();c.moveTo(cx,cy);c.lineTo(cx+Math.cos(a)*(R-2),cy+Math.sin(a)*(R-2));c.stroke();}
    const SZ=D*(R0.mapK||.72),mx=cx-SZ/2,my=cy-SZ/2,sc=SZ/WORLD.w,st=R0.colors;mapa={mx,my,sc};c.save();c.beginPath();c.arc(cx,cy,R-2,0,6.283);c.clip();
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
    for(const p of S.enemies){
      // Na vista AO VIVO o blip é o PLANETA: a cor vem da skin dele, com o aro de tinta que o mundo usa. É a
      // diferença entre "consultar um instrumento" e "ver a sala" — e não custa um byte novo de rede, porque
      // a skin já veio no PLAYERS e a posição já vem no placar.
      c.fillStyle=p.ally?((st.ally)||"#66e08a"):(live()&&p.skin?p.skin.color:(p.isBot?st.bot:st.player));
      const rr=Math.max(live()?4:big()?3:2,Math.sqrt(p.mass||1)*sc);
      c.beginPath();c.arc(mx+p.x*sc,my+p.y*sc,rr,0,6.283);c.fill();
      if(live()&&rr>5){c.strokeStyle=st.view||"#fff";c.lineWidth=1.2;c.globalAlpha=.5;c.stroke();c.globalAlpha=1;}}   // companheiro em cor própria: no Battle Royale em equipe, saber onde ele está é metade do jogo
    // no mapa grande cabe o NOME (é o que transforma um ponto numa pessoa a quem assistir) e o anel de quem
    // está sendo assistido agora — o clique nesse mesmo ponto troca a câmera
    if(big()){c.font=(live()?"700 13px ":"600 11px ")+"system-ui,sans-serif";c.textAlign="center";c.textBaseline="bottom";
      for(const p of S.enemies){const px=mx+p.x*sc,py=my+p.y*sc,rr=Math.max(3,Math.sqrt(p.mass||1)*sc);
        if(p.slot===alvo){c.strokeStyle=(st.view)||"#fff";c.lineWidth=2;c.beginPath();c.arc(px,py,rr+4,0,6.283);c.stroke();}
        if(p.name){c.lineWidth=3;c.strokeStyle="rgba(0,0,0,.6)";c.strokeText(p.name,px,py-rr-3);
          c.fillStyle=(st.view)||"#fff";c.fillText(p.name,px,py-rr-3);
          if(live()){c.font="600 11px system-ui,sans-serif";c.fillStyle=st.player||"#9ad";
            c.fillText(fmt(p.mass||0),px,py+rr+13);c.font="700 13px system-ui,sans-serif";}}}}
    const cam=S.cam,hw=cam.W/(2*cam.scale)*sc,hh=cam.H/(2*cam.scale)*sc;c.strokeStyle=st.view;c.lineWidth=1;c.strokeRect(mx+cam.x*sc-hw,my+cam.y*sc-hh,hw*2,hh*2);
    const md=R0.meDot;c.fillStyle=md.fill;c.strokeStyle=md.stroke;c.lineWidth=md.width;
    for(const p of S.mine){c.beginPath();c.arc(mx+p.x*sc,my+p.y*sc,Math.max(md.r[m]||3,p.r*sc),0,6.283);c.fill();c.stroke();}
    c.restore();
    if(!big()&&R0.label&&(!R0.label.desktopOnly||m==="desktop")){c.font=R0.label.font;c.fillStyle=R0.label.color;c.textAlign="center";c.textBaseline="middle";c.fillText(getLabels().radar||R0.label.text,cx,cy+R+R0.label.dy+14);}}
  /** Clique no mapa grande → o jogador mais próximo do ponto (o mesmo blip que se vê), em coordenadas de mundo. */
  function pick(e){
    if(!big()||!mapa||!onPick)return;
    const S=getScene();if(!S)return;
    const r=cv.getBoundingClientRect(),x=(e.clientX-r.left-mapa.mx)/mapa.sc,y=(e.clientY-r.top-mapa.my)/mapa.sc;
    const tol=24/mapa.sc;let bd=Infinity,b=-1;   // 24 px de tolerância na TELA, convertidos para o mundo
    for(const p of S.enemies){if(p.slot==null)continue;
      const d=Math.hypot(p.x-x,p.y-y)-Math.sqrt(p.mass||1);if(d<bd){bd=d;b=p.slot;}}
    if(b>=0&&bd<=tol)onPick(b);}
  cv.addEventListener("click",pick);
  return{canvas:cv,
    update(now,zone){if(now-last<100)return;last=now;draw(now,zone);},
    setTheme(t){th=t;layout();},
    show(on){cv.style.display=on?"":"none";},
    /**
     * Vista do radar: "" (mostrador de canto) · "map" (ampliado) · "live" (a sala em tempo real).
     * `slot` é quem está sendo assistido — ganha o anel e é o alvo do clique.
     */
    setView(v,slot){const nova=v===true?"map":(v||"");const mudou=nova!==vista;vista=nova;alvo=slot==null?-1:slot;if(mudou)layout();},
    get big(){return big();},
    get view(){return vista;},
    destroy(){cv.removeEventListener("click",pick);cv.remove();}};}
