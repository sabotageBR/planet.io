// ── PERIGOS: asteroides (sprite por tier, giro por seed+tick), buracos negros e estrelas ────
// Buraco: núcleo (sprite PARADO — a arte é um disco de acreção em perspectiva, girar o sprite inteiro faz a elipse
// cambalear) + anel de influência tracejado + ring2 = a LINHA DA MORTE em rc·CRUSH_K (cabe dentro dela, é esmagado)
// + faíscas orbitando no plano do disco, no MESMO sentido do SWIRL da física (seed<.5) — é delas que vem o movimento
// que o giro do sprite dava. Graphics dos anéis redesenhado só quando o raio muda > 1 px; pulso via alpha.
// k = influenceR/(r·INFLUENCE).
// Estrela: sprite jovem/velha (fase OLD = inchando para a supernova) pulsando + coroa tracejada no halo
// (+ ring2 opcional na borda quente); k = influenceR/(r·STAR.HALO) dá a rampa de nascimento (escala e alpha).
import {Container,Sprite,Graphics} from "pixi.js";
import {BLACKHOLE,STAR,STAR_PHASE,rectHas} from "@warspace/shared";
import {colorOf,seedAngle} from "../../util.js";

/** Lista vazia compartilhada: o laço da cobertura não pode alocar um array por frame quando ela está off. */
const VAZIO=[];

export const BH_TEX=512;
const BH_SIZE=BH_TEX,SPARK_MIN_PX=26;   // 512: as estriações do disco não sobrevivem a 256 (os 5 buracos dividem UMA textura por tema)

