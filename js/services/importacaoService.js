const fs2=window.FirestoreService,st=window.StorageService,U=window.AppUtils,C2=window.AppConstants;
window.ImportacaoService={
 async salvarImportacao(ctx,files){const id=U.gerarId('import');const base={id,campeonatoId:ctx.campeonatoId,campeonatoNome:ctx.campeonatoNome,corridaId:ctx.corridaId,etapa:Number(ctx.etapa),dataCorrida:ctx.dataCorrida,status:'pendente',arquivosRecebidos:C2.TIPOS_ARQUIVO.map(t=>t.tipo),criadoEm:fs2.serverTimestamp(),atualizadoEm:fs2.serverTimestamp()};
 await fs2.criarDocumento('importacoes',id,base);
 for(const t of C2.TIPOS_ARQUIVO){const f=files[t.tipo];const p=st.montarStoragePath(ctx.campeonatoId,ctx.corridaId,t.tipo,f.name);const url=await st.uploadArquivo(p,f);await fs2.salvarSub('importacoes',id,'arquivos',t.tipo,{tipoArquivo:t.tipo,tipoLabel:t.label,nomeArquivo:f.name,mimeType:f.type||'',tamanhoBytes:f.size,storagePath:p,downloadURL:url,criadoEm:fs2.serverTimestamp()});}
 await fs2.atualizarDocumento('importacoes',id,{status:'processada',atualizadoEm:fs2.serverTimestamp()});return id;
 },
 async tentarExtrairResultadoFinal(file){const nome=(file?.name||'').toLowerCase();if(!(nome.endsWith('.html')||nome.endsWith('.htm')||nome.endsWith('.xml')))return[];const txt=await file.text();return this.identificarPilotosPorDriverId(txt);},
 identificarPilotosPorDriverId(txt){return [...txt.matchAll(/\b(\d{4,6})\b/g)].map(m=>m[1]);}
};
