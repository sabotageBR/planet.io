// ── A DECISÃO DO TUTORIAL DE ESTREIA (client/src/game/tutor.js) ───────────────
// Pura, então dá para exercitá-la inteira sem jsdom e sem Pixi — o molde é `client/test/dica.test.js`.
// O que este arquivo trava são as invariantes que, quebradas, produzem um tutorial do qual não se sai:
// a etapa nunca volta, a barra nunca anda para trás, a festa sai uma vez, e o teto SEMPRE fecha.
// node --test client/test/tutor.test.js
import test from "node:test";
import assert from "node:assert/strict";
import { passoTutor, TUTOR0, TUTOR, ETAPA, ETAPAS, AJUDA } from "../src/game/tutor.js";

/** Contexto neutro: vivo, nada aconteceu, meta de massa 6000 a partir de 900. */
const ctx = (o = {}) => ({ vivo: true, massa: 900, base: 900, meta: 6000, sobrou: 24, ultimo: 0,
  acertou: false, comeu: false, ...o });

/** Roda `n` passos de 100 ms a partir de `t0`, com o mesmo ctx. Devolve o último retorno e as festas. */
function roda(est, c, t0 = 1000, n = 10, passo = 100) {
  let r = { est }, festas = [];
  for (let i = 0; i < n; i++) { r = passoTutor(r.est, typeof c === "function" ? c(i) : c, t0 + i * passo);
    if (r.festa) festas.push(r.festa); }
  return { ...r, festas };
}

test("começa na etapa 1, com a barra zerada", () => {
  const r = passoTutor(TUTOR0, ctx(), 1000);
  assert.equal(r.etapa, ETAPA.NOVA);
  assert.equal(r.pct, 0);
  assert.equal(r.fim, false);
  assert.equal(r.est.desde, 1000, "o primeiro passo ABRE a etapa, e é dele que a ajuda conta");
});

test("a barra da etapa 1 é contínua e sai da MASSA", () => {
  // É a única etapa que pode ter progresso contínuo: o diretor tem `massOf(slot)` de graça. As outras
  // duas são um gesto só, e fingir granularidade nelas seria uma barra que anda sem o jogador fazer nada.
  const a = passoTutor(TUTOR0, ctx(), 1000);
  assert.equal(passoTutor(a.est, ctx({ massa: 900 }), 1100).pct, 0);
  assert.equal(passoTutor(a.est, ctx({ massa: 3450 }), 1100).pct, .5);
  assert.equal(passoTutor(a.est, ctx({ massa: 6000 }), 1100).pct, 1);
});

test("`pct` NUNCA passa de 1 nem fica negativo", () => {
  const a = passoTutor(TUTOR0, ctx(), 1000);
  assert.equal(passoTutor(a.est, ctx({ massa: 99999 }), 1100).pct, 1);
  assert.equal(passoTutor(a.est, ctx({ massa: 0 }), 1100).pct, 0, "abaixo da base ainda é zero");
});

test("A META É 6.000, NÃO 3.600 — e é por isso que o teste existe", () => {
  // `SPLIT.MIN_R`=60 pede massa 3.600, mas `sobGraca` só solta em `BOT.NOVATO_MASS`=6.000. Fechar a
  // etapa 1 aos 3.600 mandaria o jogador para a etapa de DIVIDIR com o servidor ainda recusando o split,
  // em silêncio — o pior defeito possível num tutorial.
  const a = passoTutor(TUTOR0, ctx(), 1000);
  const b = passoTutor(a.est, ctx({ massa: 3743, sobrou: 0 }), 1100);
  assert.equal(b.festa, 0, "3.743 de massa NÃO fecha a etapa 1");
  assert.equal(b.etapa, ETAPA.NOVA);
});

test("a etapa 1 só fecha com a massa E o cacho acabado", () => {
  // A segunda metade existe para a festa não sair com metade dos fragmentos na mesa: o jogador estaria no
  // meio de uma varredura satisfatória e a tela mudaria por baixo dele.
  const a = passoTutor(TUTOR0, ctx(), 1000);
  assert.equal(passoTutor(a.est, ctx({ massa: 7000, sobrou: 12 }), 1100).festa, 0, "ainda há cacho");
  assert.equal(passoTutor(a.est, ctx({ massa: 7000, sobrou: 2 }), 1100).festa, ETAPA.NOVA, "acabou o cacho");
  // ⚠️ `ultimo` é o instante do ÚLTIMO grão comido, e o `>0` do predicado distingue "faz tempo que não
  // como" de "nunca comi nada" — sem ele, `ultimo:0` (o estado inicial) fecharia a etapa no primeiro tick.
  const t = 1000 + TUTOR.LIMPO_MS + 500;
  assert.equal(passoTutor(a.est, ctx({ massa: 7000, sobrou: 12, ultimo: t - TUTOR.LIMPO_MS }), t).festa,
    ETAPA.NOVA, "ou 4 s sem comer nada");
  assert.equal(passoTutor(a.est, ctx({ massa: 7000, sobrou: 12, ultimo: t - TUTOR.LIMPO_MS + 1 }), t).festa,
    0, "mas comeu agorinha: espera");
});

