const _storage = () => {
  if (!window.AppFirebase?.storage) throw new Error('Storage não inicializado.');
  return window.AppFirebase.storage;
};

window.StorageService = {
  montarPathArquivoCorrida(campeonatoId, corridaId, tipoArquivo, nomeArquivo) {
    return `corridas/${campeonatoId}/${corridaId}/${tipoArquivo}/${nomeArquivo}`;
  },
  async uploadArquivo(file, path, onProgress) {
    try {
      const ref = _storage().ref().child(path);
      const task = ref.put(file);
      await new Promise((resolve, reject) => {
        task.on('state_changed', (snap) => {
          if (onProgress) onProgress(Math.round((snap.bytesTransferred / snap.totalBytes) * 100));
        }, reject, resolve);
      });
      const downloadURL = await ref.getDownloadURL();
      return { storagePath: path, downloadURL };
    } catch (e) {
      throw new Error(`Falha no upload (${file?.name || 'arquivo'}): ${e.message}`);
    }
  },
  async getDownloadURL(path) { return _storage().ref().child(path).getDownloadURL(); }
};
