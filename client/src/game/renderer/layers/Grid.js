// ── GRADE (TilingSprite de um tile assado do tema) + BORDA do mundo (Graphics, tracejada) ──
import {Container,TilingSprite,Graphics,Texture} from "pixi.js";
import {WORLD} from "@warspace/shared";
import {colorOf,dashPolyline} from "../../util.js";
import {perf} from "../../perf.js";

// ⚠️ A BORDA É DESENHADA EM PIXELS DE TELA, e é por isso que ela existe aqui como função do zoom.
// Ela vive em coordenadas de MUNDO dentro do container que leva `world.scale.set(cam.scale)` todo frame
// (Renderer.js), então uma linha declarada com 6 px de mundo aparece com `6*scale` px de tela — e a
// câmera NUNCA para: a suavização exponencial de Camera.js persegue o alvo sem nunca chegar nele. Com um
// planeta grande o zoom cai fundo, a linha vira ~1,8 px e o tracejado de 40/26 px vira 12/8 px, tudo
// reamostrado num subpixel diferente a cada frame: é a cintilação. Dividindo largura e traço pelo zoom, a
// borda passa a ter a MESMA medida em tela em qualquer afastamento e para de piscar.
// O redesenho é por PATAMAR (REBAKE_K), não por frame: `dashPolyline` percorre o perímetro inteiro, e
// refazê-lo 60 vezes por segundo seria trocar um defeito visual por um custo de CPU.
// ⚠️ **QUANTO CUSTA UM REBAKE, em números, porque o comentário acima não dizia**: o perímetro é
// 2·(12000+12000) = 48 000 px de MUNDO e o traço é `dash:[40,26]` (período 66·k, com `k=REF/scale`).
// Em `cam.scale` .5 — o zoom com que a câmera nasce — isso é ~727 segmentos; num zoom de 1.25, ~1 818.
// Cada segmento é um `moveTo`+`lineTo`, e o `stroke()` final faz o Pixi v8 retesselar o contexto
// INTEIRO e resubir a geometria para a GPU. É trabalho de milissegundos, dentro de um frame.
// ⚠️ E ele é PERIÓDICO por construção: a câmera nunca para (`Camera.js` persegue o alvo com suavização
// exponencial e não chega nele), então crescer, dividir, fundir ou girar a roda atravessa bandas de 4%
// em cascata. Subir este número é o primeiro teste de bissecção de qualquer engasgo de render: com
// `REBAKE_K` alto a borda congela no zoom inicial e, se a travada sumir, ela era daqui.
const REBAKE_K=.04;      // 4% de variação de zoom já justifica reassar
// ⚠️ A ESCALA DE REFERÊNCIA. Os números do tema (`width:18`, `dash:[40,26]`) foram escolhidos de olho, em
// px de MUNDO e no zoom de sempre — que é ~.5, o valor com que a câmera nasce. Convertê-los direto para px
// de tela dobraria a borda: 18 px de mundo a .5 são 9 px na tela, não 18. Então o que se congela aqui é a
// espessura APARENTE naquele zoom: em .5 sai exatamente o desenho de antes, e nos outros zooms ela deixa
// de encolher (que é o que fazia a linha virar subpixel e cintilar).
const REF=.5;

export function createGrid(R){
  const root=new Container(),ts=new TilingSprite({texture:Texture.WHITE,width:WORLD.w,height:WORLD.h}),border=new Graphics();root.addChild(ts,border);
  const seg=[];
  let gridKey="",bakedScale=0;
  /** A borda reassada para ESTE zoom: espessura e traço constantes na tela, custe o que custar em mundo. */
  function bakeBorder(scale){
    perf.ini("bakeBorder");
    const th=R.theme,W=WORLD.w,H=WORLD.h,k=REF/(scale>1e-4?scale:1e-4);
    bakedScale=scale;border.clear();
    for(const b of th.world.border){const col=colorOf(b.color),w=b.width*k;
      if(b.dash){
        // o traço também é constante em tela: é ele, e não a espessura, que mais cintilava — cada segmento
        // caía num subpixel diferente a cada frame conforme a câmera arrastava
        dashPolyline([{x:0,y:0},{x:W,y:0},{x:W,y:H},{x:0,y:H},{x:0,y:0}],[b.dash[0]*k,(b.dash[1]||b.dash[0])*k],seg);
        for(let i=0;i<seg.length;i+=4){border.moveTo(seg[i],seg[i+1]);border.lineTo(seg[i+2],seg[i+3]);}
        border.stroke({width:w,color:col.c,alpha:col.a,cap:"butt"});}
      else border.rect(0,0,W,H).stroke({width:w,color:col.c,alpha:col.a});}
    perf.fim("bakeBorder");}
  function setTheme(){const th=R.theme,g=th.world.grid;gridKey=`${th.id}:grid`;
    ts.texture=R.cache.raw(gridKey,g.step,g.step,2,(c,w,h)=>{c.strokeStyle=g.color;c.lineWidth=g.width;c.beginPath();c.moveTo(g.width/2,0);c.lineTo(g.width/2,h);c.moveTo(0,g.width/2);c.lineTo(w,g.width/2);c.stroke();});
    ts.width=WORLD.w;ts.height=WORLD.h;
    bakeBorder(bakedScale||.5);}
  // a grade cobre a tela inteira (é a camada mais cara em máquina fraca): sai no modo econômico
  return{root,setTheme,render(f){R.cache.keepAlive(gridKey);ts.visible=f.showGrid&&!R.econ;
    // `idle` = o canvas está vivo mas não há partida (o menu está na frente). A grade e a BORDA são a
    // moldura da arena; sem arena, a borda vira um traço amarelo tracejado cortando o fundo do menu.
    border.visible=!f.idle;
    // ⚠️ **INVISÍVEL NÃO REASSA.** A checagem vinha DEPOIS de `border.visible` e ignorava o resultado
    // dela: fora de partida — o menu no ar, a câmera do lobby passeando — o zoom continua mudando e o
    // perímetro de 48 000 px continuava sendo retracejado, para desenhar uma borda que ninguém vê.
    const s=f.cam.scale;
    if(border.visible&&!(Math.abs(s-bakedScale)<=bakedScale*REBAKE_K))bakeBorder(s);},
    destroy(){root.destroy({children:true});}};}
