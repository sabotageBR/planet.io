// ── ZONA (Sobrevivência): o círculo que fecha e queima quem fica de fora ─────
// Desenha DUAS coisas: o anel da zona atual (grosso, pulsando) e, enquanto ela está fechando, o círculo de
// DESTINO tracejado — é o que diz "corra para cá", e sem ele o jogador só descobre para onde ir quando já
// está queimando. O tinto de FORA é um CÍRCULO COM CONTORNO GROSSO (raio r+W/2, espessura W ≥ diagonal da
// tela): a área pintada é exatamente o anel de r para fora, e nada dentro. A primeira versão usava um
// retângulo com furo e `fillRule:"evenodd"`, e o Pixi pintava o lado errado — a tela inteira ficava vermelha.
// Máscara e filtro estão fora de questão aqui: custam render target, e é o que derruba o fps.
// O círculo vem interpolado do motor (o servidor manda origem+destino a 2 Hz e o cliente interpola), então
// esta camada não sabe nada de fases nem de tempo.
// Estilo em theme.effects.zone {color,warn,width,dash,alpha,dim,pulse}.
import {Graphics} from "pixi.js";
import {colorOf} from "../../util.js";

const SEG=64;   // segmentos do anel: 64 já fica liso num raio de 6000 px e é 1 draw call

export function createZone(R){
  const g=new Graphics();
  /** Círculo tracejado (o destino). `dash` em px de mundo para o traço não mudar de tamanho com o zoom. */
  const dashed=(cx,cy,r,dash)=>{
    const passo=dash*2/r;
    for(let a=0;a<Math.PI*2;a+=passo*2){g.moveTo(cx+Math.cos(a)*r,cy+Math.sin(a)*r);
      const b=Math.min(a+passo,Math.PI*2);
      for(let t=a;t<=b;t+=passo/4)g.lineTo(cx+Math.cos(t)*r,cy+Math.sin(t)*r);}};
  return{root:g,setTheme(){},
    render(f){const z=f.zone,cam=f.cam;g.clear();
      if(!z||!cam||!cam.scale){g.visible=false;return;}
      g.visible=true;
      const st=(R.theme.effects&&R.theme.effects.zone)||{color:"#ff4d5e",warn:"#ffc22e",width:5,dash:70,alpha:[.5,.95],dim:.22,pulse:.0022};   // `f.t` é ms: o pulso é ~0,35 Hz
      const col=colorOf(st.color),warn=colorOf(st.warn);
      const hw=cam.W/(2*cam.scale),hh=cam.H/(2*cam.scale);
      // 1) fora da zona tinge: anel de r para fora, feito com um contorno grosso (ver cabeçalho)
      if(st.dim>0){
        const W=(Math.hypot(hw,hh)+Math.hypot(cam.x-z.x,cam.y-z.y))*2+z.r;   // cobre a tela inteira, esteja a câmera onde estiver
        g.circle(z.x,z.y,z.r+W/2);
        g.stroke({width:W,color:col.c,alpha:st.dim*col.a});}
      // 2) o anel de agora
      const pulso=.5+.5*Math.sin(f.t*st.pulse);
      const al=st.alpha[0]+(st.alpha[1]-st.alpha[0])*pulso;
      g.circle(z.x,z.y,z.r);
      g.stroke({width:st.width/cam.scale,color:col.c,alpha:al*col.a});
      // 3) para onde ela vai (só enquanto está andando de verdade)
      if(z.tx!=null&&(Math.abs(z.tr-z.r)>1||Math.abs(z.tx-z.x)>1)){
        dashed(z.tx,z.ty,z.tr,st.dash);
        g.stroke({width:(st.width*.6)/cam.scale,color:warn.c,alpha:.85*warn.a,cap:"round"});}},
    destroy(){g.destroy();},
  };}
