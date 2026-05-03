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

let RANKING_FIRESTORE_CARREGADO = false;
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

const MEUS_PILOTOS = [
    { id: "41938", nome: "LEONARDO LEMES" },
    { id: "231138", nome: "RODRIGO CRUZ" },
    { id: "232869", nome: "JOÃO VICTOR" },
    { id: "4196", nome: "JÚLIO CEZAR" },
    { id: "51107", nome: "DANILO OLIVEIRA" },
    { id: "232984", nome: "FRANCISCO CAMILLO" },
    { id: "232194", nome: "LUCAS OLIVEIRA" }
];

const TIPOS_ARQUIVO = [
    { tipo: "resultado_final", label: "Resultado final", usaPreview: true },
    { tipo: "classificacao", label: "Classificação", usaPreview: true },
    { tipo: "volta_a_volta", label: "Volta a volta", usaPreview: false }
];

async function fetchData() {
    try {
        const res = await fetch(URL_API);
        DB = await res.json();

        document.getElementById("loading").style.display = "none";

        popularFiltros();
        renderRanking();
    } catch (e) {
        console.error(e);
        document.getElementById("loading").innerHTML = "Erro ao carregar dados iniciais.";
    }
}

function show(id) {
    document.querySelectorAll(".section").forEach(s => s.classList.remove("active"));
    document.getElementById(id).classList.add("active");
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
    if (!dataISO) return "-";
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
    const achado = keys.find(k => p[k] !== undefined && p[k] !== null);
    return achado ? p[achado] : "";
}

function vinculosPiloto(p) {
    const bruto = getPilotoCampo(p, "campeonatos", "vinculos");

    if (Array.isArray(bruto)) return bruto;

    return String(bruto || "")
        .split(",")
        .map(v => v.trim())
        .filter(Boolean);
}

function pilotosDoCampeonato(campeonato) {
    return DB.pilotos.filter(p => vinculosPiloto(p).includes(campeonato));
}

function pontuacaoPorPosicao(campeonato, posicao) {
    const base = (DB.pontuacoes || []).find(p =>
        p.campeonato === campeonato &&
        parseInt(p.posicao) === parseInt(posicao)
    );

    if (base && !Number.isNaN(parseInt(base.pontos))) {
        return {
            pontos: parseInt(base.pontos),
            origem: "Pontuação cadastrada"
        };
    }

    if (PONTOS_PADRAO[posicao]) {
        return {
            pontos: PONTOS_PADRAO[posicao],
            origem: "Pontuação padrão"
        };
    }

    return {
        pontos: 0,
        origem: "Sem pontuação"
    };
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

    document.getElementById("previewImportacao").innerHTML = "";
    document.getElementById("btnConfirmarImportacao").style.display = "none";
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
        ref: firestore.collection("campeonado").doc(campeonatoDocId)
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

        for (const item of IMPORTACAO_PREVIA) {
            const idPiloto = String(item.driver_id || item.id_piloto || "").trim();

            item.checked = false;

            if (!idPiloto) {
                item.status = "Sem id_piloto no arquivo";
                continue;
            }

            const pilotoDocId = normalizarDocId(idPiloto);
            const pilotoDoc = await firestore.collection("Pilotos").doc(pilotoDocId).get();

            if (!pilotoDoc.exists) {
                item.status = "Será cadastrado automaticamente";
                continue;
            }

            const dadosPiloto = pilotoDoc.data() || {};
            const campeonatos = extrairCampeonatosDoPilotoExistente(dadosPiloto);

            if (campeonatos.includes(campeonato)) {
                item.checked = true;
                item.status = "Piloto já está neste campeonato";
            } else {
                item.checked = false;
                item.status = "Piloto existe; será vinculado ao campeonato se marcado";
            }

            if (!item.driver_name && dadosPiloto.nome) {
                item.driver_name = dadosPiloto.nome;
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

    await ref.set({
        id: campeonatoDocId,
        nome: campeonato,
        atualizadoEmISO: new Date().toISOString(),
        estrutura: `campeonado/${campeonatoDocId}`
    }, { merge: true });

    return {
        campeonatoDocId,
        campRef: ref
    };
}

function montarBackupPayload({
    campeonato,
    etapa,
    dataCorrida,
    cfg,
    file,
    conteudoRaw,
    dataUrl,
    idUnico
}) {
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
    const caminhoGlobal = `backups_importacao/${backupId}`;

    await firestore.collection("backups_importacao").doc(backupId).set({
        ...backupPayload,
        caminhoFirestore: caminhoGlobal,
        atualizadoEmISO: new Date().toISOString()
    }, { merge: true });

    return {
        backupId,
        caminhoFirestore: caminhoGlobal
    };
}

async function salvarArquivoSemPreviewNoFirestore({
    campeonato,
    etapa,
    dataCorrida,
    cfg,
    backupPayload,
    backupId
}) {
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
        caminhoBackup: `backups_importacao/${backupId}`,
        caminhoFirestore: `campeonado/${campeonatoDocId}/${destino}/${docId}`,
        criadoEmISO: new Date().toISOString(),
        atualizadoEmISO: new Date().toISOString()
    }), { merge: true });

    return `campeonado/${campeonatoDocId}/${destino}/${docId}`;
}

