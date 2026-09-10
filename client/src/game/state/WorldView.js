// ── VISÃO DO MUNDO: players (PLAYERS), placar (LEADERBOARD), self e listas prontas p/ render ──
// build(now) junta o Interpolator (outros) e o Predictor (próprias peças) em arrays reutilizados
// por tipo; cada item tem {id,kind,rx,ry,rr,alpha,flags,owner,…} — a mesma forma para os dois.
import {KIND,PLAYER_FLAG,NO_TEAM,VOICE,LEADERBOARD_EVERY,TICK_HZ,skinById,SKINS} from "@warspace/shared";

/**
 * QUEM LEVA A COROA — puro, para ser conferido em tabela (molde de game/quality.js e ui/roundClock.js).
 *
 * `rows` é o LEADERBOARD cru: todos os vivos, já ordenados por massa desc pelo servidor (2 Hz, fora da
 * AOI). O maior é `rows[0]` — mas trocar a coroa toda vez que ele mudar a faria PISCAR entre dois gigantes
 * dentro da precisão um do outro, meia vez por segundo, justo no duelo dos dois maiores com os dois na
 * tela, que é quando ela importa. Daí a folga: o desafiante só toma a coroa se for `keep` maior.
 *
 * ⚠️ O preço, declarado: a coroa pode discordar do "1º" do HUD por até 2% de massa e por uma amostra. O
 * número do HUD continua sendo a verdade crua; a coroa é uma leitura ESTÁVEL do mesmo dado.
 * ⚠️ Líder que SAI da lista (morreu, saiu) perde a coroa na hora — sem `atual` não há o que segurar.
 * @param {number} atual slot que está com a coroa (-1 = ninguém)
 * @param {{slot:number,mass:number}[]} rows @param {number} [keep]
 */
export function proximoLider(atual,rows,keep=LEAD_KEEP){
  if(!rows||!rows.length)return -1;
  const lider=rows[0];
  if(atual===lider.slot)return atual;
  const dono=rows.find(r=>r.slot===atual);
  return !dono||lider.mass>dono.mass*keep?lider.slot:atual;}

// A folga da coroa: 2% de massa.
const LEAD_KEEP=1.02;

