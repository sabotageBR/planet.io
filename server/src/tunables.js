// ── PARÂMETROS DE JOGO EM RUNTIME: carregar, aplicar, reconciliar ─────────────
// O BANCO É A VERDADE (`admin_settings`). Este módulo lê no boot — antes de a primeira sala existir — e
// reconcilia a cada RECONCILE_MS. O push entre irmãos (`/internal/admin/tunables`) é só latência: ele NÃO
// carrega valor nenhum, só pede que o irmão releia. Assim um pod que estava reiniciando durante o push
// converge sozinho no próximo poll, e a porta interna não tem autoridade sobre nada.
// A escrita em si é `applyTunable` (shared/src/tunables.js): lista branca, faixa validada, e o valor cai
// direto no objeto de `constants.js`, que é o que a física já lê no laço de 60 Hz.
// @ts-check
import {applyTunable,resetTunable,listTunables,TUNABLE_BY_KEY} from '@warspace/shared/tunables.js';

const RECONCILE_MS=30000;

/** @param {{settings:any,log:any}} o */
export function createTunables({settings,log}){
  let timer=null,aplicados=new Map();
  /** Relê a tabela e aplica o que mudou; o que sumiu da tabela volta ao padrão de `constants.js`. */
  async function load(){
    if(!settings)return 0;
    let rows;
    try{rows=await settings.all();}
    catch(e){log&&log.warn('tunables: não deu para ler admin_settings:',e&&e.message);return 0;}
    const vistos=new Set();let n=0;
    for(const r of rows){
      const t=TUNABLE_BY_KEY.get(r.key);
      if(!t){log&&log.warn(`tunables: chave desconhecida no banco, ignorada: ${r.key}`);continue;}
      vistos.add(r.key);
      // ⚠️ NÃO coagir a número: desde o `BOT_LLM.ESTILO` há tunable de ESCOLHA, e `Number('misto')` é NaN
      // — o valor seria recusado por `applyTunable` e o parâmetro salvo pelo painel simplesmente não
      // valeria, em silêncio, a cada reconciliação. Quem sabe converter é o descritor.
      const cru=r.value&&r.value.v!=null?r.value.v:r.value;
      const v=t.type==='opt'?String(cru):t.type==='bool'?!!cru:Number(cru);
      if(aplicados.get(r.key)===v)continue;
      try{applyTunable(r.key,v);aplicados.set(r.key,v);n++;
        log&&log.info(`tunable ${r.key} = ${v}`);}
      catch(e){log&&log.warn(`tunables: ${r.key}=${v} recusado (${e.message})`);}}
    for(const k of [...aplicados.keys()])if(!vistos.has(k)){resetTunable(k);aplicados.delete(k);n++;
      log&&log.info(`tunable ${k} voltou ao padrão`);}
    return n;}
  function start(){if(timer)return;timer=setInterval(()=>{load().catch(()=>{});},RECONCILE_MS);timer.unref&&timer.unref();}
  function stop(){if(timer){clearInterval(timer);timer=null;}}
  return{load,start,stop,list:listTunables,
    /** O que já foi aplicado por cima do padrão (o painel mostra isso como "alterado"). */
    overrides:()=>Object.fromEntries(aplicados)};
}
