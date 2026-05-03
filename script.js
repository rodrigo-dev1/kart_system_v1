const firebaseConfig = {
    apiKey: "AIzaSyC_ruvtoN9KFp9K4cuJeL17Z_KVN9tTO5s",
    authDomain: "kart-v1.firebaseapp.com",
    projectId: "kart-v1",
    storageBucket: "kart-v1.firebasestorage.app",
    messagingSenderId: "524238423587",
    appId: "1:524238423587:web:39d9d17963b4ee59ef5396",
    measurementId: "G-C1EG0T5VS8"
};

firebase.initializeApp(firebaseConfig);
const firestore = firebase.firestore();

const COLLECTION_CAMPEONATOS = "campeonato";
const COLLECTION_PILOTOS = "Pilotos";
const COLLECTION_BACKUPS = "backups_importacao";

const URL_API = "https://script.google.com/macros/s/AKfycbwWIL3hrPq6w6pCjCS5-ZYwv3hAY8Rr1ZjYxC-tEh7f9enmpTsZ7fzu9ilWpioQGQEc/exec";

let DB = {
    campeonatos: [],
    pilotos: [],
    resultados: []
};

let HISTORICO_CACHE = [];
let abaGestaoAtual = "campeonatos";
let campeonatoEditando = null;
let pilotoEditando = null;

let IMPORTACAO_PREVIA = [];
let IMPORTACAO_PYSCRIPT = [];
let IMPORTACAO_PYSCRIPT_ARQUIVO = "";
let IMPORTACAO_PYSCRIPT_TIPO = "";
let IMPORTACAO_PREVIA_GERADA = false;

let RANKING_FIRESTORE_CACHE = [];

const PONTOS_PADRAO = {
    1: 20,
    2: 17,
    3: 15,
    4: 13,
    5: 11,
    6: 9,
    7: 7,
    8: 5,
    9: 3,
    10: 1
};

const TIPOS_ARQUIVO = [
    { tipo: "resultado_final", label: "Resultado final", usaPreview: true },
    { tipo: "classificacao", label: "Classificação", usaPreview: true },
    { tipo: "volta_a_volta", label: "Volta a volta", usaPreview: false }
];

async function fetchData() {
    const loading = document.getElementById("loading");

    try {
        if (loading) loading.innerHTML = "Sincronizando Firebase...";

        await carregarDadosBaseFirestore();
        popularFiltros();
        renderGestao();
        await inicializarRankingFirestore();

        if (loading) loading.style.display = "none";
    } catch (e) {
        console.error(e);
        if (loading) loading.innerHTML = `Erro ao carregar dados do Firebase: ${htmlEscape(e.message || e)}`;
    }
}

async function carregarDadosBaseFirestore() {
    const campeonatosSnapshot = await firestore.collection(COLLECTION_CAMPEONATOS).get();
    const pilotosSnapshot = await firestore.collection(COLLECTION_PILOTOS).get();

    const campeonatos = [];
    campeonatosSnapshot.forEach(doc => {
        const data = doc.data() || {};
        campeonatos.push({
            ...data,
            id: doc.id,
            nome: data.nome || data.nome_exibicao || doc.id,
            descricao: data.descricao || data["descrição"] || "",
            data_inicio: data.data_inicio || data["data de inicio"] || "",
            data_fim: data.data_fim || data["data de fim"] || ""
        });
    });

    const pilotos = [];
    pilotosSnapshot.forEach(doc => {
        const data = doc.data() || {};
        const idPiloto = String(data.id_piloto || data.driver_id || doc.id || "").trim();
        const nome = data.nome || data.driver_name || "";

        pilotos.push({
            ...data,
            id: doc.id,
            id_piloto: idPiloto,
            driver_id: idPiloto,
            nome,
            driver_name: data.driver_name || nome,
            apelido: data.apelido || "",
            campeonatos: extrairCampeonatosDoPilotoExistente(data),
            vinculos: extrairCampeonatosDoPilotoExistente(data)
        });
    });

    campeonatos.sort((a, b) => String(a.nome || "").localeCompare(String(b.nome || "")));
    pilotos.sort((a, b) => String(a.nome || a.driver_name || "").localeCompare(String(b.nome || b.driver_name || "")));

    DB = {
        campeonatos,
        pilotos,
        resultados: []
    };
}

function show(id) {
    document.querySelectorAll(".section").forEach(s => s.classList.remove("active"));
    const el = document.getElementById(id);
    if (el) el.classList.add("active");

    if (id === "dash") {
        inicializarRankingFirestore();
    }
}

function htmlEscape(v) {
    return String(v ?? "").replace(/[&<>'"]/g, c => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        "'": "&#39;",
        '"': "&quot;"
    }[c]));
}

function normalizarChave(v) {
    return String(v || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-zA-Z0-9_-]/g, "_")
        .toLowerCase();
}

function normalizarDocId(v) {
    return normalizarChave(v).replace(/^_+|_+$/g, "").slice(0, 700) || "sem_id";
}

function hojeISO() {
    return new Date().toISOString().slice(0, 10);
}

function formatarDataBR(dataISO) {
    if (!dataISO) return "-";

    const base = String(dataISO).split("T")[0].split(" ")[0];
    const p = base.split("-");

    return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : base;
}

function formatarDataISO(dataISO) {
    if (!dataISO) return "";
    return String(dataISO).split("T")[0].split(" ")[0];
}

function paraTimestamp(dataISO) {
    const base = formatarDataISO(dataISO);
    const t = new Date(`${base}T00:00:00Z`).getTime();

    return Number.isNaN(t) ? 0 : t;
}

function extrairDataItem(item) {
    if (item.dataCorrida) return item.dataCorrida;
    if (item.dataUploadISO) return item.dataUploadISO.slice(0, 10);

    const m = String(item.dataUpload || "").match(/(\d{2})\/(\d{2})\/(\d{4})/);

    if (m) return `${m[3]}-${m[2]}-${m[1]}`;

    return hojeISO();
}

function arquivoParaDataUrl(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;

        reader.readAsDataURL(file);
    });
}

function getPilotoCampo(p, ...keys) {
    const achado = keys.find(k => p && p[k] !== undefined && p[k] !== null);
    return achado ? p[achado] : "";
}

function vinculosPiloto(p) {
    const bruto = getPilotoCampo(p, "campeonatos", "vinculos");

    if (Array.isArray(bruto)) {
        return bruto.map(v => String(v || "").trim()).filter(Boolean);
    }

    return String(bruto || "")
        .split(",")
        .map(v => v.trim())
        .filter(Boolean);
}

function pilotosDoCampeonato(campeonato) {
    return DB.pilotos.filter(p => vinculosPiloto(p).includes(campeonato));
}

function getTipoArquivoSelecionado() {
    const tipo = document.getElementById("imp_tipo_arquivo")?.value || "";
    return TIPOS_ARQUIVO.find(item => item.tipo === tipo) || null;
}

function isArquivoTexto(file) {
    if (!file) return false;

    const nome = (file.name || "").toLowerCase();
    const mime = (file.type || "").toLowerCase();

    return mime.includes("html") ||
        mime.includes("text") ||
        mime.includes("xml") ||
        nome.endsWith(".html") ||
        nome.endsWith(".htm") ||
        nome.endsWith(".xml") ||
        nome.endsWith(".txt");
}

function limparEstadoImportacao() {
    IMPORTACAO_PREVIA = [];
    IMPORTACAO_PREVIA_GERADA = false;

    const preview = document.getElementById("previewImportacao");
    const btn = document.getElementById("btnConfirmarImportacao");

    if (preview) preview.innerHTML = "";
    if (btn) btn.style.display = "none";
}

function onTipoArquivoImportChange() {
    IMPORTACAO_PYSCRIPT = [];
    IMPORTACAO_PYSCRIPT_ARQUIVO = "";
    IMPORTACAO_PYSCRIPT_TIPO = "";

    const cfg = getTipoArquivoSelecionado();
    const label = document.getElementById("labelFileImportacao");
    const fileInput = document.getElementById("fileImportacaoUnico");
    const pyStatus = document.getElementById("pyStatus");

    limparEstadoImportacao();

    if (fileInput) fileInput.value = "";

    if (!cfg) {
        if (label) label.textContent = "Arquivo";
        if (pyStatus) pyStatus.innerHTML = "Selecione o tipo de arquivo e depois escolha o arquivo.";
        return;
    }

    if (label) label.textContent = `Arquivo — ${cfg.label}`;

    if (pyStatus) {
        pyStatus.innerHTML = cfg.usaPreview
            ? `✅ Tipo selecionado: ${cfg.label}. Escolha o arquivo para liberar a lista única de importação abaixo.`
            : `ℹ️ Tipo selecionado: ${cfg.label}. Este arquivo será salvo no Firestore, sem prévia de pilotos.`;
    }
}

window.onTipoArquivoImportChange = onTipoArquivoImportChange;

async function atualizarPreviewImportacaoAtual() {
    const campeonato = document.getElementById("imp_camp")?.value || "";

    if (IMPORTACAO_PREVIA.length && campeonato) {
        await marcarPilotosJaVinculadosAoCampeonato(campeonato, true);
    }
}

window.atualizarPreviewImportacaoAtual = atualizarPreviewImportacaoAtual;

function getCampeonatoFirestoreRef(campeonato) {
    const campeonatoDocId = normalizarDocId(campeonato);

    return {
        campeonatoDocId,
        ref: firestore.collection(COLLECTION_CAMPEONATOS).doc(campeonatoDocId)
    };
}

function getResultadoFinalDocId(etapa, dataCorrida) {
    const etapaId = normalizarDocId(`etapa_${etapa || "sem_etapa"}`);
    const dataId = normalizarDocId(dataCorrida || hojeISO());

    return `${etapaId}_${dataId}`;
}

function toFirestoreSafe(value) {
    if (value === undefined) return null;
    if (value === null) return null;

    if (typeof value === "number") {
        return Number.isFinite(value) ? value : null;
    }

    if (typeof value === "string" || typeof value === "boolean") {
        return value;
    }

    if (Array.isArray(value)) {
        return value.map(toFirestoreSafe);
    }

    if (typeof value === "object") {
        const out = {};

        Object.entries(value).forEach(([key, val]) => {
            if (val !== undefined) out[key] = toFirestoreSafe(val);
        });

        return out;
    }

    return String(value);
}

function tempoParaSegundosJS(valor) {
    if (valor === undefined || valor === null || valor === "") return null;

    if (typeof valor === "number") {
        return Number.isFinite(valor) ? valor : null;
    }

    const texto = String(valor).trim().replace(",", ".");

    if (!texto) return null;

    if (/^\d+:\d{2}(\.\d+)?$/.test(texto)) {
        const partes = texto.split(":");
        const minutos = Number(partes[0]);
        const segundos = Number(partes[1]);

        if (Number.isFinite(minutos) && Number.isFinite(segundos)) {
            return Number((minutos * 60 + segundos).toFixed(3));
        }

        return null;
    }

    if (/^\d+(\.\d+)?$/.test(texto)) {
        const segundos = Number(texto);
        return Number.isFinite(segundos) ? segundos : null;
    }

    return null;
}

