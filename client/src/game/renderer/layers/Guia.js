// ── O GUIA NO MUNDO: o gesto desenhado ONDE ele tem de ser feito ──────────────
// A instrução do tutorial saiu da faixa de texto (28/09/2026, recusa do Web Fit Test da Poki: "onboarding
// needs to be visual instead of textual explanations") e virou isto: o gesto desenhado no lugar em que ele
// acontece. Quem DECIDE qual gesto e onde é `game/guia.js` (puro, testado); esta camada só desenha `f.guia`:
//   toque — ondas saindo da estrela e a mão (dedo) ou o cursor (mouse) tocando nela;
//   ir    — setas andando da borda do planeta até o caco mais perto, e o gesto deslizando por elas;
//   salto — o arco tracejado do planeta até a presa, com a ponta de seta e a presa pulsando;
//   presa — na PARTIDA, a presa mais perto FORA da tela: uma seta na borda apontando para ela.
//
// ⚠️ TAMANHO CONSTANTE EM TELA: a camada vive no container do mundo (que leva `world.scale.set(cam.scale)`),
// então toda medida em px de tela é multiplicada por `s = 1/cam.scale` — a conta da seta de rumo
// (`Heading.js`) e da seta de ameaça (`Threat.js`). As posições são de MUNDO.
// ⚠️ Vetorial e redesenhado por frame, como `Threat.js`: a forma MUDA (o arco estica, as setas andam), e não
// há textura a assar nem chave no TextureCache. São poucas primitivas — o custo é o de uma mira.
// ⚠️ Cores FIXAS e não do tema: o guia tem de ler igual nos três céus, e quem o separa do fundo é a TINTA
// escura por baixo de cada traço claro (o mesmo par da borda dos planetas). Nada disto depende de
// `reduceMotion` para existir: é INFORMAÇÃO — sem animação ele continua desenhado, só parado no meio do ciclo.
import {Graphics} from "pixi.js";

const TINTA=0x141026,LUZ=0xffffff,OURO=0xffc22e,VERDE=0x3ddc5f;
const CICLO=1.1;   // s de um "toque": a mão aperta, a onda sai
/** O cursor clássico, com a PONTA em (0,0): o desenho que todo mundo reconhece como "o mouse clica aqui". */
const SETA=[0,0, 0,26, 7,20, 12,30, 17,28, 12,18, 21,18];

export function createGuia(R){
  const g=new Graphics();g.label="guia";   // nomeado: é assim que a sonda (e o devtools do Pixi) o acham
  return{root:g,setTheme(){},
    /** f.guia = o retorno de `guiaDoTutor` (+ `dedo`), ou o guia da presa; `null` = nada. */
    render(f){const q=f.guia,cam=f.cam;g.clear();
      if(!q||!cam||!cam.scale){g.visible=false;return;}
      g.visible=true;
      const s=1/cam.scale,t=f.reduz?CICLO*.4:(f.t||0)/1000;   // sem movimento: parado num quadro que já lê
      if(q.tipo==="toque")toque(g,q,s,t);
      else if(q.tipo==="ir")ir(g,q,s,t);
      else if(q.tipo==="salto")salto(g,q,s,t);
      else if(q.tipo==="presa")presa(g,q,s,t,cam);},
    destroy(){g.destroy();},
  };}

// ── as duas figuras do gesto ──
/** O DEDO: uma bolinha com contorno — o jeito universal de dizer "toque aqui". */
function figDedo(g,x,y,s,k,al){g.circle(x,y,12*s*k).fill({color:LUZ,alpha:.96*al}).stroke({width:3*s,color:TINTA,alpha:.9*al});}
/** O CURSOR, com a ponta em (x,y). */
function figCursor(g,x,y,s,k,al){const p=[];for(let i=0;i<SETA.length;i+=2)p.push(x+SETA[i]*s*k,y+SETA[i+1]*s*k);
  g.poly(p,true).fill({color:LUZ,alpha:.97*al}).stroke({width:2.5*s,color:TINTA,alpha:.95*al,join:"round"});}
const figura=(g,q,x,y,s,k=1,al=1)=>{if(q.dedo)figDedo(g,x,y,s,k,al);else figCursor(g,x,y,s,k,al);};
/** Um traço com a tinta por baixo: é o que o faz ler em qualquer céu. */
function traco(g,desenha,w,cor,al){desenha();g.stroke({width:w+3,color:TINTA,alpha:.4*al,cap:"round",join:"round"});
  desenha();g.stroke({width:w,color:cor,alpha:al,cap:"round",join:"round"});}
/** Um anel pulsando em volta de um corpo. */
function anel(g,x,y,r,s,t,cor){const rr=r+9*s+3*s*Math.sin(t*6);
  g.circle(x,y,rr).stroke({width:6*s,color:TINTA,alpha:.35});g.circle(x,y,rr).stroke({width:3*s,color:cor,alpha:.95});}

// ── TOQUE: a estrela esperando o toque que a detona ──
function toque(g,q,s,t){
  // duas ondas defasadas saindo da estrela
  for(const o of [0,.5]){const f=((t/CICLO+o)%1+1)%1,rr=q.r+(10+50*f)*s;
    g.circle(q.x,q.y,rr).stroke({width:(4.5-2.5*f)*s,color:OURO,alpha:.9*(1-f)});}
  // a mão/o cursor: APERTA no começo do ciclo (desce e encolhe) e se afasta um pouco no resto
  const f=((t/CICLO)%1+1)%1,aperto=f<.2?1-f/.2:0,folga=(1-aperto)*12*s;
  figura(g,q,q.x+q.r*.25+folga,q.y+q.r*.25+folga,s,1-.14*aperto);}

