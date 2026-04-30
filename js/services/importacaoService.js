window.ImportacaoService = {
  async salvarImportacao(payload) { return FirestoreService.setDocument('importacoes', payload.id, payload, true); },
  async salvarArquivoImportacao(importacaoId, tipoArquivo, metadata) { return FirestoreService.setSubDocument('importacoes', importacaoId, 'arquivos', tipoArquivo, metadata); },
  async tentarExtrairResultadoFinal(file) { const nome=(file?.name||'').toLowerCase(); if(!(nome.endsWith('.html')||nome.endsWith('.htm')||nome.endsWith('.xml'))) return []; const txt = await file.text(); return this.identificarPilotosPorDriverId(txt); },
  identificarPilotosPorDriverId(txt) { return [...txt.matchAll(/\b(\d{4,6})\b/g)].map((m) => m[1]); }
};
