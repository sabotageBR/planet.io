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
import {paintTalk,paintCrown,paintNameBand} from "../../../theme/util.js";
import {ordemDeTiers} from "../TextureCache.js";
import {perf} from "../../perf.js";
import {anelDeRisco} from "../../guia.js";

// ── O ANEL DO NOVATO (`f.risco`, game/guia.js `anelDeRisco`) ──
// Verde LISO em volta do que eu como, vermelho COM PONTAS em volta do que me come — as pontas não são enfeite:
// verde e vermelho são o par que some em protanopia, e a forma diz o que a cor não diz a quem não a vê.
// Tamanho CONSTANTE EM TELA (`s = 1/cam.scale`, a conta da seta de rumo): num planetão afastado um anel de
// mundo sumiria, e num novato aproximado viraria um pneu. Cores FIXAS, não do tema: é informação de jogo e
// tem de ler igual nos três céus — quem a separa do fundo é a TINTA escura por baixo.
const RISCO={comivel:0x3ddc5f,perigo:0xff4d4d,tinta:0x141026,PONTAS:8};

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
// ── A COROA DO MAIOR DO MAPA ──
// Mesma família do ícone acima, e pelo mesmo motivo: é ESTADO DE JOGO desenhado no objeto, não um rótulo.
// Tamanho CONSTANTE EM TELA (dividido por cam.scale, como o alto-falante e a seta de rumo) — encolher com
// o zoom a apagaria justo no planetão, que é quem mais provavelmente a está usando.
// ⚠️ 30 px de caixa dão ~26×19 px de coroa VISÍVEL, ou seja MENOS que os 26×26 do alto-falante que já mora
// ali. É isso que "discreta" quer dizer aqui: o tamanho e o não-animar, nunca a transparência — coroa
// translúcida sobre arte é o que SOME, não o que fica discreto.
// `MAX_K` impede que ela fique maior que o próprio planeta (numa sala recém-aberta o "líder" pode ter
// r=30); `MIN_PX` a apaga quando cada ponta cairia abaixo de ~5 px e a silhueta vira borrão — mesmo
// argumento do NAME_MIN_PX. `SINK` é o quanto a base afunda no disco: ela se APOIA no aro em vez de
// flutuar acima dele (o pedido é "na cabeça"), e isso ainda absorve a ondulação do blob.
const CROWN_TEX=96,CROWN_PX=30,CROWN_SINK=.10,CROWN_MAX_K=.9,CROWN_MIN_PX=20,CROWN_BASE=.252;
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
// ⚠️ `NAME_MIN_PX` acompanhou o `size` (10 → 11) para o CONJUNTO de planetas com nome não mudar: o piso é
// do RESULTADO (`fs*cam.scale*R.res`, px de DEVICE), não da fonte, e com o corpo 15% maior deixá-lo em 10
// faria o nome aparecer em planeta ~13% menor — justo onde o contorno mais grosso fecha as letras. Com 11
// o limiar cai só ~5% e o ganho do pedido vai todo para o TAMANHO, que é o que foi pedido.
const BAND_TEX=128,NAME_MIN_PX=11;
// ── A FONTE DOS NOMES, UMA POR TEMA — E INSTALADA FORA DA PARTIDA ─────────────────────────────────────
// ⚠️ O NOME DO ATLAS É A CHAVE DO CACHE, e ele TEM que mudar quando `nameFill`/`strokeWidth` mudam: os
// dois são assados DENTRO do BitmapFont, e a instalação é pulada por `Cache.has(nome+'-bitmap')`.
// Em produção a página é nova e o atlas seria regerado de qualquer jeito — quem paga é o DEV: com o HMR
// do Vite o módulo recarrega com os números novos e o Pixi devolve o atlas VELHO, então a mudança "não
// funciona" e alguém vai atrás do bug errado. pn3 → pn4 na passada que mexeu na letra.
const nomeDaFonte=th=>`pn4-${th.id}`;
/**
 * Instala a fonte bitmap de um tema (no-op se já existe). Devolve true quando instalou de verdade.
 *
 * ⚠️ ISTO MORAVA DENTRO DO `setTheme`, e era um engasgo com hora marcada: rasterizar ~324 glifos e montar o
 * atlas são 10–40 ms SÍNCRONOS, pagos na primeira vez que cada tema aparece — ou seja NO MEIO DA PARTIDA,
 * em cada virada de céu (o relógio do espaço troca de tema várias vezes por rodada), e o `prewarmTheme`
 * aquecia céu, atlas e planetas mas NÃO a fonte. Agora quem instala é o boot (`Renderer.warmFonts`, uma por
 * momento ocioso) e a entrada na sala garante o que faltar (`flushFonts`); o `setTheme` continua chamando
 * isto como rede de segurança, e em regime normal cai no `Cache.has`.
 * ⚠️ `--font-ui` NÃO é webfont (só a display é): a fonte já existe no boot, então instalar cedo não assa o
 * atlas com a fonte errada.
 */
