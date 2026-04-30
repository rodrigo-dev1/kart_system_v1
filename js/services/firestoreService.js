const db=window.AppFirebase.db;const ts=()=>window.AppFirebase.firebase.firestore.FieldValue.serverTimestamp();
window.FirestoreService={
 serverTimestamp:ts,async criarDocumento(c,id,data){await db.collection(c).doc(id).set(data);},
 async atualizarDocumento(c,id,data){await db.collection(c).doc(id).update(data);},
 async buscarDocumento(c,id){const d=await db.collection(c).doc(id).get();return d.exists?d.data():null;},
 async listarColecao(c,w){let q=db.collection(c);(w||[]).forEach(([f,o,v])=>q=q.where(f,o,v));const s=await q.get();return s.docs.map(x=>x.data());},
 async excluirDocumento(c,id){await db.collection(c).doc(id).delete();},
 async salvarSub(c,id,sub,subId,data){await db.collection(c).doc(id).collection(sub).doc(subId).set(data);},
 async listarSub(c,id,sub){const s=await db.collection(c).doc(id).collection(sub).get();return s.docs.map(d=>d.data());}
};
