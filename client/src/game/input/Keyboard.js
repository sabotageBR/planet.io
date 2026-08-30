// ── TECLADO: dividir e ejetar são CONFIGURÁVEIS; F = atirar, Q = trocar de arma, Ctrl = falar ──
// `inInput()` ignora tudo com o foco num campo de texto — é o que faz digitar no chat NÃO dividir o
// planeta, e vale de graça para o Ctrl também.
//
// O MAP era constante de módulo, ou seja, uma tabela só para o processo inteiro. Agora é montado POR
// INSTÂNCIA a partir das prefs (`keySplit`/`keyEject`, ver shared/constants.js ACTION_KEYS) e refeito
// no `setKeys` — o motor já repassa as prefs em tempo real (game/index.js), então trocar a tecla na
// tela de opções vale na partida em curso, sem recarregar.
import {ACTION_KEYS} from "@warspace/shared";
const FIXAS={KeyF:"fire",KeyQ:"swap",ControlLeft:"talk",ControlRight:"talk",ArrowLeft:"specPrev",ArrowRight:"specNext"};   // as setas só fazem algo com o jogador morto (trocar de câmera)
const PADRAO={split:"Space",eject:"KeyW"};
/**
 * Monta a tabela `code → ação`. Duas guardas: code fora da lista compartilhada cai no padrão (perfil
 * antigo ou adulterado), e as duas ações na MESMA tecla também — senão a segunda sobrescreveria a
 * primeira no objeto e a ação perdida ficaria sem tecla nenhuma, sem nada na tela dizendo por quê.
 */
function montaMap(prefs){
  const ok=k=>typeof k==="string"&&ACTION_KEYS.includes(k)?k:null;
  const split=ok(prefs&&prefs.keySplit)||PADRAO.split;
  let eject=ok(prefs&&prefs.keyEject)||PADRAO.eject;
  if(eject===split)eject=split===PADRAO.eject?PADRAO.split:PADRAO.eject;
  const m={...FIXAS};m[split]="split";m[eject]="eject";return m;}
export function createKeyboard({onAction,enabled=()=>true,prefs=null}){
  const held=new Set();let MAP=montaMap(prefs);
  const inInput=()=>{const a=document.activeElement;return a&&/INPUT|SELECT|TEXTAREA/.test(a.tagName);};
  const kd=e=>{const a=MAP[e.code];if(!a||inInput()||!enabled())return;if(e.code==="Space"||a==="talk")e.preventDefault();if(e.repeat||held.has(a))return;held.add(a);onAction(a,"down");};   // sem preventDefault o Ctrl continua abrindo atalho do navegador
  const ku=e=>{const a=MAP[e.code];if(!a)return;if(held.delete(a))onAction(a,"up");};
  const blur=()=>{for(const a of held)onAction(a,"up");held.clear();};
  addEventListener("keydown",kd);addEventListener("keyup",ku);addEventListener("blur",blur);
  return{
    /** Prefs novas: refaz o MAP e SOLTA o que estava segurado — a tecla velha nunca receberá o keyup. */
    setKeys(p){const antes=MAP;MAP=montaMap(p);if(antes!==MAP)blur();},
    destroy(){removeEventListener("keydown",kd);removeEventListener("keyup",ku);removeEventListener("blur",blur);}};}
/** A tecla que está de fato ligada a cada ação (o HUD desenha isto em `#hud-cd`; mentir ali é pior que não mostrar). */
export function keysOf(prefs){const m=montaMap(prefs),out={split:PADRAO.split,eject:PADRAO.eject};
  for(const [code,acao] of Object.entries(m))if(acao==="split"||acao==="eject")out[acao]=code;
  return out;}