export function createWorldView({buffer,predictor}){
  const players=new Map();
  const flags=new Map();   // slot → país (JSON `flags`, fora do fio binário — ver setFlags)
  const lbPrev=new Map(),lbNow=new Map();let lbAt=0;   // duas amostras do placar por slot: é o que dá movimento contínuo ao radar
  const LB_STEP_MS=LEADERBOARD_EVERY/TICK_HZ*1000;     // 500 ms entre amostras (LEADERBOARD_EVERY ticks a 60 Hz)
  const v={players,mySlot:-1,myTeam:-1,self:null,room:null,lb:[],lbRaw:[],
    pieces:[],food:[],ejected:[],asteroids:[],holes:[],missiles:[],stars:[],
    me(){return players.get(v.mySlot)||null;},
    setPlayers(list){const seen=new Set();
      for(const q of list){seen.add(q.slot);let pl=players.get(q.slot);
        if(!pl){pl={slot:q.slot,name:"",skinId:0,skin:SKINS[0],level:0,avatar:null,country:flags.get(q.slot)||null,isBot:false,dead:false,registered:false,score:0,team:-1,ally:false,talkWire:false,talkUntil:0};players.set(q.slot,pl);}
        pl.name=q.name;pl.skinId=q.skinId;pl.skin=skinById(q.skinId);
        pl.level=q.level|0;   // 0 = sem nível (bot, convidado ou sala sem persistência): a UI esconde o badge
        pl.isBot=!!(q.flags&PLAYER_FLAG.BOT);pl.dead=!!(q.flags&PLAYER_FLAG.DEAD);pl.registered=!!(q.flags&PLAYER_FLAG.REG);pl.score=q.score;
        pl.team=q.team===NO_TEAM?-1:q.team;pl.talkWire=!!(q.flags&PLAYER_FLAG.TALK);
        pl.ally=pl.team>=0&&pl.team===v.myTeam&&q.slot!==v.mySlot;}   // aliado: é assim que o render pinta o companheiro e o radar o separa do inimigo
      for(const s of players.keys())if(!seen.has(s))players.delete(s);
      v.rebuildLb();},
    // ⚠️ O LEADERBOARD chega a 2 Hz e traz a posição de TODOS os vivos — é a única fonte posicional fora da
    // AOI, e é dela que o radar vive. Desenhá-lo cru faz cada blip ANDAR AOS SALTOS meia vez por segundo.
    // Guardando a amostra anterior por slot, `lbRows()` devolve a posição interpolada e o movimento fica
    // contínuo. Custo: um Map de {x,y} e uma conta por blip. Nenhum byte novo de rede.
    setLeaderboard(rows){
      const t=performance.now();
      for(const r of rows){const p=lbPrev.get(r.slot),d=lbNow.get(r.slot);
        lbPrev.set(r.slot,d?{x:d.x,y:d.y}:{x:r.x,y:r.y});void p;
        lbNow.set(r.slot,{x:r.x,y:r.y});}
      for(const k of lbNow.keys())if(!rows.some(r=>r.slot===k)){lbNow.delete(k);lbPrev.delete(k);}
      lbAt=t;v.lbRaw=rows;v.rebuildLb();},
    /**
     * Push-to-talk de outro jogador, em TEMPO REAL (JSON `talk`, no instante do K dele). O clipe de áudio
     * só chega quando a tecla é solta, então esperar por ele deixaria o ícone sempre atrasado. O `talkWire` do
     * PLAYERS continua valendo em paralelo (é o que o placar já usava) — quem apagar primeiro apaga.
     * Guarda um PRAZO, não um bool: se o `off` se perder no caminho, o ícone apaga sozinho.
     */
    setTalking(slot,on){const pl=players.get(slot);if(!pl)return;
      pl.talkUntil=on?performance.now()+VOICE.MAX_MS+1000:0;v.rebuildLb();},
    /** Está falando agora? (fio OU aviso instantâneo ainda no prazo) */
    talkingNow(pl){return !!pl&&(pl.talkWire||(pl.talkUntil>0&&performance.now()<pl.talkUntil));},
    /** Minha equipe (do JSON `room`): recalcula quem é aliado sem esperar o próximo PLAYERS. */
    setMyTeam(t){v.myTeam=t;for(const pl of players.values())pl.ally=pl.team>=0&&pl.team===t&&pl.slot!==v.mySlot;},
    /** Slot de quem leva a coroa (o maior do mapa, com histerese). -1 = ninguém ainda. */
    leaderSlot:-1,
    rebuildLb(){const rows=v.lbRaw,out=new Array(rows.length);
      for(let i=0;i<rows.length;i++){const r=rows[i],pl=players.get(r.slot);out[i]={slot:r.slot,name:pl?pl.name:"?",mass:r.mass,x:r.x,y:r.y,level:pl?pl.level:0,country:pl?pl.country:null,isBot:pl?pl.isBot:false,registered:pl?pl.registered:false,ally:pl?pl.ally:false,talking:v.talkingNow(pl),me:r.slot===v.mySlot,rank:i+1};}
      // fora do top: anexa a própria linha (rank/massa vêm do bloco self do snapshot)
      if(v.mySlot>=0&&v.self&&v.self.rank>0&&!out.some(r=>r.me)){const pl=players.get(v.mySlot);
        out.push({slot:v.mySlot,name:pl?pl.name:"",mass:v.self.mass,x:0,y:0,level:pl?pl.level:0,country:pl?pl.country:null,isBot:false,registered:pl?pl.registered:false,ally:false,talking:false,me:true,rank:v.self.rank});}
      v.lb=out;
      // ── QUEM USA A COROA ──────────────────────────────────────────────────────────────────────────
      // O maior do MAPA sai do LEADERBOARD, que já chega a 2 Hz com TODOS os vivos e FORA da AOI, já
      // ordenado por massa: zero byte novo de protocolo, zero mudança no servidor, e o `?local=1` herda
      // de graça (o LocalServer manda a mesma lista).
      // ⚠️ `rows[0]`, e nunca `out[0]`: a linha PRÓPRIA é ANEXADA no fim quando eu estou fora do top, e
      // ela não passa pela ordenação — mas `out[0]` continua sendo o líder, então a diferença só apareceria
      // no dia em que alguém reordenasse `out`. Ler do cru é o que não depende disso.
      // ⚠️ HISTERESE: o novo só toma a coroa se for LEAD_KEEP maior que o atual. Sem ela, dois gigantes
      // dentro da precisão um do outro trocariam a cada amostra e a coroa piscaria meia vez por segundo —
      // justo no duelo dos dois maiores, com os dois na tela, que é quando ela importa. O preço, declarado:
      // ela pode discordar do "1º" do HUD por até 2% de massa e por uma amostra. O número do HUD continua
      // sendo a verdade crua; a coroa é uma leitura estável do MESMO dado.
      v.leaderSlot=proximoLider(v.leaderSlot,rows);
    },
    myRank(){for(const r of v.lb)if(r.me)return r.rank;return 0;},
    /**
     * Linhas do placar COM posição (o servidor manda todos os vivos): é a fonte do radar.
     * `suave` interpola entre as duas últimas amostras de 2 Hz — o radar pequeno melhora de graça e a
     * "visão em tempo real" da tela de morte fica com movimento contínuo em vez de saltos.
     */
    lbRows(suave=false){
      if(!suave||!lbAt)return v.lbRaw;
      const k=Math.min(1,(performance.now()-lbAt)/LB_STEP_MS);
      return v.lbRaw.map(r=>{const a=lbPrev.get(r.slot),b=lbNow.get(r.slot);
        return a&&b?{...r,x:a.x+(b.x-a.x)*k,y:a.y+(b.y-a.y)*k}:r;});},
    /**
     * Avatares (a skin "Retrato"). Vem em JSON de controle e não no fio: é uma skin de 25 mil moedas e
     * nível 30, então 4 bytes por linha em TODO broadcast de PLAYERS seriam pagar por zeros em 49 dos 50.
     */
    setAvatars(list){for(const pl of players.values())pl.avatar=null;
      for(const a of list||[]){const pl=players.get(a.slot);if(pl)pl.avatar=a.userId&&a.v?{userId:a.userId,v:a.v}:null;}},
    /**
     * BANDEIRAS. Mesmo caminho e mesmo motivo do avatar: dois bytes por linha em TODO broadcast de PLAYERS
     * para um dado que só muda quando alguém entra ou sai é caro. Vale para humano e para preenchimento —
     * uma sala com UMA bandeira acesa entre 49 vazias diz quem é gente antes de qualquer outra coisa.
     * ⚠️ Guardado num Map à parte, e não em `players`: o PLAYERS recria as linhas, e a bandeira chega
     * numa mensagem SEPARADA que pode ter vindo antes.
     */
    setFlags(list){flags.clear();for(const f of list||[])if(f&&f.c)flags.set(f.slot,f.c);
      for(const pl of players.values())pl.country=flags.get(pl.slot)||null;},
    playerOf(slot){return players.get(slot)||null;},
    build(){
      const P=v.pieces,F=v.food,E=v.ejected,A=v.asteroids,H=v.holes,M=v.missiles,S=v.stars;P.length=F.length=E.length=A.length=H.length=M.length=S.length=0;
      for(const e of buffer.entities.values()){if(e.gone||e.alpha<=0)continue;
        switch(e.kind){
          case KIND.PIECE:if(predictor.isOwn(e))continue;P.push(e);break;
          case KIND.FOOD:F.push(e);break;case KIND.EJECT:E.push(e);break;case KIND.ASTEROID:A.push(e);break;
          case KIND.BLACKHOLE:H.push(e);break;case KIND.MISSILE:M.push(e);break;case KIND.STAR:S.push(e);break;}}
      const al=predictor.alpha;predictor.forEach(pc=>{pc.rx=pc.px+(pc.x-pc.px)*al+pc.vox;pc.ry=pc.py+(pc.y-pc.py)*al+pc.voy;pc.rr=pc.r;pc.alpha=1;pc.isMe=true;P.push(pc);});   // interpolado entre passos
      P.sort((a,b)=>a.rr-b.rr);},
    reset(){players.clear();v.self=null;v.lb=[];v.lbRaw=[];v.mySlot=-1;v.myTeam=-1;v.room=null;},
  };
  return v;}
