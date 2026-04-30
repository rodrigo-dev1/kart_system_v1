const firebaseConfig = {
  apiKey: "AIzaSyC_ruvtoN9KFp9K4cuJeL17Z_KVN9tTO5s",
  authDomain: "kart-v1.firebaseapp.com",
  projectId: "kart-v1",
  storageBucket: "kart-v1.firebasestorage.app",
  messagingSenderId: "524238423587",
  appId: "1:524238423587:web:39d9d17963b4ee59ef5396"
};

firebase.initializeApp(firebaseConfig);

window.AppFirebase = {
  db: firebase.firestore(),
  storage: firebase.storage()
};
