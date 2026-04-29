const firebaseConfig = {
    apiKey: "AIzaSyCGaQnACY0Qi7efLxL0PZ5-X3rbLBGaPyk",
    authDomain: "ranking-kart-system.firebaseapp.com",
    databaseURL: "https://ranking-kart-system-default-rtdb.firebaseio.com",
    projectId: "ranking-kart-system",
    storageBucket: "ranking-kart-system.firebasestorage.app",
    messagingSenderId: "933803342903",
    appId: "1:933803342903:web:9f7d6a5f7e7e8c1b9a9d1c"
};

firebase.initializeApp(firebaseConfig);
const database = firebase.database();

const URL_API = "https://script.google.com/macros/s/AKfycbwWIL3hrPq6w6pCjCS5-ZYwv3hAY8Rr1ZjYxC-tEh7f9enmpTsZ7fzu9ilWpioQGQEc/exec";

let DB = { campeonatos: [], pilotos: [], resultados: [] };
let HISTORICO_CACHE = [];
let abaGestaoAtual = "campeonatos";
let campeonatoEditando = null;
let pilotoEditando = null;
let IMPORTACAO_PREVIA = [];
const PONTOS_PADRAO = { 1: 20, 2: 17, 3: 15, 4: 13, 5: 11, 6: 10, 7: 9, 8: 8, 9: 7, 10: 6 };

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
    { tipo: "volta_a_volta", label: "Volta a volta", inputId: "fileVoltaVolta" },
    { tipo: "classificacao", label: "Classificação", inputId: "fileClassificacao" },
    { tipo: "resultado_final", label: "Resultado final", inputId: "fileResultadoFinal" }
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
    }
}

function show(id) {
    document.querySelectorAll(".section").forEach(s => s.classList.remove("active"));
    document.getElementById(id).classList.add("active");
}