function obterMelhorTempoSegundos(item) {
    const porCampoNumerico = tempoParaSegundosJS(item.melhor_tempo_segundos);

    if (porCampoNumerico !== null) return porCampoNumerico;

    return tempoParaSegundosJS(item.melhor_tempo);
}

function extrairCampeonatosDoPilotoExistente(data) {
    const bruto = data?.campeonatos || data?.vinculos || [];

    if (Array.isArray(bruto)) {
        return bruto.map(v => String(v || "").trim()).filter(Boolean);
    }

    return String(bruto || "")
        .split(",")
        .map(v => v.trim())
        .filter(Boolean);
}

async function marcarPilotosJaVinculadosAoCampeonato(campeonato, exibirHint = true) {
    if (!campeonato || !IMPORTACAO_PREVIA.length) return;

    const status = document.getElementById("statusImport");
    const cfg = getTipoArquivoSelecionado();
    const tipoArquivo = cfg?.tipo || IMPORTACAO_PREVIA[0]?.tipoArquivo || "";
    const deveCalcular = tipoArquivo === "resultado_final" || tipoArquivo === "classificacao";

    try {
        if (status) {
            status.innerHTML = "⏳ Verificando pilotos já vinculados ao campeonato no Firestore...";
        }

        await carregarDadosBaseFirestore();

        for (const item of IMPORTACAO_PREVIA) {
            const idPiloto = String(item.driver_id || item.id_piloto || "").trim();

            item.checked = false;

            if (!idPiloto) {
                item.status = "Sem id_piloto no arquivo";
                continue;
            }

            const pilotoExistente = DB.pilotos.find(p =>
                String(p.driver_id || p.id_piloto || p.id || "").trim() === idPiloto ||
                String(p.id || "").trim() === normalizarDocId(idPiloto)
            );

            if (!pilotoExistente) {
                item.status = "Será cadastrado automaticamente";
                continue;
            }

            const campeonatos = vinculosPiloto(pilotoExistente);

            if (campeonatos.includes(campeonato)) {
                item.checked = true;
                item.status = "Piloto já está neste campeonato";
            } else {
                item.checked = false;
                item.status = "Piloto existe; será vinculado ao campeonato se marcado";
            }

            if (!item.driver_name && pilotoExistente.nome) {
                item.driver_name = pilotoExistente.nome;
            }
        }

        recalcularPreviewImportacao(campeonato, exibirHint, deveCalcular);

        const selecionados = IMPORTACAO_PREVIA.filter(i => i.checked && !i.conflitoId).length;

        if (status) {
            status.innerHTML = selecionados
                ? `✅ ${selecionados} piloto(s) já estavam vinculados ao campeonato e foram marcados automaticamente.`
                : "✅ Verificação concluída. Nenhum piloto do arquivo estava vinculado a este campeonato.";
        }
    } catch (e) {
        console.error(e);

        if (status) {
            status.innerHTML = `⚠️ Não foi possível verificar os pilotos na collection Pilotos: ${htmlEscape(e.message || e)}`;
        }

        recalcularPreviewImportacao(campeonato, exibirHint, deveCalcular);
    }
}

async function prepararDocumentoCampeonato(campeonato) {
    const { campeonatoDocId, ref } = getCampeonatoFirestoreRef(campeonato);
    const snap = await ref.get();

    await ref.set({
        id: campeonatoDocId,
        nome: snap.exists ? (snap.data()?.nome || campeonato) : campeonato,
        atualizadoEmISO: new Date().toISOString(),
        estrutura: `${COLLECTION_CAMPEONATOS}/${campeonatoDocId}`
    }, { merge: true });

    return {
        campeonatoDocId,
        campRef: ref
    };
}

function montarBackupPayload({ campeonato, etapa, dataCorrida, cfg, file, conteudoRaw, dataUrl, idUnico }) {
    const limiteSeguroFirestoreBytes = 850000;
    const arquivoPequeno = Number(file.size || 0) <= limiteSeguroFirestoreBytes;

    return toFirestoreSafe({
        idImportacao: idUnico,
        campeonato,
        campeonato_id: normalizarDocId(campeonato),
        etapa: Number(etapa),
        dataCorrida,
        tipoArquivo: cfg.tipo,
        tipoLabel: cfg.label,
        nomeArquivo: file.name,
        mimeType: file.type || (file.name.toLowerCase().endsWith(".pdf") ? "application/pdf" : "text/html"),
        tamanhoBytes: file.size,
        dataUpload: new Date().toLocaleString("pt-BR"),
        dataUploadISO: new Date().toISOString(),
        arquivoCompletoSalvoNoFirestore: arquivoPequeno,
        avisoArquivo: arquivoPequeno
            ? "Arquivo salvo no documento global de backup."
            : "Arquivo acima do limite seguro do Firestore. Salvei os metadados e os dados extraídos dos pilotos.",
        dataUrl: arquivoPequeno ? dataUrl : "",
        conteudo: arquivoPequeno ? conteudoRaw : ""
    });
}

async function salvarBackupImportacaoNoFirestore(backupPayload) {
    const backupId = backupPayload.idImportacao;
    const caminhoGlobal = `${COLLECTION_BACKUPS}/${backupId}`;

    await firestore.collection(COLLECTION_BACKUPS).doc(backupId).set({
        ...backupPayload,
        caminhoFirestore: caminhoGlobal,
        atualizadoEmISO: new Date().toISOString()
    }, { merge: true });

    return {
        backupId,
        caminhoFirestore: caminhoGlobal
    };
}

async function salvarArquivoSemPreviewNoFirestore({ campeonato, etapa, dataCorrida, cfg, backupPayload, backupId }) {
    const { campeonatoDocId, campRef } = await prepararDocumentoCampeonato(campeonato);

    const destino = cfg.tipo || "arquivo";
    const docId = `${getResultadoFinalDocId(etapa, dataCorrida)}_${normalizarDocId(backupId)}`;
    const ref = campRef.collection(destino).doc(docId);

    await ref.set(toFirestoreSafe({
        ...backupPayload,
        idImportacao: backupId,
        campeonato,
        campeonato_id: campeonatoDocId,
        etapa: Number(etapa),
        dataCorrida,
        tipoArquivo: cfg.tipo,
        nomeArquivo: backupPayload.nomeArquivo || "",
        caminhoBackup: `${COLLECTION_BACKUPS}/${backupId}`,
        caminhoFirestore: `${COLLECTION_CAMPEONATOS}/${campeonatoDocId}/${destino}/${docId}`,
        criadoEmISO: new Date().toISOString(),
        atualizadoEmISO: new Date().toISOString()
    }), { merge: true });

    return `${COLLECTION_CAMPEONATOS}/${campeonatoDocId}/${destino}/${docId}`;
}

async function salvarPilotoGlobalNoFirestore(p, campeonato) {
    const idPilotoBruto = String(p.driver_id || p.id_piloto || "").trim();

    if (!idPilotoBruto) {
        console.warn("Piloto sem id_piloto não foi cadastrado na collection Pilotos:", p);
        return;
    }

    const pilotoDocId = normalizarDocId(idPilotoBruto);
    const pilotoRef = firestore.collection(COLLECTION_PILOTOS).doc(pilotoDocId);
    const snapshot = await pilotoRef.get();

    const dadosAtuais = snapshot.exists ? snapshot.data() : {};
    const campeonatosAtuais = extrairCampeonatosDoPilotoExistente(dadosAtuais);

    if (!campeonatosAtuais.includes(campeonato)) {
        campeonatosAtuais.push(campeonato);
    }

    await pilotoRef.set(toFirestoreSafe({
        id_piloto: idPilotoBruto,
        driver_id: idPilotoBruto,
        nome: p.driver_name || dadosAtuais.nome || "",
        driver_name: p.driver_name || dadosAtuais.driver_name || "",
        apelido: dadosAtuais.apelido || "",
        campeonatos: campeonatosAtuais,
        origemCadastro: snapshot.exists
            ? dadosAtuais.origemCadastro || "cadastro_existente"
            : "importacao_arquivo",
        atualizadoEmISO: new Date().toISOString(),
        criadoEmISO: dadosAtuais.criadoEmISO || new Date().toISOString()
    }), { merge: true });
}

async function salvarPilotosImportadosNoFirestore({ campeonato, selecionados }) {
    for (const p of selecionados) {
        await salvarPilotoGlobalNoFirestore(p, campeonato);
    }
}

function selectEndFirebasePayload(item, contexto) {
    return toFirestoreSafe({
        arquivo_origem: item.arquivo_origem || contexto.nomeArquivo || "",
        evento: item.evento || "",
        driver_id: item.driver_id || "",
        driver_name: item.driver_name || "",
        diff: item.diff || "",
        total_tempo: item.total_tempo || "",
        posicao_final2: Number(item.posicao_final2 || 0),
        pontos: Number(item.pontos || 0),
        melhor_tempo_ponto: Number(item.melhor_tempo_ponto || 0)
    });
}

