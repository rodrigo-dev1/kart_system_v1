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

const MEUS_PILOTOS = [
    { id: "41938",  nome: "LEONARDO LEMES"    },
    { id: "231138", nome: "RODRIGO CRUZ"      },
    { id: "232869", nome: "JOÃO VICTOR"       },
    { id: "4196",   nome: "JÚLIO CEZAR"       },
    { id: "51107",  nome: "DANILO OLIVEIRA"   },
    { id: "232984", nome: "FRANCISCO CAMILLO" },
    { id: "232194", nome: "LUCAS OLIVEIRA"    }
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

function hojeISO() {
    return new Date().toISOString().slice(0, 10);
}

function formatarDataBR(dataISO) {
    if (!dataISO) return "-";

    const partes = dataISO.split("-");
    if (partes.length !== 3) return dataISO;

    return `${partes[2]}/${partes[1]}/${partes[0]}`;
}

function extrairDataItem(item) {
    if (item.dataCorrida) return item.dataCorrida;
    if (item.dataUploadISO) return item.dataUploadISO.slice(0, 10);

    const matchDataBR = String(item.dataUpload || "").match(/(\d{2})\/(\d{2})\/(\d{4})/);
    if (matchDataBR) return `${matchDataBR[3]}-${matchDataBR[2]}-${matchDataBR[1]}`;

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

async function fazerBackupEProcessar() {
    const campeonato = document.getElementById("imp_camp").value;
    const dataCorrida = document.getElementById("imp_data").value;
    const status = document.getElementById("statusImport");

    if (!campeonato) return alert("Selecione o campeonato!");
    if (!dataCorrida) return alert("Informe a data da corrida!");

    const arquivos = TIPOS_ARQUIVO.map(cfg => ({
        ...cfg,
        file: document.getElementById(cfg.inputId).files[0]
    }));

    const faltando = arquivos
        .filter(a => !a.file)
        .map(a => a.label)
        .join(", ");

    if (faltando) {
        return alert("Selecione os 3 arquivos. Faltando: " + faltando);
    }

    status.innerHTML = "⏳ Salvando os 3 arquivos...";
    document.getElementById("previewImportacao").innerHTML = "";

    for (let i = 0; i < arquivos.length; i++) {
        const item = arquivos[i];
        const file = item.file;

        const dataUrl = await arquivoParaDataUrl(file);

        const isTexto =
            file.type.includes("html") ||
            file.type.includes("text") ||
            file.name.toLowerCase().endsWith(".html") ||
            file.name.toLowerCase().endsWith(".htm");

        const conteudoRaw = isTexto ? await file.text() : "";

        const idUnico = `${dataCorrida}_${normalizarChave(campeonato)}_${item.tipo}_${Date.now()}_${i}`;

        await database.ref("backups/" + idUnico).set({
            campeonato: campeonato,
            dataCorrida: dataCorrida,
            tipoArquivo: item.tipo,
            tipoLabel: item.label,
            nomeArquivo: file.name,
            mimeType: file.type || (file.name.toLowerCase().endsWith(".pdf") ? "application/pdf" : "text/html"),
            tamanhoBytes: file.size,
            dataUpload: new Date().toLocaleString("pt-BR"),
            dataUploadISO: new Date().toISOString(),
            dataUrl: dataUrl,
            conteudo: conteudoRaw
        });

        if (item.tipo === "resultado_final" && conteudoRaw) {
            analisarHTML(conteudoRaw, campeonato, dataCorrida);
        }
    }

    status.innerHTML = "✅ Arquivos salvos no Firebase!";

    TIPOS_ARQUIVO.forEach(cfg => {
        document.getElementById(cfg.inputId).value = "";
    });
}

function analisarHTML(htmlText, campeonato = "", dataCorrida = "") {
    const doc = new DOMParser().parseFromString(htmlText, "text/html");
    const rows = doc.querySelectorAll("tr");

    let encontrados = [];

    rows.forEach(row => {
        MEUS_PILOTOS.forEach(p => {
            if (row.innerText.includes(p.id)) {
                const tds = row.querySelectorAll("td");
                const pos = tds.length ? tds[0].innerText.trim() : "";

                encontrados.push({
                    nome: p.nome,
                    pos: pos
                });
            }
        });
    });

    let h = "<h3>Pilotos Identificados no Resultado Final:</h3>";

    if (!encontrados.length) {
        h += "<p class='muted'>Nenhum piloto do campeonato foi identificado automaticamente.</p>";
    }

    encontrados.forEach(i => {
        h += `
            <div class="piloto-card">
                <span><strong>${htmlEscape(i.nome)}</strong> (P${htmlEscape(i.pos)})</span>
                <button onclick="preencher('${htmlEscape(i.nome)}','${htmlEscape(i.pos)}','${htmlEscape(campeonato)}','${htmlEscape(dataCorrida)}')" style="width:auto; padding:5px 15px; margin:0; font-size:12px;">
                    Lançar
                </button>
            </div>
        `;
    });

    document.getElementById("previewImportacao").innerHTML = h;
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

function carregarHistorico() {
    const lista = document.getElementById("listaHistorico");
    const detalhe = document.getElementById("arquivosDoDia");

    lista.innerHTML = "Carregando dias...";
    detalhe.innerHTML = "";

    database.ref("backups").once("value", snapshot => {
        HISTORICO_CACHE = [];

        snapshot.forEach(child => {
            HISTORICO_CACHE.push({
                key: child.key,
                ...child.val()
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

        let html = "";

        dias.forEach(dia => {
            const itens = grupos[dia];

            const campeonatos = [...new Set(
                itens.map(i => i.campeonato).filter(Boolean)
            )].join(", ") || "Sem campeonato";

            html += `
                <button class="btn-day" onclick="renderArquivosDoDia('${dia}')">
                    📅 ${formatarDataBR(dia)}<br>
                    <small>${htmlEscape(campeonatos)} • ${itens.length} arquivo(s)</small>
                </button>
            `;
        });

        lista.innerHTML = html;
    });
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
        html += `
            <div class="arquivo-card">
                <div>
                    <strong>${htmlEscape(item.tipoLabel || item.tipoArquivo || "Arquivo")}</strong><br>
                    <small>${htmlEscape(item.campeonato || "Sem campeonato")} • ${htmlEscape(item.nomeArquivo || "-")}</small>
                </div>
                <button class="btn-view" onclick="verConteudo('${item.key}')">VER</button>
            </div>
        `;
    });

    detalhe.innerHTML = html;
}

function verConteudo(key) {
    database.ref("backups/" + key).once("value", s => {
        const item = s.val();
        const win = window.open("", "_blank");

        if (!item) {
            win.document.write("Arquivo não encontrado.");
            return;
        }

        const mime = item.mimeType || "";
        const dataUrl = item.dataUrl || "";

        if (mime.includes("pdf") && dataUrl) {
            win.document.write(`<iframe src="${dataUrl}" style="width:100%;height:100vh;border:0;"></iframe>`);
            return;
        }

        if (item.conteudo) {
            win.document.write(item.conteudo);
            return;
        }

        if (dataUrl) {
            win.document.write(`<iframe src="${dataUrl}" style="width:100%;height:100vh;border:0;"></iframe>`);
            return;
        }

        win.document.write("Não foi possível abrir o arquivo.");
    });
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

    let h = "<table><tr><th>Pos</th><th>Piloto</th><th>Pts</th></tr>";

    sorted.forEach((p, i) => {
        h += `<tr><td>${i + 1}º</td><td>${htmlEscape(p[0])}</td><td>${p[1]}</td></tr>`;
    });

    document.getElementById("rankingContent").innerHTML = h + "</table>";
}

function popularFiltros() {
    const opts = DB.campeonatos
        .map(c => `<option value="${htmlEscape(c.nome)}">${htmlEscape(c.nome)}</option>`)
        .join("");

    document.getElementById("filtro_rank_camp").innerHTML = '<option value="">📊 Ranking Geral</option>' + opts;
    document.getElementById("sel_camp").innerHTML = '<option value="">Selecione o Campeonato</option>' + opts;
    document.getElementById("imp_camp").innerHTML = '<option value="">Selecione o Campeonato</option>' + opts;

    document.getElementById("imp_data").value = hojeISO();
    document.getElementById("res_data").value = hojeISO();

    const pOpts = DB.pilotos
        .map(p => `<option value="${htmlEscape(p.nome)}">${htmlEscape(p.nome)}</option>`)
        .sort()
        .join("");

    document.getElementById("sel_piloto").innerHTML = '<option value="">Selecione o Piloto</option>' + pOpts;
}

function filtrarPilotosPorCamp() {
    const c = document.getElementById("sel_camp").value;

    if (!c) return;

    const p = DB.pilotos.filter(pil => pil.vinculos && pil.vinculos.includes(c));

    document.getElementById("sel_piloto").innerHTML =
        '<option value="">Selecione o Piloto</option>' +
        p.map(pil => `<option value="${htmlEscape(pil.nome)}">${htmlEscape(pil.nome)}</option>`).join("");
}

async function salvar(tipo) {
    const btn = event.target;

    btn.innerText = "⏳ ENVIANDO...";
    btn.disabled = true;

    let p = { tipo: tipo };

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

fetchData();