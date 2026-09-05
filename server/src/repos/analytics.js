// ── REPO analytics: as consultas da tela de RETENÇÃO do /admin ────────────────
// A pergunta que este arquivo existe para responder é literal: "o jogador fica 3 minutos?". Quase tudo
// já estava no banco desde a 0001 e ninguém tinha ido buscar — `matches` guarda `started_at`,
// `duration_s` e `cause`, e `users.created_at` × `last_seen_at` já dá coorte. O que a 0010 acrescentou
// foi só o que faltava para saber QUEM mata o novato (`killer_kind`, `killer_mass`, `how`) e de onde a
// conta veio (`users.origin`).
//
// ⚠️ PostgreSQL 9.6: nada de `date_bin` nem de agregado moderno. `FILTER`, `percentile_cont`,
// `width_bucket` e funções de janela existem desde a 9.4 e são o que está em uso aqui.
//
// ⚠️ O POOL É O MESMO DO JOGO. Estas consultas varrem `matches`, e uma delas presa segura uma conexão que
// falta a uma partida. Por isso: `days` limitado na rota, `statement_timeout` local em cada leitura e um
// memo curto — o painel faz polling e ninguém precisa do número recalculado a cada abertura de aba.
// @ts-check

const MEMO_MS=60e3;
const TIMEOUT='10s';

/**
 * ⚠️ `visita` é o painel que responde ao pedido do dono, e o motivo é que `matches` guarda VIDAS, não
 * sessões: no Livre, morrer e renascer abre uma linha nova. "Ficar 3 minutos" é a visita inteira, então
 * ela é reconstruída agrupando as partidas de cada pessoa por intervalo (mais de GAP sem jogar = visita
 * nova) com `lag()` + soma cumulativa. Sem coluna nova e sem evento novo.
 */
const GAP='30 minutes';

/**
 * O join RECUSADO não é uma vida.
 *
 * ⚠️ `net/wsServer.js` abre a sessão de persistência em `onPlayerJoin`, ANTES de saber se o jogador vai
 * conseguir entrar, e por muito tempo os três becos de lá (sala cheia/já começou, nick em uso, banido)
 * fechavam com `onMatchEnd({durationMs:0})` — cada recusa gravava uma linha REAL em `matches` com
 * `duration_s=0` e `cause='left'`. Como as consultas abaixo tomam a linha de MENOR `id` por usuário
 * como "a primeira vida", a fantasma virava a estreia do novato: mediana e histograma da primeira vida
 * puxados para zero, e um "quem mata o novato" cheio de `left · n/d` com 0 s. Hoje o caminho novo
 * descarta a sessão (`dropSession`), mas o histórico gravado continua no banco — e um `DELETE` seria
 * destrutivo por uma linha que basta não ler. Daí o filtro, aplicado ANTES do `row_number`: aplicado
 * depois, a fantasma ainda seria a n=1 e o novato sumiria do relatório inteiro.
 * ⚠️ Ele pega junto a saída legítima que durou menos de meio segundo. É indistinguível por construção,
 * é rara, e chamá-la de "primeira vida" seria tão errado quanto.
 */
const VIDA_REAL="NOT (m.duration_s=0 AND m.cause='left')";

