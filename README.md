# Kart System v1 (Firebase)

Front-end puro (HTML/CSS/JS) hospedável no GitHub Pages, usando **Firestore** + **Storage** (sem backend, sem build).

## Arquitetura
- `index.html`: layout e navegação.
- `css/styles.css`: tema dark.
- `js/firebaseConfig.js`: inicialização Firebase (compat CDN).
- `js/constants.js`: senha ADM temporária, pontuação, tipos e seed.
- `js/utils.js`: utilitários gerais.
- `js/services/*`: Firestore, Storage, ranking e importação.
- `js/ui/*`: telas e eventos.
- `js/app.js`: bootstrap.

## Collections Firestore
- `campeonatos/{campeonatoId}`
- `pilotos/{driverId}`
- `campeonatos_pilotos/{campeonatoId}_{driverId}`
- `corridas/{corridaId}`
- `corridas/{corridaId}/resultados/{driverId}`
- `importacoes/{importacaoId}`
- `importacoes/{importacaoId}/arquivos/{tipoArquivo}`

## Storage
- `corridas/{campeonatoId}/{corridaId}/volta_a_volta/{nomeArquivo}`
- `corridas/{campeonatoId}/{corridaId}/classificacao/{nomeArquivo}`
- `corridas/{campeonatoId}/{corridaId}/resultado_final/{nomeArquivo}`

## GitHub Pages
1. Configure valores reais em `js/firebaseConfig.js`.
2. Faça push para branch publicada (ex: `main`).
3. Em **Settings > Pages**, selecione branch root.

## Regras temporárias (somente DEV)
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

> ⚠️ Inseguro para produção. Trocar por regras com autenticação/autorização.

## Segurança temporária
Senha ADM está no front (`123456`) e deve ser substituída por **Firebase Authentication** em produção.
