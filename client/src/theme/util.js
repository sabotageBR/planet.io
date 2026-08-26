// ── util de desenho dos temas ─────────────────────────────────────────────────
// Cópia dos helpers de mockups/v2/src/engine2.js que as receitas de sprite usam
// (u.sh / u.rgba / u.spikes / u.astPoly / u.rr / u.mulberry / u.outText). As receitas
// em client/src/theme/<id>/index.js são portes literais dos mockups; mexer aqui
// muda o desenho dos três temas.

// clareia (a>0) ou escurece (a<0) um hex "#rrggbb" → "rgb(r,g,b)"
export function sh(hex,a){let n=parseInt(hex.slice(1),16),r=n>>16,g=n>>8&255,b=n&255;
  const f=x=>Math.max(0,Math.min(255,Math.round(a>0?x+(255-x)*a:x*(1+a))));return`rgb(${f(r)},${f(g)},${f(b)})`;}
// hex "#rrggbb" + alfa → "rgba(r,g,b,a)"
export function rgba(hex,a){const n=parseInt(hex.slice(1),16);return`rgba(${n>>16},${n>>8&255},${n&255},${a})`;}
// gerador determinístico (mesmo do engine e de shared/src/rng.js)
export function mulberry(seed){return function(){seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
// retângulo arredondado (só o path)
export function rr(ctx,x,y,w,h,r){ctx.beginPath();ctx.moveTo(x+r,y);ctx.arcTo(x+w,y,x+w,y+h,r);ctx.arcTo(x+w,y+h,x,y+h,r);ctx.arcTo(x,y+h,x,y,r);ctx.arcTo(x,y,x+w,y,r);ctx.closePath();}
// polígono espinhoso (estrelas, POW!)
export function spikes(c,r,n,inner,phase){c.beginPath();
  for(let i=0;i<n*2;i++){const a=(i/(n*2))*6.2832+(phase||0),rad=i%2?r*inner:r;
    i?c.lineTo(Math.cos(a)*rad,Math.sin(a)*rad):c.moveTo(Math.cos(a)*rad,Math.sin(a)*rad);}
  c.closePath();}
// polígono irregular de asteroide (forma determinística por seed; cache)
const _ast=new Map();
export function astShape(seed,n){const k=seed+":"+(n||9);let s=_ast.get(k);if(s)return s;
  const r=mulberry(Math.floor(seed*1e6)+1);n=n||9;s=[];for(let i=0;i<n;i++)s.push(.72+r()*.36);_ast.set(k,s);return s;}
export function astPoly(c,r,seed,n){const s=astShape(seed,n);c.beginPath();
  for(let i=0;i<s.length;i++){const a=i/s.length*6.2832,rad=r*s[i];
    i?c.lineTo(Math.cos(a)*rad,Math.sin(a)*rad):c.moveTo(Math.cos(a)*rad,Math.sin(a)*rad);}
  c.closePath();}
// texto com contorno (rótulos, POW!)
export function outText(c,txt,x,y,size,fill,stroke,w){
  c.font=`bold ${size}px ${w||'Arial,Helvetica,sans-serif'}`;c.textAlign="center";c.textBaseline="middle";
  if(stroke!==null){c.strokeStyle=stroke||"rgba(0,0,0,.85)";c.lineWidth=Math.max(2,size*.2);c.lineJoin="round";c.strokeText(txt,x,y);}
  c.fillStyle=fill||"#fff";c.fillText(txt,x,y);}
// faixa de tamanho do sprite (128/256/512) por raio em pixels de mundo
export const tier=r=>r<=44?128:r<=120?256:512;

// tipos de comida: o mockup usa strings; shared/src/constants.js FOOD_TYPE usa índices. Aceita os dois.
const FOOD_NAMES=["dust","comet","star","rock","missile_ammo","powerup_speed","powerup_magnet","powerup_shield"];
export const foodType=t=>typeof t==="number"?(FOOD_NAMES[t]||"dust"):(t||"dust");
export const FOOD_ICON={missile_ammo:"🚀",powerup_speed:"⚡",powerup_magnet:"🧲",powerup_shield:"🛡️"};
export const FOOD_FIXED={powerup_speed:"#ffdd00",powerup_magnet:"#ff66ff",powerup_shield:"#44aaff",missile_ammo:"#ff6600"};   // cores dos especiais (engine2 mkFood)

// desenha as primitivas de effects.fx() num contexto 2D (referência; o Pixi faz o equivalente)
export function drawPrims(c,prims){
  for(const p of prims){c.save();c.globalAlpha=p.alpha==null?1:p.alpha;c.lineJoin="round";c.lineCap="round";
    switch(p.type){
      case "star":c.translate(p.x,p.y);c.rotate(p.rot||0);spikes(c,p.r,p.n,p.inner,p.phase||0);
        if(p.fill){c.fillStyle=p.fill;c.fill();}if(p.stroke){c.strokeStyle=p.stroke;c.lineWidth=p.width||2;c.stroke();}break;
      case "text":c.translate(p.x,p.y);c.rotate(p.rot||0);outText(c,p.text,0,0,p.size,p.fill,p.stroke===undefined?null:p.stroke,p.font);break;
      case "ring":c.strokeStyle=p.color;c.lineWidth=p.width||2;if(p.dash)c.setLineDash(p.dash);c.beginPath();c.arc(p.x,p.y,p.r,0,6.283);c.stroke();break;
      case "line":c.strokeStyle=p.color;c.lineWidth=p.width||2;c.beginPath();c.moveTo(p.x1,p.y1);c.lineTo(p.x2,p.y2);c.stroke();break;
      case "burst":c.strokeStyle=p.color;c.lineWidth=p.width||2;for(let i=0;i<p.n;i++){const an=i/p.n*6.283+(p.phase||0);c.beginPath();
        c.moveTo(p.x+Math.cos(an)*p.r0,p.y+Math.sin(an)*p.r0);c.lineTo(p.x+Math.cos(an)*p.r1,p.y+Math.sin(an)*p.r1);c.stroke();}break;}
    c.restore();}}
