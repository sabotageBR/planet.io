// ── PLANETAS: pool {corpo (sprite por tier), Graphics (arco de merge + anéis de powerup),
//    BitmapText nome/massa}; ordenados por raio (zIndex). Trilhas: um Graphics só, polilinha
//    tracejada (theme.hud.trail). Fontes bitmap instaladas por tema (nome/massa) com charset pt-BR.
//    Anéis: pelas flags de CADA peça (SHIELD + nível em 2 bits, MAGNET) — powerup é por peça, então duas partes do
//    mesmo planeta podem estar diferentes. Escudo usa theme.hud.cell.powerups.shieldLevels[nível−1]; ímã pede R.ambient("magnet").
//    pop(id,delay): "gulp" de quem acabou de engolir alguém — o corpo incha e achata por POP_MS (a absorção do EAT).
import {Container,Sprite,Graphics,BitmapText,BitmapFont,Cache} from "pixi.js";
import {PIECE_FLAG,mergeTicks,rectHas} from "@planet/shared";
import {colorOf,fmt,dashPolyline} from "../../util.js";

const FS=48,CHARS=[[" ","~"],["¡","ÿ"],["Ā","ž"],"✓◆✦•–—…"],TRAIL_MAX=12,TRAIL_MIN_V=72,POP_MS=280,POP_AMP=.22;
export function createPlanets(R){
  const root=new Container();root.sortableChildren=true;const trails=new Graphics();
  const views=new Map(),trailMap=new Map(),seg=[],counts=new Map(),pops=new Map();let frame=0,fontName="",fontMass="",lastTrailTick=-1;
  function setTheme(){const th=R.theme,L=th.hud.labels;fontName=`pn-${th.id}`;fontMass=`pm-${th.id}`;
    const sw=L.strokeWidth(FS);
    // fontes ficam instaladas por tema (nome inclui o id): desinstalar quebra BitmapTexts de outra instância (StrictMode)
    for(const [name,fill] of [[fontName,L.nameColor],[fontMass,L.massColor]]){if(Cache.has(name+"-bitmap"))continue;
      BitmapFont.install({name,style:{fontFamily:L.font,fontSize:FS,fontWeight:"bold",fill,stroke:{color:L.stroke,width:sw,join:"round"}},chars:CHARS,resolution:1,padding:Math.ceil(sw)+2});}
    for(const v of views.values()){v.name.style.fontFamily=fontName;v.mass.style.fontFamily=fontMass;}}
  function mkView(){const c=new Container(),body=new Sprite();body.anchor.set(.5);const gfx=new Graphics();
    const name=new BitmapText({text:"",style:{fontFamily:fontName,fontSize:FS}}),mass=new BitmapText({text:"",style:{fontFamily:fontMass,fontSize:FS}});name.anchor.set(.5);mass.anchor.set(.5);
    c.addChild(body,gfx,name,mass);root.addChild(c);return{c,body,gfx,name,mass,lastName:null,lastMassN:-1,f:0};}
  return{root,trails,setTheme,
    /** Marca o "engoliu!" da peça `id` (começa daqui a `delay` ms, o mesmo atraso do efeito de terceiros). */
    pop(id,delay=0){pops.set(id,performance.now()+(delay||0));},
    render(f){frame++;const th=R.theme,TX=th.textures,L=th.hud.labels,cell=th.hud.cell,view=f.view,rect=f.rect,rt=f.rt,t=f.t;
      const showNames=f.showNames,showMass=f.showMass,PK=TX.scale.planet;
      counts.clear();for(const e of view.pieces)counts.set(e.owner,(counts.get(e.owner)||0)+1);
      const trailTick=Math.floor(rt/2),trailStep=trailTick!==lastTrailTick;lastTrailTick=trailTick;
      let idx=0;
      for(const e of view.pieces){const isMe=!!e.isMe,pl=view.playerOf(e.owner),skin=pl?pl.skin:null;if(!skin)continue;
        // trilha (antes do culling: rastro continua fora da tela)
        let tr=trailMap.get(e.id);if(!tr){tr={pts:[],f:0,skin,isMe,r:e.rr,x:e.rx,y:e.ry};trailMap.set(e.id,tr);}tr.f=frame;tr.r=e.rr;tr.x=e.rx;tr.y=e.ry;tr.skin=skin;tr.isMe=isMe;
        if(trailStep){const sp=Math.hypot(e.vx||0,e.vy||0);if(sp>TRAIL_MIN_V)tr.pts.push({x:e.rx,y:e.ry});else if(tr.pts.length)tr.pts.shift();if(tr.pts.length>TRAIL_MAX)tr.pts.shift();}
        let v=views.get(e.id);if(!v){v=mkView();views.set(e.id,v);}v.f=frame;
        if(!rectHas(rect,e.rx,e.ry,e.rr*2.4)){v.c.visible=false;continue;}v.c.visible=true;v.c.zIndex=idx++;v.c.position.set(e.rx,e.ry);v.c.alpha=e.alpha;
        const size=TX.tier(e.rr);v.body.texture=R.cache.get(TX.key("planet",{skin,isMe},size),size,(c,s)=>TX.planet(c,s,{skin,isMe}));
        const d=e.rr*PK(skin);let sx=1,sy=1;const pat=pops.get(e.id);   // gulp da absorção: incha e achata de leve
        if(pat!=null){const age=t-pat;if(age>POP_MS)pops.delete(e.id);else if(age>=0){const u=Math.sin(age/POP_MS*Math.PI);sx=1+POP_AMP*u;sy=1-POP_AMP*.35*u;}}
        v.body.width=d*2*sx;v.body.height=d*2*sy;
        // rótulos
        const lab=e.rr>L.minR&&(showNames||showMass);v.name.visible=lab&&showNames;v.mass.visible=lab&&showMass;
        if(lab){const fs=L.size(e.rr);const nm=pl.name+(pl.registered?" ✓":"");if(v.lastName!==nm){v.lastName=nm;v.name.text=nm;}
          v.name.scale.set(fs/FS);v.name.y=L.nameY(fs);const mn=Math.round(e.rr*e.rr);if(v.lastMassN!==mn){v.lastMassN=mn;v.mass.text=fmt(mn);}v.mass.scale.set(fs*L.massK/FS);v.mass.y=L.massY(fs);}
        // arco de merge + anéis de powerup
        const g=v.gfx;g.clear();let drew=false;const n=counts.get(e.owner)||1;
        if(n>1&&!(e.flags&PIECE_FLAG.MERGING)){const t0=e.firstTick!=null?e.firstTick:e.createdTick,prog=t0!=null?Math.min(1,Math.max(0,(rt-t0)/mergeTicks(e.rr))):1;
          if(prog<1){const m=cell.merge,col=colorOf(m.color);g.arc(0,0,e.rr*m.radiusK,-1.5708,-1.5708+prog*6.2832);g.stroke({width:m.width(e.rr),color:col.c,alpha:col.a,cap:"round"});drew=true;}}
        const fl=e.flags,pws=[];if(fl&PIECE_FLAG.MAGNET)pws.push("magnet");if(fl&PIECE_FLAG.SHIELD)pws.push("shield");const lv=(fl>>PIECE_FLAG.SHIELD_LV_SHIFT)&3;
        if(pws.length){const pw=cell.powerups,LV=pw.shieldLevels;pws.forEach((k,i)=>{
          const sl=k==="shield"&&LV?LV[Math.min(LV.length,Math.max(1,lv))-1]:null;
          const col=colorOf(sl?sl.color:pw.colors[k]),a0=t*pw.spin*(i%2?-1:1),rr=e.rr*pw.radiusK(i),al0=sl?sl.alpha:pw.alpha;
          const al=al0[0]+(al0[1]-al0[0])*(.5+.5*Math.sin(t*(sl?sl.pulse:pw.pulse)+i)),wd=pw.width(e.rr)*(sl?sl.widthK:1);
          dashArc(g,rr,a0,pw.dash(e.rr));g.stroke({width:wd,color:col.c,alpha:col.a*al,cap:"round"});
          if(sl&&sl.rings>1){dashArc(g,rr*1.12,-a0*1.3,pw.dash(e.rr));g.stroke({width:wd*.6,color:col.c,alpha:col.a*al*.7,cap:"round"});}   // nível 3: 2º anel
          if(k==="magnet"&&R.ambient)R.ambient("magnet",{x:e.rx,y:e.ry,r:e.rr});});drew=true;}
        g.visible=drew;}
      for(const [id,v] of views)if(v.f!==frame){v.c.destroy({children:true});views.delete(id);pops.delete(id);}
      // trilhas
      trails.clear();const TR=th.hud.trail;
      for(const [id,tr] of trailMap){if(tr.f!==frame){trailMap.delete(id);continue;}if(tr.pts.length<2||!f.showTrails)continue;
        if(!rectHas(rect,tr.x,tr.y,600))continue;const col=colorOf(TR.color(tr.skin,tr.isMe)),w=TR.width(tr.r);
        const pts=tr.pts.concat([{x:tr.x,y:tr.y}]);
        if(TR.style==="dashed"&&TR.dash){dashPolyline(pts,TR.dash(tr.r),seg);for(let i=0;i<seg.length;i+=4){trails.moveTo(seg[i],seg[i+1]);trails.lineTo(seg[i+2],seg[i+3]);}}
        else{trails.moveTo(pts[0].x,pts[0].y);for(let i=1;i<pts.length;i++)trails.lineTo(pts[i].x,pts[i].y);}
        trails.stroke({width:w,color:col.c,alpha:col.a,cap:"round",join:"round"});}},
    count(){return views.size;},
    destroy(){root.destroy({children:true});trails.destroy();views.clear();trailMap.clear();pops.clear();},
  };}
function dashArc(g,r,a0,dash){const on=dash[0],off=dash[1],circ=6.2832*r;let a=0;
  while(a<circ){const s=a0+a/r,e=a0+Math.min(circ,a+on)/r;g.moveTo(Math.cos(s)*r,Math.sin(s)*r);g.arc(0,0,r,s,e);a+=on+off;}}
