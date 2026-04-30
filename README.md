# Kart System v1 (GitHub Pages + Firebase Web SDK)

Projeto front-end puro (HTML/CSS/JavaScript) usando Firestore + Storage via CDN compat.

## Configuração Firebase Web (obrigatório)
Edite `js/firebaseConfig.js` com as credenciais **Web App** do Firebase (Project settings > General > Your apps > Web app config):
- `apiKey`
- `authDomain`
- `projectId`
- `storageBucket`
- `messagingSenderId`
- `appId`

> Não use Service Account no front-end.

## Segurança importante
Este projeto roda em GitHub Pages. Portanto, **nunca** coloque no repositório:
- service account JSON
- `private_key`
- `client_email`
- `firebase-admin`

Use apenas Firebase Web SDK e proteja acesso via Firestore/Storage Rules.

## Regras temporárias (apenas desenvolvimento)
Firestore:
```txt
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if true;
    }
  }
}
```
Storage:
```txt
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /{allPaths=**} {
      allow read, write: if true;
    }
  }
}
```
⚠️ Essas regras são apenas para desenvolvimento. Não usar em produção.

## Testar conexão Firebase
Na tela **Consultar Arquivos**, clique em **Testar conexão Firebase**.
- sucesso: “Conexão com Firestore OK.”
- falha: mensagem de erro de configuração/permissão.

## Publicação GitHub Pages
1. Commit/push na branch publicada.
2. GitHub > Settings > Pages > branch e pasta root.
3. Acesse a URL publicada.
