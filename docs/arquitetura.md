# Arquitetura alvo (faseada)

Este repositório entra em transição para separar **frontend** e **processor** sem quebrar o legado.

## Estado atual
- `index.html` + `script.js` (legado) continuam funcionando.

## Nova base criada
- `frontend/`: aplicação web (futuro React/Vite).
- `processor/`: processamento assíncrono de importações/ranking/histórico.
- `docs/`: documentação técnica.

## Estratégia
1. Manter legado operacional.
2. Extrair serviços de integração (Sheets/Firebase) primeiro.
3. Migrar telas por domínio (Importação, Campeonatos, Pilotos, Ranking, Histórico).
