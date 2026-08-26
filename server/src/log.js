// ── LOG (níveis, prefixo [shard N], stdout/stderr) ────────────────────────────
// @ts-check
import {config} from './config.js';
const LEVELS={debug:10,info:20,warn:30,error:40,silent:99};
const fmt=a=>a instanceof Error?(a.stack||a.message):typeof a==='object'&&a!==null?JSON.stringify(a):String(a);
/** @param {{level?:string,shard?:number,prefix?:string}} [o] */
export function createLogger(o={}){
  const min=LEVELS[o.level||config.logLevel]??LEVELS.info;const tag=o.prefix??`[shard ${o.shard??config.shard}]`;
  const emit=(lvl,args)=>{if(LEVELS[lvl]<min)return;const line=`${new Date().toISOString()} ${lvl.toUpperCase().padEnd(5)} ${tag} ${args.map(fmt).join(' ')}`;(lvl==='error'||lvl==='warn'?process.stderr:process.stdout).write(line+'\n');};
  return{
    level:o.level||config.logLevel,
    debug:(...a)=>emit('debug',a),info:(...a)=>emit('info',a),warn:(...a)=>emit('warn',a),error:(...a)=>emit('error',a),
    child:prefix=>createLogger({...o,prefix:`${tag} ${prefix}`}),
  };
}
export const log=createLogger();
export default log;
