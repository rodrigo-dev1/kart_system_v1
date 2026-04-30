const firebaseConfig = {
  apiKey: "PREENCHER_COM_API_KEY_WEB",
  authDomain: "kart-v1.firebaseapp.com",
  projectId: "kart-v1",
  storageBucket: "kart-v1.appspot.com",
  messagingSenderId: "PREENCHER",
  appId: "PREENCHER"
};

firebase.initializeApp(firebaseConfig);

window.AppFirebase = {
  db: firebase.firestore(),
  storage: firebase.storage()
};
