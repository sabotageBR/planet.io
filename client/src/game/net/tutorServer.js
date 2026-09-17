// ── O TUTORIAL DE ESTREIA: O DIRETOR ──────────────────────────────────────────
// O único módulo que toca no `World` do tutorial. Ele monta a cena de cada etapa, lê os eventos do tick,
// pergunta à máquina pura (`game/tutor.js`) em que pé estamos e manda o estado ao cliente.
//
// ⚠️ Ele é INJETADO no `LocalServer` (`createLocalServer({mundo, roteiro})`), que não conhece tutorial
// nenhum: só chama `nasce()` no spawn e `passo()` depois do `w.step()`. Com `roteiro:null` aquele arquivo
// se comporta byte a byte como sempre — e é isso que faz `?local=1` e `?bench` continuarem provando que
// nada quebrou.
// ⚠️ O RELÓGIO É O DO MUNDO (`w.tick`), nunca `performance.now()`. O render pode estar congelado — pausa
// da plataforma, contexto WebGL perdido, aba escondida — com o mundo andando, e o inverso também. Um
// tutorial que avança por relógio de parede quebra nos dois casos, em silêncio.
// ⚠️ NADA AQUI ENTRA EM `shared/physics`. As travas do novato (a graça, o portão do split, a carência do
// tiro) continuam de pé no servidor de verdade; o que o tutorial faz é o que o modo `bench` já fazia —
// MUTAR o mundo local depois de criado.
// @ts-check
import {STAR,SPLIT,MISSILE,PLAYER,BOT,POWERUP,WEAPON,TICK_HZ,SKINS,clamp} from "@warspace/shared";
import {STAR_PHASE} from "@warspace/shared/protocol/constants.js";
import {setR} from "@warspace/shared/physics/body.js";
import {applyFire,supernova} from "@warspace/shared/physics/rules.js";
import {passoTutor,TUTOR0,ETAPA} from "../tutor.js";

/**
 * As opções do `createLocalServer` para o tutorial.
 *
 * ⚠️ `mundo` é o que finalmente PODE esvaziar o mundo: `stars`/`asteroids` nunca eram repassados ao
 * `createWorld` e caíam nos defaults (19 estrelas, 58 asteroides). Com os quatro zerados, os laços de
 * semeadura não rodam e a fase 11 do `step` fica inerte — mundo 100% autoral.
 * ⚠️ `decay:false` porque o tutorial tem pausas de leitura e o `PLAYER.DECAY` comeria massa de quem está
 * parado entendendo a instrução. Não é risco de tempo (de 9.080 a 6.000 são 207 s contra ~80 de
 * tutorial), é higiene: a massa que a etapa 1 entregou não pode escorrer entre uma etapa e outra.
 * ⚠️ `roundTicks:0` = SEM FIM. O tutorial acaba pelo roteiro, nunca por tempo.
 */
export const OPCOES_TUTORIAL={seed:7,bots:0,food:0,roundTicks:0,code:"0TUT",
  // ⚠️ **A ARENA É UM QUADRADINHO — mas 1.200 px era PEQUENO DEMAIS, e o preço foi a tela inteira.**
  // O mundo do jogo tem 12.000 px de lado e num tutorial aquilo é um vazio sem beira; o erro foi corrigir
  // isso sem olhar o PISO da câmera. `shared/camera.js` nunca afasta além de mostrar o mundo inteiro, e
  // `zoomFor` mantém ~1920×1080 px de MUNDO visíveis em qualquer tela — num mundo de 1.200 esses 1920 não
  // cabem, então o piso vira um TETO e a câmera é forçada a AMPLIAR. Medido em produção, numa janela de
  // 1854×871: escala **1,545** e apenas **564 px de mundo na vertical** (±282 do centro), contra uma
  // coreografia que planta tudo a 300 px. Ou seja: no desktop o alvo da etapa 2 e a presa da etapa 3
  // nasciam FORA DO ENQUADRAMENTO, e o tutorial mandava atirar em algo que não estava na tela.
  // Com 1.800 o piso ainda morde um pouco no desktop (escala 1,03), e isso é PROPOSITAL: é o que mantém
  // a arena "um quadradinho" — o planeta grande na tela, a borda tracejada à vista — sem cortar a cena.
  // A conta que decide o número está travada em `client/test/tutor-mundo.test.js`, com o `zoomFor` de
  // verdade sobre as telas da matriz: a meia-altura visível fica em 423 px (desktop) a 900 (retrato),
  // contra os 286 px por eixo que a coreografia diagonal planta com o aluno no teto.
  // ⚠️ O tamanho do mundo NÃO mexe na quantização: `qPos`/`dqPos` usam a constante GLOBAL `WORLD.w` nos
  // dois lados, então um mundo menor só ganha precisão (0,18 px por unidade). E o cliente obedece ao
  // `world:{w,h}` do JSON `room`, que o `LocalServer` já mandava — a grade, a borda e o radar acompanham.
  mundo:{w:1800,h:1800,asteroids:false,holes:0,stars:0,decay:false}};

/**
 * A SKIN DO "OUTRO": o alvo da etapa 2 e a presa da etapa 3 nascem como a TERRA BRAVA.
 *
 * Os três mascotes têm papel fixo no tutorial (ver `ARTE` em `ui/tutorPecas.jsx`): o MARTE é o aluno
 * (`SKIN_TUTORIAL`), a TERRA é o outro e a LUA é quem ensina. Os alvos nasciam com `skinId:0`, um disco
 * liso — e a tela fala em "ATIRE NELE" sem que "ele" tenha cara. Com a Terra, o desenho da instrução
 * (a tirinha do modelo `cena`, o retrato no balão do `sargento`) e o planeta no mundo são O MESMO
 * personagem: é o que deixa uma criança ligar a figura ao alvo sem ler uma palavra.
 * ⚠️ Pelo `mascot`, nunca pelo id cravado, e com o mesmo `?? SKINS[0]` de `SKIN_TUTORIAL`: o import não
 * pode explodir se um dia o mascote sair do catálogo.
 * ⚠️ Skin de mascote não desenha o NOME do planeta por cima da arte (`faceFile`, em `layers/Planets.js`)
 * — aqui isso é bônus: o alvo tinha um apelido sorteado de bot, que num tutorial é só ruído.
 */
