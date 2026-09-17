// ── A RÉGUA DOS FIT TESTS: A COORTE DA POKI NO NOSSO BANCO, POR BRAÇO DO A/B ───────
// O Player Fit Test da Poki é o EXAME, não a régua: o mesmo zip (1.30) já deu 1m56 · 2m39 · 2m28 em dois
// dias, e com 500 gameplays o erro-padrão do "engaged" é ~1,9 pt — nada menor que ±4 pt / ±25 s aparece
// lá. O nosso banco mede a MESMA gente com muito menos ruído (as três rodadas de 15–16/09 deram
// 24,8 · 22,9 · 23,1% de contas com 3 min de partida, onde eles leram 28 · 24 · 22%), e é o único lugar
// em que dá para separar os dois braços de um A/B (`BOT.NOVATO_MANSO='metade'` → `user_id % 2`,
// ver `Sim.bracoAB`). Este script é as consultas que eram feitas à mão, num comando só.
//
// ⚠️ **O A/A JÁ FOI MEDIDO, E ELE É O TAMANHO DO RUÍDO ENTRE BRAÇOS**: nas duas rodadas de 16/09, SEM
//    tratamento nenhum, contas ímpares × pares deram 25,0% × 21,0% de ≥3 min (4 pt, 1,5 EP) e 61% × 57% de
//    "jogou". Ou seja: 4 pt entre braços num teste só NÃO é efeito. Leia a última tabela em EP, some as
//    janelas de vários testes (`--de … --ate …` repetido) e só acredite acima de ~2 EP — e primeiro no
//    MECANISMO ("1ª vida sem abate"), que é onde um efeito de verdade aparece grande.
// ⚠️ **SOMENTE LEITURA, E ISSO É TRAVADO NA SESSÃO** (`default_transaction_read_only=on`): ele existe
//    para ser rodado contra PRODUÇÃO. Por isso também NÃO lê o `.env` sozinho — quem roda diz o banco:
//      DATABASE_URL=postgres://… node scripts/poki-coorte.mjs --de "2026-09-16 20:19-03" --ate "2026-09-17 01:10-03"
//    Várias janelas de uma vez (somadas por braço no fim): repita o par `--de … --ate …`.
// ⚠️ **A JANELA É A DE `users.created_at`, EM BRT COM O FUSO ESCRITO** (`-03`): o painel da Poki mostra a
//    hora de INÍCIO do teste em horário local, e ele pode levar de 2 h (tarde na Europa) a 5 h (madrugada
//    lá). Confira no fim da saída a contagem por hora antes de acreditar na janela.
// ⚠️ **O TUTORIAL NÃO GRAVA `matches`** (ele roda no LocalServer): "jogou" aqui é "chegou à partida REAL", e
//    o tempo medido é só o dela. Para comparar com o "engaged" deles some ~60–80 s de tutorial de cabeça.
// ⚠️ `cause='shutdown'` fica de fora: é o pod reiniciando, e a linha leva a duração do PROCESSO.
// ⚠️ O que ele acusa no fim — `admin_audit` na janela — é a contaminação que já custou três rodadas.
// @ts-check
import {createRequire} from "node:module";
const pg=createRequire(new URL("../server/package.json",import.meta.url))("pg");

const url=process.env.DATABASE_URL;
if(!url){console.error("faltou DATABASE_URL no ambiente (de propósito: este script não lê o .env, que aponta para PRODUÇÃO por acidente)");process.exit(1);}
const janelas=[];{const a=process.argv;let de=null;
  for(let i=2;i<a.length;i++){if(a[i]==="--de")de=a[++i];else if(a[i]==="--ate"){if(!de){console.error("--ate sem --de antes");process.exit(1);}janelas.push([de,a[++i]]);de=null;}}}
const origem=(()=>{const i=process.argv.indexOf("--origem");return i>0?process.argv[i+1]:"poki";})();
if(!janelas.length){console.error('uso: DATABASE_URL=… node scripts/poki-coorte.mjs --de "2026-09-16 20:19-03" --ate "2026-09-17 01:10-03" [--de … --ate …] [--origem poki]');process.exit(1);}

