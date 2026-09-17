// ── LOG (níveis, prefixo [shard N], stdout/stderr) ────────────────────────────
// @ts-check
import {config} from './config.js';
const LEVELS={debug:10,info:20,warn:30,error:40,silent:99};
// ── A ESCRITA É SÍNCRONA, E POR ISSO É CRONOMETRADA ──────────────────────────
// `process.stdout.write` num PIPE é síncrono no Linux (doc do Node: "Pipes and sockets: synchronous"), e num
// contêiner o stdout É um pipe — o dockerd lê a outra ponta. Com o buffer de 64 KiB cheio (nó com I/O
// pressionado, rotação de log), o `write` BLOQUEIA o event loop inteiro até alguém drenar. O volume daqui é
// baixo (~1 linha por join) e nada disso foi visto acontecer; o contador existe para a suspeita poder ser
// descartada com número no `/healthz`, em vez de com opinião.
const escrita={escritas:0,lentas:0,maxMs:0};
/** {escritas, lentas (>5 ms), maxMs} — do processo inteiro, todos os loggers. */
export const logStats=()=>({escritas:escrita.escritas,lentas:escrita.lentas,maxMs:Math.round(escrita.maxMs*10)/10});
const fmt=a=>a instanceof Error?(a.stack||a.message):typeof a==='object'&&a!==null?JSON.stringify(a):String(a);
/** @param {{level?:string,shard?:number,prefix?:string}} [o] */
export function createLogger(o={}){
  const min=LEVELS[o.level||config.logLevel]??LEVELS.info;const tag=o.prefix??`[shard ${o.shard??config.shard}]`;
  const emit=(lvl,args)=>{if(LEVELS[lvl]<min)return;const line=`${new Date().toISOString()} ${lvl.toUpperCase().padEnd(5)} ${tag} ${args.map(fmt).join(' ')}`;const t0=performance.now();(lvl==='error'||lvl==='warn'?process.stderr:process.stdout).write(line+'\n');
    const d=performance.now()-t0;escrita.escritas++;if(d>5)escrita.lentas++;if(d>escrita.maxMs)escrita.maxMs=d;};
  return{
    level:o.level||config.logLevel,
    debug:(...a)=>emit('debug',a),info:(...a)=>emit('info',a),warn:(...a)=>emit('warn',a),error:(...a)=>emit('error',a),
    child:prefix=>createLogger({...o,prefix:`${tag} ${prefix}`}),
  };
}
export const log=createLogger();
export default log;