async function salvarPilotoGlobalNoFirestore(p, campeonato) {
    const idPilotoBruto = String(p.driver_id || p.id_piloto || "").trim();

    if (!idPilotoBruto) {
        console.warn("Piloto sem id_piloto não foi cadastrado na collection Pilotos:", p);
        return;
    }

    const pilotoDocId = normalizarDocId(idPilotoBruto);
    const pilotoRef = firestore.collection("Pilotos").doc(pilotoDocId);
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

async function salvarSelecionadosNoFirestore({
    campeonato,
    etapa,
    dataCorrida,
    cfg,
    selecionados,
    nomeArquivo,
    backupId = ""
}) {
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
        caminhoBackup: backupId ? `backups_importacao/${backupId}` : "",
        caminhoFirestore: `campeonado/${campeonatoDocId}/resultado_final/${resultadoDocId}`
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
            posicao_geral_arquivo: Number(p.posicao_final || p.pos || 0),
            kart_numero: p.kart_numero || "",
            melhor_tempo: p.melhor_tempo || "",
            melhor_tempo_segundos: p.melhor_tempo_segundos ?? null,
            melhor_tempo_ponto: Number(p.melhor_tempo_ponto || 0),
            total_tempo_segundos: p.total_tempo_segundos ?? null,
            voltas: p.voltas ?? null,
            classe: p.classe || "",
            comentarios: p.comentarios || "",
            caminhoBackup: backupId ? `backups_importacao/${backupId}` : "",
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
                posicao_geral_arquivo: Number(p.posicao_final || p.pos || 0),
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

    return {
        importId,
        resultadoDocId,
        caminhoFirestore: `campeonado/${campeonatoDocId}/resultado_final/${resultadoDocId}`,
        subcollection: subcollectionName
    };
}

async function fazerBackupEProcessar() {
    const campeonato = document.getElementById("imp_camp").value;
    const etapa = document.getElementById("imp_etapa").value;
    const dataCorrida = document.getElementById("imp_data").value;
    const status = document.getElementById("statusImport");
    const cfg = getTipoArquivoSelecionado();
    const file = document.getElementById("fileImportacaoUnico")?.files?.[0];

    if (!campeonato) return alert("Selecione o campeonato!");
    if (!etapa) return alert("Informe a etapa!");
    if (!dataCorrida) return alert("Informe a data da corrida!");
    if (!cfg) return alert("Selecione o tipo de arquivo!");
    if (!file) return alert("Selecione o arquivo que será importado!");

    const btn = event?.target;
    const textoOriginalBotao = btn?.innerText;

    try {
        if (btn) {
            btn.disabled = true;
            btn.innerText = "⏳ SALVANDO NO FIRESTORE...";
        }

        status.innerHTML = `⏳ Salvando ${cfg.label} no Firestore...`;

        const conteudoRaw = isArquivoTexto(file) ? await file.text() : "";
        const dataUrl = await arquivoParaDataUrl(file);
        const idUnico = `${dataCorrida}_${normalizarChave(campeonato)}_${cfg.tipo}_${Date.now()}`;

        const backupPayload = montarBackupPayload({
            campeonato,
            etapa,
            dataCorrida,
            cfg,
            file,
            conteudoRaw,
            dataUrl,
            idUnico
        });

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

            status.innerHTML = `✅ ${cfg.label} salvo no Firestore. Caminho: ${htmlEscape(caminho)}. Backup: ${htmlEscape(backupInfo.caminhoFirestore)}.`;
            document.getElementById("fileImportacaoUnico").value = "";
            return;
        }

        if (!conteudoRaw && !IMPORTACAO_PYSCRIPT.length) {
            status.innerHTML = `⚠️ Arquivo salvo em ${htmlEscape(backupInfo.caminhoFirestore)}, mas não foi possível gerar prévia. Para Resultado final/Classificação, use HTML, HTM ou XML.`;
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
            status.innerHTML = `⚠️ ${cfg.label} salvo no backup global do Firestore. Marque ao menos um piloto no checkbox para salvar os selecionados.`;
            recalcularPreviewImportacao(campeonato, true, false);
            document.getElementById("btnConfirmarImportacao").style.display = "none";
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

        status.innerHTML = `✅ ${cfg.label} salvo no Firestore com ${selecionadosParaSalvar.length} piloto(s). Caminho: ${htmlEscape(saveInfo.caminhoFirestore)}.`;
        document.getElementById("btnConfirmarImportacao").style.display = "none";
    } catch (e) {
        console.error(e);
        status.innerHTML = `❌ Erro ao gravar no Firestore: ${htmlEscape(e.message || e)}`;
        alert("Erro ao gravar no Firestore. Veja o console para detalhes.");
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerText = textoOriginalBotao || "SALVAR ARQUIVO / GERAR PRÉVIA";
        }
    }
}

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

async function lancarAutomatico(encontrados, campeonato, dataCorrida) {
    const participantes = new Set(
        pilotosDoCampeonato(campeonato).map(p => (p.nome || "").toUpperCase())
    );

    const validos = encontrados.filter(p =>
        participantes.has((p.nome || "").toUpperCase())
    );

    let count = 0;

    for (const p of validos) {
        const payload = {
            tipo: "resultados",
            campeonato,
            piloto: p.nome,
            posicao: p.pos,
            etapa: "",
            data: dataCorrida,
            auto: true
        };

        try {
            await enviarResultado(payload);
            count += 1;
        } catch (e) {
            console.error(e);
        }
    }

    return count;
}