const c=new pg.Client({connectionString:url,application_name:"poki-coorte(ro)"});
await c.connect();
await c.query("SET default_transaction_read_only=on");await c.query("SET statement_timeout='30s'");

// uma linha por braço (0 = controle, 1 = manso) — os percentuais saem no JS, para os dois denominadores ficarem à vista
const SQL=`
WITH u AS (SELECT id,(id%2)::int braco,created_at FROM users WHERE origin LIKE $3 AND created_at>=$1::timestamptz AND created_at<$2::timestamptz),
m AS (SELECT m.*,row_number() OVER (PARTITION BY m.user_id ORDER BY m.id) n FROM matches m JOIN u ON u.id=m.user_id
      WHERE m.cause<>'shutdown' AND m.started_at<u.created_at+interval '4 hours'),
p AS (SELECT user_id,count(*) vidas,
        LEAST(GREATEST(EXTRACT(EPOCH FROM max(started_at+duration_s*interval '1 second')-min(started_at)),sum(duration_s)),1800) parede,
        sum(kills)+sum(bot_kills) abates,sum(splits) splits FROM m GROUP BY 1),
v1 AS (SELECT * FROM m WHERE n=1)
SELECT u.braco,count(*)::int contas,count(p.user_id)::int jogaram,
  count(*) FILTER (WHERE p.parede>=180)::int p180,count(*) FILTER (WHERE p.parede>=300)::int p300,
  COALESCE(sum(p.parede),0)::float seg,
  percentile_cont(.5) WITHIN GROUP (ORDER BY v1.duration_s) med_v1,
  count(*) FILTER (WHERE v1.cause='left')::int v1_vivo,
  count(*) FILTER (WHERE v1.kills+v1.bot_kills=0)::int v1_sem_abate,
  count(*) FILTER (WHERE v1.cause='left' AND v1.kills+v1.bot_kills=0)::int v1_vivo_sem_abate,
  count(*) FILTER (WHERE p.abates=0)::int sem_abate,count(*) FILTER (WHERE p.splits=0)::int sem_split,
  count(*) FILTER (WHERE p.vidas=1)::int uma_vida
FROM u LEFT JOIN p ON p.user_id=u.id LEFT JOIN v1 ON v1.user_id=u.id GROUP BY u.braco ORDER BY u.braco`;

const pct=(a,b)=>b?(100*a/b).toFixed(1)+"%":"—";
/** Erro-padrão da DIFERENÇA de duas proporções, em pontos: é o que diz se os braços se separaram ou não. */
const epDif=(a,na,b,nb)=>na&&nb?100*Math.sqrt(a/na*(1-a/na)/na+b/nb*(1-b/nb)/nb):NaN;
const linha=(rot,r)=>({braço:rot,contas:r.contas,"jogou":pct(r.jogaram,r.contas),
  "≥3min /contas":pct(r.p180,r.contas),"≥5min /contas":pct(r.p300,r.contas),"média s/conta":r.contas?Math.round(r.seg/r.contas):0,
  "≥3min /jogou":pct(r.p180,r.jogaram),"1ªvida med s":r.med_v1==null?"—":Math.round(r.med_v1),
  "1ªvida saiu VIVO":pct(r.v1_vivo,r.jogaram),"1ªvida SEM abate":pct(r.v1_sem_abate,r.jogaram),
  "sessão sem abate":pct(r.sem_abate,r.jogaram),"sem split":pct(r.sem_split,r.jogaram),"1 vida só":pct(r.uma_vida,r.jogaram)});
const CAMPOS=["contas","jogaram","p180","p300","seg","v1_vivo","v1_sem_abate","v1_vivo_sem_abate","sem_abate","sem_split","uma_vida"];
const soma=(a,b)=>{const o={...a};for(const k of CAMPOS)o[k]=(a[k]||0)+(b[k]||0);o.med_v1=null;return o;};
const zero=()=>Object.fromEntries(CAMPOS.map(k=>[k,0]));