async function salvarSelecionadosNoFirestore({ campeonato, etapa, dataCorrida, cfg, selecionados, nomeArquivo, backupId = "" }) {
    const { campeonatoDocId, campRef } = await prepararDocumentoCampeonato(campeonato);

    const resultadoDocId = getResultadoFinalDocId(etapa, dataCorrida);
    const importId = backupId || `${dataCorrida}_${normalizarChave(campeonato)}_${cfg.tipo}_etapa_${etapa}_${Date.now()}`;
    const resultadoDocRef = campRef.collection("resultado_final").doc(resultadoDocId);
    const agoraISO = new Date().toISOString();

    await resultadoDocRef.set(toFirestoreSafe({
        campeonato,
        campeonato_id: campeonatoDocId,
        etapa: Number(etapa),
        dataCorrida,
        resultadoDocId,
        atualizadoEmISO: agoraISO,
        caminhoBackup: backupId ? `${COLLECTION_BACKUPS}/${backupId}` : "",
        caminhoFirestore: `${COLLECTION_CAMPEONATOS}/${campeonatoDocId}/resultado_final/${resultadoDocId}`
    }), { merge: true });

    await salvarPilotosImportadosNoFirestore({
        campeonato,
        selecionados
    });

    const batch = firestore.batch();
    const subcollectionName = cfg.tipo === "classificacao" ? "classificacao" : "pilotos_resultado";
    const resumoField = cfg.tipo === "classificacao" ? "classificacaoResumo" : "resultadoFinalResumo";

    selecionados.forEach((p, idx) => {
        const itemId = normalizarDocId(p.driver_id || p.driver_name || `piloto_${idx + 1}`);
        const ref = resultadoDocRef.collection(subcollectionName).doc(itemId);

        batch.set(ref, toFirestoreSafe({
            ...selectEndFirebasePayload(p, { nomeArquivo }),
            campeonato,
            campeonato_id: campeonatoDocId,
            etapa: Number(etapa),
            dataCorrida,
            tipoArquivo: cfg.tipo,
            tipoLabel: cfg.label,
            idImportacao: importId,
            nomeArquivo: nomeArquivo || "",
            id_piloto: p.driver_id || "",
            posicao_geral_arquivo: Number(p.posicao_final || p.pos || p.posicao_geral_arquivo || 0),
            kart_numero: p.kart_numero || "",
            melhor_tempo: p.melhor_tempo || "",
            melhor_tempo_segundos: p.melhor_tempo_segundos ?? null,
            melhor_tempo_ponto: Number(p.melhor_tempo_ponto || 0),
            total_tempo_segundos: p.total_tempo_segundos ?? null,
            voltas: p.voltas ?? null,
            classe: p.classe || "",
            comentarios: p.comentarios || "",
            caminhoBackup: backupId ? `${COLLECTION_BACKUPS}/${backupId}` : "",
            criadoEmISO: agoraISO,
            atualizadoEmISO: agoraISO
        }), { merge: true });
    });

    batch.set(resultadoDocRef, toFirestoreSafe({
        [resumoField]: {
            tipoArquivo: cfg.tipo,
            tipoLabel: cfg.label,
            idImportacao: importId,
            nomeArquivo: nomeArquivo || "",
            qtdSelecionados: selecionados.length,
            atualizadoEmISO: agoraISO,
            pilotosSelecionados: selecionados.map((p, idx) => ({
                ordem: idx + 1,
                id_piloto: p.driver_id || "",
                driver_id: p.driver_id || "",
                driver_name: p.driver_name || "",
                posicao_geral_arquivo: Number(p.posicao_final || p.pos || p.posicao_geral_arquivo || 0),
                posicao_final2: Number(p.posicao_final2 || 0),
                pontos: Number(p.pontos || 0),
                melhor_tempo: p.melhor_tempo || "",
                melhor_tempo_ponto: Number(p.melhor_tempo_ponto || 0)
            }))
        },
        ultimoTipoArquivoImportado: cfg.tipo,
        ultimoIdImportacao: importId,
        atualizadoEmISO: agoraISO
    }), { merge: true });

    await batch.commit();
    await carregarDadosBaseFirestore();

    return {
        importId,
        resultadoDocId,
        caminhoFirestore: `${COLLECTION_CAMPEONATOS}/${campeonatoDocId}/resultado_final/${resultadoDocId}`,
        subcollection: subcollectionName
    };
}

async function fazerBackupEProcessar() {
    const campeonato = document.getElementById("imp_camp")?.value || "";
    const etapa = document.getElementById("imp_etapa")?.value || "";
    const dataCorrida = document.getElementById("imp_data")?.value || "";
    const status = document.getElementById("statusImport");
    const cfg = getTipoArquivoSelecionado();
    const file = document.getElementById("fileImportacaoUnico")?.files?.[0];
    const btn = event?.target;
    const textoOriginalBotao = btn?.innerText;

    if (!campeonato) return alert("Selecione o campeonato!");
    if (!etapa) return alert("Informe a etapa!");
    if (!dataCorrida) return alert("Informe a data da corrida!");
    if (!cfg) return alert("Selecione o tipo de arquivo!");
    if (!file) return alert("Selecione o arquivo que será importado!");

    try {
        if (btn) {
            btn.disabled = true;
            btn.innerText = "⏳ SALVANDO NO FIRESTORE...";
        }

        if (status) status.innerHTML = `⏳ Salvando ${cfg.label} no Firestore...`;

        const conteudoRaw = isArquivoTexto(file) ? await file.text() : "";
        const dataUrl = await arquivoParaDataUrl(file);
        const idUnico = `${dataCorrida}_${normalizarChave(campeonato)}_${cfg.tipo}_${Date.now()}`;
        const backupPayload = montarBackupPayload({ campeonato, etapa, dataCorrida, cfg, file, conteudoRaw, dataUrl, idUnico });
        const backupInfo = await salvarBackupImportacaoNoFirestore(backupPayload);

        if (!cfg.usaPreview) {
            const caminho = await salvarArquivoSemPreviewNoFirestore({
                campeonato,
                etapa,
                dataCorrida,
                cfg,
                backupPayload,
                backupId: idUnico
            });

            if (status) {
                status.innerHTML = `✅ ${cfg.label} salvo no Firestore. Caminho: ${htmlEscape(caminho)}. Backup: ${htmlEscape(backupInfo.caminhoFirestore)}.`;
            }

            document.getElementById("fileImportacaoUnico").value = "";
            return;
        }

        if (!conteudoRaw && !IMPORTACAO_PYSCRIPT.length) {
            if (status) {
                status.innerHTML = `⚠️ Arquivo salvo em ${htmlEscape(backupInfo.caminhoFirestore)}, mas não foi possível gerar prévia. Para Resultado final/Classificação, use HTML, HTM ou XML.`;
            }
            return;
        }

        const registrosPyScript = Array.isArray(IMPORTACAO_PYSCRIPT) &&
            IMPORTACAO_PYSCRIPT.length &&
            IMPORTACAO_PYSCRIPT_ARQUIVO === file.name &&
            IMPORTACAO_PYSCRIPT_TIPO === cfg.tipo
            ? IMPORTACAO_PYSCRIPT
            : [];

        if (!IMPORTACAO_PREVIA.length) {
            if (registrosPyScript.length) {
                montarImportacaoPreviaDoArquivo(registrosPyScript, campeonato, cfg.tipo, false, false);
            } else {
                analisarHTML(conteudoRaw, campeonato, dataCorrida, cfg.tipo, false);
            }

            await marcarPilotosJaVinculadosAoCampeonato(campeonato, true);
        }

        const selecionadosAntesDoCalculo = IMPORTACAO_PREVIA.filter(i => i.checked && !i.conflitoId);

        if (!selecionadosAntesDoCalculo.length) {
            if (status) {
                status.innerHTML = `⚠️ ${cfg.label} salvo no backup global do Firestore. Marque ao menos um piloto no checkbox para salvar os selecionados.`;
            }
            recalcularPreviewImportacao(campeonato, true, false);
            const btnConfirmar = document.getElementById("btnConfirmarImportacao");
            if (btnConfirmar) btnConfirmar.style.display = "none";
            return;
        }

        const deveCalcularPontos = cfg.tipo === "resultado_final" || cfg.tipo === "classificacao";
        recalcularPreviewImportacao(campeonato, true, deveCalcularPontos);

        const selecionadosParaSalvar = IMPORTACAO_PREVIA
            .filter(i => i.checked && !i.conflitoId)
            .sort((a, b) => a.posGeral - b.posGeral);

        const saveInfo = await salvarSelecionadosNoFirestore({
            campeonato,
            etapa,
            dataCorrida,
            cfg,
            selecionados: selecionadosParaSalvar,
            nomeArquivo: file.name,
            backupId: idUnico
        });

        if (status) {
            status.innerHTML = `✅ ${cfg.label} salvo no Firestore com ${selecionadosParaSalvar.length} piloto(s). Caminho: ${htmlEscape(saveInfo.caminhoFirestore)}.`;
        }

        const btnConfirmar = document.getElementById("btnConfirmarImportacao");
        if (btnConfirmar) btnConfirmar.style.display = "none";

        await inicializarRankingFirestore();
    } catch (e) {
        console.error(e);
        if (status) status.innerHTML = `❌ Erro ao gravar no Firestore: ${htmlEscape(e.message || e)}`;
        alert("Erro ao gravar no Firestore. Veja o console para detalhes.");
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerText = textoOriginalBotao || "SALVAR ARQUIVO / GERAR PRÉVIA";
        }
    }
}

function normalizarRegistroImportacao(item) {
    const driverName = item.driver_name || item.nome || item.piloto || item.piloto_original || "";
    const driverId = item.driver_id || item.id_piloto || "";
    const posicaoFinal = item.posicao_final || item.pos || item.posicao || item.posicao_geral_arquivo || "";

    return {
        driver_id: String(driverId || "").trim(),
        driver_name: String(driverName || "").trim(),
        nome: String(driverName || "").trim(),
        id_piloto: String(driverId || "").trim(),
        pos: String(posicaoFinal || "").trim(),
        posicao_final: parseInt(posicaoFinal) || 0,
        posicao_geral_arquivo: parseInt(posicaoFinal) || 0,
        posGeral: parseInt(posicaoFinal) || 9999,
        arquivo_origem: item.arquivo_origem || "",
        evento: item.evento || "",
        kart_numero: item.kart_numero || "",
        classe: item.classe || "",
        melhor_tempo: item.melhor_tempo || "",
        melhor_tempo_segundos: item.melhor_tempo_segundos ?? tempoParaSegundosJS(item.melhor_tempo),
        melhor_tempo_ponto: 0,
        total_tempo: item.total_tempo || "",
        total_tempo_segundos: item.total_tempo_segundos ?? "",
        diff: item.diff || "",
        espaco: item.espaco || "",
        voltas: item.voltas ?? "",
        comentarios: item.comentarios || "",
        piloto_original: item.piloto_original || ""
    };
}

function montarImportacaoPreviaDoArquivo(registros, campeonato = "", tipoArquivo = "resultado_final", exibirHint = false, calcularPontos = false) {
    const encontrados = (registros || [])
        .map(normalizarRegistroImportacao)
        .filter(item => item.driver_name && item.posicao_final)
        .filter((r, i, arr) =>
            arr.findIndex(x =>
                x.driver_name === r.driver_name &&
                x.posicao_final === r.posicao_final &&
                String(x.driver_id) === String(r.driver_id)
            ) === i
        );

    IMPORTACAO_PREVIA = encontrados.map(item => {
        const porId = DB.pilotos.filter(p =>
            String(getPilotoCampo(p, "id_piloto", "driver_id", "id") || "").trim() === String(item.driver_id || "").trim() &&
            item.driver_id
        );

        const conflitoId = porId.length > 1;
        const existente = porId[0] ||
            DB.pilotos.find(p =>
                (getPilotoCampo(p, "nome", "driver_name") || "").toUpperCase() ===
                (item.driver_name || "").toUpperCase()
            );

        const vinculado = existente ? vinculosPiloto(existente).includes(campeonato) : false;

        return {
            ...item,
            tipoArquivo,
            checked: false,
            conflitoId,
            status: conflitoId
                ? "ID duplicado/conflito"
                : existente
                    ? vinculado
                        ? "Piloto vinculado ao campeonato"
                        : "Piloto cadastrado sem vínculo"
                    : "Será cadastrado automaticamente"
        };
    });

    recalcularPreviewImportacao(campeonato, exibirHint, calcularPontos);

    return IMPORTACAO_PREVIA;
}