const SKIN_ALVO=(SKINS.find(sk=>sk.mascot==="terra")||SKINS[0]).id;

/** A coreografia, num lugar só. Ver o bloco de contas no fim do arquivo. */
export const CENA={
  // ⚠️ **`DIST` É O VÃO ENTRE AS SUPERFÍCIES, não a distância entre os centros.** Medindo de centro a
  // centro, tudo encolhe conforme o aluno cresce: no fim da etapa 1 ele chega a r≈110, o alvo da etapa 2
  // nasce com 1,05× isso, e os 300 px viravam **um vão de 80** — os dois planetas colados, com a lição
  // "atire nele" apontando para algo encostado no jogador. A distância real é `DIST + r_me + r_alvo`.
  DIST:130,
  NOVA_D:290,        // ⚠️ a etapa 1 tem PISO PRÓPRIO de distância, e ele não é gosto: o miolo que
                     // estilhaça vale ~138 px com a estrela já inchada, e um aluno dentro dele é
                     // despedaçado pela primeira coisa que o tutorial faz. 290 dá folga de 2,1×, que é o
                     // que `client/test/tutor-mundo.test.js` cobra — "sobreviveu" não basta como asserção,
                     // porque a primeira versão sobrevivia por 10 px e só com o jogador parado.
  R_MAX:96,          // ⚠️ **E O ALUNO TEM TETO.** Ele come os 24 cacos da supernova E os pedaços que o
                     // míssil arranca do alvo da etapa 2: medido em bancada, chegava a **r=141
                     // (massa 19.900)** — um planeta de 282 px de diâmetro numa cena em que nada mais
                     // cabia. Com 96 ele ainda DOBRA de tamanho (nasce em 63), que é a recompensa da
                     // etapa 1, e a cena continua enquadrável com o alvo INTEIRO dentro da tela — o que
                     // obriga a somar o raio DELE ao envelope, e não só a distância entre os centros.
                     // É massa descartada em silêncio, e num tutorial sem placar isso não tem
                     // consequência; a alternativa era o alvo cortado pela borda, que foi o relatado.
                     // ⚠️ E o teto NUNCA pode ficar abaixo do que a etapa 3 precisa: ele é lido como
                     // `max(R_MAX, SPLIT.MIN_R*SPLIT_K)`, porque `SPLIT.MIN_R` é tunable do /admin e um
                     // teto cravado abaixo dele devolveria o pior defeito possível aqui — o botão
                     // DIVIDIR na tela e o `applySplit` recusando em silêncio.
  ESTRELA_R:24,      // ⚠️ **METADE da `STAR.R` de série**, e é o que faz a explosão caber na arena: o raio
                     // do estouro é `r·NOVA_R`, então uma estrela de 46 solta uma onda de 368 px (644 já
                     // inchada na fase OLD) — mais da metade do mundo do tutorial, e um miolo letal de 290
                     // px contra um jogador que está a 300. Com 24 a onda é de 192 (336 inchada) e o miolo
                     // cai para 86 px. A MASSA dos cacos não muda: ela sai de `EJECT_MASS·NOVA_PART_MASS`,
                     // que não conhece o raio da estrela.
  // ⚠️ **A EXPLOSÃO É A ABERTURA DA CENA, NÃO UM EVENTO NO MEIO DELA.** Ela esperava 2,5 s, e nesses
  // 2,5 s o jogador via uma estrela parada com a instrução "coma os pedaços" e nenhum pedaço na tela —
  // ou seja, a primeira coisa que o tutorial fazia era pedir algo impossível. Hoje o mundo abre, a
  // estrela incha e estoura em 1,1 s, e SÓ ENTÃO a lição de mover começa (o relógio da ajuda é
  // recarimbado no estouro, em `passo`). O inchaço continua telegrafando: explosão sem aviso lê como
  // defeito, e o empurrão que ele leva precisa ter uma causa visível.
  NOVA_ESPERA:66,    // ticks até a estrela estourar (1,1 s)
  NOVA_INCHA:48,     // ticks finais em que ela incha, telegrafando o estouro
  NOVA_SWELL:1.6,    // o quanto ela incha (o inchaço é NOSSO — ver o ⚠️ do `tickStar` abaixo)
  NOVA_TETO:240,     // ⚠️ ...mas ela espera NO MÁXIMO isto (4 s). O adiamento sem teto é um travamento:
                     // o aluno que corre direto para a estrela (448 px/s contra os 300 px que a separam)
                     // ficaria colado nela para sempre, com a etapa 1 nunca abrindo e nada na tela
                     // dizendo por quê. Passado o teto ela estoura de qualquer jeito — o pior caso é ele
                     // ser estilhaçado, que a física garante não ser mortal (`MIN_PIECE_R`).
  NOVA_SAFE:200,     // ⚠️ e ela ESPERA se o jogador estiver mais perto que isto: o miolo que estilhaça é
                     // `blast·NOVA_SHATTER` ≈ 138 px com a estrela já inchada, e a etapa 1 não pode abrir
                     // punindo quem obedeceu à instrução de ir até lá.
  CACO_VIDA:7200,    // ⚠️ os cacos da supernova vivem `NOVA_LIFE_TICKS` = 15 s. Um novato descobrindo o
                     // mouse não come 17 deles nesse tempo, e a etapa se esvaziaria sozinha — justo para
                     // quem esta feature existe para atender. 2 min é o tutorial inteiro, com folga.
  CACO_PUXA:150,     // px/s da deriva do 2º degrau de ajuda (ela PARA quando ele se move...)
  CACO_LONGE:520,    // ...mas volta a valer, mesmo andando, se o caco ficou a mais que isto dele
  CACO_VOLTA:600,    // e aí a puxada é esta, 4× a da muleta — é resgate, não ajuda
  ALVO_K:1.05,       // ⚠️ o alvo da etapa 2 É UMA RAZÃO, nunca um raio absoluto — e isso não é detalhe:
                     //   `EAT.RATIO` é 1,15 nos DOIS sentidos, então um número cravado ou é comível (e a
                     //   etapa se resolve encostando, sem atirar) ou COME o aluno. Com 1,05 ninguém come
                     //   ninguém, aconteça o que acontecer na etapa 1 — inclusive nada.
                     //   ⚠️ Um piso absoluto (que houve aqui, em 90) desfaz exatamente essa garantia:
                     //   contra um aluno que ficou em r=30 ele vira 3× o tamanho dele. O teste pega.
  PRESA_R:40,        // ⚠️ a presa tem de caber na METADE, não no planeta inteiro: com r=96 cada metade
                     //   sai em 67,9 e engole até 59. Um alvo de 60 seria comível inteiro e INCOMÍVEL
                     //   pela metade que salta — o tutorial ensinaria o gesto e puniria quem o fizesse.
  // ⚠️ **A PRESA FOGE EM ÓRBITA, E ISSO NÃO É ENFEITE: ELA IA PARA O CANTO E FICAVA LÁ.** A fuga era
  // "corra na direção oposta ao jogador", com o alvo saturado ao mundo EIXO A EIXO — e saturar por eixo
  // torce a direção (é a mesma lição que `qPos`/`World.setTarget` já custaram uma vez). O resultado
  // medido: a presa encostava num canto da arena em poucos segundos e morria ali, comprimida contra
  // duas paredes, com o jogador chegando a pé e a lição do salto nunca acontecendo. Agora ela corre
  // numa PISTA: um ponto na circunferência de raio `ORBITA` em torno de uma âncora, sempre `GIRO`
  // radianos à frente, para o lado que a afasta de quem a persegue. Presa acuada circula — e o alvo
  // está a no máximo `ORBITA` da âncora, que por construção fica a `MARGEM` da borda, então NENHUM
  // clamp por eixo entra na conta e a direção nunca é torcida.
  // ⚠️ O raio da pista NÃO é constante: ele é a própria distância com que a presa foi plantada
  // (`st.orbR` = `DIST + r_me + r_presa`), senão ela nasceria num lugar e a órbita a arrancaria para
  // outro no primeiro frame.
  AJUDA1_K:0.7,      // e no 1º degrau a pista encolhe para esta fração dela
  PISTA_K:1.15,      // o disco de projeção é um pouco MAIOR que a pista: colados, o alvo cairia em cima
                     // da circunferência e a direção efetiva viraria puramente tangencial — e aí o
                     // perseguidor que corta pelo miolo ganha, mesmo sendo mais lento (curva de perseguição).
  MIRA:700,          // ⚠️ **o alvo da presa tem de estar LONGE dela**, e este número é velocidade, não
                     // geometria: `integratePiece` anda a `vmax·min(d,SPEED.RAMP)/RAMP`, então um alvo
                     // perto a deixa LENTA. Com a mira curta ela estabilizava a 107 px do aluno e era
                     // comida a pé — medido. O ponto é projetado no disco logo abaixo, então mirar longe
                     // não a leva para longe: só a faz correr de verdade.
  FUGA_R:1.0,        // peso da componente RADIAL da fuga (cresce até 1,35 quando ele encosta)
  FUGA_T:0.7,        // peso da componente TANGENCIAL — é ela que faz a presa contornar em vez de reta
  SPLIT_K:1.6,       // r do jogador ao abrir a etapa 3, em múltiplos de `SPLIT.MIN_R` (o filho sai em
                     // r/√2 e tem de continuar acima do portão)
  AJUDA2_D:60,       // no 2º degrau ela para, a este VÃO do aluno (de borda a borda, como `DIST`)
  MARGEM:120,        // folga até a borda da arena ao plantar qualquer coisa
};

