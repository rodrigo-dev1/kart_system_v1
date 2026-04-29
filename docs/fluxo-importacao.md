# Fluxo de importação (alvo)
1. Frontend envia arquivos para Firebase.
2. Job `process_import` lê arquivos e parseia resultado final.
3. Processor valida pilotos, vincula campeonato e calcula pontuação.
4. Resultado persistido em Sheets (legado) e/ou Firebase.