function analisarHTML(htmlText, campeonato = "", dataCorrida = "", tipoArquivo = "resultado_final", calcularPontos = false) {
    const doc = new DOMParser().parseFromString(htmlText, "text/html");
    const rows = doc.querySelectorAll("tr");
    const encontrados = [];

    rows.forEach(row => {
        const tds = row.querySelectorAll("td");
        if (!tds.length) return;

        const textos = Array.from(tds)
            .map(td => (td.innerText || "").trim())
            .filter(Boolean);

        const pos = textos.find(t => /^\d+$/.test(t));
        if (!pos) return;

        const pilotoOriginal = textos.find(t => /^\[\d+\]\s*.+/.test(t)) || "";
        const idDoNome = pilotoOriginal.match(/^\[(\d+)\]\s*(.+)$/);
        const possivelId = idDoNome
            ? idDoNome[1]
            : textos.find(t => /^\d{3,}$/.test(t) && t !== pos) || "";
        const nome = idDoNome
            ? idDoNome[2]
            : textos.find(t => /[a-zA-ZÀ-ÿ]/.test(t) && t !== possivelId) || "";
        const melhorTempo = textos.find(t => /^\d+:\d{2}([.,]\d+)?$/.test(t)) || "";

        if (!nome) return;

        encontrados.push({
            driver_name: nome,
            driver_id: possivelId,
            posicao_final: pos,
            posicao_geral_arquivo: Number(pos) || 0,
            melhor_tempo: melhorTempo,
            melhor_tempo_segundos: tempoParaSegundosJS(melhorTempo)
        });
    });

    return montarImportacaoPreviaDoArquivo(encontrados, campeonato, tipoArquivo, true, calcularPontos);
}

function recalcularPreviewImportacao(campeonato, exibirHint = false, calcularPontos = false) {
    IMPORTACAO_PREVIA = (IMPORTACAO_PREVIA.length ? IMPORTACAO_PREVIA : [])
        .sort((a, b) => (a.posGeral || 9999) - (b.posGeral || 9999));

    const cfg = getTipoArquivoSelecionado() || TIPOS_ARQUIVO.find(t => t.tipo === IMPORTACAO_PREVIA[0]?.tipoArquivo);
    const tipoArquivo = cfg?.tipo || IMPORTACAO_PREVIA[0]?.tipoArquivo || "";
    const selecionadosOrdenados = IMPORTACAO_PREVIA
        .filter(i => i.checked && !i.conflitoId)
        .sort((a, b) => a.posGeral - b.posGeral);
    const deveCalcularPontos = calcularPontos && selecionadosOrdenados.length > 0;

    IMPORTACAO_PREVIA.forEach(item => {
        item.melhor_tempo_ponto = 0;
    });

    if (tipoArquivo === "resultado_final" && deveCalcularPontos) {
        const rankPorItem = new Map();
        let ultimoPos = null;
        let rankAtual = 0;

        selecionadosOrdenados.forEach((item, idx) => {
            if (item.posGeral !== ultimoPos) {
                rankAtual = idx + 1;
                ultimoPos = item.posGeral;
            }

            rankPorItem.set(item, rankAtual);
        });

        IMPORTACAO_PREVIA.forEach(item => {
            item.posicao_final2 = item.checked && !item.conflitoId ? rankPorItem.get(item) || 0 : 0;
            item.posCampeonato = item.posicao_final2;
            item.pontos = item.posicao_final2 ? PONTOS_PADRAO[item.posicao_final2] || 0 : 0;
            item.origemPontuacao = item.posicao_final2 ? "Pontuação padrão da importação" : "-";
        });

        IMPORTACAO_PREVIA_GERADA = true;
    } else if (tipoArquivo === "classificacao" && deveCalcularPontos) {
        IMPORTACAO_PREVIA.forEach(item => {
            item.posicao_final2 = 0;
            item.posCampeonato = 0;
            item.pontos = 0;
            item.origemPontuacao = "Aguardando melhor tempo";
        });

        IMPORTACAO_PREVIA_GERADA = true;
    } else {
        IMPORTACAO_PREVIA.forEach(item => {
            item.posicao_final2 = 0;
            item.posCampeonato = 0;
            item.pontos = 0;
            item.origemPontuacao = "Aguardando cálculo";
        });

        IMPORTACAO_PREVIA_GERADA = false;
    }

    if (deveCalcularPontos && selecionadosOrdenados.length) {
        const temposValidos = selecionadosOrdenados
            .map(item => ({ item, segundos: obterMelhorTempoSegundos(item) }))
            .filter(x => x.segundos !== null && Number.isFinite(x.segundos));

        if (temposValidos.length) {
            const menorTempo = Math.min(...temposValidos.map(x => x.segundos));

            temposValidos.forEach(({ item, segundos }) => {
                item.melhor_tempo_ponto = segundos === menorTempo ? 1 : 0;

                if (tipoArquivo === "classificacao" && item.melhor_tempo_ponto === 1) {
                    item.pontos = 1;
                    item.origemPontuacao = "1 ponto pelo melhor tempo";
                }

                if (tipoArquivo === "resultado_final" && item.melhor_tempo_ponto === 1) {
                    item.origemPontuacao = `${item.origemPontuacao || "Pontuação"} + melhor tempo`;
                }
            });
        }
    }

    const titulo = cfg?.tipo === "classificacao" ? "Classificação" : "Resultado Final";
    const tituloEtapa = IMPORTACAO_PREVIA_GERADA ? "Prévia de Importação" : "Seleção de Pilotos";

    let h = `<h3>${tituloEtapa} — ${htmlEscape(titulo)}</h3>`;

    if (!IMPORTACAO_PREVIA.length) {
        h += "<p class='muted'>Nenhum piloto identificado no arquivo.</p>";
    }

    h += `
        <div style="max-width:100%; overflow:auto;">
            <table>
                <tr>
                    <th>Importar?</th>
                    <th>driver_id</th>
                    <th>driver_name</th>
                    <th>Pos. geral</th>
                    <th>Pos. importação</th>
                    <th>Pontos</th>
                    <th>Melhor tempo?</th>
                    <th>Kart</th>
                    <th>Melhor tempo</th>
                    <th>Voltas</th>
                    <th>Status</th>
                </tr>
    `;

    IMPORTACAO_PREVIA.forEach((i, idx) => {
        const disabled = i.conflitoId ? "disabled" : "";
        const posicaoCalculada = i.posicao_final2 ? i.posicao_final2 : "-";
        const pontosCalculados = i.pontos || i.pontos === 0 ? i.pontos : "-";
        const melhorTempoPonto = Number(i.melhor_tempo_ponto || 0);

        h += `
            <tr>
                <td>
                    <input
                        type="checkbox"
                        id="imp_chk_${idx}"
                        ${i.checked ? "checked" : ""}
                        ${disabled}
                        onchange="toggleSelecionadoImport(${idx})"
                    >
                </td>
                <td>${htmlEscape(i.driver_id || "-")}</td>
                <td>${htmlEscape(i.driver_name || "-")}</td>
                <td>${htmlEscape(i.posicao_final || i.pos || "-")}</td>
                <td>${posicaoCalculada}</td>
                <td>${pontosCalculados}</td>
                <td>${melhorTempoPonto}</td>
                <td>${htmlEscape(i.kart_numero || "-")}</td>
                <td>${htmlEscape(i.melhor_tempo || "-")}</td>
                <td>${htmlEscape(i.voltas || "-")}</td>
                <td>${htmlEscape(i.status)}</td>
            </tr>
        `;
    });

    h += `
            </table>
        </div>
    `;

    if (exibirHint) {
        if (IMPORTACAO_PREVIA_GERADA) {
            h += `
                <p class='hint'>
                    Cálculo feito apenas com os pilotos marcados.
                    Selecionados: ${selecionadosOrdenados.length}.
                    O campo "Melhor tempo?" recebe 1 para o menor Melhor Tempo entre os selecionados e 0 para os demais.
                </p>
            `;
        } else {
            h += `
                <p class='hint'>
                    Marque os pilotos que serão importados.
                    Para Resultado Final, a posição e os pontos serão recalculados automaticamente.
                    Para Classificação, o piloto com menor Melhor Tempo entre os selecionados recebe 1 ponto.
                </p>
            `;
        }
    }

    const preview = document.getElementById("previewImportacao");
    if (preview) preview.innerHTML = h;
}

function toggleSelecionadoImport(idx) {
    const campeonato = document.getElementById("imp_camp")?.value || "";
    const cfg = getTipoArquivoSelecionado();

    if (!IMPORTACAO_PREVIA[idx]) return;

    IMPORTACAO_PREVIA[idx].checked = !!document.getElementById(`imp_chk_${idx}`)?.checked;

    const tipoArquivo = cfg?.tipo || IMPORTACAO_PREVIA[idx]?.tipoArquivo || "";
    const deveRecalcularAutomatico = tipoArquivo === "resultado_final" || tipoArquivo === "classificacao" || IMPORTACAO_PREVIA_GERADA;

    recalcularPreviewImportacao(campeonato, true, deveRecalcularAutomatico);

    const selecionados = IMPORTACAO_PREVIA.filter(i => i.checked && !i.conflitoId);
    const statusTexto = String(document.getElementById("statusImport")?.innerText || "").toLowerCase();
    const arquivoJaFoiSalvo = statusTexto.includes("salvo") || statusTexto.includes("prévia gerada") || statusTexto.includes("prévia gerada");

    const btnConfirmar = document.getElementById("btnConfirmarImportacao");
    if (btnConfirmar) {
        btnConfirmar.style.display = arquivoJaFoiSalvo && selecionados.length ? "block" : "none";
    }
}

async function confirmarImportacao() {
    const campeonato = document.getElementById("imp_camp")?.value || "";
    const etapa = document.getElementById("imp_etapa")?.value || "";
    const data = document.getElementById("imp_data")?.value || "";
    const cfg = getTipoArquivoSelecionado();
    const file = document.getElementById("fileImportacaoUnico")?.files?.[0];
    const status = document.getElementById("statusImport");

    if (!campeonato) return alert("Selecione o campeonato!");
    if (!etapa) return alert("Informe a etapa!");
    if (!data) return alert("Informe a data da corrida!");
    if (!cfg || !cfg.usaPreview) return alert("Selecione Resultado final ou Classificação para importar pilotos.");

    const deveCalcularPontos = cfg.tipo === "resultado_final" || cfg.tipo === "classificacao";
    recalcularPreviewImportacao(campeonato, true, deveCalcularPontos);

    const selecionados = IMPORTACAO_PREVIA
        .filter(i => i.checked && !i.conflitoId)
        .sort((a, b) => a.posGeral - b.posGeral);

    if (!selecionados.length) return alert("Selecione ao menos um piloto.");

    const nomeArquivo = file?.name || IMPORTACAO_PYSCRIPT_ARQUIVO || "";

    if (status) status.innerHTML = `⏳ Importando ${selecionados.length} piloto(s) para o Firestore...`;

    try {
        const saveInfo = await salvarSelecionadosNoFirestore({
            campeonato,
            etapa,
            dataCorrida: data,
            cfg,
            selecionados,
            nomeArquivo
        });

        if (status) {
            status.innerHTML = `✅ Importação concluída: ${selecionados.length} piloto(s) gravado(s) no Firestore. Caminho: ${htmlEscape(saveInfo.caminhoFirestore)}.`;
        }

        alert(`✅ Importação concluída com ${selecionados.length} piloto(s).`);

        const btnConfirmar = document.getElementById("btnConfirmarImportacao");
        if (btnConfirmar) btnConfirmar.style.display = "none";

        await inicializarRankingFirestore();
    } catch (e) {
        console.error(e);
        if (status) status.innerHTML = `❌ Erro ao gravar no Firestore: ${htmlEscape(e.message || e)}`;
        alert("Erro ao gravar no Firestore. Veja o console para detalhes.");
    }
}

