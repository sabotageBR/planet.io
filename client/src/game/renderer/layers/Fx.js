// ── EFEITOS: theme.effects.fx(kind,k,params) → primitivas {ring|star|text|line|burst} ──────
// Um Graphics por efeito ativo (limpo e redesenhado por frame) + pool de Text para as primitivas
// de texto (cache por texto/cor; escala = size/32). Máximo 32 efeitos ativos; em modo econômico
// só metade é desenhada. add(kind,f,delayMs): a idade começa negativa — efeitos de terceiros esperam
// o atraso de interpolação para casar com o sumiço da entidade. spark(x,y,r,color): faíscas leves
// (comida/pellet comido) num pool próprio (≤ SPARK_MAX) desenhado num único Graphics — não disputa os 32.
// ambient(kind,f): efeito contínuo pedido por frame (ímã) → theme.effects.ambient(kind,t,f), um Graphics só.
import {Container,Graphics,Text} from "pixi.js";
import {rectHas} from "@planet/shared";
import {colorOf} from "../../util.js";

const MAX=32,TTL={bounce:14,pop:22,boom:24,eat:16,suck:20,exit:20,split:16,merge:18,chip:12,shoot:16,rock:10,death:28,vanish:18,shieldBreak:22,shieldHit:14,shieldUp:24,clash:22,deflect:16,
  starBurst:22,supernova:45,countdown:52,starHit:13,starSplit:28,bigCrunch:70};
