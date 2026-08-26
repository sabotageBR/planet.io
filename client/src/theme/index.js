// ── registro de temas + relógio por horário local ─────────────────────────────
// Ver docs/design/theme-time.md. Três temas (dawn/sunset/dusk) trocados pela hora
// local do jogador quando a preferência é "auto". A troca só seta
// html[data-theme="<id>"] (o CSS de cada tema já vem escopado por esse atributo —
// client/src/theme/all.css) e emite `planet:theme` na window para o Pixi invalidar o
// cache de texturas.
//   import {applyTheme,startThemeClock,currentTheme} from "./theme/index.js";
//   import "./theme/all.css";
//   applyTheme(resolveThemeId(prefs.theme));           // antes do primeiro paint
//   const stop=startThemeClock(()=>prefs.theme,(id,theme)=>renderer.invalidateTextures());
import dawn from "./dawn/index.js";
import sunset from "./sunset/index.js";
import dusk from "./dusk/index.js";

export const THEMES={dawn,sunset,dusk};
export const DEFAULT_THEME="dawn";
// horas locais [from,to); "to" acima de 24 atravessa a meia-noite (dusk: 20:00 → 04:59)
export const SCHEDULE=[{id:"dawn",from:5,to:16},{id:"sunset",from:16,to:20},{id:"dusk",from:20,to:29}];
export const THEME_PREFS=["auto","dawn","sunset","dusk"];

// 'auto' → pela hora local de `date`; qualquer outro id conhecido → ele mesmo
export function resolveThemeId(pref="auto",date=new Date()){
  if(pref&&pref!=="auto"&&THEMES[pref])return pref;
  const h=date.getHours()+date.getMinutes()/60;
  for(const s of SCHEDULE){if(h>=s.from&&h<s.to)return s.id;if(s.to>24&&h+24>=s.from&&h+24<s.to)return s.id;}
  return DEFAULT_THEME;}

let current=null;
// aplica o tema no <html> (data-theme); as variáveis CSS vêm de tokens.css, nada é setado em style.
// Emite window 'planet:theme' {detail:{id,theme,prev}} só quando o tema muda de fato.
export function applyTheme(id){
  const th=THEMES[id]||THEMES[DEFAULT_THEME],prev=current;
  const root=typeof document!=="undefined"?document.documentElement:null;
  const same=prev&&prev.id===th.id&&(!root||root.dataset.theme===th.id);
  current=th;
  if(root)root.dataset.theme=th.id;
  if(!same&&typeof window!=="undefined")window.dispatchEvent(new CustomEvent("planet:theme",{detail:{id:th.id,theme:th,prev:prev?prev.id:null}}));
  return th;}

export function currentTheme(){return current||THEMES[resolveThemeId("auto")];}

// reavalia a cada 60 s e na volta do foco (visibilitychange → visible); getPref() devolve 'auto'|id.
// Chama applyTheme quando muda e onChange(id,theme). Devolve stop(); stop.check() força uma reavaliação
// (útil logo depois de o usuário trocar a preferência).
export function startThemeClock(getPref=()=>"auto",onChange=null,{interval=60000}={}){
  const check=()=>{const id=resolveThemeId(getPref());
    if(!current||current.id!==id||(typeof document!=="undefined"&&document.documentElement.dataset.theme!==id)){applyTheme(id);if(onChange)onChange(id,current);}
    return id;};
  check();
  const timer=setInterval(check,interval);
  const onVis=()=>{if(document.visibilityState==="visible")check();};
  if(typeof document!=="undefined")document.addEventListener("visibilitychange",onVis);
  const stop=()=>{clearInterval(timer);if(typeof document!=="undefined")document.removeEventListener("visibilitychange",onVis);};
  stop.check=check;return stop;}
