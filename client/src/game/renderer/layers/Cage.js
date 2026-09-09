// ── OCTÓGONO DE LARGADA (Battle Royale): a gaiola dos primeiros segundos ─────
// Desenha em coordenadas de MUNDO, com o traço dividido por `cam.scale` para a espessura na TELA não mudar
// com o zoom — é o que `Zone.js` faz ao lado, e pelo mesmo motivo (a câmera nunca para, e uma linha medida
// em mundo cintila a cada quadro).
// ⚠️ NÃO HÁ TINTA DO LADO DE FORA, ao contrário da zona: ali fora não é veneno, é o mapa de sempre
// esperando. O que este desenho tem que dizer é "há uma parede aqui", e uma parede se diz com a linha.
// ⚠️ A GEOMETRIA SAI DA CONSTANTE (`BR.CAGE_AP` via `cageVertexR`), nunca do fio: os dois lados leem o
// mesmo número, como já fazem com `WORLD.w` e com `ZONE.R`. É por isso que a gaiola não custou protocolo.
// Estilo em `theme.effects.cage` — com fallback aqui dentro, então nenhum arquivo de tema precisa mudar
// (eles são gerados por `theme/port.js`).
import {Graphics} from "pixi.js";
import {cageVertexR,CAGE_N} from "@warspace/shared/physics/index.js";
import {colorOf} from "../../util.js";

export function createCage(R){
  const g=new Graphics();
  return{root:g,setTheme(){},
    render(f){const c=f.cage,cam=f.cam;g.clear();
      if(!c||!cam||!cam.scale){g.visible=false;return;}
      g.visible=true;
      const st=(R.theme.effects&&R.theme.effects.cage)||{color:"#8fd6ff",width:7,alpha:[.5,.95],pulse:.006,inner:.945};
      const col=colorOf(st.color),rv=cageVertexR(c.ap),pts=[];
      // Os VÉRTICES ficam meio passo fora das normais (que estão em múltiplos de 45°, ver cage.js): assim os
      // LADOS ficam de frente para os eixos, e o octógono lê como arena em vez de losango.
      for(let k=0;k<CAGE_N;k++){const a=Math.PI/CAGE_N+k*2*Math.PI/CAGE_N;
        pts.push(c.x+Math.cos(a)*rv,c.y+Math.sin(a)*rv);}
      const al=st.alpha[0]+(st.alpha[1]-st.alpha[0])*(.5+.5*Math.sin(f.t*st.pulse));   // `f.t` é ms: o pulso é ~1 Hz
      g.poly(pts,true);g.stroke({width:st.width/cam.scale,color:col.c,alpha:al*col.a});
      // um segundo contorno por dentro dá ESPESSURA de parede sem custar textura nem render target
      const inn=pts.map((v,i)=>{const o=i%2?c.y:c.x;return o+(v-o)*st.inner;});
      g.poly(inn,true);g.stroke({width:(st.width*.5)/cam.scale,color:col.c,alpha:.32*col.a});},
    destroy(){g.destroy();},
  };}