export function instalaFonte(th){const nome=nomeDaFonte(th);if(Cache.has(nome+"-bitmap"))return false;
  const L=th.hud.labels,sw=L.strokeWidth(FS);
  perf.ini("fonte");
  // skipKerning é OBRIGATÓRIO aqui: o kerning do Pixi é O(n²) sobre o charset (≈324 glifos → ~210 mil measureText,
  // num tick só) — era ele que congelava a tela na primeira vez que cada tema aparecia. O nome é curto e
  // centralizado, então o espaçamento sem kerning não muda nada na prática.
  // O FILL é translúcido (labels.nameFill) e o CONTORNO é opaco: a forma da letra continua nítida e a
  // arte da caricatura aparece por dentro dela. Vem de um campo PRÓPRIO, e não de `nameColor`, porque
  // `nameColor` também pinta o ícone de push-to-talk logo abaixo — mexer num só desbotaria os dois.
  BitmapFont.install({name:nome,skipKerning:true,style:{fontFamily:L.font,fontSize:FS,fontWeight:"bold",fill:L.nameFill||L.nameColor,stroke:{color:L.stroke,width:sw,join:"round"}},chars:CHARS,resolution:1,padding:Math.ceil(sw)+2});
  perf.fim("fonte");return true;}
export function createPlanets(R){
  const root=new Container();root.sortableChildren=true;const trails=new Graphics();
  const views=new Map(),trailMap=new Map(),seg=[],counts=new Map(),maior=new Map(),pops=new Map();let frame=0,fontName="",lastTrailTick=-1;
  function setTheme(){const th=R.theme;
    // fonte fica instalada por tema (nome inclui o id): desinstalar quebra BitmapTexts de outra instância (StrictMode).
    // Em regime normal isto é um `Cache.has` — quem instalou foi o boot (ver `instalaFonte`).
    fontName=nomeDaFonte(th);instalaFonte(th);
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
  /** Coroa desta peça (criada só quando ela vira líder pela primeira vez) — gêmea de `talkOf`. */
  function crownOf(v,tex){let t=v.crown;
    if(!t){t=new Sprite();t.anchor.set(.5);v.crown=t;v.c.addChild(t);}
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
        // ── A TEXTURA, SEM ASSAR NO MEIO DO FRAME ──────────────────────────────────────────────────
        // Era `R.cache.get(TX.key(…),size,draw)` cru, por peça por frame: (1) montava um objeto, uma STRING e
        // uma closure por peça por frame — ~18 mil alocações por segundo numa sala cheia, para quase sempre
        // achar a mesma chave do frame anterior; e (2) no MISS assava SÍNCRONO, aqui dentro: um tier 512 são
        // 4–12 ms (canvas de 1 MB + padrão procedural + mipmaps + upload), e o orçamento do cache só vale
        // para a FILA. O MISS acontece o tempo todo em partida: todo planeta que cruza r=44 ou r=120 muda de
        // tier, a arte da caricatura chega e muda a chave, o nível econômico muda o `texCap`, o tema vira.
        // Agora a chave é memoizada na view, e no MISS a ordem é: o que ESTA view já mostrava → outro tier da
        // mesma skin → só então assar na hora (não há nada que sirva: é a 1ª vez que a skin aparece). O tier
        // certo entra na FRENTE da fila e troca sozinho 1–2 frames depois — ninguém vê um planeta 2× maior ou
        // menor que a textura por dois frames; um frame de 12 ms a mais, todo mundo vê.
        // ⚠️ Sempre re-pedir pela CHAVE (`peek` carimba), nunca guardar a textura: é o contrato da eviction.
        const size=Math.min(TX.tier(e.rr),R.texCap),avK=avBmp?avV:null,fK=faceKey(skin);
        if(v.kSkin!==skin||v.kMe!==isMe||v.kAv!==avK||v.kFace!==fK||v.kSize!==size||v.kTema!==th.id){
          v.kSkin=skin;v.kMe=isMe;v.kAv=avK;v.kFace=fK;v.kSize=size;v.kTema=th.id;
          v.key=TX.key("planet",{skin,isMe,avatar:avK,face:fK},size);}
        let tex=R.cache.peek(v.key);
        if(tex)v.shownKey=v.key;
        else{const draw=(c,s)=>TX.planet(c,s,{skin,isMe,avatarBmp:avBmp,faceBmp:fcBmp});
          let alt=v.shownKey&&v.shownKey!==v.key?R.cache.peek(v.shownKey):null;
          if(!alt)for(const s2 of ordemDeTiers(size)){alt=R.cache.peek(TX.key("planet",{skin,isMe,avatar:avK,face:fK},s2));if(alt)break;}
          if(alt){R.cache.warm(v.key,size,draw,true);tex=alt;}
          else{tex=R.cache.get(v.key,size,draw);v.shownKey=v.key;}}
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
        // ── A COROA: o maior do mapa, na maior peça dele ──
        // O gate é o MESMO do alto-falante (`maior.get`), pelo mesmo motivo escrito lá: com 16 pedaços, 16
        // coroas viram confete. Quem é o líder vem de `view.leaderSlot` (LEADERBOARD a 2 Hz, todos os
        // vivos, fora da AOI, com histerese de 2%) — nenhum byte novo de protocolo.
        // ⚠️ ELA APARECE NO MEU PRÓPRIO PLANETA quando eu sou o líder, e isso não é vaidade: é a única
        // coisa na tela que me diz o que TODO MUNDO está vendo sobre mim — que eu sou o alvo. O "1º" do
        // HUD é um número no canto, e no celular EM PÉ o placar inteiro recolhe num chip.
        // ⚠️ Ela NÃO obedece ao modo econômico nem a `reduceMotion`, e não é descuido: não anima, custa UM
        // sprite e UMA textura (só existe um líder), e esconder QUEM ESTÁ GANHANDO num aparelho fraco é
        // amarrar informação de jogo ao hardware. Também não obedece a `showNames`: não é rótulo.
        let coroaPx=0;
        if(view.leaderSlot===e.owner&&maior.get(e.owner)===e.id){
          const px=Math.min(CROWN_PX/cam.scale,e.rr*2*CROWN_MAX_K);
          if(px*cam.scale>=CROWN_MIN_PX){
            const tex=R.cache.get(`crown|${th.id}`,CROWN_TEX,(c,s2)=>paintCrown(c,s2,{fill:L.crown,stroke:L.stroke}));
            const cr=crownOf(v,tex);coroaPx=px;
            cr.visible=true;cr.width=cr.height=px;
            // a BASE do desenho (CROWN_BASE do lado, abaixo do centro do sprite) pousa CROWN_SINK dentro do
            // aro: daí o sinal do termo, e daí ela acompanhar o RAIO em vez de uma folga fixa
            cr.y=-(e.rr+px*(CROWN_BASE-CROWN_SINK));}
          else if(v.crown)v.crown.visible=false;}
        else if(v.crown)v.crown.visible=false;
        if(view.talkingNow(pl)&&maior.get(e.owner)===e.id){
          const tex=R.cache.get(`talk|${th.id}`,TALK_TEX,(c,s2)=>paintTalk(c,s2,{fill:L.nameColor,stroke:L.stroke}));
          const tk=talkOf(v,tex),px=TALK_PX/cam.scale;
          // com coroa no ar o alto-falante SOBE a altura dela: os dois moram no mesmo lugar acima do
          // planeta e podem estar ativos ao mesmo tempo — o líder falando é o caso mais provável de todos
          tk.visible=true;tk.width=tk.height=px;tk.y=-(e.rr+coroaPx*.62+px*(.5+TALK_GAP));}
        else if(v.talk)v.talk.visible=false;
        // arco de merge + anéis de powerup
        const g=v.gfx;g.clear();let drew=false;const n=counts.get(e.owner)||1;
        if(f.risco&&!isMe&&!(pl&&pl.ally)){const k=anelDeRisco(e.rr,f.risco);
          if(k){const s=1/(cam&&cam.scale||1),rr=e.rr+5*s,cor=RISCO[k];
            g.circle(0,0,rr);g.stroke({width:6*s,color:RISCO.tinta,alpha:.35});
            g.circle(0,0,rr);g.stroke({width:3*s,color:cor,alpha:.95});
            if(k==="perigo"){const h=7*s,b=.16,N=RISCO.PONTAS;   // as pontas, para fora, paradas
              for(let i=0;i<N;i++){const a=i*6.2832/N,ca=Math.cos(a),sa=Math.sin(a),cb=Math.cos(a-b),sb=Math.sin(a-b),cc=Math.cos(a+b),sc=Math.sin(a+b),r0=rr+1.5*s;
                g.poly([cb*r0,sb*r0,ca*(r0+h),sa*(r0+h),cc*r0,sc*r0],true);g.fill({color:cor,alpha:.95});}}
            drew=true;}}
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

