// ── PLANETAS: pool {corpo (sprite por tier), Graphics (arco de merge + anéis de powerup),
//    BitmapText do nome}; ordenados por raio (zIndex). Trilhas: um Graphics só, polilinha
//    tracejada (theme.hud.trail). Fonte bitmap instalada por tema (só o nome) com charset pt-BR.
//    A massa NÃO é escrita dentro do planeta: o número vive só no HUD e no placar.
//    Anéis: pelas flags de CADA peça (SHIELD + nível em 2 bits, MAGNET) — powerup é por peça, então duas partes do
//    mesmo planeta podem estar diferentes. Escudo usa theme.hud.cell.powerups.shieldLevels[nível−1]; ímã pede R.ambient("magnet").
//    pop(id,delay): "gulp" de quem acabou de engolir alguém — o corpo incha e achata por POP_MS (a absorção do EAT).
import {Container,Sprite,Graphics,BitmapText,BitmapFont,Cache,MeshPlane} from "pixi.js";
import {ensureAvatar,avatarBitmap,avatarKey} from "../../../theme/avatars.js";
import {ensureFace,faceBitmap,faceKey,faceFile} from "../../../theme/faces.js";
import {PIECE_FLAG,mergeTicks,rectHas} from "@warspace/shared";
import {colorOf,dashPolyline,seedUnit} from "../../util.js";
import {paintTalk,paintNameBand} from "../../../theme/util.js";

