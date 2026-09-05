// ── SETA DE RUMO: para onde o jogador MANDOU o planeta ir ─────────────────────
// No dedo não existe mais base+manopla desenhada sob o polegar (ver input/Joystick.js): o toque vale em
// qualquer parte da tela e o rumo fica travado depois que a mão sai. Sem nada na tela, porém, o jogador
// perde a única confirmação de que o comando pegou — e o rumo travado é justamente o estado em que não há
// dedo nenhum para olhar. Esta camada é essa confirmação, e ela mora ONDE O JOGADOR ESTÁ OLHANDO: colada
// à borda do próprio planeta, como no agar.io mobile.
//
// É o RUMO COMANDADO, não a velocidade real da peça: a peça pode estar presa numa parede, sendo empurrada
// por um quique ou correndo contra outra metade do cacho, e mesmo assim a seta continua dizendo o que foi
// pedido. É instrumento de controle, não física.
//
// ⚠️ A GEOMETRIA É ASSADA UMA VEZ, em `setTheme`, num espaço onde 1 unidade = 1 px de TELA, apontando para
// +X. Por frame só se escreve `position`, `rotation`, `scale` e `alpha` — quatro writes de transform,
// nenhuma retesselação. `Aim.js` e `Threat.js` redesenham porque a forma deles MUDA (a reta vai da peça ao
// cursor, o chevron anda pela borda da janela); aqui a forma é sempre o mesmo triângulo, e só o lugar
// muda. Não é sprite assado pelo motivo oposto: um triângulo de três vértices não justifica uma chave no
// TextureCache, três texturas (uma por tema) e o contrato de repedir/keepAlive — e vetorial fica nítido
// tanto no zoom mínimo quanto grudado num planeta de r=1250.
//
// ⚠️ `scale.set(1/cam.scale)` é o que dá tamanho CONSTANTE EM TELA: a camada vive dentro do container do
// mundo, que leva `world.scale.set(cam.scale)` todo frame (Renderer.js), então dividir cancela o zoom. É a
// mesma conta do ícone de push-to-talk (`TALK_PX/cam.scale` em Planets.js) e da seta de ameaça.
// ⚠️ E o afastamento SOMA duas medidas de naturezas diferentes: `r` é MUNDO (acompanha o planeta crescendo)
// e `gap`/`h` são TELA. Fração do raio seria o erro documentado no aro de powerup: num planeta de r=587 a
// seta ficaria a 176 px dele e leria como outro corpo em órbita, não como o rumo dele.
import {Graphics} from "pixi.js";
import {colorOf} from "../../util.js";

export function createHeading(R){
  const g=new Graphics();g.label="heading";   // nomeado: é assim que a sonda de toque (e o devtools do Pixi) o acham na árvore
  // ⚠️ Idempotente e sem `new Graphics()`: o Renderer chama setTheme() e depois remonta a árvore com
  // `removeChildren()`, que NÃO destrói — o mesmo nó é re-parenteado. É também por aqui que a geometria
  // volta sozinha depois de uma perda de contexto WebGL (onRestored → setTheme).
  function setTheme(){const st=R.theme.hud.heading;g.clear();if(!st)return;
    const h=st.h,w=st.w;
    g.poly([h*.5,0,-h*.5,-w*.5,-h*.5,w*.5],true);
    const f=colorOf(st.fill);g.fill({color:f.c,alpha:f.a});
    if(st.ink){const k=colorOf(st.ink);g.stroke({width:st.width,color:k.c,alpha:k.a,join:"round"});}}
  return{root:g,setTheme,
    /** f.heading = {x,y,r,dx,dy,k} da MAIOR peça própria, ou null. Quem decide SE existe seta é game/index.js. */
    render(f){const hd=f.heading,cam=f.cam,st=R.theme.hud.heading;
      if(!hd||!st||!cam||!cam.scale||hd.k<st.minK){g.visible=false;return;}
      const s=1/cam.scale;
      g.visible=true;
      g.scale.set(s);
      g.rotation=Math.atan2(hd.dy,hd.dx);
      const off=hd.r+(st.gap+st.h*.5)*s;   // raio em MUNDO + folga em TELA
      g.position.set(hd.x+hd.dx*off,hd.y+hd.dy*off);
      g.alpha=st.alpha[0]+(st.alpha[1]-st.alpha[0])*hd.k;},
    destroy(){g.destroy();},
  };}