test("A FESTA SAI UMA VEZ, por construção", () => {
  const a = passoTutor(TUTOR0, ctx(), 1000);
  const c = ctx({ massa: 7000, sobrou: 0 });
  const b = passoTutor(a.est, c, 1100);
  assert.equal(b.festa, ETAPA.NOVA);
  assert.equal(passoTutor(b.est, c, 1200).festa, 0, "no tick seguinte, nada");
  assert.equal(passoTutor(b.est, c, 1300).festa, 0);
});

test("a próxima etapa só sobe depois da SOBRA — a festa fica no ar", () => {
  const a = passoTutor(TUTOR0, ctx(), 1000);
  const b = passoTutor(a.est, ctx({ massa: 7000, sobrou: 0 }), 1100);
  assert.equal(passoTutor(b.est, ctx(), 1100 + TUTOR.SOBRA_MS - 1).etapa, ETAPA.NOVA);
  assert.equal(passoTutor(b.est, ctx(), 1100 + TUTOR.SOBRA_MS).etapa, ETAPA.TIRO);
});

test("etapa 2 fecha no ACERTO, etapa 3 no ABATE", () => {
  let e = { ...TUTOR0, etapa: ETAPA.TIRO, desde: 1000 };
  assert.equal(passoTutor(e, ctx(), 1100).festa, 0);
  assert.equal(passoTutor(e, ctx({ acertou: true }), 1100).festa, ETAPA.TIRO);
  e = { ...TUTOR0, etapa: ETAPA.SPLIT, desde: 1000 };
  assert.equal(passoTutor(e, ctx(), 1100).festa, 0);
  assert.equal(passoTutor(e, ctx({ comeu: true }), 1100).festa, ETAPA.SPLIT);
});

test("O TETO SEMPRE FECHA — não dá para ficar preso em etapa nenhuma", () => {
  // É o invariante mais importante do arquivo: um tutorial do qual se pode ficar preso é pior que
  // tutorial nenhum, e o funil quebra aos 30 s.
  for (const et of [ETAPA.NOVA, ETAPA.TIRO, ETAPA.SPLIT]) {
    const e = { ...TUTOR0, etapa: et, desde: 1000 };
    const r = passoTutor(e, ctx(), 1000 + AJUDA[et].teto);
    assert.equal(r.festa, et, "etapa " + et + " fechou pelo teto");
    assert.equal(r.auto, true, "e ficou marcada como `auto` — foi carregado, não aprendeu");
  }
});

test("quem fecha pelo PRÓPRIO gesto não é marcado como `auto`", () => {
  // A distinção é a única coisa que separa "aprendeu" de "foi carregado" no funil; sem ela, a próxima
  // versão do tutorial é palpite.
  const e = { ...TUTOR0, etapa: ETAPA.TIRO, desde: 1000 };
  assert.equal(passoTutor(e, ctx({ acertou: true }), 1100).auto, false);
});

test("os degraus de ajuda sobem com o tempo, e só para frente", () => {
  const e = { ...TUTOR0, etapa: ETAPA.NOVA, desde: 1000 };
  assert.equal(passoTutor(e, ctx(), 1000 + AJUDA[ETAPA.NOVA].d1 - 1).ajuda, 0);
  assert.equal(passoTutor(e, ctx(), 1000 + AJUDA[ETAPA.NOVA].d1).ajuda, 1);
  assert.equal(passoTutor(e, ctx(), 1000 + AJUDA[ETAPA.NOVA].d2).ajuda, 2);
});

test("MORTO/PAUSADO congela: o relógio da ajuda não corre sem controle", () => {
  const a = passoTutor(TUTOR0, ctx(), 1000);
  const r = passoTutor(a.est, ctx({ vivo: false }), 1000 + AJUDA[ETAPA.NOVA].teto);
  assert.equal(r.festa, 0, "o teto NÃO fecha a etapa com o jogador sem controle");
  assert.deepEqual(r.est, a.est, "e o estado não anda");
});

test("o FIM é terminal: a máquina nunca volta dele", () => {
  const e = { ...TUTOR0, etapa: ETAPA.FIM, desde: 1000 };
  const r = passoTutor(e, ctx(), 9e9);
  assert.equal(r.fim, true);
  assert.equal(r.etapa, ETAPA.FIM);
  assert.equal(r.pct, 1);
  assert.equal(passoTutor(r.est, ctx(), 9e9 + 1e6).etapa, ETAPA.FIM);
});

