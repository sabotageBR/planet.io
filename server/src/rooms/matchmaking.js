// ── JOGAR (AUTO): QUAL SALA, DE QUAL SHARD ──────────────────────────────────────────────────────────
// Função PURA (no molde de `admin/ordenar.js` e `game/quality.js`): recebe a lista agregada de salas do
// cluster — a mesma de `/api/rooms`, com `shard`, `players`, `open`, `mode` e `teamSize` — e devolve a
// sala escolhida, ou `null` = "crie uma NESTE shard".
//
// O que ela conserta: a regra era `abertas.sort(byPlayers)[0]`, ou seja A SALA MAIS CHEIA DO CLUSTER, e
// isso é um atrator. Quem entra vai para a mais cheia, o que a deixa mais cheia; quando ela lota, a
// segunda mais cheia costuma ser vizinha dela no MESMO pod (nasceu quando aquele pod atendeu), então o
// shard inteiro é escolhido de novo. Medido em produção: 55 humanos e 4 salas num shard a 1198m de CPU,
// contra 1 humano em cada um dos outros dois, ociosos — o jogo travando com dois terços da frota parada.
//
// A regra nova tem uma linha só de ideia: AGRUPAR ATÉ O TETO, DEPOIS ESPALHAR. Enquanto a sala tem menos
// de `ROOM.SOFT` humanos ela é o melhor destino (um .io vazio não é jogo); passando dela, o próximo entra
// em outra sala — de preferência num shard que ainda tenha folga (`ROOM.SHARD_SOFT`), e se nenhum tiver,
// numa sala nova aqui mesmo.
// @ts-check
import {ROOM} from '@warspace/shared/constants.js';

/**
 * A carga de cada shard, na unidade "um jogador humano" (ver `ROOM.CUSTO_*` em constants, com a medição
 * de onde os pesos saíram). Somam-se as TRÊS coisas que custam, porque elas não custam igual: a SESSÃO
 * (que paga o snapshot por AOI), o PREENCHIMENTO (cérebro e física, sem rede) e a SALA em si (a grade da
 * comida e o resto do `World.step`, que rodam mesmo com ela vazia).
 * ⚠️ É do PROCESSO, não da sala: o laço de 60 Hz percorre todas as salas do pod, e é o pod que satura.
 */
export function cargaPorShard(salas){const m=new Map();
  for(const r of salas||[]){const s=r.shard|0;
    m.set(s,(m.get(s)||0)+(r.players|0)+(r.bots|0)*ROOM.CUSTO_BOT+ROOM.CUSTO_SALA);}return m;}

/**
 * @param {any[]} salas lista agregada (local + irmãos)
 * @param {{mode:number,teamSize:number,shard:number,soft?:number,shardSoft?:number}} o
 * @returns {any|null} a sala escolhida, ou null = criar/escolher uma no shard local
 */
export function escolheSala(salas,{mode,teamSize,shard,soft=ROOM.SOFT,shardSoft=ROOM.SHARD_SOFT,restoMin=ROOM.ROUND_LEFT_MIN_S}){
  const carga=cargaPorShard(salas);
  const cabe=s=>(carga.get(s|0)||0)<shardSoft;
  // `open` é `Room.acceptsJoin` e diz mais que `players<max` (Battle Royale já em partida não recebe
  // ninguém); irmão em build antiga não o manda, e aí vale a conta velha.
  const abertas=(salas||[]).filter(r=>(r.open!==undefined?r.open:r.players<r.max)
    &&(r.mode|0)===(mode|0)&&((mode|0)===0||(r.teamSize|0)===(teamSize|0)))
    .sort((a,b)=>(b.players|0)-(a.players|0));
  // Sala do Livre com a rodada ACABANDO (`round` = segundos restantes; `null` = sem fim, e irmão em build
  // antiga não o manda) só serve quando não há outra: o novato cairia direto no pódio do BIG CRUNCH.
  // Só o Livre — a sala de BR aberta está no lobby, e lá o relógio ainda nem andou.
  const fim=r=>(mode|0)===0&&typeof r.round==='number'&&r.round<restoMin;
  // 1. a mais cheia que ainda AGRUPA (abaixo do teto da sala) num shard com folga
  const juntar=abertas.find(r=>(r.players|0)<soft&&cabe(r.shard)&&!fim(r));
  if(juntar)return juntar;
  // 2. nenhuma agrupa: sala NOVA aqui, se este shard tem folga. Vem antes do passo 3 de propósito — abrir
  //    sala num pod livre é melhor que empilhar mais um jogador num pod que já está no teto.
  if(cabe(shard))return null;
  // 3. este shard está no teto: a mais cheia entre as que ainda cabem em ALGUM irmão. Sem o teto da sala,
  //    porque aqui já não há folga em lugar nenhum e o que resta é não piorar o pod mais carregado. A que
  //    está acabando só entra se for a única.
  const irma=abertas.find(r=>cabe(r.shard)&&!fim(r))||abertas.find(r=>cabe(r.shard));
  if(irma)return irma;
  // 4. o cluster inteiro está no teto (o HPA ainda não subiu pod novo): a MENOS cheia das abertas — o
  //    contrário do que a regra velha fazia, e a única escolha que não afunda a sala que já está pior.
  const vivas=abertas.filter(r=>!fim(r)),pool=vivas.length?vivas:abertas;
  return pool.length?pool[pool.length-1]:null;
}
