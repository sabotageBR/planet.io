// Captura thumbnails (PNG) de cada modelo × tela × modo com o Chrome headless local,
// e com --bench roda o pior caso e grava shots/bench.json.
// uso: node mockups/v2/src/shots.js [--bench] [--only nebula] [--chrome /caminho/chrome]
const {execFileSync}=require("child_process"),fs=require("fs"),path=require("path");
const OUT=path.join(__dirname,".."),SHOTS=path.join(OUT,"shots");fs.mkdirSync(SHOTS,{recursive:true});
const args=process.argv.slice(2);const opt=(k,d)=>{const i=args.indexOf(k);return i>=0?args[i+1]:d;};
const CHROME=opt("--chrome",process.env.CHROME||"/usr/bin/google-chrome");
const ORDER=["nebula","console","orbit","toon","mono","cockpit","toon-candy","toon-neon","toon-comic","toon-sunset"].filter(id=>fs.existsSync(path.join(OUT,id+".html")));
const only=opt("--only",null);const models=only?ORDER.filter(x=>x===only):ORDER;
const SHOTS_LIST=[["entry",null],["account",null],["lobby",null],["rank",null],["profile",null],["shop",null],["prefs",null],["game",null],["dead",null],["reconn",null],
  ["game","portrait"],["entry","portrait"],["lobby","portrait"],["game","landscape"]];
const chrome=(extra,url)=>execFileSync(CHROME,["--headless=new","--hide-scrollbars","--disable-gpu","--no-first-run","--no-default-browser-check",
  "--force-device-scale-factor=1","--virtual-time-budget=6000",...extra,url],{stdio:["ignore","pipe","pipe"],timeout:60000});
const fileUrl=f=>"file://"+path.join(OUT,f);
// o headless=new captura a janela inteira (viewport + 87px); recorta com PIL
const crop=(f,rect)=>{try{execFileSync("python3",["-c",`from PIL import Image;im=Image.open("${f}");w,h=im.size;im.crop(${rect?"("+rect.join(",")+")":"(0,0,w,h-87)"}).convert("RGB").save("${f.replace(/\.png$/,".jpg")}",quality=85,optimize=True)`]);require("fs").unlinkSync(f);}catch(e){console.log("   (sem PIL: png não recortado)");}};
if(args.includes("--bench")){
  let bench={};try{bench=JSON.parse(fs.readFileSync(path.join(SHOTS,"bench.json"),"utf8"));}catch(e){}
  for(const id of models){
    for(const kind of ["heavy","light"]){
      const url=fileUrl(id+".html?bench&nobar"+(kind==="light"?"&leve":""));
      try{const dom=chrome(["--window-size=1920,1167","--virtual-time-budget=9000","--dump-dom"],url).toString();
        const m=/<title>BENCH ([^<]*)<\/title>/.exec(dom);if(!m){console.log("??  "+id+" "+kind+": sem título BENCH");continue;}
        const ms=/culling ON: [^=]*= ([\d.]+)ms/.exec(m[1]);
        bench[id]=Object.assign(bench[id]||{},{[kind]:ms?+ms[1]:null,[kind+"Txt"]:m[1].replace(/&amp;/g,"&")});
        console.log("ok  "+id+" "+kind+": "+(ms?ms[1]+" ms/quadro":"?"));}
      catch(e){console.log("ERR "+id+" "+kind+": "+(e.message||e).split("\n")[0]);}
    }
  }
  fs.writeFileSync(path.join(SHOTS,"bench.json"),JSON.stringify(bench,null,1));console.log("ok  shots/bench.json");
}else{
  for(const id of models)for(const [s,mode] of SHOTS_LIST){
    const f=path.join(SHOTS,`${id}-${s}${mode?"-"+mode:""}.png`);
    // headless=new desconta 87px de barra e impõe largura mínima ~500: o aparelho (390×844 / 844×390) fica centralizado
    // numa janela maior em escala 1 e o PNG é recortado para o retângulo dele
    const size=mode==="portrait"?"600,1000":mode==="landscape"?"900,600":"1280,887";
    const rect=mode==="portrait"?[105,34,495,878]:mode==="landscape"?[28,61,872,451]:null;
    const url=fileUrl(`${id}.html?shot=${s}&nobar${mode?"&mode="+mode+"&frame=0":""}`);
    try{chrome([`--window-size=${size}`,`--screenshot=${f}`],url);crop(f,rect);
      const j=f.replace(/\.png$/,".jpg");const kb=fs.statSync(fs.existsSync(j)?j:f).size/1024;console.log((kb>5?"ok  ":"??  ")+path.basename(fs.existsSync(j)?j:f)+"  "+kb.toFixed(0)+" KB");}
    catch(e){console.log("ERR "+path.basename(f)+": "+(e.message||e).split("\n")[0]);}
  }
}