const ms=w=>w.tick*(1000/TICK_HZ);
const vivas=ps=>ps?ps.pieces.filter(p=>!p.dead):[];
/** Centróide das peças vivas do jogador. */
function centro(ps){const a=vivas(ps);if(!a.length)return null;
  let x=0,y=0;for(const p of a){x+=p.x;y+=p.y;}return{x:x/a.length,y:y/a.length,r:Math.max(...a.map(p=>p.r))};}

/**
 * As quatro direções em que o tutorial planta alguma coisa, na ordem de preferência. Sempre a 45°.
 *
 * ⚠️ **NÃO no eixo vertical puro, e a razão é a PRÓPRIA TELA DO TUTORIAL.** A instrução mora no topo
 * (`#tutor`: trilha, barra e a caixa de fala, ~140 px) e o prompt de botão mora no rodapé (`#tut-prompt`,
 * a 96 px da borda) — ou seja, a coluna central vertical é justamente a faixa que o tutorial ocupa com
 * texto. Plantado ali, o alvo nascia ATRÁS da explicação: a explicação cobrindo a coisa explicada, que é
 * o defeito que separou a instrução do prompt em primeiro lugar. Na diagonal, cada eixo recebe só 71% da
 * distância — e ela cabe nos dois, inclusive na meia-largura de 375 px de um celular em pé.
 */
