(function(){
const config={apiKey:'__PREENCHER__',authDomain:'__PREENCHER__',projectId:'__PREENCHER__',storageBucket:'__PREENCHER__',messagingSenderId:'__PREENCHER__',appId:'__PREENCHER__'};
firebase.initializeApp(config);
window.AppFirebase={db:firebase.firestore(),storage:firebase.storage(),firebase};
})();