export function createAnalytics(db){
  /** @type {Map<string,{at:number,v:any}>} */
  const memo=new Map();

  /** Leitura com teto de tempo: o `SET LOCAL` só vale dentro da transação, então ele não vaza para o pool. */
  async function ler(sql,args){
    return db.tx(async c=>{
      await c.query(`SET LOCAL statement_timeout='${TIMEOUT}'`);
      const r=await c.query(sql,args);
      return r.rows;
    });
  }

  // 1. Funil por coorte de conta: quantos nascem, quantos chegam a jogar, quantos passam de 3 min.
  const funil=d=>ler(`
    WITH coorte AS (
      SELECT u.id, COALESCE(u.origin,'site') AS origem, date_trunc('day',u.created_at) AS dia
        FROM users u WHERE u.created_at >= now() - ($1||' days')::interval
    ), v AS (
      SELECT c.dia, c.origem, c.id,
             count(m.id)                   AS vidas,
             COALESCE(sum(m.duration_s),0) AS s_total
        FROM coorte c LEFT JOIN matches m ON m.user_id=c.id AND ${VIDA_REAL}
       GROUP BY 1,2,3)
    SELECT dia, origem,
           count(*)::int                             AS contas,
           count(*) FILTER (WHERE vidas>0)::int      AS jogaram,
           count(*) FILTER (WHERE s_total>=180)::int AS tres_min,
           count(*) FILTER (WHERE vidas>=2)::int     AS duas_vidas,
           round(avg(s_total))::int                  AS s_medio
      FROM v GROUP BY 1,2 ORDER BY 1 DESC,2`,[d]);

  // 2. A PRIMEIRA VIDA — o número que decide para onde olhar depois.
  const primeira=d=>ler(`
    WITH novos AS (SELECT id FROM users WHERE created_at >= now()-($1||' days')::interval),
    p AS (SELECT m.*, row_number() OVER (PARTITION BY m.user_id ORDER BY m.id) AS n
            FROM matches m JOIN novos u ON u.id=m.user_id WHERE ${VIDA_REAL})
    SELECT count(*)::int                                                       AS n,
           round(percentile_cont(0.5) WITHIN GROUP (ORDER BY duration_s))::int AS mediana_s,
           round(percentile_cont(0.9) WITHIN GROUP (ORDER BY duration_s))::int AS p90_s,
           count(*) FILTER (WHERE duration_s< 30)::int                         AS ate_30s,
           count(*) FILTER (WHERE duration_s>=30  AND duration_s<60)::int      AS ate_60s,
           count(*) FILTER (WHERE duration_s>=60  AND duration_s<180)::int     AS ate_3min,
           count(*) FILTER (WHERE duration_s>=180)::int                        AS acima_3min,
           round(avg(max_mass))::int                                           AS massa_media
      FROM p WHERE n=1`,[d]);

  // 3. Histograma da primeira vida, em baldes de 30 s até 10 min (+1 para o estouro).
  const histograma=d=>ler(`
    WITH novos AS (SELECT id FROM users WHERE created_at >= now()-($1||' days')::interval),
    p AS (SELECT m.duration_s, row_number() OVER (PARTITION BY m.user_id ORDER BY m.id) AS n
            FROM matches m JOIN novos u ON u.id=m.user_id WHERE ${VIDA_REAL})
    SELECT width_bucket(duration_s,0,600,20) AS balde, count(*)::int AS n
      FROM p WHERE n=1 GROUP BY 1 ORDER BY 1`,[d]);

  // 4. QUEM MATA O NOVATO. `razao` é o número que acusa (ou inocenta) os dois gigantes que a sala semeia:
  //    massa do algoz sobre massa da vítima. `killer_kind` é o que separa bot de cenário — `killed_by_user_id`
  //    é NULL nos dois casos, e por isso a pergunta não tinha resposta antes da 0010.
  const algoz=d=>ler(`
    WITH novos AS (SELECT id FROM users WHERE created_at >= now()-($1||' days')::interval),
    p AS (SELECT m.*, row_number() OVER (PARTITION BY m.user_id ORDER BY m.id) AS n
            FROM matches m JOIN novos u ON u.id=m.user_id WHERE ${VIDA_REAL})
    SELECT cause,
           COALESCE(killer_kind, CASE WHEN killed_by_user_id IS NOT NULL THEN 'human' END, 'n/d') AS algoz,
           COALESCE(how,'n/d')                               AS via,
           count(*)::int                                     AS n,
           round(avg(duration_s))::int                       AS s_medio,
           round(avg(killer_mass))::int                      AS massa_algoz,
           round(avg(max_mass))::int                         AS massa_vitima,
           round(avg(killer_mass)/NULLIF(avg(max_mass),0),1) AS razao
      FROM p WHERE n=1 GROUP BY 1,2,3 ORDER BY n DESC`,[d]);

  // 5. Coortes D1/D7/D30.
  const coortes=d=>ler(`
    WITH coorte AS (SELECT id, date_trunc('day',created_at) AS dia FROM users
                     WHERE created_at >= now()-($1||' days')::interval),
    d AS (SELECT DISTINCT c.dia, c.id, date_trunc('day',m.ended_at) AS quando
            FROM coorte c JOIN matches m ON m.user_id=c.id)
    SELECT dia,
           count(DISTINCT id)::int                                               AS coorte,
           count(DISTINCT id) FILTER (WHERE quando = dia+interval '1 day')::int  AS d1,
           count(DISTINCT id) FILTER (WHERE quando = dia+interval '7 days')::int AS d7,
           count(DISTINCT id) FILTER (WHERE quando = dia+interval '30 days')::int AS d30,
           count(DISTINCT id) FILTER (WHERE quando > dia)::int                   AS voltou
      FROM d GROUP BY 1 ORDER BY 1 DESC`,[d]);

  // 6. A VISITA — a resposta literal aos 3 minutos (ver o comentário do GAP lá em cima).
  //
  // ⚠️ A VISITA É RELÓGIO DE PAREDE, e ela já foi `sum(duration_s)` — soma de VIDAS. Isso respondia à
  // pergunta errada com uma precisão convincente: quem morre aos 30 s, assiste 4 min pela tela de morte
  // e morre de novo aos 30 s aparecia como uma visita de UM MINUTO. O tempo entre as vidas era usado
  // para AGRUPAR e nunca somado, ou seja o painel descontava exatamente a parte da sessão em que a
  // pessoa está lá, olhando o jogo. As duas medidas continuam: `s_visita` é quanto ela ficou,
  // `s_jogo` é quanto ela jogou, e a diferença é a tela de morte, o pódio e o anúncio.
  //
  // ⚠️ E o fim de uma vida é `started_at + duration_s`, NUNCA `ended_at`: aquele é o `now()` do INSERT,
  // e o INSERT passa por uma fila com backoff de até ~5 min (`persist/queue.js`). Um `ended_at` inflado
  // encolhe o intervalo percebido até a vida seguinte e gruda visitas que eram separadas — e infla a
  // duração da que sobrou. `started_at` é o `Date.now()` da abertura da sessão e `duration_s` é medido
  // em TICKS do Sim: os dois são do instante certo.
  const visita=d=>ler(`
    WITH m AS (SELECT user_id,started_at,duration_s,
                      started_at + (duration_s||' seconds')::interval AS fim
                 FROM matches
                WHERE ended_at >= now()-($1||' days')::interval),
    v AS (SELECT *, CASE WHEN lag(fim) OVER w IS NULL
                           OR started_at - lag(fim) OVER w > interval '${GAP}'
                         THEN 1 ELSE 0 END AS nova
            FROM m WINDOW w AS (PARTITION BY user_id ORDER BY started_at)),
    g AS (SELECT *, sum(nova) OVER (PARTITION BY user_id ORDER BY started_at
                                    ROWS UNBOUNDED PRECEDING) AS visita FROM v),
    s AS (SELECT user_id,visita,count(*) AS vidas,sum(duration_s) AS s_jogo,
                 -- O GREATEST nao e paranoia: duas abas da MESMA conta jogam ao mesmo tempo, as vidas
                 -- se sobrepoem e o tempo somado passa do intervalo medido. Sem ele a tela mostraria
                 -- "visita mais curta que o tempo em partida", que ninguem consegue explicar.
                 -- (sem crase e sem acento aqui dentro: isto vive num template literal)
                 GREATEST(EXTRACT(EPOCH FROM (max(fim)-min(started_at)))::int,
                          sum(duration_s))::int AS s_visita
            FROM g GROUP BY 1,2)
    SELECT count(*)::int                                                     AS visitas,
           round(percentile_cont(0.5) WITHIN GROUP (ORDER BY s_visita))::int AS mediana_s,
           round(percentile_cont(0.5) WITHIN GROUP (ORDER BY s_jogo))::int   AS mediana_jogo_s,
           count(*) FILTER (WHERE s_visita>=180)::int                        AS acima_3min,
           round(100.0*count(*) FILTER (WHERE s_visita>=180)/NULLIF(count(*),0),1) AS pct_3min,
           round(avg(vidas),2)                                               AS vidas_por_visita
      FROM s`,[d]);

  /** Os seis painéis num payload só: a tela é de leitura e seis round-trips seria pior. */
  async function tudo(days){
    const k='r'+days,agora=Date.now(),c=memo.get(k);
    if(c&&agora-c.at<MEMO_MS)return c.v;
    const [f,pr,h,a,co,vi]=await Promise.all([funil(days),primeira(days),histograma(days),algoz(days),coortes(days),visita(days)]);
    const v={days,at:agora,funil:f,primeira:pr[0]||null,histograma:h,algoz:a,coortes:co,visita:vi[0]||null};
    memo.set(k,{at:agora,v});
    return v;
  }

  return{tudo};
}