async function receberImportacaoPyScript(payloadJson) {
    try {
        const payload = typeof payloadJson === "string" ? JSON.parse(payloadJson || "{}") : (payloadJson || {});

        IMPORTACAO_PYSCRIPT = Array.isArray(payload.registros) ? payload.registros : [];
        IMPORTACAO_PYSCRIPT_ARQUIVO = payload.arquivo || "";
        IMPORTACAO_PYSCRIPT_TIPO = payload.tipo || "";

        const campeonato = document.getElementById("imp_camp")?.value || "";
        const tipoAtual = document.getElementById("imp_tipo_arquivo")?.value || "";

        IMPORTACAO_PREVIA_GERADA = false;

        if (IMPORTACAO_PYSCRIPT.length && IMPORTACAO_PYSCRIPT_TIPO === tipoAtual) {
            montarImportacaoPreviaDoArquivo(IMPORTACAO_PYSCRIPT, campeonato, IMPORTACAO_PYSCRIPT_TIPO, true, false);

            const btnConfirmar = document.getElementById("btnConfirmarImportacao");
            if (btnConfirmar) btnConfirmar.style.display = "none";

            if (campeonato) {
                await marcarPilotosJaVinculadosAoCampeonato(campeonato, true);
            } else {
                const status = document.getElementById("statusImport");
                if (status) status.innerHTML = "✅ Arquivo lido. Selecione o campeonato para marcar automaticamente pilotos já vinculados.";
            }
        }
    } catch (e) {
        console.error("Falha ao receber dados do PyScript:", e);
    }
}

window.receberImportacaoPyScript = receberImportacaoPyScript;
window.receberResultadoFinalPyScript = receberImportacaoPyScript;

async function enviarResultado(payload) {
    const r = await fetch(URL_API, {
        method: "POST",
        body: JSON.stringify(payload)
    });

    const t = await r.text();

    if (!t.includes("Sucesso")) {
        throw new Error(t || "Falha ao lançar");
    }
}

function filtrarPilotosPorCamp() {
    const c = document.getElementById("sel_camp")?.value || "";
    const selPiloto = document.getElementById("sel_piloto");

    if (!selPiloto) return;

    const pilotos = c
        ? DB.pilotos.filter(p => vinculosPiloto(p).includes(c))
        : DB.pilotos;

    selPiloto.innerHTML = '<option value="">Selecione o Piloto</option>' +
        pilotos.map(p => `<option value="${htmlEscape(p.nome || p.driver_name)}">${htmlEscape(p.nome || p.driver_name)}</option>`).join("");
}

async function salvar(tipo) {
    const btn = event?.target;

    if (btn) {
        btn.innerText = "⏳ ENVIANDO...";
        btn.disabled = true;
    }

    const p = { tipo };

    if (tipo === "resultados") {
        p.senha = document.getElementById("pass_res")?.value || "";
        p.campeonato = document.getElementById("sel_camp")?.value || "";
        p.piloto = document.getElementById("sel_piloto")?.value || "";
        p.posicao = document.getElementById("res_pos")?.value || "";
        p.etapa = document.getElementById("res_etapa")?.value || "";
        p.data = document.getElementById("res_data")?.value || "";
    }

    try {
        const r = await fetch(URL_API, {
            method: "POST",
            body: JSON.stringify(p)
        });

        const t = await r.text();

        if (t.includes("Sucesso")) {
            alert("✅ Corrida gravada com sucesso!");
        } else {
            alert("❌ Erro: Senha incorreta ou dados faltando.");
        }
    } catch (e) {
        console.error(e);
        alert("Erro de rede");
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerText = "GRAVAR NO GOOGLE SHEETS";
        }
    }
}

async function carregarHistorico() {
    const lista = document.getElementById("listaHistorico");
    const detalhe = document.getElementById("arquivosDoDia");

    if (lista) lista.innerHTML = "Carregando dias...";
    if (detalhe) detalhe.innerHTML = "";

    try {
        const snapshot = await firestore
            .collection(COLLECTION_BACKUPS)
            .orderBy("dataUploadISO", "desc")
            .limit(100)
            .get();

        HISTORICO_CACHE = [];

        snapshot.forEach(doc => {
            HISTORICO_CACHE.push({
                key: doc.id,
                ...doc.data()
            });
        });

        if (!HISTORICO_CACHE.length) {
            if (lista) lista.innerHTML = "<p class='muted'>Nenhum arquivo encontrado.</p>";
            return;
        }

        const grupos = {};

        HISTORICO_CACHE.forEach(item => {
            const dia = extrairDataItem(item);
            if (!grupos[dia]) grupos[dia] = [];
            grupos[dia].push(item);
        });

        const dias = Object.keys(grupos).sort((a, b) => b.localeCompare(a));

        if (lista) {
            lista.innerHTML = dias.map(dia => {
                const itens = grupos[dia];
                const camps = [...new Set(itens.map(i => i.campeonato).filter(Boolean))].join(", ") || "Sem campeonato";

                return `<button class="btn-day" onclick="renderArquivosDoDia('${dia}')">
                    📅 ${formatarDataBR(dia)}<br>
                    <small>${htmlEscape(camps)} • ${itens.length} arquivo(s)</small>
                </button>`;
            }).join("");
        }
    } catch (e) {
        console.error(e);
        if (lista) lista.innerHTML = `<p class='muted error'>Erro ao carregar histórico do Firestore: ${htmlEscape(e.message || e)}</p>`;
    }
}

function renderArquivosDoDia(dia) {
    const detalhe = document.getElementById("arquivosDoDia");
    if (!detalhe) return;

    const ordem = {
        volta_a_volta: 1,
        classificacao: 2,
        resultado_final: 3
    };

    const itens = HISTORICO_CACHE
        .filter(item => extrairDataItem(item) === dia)
        .sort((a, b) =>
            (a.campeonato || "").localeCompare(b.campeonato || "") ||
            (ordem[a.tipoArquivo] || 9) - (ordem[b.tipoArquivo] || 9)
        );

    let html = `<h3>📅 Arquivos de ${formatarDataBR(dia)}</h3>`;

    itens.forEach(item => {
        const aviso = item.arquivoCompletoSalvoNoFirestore === false
            ? "<br><small class='muted'>Arquivo bruto grande: salvo como metadados.</small>"
            : "";

        html += `<div class="arquivo-card">
            <div>
                <strong>${htmlEscape(item.tipoLabel || item.tipoArquivo || "Arquivo")}</strong><br>
                <small>${htmlEscape(item.campeonato || "Sem campeonato")} • ${htmlEscape(item.nomeArquivo || "-")}</small>
                ${aviso}
            </div>
            <button class="btn-view" onclick="verConteudo('${item.key}')">VER</button>
        </div>`;
    });

    detalhe.innerHTML = html;
}

async function verConteudo(key) {
    try {
        const doc = await firestore.collection(COLLECTION_BACKUPS).doc(key).get();
        const item = doc.exists ? doc.data() : null;
        const win = window.open("", "_blank");

        if (!item) return win.document.write("Arquivo não encontrado no Firestore.");

        const mime = item.mimeType || "";
        const dataUrl = item.dataUrl || "";

        if (mime.includes("pdf") && dataUrl) {
            return win.document.write(`<iframe src="${dataUrl}" style="width:100%;height:100vh;border:0;"></iframe>`);
        }

        if (item.conteudo) {
            return win.document.write(item.conteudo);
        }

        if (dataUrl) {
            return win.document.write(`<iframe src="${dataUrl}" style="width:100%;height:100vh;border:0;"></iframe>`);
        }

        win.document.write(`<pre style="white-space:pre-wrap;font-family:monospace;">${htmlEscape(JSON.stringify(item, null, 2))}</pre>`);
    } catch (e) {
        console.error(e);
        alert(`Erro ao abrir arquivo do Firestore: ${e.message || e}`);
    }
}

function abrirGestao() {
    show("gestao");
    carregarDadosBaseFirestore().then(() => {
        popularFiltros();
        renderGestao();
    });
}

function trocarAbaGestao(aba) {
    abaGestaoAtual = aba;

    const secCampeonatos = document.getElementById("secCampeonatos");
    const secPilotos = document.getElementById("secPilotos");
    const tabCampeonatos = document.getElementById("tabCampeonatos");
    const tabPilotos = document.getElementById("tabPilotos");

    if (secCampeonatos) secCampeonatos.style.display = aba === "campeonatos" ? "block" : "none";
    if (secPilotos) secPilotos.style.display = aba === "pilotos" ? "block" : "none";
    if (tabCampeonatos) tabCampeonatos.classList.toggle("active-tab", aba === "campeonatos");
    if (tabPilotos) tabPilotos.classList.toggle("active-tab", aba === "pilotos");
}

function popularFiltros() {
    const optsCampeonatoNome = DB.campeonatos.map(c =>
        `<option value="${htmlEscape(c.nome)}">${htmlEscape(c.nome)}</option>`
    ).join("");

    const impCamp = document.getElementById("imp_camp");
    const selCamp = document.getElementById("sel_camp");

    if (impCamp) impCamp.innerHTML = '<option value="">Selecione o Campeonato</option>' + optsCampeonatoNome;
    if (selCamp) selCamp.innerHTML = '<option value="">Selecione o Campeonato</option>' + optsCampeonatoNome;

    const filtroRank = document.getElementById("filtro_rank_firebase_camp");
    if (filtroRank) {
        const valorAtual = filtroRank.value;
        filtroRank.innerHTML = '<option value="">Selecione o Campeonato</option>' + DB.campeonatos.map(c =>
            `<option value="${htmlEscape(c.id || normalizarDocId(c.nome))}">${htmlEscape(c.nome)}</option>`
        ).join("");

        if (valorAtual && DB.campeonatos.some(c => (c.id || normalizarDocId(c.nome)) === valorAtual)) {
            filtroRank.value = valorAtual;
        }
    }

    const pilotoCampeonatos = document.getElementById("piloto_campeonatos");
    if (pilotoCampeonatos) {
        pilotoCampeonatos.innerHTML = DB.campeonatos.map(c =>
            `<option value="${htmlEscape(c.nome)}">${htmlEscape(c.nome)}</option>`
        ).join("");
    }

    const impEtapa = document.getElementById("imp_etapa");
    const impData = document.getElementById("imp_data");
    const resData = document.getElementById("res_data");

    if (impEtapa && !impEtapa.value) impEtapa.value = "";
    if (impData && !impData.value) impData.value = hojeISO();
    if (resData && !resData.value) resData.value = hojeISO();

    filtrarPilotosPorCamp();
}

