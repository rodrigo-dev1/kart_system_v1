const fs=window.FirestoreService,C=window.AppConstants;
function pontosPorPos(pos,mapa){return Number(mapa?.[pos]??(pos>=15?1:0));}
window.RankingService={
 async buscarDadosRanking(campeonatoId){const corridas=await fs.listarColecao('corridas',[['campeonatoId','==',campeonatoId]]);corridas.sort((a,b)=>a.etapa-b.etapa);const vinc=await fs.listarColecao('campeonatos_pilotos',[['campeonatoId','==',campeonatoId],['ativo','==',true]]);return{corridas,vinc};},
 async calcularRanking(campeonatoId){const camp=await fs.buscarDocumento('campeonatos',campeonatoId);const {corridas,vinc}=await this.buscarDadosRanking(campeonatoId);const allowed=new Set(vinc.map(v=>v.driverId));const map={};
 for(const corrida of corridas){const r=await fs.listarSub('corridas',corrida.id,'resultados');r.filter(x=>allowed.has(x.driverId)).forEach(x=>{const k=x.driverId;map[k]=map[k]||{driverId:k,piloto:x.pilotoNome,pontos:0,vitorias:0,p2:0,p3:0,poles:0,melhoresVoltas:0,corridas:0,ultimaPos:999};map[k].pontos+=Number(x.pontosTotal||0);if(x.posicaoPontuavel===1)map[k].vitorias++;if(x.posicaoPontuavel===2)map[k].p2++;if(x.posicaoPontuavel===3)map[k].p3++;if(x.pontoPole)map[k].poles++;if(x.pontoMelhorVolta)map[k].melhoresVoltas++;if(x.participou)map[k].corridas++;map[k].ultimaPos=x.posicaoPontuavel||999;});}
 return Object.values(map).sort((a,b)=>b.pontos-a.pontos||b.vitorias-a.vitorias||b.p2-a.p2||b.p3-a.p3||a.ultimaPos-b.ultimaPos);
 },
 aplicarPontuacao(pos,camp){return pontosPorPos(pos,camp?.pontuacao||C.PONTUACAO_PADRAO)}
};