function htmlEscape(v) { return String(v || "").replace(/[&<>'"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[c])); }
function normalizarChave(v) { return String(v || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9_-]/g, "_").toLowerCase(); }
function hojeISO() { return new Date().toISOString().slice(0, 10); }
function formatarDataBR(dataISO) { if (!dataISO) return "-"; const base = String(dataISO).split("T")[0].split(" ")[0]; const p = base.split("-"); return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : base; }
function formatarDataISO(dataISO) { if (!dataISO) return "-"; return String(dataISO).split("T")[0].split(" ")[0]; }


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

function pilotosDoCampeonato(campeonato) {
    return DB.pilotos.filter(p => vinculosPiloto(p).includes(campeonato));
}
function pontuacaoPorPosicao(campeonato, posicao) {
    const base = (DB.pontuacoes || []).find(p => p.campeonato === campeonato && parseInt(p.posicao) === parseInt(posicao));
    if (base && !Number.isNaN(parseInt(base.pontos))) return { pontos: parseInt(base.pontos), origem: "Pontuação cadastrada" };
    if (PONTOS_PADRAO[posicao]) return { pontos: PONTOS_PADRAO[posicao], origem: "Pontuação padrão" };
    return { pontos: 0, origem: "Sem pontuação" };
}

async function fazerBackupEProcessar() {
    const campeonato = document.getElementById("imp_camp").value;
    const etapa = document.getElementById("imp_etapa").value;
    const dataCorrida = document.getElementById("imp_data").value;
    const status = document.getElementById("statusImport");

    if (!campeonato) return alert("Selecione o campeonato!");
    if (!etapa) return alert("Informe a etapa!");
    if (!dataCorrida) return alert("Informe a data da corrida!");

    const arquivos = TIPOS_ARQUIVO.map(cfg => ({ ...cfg, file: document.getElementById(cfg.inputId).files[0] }));
    const faltando = arquivos.filter(a => !a.file).map(a => a.label).join(", ");
    if (faltando) return alert("Selecione os 3 arquivos. Faltando: " + faltando);

    status.innerHTML = "⏳ Salvando os 3 arquivos...";
    document.getElementById("previewImportacao").innerHTML = "";

    let htmlResultadoFinal = "";

    for (let i = 0; i < arquivos.length; i++) {
        const item = arquivos[i];
        const file = item.file;
        const dataUrl = await arquivoParaDataUrl(file);
        const isTexto = file.type.includes("html") || file.type.includes("text") || file.name.toLowerCase().endsWith(".html") || file.name.toLowerCase().endsWith(".htm");
        const conteudoRaw = isTexto ? await file.text() : "";
        const idUnico = `${dataCorrida}_${normalizarChave(campeonato)}_${item.tipo}_${Date.now()}_${i}`;

        await database.ref("backups/" + idUnico).set({
            campeonato, dataCorrida, tipoArquivo: item.tipo, tipoLabel: item.label,
            nomeArquivo: file.name, mimeType: file.type || (file.name.toLowerCase().endsWith(".pdf") ? "application/pdf" : "text/html"),
            tamanhoBytes: file.size, dataUpload: new Date().toLocaleString("pt-BR"), dataUploadISO: new Date().toISOString(), dataUrl, conteudo: conteudoRaw
        });

        if (item.tipo === "resultado_final" && conteudoRaw) htmlResultadoFinal = conteudoRaw;
    }

    if (htmlResultadoFinal) {
        IMPORTACAO_PREVIA = analisarHTML(htmlResultadoFinal, campeonato, dataCorrida, true);
        status.innerHTML = `✅ Arquivos salvos. Revise os pilotos abaixo e confirme a importação.`;
        document.getElementById("btnConfirmarImportacao").style.display = "block";
    } else {
        status.innerHTML = "✅ Arquivos salvos no Firebase!";
    }

    TIPOS_ARQUIVO.forEach(cfg => { document.getElementById(cfg.inputId).value = ""; });
}

async function enviarResultado(payload) {
    const r = await fetch(URL_API, { method: "POST", body: JSON.stringify(payload) });
    const t = await r.text();
    if (!t.includes("Sucesso")) throw new Error(t || "Falha ao lançar");
}

async function lancarAutomatico(encontrados, campeonato, dataCorrida) {
    const participantes = new Set(pilotosDoCampeonato(campeonato).map(p => (p.nome || "").toUpperCase()));
    const validos = encontrados.filter(p => participantes.has((p.nome || "").toUpperCase()));

    let count = 0;
    for (const p of validos) {
        const payload = { tipo: "resultados", campeonato, piloto: p.nome, posicao: p.pos, etapa: "", data: dataCorrida, auto: true };
        try { await enviarResultado(payload); count += 1; } catch (e) { console.error(e); }
    }
    return count;
}

function analisarHTML(htmlText, campeonato = "", dataCorrida = "", auto = false) {
    const doc = new DOMParser().parseFromString(htmlText, "text/html");
    const rows = doc.querySelectorAll("tr");
    const participantes = pilotosDoCampeonato(campeonato);

    let encontrados = [];
    rows.forEach(row => {
        const tds = row.querySelectorAll("td");
        if (!tds.length) return;
        const textos = Array.from(tds).map(td => (td.innerText || "").trim()).filter(Boolean);
        const pos = textos.find(t => /^\d+$/.test(t));
        if (!pos) return;
        const possivelId = textos.find(t => /^\d{3,}$/.test(t) && t !== pos) || "";
        const nome = textos.find(t => /[a-zA-ZÀ-ÿ]/.test(t) && t !== possivelId) || "";
        if (!nome) return;
        encontrados.push({ nome, pos, id_piloto: possivelId });
    });
    encontrados = encontrados.filter((r, i, arr) => arr.findIndex(x => x.nome === r.nome && x.pos === r.pos && String(x.id_piloto) === String(r.id_piloto)) === i);
    IMPORTACAO_PREVIA = encontrados.map(item => {
        const porId = DB.pilotos.filter(p => String(getPilotoCampo(p, "id_piloto", "id") || "").trim() === String(item.id_piloto || "").trim() && item.id_piloto);
        const conflitoId = porId.length > 1;
        const existente = porId[0] ||
            DB.pilotos.find(p => (getPilotoCampo(p, "nome") || "").toUpperCase() === (item.nome || "").toUpperCase());
        const vinculado = existente ? vinculosPiloto(existente).includes(campeonato) : false;
        return { ...item, checked: vinculado, conflitoId, status: conflitoId ? "ID duplicado/conflito" : (existente ? "Piloto já cadastrado" : "Será cadastrado automaticamente"), posGeral: parseInt(item.pos) || 9999 };
    });
    recalcularPreviewImportacao(campeonato);
    return IMPORTACAO_PREVIA;
}

function recalcularPreviewImportacao(campeonato) {
    IMPORTACAO_PREVIA = (IMPORTACAO_PREVIA.length ? IMPORTACAO_PREVIA : []).sort((a, b) => (a.posGeral || 9999) - (b.posGeral || 9999));
    const selecionados = IMPORTACAO_PREVIA.filter(i => i.checked && !i.conflitoId).sort((a, b) => a.posGeral - b.posGeral);
    const mapaPos = new Map(selecionados.map((p, idx) => [p, idx + 1]));
    IMPORTACAO_PREVIA.forEach(item => {
        item.posCampeonato = item.checked && !item.conflitoId ? (mapaPos.get(item) || 0) : 0;
        const calc = item.posCampeonato ? pontuacaoPorPosicao(campeonato, item.posCampeonato) : { pontos: 0, origem: "-" };
        item.pontos = calc.pontos;
        item.origemPontuacao = calc.origem;
    });
    let h = "<h3>Pilotos Identificados no Resultado Final:</h3>";
    if (!IMPORTACAO_PREVIA.length) h += "<p class='muted'>Nenhum piloto identificado no arquivo final.</p>";
    h += `<table><tr><th></th><th>Pos. geral</th><th>ID</th><th>Piloto</th><th>Status</th><th>Pos. campeonato</th><th>Pontos</th><th>Origem</th></tr>`;
    IMPORTACAO_PREVIA.forEach((i, idx) => {
        h += `<tr><td><input type="checkbox" id="imp_chk_${idx}" ${i.checked ? "checked" : ""} onchange="toggleSelecionadoImport(${idx}, '${htmlEscape(campeonato)}')"></td><td>${htmlEscape(i.pos)}</td><td>${htmlEscape(i.id_piloto || "-")}</td><td>${htmlEscape(i.nome)}</td><td>${htmlEscape(i.status)}</td><td>${i.posCampeonato || "-"}</td><td>${i.pontos}</td><td>${htmlEscape(i.origemPontuacao || "-")}</td></tr>`;
    });
    h += "</table>";

    if (auto) h += "<p class='hint'>Somente pilotos vinculados ao campeonato foram considerados.</p>";
    document.getElementById("previewImportacao").innerHTML = h;
}

function toggleSelecionadoImport(idx, campeonato) {
    IMPORTACAO_PREVIA[idx].checked = !!document.getElementById(`imp_chk_${idx}`)?.checked;
    recalcularPreviewImportacao(campeonato);
}

async function confirmarImportacao() {
    const campeonato = document.getElementById("imp_camp").value;
    const etapa = document.getElementById("imp_etapa").value;
    const data = document.getElementById("imp_data").value;
    const selecionados = IMPORTACAO_PREVIA.filter(i => i.checked && !i.conflitoId).sort((a, b) => a.posGeral - b.posGeral);
    if (!selecionados.length) return alert("Selecione ao menos um piloto.");
    const duplicadoEtapa = DB.resultados.some(r => (r.campeonato || r.Campeonato) === campeonato && String(r.etapa || r.Etapa) === String(etapa) && formatarDataISO(r.data || r.Data) === data);
    if (duplicadoEtapa) return alert("Já existem resultados para este campeonato + etapa + data.");

    const erros = [];
    for (const p of selecionados) {
        if (!p.nome) { erros.push("Piloto sem nome não pode ser importado."); continue; }
        const porId = p.id_piloto ? DB.pilotos.find(x => String(getPilotoCampo(x, "id_piloto", "id")) === String(p.id_piloto)) : null;
        const porNome = DB.pilotos.find(x => (getPilotoCampo(x, "nome") || "").toUpperCase() === (p.nome || "").toUpperCase());
        const existente = porId || porNome;
        try {
            if (!existente) {
                await enviarGestao({ tipo: "pilotos", acao: "criar", nome: p.nome, id_piloto: p.id_piloto || "", id: p.id_piloto || "", apelido: "", campeonatos: campeonato, vinculos: [campeonato] });
            } else {
                const vinc = new Set(vinculosPiloto(existente));
                vinc.add(campeonato);
                await enviarGestao({ tipo: "pilotos", acao: "editar", nomeAtual: getPilotoCampo(existente, "nome"), nome: getPilotoCampo(existente, "nome"), id_piloto: getPilotoCampo(existente, "id_piloto", "id"), id: getPilotoCampo(existente, "id_piloto", "id"), apelido: getPilotoCampo(existente, "apelido"), campeonatos: Array.from(vinc).join(", "), vinculos: Array.from(vinc) });
            }
            await enviarResultado({ tipo: "resultados", campeonato, etapa, piloto: p.nome, posicao: p.posCampeonato, pontos: p.pontos, data });
        } catch (e) {
            erros.push(`${p.nome}: ${e.message}`);
        }
    }
    if (erros.length) return alert("Falha ao salvar alguns pilotos/resultados:\n" + erros.join("\n"));
    await fetchData();
    alert(`✅ Importação concluída com ${selecionados.length} piloto(s).`);
    document.getElementById("btnConfirmarImportacao").style.display = "none";
}

function abrirGestao() {
    show("gestao");
    renderGestao();
}

function getPilotoCampo(p, ...keys) {
    const achado = keys.find(k => p[k] !== undefined && p[k] !== null);
    return achado ? p[achado] : "";
}

function vinculosPiloto(p) {
    const bruto = getPilotoCampo(p, "campeonatos", "vinculos");
    if (Array.isArray(bruto)) return bruto;
    return String(bruto || "").split(",").map(v => v.trim()).filter(Boolean);
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
    document.getElementById("piloto_campeonatos").innerHTML = '<option value="">Selecione o campeonato</option>' + DB.campeonatos.map(c => `<option value="${htmlEscape(c.nome)}">${htmlEscape(c.nome)}</option>`).join("");
    document.getElementById("listaCampeonatos").innerHTML = DB.campeonatos.map((c, idx) => `<div class='piloto-card'><span><strong>${htmlEscape(c.nome || "")}</strong><br><small class='muted'>${htmlEscape(c["descrição"] || c.descrição || "")} • ${htmlEscape(c["data de inicio"] || "")} até ${htmlEscape(c["data de fim"] || "")}</small></span><span class="actions"><button class='btn-icon' title="Editar" aria-label="Editar" onclick="editarCampeonato(${idx})">✏️</button><button class='btn-icon' title="Excluir" aria-label="Excluir" onclick="excluirCampeonato(${idx})">🗑️</button></span></div>`).join("") || "<p class='muted'>Nenhum campeonato cadastrado.</p>";
    document.getElementById("listaPilotos").innerHTML = DB.pilotos.map((p, idx) => {
        const nome = getPilotoCampo(p, "nome");
        const idPiloto = getPilotoCampo(p, "id_piloto", "id");
        const apelido = getPilotoCampo(p, "apelido");
        const camps = vinculosPiloto(p).join(", ");
        return `<div class='piloto-card'><span><strong>${htmlEscape(nome)}</strong><br><small class='muted'>id_piloto: ${htmlEscape(idPiloto || "-")} • apelido: ${htmlEscape(apelido || "-")} • campeonatos: ${htmlEscape(camps || "-")}</small></span><span class="actions"><button class='btn-icon' title="Editar" aria-label="Editar" onclick="editarPiloto(${idx})">✏️</button><button class='btn-icon' title="Excluir" aria-label="Excluir" onclick="excluirPiloto(${idx})">🗑️</button></span></div>`;
    }).join("") || "<p class='muted'>Nenhum piloto cadastrado.</p>";
    renderPontuacoesCampeonato(document.getElementById("camp_nome").value || DB.campeonatos[0]?.nome || "");
}

async function enviarGestao(payload) {
    const r = await fetch(URL_API, { method: "POST", body: JSON.stringify(payload) });
    const msg = await r.text();
    const target = payload.tipo === "campeonatos" ? "feedbackCampeonato" : "feedbackPiloto";
    document.getElementById(target).textContent = msg;
    await fetchData();
    renderGestao();
}

async function salvarCampeonato() {
    const nome = document.getElementById("camp_nome").value.trim();
    if (!nome) return (document.getElementById("feedbackCampeonato").innerHTML = '<span class="error">Nome do campeonato é obrigatório.</span>');
    const payload = { tipo: "campeonatos", acao: campeonatoEditando === null ? "criar" : "editar", nome, descrição: document.getElementById("camp_descricao").value.trim(), "data de inicio": document.getElementById("camp_data_inicio").value, "data de fim": document.getElementById("camp_data_fim").value };
    if (campeonatoEditando !== null) payload.nomeAtual = DB.campeonatos[campeonatoEditando].nome;
    await enviarGestao(payload);
    await garantirPontuacaoPadrao(nome);
    campeonatoEditando = null;
}
function editarCampeonato(idx) { const c = DB.campeonatos[idx]; if (!c) return; campeonatoEditando = idx; document.getElementById("camp_nome").value = c.nome || ""; document.getElementById("camp_descricao").value = c["descrição"] || c.descrição || ""; document.getElementById("camp_data_inicio").value = formatarDataISO(c["data de inicio"] || ""); document.getElementById("camp_data_fim").value = formatarDataISO(c["data de fim"] || ""); trocarAbaGestao("campeonatos"); renderPontuacoesCampeonato(c.nome || ""); }
function excluirCampeonato(idx) { const c = DB.campeonatos[idx]; if (c && confirm(`Excluir campeonato ${c.nome}?`)) enviarGestao({ tipo: "campeonatos", acao: "excluir", nome: c.nome }); }
async function garantirPontuacaoPadrao(campeonato) {
    const existentes = (DB.pontuacoes || []).filter(p => p.campeonato === campeonato);
    if (existentes.length) return;
    for (const [posicao, pontos] of Object.entries(PONTOS_PADRAO)) await enviarGestao({ tipo: "pontuacoes", acao: "criar", campeonato, posicao: Number(posicao), pontos });
}
function renderPontuacoesCampeonato(campeonato) {
    const linhas = (DB.pontuacoes || []).filter(p => p.campeonato === campeonato).sort((a, b) => parseInt(a.posicao) - parseInt(b.posicao));
    document.getElementById("listaPontuacoes").innerHTML = linhas.map((p, idx) => `<div class='piloto-card'><span>Posição ${p.posicao} = ${p.pontos} pontos</span><span class="actions"><button class='btn-icon' title="Editar" aria-label="Editar" onclick="editarPontuacao('${campeonato}',${idx})">✏️</button><button class='btn-icon' title="Excluir" aria-label="Excluir" onclick="excluirPontuacao('${campeonato}',${idx})">🗑️</button></span></div>`).join("") || "<p class='muted'>Sem pontuação cadastrada.</p>";
}
async function adicionarPontuacaoLinha() {
    const campeonato = document.getElementById("camp_nome").value.trim();
    const posicao = parseInt(document.getElementById("pont_posicao").value);
    const pontos = parseInt(document.getElementById("pont_pontos").value);
    if (!campeonato || !posicao || Number.isNaN(pontos)) return alert("Preencha campeonato, posição e pontos.");
    const existente = (DB.pontuacoes || []).find(p => p.campeonato === campeonato && parseInt(p.posicao) === posicao);
    await enviarGestao({ tipo: "pontuacoes", acao: existente ? "editar" : "criar", campeonato, posicao, pontos });
}
async function editarPontuacao(campeonato, idx) {
    const linhas = (DB.pontuacoes || []).filter(p => p.campeonato === campeonato).sort((a, b) => parseInt(a.posicao) - parseInt(b.posicao));
    const item = linhas[idx];
    if (!item) return;
    const novo = prompt(`Pontos para posição ${item.posicao}:`, item.pontos);
    if (novo === null) return;
    await enviarGestao({ tipo: "pontuacoes", acao: "editar", campeonato, posicao: item.posicao, pontos: parseInt(novo) || 0 });
}
async function excluirPontuacao(campeonato, idx) {
    const linhas = (DB.pontuacoes || []).filter(p => p.campeonato === campeonato).sort((a, b) => parseInt(a.posicao) - parseInt(b.posicao));
    const item = linhas[idx];
    if (!item || !confirm(`Excluir pontuação da posição ${item.posicao}?`)) return;
    await enviarGestao({ tipo: "pontuacoes", acao: "excluir", campeonato, posicao: item.posicao });
}

async function salvarPiloto() {
    const nome = document.getElementById("piloto_nome").value.trim();
    const id_piloto = document.getElementById("piloto_id").value.trim();
    const campeonatos = document.getElementById("piloto_campeonatos").value.trim();
    if (!nome) return (document.getElementById("feedbackPiloto").innerHTML = '<span class="error">Nome do piloto é obrigatório.</span>');
    if (pilotoEditando === null && !id_piloto) return (document.getElementById("feedbackPiloto").innerHTML = '<span class="error">id_piloto é obrigatório para novos cadastros.</span>');
    const duplicado = DB.pilotos.some((p, idx) => idx !== pilotoEditando && String(getPilotoCampo(p, "id_piloto", "id") || "").trim() === id_piloto && id_piloto);
    if (duplicado) return (document.getElementById("feedbackPiloto").innerHTML = '<span class="error">Já existe piloto com este id_piloto.</span>');
    const payload = { tipo: "pilotos", acao: pilotoEditando === null ? "criar" : "editar", nome, id_piloto, id: id_piloto, apelido: document.getElementById("piloto_apelido").value.trim(), campeonatos, vinculos: campeonatos ? [campeonatos] : [] };
    if (pilotoEditando !== null) payload.nomeAtual = getPilotoCampo(DB.pilotos[pilotoEditando], "nome");
    await enviarGestao(payload);
    pilotoEditando = null;
}
function editarPiloto(idx) { const p = DB.pilotos[idx]; if (!p) return; pilotoEditando = idx; document.getElementById("piloto_nome").value = getPilotoCampo(p, "nome"); document.getElementById("piloto_id").value = getPilotoCampo(p, "id_piloto", "id"); document.getElementById("piloto_apelido").value = getPilotoCampo(p, "apelido"); document.getElementById("piloto_campeonatos").value = vinculosPiloto(p)[0] || ""; trocarAbaGestao("pilotos"); }
function excluirPiloto(idx) { const p = DB.pilotos[idx]; const nome = p ? getPilotoCampo(p, "nome") : ""; if (nome && confirm(`Excluir piloto ${nome}?`)) enviarGestao({ tipo: "pilotos", acao: "excluir", nome }); }

function preencher(nome, pos, campeonato = "", dataCorrida = "") { show("lançar"); const selPiloto = document.getElementById("sel_piloto"); if (!Array.from(selPiloto.options).some(opt => opt.value === nome)) { const opt = document.createElement("option"); opt.value = nome; opt.text = nome; selPiloto.add(opt); } if (campeonato) { document.getElementById("sel_camp").value = campeonato; filtrarPilotosPorCamp(); if (!Array.from(selPiloto.options).some(opt => opt.value === nome)) { const opt = document.createElement("option"); opt.value = nome; opt.text = nome; selPiloto.add(opt); } } selPiloto.value = nome; document.getElementById("res_pos").value = parseInt(pos) || ""; if (dataCorrida) document.getElementById("res_data").value = dataCorrida; document.getElementById("res_etapa").focus(); }

function carregarHistorico() { /* unchanged below */
    const lista = document.getElementById("listaHistorico"); const detalhe = document.getElementById("arquivosDoDia"); lista.innerHTML = "Carregando dias..."; detalhe.innerHTML = "";
    database.ref("backups").once("value", snapshot => { HISTORICO_CACHE = []; snapshot.forEach(child => HISTORICO_CACHE.push({ key: child.key, ...child.val() })); if (!HISTORICO_CACHE.length) { lista.innerHTML = "<p class='muted'>Nenhum arquivo encontrado.</p>"; return; }
        const grupos = {}; HISTORICO_CACHE.forEach(item => { const dia = extrairDataItem(item); if (!grupos[dia]) grupos[dia] = []; grupos[dia].push(item); });
        const dias = Object.keys(grupos).sort((a, b) => b.localeCompare(a));
        lista.innerHTML = dias.map(dia => { const itens = grupos[dia]; const camps = [...new Set(itens.map(i => i.campeonato).filter(Boolean))].join(", ") || "Sem campeonato"; return `<button class="btn-day" onclick="renderArquivosDoDia('${dia}')">📅 ${formatarDataBR(dia)}<br><small>${htmlEscape(camps)} • ${itens.length} arquivo(s)</small></button>`; }).join("");
    });
}
function renderArquivosDoDia(dia) { const detalhe = document.getElementById("arquivosDoDia"); const ordem = { volta_a_volta: 1, classificacao: 2, resultado_final: 3 }; const itens = HISTORICO_CACHE.filter(item => extrairDataItem(item) === dia).sort((a, b) => (a.campeonato || "").localeCompare(b.campeonato || "") || (ordem[a.tipoArquivo] || 9) - (ordem[b.tipoArquivo] || 9)); let html = `<h3>📅 Arquivos de ${formatarDataBR(dia)}</h3>`; itens.forEach(item => { html += `<div class="arquivo-card"><div><strong>${htmlEscape(item.tipoLabel || item.tipoArquivo || "Arquivo")}</strong><br><small>${htmlEscape(item.campeonato || "Sem campeonato")} • ${htmlEscape(item.nomeArquivo || "-")}</small></div><button class="btn-view" onclick="verConteudo('${item.key}')">VER</button></div>`; }); detalhe.innerHTML = html; }
function verConteudo(key) { database.ref("backups/" + key).once("value", s => { const item = s.val(); const win = window.open("", "_blank"); if (!item) return win.document.write("Arquivo não encontrado."); const mime = item.mimeType || ""; const dataUrl = item.dataUrl || ""; if (mime.includes("pdf") && dataUrl) return win.document.write(`<iframe src="${dataUrl}" style="width:100%;height:100vh;border:0;"></iframe>`); if (item.conteudo) return win.document.write(item.conteudo); if (dataUrl) return win.document.write(`<iframe src="${dataUrl}" style="width:100%;height:100vh;border:0;"></iframe>`); win.document.write("Não foi possível abrir o arquivo."); }); }


function obterHistoricoPiloto(nome, campeonatoFiltro = "") {
    return DB.resultados
        .filter(r => (r.piloto || r.Piloto) === nome && (!campeonatoFiltro || (r.campeonato || r.Campeonato) === campeonatoFiltro))
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
    if (!hist.length) return "<p class='muted'>Sem histórico para exibir.</p>";

    const w = 620, h = 220, ml = 36, mr = 12, mt = 16, mb = 26;
    const maxPos = Math.max(...hist.map(h => h.posicao || 1), 1);
    const stepX = (w - ml - mr) / Math.max(hist.length - 1, 1);
    const stepY = (h - mt - mb) / Math.max(maxPos - 1, 1);

    const y = (pos) => mt + ((pos - 1) * stepY);
    const x = (i) => ml + (i * stepX);

    const points = hist.map((item, i) => `${x(i)},${y(item.posicao || 1)}`).join(" ");

    let linhas = "";
    for (let p = 1; p <= maxPos; p++) {
        linhas += `<line x1="${ml}" y1="${y(p)}" x2="${w - mr}" y2="${y(p)}" stroke="#2e3542" stroke-width="1"/>`;
        linhas += `<text x="6" y="${y(p)+4}" fill="#889" font-size="10">P${p}</text>`;
    }

    const labels = hist.map((item, i) => `<text x="${x(i)}" y="${h - 8}" fill="#999" font-size="10" text-anchor="middle">${(item.data || '-').slice(5)}</text>`).join('');
    const pontos = hist.map((item, i) => `<circle cx="${x(i)}" cy="${y(item.posicao || 1)}" r="3.5" fill="#ff4b4b"/><title>${item.data} • P${item.posicao}</title>`).join('');

    return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid meet" style="display:block; width:100%; max-width:100%; height:auto; background:#141923; border-radius:8px;">${linhas}<polyline points="${points}" fill="none" stroke="#ff4b4b" stroke-width="2.5" stroke-linecap="round"/>${pontos}${labels}</svg>`;
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
            <tr><th>Data</th><th>Camp.</th><th>Etapa</th><th>Posição</th><th>Pontos</th></tr>
            ${hist.map(item => `<tr><td>${htmlEscape(item.data)}</td><td>${htmlEscape(item.campeonato)}</td><td>${htmlEscape(item.etapa)}</td><td>${item.posicao ? `P${item.posicao}` : "-"}</td><td>${item.pontos}</td></tr>`).join('')}
        </table>` : "<p class='muted'>Sem corridas registradas.</p>";

    row.innerHTML = `<td colspan="3"><div style="padding:8px 4px; max-width:100%; overflow:hidden;"><div class='hint' style='margin-bottom:6px;'>Evolução de posições por corrida (linha do tempo)</div><div style='max-width:100%; overflow-x:auto;'>${grafico}</div><div style='max-width:100%; overflow-x:auto;'>${tabela}</div></div></td>`;
    row.style.display = "table-row";
    row.dataset.open = "1";
}
function renderArquivosDoDia(dia) { const detalhe = document.getElementById("arquivosDoDia"); const ordem = { volta_a_volta: 1, classificacao: 2, resultado_final: 3 }; const itens = HISTORICO_CACHE.filter(item => extrairDataItem(item) === dia).sort((a, b) => (a.campeonato || "").localeCompare(b.campeonato || "") || (ordem[a.tipoArquivo] || 9) - (ordem[b.tipoArquivo] || 9)); let html = `<h3>📅 Arquivos de ${formatarDataBR(dia)}</h3>`; itens.forEach(item => { html += `<div class="arquivo-card"><div><strong>${htmlEscape(item.tipoLabel || item.tipoArquivo || "Arquivo")}</strong><br><small>${htmlEscape(item.campeonato || "Sem campeonato")} • ${htmlEscape(item.nomeArquivo || "-")}</small></div><button class="btn-view" onclick="verConteudo('${item.key}')">VER</button></div>`; }); detalhe.innerHTML = html; }
function verConteudo(key) { database.ref("backups/" + key).once("value", s => { const item = s.val(); const win = window.open("", "_blank"); if (!item) return win.document.write("Arquivo não encontrado."); const mime = item.mimeType || ""; const dataUrl = item.dataUrl || ""; if (mime.includes("pdf") && dataUrl) return win.document.write(`<iframe src="${dataUrl}" style="width:100%;height:100vh;border:0;"></iframe>`); if (item.conteudo) return win.document.write(item.conteudo); if (dataUrl) return win.document.write(`<iframe src="${dataUrl}" style="width:100%;height:100vh;border:0;"></iframe>`); win.document.write("Não foi possível abrir o arquivo."); }); }

function renderRanking() {
    const f = document.getElementById("filtro_rank_camp").value;
    const res = f ? DB.resultados.filter(r => (r.campeonato || r.Campeonato) === f) : DB.resultados;
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
        h += `<tr onclick="toggleHistoricoLinha('${htmlEscape(p[0])}', ${i})" style="cursor:pointer;"><td>${i + 1}º</td><td>${htmlEscape(p[0])}</td><td>${p[1]} <small style='color:#aaa; font-size:11px;'>(${perc}%)</small></td></tr>`;
        h += `<tr id="hist_row_${i}" class="hist-detalhe" data-open="0" style="display:none;"></tr>`;
    });
    document.getElementById("rankingContent").innerHTML = h + "</table>";
}

function popularFiltros() {
    const opts = DB.campeonatos.map(c => `<option value="${htmlEscape(c.nome)}">${htmlEscape(c.nome)}</option>`).join("");
    document.getElementById("filtro_rank_camp").innerHTML = '<option value="">📊 Ranking Geral</option>' + opts;
    document.getElementById("sel_camp").innerHTML = '<option value="">Selecione o Campeonato</option>' + opts;
    document.getElementById("imp_camp").innerHTML = '<option value="">Selecione o Campeonato</option>' + opts;
    document.getElementById("imp_etapa").value = "";
    document.getElementById("imp_data").value = hojeISO();
    document.getElementById("res_data").value = hojeISO();
    const pOpts = DB.pilotos.map(p => `<option value="${htmlEscape(p.nome)}">${htmlEscape(p.nome)}</option>`).sort().join("");
    document.getElementById("sel_piloto").innerHTML = '<option value="">Selecione o Piloto</option>' + pOpts;
}

function filtrarPilotosPorCamp() { const c = document.getElementById("sel_camp").value; if (!c) return; const p = DB.pilotos.filter(pil => pil.vinculos && pil.vinculos.includes(c)); document.getElementById("sel_piloto").innerHTML = '<option value="">Selecione o Piloto</option>' + p.map(pil => `<option value="${htmlEscape(pil.nome)}">${htmlEscape(pil.nome)}</option>`).join(""); }

async function salvar(tipo) { const btn = event.target; btn.innerText = "⏳ ENVIANDO..."; btn.disabled = true; let p = { tipo }; if (tipo === "resultados") { p.senha = document.getElementById("pass_res").value; p.campeonato = document.getElementById("sel_camp").value; p.piloto = document.getElementById("sel_piloto").value; p.posicao = document.getElementById("res_pos").value; p.etapa = document.getElementById("res_etapa").value; p.data = document.getElementById("res_data").value; }
    try { const r = await fetch(URL_API, { method: "POST", body: JSON.stringify(p) }); const t = await r.text(); if (t.includes("Sucesso")) { alert("✅ Corrida gravada com sucesso!"); location.reload(); } else { alert("❌ Erro: Senha incorreta ou dados faltando."); btn.disabled = false; btn.innerText = "GRAVAR NO GOOGLE SHEETS"; } } catch (e) { alert("Erro de rede"); btn.disabled = false; }
}

fetchData();