const SPARK_MAX=64,SPARK_TTL=10*16.7,TEXT_PRE=4,TS=32,pts=[];
export function createFx(R){
  const root=new Container(),active=[],gpool=[],tpool=[],sparks=[],ambient=[],sg=new Graphics(),ag=new Graphics();root.addChild(ag,sg);let budget=1;
  function textNode(i){let t=tpool[i];if(!t){t=new Text({text:"",style:{fontFamily:"sans-serif",fontSize:TS,fontWeight:"bold",fill:"#fff",stroke:{color:"#000",width:6,join:"round"}},resolution:1.5});t.anchor.set(.5);t._key="";root.addChild(t);tpool[i]=t;}return t;}
  function drawPrim(g,p){const al=p.alpha==null?1:p.alpha;
    switch(p.type){
      case "star":{const n=p.n*2,cs=Math.cos(p.rot||0),sn=Math.sin(p.rot||0);pts.length=0;
        for(let i=0;i<n;i++){const a=(i/n)*6.2832+(p.phase||0),rad=i%2?p.r*p.inner:p.r,x=Math.cos(a)*rad,y=Math.sin(a)*rad;pts.push(p.x+x*cs-y*sn,p.y+x*sn+y*cs);}
        g.poly(pts,true);if(p.fill){const c=colorOf(p.fill);g.fill({color:c.c,alpha:c.a*al});}if(p.stroke){const c=colorOf(p.stroke);g.stroke({width:p.width||2,color:c.c,alpha:c.a*al,join:"round"});}break;}
      case "ring":{const c=colorOf(p.color);
        if(p.dash){const on=p.dash[0],off=p.dash[1]||on,circ=6.2832*p.r;let s=0;while(s<circ){const a0=s/p.r,a1=Math.min(circ,s+on)/p.r;g.moveTo(p.x+Math.cos(a0)*p.r,p.y+Math.sin(a0)*p.r);g.arc(p.x,p.y,p.r,a0,a1);s+=on+off;}}
        else g.circle(p.x,p.y,p.r);g.stroke({width:p.width||2,color:c.c,alpha:c.a*al,cap:"round"});break;}
      case "line":{const c=colorOf(p.color);g.moveTo(p.x1,p.y1);g.lineTo(p.x2,p.y2);g.stroke({width:p.width||2,color:c.c,alpha:c.a*al,cap:"round"});break;}
      case "burst":{const c=colorOf(p.color);for(let k=0;k<p.n;k++){const an=k/p.n*6.2832+(p.phase||0);g.moveTo(p.x+Math.cos(an)*p.r0,p.y+Math.sin(an)*p.r0);g.lineTo(p.x+Math.cos(an)*p.r1,p.y+Math.sin(an)*p.r1);}
        g.stroke({width:p.width||2,color:c.c,alpha:c.a*al,cap:"round"});break;}}}
  return{root,
    /** Pré-cria os Text do pool (a rasterização da fonte sai do 1º "POW!" da partida). */
    setTheme(){for(let i=0;i<TEXT_PRE;i++)textNode(i).visible=false;},
    /** kind: bounce|pop|boom|eat|suck|exit|split|merge|chip|shoot|death|vanish|shieldBreak|shieldHit|shieldUp|clash|deflect|starBurst|starHit|starSplit|supernova|bigCrunch|countdown;
     *  f: {x,y,r,nx?,ny?,power?,level?,color?,n?,tx?,ty?,tr?} — tx/ty/tr = destino da absorção (quem comeu) */
    add(kind,f,delayMs=0){if(!R.prefs.fx)return;if(active.length>=MAX)active.shift();active.push({kind,f,age:-(delayMs||0),ttl:(TTL[kind]||16)*16.7});},
    spark(x,y,r,color){if(!R.prefs.fx)return;if(sparks.length>=SPARK_MAX)sparks.shift();sparks.push({x,y,r,color,age:0});},
    ambient(kind,f){if(R.prefs.fx)ambient.push({kind,f});},
    setBudget(b){budget=b;},
    render(fr){const th=R.theme,dt=fr.dt*1000,rect=fr.rect,font=th.hud.labels.font;let gi=0,ti=0;
      for(let i=active.length-1;i>=0;i--){const a=active[i];a.age+=dt;if(a.age>=a.ttl)active.splice(i,1);}
      const lim=budget<1?Math.ceil(active.length*budget):active.length;
      for(let i=0;i<lim;i++){const a=active[i],f=a.f;if(a.age<0||!rectHas(rect,f.x,f.y,f.r*3+40))continue;
        const prims=th.effects.fx(a.kind,a.age/a.ttl,f);if(!prims||!prims.length)continue;
        let g=gpool[gi];if(!g){g=new Graphics();root.addChildAt(g,0);gpool[gi]=g;}gi++;g.clear();g.visible=true;
        for(const p of prims){
          if(p.type!=="text"){drawPrim(g,p);continue;}
          const t=textNode(ti++),key=`${p.text}|${p.fill}|${p.stroke}|${p.font||font}`;
          if(t._key!==key){t._key=key;t.text=p.text;const st=t.style;st.fontFamily=p.font||font;st.fill=p.fill||"#fff";
            st.stroke={color:p.stroke===undefined||p.stroke===null?"rgba(0,0,0,.85)":p.stroke,width:Math.max(2,TS*.2),join:"round"};}
          t.visible=true;t.position.set(p.x,p.y);t.rotation=p.rot||0;t.scale.set(p.size/TS);t.alpha=p.alpha==null?1:p.alpha;}}
      for(let i=gi;i<gpool.length;i++)gpool[i].visible=false;for(let i=ti;i<tpool.length;i++)tpool[i].visible=false;
      // faíscas (4 traços radiais que voam e somem)
      sg.clear();const sc=th.effects.sparkColor||"#ffffff";
      for(let i=sparks.length-1;i>=0;i--){const s=sparks[i];s.age+=dt;if(s.age>=SPARK_TTL){sparks.splice(i,1);continue;}if(!rectHas(rect,s.x,s.y,s.r*4+10))continue;
        const k=s.age/SPARK_TTL,c=colorOf(s.color||sc),r0=s.r*(.8+k*2.2),r1=r0+s.r*(1.2-k);
        for(let j=0;j<4;j++){const an=j*1.5708+.6;sg.moveTo(s.x+Math.cos(an)*r0,s.y+Math.sin(an)*r0);sg.lineTo(s.x+Math.cos(an)*r1,s.y+Math.sin(an)*r1);}
        sg.stroke({width:Math.max(1.5,s.r*.25),color:c.c,alpha:c.a*(1-k),cap:"round"});}
      // ambiente (pedidos deste frame)
      ag.clear();if(th.effects.ambient)for(const a of ambient){if(!rectHas(rect,a.f.x,a.f.y,a.f.r*4))continue;const prims=th.effects.ambient(a.kind,fr.t,a.f);if(prims)for(const p of prims)if(p.type!=="text")drawPrim(ag,p);}
      ambient.length=0;},
    count(){return active.length+sparks.length;},
    destroy(){root.destroy({children:true});active.length=0;sparks.length=0;ambient.length=0;gpool.length=0;tpool.length=0;},
  };}