async function receberImportacaoPyScript(payloadJson) {
    try {
        const payload = JSON.parse(payloadJson || "{}");

        IMPORTACAO_PYSCRIPT = Array.isArray(payload.registros) ? payload.registros : [];
        IMPORTACAO_PYSCRIPT_ARQUIVO = payload.arquivo || "";
        IMPORTACAO_PYSCRIPT_TIPO = payload.tipo || "";

        const campeonato = document.getElementById("imp_camp")?.value || "";
        const tipoAtual = document.getElementById("imp_tipo_arquivo")?.value || "";

        IMPORTACAO_PREVIA_GERADA = false;

        if (IMPORTACAO_PYSCRIPT.length && IMPORTACAO_PYSCRIPT_TIPO === tipoAtual) {
            montarImportacaoPreviaDoArquivo(
                IMPORTACAO_PYSCRIPT,
                campeonato,
                IMPORTACAO_PYSCRIPT_TIPO,
                true,
                false
            );

            document.getElementById("btnConfirmarImportacao").style.display = "none";

            if (campeonato) {
                await marcarPilotosJaVinculadosAoCampeonato(campeonato, true);
            } else {
                const status = document.getElementById("statusImport");

                if (status) {
                    status.innerHTML = "✅ Arquivo lido. Selecione o campeonato para marcar automaticamente pilotos já vinculados.";
                }
            }
        }
    } catch (e) {
        console.error("Falha ao receber dados do PyScript:", e);
    }
}

window.receberImportacaoPyScript = receberImportacaoPyScript;
window.receberResultadoFinalPyScript = receberImportacaoPyScript;

function normalizarRegistroImportacao(item) {
    const driverName = item.driver_name || item.nome || item.piloto || item.piloto_original || "";
    const driverId = item.driver_id || item.id_piloto || "";
    const posicaoFinal = item.posicao_final || item.pos || item.posicao || "";

    return {
        driver_id: String(driverId || "").trim(),
        driver_name: String(driverName || "").trim(),
        nome: String(driverName || "").trim(),
        id_piloto: String(driverId || "").trim(),
        pos: String(posicaoFinal || "").trim(),
        posicao_final: parseInt(posicaoFinal) || 0,
        posGeral: parseInt(posicaoFinal) || 9999,
        arquivo_origem: item.arquivo_origem || "",
        evento: item.evento || "",
        kart_numero: item.kart_numero || "",
        classe: item.classe || "",
        melhor_tempo: item.melhor_tempo || "",
        melhor_tempo_segundos: item.melhor_tempo_segundos ?? "",
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

function montarImportacaoPreviaDoArquivo(
    registros,
    campeonato = "",
    tipoArquivo = "resultado_final",
    exibirHint = false,
    calcularPontos = false
) {
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
            String(getPilotoCampo(p, "id_piloto", "id") || "").trim() === String(item.driver_id || "").trim() &&
            item.driver_id
        );

        const conflitoId = porId.length > 1;

        const existente = porId[0] ||
            DB.pilotos.find(p =>
                (getPilotoCampo(p, "nome") || "").toUpperCase() ===
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

function analisarHTML(
    htmlText,
    campeonato = "",
    dataCorrida = "",
    tipoArquivo = "resultado_final",
    calcularPontos = false
) {
    const doc = new DOMParser().parseFromString(htmlText, "text/html");
    const rows = doc.querySelectorAll("tr");

    let encontrados = [];

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
            melhor_tempo: melhorTempo,
            melhor_tempo_segundos: tempoParaSegundosJS(melhorTempo)
        });
    });

    return montarImportacaoPreviaDoArquivo(
        encontrados,
        campeonato,
        tipoArquivo,
        true,
        calcularPontos
    );
}

function recalcularPreviewImportacao(campeonato, exibirHint = false, calcularPontos = false) {
    IMPORTACAO_PREVIA = (IMPORTACAO_PREVIA.length ? IMPORTACAO_PREVIA : [])
        .sort((a, b) => (a.posGeral || 9999) - (b.posGeral || 9999));

    const cfg = getTipoArquivoSelecionado() ||
        TIPOS_ARQUIVO.find(t => t.tipo === IMPORTACAO_PREVIA[0]?.tipoArquivo);

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
            item.posicao_final2 = item.checked && !item.conflitoId
                ? rankPorItem.get(item) || 0
                : 0;

            item.posCampeonato = item.posicao_final2;

            item.pontos = item.posicao_final2
                ? PONTOS_PADRAO[item.posicao_final2] || 0
                : 0;

            item.origemPontuacao = item.posicao_final2
                ? "Pontuação padrão da importação"
                : "-";
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
            .map(item => ({
                item,
                segundos: obterMelhorTempoSegundos(item)
            }))
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

    document.getElementById("previewImportacao").innerHTML = h;
}

function toggleSelecionadoImport(idx) {
    const campeonato = document.getElementById("imp_camp")?.value || "";
    const cfg = getTipoArquivoSelecionado();

    if (!IMPORTACAO_PREVIA[idx]) return;

    IMPORTACAO_PREVIA[idx].checked = !!document.getElementById(`imp_chk_${idx}`)?.checked;

    const tipoArquivo = cfg?.tipo || IMPORTACAO_PREVIA[idx]?.tipoArquivo || "";

    const deveRecalcularAutomatico =
        tipoArquivo === "resultado_final" ||
        tipoArquivo === "classificacao" ||
        IMPORTACAO_PREVIA_GERADA;

    recalcularPreviewImportacao(
        campeonato,
        true,
        deveRecalcularAutomatico
    );

    const selecionados = IMPORTACAO_PREVIA.filter(i => i.checked && !i.conflitoId);
    const statusTexto = String(document.getElementById("statusImport")?.innerText || "").toLowerCase();

    const arquivoJaFoiSalvo =
        statusTexto.includes("salvo") ||
        statusTexto.includes("prévia gerada") ||
        statusTexto.includes("prévia gerada");

    document.getElementById("btnConfirmarImportacao").style.display =
        arquivoJaFoiSalvo && selecionados.length
            ? "block"
            : "none";
}