const tot=[zero(),zero()];
for(const [de,ate] of janelas){
  const {rows}=await c.query(SQL,[de,ate,`%${origem}%`]);
  const b=[rows.find(r=>r.braco===0)||zero(),rows.find(r=>r.braco===1)||zero()];
  console.log(`\n## ${de}  →  ${ate}   (origem ~ ${origem})`);
  console.table([linha("0 · controle (par)",b[0]),linha("1 · manso (ímpar)",b[1]),linha("total",soma(b[0],b[1]))]);
  tot[0]=soma(tot[0],b[0]);tot[1]=soma(tot[1],b[1]);
  const h=await c.query(`SELECT to_char(date_trunc('hour',created_at),'DD/MM HH24"h"') hora,count(*)::int contas FROM users
    WHERE origin LIKE $3 AND created_at>=$1::timestamptz-interval '1 hour' AND created_at<$2::timestamptz+interval '1 hour' GROUP BY 1 ORDER BY min(created_at)`,[de,ate,`%${origem}%`]);
  console.log("contas por hora (1 h de folga de cada lado — a janela pegou o teste inteiro?):  "+h.rows.map(r=>`${r.hora}:${r.contas}`).join("  "));
  const a=await c.query(`SELECT to_char(created_at,'DD/MM HH24:MI') quando,action,target,left(detail::text,80) detalhe FROM admin_audit
    WHERE action<>'login' AND created_at>=$1::timestamptz-interval '30 minutes' AND created_at<$2::timestamptz ORDER BY created_at`,[de,ate]);
  if(a.rows.length){console.log("⚠️ o painel foi mexido nesta janela (ou 30 min antes) — a rodada pode estar contaminada:");console.table(a.rows);}
  else console.log("painel quieto na janela (admin_audit) ✓   ⚠️ gravação direta em admin_settings não aparece aqui");
  const s=await c.query(`SELECT key,left(value::text,30) valor,to_char(updated_at,'DD/MM HH24:MI') quando FROM admin_settings
    WHERE updated_at>=$1::timestamptz-interval '30 minutes' AND updated_at<$2::timestamptz ORDER BY updated_at`,[de,ate]);
  if(s.rows.length){console.log("admin_settings gravados na janela:");console.table(s.rows);}
}
if(janelas.length>1){console.log("\n## SOMA das janelas");
  console.table([linha("0 · controle (par)",tot[0]),linha("1 · manso (ímpar)",tot[1]),linha("total",soma(tot[0],tot[1]))]);}
// ── os braços se separaram? (diferença ± erro-padrão; abaixo de ~2 EP é ruído) ──
const [A,B]=tot;
const dif=(rot,ka,kb)=>{const d=100*(B[ka]/(B[kb]||1)-A[ka]/(A[kb]||1)),ep=epDif(A[ka],A[kb],B[ka],B[kb]);
  return{métrica:rot,"manso − controle":d.toFixed(1)+" pt","erro-padrão":ep.toFixed(1)+" pt","em EP":(d/ep).toFixed(1)};};
console.log("\n## manso − controle (só vale com BOT.NOVATO_MANSO='metade' durante a janela)");
console.table([dif("1ª vida SEM abate (mecanismo: tem que CAIR)","v1_sem_abate","jogaram"),dif("1ª vida saiu VIVO (tem que CAIR)","v1_vivo","jogaram"),
  dif("≥3 min por conta (o critério)","p180","contas"),dif("≥5 min por conta","p300","contas")]);
const cfg=await c.query("SELECT left(value::text,20) v,to_char(updated_at,'DD/MM HH24:MI') quando FROM admin_settings WHERE key='BOT.NOVATO_MANSO'");
console.log("BOT.NOVATO_MANSO agora: "+(cfg.rows[0]?`${cfg.rows[0].v} (gravado ${cfg.rows[0].quando})`:"sem linha no banco = 'off' (o padrão do código)"));
await c.end();
