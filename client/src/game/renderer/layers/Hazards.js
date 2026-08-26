// ── PERIGOS: asteroides (sprite por tier, giro por seed+tick), buracos negros e estrelas ────
// Buraco: núcleo (sprite girando) + anel de influência tracejado (Graphics redesenhado só
// quando o raio muda > 1 px; giro/pulso via rotation/alpha). k = influenceR/(r·INFLUENCE).
// Estrela: sprite jovem/velha (fase OLD = inchando para a supernova) pulsando + coroa tracejada
// no halo; k = influenceR/(r·STAR.HALO) dá a rampa de nascimento (escala e alpha).
import {Container,Sprite,Graphics} from "pixi.js";
import {BLACKHOLE,STAR,STAR_PHASE,rectHas} from "@planet/shared";
import {colorOf,seedAngle} from "../../util.js";

export function createHazards(R){
  const asteroids=new Container(),holes=new Container(),stars=new Container();const aById=new Map(),hById=new Map(),sById=new Map();let frame=0;
  return{asteroids,holes,stars,setTheme(){},
    render(f){frame++;const th=R.theme,TX=th.textures,view=f.view,rect=f.rect,rt=f.rt,t=f.t;
      const AK=TX.scale.asteroid,BK=TX.scale.blackHole;
      for(const e of view.asteroids){let rec=aById.get(e.id);
        if(!rec){const sp=new Sprite();sp.anchor.set(.5);asteroids.addChild(sp);const w=(.15+(e.seed%7)*.06)*((e.seed&1)?1:-1);rec={sp,a0:seedAngle(e.seed),w,f:0};aById.set(e.id,rec);}
        rec.f=frame;const sp=rec.sp;if(!rectHas(rect,e.rx,e.ry,e.rr*1.6)){sp.visible=false;continue;}sp.visible=true;
        const variant=e.hue%3,size=TX.tier(e.rr);sp.texture=R.cache.get(TX.key("asteroid",{variant},size),size,(c,s)=>TX.asteroid(c,s,{variant}));
        const d=e.rr*AK;sp.width=sp.height=d*2;sp.position.set(e.rx,e.ry);sp.rotation=rec.a0+rec.w*rt/60;sp.alpha=e.alpha;}
      for(const [id,rec] of aById)if(rec.f!==frame){rec.sp.destroy();aById.delete(id);}
      const BH=th.effects.blackHole;
      for(const e of view.holes){let rec=hById.get(e.id);
        if(!rec){const core=new Sprite();core.anchor.set(.5);const ring=new Graphics();holes.addChild(ring,core);rec={core,ring,lastRi:-1,f:0,a0:seedAngle(e.seed)};hById.set(e.id,rec);}
        rec.f=frame;const k=Math.min(1,Math.max(0,e.influenceR/(e.rr*BLACKHOLE.INFLUENCE))),rc=e.rr*k,ri=e.influenceR;
        if(k<=0||!rectHas(rect,e.rx,e.ry,ri)){rec.core.visible=rec.ring.visible=false;continue;}rec.core.visible=rec.ring.visible=true;
        const spin=rec.a0+rt*.02;
        rec.core.texture=R.cache.get(TX.key("blackHole"),256,(c,s)=>TX.blackHole(c,s,{}));const d=rc*BK;rec.core.width=rec.core.height=d*2;
        rec.core.position.set(e.rx,e.ry);rec.core.rotation=spin;rec.core.alpha=Math.min(1,k*BH.alphaK)*e.alpha;
        const rg=BH.ring;if(Math.abs(ri-rec.lastRi)>1){rec.lastRi=ri;const g=rec.ring;g.clear();const col=colorOf(rg.color);
          if(rg.dash&&ri>4){const on=rg.dash[0],off=rg.dash[1],circ=6.2832*ri;let a=0;while(a<circ){const a0=a/ri,a1=Math.min(circ,a+on)/ri;g.moveTo(Math.cos(a0)*ri,Math.sin(a0)*ri);g.arc(0,0,ri,a0,a1);a+=on+off;}}
          else g.circle(0,0,ri);g.stroke({width:rg.width,color:col.c,alpha:col.a,cap:"round"});}
        rec.ring.position.set(e.rx,e.ry);rec.ring.rotation=spin*rg.spinK;rec.ring.alpha=(rg.alpha[0]+(rg.alpha[1]-rg.alpha[0])*(.5+.5*Math.sin(t*rg.pulse)))*e.alpha;}
      for(const [id,rec] of hById)if(rec.f!==frame){rec.core.destroy();rec.ring.destroy();hById.delete(id);}
      const SK=TX.scale.nova,ST=th.effects.star;
      for(const e of view.stars){let rec=sById.get(e.id);
        if(!rec){const sp=new Sprite();sp.anchor.set(.5);const ring=new Graphics();stars.addChild(ring,sp);rec={sp,ring,lastRi:-1,f:0,a0:seedAngle(e.seed)};sById.set(e.id,rec);}
        rec.f=frame;const old=e.phase===STAR_PHASE.OLD,halo=e.rr*STAR.HALO,k=Math.min(1,Math.max(0,e.influenceR/halo));
        if(!rectHas(rect,e.rx,e.ry,halo)){rec.sp.visible=rec.ring.visible=false;continue;}rec.sp.visible=rec.ring.visible=true;
        const size=TX.tier(e.rr);rec.sp.texture=R.cache.get(TX.key("nova",{old},size),size,(c,s)=>TX.nova(c,s,{old}));
        const pul=1+ST.pulse.amp*Math.sin(t*(old?ST.pulse.speedOld:ST.pulse.speed)),d=e.rr*SK*pul*(.35+.65*k);
        rec.sp.width=rec.sp.height=d*2;rec.sp.position.set(e.rx,e.ry);rec.sp.rotation=rec.a0+rt*ST.spin;rec.sp.alpha=Math.min(1,k*ST.alphaK)*e.alpha;
        const rg=ST.ring,ri=e.influenceR;
        if(Math.abs(ri-rec.lastRi)>1){rec.lastRi=ri;const g=rec.ring;g.clear();
          if(ri>4){const on=rg.dash[0],off=rg.dash[1],circ=6.2832*ri;let a=0;while(a<circ){const a0=a/ri,a1=Math.min(circ,a+on)/ri;g.moveTo(Math.cos(a0)*ri,Math.sin(a0)*ri);g.arc(0,0,ri,a0,a1);a+=on+off;}
            g.stroke({width:rg.width,color:colorOf(rg.color).c,alpha:1,cap:"round"});}}
        rec.ring.position.set(e.rx,e.ry);rec.ring.rotation=rec.a0*2+rt*rg.spinK;rec.ring.tint=colorOf(old?rg.colorOld:rg.color).c;
        rec.ring.alpha=(rg.alpha[0]+(rg.alpha[1]-rg.alpha[0])*(.5+.5*Math.sin(t*(old?rg.pulseOld:rg.pulse))))*e.alpha;}
      for(const [id,rec] of sById)if(rec.f!==frame){rec.sp.destroy();rec.ring.destroy();sById.delete(id);}},
    counts(){return{asteroids:aById.size,holes:hById.size,stars:sById.size};},
    destroy(){asteroids.destroy({children:true});holes.destroy({children:true});stars.destroy({children:true});aById.clear();hById.clear();sById.clear();},
  };}
