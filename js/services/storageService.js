window.StorageService={
 montarStoragePath:(campeonatoId,corridaId,tipo,nome)=>`corridas/${campeonatoId}/${corridaId}/${tipo}/${nome}`,
 async uploadArquivo(path,file){const ref=window.AppFirebase.storage.ref().child(path);await ref.put(file);return ref.getDownloadURL();}
};