// ⚠️ **30° DA VERTICAL, não 45°**, e o número saiu de medir os dois eixos: em retrato a meia-largura
// visível é de apenas **329 px** (`CAM.PORTRAIT_K` já contado) contra ~423 px de meia-altura no desktop —
// ou seja o eixo apertado é a LARGURA, e é dela que a coreografia tem de tirar. A 45° a componente
// horizontal empatava com a vertical e o alvo saía pela lateral do celular; a 30° ela é metade.
const DIRS=[[.5,.866],[-.5,.866],[.5,-.866],[-.5,-.866]];

/**
 * Um ponto a `dist` do jogador, na primeira diagonal que couber na arena com margem.
 * ⚠️ O jogador ANDA durante a etapa, então a escolha é refeita a cada montagem — e o `clamp` final só
 * existe para o caso impossível de nenhuma das quatro caber.
 */
function perto(w,c,dist){
  const m=CENA.MARGEM;
  for(const [dx,dy] of DIRS){
    const x=c.x+dx*dist,y=c.y+dy*dist;
    if(x>=m&&x<=w.w-m&&y>=m&&y<=w.h-m)return{x,y};}
  return{x:clamp(c.x+DIRS[0][0]*dist,m,w.w-m),y:clamp(c.y+DIRS[0][1]*dist,m,w.h-m)};}

/**
 * Deixa o jogador pronto para a etapa: munição, cooldowns e — quando pedido — tamanho e graça.
 *
 * ⚠️ **É AQUI QUE AS TRÊS TRAVAS CAEM, e nenhuma delas é driblada na física.**
 *   · `fireCdUntil` — `_spawnPiece` grava `tick + MISSILE.SPAWN_CD_TICKS` (600 = **10 s**) a cada
 *     nascimento. Sem zerar, o botão MÍSSIL não responde e o novato aprende que ele está quebrado.
 *   · `ammo` — o humano nasce com ZERO mísseis no servidor local (`LocalServer`), ao contrário dos bots.
 *   · `graceUntil` — `rules.applySplit` recusa sob graça, e `sobGraca` é **re-entrante pela massa**: se
 *     ela cair abaixo de `NOVATO_MASS` com `graceUntil` ainda no futuro, o split volta a ser recusado em
 *     silêncio, com o botão já na tela. Zerar o campo é o mesmo que a terceira saída da graça
 *     (`eatPiece` zera a do matador) já faz.
 * @param {*} w @param {number} slot
 */
export function preparaJogador(w,slot,{r=0,ammo=-1,graca=null}={}){
  const ps=w.players.get(slot);if(!ps)return null;
  const pc=vivas(ps)[0];if(!pc)return null;
  if(r>0&&pc.r<r)setR(pc,r);
  if(ammo>=0){ps.ammo=ps.ammo.map(()=>0);ps.ammo[WEAPON.MISSILE]=ammo;ps.weapon=WEAPON.MISSILE;}
  ps.fireCdUntil=0;ps.splitCdUntil=0;ps.ejectCdUntil=0;
  if(graca===false)ps.graceUntil=0;
  return ps;}

/**
 * O que a supernova deixa para trás e que o tutorial precisa corrigir. Chamada NA HORA de `supernova()`.
 *
 * ⚠️ **E não pelo evento `SUPERNOVA`, que é a armadilha aqui:** `world.js` zera `w.events` na ABERTURA do
 * `step()`, e o roteiro roda DEPOIS dele — então um evento que o PRÓPRIO roteiro emite nunca chega ao
 * laço de eventos dele, porque o `step()` seguinte o apaga antes. Custou um teste vermelho para aparecer.
 *
 * ⚠️ **Os cacos expiram em 15 s** (`STAR.NOVA_LIFE_TICKS`=900): um novato descobrindo o mouse não come 17
 * deles nesse tempo, e a etapa 1 se esvaziaria sozinha — justo para o jogador que ela existe para atender.
 * ⚠️ **E `supernova()` enfileira uma estrela nova** (`queueStar`), cuja fila é drenada INCONDICIONALMENTE
 * na fase 11 do `step` — `stars:0` não a impede. Sem esta linha, uma estrela aparece em ponto sorteado do
 * mapa 10 s depois, no meio da etapa 2 ou 3.
 */
function limpaDaNova(w,st){
  for(const e of w.ejected)if(!e.dead)e.life=w.tick+CENA.CACO_VIDA;
  w.starQueue.length=0;}

/** Apaga o que a etapa anterior deixou: cacos, comida, estrelas, MÍSSEIS, o alvo e a FILA de estrelas. */
function limpa(w,st,api){
  for(const e of w.ejected)if(!e.dead)e.dead=true;
  for(const f of w.food)if(f&&!f.dead)w.killFood(f);
  for(const s of w.stars)if(!s.dead)s.dead=true;
  // ⚠️ **OS MÍSSEIS EM VOO MATAM A ETAPA SEGUINTE, e isso foi visto na tela.** O teto da etapa 2 atira
  // pelo aluno; o míssil vive `MISSILE.LIFE_TICKS` e a troca de etapa acontece com ele ainda no ar. Ele
  // então persegue a PRESA recém-plantada (r=40, o menor corpo da cena), a estilhaça abaixo do piso e a
  // mata — e a etapa 3 fica com `st.alvo` apontando para um slot que não existe, sem presa, sem erro e
  // sem nada na tela além de um "KABOOM!" no canto. Medido em bancada: o mundo com UM jogador só.
  for(const m of w.missiles)if(!m.dead)m.dead=true;
  // ⚠️ `supernova()` chama `w.queueStar(STAR.RESPAWN_TICKS)`, e a fila é drenada INCONDICIONALMENTE na
  // fase 11 do `step` — `stars:0` não a impede. Sem esta linha uma estrela nasce em ponto sorteado do
  // mapa 10 s depois da explosão, no meio da etapa 2 ou 3.
  w.starQueue.length=0;
  if(st.alvo>=0){api.tiraAlvo(st.alvo);st.alvo=-1;}}