export function createHazards(R){
  const asteroids=new Container(),holes=new Container(),stars=new Container();const aById=new Map(),hById=new Map(),sById=new Map();let frame=0;
  // ⚠️ `starsFront` é a MESMA estrela desenhada de novo, e ela existe por causa de uma regra de física:
  // abaixo de STAR.PASS_R a peça ATRAVESSA o disco e se esconde lá dentro (rules.js `starPass`). Só que a
  // camada de estrelas fica ABAIXO de `planets.root` na montagem do Renderer (o halo tem que vazar por
  // baixo dos corpos), então o planeta escondido aparecia inteiro POR CIMA da estrela — a mecânica não
  // lia na tela, e "estou escondido" virava fé no manual. Esta é a metade quente do sprite, repetida
  // acima dos planetas com alfa baixo: quem está dentro fica submerso, e quem está fora não muda em nada
  // (o alfa é pequeno e o disco já era claro). É o mesmo espírito da promessa
  // `CRUSH_K == textures.scale.blackHole` do buraco negro: o limiar tem que ser visível.
  const starsFront=new Container();const fById=new Map();
  return{asteroids,holes,stars,starsFront,setTheme(){},
    render(f){frame++;const th=R.theme,TX=th.textures,view=f.view,rect=f.rect,rt=f.rt,t=f.t,zoom=f.cam.scale;
      const AK=TX.scale.asteroid,BK=TX.scale.blackHole;
      for(const e of view.asteroids){let rec=aById.get(e.id);
        if(!rec){const sp=new Sprite();sp.anchor.set(.5);asteroids.addChild(sp);const w=(.15+(e.seed%7)*.06)*((e.seed&1)?1:-1);rec={sp,a0:seedAngle(e.seed),w,f:0};aById.set(e.id,rec);}
        rec.f=frame;const sp=rec.sp;if(!rectHas(rect,e.rx,e.ry,e.rr*1.6)){sp.visible=false;continue;}sp.visible=true;
        const variant=e.hue%3,size=Math.min(TX.tier(e.rr),R.texCap);sp.texture=R.cache.get(TX.key("asteroid",{variant},size),size,(c,s)=>TX.asteroid(c,s,{variant}));
        const d=e.rr*AK;sp.width=sp.height=d*2;sp.position.set(e.rx,e.ry);sp.rotation=rec.a0+rec.w*rt/60;sp.alpha=e.alpha;}
      for(const [id,rec] of aById)if(rec.f!==frame){rec.sp.destroy();aById.delete(id);}
      const BH=th.effects.blackHole;
      for(const e of view.holes){let rec=hById.get(e.id);
        if(!rec){const core=new Sprite();core.anchor.set(.5);const ring=new Graphics(),ring2=new Graphics(),spark=new Graphics();holes.addChild(ring,ring2,core,spark);rec={core,ring,ring2,spark,lastRi:-1,lastR2:-1,f:0,a0:seedAngle(e.seed)};hById.set(e.id,rec);}
        rec.f=frame;const k=Math.min(1,Math.max(0,e.influenceR/(e.rr*BLACKHOLE.INFLUENCE))),rc=e.rr*k,ri=e.influenceR;
        if(k<=0||!rectHas(rect,e.rx,e.ry,ri)){rec.core.visible=rec.ring.visible=rec.ring2.visible=rec.spark.visible=false;continue;}rec.core.visible=rec.ring.visible=rec.spark.visible=true;
        const spin=rec.a0+rt*.02;
        rec.core.texture=R.cache.get(TX.key("blackHole",{},BH_SIZE),BH_SIZE,(c,s)=>TX.blackHole(c,s,{}));const d=rc*BK;rec.core.width=rec.core.height=d*2;
        rec.core.position.set(e.rx,e.ry);rec.core.alpha=Math.min(1,k*BH.alphaK)*e.alpha;   // rotation FICA em 0: a perspectiva do disco é fixa
        const rg=BH.ring;if(Math.abs(ri-rec.lastRi)>1){rec.lastRi=ri;const g=rec.ring;g.clear();const col=colorOf(rg.color);
          if(rg.dash&&ri>4){const on=rg.dash[0],off=rg.dash[1],circ=6.2832*ri;let a=0;while(a<circ){const a0=a/ri,a1=Math.min(circ,a+on)/ri;g.moveTo(Math.cos(a0)*ri,Math.sin(a0)*ri);g.arc(0,0,ri,a0,a1);a+=on+off;}}
          else g.circle(0,0,ri);g.stroke({width:rg.width,color:col.c,alpha:col.a,cap:"round"});}
        rec.ring.position.set(e.rx,e.ry);rec.ring.rotation=spin*rg.spinK;rec.ring.alpha=(rg.alpha[0]+(rg.alpha[1]-rg.alpha[0])*(.5+.5*Math.sin(t*rg.pulse)))*e.alpha;
        const r2=BH.ring2;rec.ring2.visible=!!r2;   // horizonte de eventos, colado no núcleo
        if(r2){const rr2=rc*r2.rK;
          if(Math.abs(rr2-rec.lastR2)>1){rec.lastR2=rr2;const g=rec.ring2;g.clear();const c2=colorOf(r2.color);
            if(r2.dash&&rr2>4){const on=r2.dash[0],off=r2.dash[1],circ=6.2832*rr2;let a=0;while(a<circ){const a0=a/rr2,a1=Math.min(circ,a+on)/rr2;g.moveTo(Math.cos(a0)*rr2,Math.sin(a0)*rr2);g.arc(0,0,rr2,a0,a1);a+=on+off;}}
            else g.circle(0,0,rr2);g.stroke({width:r2.width,color:c2.c,alpha:c2.a,cap:"round"});}
          rec.ring2.position.set(e.rx,e.ry);rec.ring2.rotation=spin*r2.spinK;
          rec.ring2.alpha=(r2.alpha[0]+(r2.alpha[1]-r2.alpha[0])*(.5+.5*Math.sin(t*r2.pulse)))*e.alpha*Math.min(1,k*1.4);}
        const sp=BH.spark,g=rec.spark;g.clear();g.position.set(e.rx,e.ry);g.alpha=e.alpha*k;   // faíscas no plano do disco
        if(sp&&d*zoom>SPARK_MIN_PX){const dir=e.seed<32768?1:-1,   // mesmo sentido do SWIRL da física (seed<.5 → +1)
          rx=d*sp.rxK,ry=d*sp.ryK,col=colorOf(sp.color);
          for(let i=0;i<sp.n;i++){const an=rec.a0+dir*rt*sp.speed+i/sp.n*6.2832,cy=Math.sin(an);
            g.circle(Math.cos(an)*rx,cy*ry,sp.r(d)*(.6+.4*cy));   // maior/mais brilhante quando passa pela FRENTE (cy>0)
            g.fill({color:col.c,alpha:col.a*(sp.alpha[0]+(sp.alpha[1]-sp.alpha[0])*(.5+.5*cy))});}}}
      for(const [id,rec] of hById)if(rec.f!==frame){rec.core.destroy();rec.ring.destroy();rec.ring2.destroy();rec.spark.destroy();hById.delete(id);}
      const SK=TX.scale.nova,ST=th.effects.star;
      for(const e of view.stars){let rec=sById.get(e.id);
        if(!rec){const sp=new Sprite();sp.anchor.set(.5);const ring=new Graphics();stars.addChild(ring,sp);rec={sp,ring,ninho:null,lastRi:-1,f:0,a0:seedAngle(e.seed)};sById.set(e.id,rec);}
        rec.f=frame;const old=e.phase===STAR_PHASE.OLD,halo=e.rr*STAR.HALO,k=Math.min(1,Math.max(0,e.influenceR/halo));
        if(!rectHas(rect,e.rx,e.ry,halo)){rec.sp.visible=rec.ring.visible=false;if(rec.ninho)rec.ninho.visible=false;continue;}rec.sp.visible=rec.ring.visible=true;
        const variant=STAR.LAYOUT|0;
        const size=Math.min(TX.tier(e.rr),R.texCap);rec.sp.texture=R.cache.get(TX.key("nova",{old,variant},size),size,(c,s)=>TX.nova(c,s,{old,variant}));
        const pul=1+ST.pulse.amp*Math.sin(t*(old?ST.pulse.speedOld:ST.pulse.speed)),d=e.rr*SK*pul*(.35+.65*k);
        rec.sp.width=rec.sp.height=d*2;rec.sp.position.set(e.rx,e.ry);rec.sp.rotation=rec.a0+rt*ST.spin;rec.sp.alpha=Math.min(1,k*ST.alphaK)*e.alpha;
        const rg=ST.ring,ri=e.influenceR;
        if(Math.abs(ri-rec.lastRi)>1){rec.lastRi=ri;const g=rec.ring;g.clear();
          if(ri>4){const on=rg.dash[0],off=rg.dash[1],circ=6.2832*ri;let a=0;while(a<circ){const a0=a/ri,a1=Math.min(circ,a+on)/ri;g.moveTo(Math.cos(a0)*ri,Math.sin(a0)*ri);g.arc(0,0,ri,a0,a1);a+=on+off;}
            g.stroke({width:rg.width,color:colorOf(rg.color).c,alpha:1,cap:"round"});}}
        rec.ring.position.set(e.rx,e.ry);rec.ring.rotation=rec.a0*2+rt*rg.spinK;rec.ring.tint=colorOf(old?rg.colorOld:rg.color).c;
        rec.ring.alpha=(rg.alpha[0]+(rg.alpha[1]-rg.alpha[0])*(.5+.5*Math.sin(t*(old?rg.pulseOld:rg.pulse))))*e.alpha;
        // ── O CÍRCULO DE MATERIAIS ──
        // A transição ACTIVE→OLD era uma troca INSTANTÂNEA de textura: os 8 s mais dramáticos do ciclo
        // eram "a bola fica vermelha de repente e incha devagar", sem nada dizendo que ela vai explodir.
        // Agora o anel de matéria FECHA e ACELERA conforme ela incha — a leitura de "acretando".
        // ⚠️ O progresso da fase OLD é DERIVADO do raio, sem um byte novo de protocolo: `r` cresce de
        // STAR.R até STAR.R·SWELL e chega quantizado a 0,1 px, então `p` tem precisão ~0,003.
        const NU=ST.nursery;
        if(NU&&old&&!R.econ){
          const p=Math.min(1,Math.max(0,(e.rr/STAR.R-1)/(STAR.SWELL-1)));
          if(!rec.ninho){rec.ninho=new Graphics();stars.addChild(rec.ninho);}
          const g2=rec.ninho;g2.clear();g2.visible=true;g2.position.set(e.rx,e.ry);
          const raio=e.rr*(NU.r0K+(NU.r1K-NU.r0K)*p),gir=rec.a0*3+rt*NU.speed*(1+3*p),cor=colorOf(NU.color).c;
          for(let i=0;i<NU.n;i++){const an=gir+i/NU.n*6.2832,cx=Math.cos(an)*raio,cy=Math.sin(an)*raio*NU.ryK;
            // brilho por `cy`: o que está "na frente" (cy>0) aparece mais — é o mesmo truque das faíscas
            // do buraco negro, e é ele que faz o anel ter plano em vez de virar um círculo chapado
            g2.circle(cx,cy,e.rr*NU.size*(.7+.3*p)).fill({color:cor,alpha:NU.alpha*(.45+.55*(cy/(raio*NU.ryK+1e-6)+1)/2)*e.alpha});}
        }else if(rec.ninho)rec.ninho.visible=false;}
      for(const [id,rec] of sById)if(rec.f!==frame){rec.sp.destroy();rec.ring.destroy();if(rec.ninho)rec.ninho.destroy();sById.delete(id);}
      // A COBERTURA: um sprite por estrela, o mesmo do cache (nenhuma textura nova), acima dos planetas.
      // Sai inteira no modo econômico — é enfeite de leitura, não informação que falte em outro lugar.
      const cobre=ST.front&&!R.econ;
      for(const e of cobre?view.stars:VAZIO){let rec=fById.get(e.id);
        if(!rec){const sp=new Sprite();sp.anchor.set(.5);sp.blendMode="add";starsFront.addChild(sp);rec={sp,f:0,a0:seedAngle(e.seed)};fById.set(e.id,rec);}
        rec.f=frame;const old=e.phase===STAR_PHASE.OLD,halo=e.rr*STAR.HALO,k=Math.min(1,Math.max(0,e.influenceR/halo));
        if(!rectHas(rect,e.rx,e.ry,halo)){rec.sp.visible=false;continue;}rec.sp.visible=true;
        const size=Math.min(TX.tier(e.rr),R.texCap);rec.sp.texture=R.cache.get(TX.key("nova",{old},size),size,(c,s)=>TX.nova(c,s,{old}));
        const pul=1+ST.pulse.amp*Math.sin(t*(old?ST.pulse.speedOld:ST.pulse.speed));
        // só o MIOLO (`front.k`, bem menor que o SK do sprite de baixo): a coroa de plasma por cima dos
        // planetas viraria uma mancha em volta da estrela, e o que precisa cobrir é o disco onde se esconde
        const d=e.rr*ST.front.k*pul*(.35+.65*k);
        rec.sp.width=rec.sp.height=d*2;rec.sp.position.set(e.rx,e.ry);rec.sp.rotation=rec.a0+rt*ST.spin;
        rec.sp.alpha=ST.front.alpha*Math.min(1,k*ST.alphaK)*e.alpha;}
      for(const [id,rec] of fById)if(rec.f!==frame){rec.sp.destroy();fById.delete(id);}},
    counts(){return{asteroids:aById.size,holes:hById.size,stars:sById.size};},
    destroy(){asteroids.destroy({children:true});holes.destroy({children:true});stars.destroy({children:true});starsFront.destroy({children:true});aById.clear();hById.clear();sById.clear();fById.clear();},
  };}