async function confirmarImportacao() {
    const campeonato = document.getElementById("imp_camp").value;
    const etapa = document.getElementById("imp_etapa").value;
    const data = document.getElementById("imp_data").value;
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

    status.innerHTML = `⏳ Importando ${selecionados.length} piloto(s) para o Firestore...`;

    try {
        const saveInfo = await salvarSelecionadosNoFirestore({
            campeonato,
            etapa,
            dataCorrida: data,
            cfg,
            selecionados,
            nomeArquivo
        });

        status.innerHTML = `✅ Importação concluída: ${selecionados.length} piloto(s) gravado(s) no Firestore. Caminho: ${htmlEscape(saveInfo.caminhoFirestore)}.`;
        alert(`✅ Importação concluída com ${selecionados.length} piloto(s).`);

        document.getElementById("btnConfirmarImportacao").style.display = "none";
    } catch (e) {
        console.error(e);
        status.innerHTML = `❌ Erro ao gravar no Firestore: ${htmlEscape(e.message || e)}`;
        alert("Erro ao gravar no Firestore. Veja o console para detalhes.");
    }
}

function abrirGestao() {
    show("gestao");
    renderGestao();
}

function trocarAbaGestao(aba) {
    abaGestaoAtual = aba;

    document.getElementById("secCampeonatos").style.display = aba === "campeonatos" ? "block" : "none";
    document.getElementById("secPilotos").style.display = aba === "pilotos" ? "block" : "none";

    document.getElementById("tabCampeonatos").classList.toggle("active-tab", aba === "campeonatos");
    document.getElementById("tabPilotos").classList.toggle("active-tab", aba === "pilotos");
}