test("as três etapas percorrem até o FIM, na ordem, sem pular nem repetir", () => {
  let est = TUTOR0, t = 1000, ordem = [], festas = [];
  const gesto = () => ({ acertou: true, comeu: true, massa: 9000, sobrou: 0 });
  for (let i = 0; i < 200 && est.etapa < ETAPA.FIM; i++, t += 100) {
    const r = passoTutor(est, ctx(gesto()), t);
    est = r.est; if (r.festa) { festas.push(r.festa); }
    if (ordem[ordem.length - 1] !== r.etapa) ordem.push(r.etapa);
  }
  assert.deepEqual(festas, [ETAPA.NOVA, ETAPA.TIRO, ETAPA.SPLIT]);
  assert.deepEqual(ordem, [ETAPA.NOVA, ETAPA.TIRO, ETAPA.SPLIT, ETAPA.FIM]);
  assert.equal(ETAPAS, 3, "e a barra desenha exatamente essas três");
});

test("é PURA: não mexe no estado nem no contexto que recebe", () => {
  const est = { ...TUTOR0 }, copia = { ...est }, c = ctx(), cc = { ...c };
  passoTutor(est, c, 1000);
  assert.deepEqual(est, copia);
  assert.deepEqual(c, cc);
});

// ── AS DUAS FUNÇÕES PURAS DA TELA (ui/Tutor.jsx) ─────────────────────────────
// Elas são puras e exportadas justamente para poderem ser conferidas aqui: o que falha nelas falha em
// SILÊNCIO — uma instrução de mouse para quem tem dedo faz o planeta virar, nada acontecer, e o jogador
// concluir que o tutorial mente.
import { falaDoTutor, promptDoTutor } from "../src/ui/tutorFala.js";

/** Labels de mentira, com o valor igual à chave: assim a asserção diz QUAL chave saiu. */
const T = new Proxy({}, { get: (_, k) => String(k) });

test("cada etapa tem título e instrução, e nenhum vem vazio", () => {
  for (const etapa of [ETAPA.NOVA, ETAPA.TIRO, ETAPA.SPLIT])
    for (const dedo of [false, true])
      for (const ajuda of [0, 1, 2]) {
        const [tit, txt] = falaDoTutor({ etapa, ajuda, pct: 0, dedo }, T, "ESPAÇO");
        assert.ok(tit, `etapa ${etapa} ajuda ${ajuda} dedo ${dedo}: sem título`);
        assert.ok(txt, `etapa ${etapa} ajuda ${ajuda} dedo ${dedo}: sem instrução`);
      }
});

test("MOUSE E DEDO NUNCA RECEBEM A MESMA FRASE onde o gesto difere", () => {
  // No dedo, tocar no canvas NÃO atira — dirige o planeta. "Clique para atirar" ali é o tutorial mentindo.
  for (const [etapa, ajuda] of [[ETAPA.NOVA, 0], [ETAPA.TIRO, 0], [ETAPA.SPLIT, 1]]) {
    const m = falaDoTutor({ etapa, ajuda, pct: 0, dedo: false }, T, "ESPAÇO")[1];
    const d = falaDoTutor({ etapa, ajuda, pct: 0, dedo: true }, T, "ESPAÇO")[1];
    assert.notEqual(m, d, `etapa ${etapa}: mouse e dedo recebem a mesma frase`);
  }
});

test("o prompt do MOUSE diz QUAL BOTÃO; o do dedo aponta o botão do HUD", () => {
  // É o pedido literal: "aparece grande o botão que tem que apertar, se for mouse qual botão na tela".
  assert.equal(promptDoTutor({ etapa: ETAPA.TIRO, ajuda: 0, dedo: false }, T, "ESPAÇO").tipo, "mouse-clique");
  assert.equal(promptDoTutor({ etapa: ETAPA.TIRO, ajuda: 0, dedo: true }, T, "ESPAÇO").tipo, "hud");
  assert.equal(promptDoTutor({ etapa: ETAPA.NOVA, ajuda: 0, dedo: false }, T, "ESPAÇO").tipo, "mouse-mover");
  assert.equal(promptDoTutor({ etapa: ETAPA.NOVA, ajuda: 0, dedo: true }, T, "ESPAÇO").tipo, "toque");
});

test("a TECLA do prompt é a que o jogador configurou, não uma cravada", () => {
  // `prefs.keySplit` é configurável (o `code` físico, que vale em ABNT/QWERTY/AZERTY). Uma legenda que
  // mente é pior que legenda nenhuma.
  const p = promptDoTutor({ etapa: ETAPA.SPLIT, ajuda: 1, dedo: false }, T, "CTRL");
  assert.equal(p.tipo, "tecla");
  assert.equal(p.rotulo, "CTRL");
});

