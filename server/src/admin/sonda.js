// ── QUAIS IRMÃOS EXISTEM ──────────────────────────────────────────────────────
// `config.peers` sai de `SHARDS` (24 no ConfigMap) e quem decide quantos pods há é o HPA — hoje 7. Ou
// seja, 17 dos 23 nomes não resolvem no DNS, e quem perguntar a todos recebe 17 falhas que NÃO são notícia.
// Este módulo separa "não respondeu" de "nunca existiu", e existe como arquivo PRÓPRIO e PURO porque a
// primeira versão dele morava solta em `http/admin.js` e nasceu errada sem nada ficar vermelho: o filtro
// era `conhecidos.has(p) || sondadosAgora.has(p)`, e o segundo termo anula o primeiro — a sonda REVISITA
// os desconhecidos a cada `SONDA_MS`, então em toda rodada de sonda os 17 fantasmas voltavam como chip
// vermelho no painel. Aqui isso é uma asserção (`server/test/sonda.test.js`), não uma leitura atenta.
//
// ⚠️ O peer só passa a EXISTIR depois de responder uma vez. É isso que devolve sentido ao chip vermelho:
// ele passa a significar "um shard que existia e ficou mudo", que é a única coisa acionável ali.
// @ts-check
import {ADMIN_BUS} from '@warspace/shared/constants.js';

/**
 * @param {{peers:string[], agora?:()=>number, sondaMs?:number}} o
 */
export function criaSonda({peers, agora=Date.now, sondaMs=ADMIN_BUS.SONDA_MS}){
  /** @type {Map<string,number>} peer → shard, aprendido na 1ª resposta dele */
  const conhecidos=new Map();
  /** @type {Map<string,number>} peer que nunca respondeu → quando vale a pena sondar de novo */
  const sondarEm=new Map();

  return {
    /** Os peers que vale perguntar AGORA: os conhecidos, mais os desconhecidos cuja sonda venceu. */
    aPerguntar(){const t=agora();
      return peers.filter(p=>conhecidos.has(p)||(sondarEm.get(p)||0)<=t);},
    /** Registra o resultado de um peer e agenda a próxima sonda de quem continua sem responder. */
    anota(peer,ok,shard){
      if(ok){if(shard!=null)conhecidos.set(peer,shard);sondarEm.delete(peer);}
      else if(!conhecidos.has(peer))sondarEm.set(peer,agora()+sondaMs);},
    /**
     * A faixa do painel: este pod, mais os irmãos que EXISTEM.
     * ⚠️ Um conhecido que não foi PERGUNTADO nesta rodada não vira chip vermelho — ele não falhou,
     * ninguém falou com ele. Por isso o `ok` só é falso quando há uma resposta ruim de verdade.
     * @param {number} shardLocal
     * @param {Array<{peer:string,error?:any,status?:number,body?:any}>} respostas
     */
    faixa(shardLocal,respostas){
      const porPeer=new Map((respostas||[]).map(r=>[r.peer,r]));
      return[{shard:shardLocal,ok:true},
        ...peers.filter(p=>conhecidos.has(p)).map(p=>{const r=porPeer.get(p);
          return{shard:(r&&r.body&&r.body.shard)??conhecidos.get(p)??null,peer:p,
            ok:r?!!(!r.error&&r.status===200):true};})];},
    /** Só para teste e diagnóstico. */
    conhece(peer){return conhecidos.has(peer);},
  };
}