function renderGestao() {
    trocarAbaGestao(abaGestaoAtual);
    popularFiltros();

    const listaCampeonatos = document.getElementById("listaCampeonatos");
    if (listaCampeonatos) {
        listaCampeonatos.innerHTML = DB.campeonatos.map((c, idx) => `
            <div class='piloto-card'>
                <span>
                    <strong>${htmlEscape(c.nome || "")}</strong><br>
                    <small class='muted'>
                        id: ${htmlEscape(c.id || normalizarDocId(c.nome))}
                        ${c.descricao ? ` • ${htmlEscape(c.descricao)}` : ""}
                        ${c.data_inicio ? ` • ${htmlEscape(c.data_inicio)}` : ""}
                        ${c.data_fim ? ` até ${htmlEscape(c.data_fim)}` : ""}
                    </small>
                </span>
                <span class="actions">
                    <button class='btn-icon' title="Editar" aria-label="Editar" onclick="editarCampeonato(${idx})">✏️</button>
                </span>
            </div>
        `).join("") || "<p class='muted'>Nenhum campeonato cadastrado.</p>";
    }

    const listaPilotos = document.getElementById("listaPilotos");
    if (listaPilotos) {
        listaPilotos.innerHTML = DB.pilotos.map((p, idx) => {
            const nome = p.nome || p.driver_name || "";
            const idPiloto = p.id_piloto || p.driver_id || p.id || "";
            const apelido = p.apelido || "";
            const camps = vinculosPiloto(p).join(", ");

            return `<div class='piloto-card'>
                <span>
                    <strong>${htmlEscape(nome)}</strong><br>
                    <small class='muted'>
                        id_piloto: ${htmlEscape(idPiloto || "-")}
                        • apelido: ${htmlEscape(apelido || "-")}
                        • campeonatos: ${htmlEscape(camps || "-")}
                    </small>
                </span>
                <span class="actions">
                    <button class='btn-icon' title="Editar" aria-label="Editar" onclick="editarPiloto(${idx})">✏️</button>
                </span>
            </div>`;
        }).join("") || "<p class='muted'>Nenhum piloto cadastrado.</p>";
    }
}

function limparFormularioCampeonato() {
    campeonatoEditando = null;

    const nome = document.getElementById("camp_nome");
    const descricao = document.getElementById("camp_descricao");
    const dataInicio = document.getElementById("camp_data_inicio");
    const dataFim = document.getElementById("camp_data_fim");
    const feedback = document.getElementById("feedbackCampeonato");

    if (nome) {
        nome.disabled = false;
        nome.value = "";
    }
    if (descricao) descricao.value = "";
    if (dataInicio) dataInicio.value = "";
    if (dataFim) dataFim.value = "";
    if (feedback) feedback.innerHTML = "";
}

async function salvarCampeonato() {
    const nomeInput = document.getElementById("camp_nome");
    const descricaoInput = document.getElementById("camp_descricao");
    const dataInicioInput = document.getElementById("camp_data_inicio");
    const dataFimInput = document.getElementById("camp_data_fim");
    const feedback = document.getElementById("feedbackCampeonato");

    const nome = (nomeInput?.value || "").trim();
    const descricao = (descricaoInput?.value || "").trim();
    const dataInicio = dataInicioInput?.value || "";
    const dataFim = dataFimInput?.value || "";

    if (!nome) {
        if (feedback) feedback.innerHTML = '<span class="error">Nome do campeonato é obrigatório.</span>';
        return;
    }

    const docId = campeonatoEditando?.id || normalizarDocId(nome);
    const ref = firestore.collection(COLLECTION_CAMPEONATOS).doc(docId);
    const snapshot = await ref.get();

    if (!campeonatoEditando && snapshot.exists) {
        alert("Este campeonato já existe no Firebase. Não será cadastrado por cima.");
        if (feedback) feedback.innerHTML = '<span class="error">Campeonato já existe no Firebase.</span>';
        return;
    }

    try {
        const dadosAtuais = snapshot.exists ? snapshot.data() || {} : {};

        await ref.set(toFirestoreSafe({
            ...dadosAtuais,
            id: docId,
            nome: campeonatoEditando ? (dadosAtuais.nome || campeonatoEditando.nome || nome) : nome,
            descricao,
            data_inicio: dataInicio,
            data_fim: dataFim,
            estrutura: `${COLLECTION_CAMPEONATOS}/${docId}`,
            atualizadoEmISO: new Date().toISOString(),
            criadoEmISO: dadosAtuais.criadoEmISO || new Date().toISOString()
        }), { merge: true });

        if (feedback) feedback.innerHTML = "✅ Campeonato salvo no Firebase.";

        await carregarDadosBaseFirestore();
        popularFiltros();
        renderGestao();
        await inicializarRankingFirestore();
        limparFormularioCampeonato();
    } catch (e) {
        console.error(e);
        if (feedback) feedback.innerHTML = `<span class="error">Erro ao salvar campeonato: ${htmlEscape(e.message || e)}</span>`;
    }
}

function editarCampeonato(idx) {
    const c = DB.campeonatos[idx];
    if (!c) return;

    campeonatoEditando = c;

    const nome = document.getElementById("camp_nome");
    const descricao = document.getElementById("camp_descricao");
    const dataInicio = document.getElementById("camp_data_inicio");
    const dataFim = document.getElementById("camp_data_fim");
    const feedback = document.getElementById("feedbackCampeonato");

    if (nome) {
        nome.value = c.nome || "";
        nome.disabled = true;
    }
    if (descricao) descricao.value = c.descricao || c["descrição"] || "";
    if (dataInicio) dataInicio.value = formatarDataISO(c.data_inicio || c["data de inicio"] || "");
    if (dataFim) dataFim.value = formatarDataISO(c.data_fim || c["data de fim"] || "");
    if (feedback) feedback.innerHTML = "Editando campeonato existente. A chave/ID não será alterada.";

    trocarAbaGestao("campeonatos");
}

function limparFormularioPiloto() {
    pilotoEditando = null;

    const id = document.getElementById("piloto_id");
    const nome = document.getElementById("piloto_nome");
    const apelido = document.getElementById("piloto_apelido");
    const campeonatos = document.getElementById("piloto_campeonatos");
    const feedback = document.getElementById("feedbackPiloto");

    if (id) {
        id.disabled = false;
        id.value = "";
    }
    if (nome) nome.value = "";
    if (apelido) apelido.value = "";
    if (campeonatos) Array.from(campeonatos.options).forEach(opt => opt.selected = false);
    if (feedback) feedback.innerHTML = "";
}

async function salvarPiloto() {
    const idInput = document.getElementById("piloto_id");
    const nomeInput = document.getElementById("piloto_nome");
    const apelidoInput = document.getElementById("piloto_apelido");
    const campeonatosSelect = document.getElementById("piloto_campeonatos");
    const feedback = document.getElementById("feedbackPiloto");

    const idPiloto = (idInput?.value || "").trim();
    const nome = (nomeInput?.value || "").trim();
    const apelido = (apelidoInput?.value || "").trim();
    const campeonatos = campeonatosSelect
        ? Array.from(campeonatosSelect.selectedOptions).map(opt => opt.value).filter(Boolean)
        : [];

    if (!idPiloto) {
        if (feedback) feedback.innerHTML = '<span class="error">id_piloto é obrigatório.</span>';
        return;
    }

    if (!nome) {
        if (feedback) feedback.innerHTML = '<span class="error">Nome do piloto é obrigatório.</span>';
        return;
    }

    const docId = pilotoEditando?.id || normalizarDocId(idPiloto);
    const ref = firestore.collection(COLLECTION_PILOTOS).doc(docId);
    const snapshot = await ref.get();

    if (!pilotoEditando && snapshot.exists) {
        alert("Este piloto já existe no Firebase. Não será cadastrado por cima.");
        if (feedback) feedback.innerHTML = '<span class="error">Piloto já existe no Firebase.</span>';
        return;
    }

    try {
        const dadosAtuais = snapshot.exists ? snapshot.data() || {} : {};
        const idFinal = pilotoEditando ? (dadosAtuais.id_piloto || dadosAtuais.driver_id || pilotoEditando.id_piloto || idPiloto) : idPiloto;

        await ref.set(toFirestoreSafe({
            ...dadosAtuais,
            id_piloto: idFinal,
            driver_id: idFinal,
            nome,
            driver_name: nome,
            apelido,
            campeonatos,
            vinculos: campeonatos,
            origemCadastro: dadosAtuais.origemCadastro || "cadastro_manual",
            atualizadoEmISO: new Date().toISOString(),
            criadoEmISO: dadosAtuais.criadoEmISO || new Date().toISOString()
        }), { merge: true });

        if (feedback) feedback.innerHTML = "✅ Piloto salvo no Firebase.";

        await carregarDadosBaseFirestore();
        popularFiltros();
        renderGestao();
        await inicializarRankingFirestore();
        limparFormularioPiloto();
    } catch (e) {
        console.error(e);
        if (feedback) feedback.innerHTML = `<span class="error">Erro ao salvar piloto: ${htmlEscape(e.message || e)}</span>`;
    }
}

function editarPiloto(idx) {
    const p = DB.pilotos[idx];
    if (!p) return;

    pilotoEditando = p;

    const id = document.getElementById("piloto_id");
    const nome = document.getElementById("piloto_nome");
    const apelido = document.getElementById("piloto_apelido");
    const campeonatos = document.getElementById("piloto_campeonatos");
    const feedback = document.getElementById("feedbackPiloto");

    if (id) {
        id.value = p.id_piloto || p.driver_id || p.id || "";
        id.disabled = true;
    }
    if (nome) nome.value = p.nome || p.driver_name || "";
    if (apelido) apelido.value = p.apelido || "";

    if (campeonatos) {
        const vinculos = new Set(vinculosPiloto(p));
        Array.from(campeonatos.options).forEach(opt => {
            opt.selected = vinculos.has(opt.value);
        });
    }

    if (feedback) feedback.innerHTML = "Editando piloto existente. O id_piloto não será alterado.";

    trocarAbaGestao("pilotos");
}

async function inicializarRankingFirestore() {
    await carregarCampeonatosRankingFirestore();
    await renderRankingFirestore();
}

