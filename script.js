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

let DB = { campeonatos: [], pilotos: [], resultados: [] };
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
            id: doc.id,
            nome: data.nome || data.nome_exibicao || doc.id,
            descricao: data.descricao || data["descrição"] || "",
            data_inicio: data.data_inicio || data["data de inicio"] || "",
            data_fim: data.data_fim || data["data de fim"] || "",
            ...data
        });
    });

    const pilotos = [];
    pilotosSnapshot.forEach(doc => {
        const data = doc.data() || {};
        const idPiloto = String(data.id_piloto || data.driver_id || doc.id || "").trim();
        pilotos.push({
            id: doc.id,
            id_piloto: idPiloto,
            driver_id: idPiloto,
            nome: data.nome || data.driver_name || "",
            driver_name: data.driver_name || data.nome || "",
            apelido: data.apelido || "",
            campeonatos: extrairCampeonatosDoPilotoExistente(data),
            vinculos: extrairCampeonatosDoPilotoExistente(data),
            ...data
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
    return String(v || "").replace(/[&<>'"]/g, c => ({
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

    if (Array.isArray(bruto)) return bruto.map(v => String(v || "").trim()).filter(Boolean);

    return String(bruto || "")
        .split(",")
        .map(v => v.trim())
        .filter(Boolean);
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