/**
 * Monta a cena de uma etapa. EXPORTADA porque é o que o teste exercita — ele roda o tutorial inteiro
 * headless, contra um `createWorld` de verdade, sem navegador.
 * @param {*} w @param {*} api @param {number} etapa @param {number} slot @param {*} st
 */
export function montaEtapa(w,api,etapa,slot,st){
  const ps=w.players.get(slot);if(!ps)return;
  limpa(w,st,api);
  const c=centro(ps);if(!c)return;
  if(etapa===ETAPA.NOVA){
    const p=perto(w,c,Math.max(CENA.NOVA_D,CENA.DIST+c.r+CENA.ESTRELA_R));
    // ⚠️ **A ESTRELA FICA EM ACTIVE E QUEM A EXPLODE SOMOS NÓS**, e isto não é preciosismo — foi MEDIDO.
    // Pondo-a em `STAR_PHASE.OLD`, `rules.tickStar` assume o inchaço e o faz sobre a CONSTANTE
    // (`setR(st, STAR.R*(1+(SWELL-1)*p))`): o raio de 24 que plantamos vira 80,4, o estouro salta de 192
    // para **644 px** e o miolo que estilhaça, de 86 para **290** — contra um aluno que está a 300. Ele
    // sobrevivia por 10 px parado, e era despedaçado assim que se mexia (visto em bancada: o planeta do
    // tutorial virou dois). Em ACTIVE o raio é o nosso, o inchaço é o nosso, e a margem é de 162 px.
    const s=w.spawnStar(true,{x:p.x,y:p.y,r:CENA.ESTRELA_R,life:w.tick+9e6});
    if(s){st.estrela=s.id;st.novaEm=w.tick+CENA.NOVA_ESPERA;st.novaLim=w.tick+CENA.NOVA_TETO;}
    st.base=w.massOf(slot);
    return;}
  if(etapa===ETAPA.TIRO){
    preparaJogador(w,slot,{ammo:MISSILE.MAX_AMMO});
    const r=c.r*CENA.ALVO_K;
    const p=perto(w,c,CENA.DIST+c.r+r);
    st.alvo=api.alvo({x:p.x,y:p.y,r,skinId:SKIN_ALVO});
    return;}
  if(etapa===ETAPA.SPLIT){
    // ⚠️ As duas travas do split caem JUNTAS e aqui, não lá na frente: o tamanho (o portão `SPLIT.MIN_R`)
    // e a graça (que o servidor local avisa com `{t:"grace"}`, e é ele que devolve o `#t-split` à tela).
    // `SPLIT.MIN_R` é lido A CADA CHAMADA, nunca capturado na carga do módulo: ele é tunable 'wire'.
    preparaJogador(w,slot,{r:SPLIT.MIN_R*CENA.SPLIT_K,graca:false});
    api.json({t:"grace",why:"tutor"});
    // ⚠️ O CENTRÓIDE É RELIDO AQUI, e não reaproveitado do `c` de cima: `preparaJogador` acabou de mexer
    // no RAIO do aluno, e a pista é medida de borda a borda (`DIST + r_me + r_presa`). Com o valor
    // velho ela nasceria apertada justamente na etapa em que ele está no maior tamanho do tutorial.
    // ⚠️ A âncora aqui é só o PONTO DE PARTIDA: quem a escreve a cada tick é `orbita()`, que a mantém
    // em cima do aluno (clampada para a pista caber na arena) — ver o bloco de lá.
    const me=centro(ps)||c;
    st.orbR=CENA.DIST+me.r+CENA.PRESA_R;
    const lim=CENA.MARGEM+st.orbR;
    st.ancora={x:clamp(me.x,lim,w.w-lim),y:clamp(me.y,lim,w.h-lim)};
    st.giro=1;
    // e ela nasce SOBRE a pista, na direção que `perto` escolheria — sem isso o primeiro alvo da órbita
    // a arrancaria de lado, e o jogador veria a presa dar um tranco no primeiro frame.
    const p=perto(w,me,st.orbR);
    const dx=p.x-st.ancora.x,dy=p.y-st.ancora.y,n=Math.hypot(dx,dy)||1;
    st.alvo=api.alvo({x:st.ancora.x+dx/n*st.orbR,y:st.ancora.y+dy/n*st.orbR,r:CENA.PRESA_R,skinId:SKIN_ALVO});
    return;}}

/**
 * A FUGA EM ÓRBITA. Devolve o ponto da pista em que a presa deve mirar: `GIRO` radianos à frente da
 * posição angular dela, no sentido que a afasta de quem persegue.
 *
 * ⚠️ O ponto está SEMPRE a `R` da âncora, e a âncora está a `MARGEM+ORBITA` de toda borda — então ele
 * cai dentro da arena por construção e `World.setTarget` nunca satura. Era a saturação por EIXO que
 * mandava a presa para o canto: ela fugia na diagonal, o alvo era cortado em x e depois em y, e o que
 * sobrava apontava exatamente para o vértice.
 * ⚠️ A HISTERESE existe porque com o jogador em cima da âncora os dois sentidos empatam: sem ela a presa
 * trocaria de lado a cada tick e ficaria tremendo no lugar, que lê como travamento e não como fuga.
 */