async function carregarCampeonatosRankingFirestore() {
    const select = document.getElementById("filtro_rank_firebase_camp");
    const status = document.getElementById("rankingFirestoreStatus");

    if (!select) return;

    try {
        const valorAtual = select.value;

        select.innerHTML = '<option value="">Selecione o Campeonato</option>' + DB.campeonatos.map(c =>
            `<option value="${htmlEscape(c.id || normalizarDocId(c.nome))}">${htmlEscape(c.nome)}</option>`
        ).join("");

        if (valorAtual && DB.campeonatos.some(c => (c.id || normalizarDocId(c.nome)) === valorAtual)) {
            select.value = valorAtual;
        }

        if (!DB.campeonatos.length) {
            select.innerHTML = '<option value="">Nenhum campeonato encontrado no Firebase</option>';
            if (status) status.innerHTML = `Nenhum campeonato encontrado na collection ${COLLECTION_CAMPEONATOS}.`;
            return;
        }

        if (status && !select.value) status.innerHTML = "Selecione um campeonato para carregar o ranking do Firestore.";
    } catch (e) {
        console.error(e);
        select.innerHTML = '<option value="">Erro ao carregar campeonatos</option>';
        if (status) status.innerHTML = `❌ Erro ao carregar campeonatos do Firestore: ${htmlEscape(e.message || e)}`;
    }
}

function criarLinhaRankingFirestoreBase(driverId, driverName) {
    return {
        driver_id: driverId || "",
        driver_name: driverName || "-",
        pontos_posicao_corrida: 0,
        pontos_melhor_tempo_corrida: 0,
        pontos_melhor_tempo_classificacao: 0,
        pontos_total: 0,
        etapas: []
    };
}

function somarResultadoFinalRankingFirestore(rankingMap, item, etapaInfo) {
    const driverId = String(item.driver_id || item.id_piloto || "").trim();
    const driverName = item.driver_name || item.nome || "-";

    if (!driverId && !driverName) return;

    const key = driverId || normalizarDocId(driverName);

    if (!rankingMap.has(key)) {
        rankingMap.set(key, criarLinhaRankingFirestoreBase(driverId, driverName));
    }

    const linha = rankingMap.get(key);
    const pontosPosicao = Number(item.pontos || 0);
    const bonusMelhorTempoCorrida = Number(item.melhor_tempo_ponto || 0);
    const posicaoGrafico = Number(item.posicao_final2 || item.posicao_geral_arquivo || 0);

    linha.driver_id = linha.driver_id || driverId;
    linha.driver_name = linha.driver_name !== "-" ? linha.driver_name : driverName;
    linha.pontos_posicao_corrida += pontosPosicao;
    linha.pontos_melhor_tempo_corrida += bonusMelhorTempoCorrida;
    linha.pontos_total += pontosPosicao + bonusMelhorTempoCorrida;

    linha.etapas.push({
        tipo: "Resultado Final",
        etapa: etapaInfo.etapa || "-",
        dataCorrida: etapaInfo.dataCorrida || "-",
        posicao_final2: item.posicao_final2 || "-",
        posicao_grafico: posicaoGrafico,
        pontos: pontosPosicao,
        melhor_tempo: item.melhor_tempo || "-",
        melhor_tempo_ponto: bonusMelhorTempoCorrida
    });
}

function somarClassificacaoRankingFirestore(rankingMap, item, etapaInfo) {
    const driverId = String(item.driver_id || item.id_piloto || "").trim();
    const driverName = item.driver_name || item.nome || "-";

    if (!driverId && !driverName) return;

    const key = driverId || normalizarDocId(driverName);

    if (!rankingMap.has(key)) {
        rankingMap.set(key, criarLinhaRankingFirestoreBase(driverId, driverName));
    }

    const linha = rankingMap.get(key);
    const bonusMelhorTempoClassificacao = Math.max(Number(item.melhor_tempo_ponto || 0), Number(item.pontos || 0));
    const posicaoLargadaCampeonato = Number(
        item.posicao_largada_campeonato ||
        item.posicao_classificacao_campeonato ||
        item.posicao_final2 ||
        item.posicao_geral_arquivo ||
        0
    );

    linha.driver_id = linha.driver_id || driverId;
    linha.driver_name = linha.driver_name !== "-" ? linha.driver_name : driverName;
    linha.pontos_melhor_tempo_classificacao += bonusMelhorTempoClassificacao;
    linha.pontos_total += bonusMelhorTempoClassificacao;

    linha.etapas.push({
        tipo: "Classificação",
        etapa: etapaInfo.etapa || "-",
        dataCorrida: etapaInfo.dataCorrida || "-",
        posicao_final2: posicaoLargadaCampeonato || "-",
        posicao_grafico: posicaoLargadaCampeonato,
        pontos: bonusMelhorTempoClassificacao,
        melhor_tempo: item.melhor_tempo || "-",
        melhor_tempo_ponto: bonusMelhorTempoClassificacao
    });
}

async function buscarIdsPilotosDoCampeonatoFirestore(campeonatoNome) {
    const ids = new Set();

    DB.pilotos
        .filter(p => vinculosPiloto(p).includes(campeonatoNome))
        .forEach(p => {
            const driverId = String(p.driver_id || p.id_piloto || p.id || "").trim();
            if (driverId) {
                ids.add(driverId);
                ids.add(normalizarDocId(driverId));
            }
        });

    return ids;
}

function obterPosicaoArquivo(item) {
    const candidatos = [
        item.posicao_geral_arquivo,
        item.posicao_final,
        item.pos,
        item.posicao,
        item.posicao_final2
    ];

    for (const valor of candidatos) {
        const n = Number(valor);

        if (Number.isFinite(n) && n > 0) {
            return n;
        }
    }

    return 999999;
}

async function buscarRankingFirestorePorCampeonato(campeonatoDocId) {
    const campRef = firestore.collection(COLLECTION_CAMPEONATOS).doc(campeonatoDocId);
    const campDoc = await campRef.get();
    const campData = campDoc.exists ? campDoc.data() || {} : {};
    const campeonatoNome = campData.nome || campeonatoDocId;
    const idsPilotosCampeonato = await buscarIdsPilotosDoCampeonatoFirestore(campeonatoNome);
    const resultadosSnapshot = await campRef.collection("resultado_final").get();
    const rankingMap = new Map();

    for (const resultadoDoc of resultadosSnapshot.docs) {
        const etapaInfo = resultadoDoc.data() || {};
        const resultadoRef = resultadoDoc.ref;
        const pilotosResultadoSnapshot = await resultadoRef.collection("pilotos_resultado").get();

        pilotosResultadoSnapshot.forEach(pilotoDoc => {
            const data = pilotoDoc.data() || {};
            const driverId = String(data.driver_id || data.id_piloto || pilotoDoc.id || "").trim();

            if (idsPilotosCampeonato.size &&
                !idsPilotosCampeonato.has(driverId) &&
                !idsPilotosCampeonato.has(normalizarDocId(driverId)) &&
                !idsPilotosCampeonato.has(pilotoDoc.id)) {
                return;
            }

            somarResultadoFinalRankingFirestore(rankingMap, data, etapaInfo);
        });

        const classificacaoSnapshot = await resultadoRef.collection("classificacao").get();
        let classificacaoDocs = classificacaoSnapshot.docs.map(doc => {
            const data = doc.data() || {};
            const driverId = String(data.driver_id || data.id_piloto || doc.id || "").trim();

            return {
                docId: doc.id,
                driverId,
                data
            };
        });

        if (idsPilotosCampeonato.size) {
            classificacaoDocs = classificacaoDocs.filter(item =>
                idsPilotosCampeonato.has(item.driverId) ||
                idsPilotosCampeonato.has(normalizarDocId(item.driverId)) ||
                idsPilotosCampeonato.has(item.docId)
            );
        }

        classificacaoDocs
            .sort((a, b) =>
                obterPosicaoArquivo(a.data) - obterPosicaoArquivo(b.data) ||
                String(a.data.driver_name || "").localeCompare(String(b.data.driver_name || ""))
            )
            .forEach((item, idx) => {
                somarClassificacaoRankingFirestore(
                    rankingMap,
                    {
                        ...item.data,
                        posicao_largada_campeonato: idx + 1,
                        posicao_classificacao_campeonato: idx + 1
                    },
                    etapaInfo
                );
            });
    }

    return Array.from(rankingMap.values())
        .sort((a, b) =>
            b.pontos_total - a.pontos_total ||
            b.pontos_posicao_corrida - a.pontos_posicao_corrida ||
            a.driver_name.localeCompare(b.driver_name)
        );
}

async function renderRankingFirestore() {
    const select = document.getElementById("filtro_rank_firebase_camp");
    const content = document.getElementById("rankingFirestoreContent");
    const status = document.getElementById("rankingFirestoreStatus");

    if (!select || !content) return;

    const campeonatoDocId = select.value;
    const campeonatoNome = select.options[select.selectedIndex]?.text || "";

    if (!campeonatoDocId) {
        content.innerHTML = "";
        if (status) status.innerHTML = "Selecione um campeonato para carregar o ranking do Firestore.";
        return;
    }

    try {
        content.innerHTML = "";
        if (status) status.innerHTML = `⏳ Carregando ranking de ${htmlEscape(campeonatoNome)} no Firestore...`;

        const ranking = await buscarRankingFirestorePorCampeonato(campeonatoDocId);
        RANKING_FIRESTORE_CACHE = ranking;

        if (!ranking.length) {
            content.innerHTML = "<p class='muted'>Nenhum resultado encontrado para este campeonato no Firestore.</p>";
            if (status) status.innerHTML = "Nenhum dado encontrado.";
            return;
        }

        const totalGeral = ranking.reduce((acc, item) => acc + Number(item.pontos_total || 0), 0);

        let h = `
            <div style="width:100%; max-width:100%; overflow:hidden;">
                <table style="width:100%; table-layout:fixed;">
                    <colgroup>
                        <col style="width:18%;">
                        <col style="width:52%;">
                        <col style="width:30%;">
                    </colgroup>
                    <tr>
                        <th>Pos</th>
                        <th>Piloto</th>
                        <th>Pts</th>
                    </tr>
        `;

        ranking.forEach((p, i) => {
            const percentual = totalGeral
                ? ((Number(p.pontos_total || 0) / totalGeral) * 100).toFixed(1)
                : "0.0";

            h += `
                <tr onclick="toggleHistoricoLinhaFirestore(${i})" style="cursor:pointer;">
                    <td style="word-break:break-word;">${i + 1}º</td>
                    <td style="word-break:break-word;">${htmlEscape(p.driver_name || "-")}</td>
                    <td style="word-break:break-word;">
                        ${p.pontos_total}
                        <small style="color:#aaa; font-size:11px;">(${percentual}%)</small>
                    </td>
                </tr>
                <tr id="hist_firestore_row_${i}" class="hist-detalhe" data-open="0" style="display:none;"></tr>
            `;
        });

        h += `
                </table>
            </div>
        `;

        content.innerHTML = h;

        if (status) {
            status.innerHTML = "✅ Ranking carregado do Firestore.";
        }
    } catch (e) {
        console.error(e);

        content.innerHTML = "";
        if (status) status.innerHTML = `❌ Erro ao carregar ranking do Firestore: ${htmlEscape(e.message || e)}`;
    }
}

