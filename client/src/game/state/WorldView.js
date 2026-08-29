// ── VISÃO DO MUNDO: players (PLAYERS), placar (LEADERBOARD), self e listas prontas p/ render ──
// build(now) junta o Interpolator (outros) e o Predictor (próprias peças) em arrays reutilizados
// por tipo; cada item tem {id,kind,rx,ry,rr,alpha,flags,owner,…} — a mesma forma para os dois.
import {KIND,PLAYER_FLAG,NO_TEAM,VOICE,skinById,SKINS} from "@planet/shared";

export function createWorldView({buffer,predictor}){
  const players=new Map();
  const v={players,mySlot:-1,myTeam:-1,self:null,room:null,lb:[],lbRaw:[],
    pieces:[],food:[],ejected:[],asteroids:[],holes:[],missiles:[],stars:[],
    me(){return players.get(v.mySlot)||null;},
    setPlayers(list){const seen=new Set();
      for(const q of list){seen.add(q.slot);let pl=players.get(q.slot);
        if(!pl){pl={slot:q.slot,name:"",skinId:0,skin:SKINS[0],isBot:false,dead:false,registered:false,score:0,team:-1,ally:false,talkWire:false,talkUntil:0};players.set(q.slot,pl);}
        pl.name=q.name;pl.skinId=q.skinId;pl.skin=skinById(q.skinId);pl.isBot=!!(q.flags&PLAYER_FLAG.BOT);pl.dead=!!(q.flags&PLAYER_FLAG.DEAD);pl.registered=!!(q.flags&PLAYER_FLAG.REG);pl.score=q.score;
        pl.team=q.team===NO_TEAM?-1:q.team;pl.talkWire=!!(q.flags&PLAYER_FLAG.TALK);
        pl.ally=pl.team>=0&&pl.team===v.myTeam&&q.slot!==v.mySlot;}   // aliado: é assim que o render pinta o companheiro e o radar o separa do inimigo
      for(const s of players.keys())if(!seen.has(s))players.delete(s);
      v.rebuildLb();},
    setLeaderboard(rows){v.lbRaw=rows;v.rebuildLb();},
    /**
     * Push-to-talk de outro jogador, em TEMPO REAL (JSON `talk`, no instante do Ctrl dele). O clipe de áudio
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
    rebuildLb(){const rows=v.lbRaw,out=new Array(rows.length);
      for(let i=0;i<rows.length;i++){const r=rows[i],pl=players.get(r.slot);out[i]={slot:r.slot,name:pl?pl.name:"?",mass:r.mass,x:r.x,y:r.y,isBot:pl?pl.isBot:false,registered:pl?pl.registered:false,ally:pl?pl.ally:false,talking:v.talkingNow(pl),me:r.slot===v.mySlot,rank:i+1};}
      // fora do top: anexa a própria linha (rank/massa vêm do bloco self do snapshot)
      if(v.mySlot>=0&&v.self&&v.self.rank>0&&!out.some(r=>r.me)){const pl=players.get(v.mySlot);
        out.push({slot:v.mySlot,name:pl?pl.name:"",mass:v.self.mass,x:0,y:0,isBot:false,registered:pl?pl.registered:false,ally:false,talking:false,me:true,rank:v.self.rank});}
      v.lb=out;},
    myRank(){for(const r of v.lb)if(r.me)return r.rank;return 0;},
    /** Linhas do placar COM posição (o servidor manda todos os vivos): é a fonte do radar. */
    lbRows(){return v.lbRaw;},
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