function orbita(w,st,c,ac,R){
  // ⚠️ **O CENTRO DA PISTA É O PRÓPRIO ALUNO** (clampado para ela caber na arena), e não um ponto fixo
  // marcado quando a etapa abriu. Com a âncora parada, ele corria atrás da presa, a pista ficava para
  // trás e a presa passava a circular um lugar vazio — longe, às vezes além do alcance do salto.
  const lim=CENA.MARGEM+R;
  const anc=st.ancora||(st.ancora={x:0,y:0});
  anc.x=clamp(c.x,lim,w.w-lim);anc.y=clamp(c.y,lim,w.h-lim);
  // ⚠️ **E A FUGA TEM DUAS COMPONENTES, não só a tangencial.** Um alvo puramente angular (o ponto da
  // circunferência `GIRO` radianos à frente) deixa a presa com velocidade radial ZERO: o aluno avança
  // 4,5 px por tick em cima dela e a distância simplesmente cai até ele a comer a pé, em menos de um
  // segundo — a lição do salto morre e nada acusa. Com um termo RADIAL que cresce conforme ele encosta
  // (`falta`), ela recua enquanto contorna, que é o que uma presa acuada faz.
  const dx=ac.x-c.x,dy=ac.y-c.y,d=Math.hypot(dx,dy)||1;
  const ux=dx/d,uy=dy/d;
  // ⚠️ O SENTIDO DO CONTORNO É FIXO NA ETAPA (`st.giro`, escrito na montagem) e NÃO é reescolhido por
  // tick. Houve aqui uma inversão "para o lado que a afasta mais": com o aluno perto do centro da pista
  // os dois lados empatam, ela trocava de lado a cada tick e tremia no lugar em vez de fugir. Quem a
  // mantém longe da borda é a projeção no disco, não o sentido.
  const sn=st.giro||1;
  const falta=clamp((R-d)/R,0,1);
  const tx=-uy*sn,ty=ux*sn;
  let fx=ux*(CENA.FUGA_R+falta)+tx*CENA.FUGA_T,fy=uy*(CENA.FUGA_R+falta)+ty*CENA.FUGA_T;
  const n=Math.hypot(fx,fy)||1;fx/=n;fy/=n;
  // o alvo é um ponto à frente dela, PROJETADO no disco da pista — é essa projeção (e não um clamp por
  // eixo) que a mantém longe das bordas sem torcer a direção: cortar eixo a eixo aponta para o vértice.
  let px=ac.x+fx*CENA.MIRA,py=ac.y+fy*CENA.MIRA;
  const rx=px-anc.x,ry=py-anc.y,rd=Math.hypot(rx,ry);
  const Rp=R*CENA.PISTA_K;
  if(rd>Rp){px=anc.x+rx/rd*Rp;py=anc.y+ry/rd*Rp;}
  w.setTarget(st.alvo,px,py);}

/**
 * O roteiro, pronto para ser injetado no `LocalServer`.
 * @returns {{nasce:Function, passo:Function, estado:Function}}
 */