const FS=48,CHARS=[[" ","~"],["¡","ÿ"],["Ā","ž"],"✓◆✦•–—…"],TRAIL_MAX=12,TRAIL_MIN_V=72,POP_MS=280,POP_AMP=.22;
// ── BLOB (borda de gelatina, estilo agar.io) ──
// O corpo vira uma malha em grade com a MESMA textura assada: deslocando os vértices radialmente, a borda ondula
// e a arte (contorno e anel da skin, que estão pintados no bitmap) acompanha. O squash estica a malha na direção
// do movimento — sem girar a arte, porque a deformação é feita nos vértices, não no transform.
// A amplitude é PEQUENA de propósito (WOB_AMP ≈ 2% do raio, com peso r⁴): é a beirada respirando, não gelatina.
// Cada malha é um draw call próprio (o sprite entrava num batch), então só as maiores da tela viram blob:
// WOB_MAX por frame, acima de WOB_MIN_PX na tela, e nada disso no modo econômico ou com "menos movimento".
const WOB_N=9,WOB_MIN_PX=15,WOB_MAX=16,WOB_AMP=.018,WOB_LOBES=[3,5],WOB_SPD=[1.7,2.6],SQUASH_K=.06,SQUASH_V=360;
// ── "ESTÁ FALANDO" (push-to-talk) ──
// Sprite de tamanho CONSTANTE EM TELA (dividido por cam.scale, como a seta de ameaça em layers/Threat.js):
// é um aviso de interface, não um objeto do mundo — encolher com o zoom o tornaria invisível justo no
// planetão. Só na MAIOR peça do dono: com 16 pedaços, 16 ícones viram confete.
const TALK_TEX=96,TALK_PX=26,TALK_GAP=.34;
// ── O NOME: no CENTRO do disco ──
// Ele já foi para o rodapé, com uma tarja escura por trás, porque no centro caía em cima do nariz das
// caricaturas. Ficou pior: um planeta com o nome pendurado embaixo lê como legenda de foto, não como um
// planeta que se chama assim. O que resolve o rosto é a LETRA, não a posição — `nameFill` translúcido com
// contorno opaco deixa a arte aparecer por dentro dela —, então o nome voltou ao meio e a tarja saiu
// (`bandAlpha:0` nos três temas; BAND_TEX fica, para quem quiser a legenda de volta um dia).
// As outras duas correções daquela passagem CONTINUAM, e são independentes de onde o nome fica:
//  · NAME_MIN_PX: piso em PIXELS DE DEVICE (px de CSS × R.res). O único piso era de raio de MUNDO (labels.minR=13) e, com a câmera
//    afastada, o nome saía com 4-6 px — sujeira ilegível em cima da arte, e pior ainda com 16 lascas na tela;
//  · nameFitK: o texto passa a CABER no disco. `size` dava 0,34·r, e um nick de 10 letras já pedia ~1,87·r —
//    por isso o nome encostava nas duas bordas. ⚠️ O fator é FROUXO (.92, quase o diâmetro inteiro) por um
//    motivo medido: com .74 um nick de 13 letras num planeta de r=54 era espremido a 9 px de tela e sumia —
//    trocava um defeito por outro. Aperta só quem realmente transborda, e nick curto nunca encolhe.
const BAND_TEX=128,NAME_MIN_PX=10;
export function createPlanets(R){
  const root=new Container();root.sortableChildren=true;const trails=new Graphics();
  const views=new Map(),trailMap=new Map(),seg=[],counts=new Map(),maior=new Map(),pops=new Map();let frame=0,fontName="",lastTrailTick=-1;
  function setTheme(){const th=R.theme,L=th.hud.labels;fontName=`pn3-${th.id}`;
    const sw=L.strokeWidth(FS);
    // fonte fica instalada por tema (nome inclui o id): desinstalar quebra BitmapTexts de outra instância (StrictMode)
    // skipKerning é OBRIGATÓRIO aqui: o kerning do Pixi é O(n²) sobre o charset (≈324 glifos → ~210 mil measureText,
    // num tick só) — era ele que congelava a tela na primeira vez que cada tema aparecia. O nome é curto e
    // centralizado, então o espaçamento sem kerning não muda nada na prática.
    if(!Cache.has(fontName+"-bitmap"))
      // O FILL é translúcido (labels.nameFill) e o CONTORNO é opaco: a forma da letra continua nítida e a
      // arte da caricatura aparece por dentro dela. Vem de um campo PRÓPRIO, e não de `nameColor`, porque
      // `nameColor` também pinta o ícone de push-to-talk logo abaixo — mexer num só desbotaria os dois.
      // ⚠️ O atlas é cacheado pelo NOME (`pn3-`): mudar o estilo sem mudar o nome reaproveita o antigo.
      BitmapFont.install({name:fontName,skipKerning:true,style:{fontFamily:L.font,fontSize:FS,fontWeight:"bold",fill:L.nameFill||L.nameColor,stroke:{color:L.stroke,width:sw,join:"round"}},chars:CHARS,resolution:1,padding:Math.ceil(sw)+2});
    for(const v of views.values())v.name.style.fontFamily=fontName;}
  function mkView(id){const c=new Container(),body=new Sprite();body.anchor.set(.5);const gfx=new Graphics();
    const name=new BitmapText({text:"",style:{fontFamily:fontName,fontSize:FS}});name.anchor.set(.5);
    c.addChild(body,gfx,name);root.addChild(c);
    return{c,body,gfx,name,talk:null,band:null,mesh:null,phase:seedUnit(id)*6.2832,lastName:null,nameW:0,f:0};}
  /** Ícone de voz desta peça (criado só quando ela fala pela primeira vez). */
  function talkOf(v,tex){let t=v.talk;
    if(!t){t=new Sprite();t.anchor.set(.5);v.talk=t;v.c.addChild(t);}
    if(t.texture!==tex)t.texture=tex;
    return t;}
  /**
   * Faixa do nome desta peça (criada na 1ª vez que ela mostra o nome).
   * ⚠️ Entra ABAIXO do texto: `addChildAt` no índice do próprio nome, senão a faixa cobriria a legenda que
   * ela existe para dar chão. A ordem final por peça é [malha] corpo · gfx · faixa · nome.
   */
  function bandOf(v,tex){let b=v.band;
    if(!b){b=new Sprite();b.anchor.set(.5);v.band=b;v.c.addChildAt(b,v.c.getChildIndex(v.name));}
    if(b.texture!==tex)b.texture=tex;
    return b;}
  /** Malha do blob desta peça (criada na primeira vez que ela fica grande o bastante). */
  function meshOf(v,tex){let m=v.mesh;
    if(!m){m=new MeshPlane({texture:tex,verticesX:WOB_N,verticesY:WOB_N});v.mesh=m;v.c.addChildAt(m,0);}
    else if(m.texture!==tex)m.texture=tex;
    return m;}
  /**
   * Reescreve os vértices da malha: ondulação radial na borda (duas senóides defasadas por peça) + squash na
   * direção do movimento. `sx/sy` é o "gulp" de quem acabou de engolir, aplicado como escala do próprio nó.
   */
  function deform(m,v,e,d,t,sx,sy){
    const pos=m.geometry.positions,n=WOB_N,ph=v.phase;
    const vx=e.vx||0,vy=e.vy||0,sp=Math.hypot(vx,vy);
    let ux=1,uy=0,st=0;
    if(sp>1){ux=vx/sp;uy=vy/sp;st=Math.min(1,sp/SQUASH_V)*SQUASH_K;}
    const ts=t*.001,a1=ph+ts*WOB_SPD[0],a2=-ph*1.3+ts*WOB_SPD[1];   // t vem em ms (performance.now)
    for(let j=0,k=0;j<n;j++)for(let i=0;i<n;i++,k+=2){
      const u=i/(n-1)*2-1,w=j/(n-1)*2-1;let x=u*d,y=w*d;
      const rad=Math.sqrt(u*u+w*w);
      if(rad>1e-4){const ang=Math.atan2(w,u),r2=rad>1?1:rad*rad,edge=r2*r2;   // r⁴: o disco fica firme, só a beirada respira
        const k2=1+WOB_AMP*(Math.sin(ang*WOB_LOBES[0]+a1)+.6*Math.sin(ang*WOB_LOBES[1]+a2))*edge;
        x*=k2;y*=k2;}
      const pr=(x*ux+y*uy)*(1+st),pp=(y*ux-x*uy)*(1-st*.6);   // estica no eixo do movimento, comprime no outro
      pos[k]=pr*ux-pp*uy;pos[k+1]=pr*uy+pp*ux;}
    m.geometry.getBuffer("aPosition").update();
    m.scale.set(sx,sy);}
  return{root,trails,setTheme,
    /** Marca o "engoliu!" da peça `id` (começa daqui a `delay` ms, o mesmo atraso do efeito de terceiros). */
    pop(id,delay=0){pops.set(id,performance.now()+(delay||0));},
    render(f){frame++;const th=R.theme,TX=th.textures,L=th.hud.labels,cell=th.hud.cell,view=f.view,rect=f.rect,rt=f.rt,t=f.t;
      const showNames=f.showNames,PK=TX.scale.planet;
      const cam=f.cam,wob=f.wobble!==false&&!R.econ&&R.mesh;let blobs=0;   // `R.mesh`: sem o pipe de malha (canvas 2D) o blob faz o render LANÇAR — ver Renderer.js
      
      counts.clear();maior.clear();
      // view.pieces vem ordenado por raio CRESCENTE, então o último gravado por dono é a maior peça dele
      for(const e of view.pieces){counts.set(e.owner,(counts.get(e.owner)||0)+1);maior.set(e.owner,e.id);}
      const trailTick=Math.floor(rt/2),trailStep=trailTick!==lastTrailTick;lastTrailTick=trailTick;
      let idx=0;
      for(const e of view.pieces){const isMe=!!e.isMe,pl=view.playerOf(e.owner),skin=pl?pl.skin:null;if(!skin)continue;
        // trilha (antes do culling: rastro continua fora da tela)
        let tr=trailMap.get(e.id);if(!tr){tr={pts:[],f:0,skin,isMe,r:e.rr,x:e.rx,y:e.ry};trailMap.set(e.id,tr);}tr.f=frame;tr.r=e.rr;tr.x=e.rx;tr.y=e.ry;tr.skin=skin;tr.isMe=isMe;
        if(trailStep){const sp=Math.hypot(e.vx||0,e.vy||0);if(sp>TRAIL_MIN_V)tr.pts.push({x:e.rx,y:e.ry});else if(tr.pts.length)tr.pts.shift();if(tr.pts.length>TRAIL_MAX)tr.pts.shift();}
        let v=views.get(e.id);if(!v){v=mkView(e.id);views.set(e.id,v);}v.f=frame;
        if(!rectHas(rect,e.rx,e.ry,e.rr*2.4)){v.c.visible=false;continue;}v.c.visible=true;v.c.zIndex=idx++;v.c.position.set(e.rx,e.ry);v.c.alpha=e.alpha;
        // FOTO do jogador (skin "Retrato"): a versão entra na chave, então enquanto o bitmap não chega o
        // planeta é assado com a silhueta e, quando chega, a chave muda e a textura nova sai sozinha.
        const av=pl&&pl.avatar?pl.avatar:null;if(av)ensureAvatar(av);
        const avV=av?avatarKey(av):null,avBmp=av?avatarBitmap(av):null;
        // a caricatura do easter egg: mesmo caminho da foto, só que a arte é estática e vem do /faces
        // ⚠️ `faceFile(skin)` e NÃO `skin.face`: no pacote de portal as caricaturas são cortadas, e o
        // campo do catálogo continua lá. Quem sabe disso é `faceFile` — e é por isso que o nome do
        // planeta, lá embaixo, pergunta a MESMA coisa: com o rosto cortado, o disco liso tem que voltar
        // a ter nome, senão o corte transforma 35 skins em planetas anônimos.
        const fc=faceFile(skin);if(fc)ensureFace(skin);
        const fcBmp=fc?faceBitmap(skin):null;
        // ⚠️ `R.texCap` é o teto de tier do modo econômico: `TX.tier` é função só do RAIO, então no nível
        // mínimo (res .6) o planetão continuava assando e segurando 512² ≈ 1,34 MB para uma tela que está
        // desenhando com pouco mais da metade dos pixels.
        const size=Math.min(TX.tier(e.rr),R.texCap),tex=R.cache.get(TX.key("planet",{skin,isMe,avatar:avBmp?avV:null,face:faceKey(skin)},size),size,
          (c,s)=>TX.planet(c,s,{skin,isMe,avatarBmp:avBmp,faceBmp:fcBmp}));
        const d=e.rr*PK(skin);let sx=1,sy=1;const pat=pops.get(e.id);   // gulp da absorção: incha e achata de leve
        if(pat!=null){const age=t-pat;if(age>POP_MS)pops.delete(e.id);else if(age>=0){const u=Math.sin(age/POP_MS*Math.PI);sx=1+POP_AMP*u;sy=1-POP_AMP*.35*u;}}
        if(wob&&blobs<WOB_MAX&&e.rr*cam.scale>=WOB_MIN_PX){blobs++;   // as maiores da tela viram gelatina (view.pieces vem ordenado por raio)
          const m=meshOf(v,tex);m.visible=true;v.body.visible=false;deform(m,v,e,d,t,sx,sy);}
        else{if(v.mesh)v.mesh.visible=false;v.body.visible=true;v.body.texture=tex;v.body.width=d*2*sx;v.body.height=d*2*sy;}
        // rótulos
        // ⚠️ NA CARICATURA O NOME NÃO SAI. O rótulo mora no CENTRO do disco (`labels.nameY:()=>0` nos três
        // temas), que nas 35 skins de easter egg é exatamente onde ficam o nariz e a boca: o Trump perdia a
        // boca e o Ronaldinho o sorriso, justo a parte pela qual a ilustração existe. A caricatura JÁ diz
        // quem é o jogador, e quem ela não identifica continua tendo o nome no placar, no chat, no kill feed
        // e no mapa grande da tela de morte — o planeta nunca fica anônimo, só o rosto fica limpo.
        // O predicado é `faceFile(skin)` (o mesmo que escolhe a textura, acima), e NÃO `rarity==="secret"`:
        // as skins 45–48 também são secretas e são `pattern:"plain"` — pela raridade, quatro skins sem rosto
        // nenhum perderiam o nome de graça. Nem é `pl.avatar`: a skin Retrato é a foto do PRÓPRIO jogador e
        // fica com o nome, por decisão.
        const fs=L.size(e.rr);
        // ⚠️ O piso é medido em px de DEVICE (`* R.res`), não de CSS. O nome é rasterizado no framebuffer
        // e depois AMPLIADO pelo compositor até o tamanho físico da tela — no modo econômico essa
        // ampliação chega a 2×, e um "em" de 10 px de CSS vira 5 px de verdade, com o contorno (11% do em)
        // em meio pixel. Medindo na unidade certa, o nome SOME quando não caberia legível em vez de virar
        // mancha em cima da arte, que é literalmente o que este piso existe para evitar.
        const lab=e.rr>L.minR&&showNames&&fs*cam.scale*R.res>=NAME_MIN_PX&&!fc;v.name.visible=lab;
        if(lab){const nm=pl.name;
          // A largura é medida UMA vez por nome, com a escala forçada a 1. ⚠️ Medir sem zerar a escala lê a
          // largura já escalada do frame anterior, e aí o texto encolhe a cada quadro até sumir — em silêncio.
          if(v.lastName!==nm){v.lastName=nm;v.name.scale.set(1);v.name.text=nm;v.nameW=v.name.width;}
          const fit=v.nameW>0?(e.rr*2*(L.nameFitK||.74))/v.nameW:1;
          v.name.scale.set(Math.min(fs/FS,fit));v.name.y=L.nameY(fs,e.rr);
          if(L.bandAlpha>0){   // com o nome no centro não há tarja: ela existia para o rodapé (ver theme/*/index.js)
            const bt=R.cache.get(`band|${th.id}`,BAND_TEX,(c,s2)=>paintNameBand(c,s2,{ink:L.stroke,alpha:L.bandAlpha,top:L.bandTop}));
            const bd=bandOf(v,bt);bd.visible=true;bd.width=bd.height=e.rr*2;}
          else if(v.band)v.band.visible=false;}
        else if(v.band)v.band.visible=false;
        // ícone de "está falando" (push-to-talk), acima do planeta
        if(view.talkingNow(pl)&&maior.get(e.owner)===e.id){
          const tex=R.cache.get(`talk|${th.id}`,TALK_TEX,(c,s2)=>paintTalk(c,s2,{fill:L.nameColor,stroke:L.stroke}));
          const tk=talkOf(v,tex),px=TALK_PX/cam.scale;
          tk.visible=true;tk.width=tk.height=px;tk.y=-(e.rr+px*(.5+TALK_GAP));}
        else if(v.talk)v.talk.visible=false;
        // arco de merge + anéis de powerup
        const g=v.gfx;g.clear();let drew=false;const n=counts.get(e.owner)||1;
        if(n>1&&!(e.flags&PIECE_FLAG.MERGING)){const t0=e.firstTick!=null?e.firstTick:e.createdTick,prog=t0!=null?Math.min(1,Math.max(0,(rt-t0)/mergeTicks(e.rr))):1;
          if(prog<1){const m=cell.merge,col=colorOf(m.color);g.arc(0,0,e.rr*m.radiusK,-1.5708,-1.5708+prog*6.2832);g.stroke({width:m.width(e.rr),color:col.c,alpha:col.a,cap:"round"});drew=true;}}
        // ── ESCUDO E ÍMÃ: BORDA NEON, não anel girando ──
        // Eram arcos TRACEJADOS girando em volta do planeta (`dashArc` + `pw.spin`), e no nível 3 um SEGUNDO
        // anel atrás do primeiro — dois círculos rodando em sentidos opostos em cima da arte da skin. Cada
        // um era legível sozinho; empilhados viravam ruído, e num planetão o aro passava a impressão de ser
        // outro corpo em órbita. Agora é uma borda contínua colada na peça: traço largo e translúcido por
        // fora (o "vidro" do neon) e um fio saturado por dentro (o tubo). Não gira, não pisca — só respira.
        // Quem identifica é a COR, e é ela que muda com o nível do escudo.
        const fl=e.flags,pws=[];if(fl&PIECE_FLAG.MAGNET)pws.push("magnet");if(fl&PIECE_FLAG.SHIELD)pws.push("shield");const lv=(fl>>PIECE_FLAG.SHIELD_LV_SHIFT)&3;
        if(pws.length){const pw=cell.powerups,LV=pw.shieldLevels;pws.forEach((k,i)=>{
          const sl=k==="shield"&&LV?LV[Math.min(LV.length,Math.max(1,lv))-1]:null;
          const col=colorOf(sl?sl.color:pw.colors[k]),rr=pw.ringR(e.rr,i),al0=sl?sl.alpha:pw.alpha;
          const al=al0[0]+(al0[1]-al0[0])*(.5+.5*Math.sin(t*(sl?sl.pulse:pw.pulse)+i)),wd=pw.width(e.rr)*(sl?sl.widthK:1);
          g.circle(0,0,rr);g.stroke({width:wd*2.6,color:col.c,alpha:col.a*al*.22});   // o brilho
          g.circle(0,0,rr);g.stroke({width:wd,color:col.c,alpha:col.a*al});           // o tubo
          if(k==="magnet"&&R.ambient)R.ambient("magnet",{x:e.rx,y:e.ry,r:e.rr});});drew=true;}
        g.visible=drew;}
      for(const [id,v] of views)if(v.f!==frame){v.c.destroy({children:true});views.delete(id);pops.delete(id);}   // o mesh é filho do container: destroy({children}) leva junto
      // trilhas
      trails.clear();const TR=th.hud.trail;
      for(const [id,tr] of trailMap){if(tr.f!==frame){trailMap.delete(id);continue;}if(tr.pts.length<2||!f.showTrails)continue;
        if(!rectHas(rect,tr.x,tr.y,600))continue;const col=colorOf(TR.color(tr.skin,tr.isMe)),w=TR.width(tr.r);
        const pts=tr.pts.concat([{x:tr.x,y:tr.y}]);
        if(TR.style==="dashed"&&TR.dash){dashPolyline(pts,TR.dash(tr.r),seg);for(let i=0;i<seg.length;i+=4){trails.moveTo(seg[i],seg[i+1]);trails.lineTo(seg[i+2],seg[i+3]);}}
        else{trails.moveTo(pts[0].x,pts[0].y);for(let i=1;i<pts.length;i++)trails.lineTo(pts[i].x,pts[i].y);}
        trails.stroke({width:w,color:col.c,alpha:col.a,cap:"round",join:"round"});}},
    count(){return views.size;},
    destroy(){root.destroy({children:true});trails.destroy();views.clear();trailMap.clear();maior.clear();pops.clear();},
  };}