test("NADA DE PROMPT antes de o problema existir", () => {
  // Na etapa 3, enquanto o jogador ainda está descobrindo que perseguir não funciona (ajuda 0), não há
  // gesto a pedir. Uma dica que chega antes do problema é ruído; depois do problema é alívio.
  assert.equal(promptDoTutor({ etapa: ETAPA.SPLIT, ajuda: 0, dedo: false }, T, "ESPAÇO"), null);
  assert.equal(promptDoTutor({ etapa: ETAPA.FIM, ajuda: 0, dedo: false }, T, "ESPAÇO"), null);
});

test("`celebra` é a JANELA, `festa` é o instante", () => {
  // `festa` dispara som e efeito (uma vez); `celebra` segura a tela de "etapa completa" pelos SOBRA_MS.
  // Com só um dos dois, ou a tela pisca um frame, ou o som toca a 8 Hz.
  const a = passoTutor(TUTOR0, ctx(), 1000);
  const b = passoTutor(a.est, ctx({ massa: 7000, sobrou: 0 }), 1100);
  assert.equal(b.festa, ETAPA.NOVA);
  assert.equal(b.celebra, true);
  const c = passoTutor(b.est, ctx(), 1600);
  assert.equal(c.festa, 0, "o instante passou");
  assert.equal(c.celebra, true, "mas a tela continua no ar");
  const d = passoTutor(b.est, ctx(), 1100 + TUTOR.SOBRA_MS);
  assert.equal(d.celebra, false, "e sai quando a próxima etapa sobe");
  assert.equal(d.etapa, ETAPA.TIRO);
});

test("NA EXPLOSÃO A FALA É OUTRA, E NÃO HÁ BOTÃO A APERTAR", () => {
  // ⚠️ A etapa 1 abre com a estrela ainda inteira. Dizer "leve seu planeta até os pedaços" ali é pedir
  // algo que não está na tela — e um prompt pulsando manda agir antes de existir o que fazer.
  const pre = { etapa: ETAPA.NOVA, ajuda: 0, pct: 0, dedo: false, pre: true };
  assert.deepEqual(falaDoTutor(pre, T, "ESPAÇO"), ["nova", "novaEspera"]);
  assert.equal(promptDoTutor(pre, T, "ESPAÇO"), null);
  // e assim que ela estoura, a lição de mover começa — com botão
  const pos = { ...pre, pre: false };
  assert.deepEqual(falaDoTutor(pos, T, "ESPAÇO"), ["novaTit", "novaMouse"]);
  assert.equal(promptDoTutor(pos, T, "ESPAÇO").tipo, "mouse-mover");
});

test("depois do primeiro terço a instrução vira ELOGIO, não repetição", () => {
  // Repetir "mova o mouse" para quem já está movendo o mouse é a tela dizendo que não viu o que ele fez.
  const d = (pct, dedo = false) => falaDoTutor({ etapa: ETAPA.NOVA, ajuda: 0, pct, dedo }, T, "ESPAÇO")[1];
  assert.equal(d(0), "novaMouse");
  assert.equal(d(.5), "novaMais");
  assert.equal(d(.5, true), "novaMais");
});

test("NA ETAPA 3 O DIAGNÓSTICO VEM ANTES DA ORDEM", () => {
  // ⚠️ `splitNao` ("CORRENDO VOCÊ NUNCA ALCANÇA") é a lição — a presa é mais rápida por FÍSICA, não por
  // falta de habilidade. Repetir "DIVIDA PARA ALCANÇAR" no degrau 1 só mandaria de novo, mais alto, o
  // que o jogador acabou de tentar sem sucesso.
  assert.deepEqual(falaDoTutor({ etapa: ETAPA.SPLIT, ajuda: 0, pct: 0, dedo: false }, T, "ESPAÇO"),
    ["splitTit", "splitCaca"]);
  assert.equal(falaDoTutor({ etapa: ETAPA.SPLIT, ajuda: 1, pct: 0, dedo: false }, T, "ESPAÇO")[0], "splitNao");
});

test("A ETAPA 3 NÃO DEIXA O JOGADOR CORRER MAIS DE 5 s ATRÁS DO IMPOSSÍVEL", () => {
  // A mediana de uma primeira vida é 31 s. Oito segundos perseguindo algo que a física torna
  // inalcançável não ensinam a dividir; ensinam que o jogo não responde.
  assert.ok(AJUDA[ETAPA.SPLIT].d1 <= 5000, `${AJUDA[ETAPA.SPLIT].d1} ms até a dica do salto`);
  assert.ok(AJUDA[ETAPA.SPLIT].d1 > AJUDA[ETAPA.NOVA].d1 * .8, "mas não tão cedo que ele nem tente");
});