// ── IR: da borda do planeta até o caco mais perto ──
function ir(g,q,s,t){
  const dx=q.x-q.x0,dy=q.y-q.y0,d=Math.hypot(dx,dy)||1,ux=dx/d,uy=dy/d,px=-uy,py=ux;
  anel(g,q.x,q.y,q.r,s,t,OURO);
  const a=q.r0+16*s,b=d-(q.r+14*s);if(b-a<24*s)return;   // já está em cima: só o anel
  // as setas andando: uma a cada `passo`, deslizando do planeta para o caco, e apagando nas pontas
  const passo=32*s,off=(t*80*s)%passo,h=9*s;
  for(let u=a+off;u<b;u+=passo){const al=Math.max(0,Math.min(1,(u-a)/passo,(b-u)/passo));
    const x=q.x0+ux*u,y=q.y0+uy*u;
    traco(g,()=>{g.moveTo(x-ux*h+px*h,y-uy*h+py*h);g.lineTo(x,y);g.lineTo(x-ux*h-px*h,y-uy*h-py*h);},4*s,OURO,al);}
  // o GESTO deslizando por cima delas, a cada 1,5 s — é ele que diz "leve até ali"
  const f=((t/1.5)%1+1)%1,u=a+(b-a)*Math.min(1,f*1.2),al=f<.12?f/.12:f>.8?Math.max(0,(1-f)/.2):1;
  figura(g,q,q.x0+ux*u,q.y0+uy*u,s,1,al);}

// ── SALTO: o arco tracejado do planeta até a presa ──
function bez(ax,ay,cx,cy,bx,by,k){const m=1-k;return[m*m*ax+2*m*k*cx+k*k*bx,m*m*ay+2*m*k*cy+k*k*by];}
function salto(g,q,s,t){
  const dx=q.x-q.x0,dy=q.y-q.y0,d=Math.hypot(dx,dy)||1,ux=dx/d,uy=dy/d,px=-uy,py=ux;
  anel(g,q.x,q.y,q.r,s,t,OURO);
  const ax=q.x0+ux*(q.r0+8*s),ay=q.y0+uy*(q.r0+8*s),bx=q.x-ux*(q.r+14*s),by=q.y-uy*(q.r+14*s);
  const L=Math.hypot(bx-ax,by-ay);if(L<30*s)return;
  // o arco sobe para um lado (é um SALTO, não uma reta), com o traço andando na direção da presa
  const cx=(ax+bx)/2+px*L*.3,cy=(ay+by)/2+py*L*.3,N=Math.max(8,Math.min(26,Math.round(L/(22*s)))),off=((t*1.3)%1+1)%1;
  traco(g,()=>{for(let i=-1;i<N;i++){const k0=(i+off)/N,k1=(i+off+.55)/N;if(k1<=0||k0>=1)continue;
      const p0=bez(ax,ay,cx,cy,bx,by,Math.max(0,k0)),p1=bez(ax,ay,cx,cy,bx,by,Math.min(1,k1));
      g.moveTo(p0[0],p0[1]);g.lineTo(p1[0],p1[1]);}},4*s,OURO,.95);
  // a ponta de seta, na direção da tangente no fim do arco
  const tx=bx-cx,ty=by-cy,tn=Math.hypot(tx,ty)||1,vx=tx/tn,vy=ty/tn,h=12*s;
  traco(g,()=>{g.moveTo(bx-vx*h-vy*h*.8,by-vy*h+vx*h*.8);g.lineTo(bx,by);g.lineTo(bx-vx*h+vy*h*.8,by-vy*h-vx*h*.8);},4.5*s,OURO,.95);}

// ── PRESA (na partida): uma seta na borda da tela apontando para ela ──
// ⚠️ NA TELA, NADA: ali quem a marca é o anel verde do novato (`Planets.js`, na PEÇA de verdade). Um segundo
// anel aqui, desenhado na posição do placar (2 Hz, interpolada), ficava ao LADO da peça — um aro vazio.
function presa(g,q,s,t,cam){
  const hw=cam.W/(2*cam.scale),hh=cam.H/(2*cam.scale),m=46*s;
  const dx=q.x-cam.x,dy=q.y-cam.y;
  if(Math.abs(dx)<hw-m*.5&&Math.abs(dy)<hh-m*.5)return;
  // fora da tela: onde a direção fura a janela (o menor avanço que bate numa das bordas) — a conta do `Threat.js`
  const d=Math.hypot(dx,dy)||1,nx=dx/d,ny=dy/d,ax=Math.abs(nx),ay=Math.abs(ny);
  const k=Math.min(ax>1e-4?(hw-m)/ax:Infinity,ay>1e-4?(hh-m)/ay:Infinity);if(!Number.isFinite(k)||k<=0)return;
  const x=cam.x+nx*k,y=cam.y+ny*k,h=(14+3*Math.sin(t*5))*s,px=-ny,py=nx;
  // a seta aponta PARA a presa (o contrário da de ameaça, que aponta de onde vem o tiro)
  traco(g,()=>{g.moveTo(x-nx*h+px*h,y-ny*h+py*h);g.lineTo(x+nx*h*.6,y+ny*h*.6);g.lineTo(x-nx*h-px*h,y-ny*h-py*h);},5*s,VERDE,.95);}
