const _db = () => {
  if (!window.AppFirebase?.db) throw new Error('Firebase não inicializado. Verifique firebaseConfig.js.');
  return window.AppFirebase.db;
};
const _ts = () => firebase.firestore.FieldValue.serverTimestamp();

window.FirestoreService = {
  serverTimestamp: _ts,
  async addDocument(collectionName, data) { try { const ref = await _db().collection(collectionName).add({ ...data, criadoEm: _ts(), atualizadoEm: _ts() }); return ref.id; } catch (e) { throw new Error(`Falha ao adicionar em ${collectionName}: ${e.message}`); } },
  async setDocument(collectionName, docId, data, merge = true) { try { await _db().collection(collectionName).doc(docId).set({ ...data, atualizadoEm: _ts() }, { merge }); } catch (e) { throw new Error(`Falha ao salvar ${collectionName}/${docId}: ${e.message}`); } },
  async updateDocument(collectionName, docId, data) { try { await _db().collection(collectionName).doc(docId).update({ ...data, atualizadoEm: _ts() }); } catch (e) { throw new Error(`Falha ao atualizar ${collectionName}/${docId}: ${e.message}`); } },
  async getDocument(collectionName, docId) { try { const d = await _db().collection(collectionName).doc(docId).get(); return d.exists ? d.data() : null; } catch (e) { throw new Error(`Falha ao buscar ${collectionName}/${docId}: ${e.message}`); } },
  async listDocuments(collectionName, orderByField = null, direction = 'asc') { try { let q = _db().collection(collectionName); if (orderByField) q = q.orderBy(orderByField, direction); const s = await q.get(); return s.docs.map((d) => d.data()); } catch (e) { throw new Error(`Falha ao listar ${collectionName}: ${e.message}`); } },
  async queryDocuments(collectionName, filters = [], orderByField = null, direction = 'asc') { try { let q = _db().collection(collectionName); filters.forEach(([f, op, v]) => q = q.where(f, op, v)); if (orderByField) q = q.orderBy(orderByField, direction); const s = await q.get(); return s.docs.map((d) => d.data()); } catch (e) { throw new Error(`Falha na consulta ${collectionName}: ${e.message}`); } },
  async deleteDocument(collectionName, docId) { try { await _db().collection(collectionName).doc(docId).delete(); } catch (e) { throw new Error(`Falha ao excluir ${collectionName}/${docId}: ${e.message}`); } },
  async setSubDocument(collectionName, docId, subcollection, subId, data) { try { await _db().collection(collectionName).doc(docId).collection(subcollection).doc(subId).set({ ...data, atualizadoEm: _ts() }, { merge: true }); } catch (e) { throw new Error(`Falha subdocumento ${collectionName}/${docId}/${subcollection}/${subId}: ${e.message}`); } },
  async listSubDocuments(collectionName, docId, subcollection) { try { const s = await _db().collection(collectionName).doc(docId).collection(subcollection).get(); return s.docs.map((d) => d.data()); } catch (e) { throw new Error(`Falha ao listar subcoleção ${subcollection}: ${e.message}`); } }
};