function renderGestao() {
    trocarAbaGestao(abaGestaoAtual);

    document.getElementById("piloto_campeonatos").innerHTML =
        '<option value="">Selecione o campeonato</option>' +
        DB.campeonatos.map(c =>
            `<option value="${htmlEscape(c.nome)}">${htmlEscape(c.nome)}</option>`
        ).join("");

    document.getElementById("listaCampeonatos").innerHTML =
        DB.campeonatos.map((c, idx) =>
            `<div class='piloto-card'>
                <span>
                    <strong>${htmlEscape(c.nome || "")}</strong><br>
                    <small class='muted'>
                        ${htmlEscape(c["descrição"] || c.descrição || "")}
                        • ${htmlEscape(c["data de inicio"] || "")}
                        até ${htmlEscape(c["data de fim"] || "")}
                    </small>
                </span>
                <span class="actions">
                    <button class='btn-icon' title="Editar" aria-label="Editar" onclick="editarCampeonato(${idx})">✏️</button>
                    <button class='btn-icon' title="Excluir" aria-label="Excluir" onclick="excluirCampeonato(${idx})">🗑️</button>
                </span>
            </div>`
        ).join("") || "<p class='muted'>Nenhum campeonato cadastrado.</p>";

    document.getElementById("listaPilotos").innerHTML =
        DB.pilotos.map((p, idx) => {
            const nome = getPilotoCampo(p, "nome");
            const idPiloto = getPilotoCampo(p, "id_piloto", "id");
            const apelido = getPilotoCampo(p, "apelido");
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
                    <button class='btn-icon' title="Excluir" aria-label="Excluir" onclick="excluirPiloto(${idx})">🗑️</button>
                </span>
            </div>`;
        }).join("") || "<p class='muted'>Nenhum piloto cadastrado.</p>";

    renderPontuacoesCampeonato(
        document.getElementById("camp_nome").value ||
        DB.campeonatos[0]?.nome ||
        ""
    );
}

async function enviarGestao(payload) {
    const r = await fetch(URL_API, {
        method: "POST",
        body: JSON.stringify(payload)
    });

    const msg = await r.text();
    const target = payload.tipo === "campeonatos" ? "feedbackCampeonato" : "feedbackPiloto";

    document.getElementById(target).textContent = msg;

    await fetchData();
    renderGestao();
}

async function salvarCampeonato() {
    const nome = document.getElementById("camp_nome").value.trim();

    if (!nome) {
        document.getElementById("feedbackCampeonato").innerHTML =
            '<span class="error">Nome do campeonato é obrigatório.</span>';
        return;
    }

    const payload = {
        tipo: "campeonatos",
        acao: campeonatoEditando === null ? "criar" : "editar",
        nome,
        descrição: document.getElementById("camp_descricao").value.trim(),
        "data de inicio": document.getElementById("camp_data_inicio").value,
        "data de fim": document.getElementById("camp_data_fim").value
    };

    if (campeonatoEditando !== null) {
        payload.nomeAtual = DB.campeonatos[campeonatoEditando].nome;
    }

    await enviarGestao(payload);
    await garantirPontuacaoPadrao(nome);

    campeonatoEditando = null;
}

function editarCampeonato(idx) {
    const c = DB.campeonatos[idx];

    if (!c) return;

    campeonatoEditando = idx;

    document.getElementById("camp_nome").value = c.nome || "";
    document.getElementById("camp_descricao").value = c["descrição"] || c.descrição || "";
    document.getElementById("camp_data_inicio").value = formatarDataISO(c["data de inicio"] || "");
    document.getElementById("camp_data_fim").value = formatarDataISO(c["data de fim"] || "");

    trocarAbaGestao("campeonatos");
    renderPontuacoesCampeonato(c.nome || "");
}

function excluirCampeonato(idx) {
    const c = DB.campeonatos[idx];

    if (c && confirm(`Excluir campeonato ${c.nome}?`)) {
        enviarGestao({
            tipo: "campeonatos",
            acao: "excluir",
            nome: c.nome
        });
    }
}

async function garantirPontuacaoPadrao(campeonato) {
    const existentes = (DB.pontuacoes || []).filter(p => p.campeonato === campeonato);

    if (existentes.length) return;

    for (const [posicao, pontos] of Object.entries(PONTOS_PADRAO)) {
        await enviarGestao({
            tipo: "pontuacoes",
            acao: "criar",
            campeonato,
            posicao: Number(posicao),
            pontos
        });
    }
}

function renderPontuacoesCampeonato(campeonato) {
    const linhas = (DB.pontuacoes || [])
        .filter(p => p.campeonato === campeonato)
        .sort((a, b) => parseInt(a.posicao) - parseInt(b.posicao));

    document.getElementById("listaPontuacoes").innerHTML =
        linhas.map((p, idx) =>
            `<div class='piloto-card'>
                <span>Posição ${p.posicao} = ${p.pontos} pontos</span>
                <span class="actions">
                    <button class='btn-icon' title="Editar" aria-label="Editar" onclick="editarPontuacao('${campeonato}',${idx})">✏️</button>
                    <button class='btn-icon' title="Excluir" aria-label="Excluir" onclick="excluirPontuacao('${campeonato}',${idx})">🗑️</button>
                </span>
            </div>`
        ).join("") || "<p class='muted'>Sem pontuação cadastrada.</p>";
}

async function adicionarPontuacaoLinha() {
    const campeonato = document.getElementById("camp_nome").value.trim();
    const posicao = parseInt(document.getElementById("pont_posicao").value);
    const pontos = parseInt(document.getElementById("pont_pontos").value);

    if (!campeonato || !posicao || Number.isNaN(pontos)) {
        return alert("Preencha campeonato, posição e pontos.");
    }

    const existente = (DB.pontuacoes || []).find(p =>
        p.campeonato === campeonato &&
        parseInt(p.posicao) === posicao
    );

    await enviarGestao({
        tipo: "pontuacoes",
        acao: existente ? "editar" : "criar",
        campeonato,
        posicao,
        pontos
    });
}

async function editarPontuacao(campeonato, idx) {
    const linhas = (DB.pontuacoes || [])
        .filter(p => p.campeonato === campeonato)
        .sort((a, b) => parseInt(a.posicao) - parseInt(b.posicao));

    const item = linhas[idx];

    if (!item) return;

    const novo = prompt(`Pontos para posição ${item.posicao}:`, item.pontos);

    if (novo === null) return;

    await enviarGestao({
        tipo: "pontuacoes",
        acao: "editar",
        campeonato,
        posicao: item.posicao,
        pontos: parseInt(novo) || 0
    });
}

async function excluirPontuacao(campeonato, idx) {
    const linhas = (DB.pontuacoes || [])
        .filter(p => p.campeonato === campeonato)
        .sort((a, b) => parseInt(a.posicao) - parseInt(b.posicao));

    const item = linhas[idx];

    if (!item || !confirm(`Excluir pontuação da posição ${item.posicao}?`)) {
        return;
    }

    await enviarGestao({
        tipo: "pontuacoes",
        acao: "excluir",
        campeonato,
        posicao: item.posicao
    });
}

async function salvarPiloto() {
    const nome = document.getElementById("piloto_nome").value.trim();
    const id_piloto = document.getElementById("piloto_id").value.trim();
    const campeonatos = document.getElementById("piloto_campeonatos").value.trim();

    if (!nome) {
        document.getElementById("feedbackPiloto").innerHTML =
            '<span class="error">Nome do piloto é obrigatório.</span>';
        return;
    }

    if (pilotoEditando === null && !id_piloto) {
        document.getElementById("feedbackPiloto").innerHTML =
            '<span class="error">id_piloto é obrigatório para novos cadastros.</span>';
        return;
    }

    const duplicado = DB.pilotos.some((p, idx) =>
        idx !== pilotoEditando &&
        String(getPilotoCampo(p, "id_piloto", "id") || "").trim() === id_piloto &&
        id_piloto
    );

    if (duplicado) {
        document.getElementById("feedbackPiloto").innerHTML =
            '<span class="error">Já existe piloto com este id_piloto.</span>';
        return;
    }

    const payload = {
        tipo: "pilotos",
        acao: pilotoEditando === null ? "criar" : "editar",
        nome,
        id_piloto,
        id: id_piloto,
        apelido: document.getElementById("piloto_apelido").value.trim(),
        campeonatos,
        vinculos: campeonatos ? [campeonatos] : []
    };

    if (pilotoEditando !== null) {
        payload.nomeAtual = getPilotoCampo(DB.pilotos[pilotoEditando], "nome");
    }

    await enviarGestao(payload);

    pilotoEditando = null;
}

function editarPiloto(idx) {
    const p = DB.pilotos[idx];

    if (!p) return;

    pilotoEditando = idx;

    document.getElementById("piloto_nome").value = getPilotoCampo(p, "nome");
    document.getElementById("piloto_id").value = getPilotoCampo(p, "id_piloto", "id");
    document.getElementById("piloto_apelido").value = getPilotoCampo(p, "apelido");
    document.getElementById("piloto_campeonatos").value = vinculosPiloto(p)[0] || "";

    trocarAbaGestao("pilotos");
}

function excluirPiloto(idx) {
    const p = DB.pilotos[idx];
    const nome = p ? getPilotoCampo(p, "nome") : "";

    if (nome && confirm(`Excluir piloto ${nome}?`)) {
        enviarGestao({
            tipo: "pilotos",
            acao: "excluir",
            nome
        });
    }
}

function preencher(nome, pos, campeonato = "", dataCorrida = "") {
    show("lançar");

    const selPiloto = document.getElementById("sel_piloto");

    if (!Array.from(selPiloto.options).some(opt => opt.value === nome)) {
        const opt = document.createElement("option");
        opt.value = nome;
        opt.text = nome;
        selPiloto.add(opt);
    }

    if (campeonato) {
        document.getElementById("sel_camp").value = campeonato;
        filtrarPilotosPorCamp();

        if (!Array.from(selPiloto.options).some(opt => opt.value === nome)) {
            const opt = document.createElement("option");
            opt.value = nome;
            opt.text = nome;
            selPiloto.add(opt);
        }
    }

    selPiloto.value = nome;
    document.getElementById("res_pos").value = parseInt(pos) || "";

    if (dataCorrida) {
        document.getElementById("res_data").value = dataCorrida;
    }

    document.getElementById("res_etapa").focus();
}

async function carregarHistorico() {
    const lista = document.getElementById("listaHistorico");
    const detalhe = document.getElementById("arquivosDoDia");

    lista.innerHTML = "Carregando dias...";
    detalhe.innerHTML = "";

    try {
        const snapshot = await firestore
            .collection("backups_importacao")
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
            lista.innerHTML = "<p class='muted'>Nenhum arquivo encontrado.</p>";
            return;
        }

        const grupos = {};

        HISTORICO_CACHE.forEach(item => {
            const dia = extrairDataItem(item);

            if (!grupos[dia]) grupos[dia] = [];

            grupos[dia].push(item);
        });

        const dias = Object.keys(grupos).sort((a, b) => b.localeCompare(a));

        lista.innerHTML = dias.map(dia => {
            const itens = grupos[dia];
            const camps = [...new Set(itens.map(i => i.campeonato).filter(Boolean))].join(", ") || "Sem campeonato";

            return `<button class="btn-day" onclick="renderArquivosDoDia('${dia}')">
                📅 ${formatarDataBR(dia)}<br>
                <small>${htmlEscape(camps)} • ${itens.length} arquivo(s)</small>
            </button>`;
        }).join("");
    } catch (e) {
        console.error(e);
        lista.innerHTML = `<p class='muted error'>Erro ao carregar histórico do Firestore: ${htmlEscape(e.message || e)}</p>`;
    }
}

function renderArquivosDoDia(dia) {
    const detalhe = document.getElementById("arquivosDoDia");

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
        const doc = await firestore.collection("backups_importacao").doc(key).get();
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

function obterHistoricoPiloto(nome, campeonatoFiltro = "") {
    return DB.resultados
        .filter(r =>
            (r.piloto || r.Piloto) === nome &&
            (!campeonatoFiltro || (r.campeonato || r.Campeonato) === campeonatoFiltro)
        )
        .map(r => ({
            data: formatarDataISO(r.data || r.Data || ""),
            campeonato: r.campeonato || r.Campeonato || "-",
            etapa: r.etapa || r.Etapa || "-",
            posicao: parseInt(r.posicao || r.Posicao) || 0,
            pontos: parseInt(r.pontos || r.Pontos) || 0
        }))
        .sort((a, b) => paraTimestamp(a.data) - paraTimestamp(b.data));
}

function gerarGraficoHistoricoSVG(hist) {
    if (!hist.length) {
        return "<p class='muted'>Sem histórico para exibir.</p>";
    }

    const w = 620;
    const h = 220;
    const ml = 36;
    const mr = 12;
    const mt = 16;
    const mb = 26;

    const maxPos = Math.max(...hist.map(h => h.posicao || 1), 1);
    const stepX = (w - ml - mr) / Math.max(hist.length - 1, 1);
    const stepY = (h - mt - mb) / Math.max(maxPos - 1, 1);

    const y = pos => mt + ((pos - 1) * stepY);
    const x = i => ml + (i * stepX);

    const points = hist
        .map((item, i) => `${x(i)},${y(item.posicao || 1)}`)
        .join(" ");

    let linhas = "";

    for (let p = 1; p <= maxPos; p++) {
        linhas += `<line x1="${ml}" y1="${y(p)}" x2="${w - mr}" y2="${y(p)}" stroke="#2e3542" stroke-width="1"/>`;
        linhas += `<text x="6" y="${y(p) + 4}" fill="#889" font-size="10">P${p}</text>`;
    }

    const labels = hist.map((item, i) =>
        `<text x="${x(i)}" y="${h - 8}" fill="#999" font-size="10" text-anchor="middle">${(item.data || "-").slice(5)}</text>`
    ).join("");

    const pontos = hist.map((item, i) =>
        `<circle cx="${x(i)}" cy="${y(item.posicao || 1)}" r="3.5" fill="#ff4b4b"/><title>${item.data} • P${item.posicao}</title>`
    ).join("");

    return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid meet" style="display:block; width:100%; max-width:100%; height:auto; background:#141923; border-radius:8px;">
        ${linhas}
        <polyline points="${points}" fill="none" stroke="#ff4b4b" stroke-width="2.5" stroke-linecap="round"/>
        ${pontos}
        ${labels}
    </svg>`;
}

function toggleHistoricoLinha(nome, idx) {
    const detalheId = `hist_row_${idx}`;
    const row = document.getElementById(detalheId);
    const aberto = row.dataset.open === "1";

    document.querySelectorAll("tr.hist-detalhe").forEach(el => {
        el.style.display = "none";
        el.dataset.open = "0";
    });

    if (aberto) return;

    const filtroCamp = document.getElementById("filtro_rank_camp").value;
    const hist = obterHistoricoPiloto(nome, filtroCamp);
    const grafico = gerarGraficoHistoricoSVG(hist);

    const tabela = hist.length ? `
        <table style="margin-top:10px; font-size:12px;">
            <tr>
                <th>Data</th>
                <th>Camp.</th>
                <th>Etapa</th>
                <th>Posição</th>
                <th>Pontos</th>
            </tr>
            ${hist.map(item =>
                `<tr>
                    <td>${htmlEscape(item.data)}</td>
                    <td>${htmlEscape(item.campeonato)}</td>
                    <td>${htmlEscape(item.etapa)}</td>
                    <td>${item.posicao ? `P${item.posicao}` : "-"}</td>
                    <td>${item.pontos}</td>
                </tr>`
            ).join("")}
        </table>`
        : "<p class='muted'>Sem corridas registradas.</p>";

    row.innerHTML = `<td colspan="3">
        <div style="padding:8px 4px; max-width:100%; overflow:hidden;">
            <div class='hint' style='margin-bottom:6px;'>Evolução de posições por corrida (linha do tempo)</div>
            <div style='max-width:100%; overflow-x:auto;'>${grafico}</div>
            <div style='max-width:100%; overflow-x:auto;'>${tabela}</div>
        </div>
    </td>`;

    row.style.display = "table-row";
    row.dataset.open = "1";
}

function renderRanking() {
    const f = document.getElementById("filtro_rank_camp").value;
    const res = f
        ? DB.resultados.filter(r => (r.campeonato || r.Campeonato) === f)
        : DB.resultados;

    const soma = {};

    res.forEach(r => {
        const n = r.piloto || r.Piloto;

        soma[n] = (soma[n] || 0) + (parseInt(r.pontos || r.Pontos) || 0);
    });

    const sorted = Object.entries(soma).sort((a, b) => b[1] - a[1]);
    const total = sorted.reduce((acc, [, pts]) => acc + pts, 0);

    let h = "<table><tr><th>Pos</th><th>Piloto</th><th>Pts</th></tr>";

    sorted.forEach((p, i) => {
        const perc = total ? ((p[1] / total) * 100).toFixed(1) : "0.0";

        h += `<tr onclick="toggleHistoricoLinha('${htmlEscape(p[0])}', ${i})" style="cursor:pointer;">
            <td>${i + 1}º</td>
            <td>${htmlEscape(p[0])}</td>
            <td>${p[1]} <small style='color:#aaa; font-size:11px;'>(${perc}%)</small></td>
        </tr>`;

        h += `<tr id="hist_row_${i}" class="hist-detalhe" data-open="0" style="display:none;"></tr>`;
    });

    document.getElementById("rankingContent").innerHTML = h + "</table>";
}

function popularFiltros() {
    const opts = DB.campeonatos.map(c =>
        `<option value="${htmlEscape(c.nome)}">${htmlEscape(c.nome)}</option>`
    ).join("");

    document.getElementById("filtro_rank_camp").innerHTML = '<option value="">📊 Ranking Geral</option>' + opts;
    document.getElementById("sel_camp").innerHTML = '<option value="">Selecione o Campeonato</option>' + opts;
    document.getElementById("imp_camp").innerHTML = '<option value="">Selecione o Campeonato</option>' + opts;

    document.getElementById("imp_etapa").value = "";
    document.getElementById("imp_data").value = hojeISO();
    document.getElementById("res_data").value = hojeISO();

    const pOpts = DB.pilotos.map(p =>
        `<option value="${htmlEscape(p.nome)}">${htmlEscape(p.nome)}</option>`
    ).sort().join("");

    document.getElementById("sel_piloto").innerHTML =
        '<option value="">Selecione o Piloto</option>' + pOpts;
}

function filtrarPilotosPorCamp() {
    const c = document.getElementById("sel_camp").value;

    if (!c) return;

    const p = DB.pilotos.filter(pil =>
        pil.vinculos && pil.vinculos.includes(c)
    );

    document.getElementById("sel_piloto").innerHTML =
        '<option value="">Selecione o Piloto</option>' +
        p.map(pil =>
            `<option value="${htmlEscape(pil.nome)}">${htmlEscape(pil.nome)}</option>`
        ).join("");
}

async function salvar(tipo) {
    const btn = event.target;

    btn.innerText = "⏳ ENVIANDO...";
    btn.disabled = true;

    let p = { tipo };

    if (tipo === "resultados") {
        p.senha = document.getElementById("pass_res").value;
        p.campeonato = document.getElementById("sel_camp").value;
        p.piloto = document.getElementById("sel_piloto").value;
        p.posicao = document.getElementById("res_pos").value;
        p.etapa = document.getElementById("res_etapa").value;
        p.data = document.getElementById("res_data").value;
    }

    try {
        const r = await fetch(URL_API, {
            method: "POST",
            body: JSON.stringify(p)
        });

        const t = await r.text();

        if (t.includes("Sucesso")) {
            alert("✅ Corrida gravada com sucesso!");
            location.reload();
        } else {
            alert("❌ Erro: Senha incorreta ou dados faltando.");
            btn.disabled = false;
            btn.innerText = "GRAVAR NO GOOGLE SHEETS";
        }
    } catch (e) {
        alert("Erro de rede");
        btn.disabled = false;
    }
}

async function inicializarRankingFirestore() {
    if (!RANKING_FIRESTORE_CARREGADO) {
        await carregarCampeonatosRankingFirestore();
        RANKING_FIRESTORE_CARREGADO = true;
    }

    await renderRankingFirestore();
}

async function carregarCampeonatosRankingFirestore() {
    const select = document.getElementById("filtro_rank_firebase_camp");
    const status = document.getElementById("rankingFirestoreStatus");

    if (!select) return;

    try {
        if (status) status.innerHTML = "⏳ Carregando campeonatos do Firestore...";

        const snapshot = await firestore.collection("campeonado").get();

        const campeonatos = [];

        snapshot.forEach(doc => {
            const data = doc.data() || {};

            campeonatos.push({
                id: doc.id,
                nome: data.nome || doc.id
            });
        });

        campeonatos.sort((a, b) => a.nome.localeCompare(b.nome));

        if (!campeonatos.length) {
            select.innerHTML = '<option value="">Nenhum campeonato encontrado no Firebase</option>';
            if (status) status.innerHTML = "Nenhum campeonato encontrado na collection campeonado.";
            return;
        }

        select.innerHTML =
            '<option value="">Selecione o Campeonato</option>' +
            campeonatos.map(c =>
                `<option value="${htmlEscape(c.id)}">${htmlEscape(c.nome)}</option>`
            ).join("");

        if (status) status.innerHTML = "Selecione um campeonato para carregar o ranking do Firestore.";
    } catch (e) {
        console.error(e);

        select.innerHTML = '<option value="">Erro ao carregar campeonatos</option>';

        if (status) {
            status.innerHTML = `❌ Erro ao carregar campeonatos do Firestore: ${htmlEscape(e.message || e)}`;
        }
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

    const bonusMelhorTempoClassificacao = Math.max(
        Number(item.melhor_tempo_ponto || 0),
        Number(item.pontos || 0)
    );

    linha.driver_id = linha.driver_id || driverId;
    linha.driver_name = linha.driver_name !== "-" ? linha.driver_name : driverName;

    linha.pontos_melhor_tempo_classificacao += bonusMelhorTempoClassificacao;
    linha.pontos_total += bonusMelhorTempoClassificacao;

    linha.etapas.push({
        tipo: "Classificação",
        etapa: etapaInfo.etapa || "-",
        dataCorrida: etapaInfo.dataCorrida || "-",
        posicao_final2: item.posicao_final2 || "-",
        pontos: bonusMelhorTempoClassificacao,
        melhor_tempo: item.melhor_tempo || "-",
        melhor_tempo_ponto: bonusMelhorTempoClassificacao
    });
}

async function buscarRankingFirestorePorCampeonato(campeonatoDocId) {
    const campRef = firestore.collection("campeonado").doc(campeonatoDocId);
    const resultadosSnapshot = await campRef.collection("resultado_final").get();

    const rankingMap = new Map();

    for (const resultadoDoc of resultadosSnapshot.docs) {
        const etapaInfo = resultadoDoc.data() || {};
        const resultadoRef = resultadoDoc.ref;

        const pilotosResultadoSnapshot = await resultadoRef.collection("pilotos_resultado").get();

        pilotosResultadoSnapshot.forEach(pilotoDoc => {
            somarResultadoFinalRankingFirestore(
                rankingMap,
                pilotoDoc.data() || {},
                etapaInfo
            );
        });

        const classificacaoSnapshot = await resultadoRef.collection("classificacao").get();

        classificacaoSnapshot.forEach(pilotoDoc => {
            somarClassificacaoRankingFirestore(
                rankingMap,
                pilotoDoc.data() || {},
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

        let h = `
            <table>
                <tr>
                    <th>Pos</th>
                    <th>Piloto</th>
                    <th>Pts</th>
                </tr>
        `;

        ranking.forEach((p, i) => {
            h += `
                <tr onclick="toggleHistoricoLinhaFirestore(${i})" style="cursor:pointer;">
                    <td>${i + 1}º</td>
                    <td>${htmlEscape(p.driver_name || "-")}</td>
                    <td>${p.pontos_total}</td>
                </tr>
                <tr id="hist_firestore_row_${i}" class="hist-detalhe" data-open="0" style="display:none;"></tr>
            `;
        });

        h += "</table>";

        content.innerHTML = h;

        if (status) {
            status.innerHTML = `
                ✅ Ranking carregado do Firestore.
                Pontuação total = posição da corrida + melhor volta da corrida + melhor volta da classificação.
            `;
        }
    } catch (e) {
        console.error(e);

        content.innerHTML = "";
        if (status) {
            status.innerHTML = `❌ Erro ao carregar ranking do Firestore: ${htmlEscape(e.message || e)}`;
        }
    }
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

    const tabelaDetalhes = detalhes.length ? `
        <table style="margin-top:10px; font-size:12px;">
            <tr>
                <th>Tipo</th>
                <th>Data</th>
                <th>Etapa</th>
                <th>Posição</th>
                <th>Melhor tempo</th>
                <th>Pts</th>
                <th>Melhor tempo?</th>
            </tr>
            ${detalhes.map(d => `
                <tr>
                    <td>${htmlEscape(d.tipo || "-")}</td>
                    <td>${htmlEscape(d.dataCorrida || "-")}</td>
                    <td>${htmlEscape(d.etapa || "-")}</td>
                    <td>${htmlEscape(d.posicao_final2 || "-")}</td>
                    <td>${htmlEscape(d.melhor_tempo || "-")}</td>
                    <td>${Number(d.pontos || 0)}</td>
                    <td>${Number(d.melhor_tempo_ponto || 0)}</td>
                </tr>
            `).join("")}
        </table>
    ` : "<p class='muted'>Sem detalhes para exibir.</p>";

    row.innerHTML = `
        <td colspan="3">
            <div style="padding:8px 4px; max-width:100%; overflow:hidden;">
                <div class="hint">
                    <strong>${htmlEscape(item.driver_name || "-")}</strong><br>
                    Pontos posição corrida: ${item.pontos_posicao_corrida}<br>
                    Melhor volta corrida: ${item.pontos_melhor_tempo_corrida}<br>
                    Melhor volta classificação: ${item.pontos_melhor_tempo_classificacao}<br>
                    Total: ${item.pontos_total}
                </div>
                <div style="max-width:100%; overflow-x:auto;">
                    ${tabelaDetalhes}
                </div>
            </div>
        </td>
    `;

    row.style.display = "table-row";
    row.dataset.open = "1";
}

fetchData();