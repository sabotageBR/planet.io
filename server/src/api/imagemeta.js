// ── LEITOR DE CABEÇALHO DE IMAGEM (PNG e WebP), sem biblioteca ────────────────
// O `server/package.json` tem exatamente duas dependências (`pg` e `ws`), e o avatar não é motivo para uma
// terceira: para VALIDAR não é preciso decodificar a imagem, só ler os poucos bytes que dizem o formato e
// as dimensões. O que não dá para saber pelo cabeçalho — se os pixels são realmente uma foto — não seria
// resolvido por nenhuma biblioteca de imagem também.
//
// A defesa contra um arquivo disfarçado (um HTML com extensão .webp) não é este arquivo: é a RESPOSTA da
// leitura, que fixa o Content-Type pelo que foi detectado AQUI, mais `nosniff` e uma CSP que não deixa
// nada executar. Ver server/src/api/avatar.js.
// @ts-check

/** @returns {{mime:string,w:number,h:number}|null} */
export function probeImage(buf){
  if(!buf||buf.length<24)return null;
  // PNG: assinatura de 8 bytes + IHDR imediatamente depois (largura/altura em u32BE)
  if(buf.length>=26&&buf[0]===0x89&&buf.toString('latin1',1,4)==='PNG'&&buf[4]===0x0d&&buf[5]===0x0a&&buf[6]===0x1a&&buf[7]===0x0a){
    if(buf.toString('latin1',12,16)!=='IHDR')return null;
    const w=buf.readUInt32BE(16),h=buf.readUInt32BE(20),tipo=buf[25];
    if(!w||!h)return null;
    if(![2,3,6].includes(tipo))return null;   // truecolor, paleta ou truecolor+alfa: o que um recorte de foto gera
    return{mime:'image/png',w,h};}
  // WebP: RIFF....WEBP + um dos três fourcc
  if(buf.toString('latin1',0,4)==='RIFF'&&buf.toString('latin1',8,12)==='WEBP'){
    const cc=buf.toString('latin1',12,16);
    if(cc==='VP8 '){   // lossy
      if(buf.length<30)return null;
      if(!(buf[23]===0x9d&&buf[24]===0x01&&buf[25]===0x2a))return null;   // start code do keyframe
      return{mime:'image/webp',w:buf.readUInt16LE(26)&0x3fff,h:buf.readUInt16LE(28)&0x3fff};}
    if(cc==='VP8L'){   // lossless
      if(buf.length<25||buf[20]!==0x2f)return null;
      const b=buf.readUInt32LE(21);
      return{mime:'image/webp',w:(b&0x3fff)+1,h:((b>>>14)&0x3fff)+1};}
    if(cc==='VP8X'){   // estendido (alfa/animação): as dimensões vêm em 24 bits LE, menos um
      if(buf.length<30)return null;
      const w=(buf[24]|buf[25]<<8|buf[26]<<16)+1,h=(buf[27]|buf[28]<<8|buf[29]<<16)+1;
      return{mime:'image/webp',w,h};}
    return null;}
  return null;}