function montarTabelaResumoRankingFirestore(item) {
    return `
        <div style="width:100%; max-width:100%; overflow:hidden; margin-bottom:10px;">
            <table style="width:100%; table-layout:fixed; font-size:11px;">
                <colgroup>
                    <col style="width:33.33%;">
                    <col style="width:33.33%;">
                    <col style="width:33.33%;">
                </colgroup>
                <tr>
                    <th style="white-space:normal; word-break:break-word;">Pts corrida</th>
                    <th style="white-space:normal; word-break:break-word;">MV corrida</th>
                    <th style="white-space:normal; word-break:break-word;">MV classif.</th>
                </tr>
                <tr>
                    <td style="white-space:normal; word-break:break-word;">${Number(item.pontos_posicao_corrida || 0)}</td>
                    <td style="white-space:normal; word-break:break-word;">${Number(item.pontos_melhor_tempo_corrida || 0)}</td>
                    <td style="white-space:normal; word-break:break-word;">${Number(item.pontos_melhor_tempo_classificacao || 0)}</td>
                </tr>
            </table>
        </div>
    `;
}

function montarTabelaDetalhesRankingFirestore(detalhes) {
    if (!detalhes.length) return "<p class='muted'>Sem detalhes para exibir.</p>";

    const detalhesOrdenados = [...detalhes].sort((a, b) => {
        const dataA = String(a.dataCorrida || "");
        const dataB = String(b.dataCorrida || "");
        const etapaA = Number(a.etapa || 0);
        const etapaB = Number(b.etapa || 0);
        const tipoA = String(a.tipo || "");
        const tipoB = String(b.tipo || "");

        return dataA.localeCompare(dataB) || etapaA - etapaB || tipoA.localeCompare(tipoB);
    });

    return `
        <div style="width:100%; max-width:100%; overflow:hidden;">
            <table style="width:100%; table-layout:fixed; margin-top:10px; font-size:10.5px;">
                <colgroup>
                    <col style="width:28%;">
                    <col style="width:12%;">
                    <col style="width:16%;">
                    <col style="width:30%;">
                    <col style="width:14%;">
                </colgroup>
                <tr>
                    <th style="white-space:normal; word-break:break-word;">Tipo</th>
                    <th style="white-space:normal; word-break:break-word;">Et.</th>
                    <th style="white-space:normal; word-break:break-word;">Pos.</th>
                    <th style="white-space:normal; word-break:break-word;">Melhor tempo</th>
                    <th style="white-space:normal; word-break:break-word;">Pts</th>
                </tr>
                ${detalhesOrdenados.map(d => `
                    <tr>
                        <td style="white-space:normal; word-break:break-word;">${htmlEscape(d.tipo || "-")}</td>
                        <td style="white-space:normal; word-break:break-word;">${htmlEscape(d.etapa || "-")}</td>
                        <td style="white-space:normal; word-break:break-word;">${htmlEscape(d.posicao_final2 || d.posicao_grafico || "-")}</td>
                        <td style="white-space:normal; word-break:break-word;">${htmlEscape(d.melhor_tempo || "-")}</td>
                        <td style="white-space:normal; word-break:break-word;">${Number(d.pontos || 0)}</td>
                    </tr>
                `).join("")}
            </table>
        </div>
    `;
}

function gerarGraficoHistoricoFirestoreSVG(detalhes) {
    const pontosPorEtapa = new Map();

    (detalhes || []).forEach(item => {
        const etapa = String(item.etapa || "-");
        const dataCorrida = String(item.dataCorrida || "-");
        const key = `${dataCorrida}_${etapa}`;

        if (!pontosPorEtapa.has(key)) {
            pontosPorEtapa.set(key, { key, etapa, dataCorrida, resultado: null, classificacao: null });
        }

        const linha = pontosPorEtapa.get(key);
        const posicao = Number(item.posicao_grafico || item.posicao_final2 || 0);

        if (!posicao) return;

        if (String(item.tipo || "").toLowerCase().includes("resultado")) linha.resultado = posicao;

        if (String(item.tipo || "").toLowerCase().includes("classificação") ||
            String(item.tipo || "").toLowerCase().includes("classificacao")) {
            linha.classificacao = posicao;
        }
    });

    const pontos = Array.from(pontosPorEtapa.values())
        .sort((a, b) => String(a.dataCorrida).localeCompare(String(b.dataCorrida)) || Number(a.etapa || 0) - Number(b.etapa || 0));

    const posicoes = pontos
        .flatMap(p => [p.resultado, p.classificacao])
        .filter(v => v !== null && Number.isFinite(Number(v)));

    if (!pontos.length || !posicoes.length) return "<p class='muted'>Sem posições suficientes para gerar o gráfico.</p>";

    const w = 620;
    const h = 240;
    const ml = 40;
    const mr = 14;
    const mt = 34;
    const mb = 38;
    const maxPos = Math.max(...posicoes, 1);
    const stepX = (w - ml - mr) / Math.max(pontos.length - 1, 1);
    const stepY = (h - mt - mb) / Math.max(maxPos - 1, 1);
    const x = i => ml + (i * stepX);
    const y = pos => mt + ((Number(pos) - 1) * stepY);

    function montarPolyline(campo) {
        return pontos
            .map((p, i) => {
                const valor = p[campo];
                if (valor === null || !Number.isFinite(Number(valor))) return null;
                return `${x(i)},${y(valor)}`;
            })
            .filter(Boolean)
            .join(" ");
    }

    function montarCirculos(campo, cor) {
        return pontos.map((p, i) => {
            const valor = p[campo];
            if (valor === null || !Number.isFinite(Number(valor))) return "";
            return `<circle cx="${x(i)}" cy="${y(valor)}" r="3.6" fill="${cor}"><title>${campo === "resultado" ? "Resultado Final" : "Classificação"} • Etapa ${p.etapa} • P${valor}</title></circle>`;
        }).join("");
    }

    let linhasGrade = "";
    for (let p = 1; p <= maxPos; p++) {
        linhasGrade += `<line x1="${ml}" y1="${y(p)}" x2="${w - mr}" y2="${y(p)}" stroke="#2e3542" stroke-width="1"/>`;
        linhasGrade += `<text x="7" y="${y(p) + 4}" fill="#aaa" font-size="10">P${p}</text>`;
    }

    const labels = pontos.map((p, i) => `
        <text x="${x(i)}" y="${h - 17}" fill="#aaa" font-size="10" text-anchor="middle">E${htmlEscape(p.etapa)}</text>
        <text x="${x(i)}" y="${h - 5}" fill="#777" font-size="8.5" text-anchor="middle">${htmlEscape(String(p.dataCorrida).slice(5))}</text>
    `).join("");

    const linhaResultado = montarPolyline("resultado");
    const linhaClassificacao = montarPolyline("classificacao");

    return `
        <div style="width:100%; max-width:100%; overflow:hidden;">
            <svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid meet"
                 style="display:block; width:100%; max-width:100%; height:auto; background:#141923; border-radius:8px;">
                ${linhasGrade}
                <text x="${ml}" y="18" fill="#ff4b4b" font-size="11">● Resultado</text>
                <text x="${ml + 115}" y="18" fill="#42a5f5" font-size="11">● Classificação</text>
                ${linhaResultado ? `<polyline points="${linhaResultado}" fill="none" stroke="#ff4b4b" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>` : ""}
                ${linhaClassificacao ? `<polyline points="${linhaClassificacao}" fill="none" stroke="#42a5f5" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>` : ""}
                ${montarCirculos("resultado", "#ff4b4b")}
                ${montarCirculos("classificacao", "#42a5f5")}
                ${labels}
            </svg>
        </div>
    `;
}

function setRankingFirestoreDetalheTab(idx, aba) {
    const relacao = document.getElementById(`ranking_fb_relacao_${idx}`);
    const grafico = document.getElementById(`ranking_fb_grafico_${idx}`);
    const btnRelacao = document.getElementById(`ranking_fb_btn_relacao_${idx}`);
    const btnGrafico = document.getElementById(`ranking_fb_btn_grafico_${idx}`);

    if (!relacao || !grafico || !btnRelacao || !btnGrafico) return;

    const mostrarRelacao = aba === "relacao";
    relacao.style.display = mostrarRelacao ? "block" : "none";
    grafico.style.display = mostrarRelacao ? "none" : "block";
    btnRelacao.style.background = mostrarRelacao ? "#ff4b4b" : "#252a34";
    btnGrafico.style.background = mostrarRelacao ? "#252a34" : "#ff4b4b";
}

function toggleHistoricoLinhaFirestore(idx) {
    const row = document.getElementById(`hist_firestore_row_${idx}`);
    const item = RANKING_FIRESTORE_CACHE[idx];

    if (!row || !item) return;

    const aberto = row.dataset.open === "1";

    document.querySelectorAll("tr.hist-detalhe").forEach(el => {
        el.style.display = "none";
        el.dataset.open = "0";
    });

    if (aberto) return;

    const detalhes = item.etapas || [];
    const tabelaResumo = montarTabelaResumoRankingFirestore(item);
    const tabelaDetalhes = montarTabelaDetalhesRankingFirestore(detalhes);
    const grafico = gerarGraficoHistoricoFirestoreSVG(detalhes);

    row.innerHTML = `
        <td colspan="3" style="width:100%; max-width:100%; overflow:hidden; box-sizing:border-box;">
            <div style="width:100%; max-width:100%; padding:10px 4px; overflow:hidden; box-sizing:border-box;">
                <div class="hint" style="margin-bottom:8px; white-space:normal; word-break:break-word;"><strong>${htmlEscape(item.driver_name || "-")}</strong></div>
                ${tabelaResumo}
                <div style="display:flex; gap:8px; margin:10px 0; flex-wrap:wrap; width:100%; max-width:100%; overflow:hidden;">
                    <button id="ranking_fb_btn_relacao_${idx}" onclick="event.stopPropagation(); setRankingFirestoreDetalheTab(${idx}, 'relacao')" style="width:auto; max-width:48%; padding:8px 12px; margin:0; background:#ff4b4b;">Relação</button>
                    <button id="ranking_fb_btn_grafico_${idx}" onclick="event.stopPropagation(); setRankingFirestoreDetalheTab(${idx}, 'grafico')" style="width:auto; max-width:48%; padding:8px 12px; margin:0; background:#252a34; border:1px solid #3a4252;">Gráfico</button>
                </div>
                <div id="ranking_fb_relacao_${idx}" style="display:block; width:100%; max-width:100%; overflow:hidden;">${tabelaDetalhes}</div>
                <div id="ranking_fb_grafico_${idx}" style="display:none; width:100%; max-width:100%; overflow:hidden;">${grafico}</div>
            </div>
        </td>
    `;

    row.style.display = "table-row";
    row.dataset.open = "1";
}

fetchData();