export function criaRoteiro(){
  const st={etapa:TUTOR0,slot:-1,alvo:-1,estrela:-1,novaEm:0,base:0,montada:0,
    sobrou:0,ultimo:0,acertou:false,demo:false,comeu:false,moveu:false,ultEnv:"",
    // `pre` = a estrela ainda não estourou, ou seja a lição de mover ainda não começou. Ele vai no JSON
    // porque é a TELA que precisa saber (a fala e o prompt mudam), e o cliente não tem como derivá-lo.
    pre:false,ancora:null,giro:1,novaLim:0,orbR:0};

  function nasce(w,slot,api){
    st.slot=slot;
    // ⚠️ Posição FIXA no centro do mundo: tudo o mais é relativo a ela, e o `_spawnPiece` com x/y dados
    // pula o sorteio inteiro (que num mundo vazio devolveria qualquer canto de 12000×12000).
    w.addPlayer(slot,{x:w.w/2,y:w.h/2,r:PLAYER.SPAWN_R,missiles:0});
    preparaJogador(w,slot,{});
    // ⚠️ O ÍMÃ DE NASCENÇA SAI. Ele arrasta os cacos (`FRAG.MAGNET_HEAVY` só freia os gordos, e os da
    // supernova têm massa 316 < 600), e com ele o jogador ganha a etapa 1 SEM SE MOVER — que é justamente
    // o que a etapa 1 existe para ensinar. Ele volta a valer na sala de verdade, como sempre.
    const pc=vivas(w.players.get(slot))[0];if(pc)pc.magnetUntil=0;
    st.base=w.massOf(slot);}

  function passo(w,api){
    if(st.slot<0)return;
    const ps=w.players.get(st.slot);
    const agora=ms(w),et=st.etapa.etapa;

    // ── o que aconteceu NESTE tick ──
    for(const ev of w.events){
      if(ev.type==="EJECT_EATEN"&&ev.slot===st.slot)st.ultimo=agora;
      else if(ev.type==="FOOD_EATEN"&&ev.slot===st.slot)st.ultimo=agora;
      else if(ev.type==="BOOM"&&ev.bySlot===st.slot)st.acertou=true;
      else if(ev.type==="EAT"&&ev.killerSlot===st.slot)st.comeu=true;}
    st.sobrou=w.ejected.reduce((n,e)=>n+(e.dead?0:1),0);

    // ── a estrela: o inchaço e o estouro são nossos (ver `montaEtapa`) ──
    if(st.estrela>=0){const s=w.stars.find(x=>x.id===st.estrela&&!x.dead);
      if(!s)st.estrela=-1;
      else{
        const falta=st.novaEm-w.tick;
        // o telegrama: ela incha nos últimos `NOVA_INCHA` ticks, com o raio que NÓS escolhemos
        if(falta<=CENA.NOVA_INCHA){const p=1-Math.max(0,falta)/CENA.NOVA_INCHA;
          setR(s,CENA.ESTRELA_R*(1+(CENA.NOVA_SWELL-1)*p));}
        if(falta<=0){
          // ⚠️ e ela ESPERA se o aluno estiver perto demais: a etapa 1 não pode abrir punindo quem
          // obedeceu à instrução de ir até lá.
          const c=centro(ps);
          if(c&&Math.hypot(c.x-s.x,c.y-s.y)<CENA.NOVA_SAFE&&w.tick<st.novaLim)st.novaEm=w.tick+15;
          else{supernova(w,s);st.estrela=-1;limpaDaNova(w,st);
            // ⚠️ **O RELÓGIO DA LIÇÃO COMEÇA AQUI, não na abertura do mundo.** `desde:0` faz o passo
            // seguinte reabrir a etapa (é o ramo `!est.desde` de `passoTutor`, o único lugar que abre
            // uma etapa) — sem isso os degraus de ajuda contariam o tempo da explosão, e o jogador
            // levaria a primeira muleta antes de a lição ter começado. `montada` já é 1, então a cena
            // NÃO é remontada: nenhuma estrela nova, nenhum caco apagado.
            st.etapa={...st.etapa,desde:0};st.pre=false;}}}}

    // ── o teto do aluno (ver `CENA.R_MAX`) ──
    const rMax=Math.max(CENA.R_MAX,SPLIT.MIN_R*CENA.SPLIT_K);
    if(ps)for(const pc of vivas(ps))if(pc.r>rMax)setR(pc,rMax);

    // ── a decisão ──
    const c=centro(ps);
    const ctx={vivo:!!(ps&&ps.alive&&c),massa:ps?w.massOf(st.slot):0,base:st.base,
      meta:Math.max(BOT.NOVATO_MASS,SPLIT.MIN_R*SPLIT.MIN_R*1.05)||6000,
      sobrou:st.sobrou,ultimo:st.ultimo,acertou:st.acertou,demo:st.demo,comeu:st.comeu};
    const r=passoTutor(st.etapa,ctx,agora);
    st.etapa=r.est;

    // ⚠️ O FIM TAMBÉM É UMA CENA, e ela é o cartão com o planeta DELE atrás — mais nada. Sem esta linha
    // a presa da etapa 3 continua viva e girando por trás do "PRONTO! VOCÊ SABE JOGAR", inclusive quando
    // a etapa fechou pelo teto e ele nunca a comeu: o tutorial se despede exibindo a única coisa que o
    // aluno não conseguiu fazer.
    if(r.fim&&st.montada!==ETAPA.FIM){st.montada=ETAPA.FIM;limpa(w,st,api);}

    // montar a cena da etapa que acabou de abrir (e só uma vez por etapa)
    if(r.etapa!==st.montada&&r.etapa<ETAPA.FIM&&st.etapa.desde){
      st.montada=r.etapa;st.acertou=false;st.demo=false;st.comeu=false;st.ultimo=0;
      st.pre=r.etapa===ETAPA.NOVA;   // a etapa 1 abre ANTES da explosão; as outras não têm fase de espera
      montaEtapa(w,api,r.etapa,st.slot,st);}

    // ⚠️ **A REDE DO ALVO SUMIDO.** `st.alvo` é um slot, e um slot pode deixar de existir por caminhos que
    // não passam pelo roteiro (foi um míssil órfão que matou a presa da etapa 3 em bancada). Sem esta
    // linha a etapa fica sem o que ensinar e só fecha pelo TETO, com o aluno olhando um mundo vazio.
    if(st.alvo>=0&&r.etapa!==ETAPA.NOVA&&!r.fim&&!r.celebra){
      const a=w.players.get(st.alvo);
      if((!a||!a.alive)&&c)montaEtapa(w,api,r.etapa,st.slot,st);}

    // ── a ajuda que mexe no MUNDO (a que é só texto mora na tela) ──
    if(ps&&c)ajuda(w,api,r,st,ps,c);

    // ── o estado, só quando muda ──
    const env=r.etapa+"|"+Math.round(r.pct*100)+"|"+r.ajuda+"|"+(r.celebra?1:0)+"|"+(r.fim?1:0)
      +"|"+(st.pre?1:0);
    if(env!==st.ultEnv||r.festa){st.ultEnv=env;
      api.json({t:"tutor",etapa:r.etapa,pct:+r.pct.toFixed(3),ajuda:r.ajuda,
        festa:r.festa,celebra:r.celebra,auto:r.auto,fim:r.fim,pre:st.pre});}}

  /** Os degraus 2 e 3 de cada etapa, do lado do mundo. O degrau 1 é sempre só texto. */
  function ajuda(w,api,r,st,ps,c){
    // ⚠️ **NADA DE AJUDA DURANTE A COMEMORAÇÃO.** `r.ajuda` continua valendo 3 pelos `SOBRA_MS` inteiros
    // da tela de "etapa completa", e sem esta linha o teto da etapa 2 seguia PUXANDO O GATILHO por trás
    // do cartão — três segundos de mísseis e "KABOOM!" em cima do elogio, com o último deles ainda no ar
    // quando a etapa 3 monta. Visto na tela.
    if(r.celebra||r.fim)return;
    if(r.etapa===ETAPA.NOVA&&!r.fim){
      // A deriva tem DUAS metades, e elas respondem a perguntas diferentes.
      // ⚠️ (1) A MULETA, no 2º degrau: os cacos vêm até ele — e PARAM no instante em que ele se move,
      //     porque quem executa o gesto tem de ser ele.
      // ⚠️ (2) O RESGATE, a qualquer momento: **o caco que ficou longe demais volta correndo, ande ele
      //     ou não.** Isto não é generosidade, é o conserto de um defeito visto em bancada duas vezes
      //     seguidas — e a causa é do JOGO, não do tutorial: com o mouse largado fora do centro o
      //     planeta NUNCA alcança o cursor (a câmera o persegue, então o ponto de mundo sob o pixel foge
      //     junto), que é exatamente o que um iniciante faz. Ele saía andando antes da explosão,
      //     atravessava a arena em dois segundos e ficava vagando num mundo vazio com a barra parada e
      //     nada na tela explicando por quê. `CACO_VOLTA` é 4× a muleta: em 2–3 s a lição o alcança.
      const pc=vivas(ps)[0],parado=pc&&Math.hypot(pc.svx||0,pc.svy||0)<20;
      const muleta=r.ajuda>=2&&parado;
      for(const e of w.ejected){if(e.dead)continue;
        const dx=c.x-e.x,dy=c.y-e.y,d=Math.hypot(dx,dy)||1;
        const perdido=d>CENA.CACO_LONGE;
        if(!perdido&&!muleta)continue;
        const k=perdido?CENA.CACO_VOLTA:CENA.CACO_PUXA;
        e.vx+=dx/d*k*(1/TICK_HZ)*8;e.vy+=dy/d*k*(1/TICK_HZ)*8;}}
    if(r.etapa===ETAPA.NOVA&&r.ajuda>=3){
      // O TETO: ele não chegou à meta sozinho. Concede a massa — e a tela DIZ que concedeu (`auto`).
      // Fazer por alguém em silêncio é a pior das três opções, porque a pessoa sai achando que aprendeu.
      const pc=vivas(ps)[0],meta=Math.max(BOT.NOVATO_MASS,SPLIT.MIN_R*SPLIT.MIN_R*1.05);
      if(pc&&pc.mass<meta)setR(pc,Math.sqrt(meta*1.05));}
    if(r.etapa===ETAPA.TIRO&&r.ajuda>=1&&st.alvo>=0){
      // o alvo AVANÇA. Ele não pode comer ninguém (ratio 1,05), então é ameaça sem risco.
      const a=w.players.get(st.alvo);if(a&&a.alive)w.setTarget(st.alvo,c.x,c.y);}
    if(r.etapa===ETAPA.TIRO&&r.ajuda>=3&&st.alvo>=0&&!st.demo){
      // o teto: o tutorial atira por ele. Quem DIZ que atirou é a tela.
      // ⚠️ **ISTO ERA CÓDIGO MORTO**: `passoTutor` ligava `celebra` no mesmo passo em que `ajuda` chegava a 3, e
      // a primeira linha desta função sai cedo na festa. Hoje o teto da etapa 2 tem `folga` (ver `AJUDA`): a
      // etapa fica ABERTA com `ajuda:3` até o BOOM, e é nessa janela que isto roda.
      // ⚠️ UMA VEZ (`st.demo`): o míssil tem `cd` 0, e sem a trava o cinto inteiro sairia em três ticks — que
      // é o "três segundos de KABOOM por trás do elogio" que o comentário do topo desta função descreve.
      const p=w.players.get(st.slot);
      if(p){if(!(p.ammo[WEAPON.MISSILE]>0))p.ammo[WEAPON.MISSILE]=1;p.weapon=WEAPON.MISSILE;p.fireCdUntil=0;p.fireAim=false;
        w.setTarget(st.slot,...alvoXY(w,st));applyFire(w,p);st.demo=true;}}
    if(r.etapa===ETAPA.SPLIT&&st.alvo>=0){
      const a=w.players.get(st.alvo);if(!a||!a.alive)return;
      const ac=centro(a);if(!ac)return;
      const d=Math.hypot(ac.x-c.x,ac.y-c.y);
      // ⚠️ Os degraus 1 e 2 encolhem a PISTA, não desligam a fuga — e essa é a diferença entre ajudar e
      // resolver por ele. Uma presa que simplesmente PARA no primeiro degrau desfaz a lição inteira: o
      // jogador a alcança andando e sai do tutorial sem ter dividido uma vez. Ela só para no degrau 2,
      // que é a muleta declarada ("Ele parou! Divida agora.") e mesmo aí fica a `AJUDA2_D` — perto, mas
      // ainda do outro lado de uma corrida que o jogador acabou de perder.
      const perto2=c.r+CENA.PRESA_R+CENA.AJUDA2_D;
      if(r.ajuda>=2){w.setTarget(st.alvo,ac.x,ac.y);
        if(d>perto2)aproxima(w,st.alvo,c,perto2);}
      else if(r.ajuda>=1)orbita(w,st,c,ac,(st.orbR||300)*CENA.AJUDA1_K);
      else orbita(w,st,c,ac,st.orbR||300);}}

  function aproxima(w,slot,c,dist){
    const a=w.players.get(slot),pc=vivas(a)[0];if(!pc)return;
    const dx=pc.x-c.x,dy=pc.y-c.y,n=Math.hypot(dx,dy)||1;
    pc.x=clamp(c.x+dx/n*dist,pc.r,w.w-pc.r);pc.y=clamp(c.y+dy/n*dist,pc.r,w.h-pc.r);
    pc.vx=pc.vy=0;w.setTarget(slot,pc.x,pc.y);}

  function alvoXY(w,st){const a=w.players.get(st.alvo),c=centro(a);return c?[c.x,c.y]:[w.w/2,w.h/2];}

  return{nasce,passo,estado:()=>st};}
