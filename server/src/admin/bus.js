// ── BARRAMENTO AO VIVO DO /admin: um anel por POD, lido pelo shard COLETOR ────
// Módulo PURO no molde de `rooms/feed.js`: não conhece HTTP, não conhece sala, não conhece peer. Ele só
// guarda os últimos ADMIN_BUS.RING eventos deste processo e sabe dizer "o que aconteceu depois do seq N".
// Quem agrega os 24 pods e vira SSE é `server/src/admin/coletor.js`.
//
// ⚠️ `on` É UM CAMPO, NÃO UMA FUNÇÃO — e essa distinção é o desenho inteiro. `bus.publica('kill',{a,b})`
// ALOCA o objeto literal no ponto de chamada ANTES de entrar na função, então um guard interno não salva
// nada: no caminho de 60 Hz (`Sim._feed`) o custo já foi pago. Por isso a regra é
//   caminho quente:  if(bus.on){bus.publica(...)}     ← leitura de campo, o literal nem nasce
//   caminho frio:    bus.publica(...)                 ← join/leave/chat/report: o guard interno basta
// Com ninguém no painel, o custo em produção é uma comparação por linha de feed. Nada mais.
//
// ⚠️ O `epoch` NÃO É ENFEITE. Sem ele, um pod que reiniciou volta com `seq=1` enquanto o coletor está em
// `seq=900`: `desde(900)` devolve vazio PARA SEMPRE e aquele shard some do painel — sem erro, sem log, e
// com a coluna dele parecendo apenas "calma". Com o epoch a resposta é `perdidos:-1`, que o painel
// IMPRIME como "o shard 3 reiniciou".
// @ts-check
import {ADMIN_BUS} from '@warspace/shared/constants.js';

/**
 * @param {{shard?:number,log?:any}} [o]
 */
export function createAdminBus({shard=0,log=null}={}){
  const epoch=Date.now();
  /** @type {any[]|null} anel alocado só na 1ª vigília (24 pods × 1024 slots que nunca serão usados é memória paga à toa) */
  let buf=null;
  /** último seq escrito (monotônico, nunca reiniciado enquanto o processo vive) */let seq=0;
  /** menor seq ainda LEGÍVEL. Sobe ao acordar de um sono: história de uma hora atrás não é "ao vivo". */let base=1;
  let ultimaLeitura=0;

  const bus={
    /** @type {boolean} lido no caminho quente; escrito por `acorda()` e pelo relógio abaixo */
    on:false,
    epoch,
    shard,
    get seq(){return seq;},
    /**
     * Renova a janela de vigília. Chamado por TODA leitura — ou seja, a própria coleta é o sinal de
     * "tem alguém olhando"; não existe broadcast de despertar a coordenar.
     * ⚠️ Consequência declarada: a primeira coleta depois do silêncio volta quase vazia, porque o anel
     * estava dormindo. É correto, e é o que garante custo zero em produção sem ninguém no painel.
     */
    acorda(){
      ultimaLeitura=Date.now();
      if(!buf)buf=new Array(ADMIN_BUS.RING);
      if(!bus.on){base=seq+1;bus.on=true;}   // acordou: a história velha do anel não conta
    },
    ativo(){return bus.on;},
    /**
     * Enfileira um evento. `dados` é espalhado no registro, então o chamador manda o que aquele tipo tem.
     * @param {string} kind
     * @param {Record<string,any>} [dados]
     */
    publica(kind,dados){
      if(!bus.on||!buf)return;
      seq++;
      buf[seq%ADMIN_BUS.RING]={seq,at:Date.now(),shard,kind,...dados};
      if(seq-base+1>ADMIN_BUS.RING)base=seq-ADMIN_BUS.RING+1;
    },
    /**
     * O que aconteceu depois de `desdeSeq`. Devolve SEMPRE o cursor novo, para o chamador não precisar
     * deduzi-lo do último item (um lote vazio não tem último item).
     * ⚠️ `perdidos` é a LACUNA EXPLÍCITA: > 0 quando o pedido caiu antes do anel, -1 quando o pod
     * reiniciou. Silêncio aqui seria a pior falha possível — o administrador olharia para uma coluna
     * calma achando que a sala está calma.
     * ⚠️ Cursor ZERO é ESTREIA, não atraso: entrega só os últimos `ADMIN_BUS.ESTREIA` e NÃO marca lacuna.
     * Sem essa distinção, abrir o painel pediria 24 anéis cheios de uma vez (24 576 eventos na primeira
     * pintura) e ainda anunciaria "perdi 1024 eventos" a quem não tinha o que perder.
     * @param {number} desdeSeq
     * @param {number} [desdeEpoch]
     * @returns {{shard:number,epoch:number,seq:number,perdidos:number,ev:any[]}}
     */
    desde(desdeSeq,desdeEpoch){
      bus.acorda();
      const out={shard,epoch,seq,perdidos:0,ev:/** @type {any[]} */([])};
      if(!buf)return out;
      // Pod reiniciado: o seq do chamador é de outra encarnação e comparar os dois não quer dizer nada.
      const outraVida=desdeEpoch!=null&&desdeEpoch!==epoch;
      const estreia=!outraVida&&(desdeSeq|0)<=0;
      let de=outraVida?base:(desdeSeq|0)+1;
      if(outraVida)out.perdidos=-1;
      else if(estreia)de=Math.max(base,seq-ADMIN_BUS.ESTREIA+1);
      else if(de<base){out.perdidos=base-de;de=base;}
      if(de<1)de=1;
      for(let q=de;q<=seq;q++){const it=buf[q%ADMIN_BUS.RING];if(it&&it.seq===q)out.ev.push(it);}
      return out;
    },
    stop(){if(relogio)clearInterval(relogio);},
  };

  // ⚠️ O REBAIXAMENTO PRECISA DE RELÓGIO PRÓPRIO. Sem ele `on` só cairia na próxima leitura — e leitura
  // é justamente o que deixou de acontecer quando o admin fechou a aba. O pod publicaria para sempre.
  // `unref` para não segurar o processo vivo (o mesmo cuidado do ceifador de RoomManager).
  const relogio=setInterval(()=>{
    if(bus.on&&Date.now()-ultimaLeitura>=ADMIN_BUS.AWAKE_MS){
      bus.on=false;
      if(log&&log.debug)log.debug('bus ao vivo: dormindo (ninguém no painel)');}
  },1000);
  if(relogio.unref)relogio.unref();

  return bus;
}

/** Barramento inerte para quem não tem painel (shard `role='game'` sem persistência, testes de física). */
export const BUS_MUDO=Object.freeze({on:false,epoch:0,shard:-1,seq:0,acorda(){},ativo(){return false;},
  publica(){},desde(){return{shard:-1,epoch:0,seq:0,perdidos:0,ev:[]};},stop(){}});
