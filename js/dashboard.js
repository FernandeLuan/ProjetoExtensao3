import { auth, db } from "./firebase-init.js";
import {
    onAuthStateChanged,
    signOut,
    updatePassword,
    EmailAuthProvider,
    reauthenticateWithCredential
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
    collection,
    addDoc,
    getDocs,
    deleteDoc,
    doc,
    getDoc,
    setDoc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// =============================
// CONTROLE DE TEMA
// =============================
const themeToggle = document.getElementById("themeToggle");

function aplicarTema(tema) {
    if (tema === "dark") {
        document.documentElement.classList.add("dark");
        document.documentElement.classList.remove("light");
        if (themeToggle) themeToggle.checked = true;
    } else {
        document.documentElement.classList.add("light");
        document.documentElement.classList.remove("dark");
        if (themeToggle) themeToggle.checked = false;
    }
}

function carregarTema() {
    const temaSalvo = localStorage.getItem("tema");
    if (temaSalvo) {
        aplicarTema(temaSalvo);
    } else {
        const prefereEscuro = window.matchMedia("(prefers-color-scheme: dark)").matches;
        aplicarTema(prefereEscuro ? "dark" : "light");
    }
}

themeToggle?.addEventListener("change", () => {
    const novoTema = themeToggle.checked ? "dark" : "light";
    localStorage.setItem("tema", novoTema);
    aplicarTema(novoTema);
});

carregarTema();

// =============================
// ESTADO GLOBAL
// =============================
let atendimentos = [];
let servicoSelecionado = "";
let valorTotalAutomatico = 0;
let periodoSelecionado = "hoje";
let limiteExibicao = 10;
let ultimoIdRegistrado = null;
let undoInterval = null;
let undoTimeout = null;
let idParaExcluir = null;
let graficoInstance = null;

let configSistema = {
    taxaDebito: 1.5,
    taxaCredito: 3.51,
    repasseDonoPct: 35,
    precos: {
        "Cabelo + Barba + Sobrancelha": 110,
        "Cabelo + Barba": 105,
        "Cabelo + Sobrancelha": 75,
        "Cabelo": 60,
        "Barba": 50
    }
};

// =============================
// UTILITÁRIOS
// =============================
function formatarMoeda(valor) {
    return Number(valor || 0).toLocaleString("pt-BR", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}

function formatarDataISO(data) {
    const ano = data.getFullYear();
    const mes = String(data.getMonth() + 1).padStart(2, "0");
    const dia = String(data.getDate()).padStart(2, "0");
    return `${ano}-${mes}-${dia}`;
}

function converterParaNumero(valor) {
    if (!valor || valor.trim() === "") return null;
    const limpo = valor.toString().trim().replace(/\./g, "").replace(",", ".");
    const numero = parseFloat(limpo);
    return isNaN(numero) ? null : numero;
}

function processarFinanceiro(valorBruto) {
    const taxaDebito = (configSistema.taxaDebito || 1.5) / 100;
    const taxaCredito = (configSistema.taxaCredito || 3.51) / 100;
    const repassePct = (configSistema.repasseDonoPct || 35) / 100;

    let liquidoConta = valorBruto;

    if (inputPagamento?.value === "Débito") {
        liquidoConta -= valorBruto * taxaDebito;
    } else if (inputPagamento?.value === "Crédito") {
        liquidoConta -= valorBruto * taxaCredito;
    }

    const repasseDono = liquidoConta * repassePct;
    const liquidoBarbeiro = liquidoConta - repasseDono;

    return {
        liquidoConta: parseFloat(liquidoConta.toFixed(2)),
        repasseDono: parseFloat(repasseDono.toFixed(2)),
        liquidoBarbeiro: parseFloat(liquidoBarbeiro.toFixed(2))
    };
}

function getValorCustomizado() {
    if (!inputValorPersonalizado?.value) return 0;
    const valStr = inputValorPersonalizado.value.replace(/\./g, "").replace(",", ".");
    return parseFloat(valStr) || 0;
}

function atualizarTextoBotao() {
    if (!btnRegistrar) return;
    const valorFinal = checkboxValorDif?.checked
        ? getValorCustomizado()
        : valorTotalAutomatico;

    if (servicoSelecionado && valorFinal > 0) {
        btnRegistrar.textContent = `Registrar • R$ ${valorFinal.toFixed(2).replace(".", ",")}`;
    } else {
        btnRegistrar.textContent = "Registrar Atendimento";
    }
}

function dispararErroVisual(elemento) {
    if (!elemento) return;
    elemento.classList.add("label-erro", "shake");
    setTimeout(() => elemento.classList.remove("shake"), 500);
    setTimeout(() => elemento.classList.remove("label-erro"), 3000);
}

function dispararErroVisualInput(elemento) {
    if (!elemento) return;
    elemento.classList.add("input-erro", "shake");
    setTimeout(() => elemento.classList.remove("shake"), 500);
    setTimeout(() => elemento.classList.remove("input-erro"), 3000);
}

// =============================
// MÁSCARAS DE INPUT
// =============================
function mascaraMoeda(input) {
    input.addEventListener("input", (e) => {
        let value = e.target.value.replace(/\D/g, "");
        if (value === "") {
            e.target.value = "";
            return;
        }
        value = (parseInt(value, 10) / 100).toFixed(2);
        value = value.replace(".", ",");
        value = value.replace(/(\d)(?=(\d{3})+(?!\d))/g, "$1.");
        e.target.value = value;
    });
}

function mascaraPorcentagem(input) {
    input.addEventListener("input", (e) => {
        let value = e.target.value.replace(/[^\d,]/g, "");
        const parts = value.split(",");
        if (parts.length > 2) value = parts[0] + "," + parts[1];
        if (parts[1] && parts[1].length > 2) {
            value = parts[0] + "," + parts[1].slice(0, 2);
        }
        e.target.value = value;
    });
}

function aplicarMascarasConfiguracao() {
    ["cfgPrecoCombo3", "cfgPrecoCombo2", "cfgPrecoCabSob", "cfgPrecoCabelo", "cfgPrecoBarba"]
        .forEach(id => {
            const input = document.getElementById(id);
            if (input) mascaraMoeda(input);
        });

    ["cfgTaxaDebito", "cfgTaxaCredito", "cfgRepasseDono"]
        .forEach(id => {
            const input = document.getElementById(id);
            if (input) mascaraPorcentagem(input);
        });
}

aplicarMascarasConfiguracao();

// =============================
// AUTH & NAVEGAÇÃO
// =============================
onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.href = "login.html";
        return;
    }
    await carregarConfiguracoes();
    await carregarAtendimentos();
});

document.getElementById("logoutBtnSide")?.addEventListener("click", async (e) => {
    e.preventDefault();
    await signOut(auth);
    window.location.href = "login.html";
});

// Menu lateral
const menuToggle = document.getElementById("menuToggle");
const sidebarMenu = document.getElementById("sidebarMenu");
const sidebarOverlay = document.getElementById("sidebarOverlay");

menuToggle?.addEventListener("click", () => {
    sidebarMenu?.classList.toggle("active");
    sidebarOverlay?.classList.toggle("active");
});

sidebarOverlay?.addEventListener("click", () => {
    sidebarMenu?.classList.remove("active");
    sidebarOverlay?.classList.remove("active");
});

document.getElementById("logoHome")?.addEventListener("click", () => {
    document.querySelectorAll("main section").forEach((s) => (s.style.display = "none"));
    const registrar = document.getElementById("registrar");
    if (registrar) registrar.style.display = "block";
});

// Navegação do menu
sidebarMenu?.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", (e) => {
        if (link.id === "logoutBtnSide") return;
        e.preventDefault();

        const href = link.getAttribute("href");
        document.querySelectorAll("main section").forEach((s) => (s.style.display = "none"));
        const target = document.querySelector(href);
        if (target) target.style.display = "block";

        // Painel Financeiro → já carrega o dia
        if (href === "#painelFinanceiro") {
            periodoSelecionado = "hoje";
            document.querySelectorAll("#painelFinanceiro .btn-filtro").forEach(btn => btn.classList.remove("active"));
            document.querySelector('#painelFinanceiro .btn-filtro[data-periodo="hoje"]')?.classList.add("active");
            atualizarCards();
            if (typeof window.atualizarGrafico === "function") window.atualizarGrafico();
        }

        // Relatórios → já preenche com a data de hoje
        if (href === "#relatorios") {
            const hoje = new Date();
            const dataStr = formatarDataISO(hoje);
            const inputInicio = document.getElementById("dataInicioRelatorio");
            const inputFim = document.getElementById("dataFimRelatorio");
            if (inputInicio) inputInicio.value = dataStr;
            if (inputFim) inputFim.value = dataStr;

            document.querySelectorAll("#relatorios .btn-filtro").forEach(btn => btn.classList.remove("active"));
            document.getElementById("btnRelHoje")?.classList.add("active");
        }

        if (href === "#historico") atualizarHistorico();

        sidebarMenu.classList.remove("active");
        sidebarOverlay?.classList.remove("active");
    });
});

// =============================
// BANCO DE DADOS
// =============================
async function carregarAtendimentos() {
    try {
        const querySnapshot = await getDocs(collection(db, "atendimentos"));
        atendimentos = [];
        querySnapshot.forEach((d) => atendimentos.push({ id: d.id, ...d.data() }));
        atualizarHistorico();
        atualizarCards();
    } catch (error) {
        console.error("Erro ao carregar dados:", error);
    }
}

// =============================
// CONFIGURAÇÕES
// =============================
async function carregarConfiguracoes() {
    try {
        const docRef = doc(db, "configuracoes", "geral");
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            configSistema = { ...configSistema, ...docSnap.data() };
        } else {
            await setDoc(docRef, configSistema);
        }
        aplicarConfiguracoesNaTela();
    } catch (error) {
        console.error("Erro ao carregar configs:", error);
        aplicarConfiguracoesNaTela();
    }
}

function aplicarConfiguracoesNaTela() {
    if (!configSistema.precos) {
        configSistema.precos = {
            "Cabelo + Barba + Sobrancelha": 110,
            "Cabelo + Barba": 105,
            "Cabelo + Sobrancelha": 75,
            "Cabelo": 60,
            "Barba": 50
        };
    }

    const setText = (id, texto) => {
        const el = document.getElementById(id);
        if (el) el.textContent = texto;
    };

    setText("lblAtualDebito", `Atual: ${Number(configSistema.taxaDebito || 1.5).toFixed(2).replace(".", ",")}%`);
    setText("lblAtualCredito", `Atual: ${Number(configSistema.taxaCredito || 3.51).toFixed(2).replace(".", ",")}%`);
    setText("lblAtualRepasse", `Atual: ${Number(configSistema.repasseDonoPct || 35)}%`);

    setText("labelAtualCombo3", `Atual: R$ ${formatarMoeda(configSistema.precos["Cabelo + Barba + Sobrancelha"] || 110)}`);
    setText("labelAtualCombo2", `Atual: R$ ${formatarMoeda(configSistema.precos["Cabelo + Barba"] || 105)}`);
    setText("labelAtualCabSob", `Atual: R$ ${formatarMoeda(configSistema.precos["Cabelo + Sobrancelha"] || 75)}`);
    setText("labelAtualCabelo", `Atual: R$ ${formatarMoeda(configSistema.precos["Cabelo"] || 60)}`);
    setText("labelAtualBarba", `Atual: R$ ${formatarMoeda(configSistema.precos["Barba"] || 50)}`);

    // Atualiza botões da tela Registrar
    document.querySelectorAll(".btn-servico").forEach(btn => {
        const nome = btn.getAttribute("data-nome");
        if (configSistema.precos[nome] !== undefined) {
            const novoValor = configSistema.precos[nome];
            btn.setAttribute("data-valor", novoValor);
            const spanValor = btn.querySelector(".valor-servico-btn");
            if (spanValor) spanValor.textContent = `R$ ${formatarMoeda(novoValor)}`;
        }
    });
}

// =============================
// CONFIGURAÇÕES - EDIÇÃO INLINE + SALVAR GLOBAL
// =============================
const btnSalvarConfigs = document.getElementById("btnSalvarConfigs");
let camposAlterados = {}; // guarda o que o usuário mudou

function atualizarEstadoBotaoSalvar() {
    if (!btnSalvarConfigs) return;
    const temAlteracao = Object.keys(camposAlterados).length > 0;
    btnSalvarConfigs.disabled = !temAlteracao;
}

// Máscara de porcentagem limitada (máx 11,11)
function mascaraPorcentagemLimitada(input) {
    input.addEventListener("input", (e) => {
        let value = e.target.value.replace(/[^\d]/g, ""); // só números

        if (value === "") {
            e.target.value = "";
            return;
        }

        // Limita a 4 dígitos (ex: 1111 → 11,11)
        if (value.length > 4) value = value.slice(0, 4);

        const num = parseInt(value, 10);
        let formatted;

        if (value.length <= 2) {
            formatted = value;
        } else {
            const inteiro = value.slice(0, value.length - 2);
            const decimal = value.slice(-2);
            formatted = inteiro + "," + decimal;
        }

        // Limite máximo 11,11
        const numeroFinal = parseFloat(formatted.replace(",", "."));
        if (numeroFinal > 11.11) {
            e.target.value = "11,11";
            return;
        }

        e.target.value = formatted;
    });
}

// Máscara de moeda limitada (máx 111,11)
function mascaraMoedaLimitada(input) {
    input.addEventListener("input", (e) => {
        let value = e.target.value.replace(/\D/g, "");

        if (value === "") {
            e.target.value = "";
            return;
        }

        // Limita a 5 dígitos (11111 → 111,11)
        if (value.length > 5) value = value.slice(0, 5);

        value = (parseInt(value, 10) / 100).toFixed(2);
        value = value.replace(".", ",");

        e.target.value = value;
    });
}

// Inicializa os itens de configuração
document.querySelectorAll(".config-item").forEach(item => {
    const btnAlterar = item.querySelector(".btn-alterar");
    const input = item.querySelector(".input-config");
    const tipo = item.getAttribute("data-tipo");
    const campo = item.getAttribute("data-campo");

    if (!btnAlterar || !input) return;

    // Aplica máscara correta
    if (tipo === "moeda") {
        mascaraMoedaLimitada(input);
    } else {
        mascaraPorcentagemLimitada(input);
    }

    // Clica em Alterar → esconde botão e mostra input
    btnAlterar.addEventListener("click", () => {
        btnAlterar.classList.add("hidden");
        input.classList.remove("hidden");
        input.value = "";
        input.focus();
    });

    // Quando digita, marca como alterado
    input.addEventListener("input", () => {
        const valor = converterParaNumero(input.value);
        if (valor !== null) {
            camposAlterados[campo] = valor;
        } else {
            delete camposAlterados[campo];
        }
        atualizarEstadoBotaoSalvar();
    });
});

// Botão Salvar Alterações (global)
btnSalvarConfigs?.addEventListener("click", async () => {
    if (Object.keys(camposAlterados).length === 0) return;

    btnSalvarConfigs.textContent = "Salvando...";
    btnSalvarConfigs.disabled = true;

    // Aplica as alterações
    for (const campo in camposAlterados) {
        const valor = camposAlterados[campo];

        if (campo === "taxaDebito" || campo === "taxaCredito" || campo === "repasseDonoPct") {
            configSistema[campo] = valor;
        } else {
            if (!configSistema.precos) configSistema.precos = {};
            configSistema.precos[campo] = valor;
        }
    }

    try {
        await setDoc(doc(db, "configuracoes", "geral"), configSistema);
        aplicarConfiguracoesNaTela();

        // Limpa estado
        camposAlterados = {};
        document.querySelectorAll(".config-item").forEach(item => {
            const btn = item.querySelector(".btn-alterar");
            const input = item.querySelector(".input-config");
            if (btn) btn.classList.remove("hidden");
            if (input) {
                input.classList.add("hidden");
                input.value = "";
            }
        });

        // Animação de sucesso
        btnSalvarConfigs.classList.add("success");
        btnSalvarConfigs.textContent = "Salvo ✓";

        setTimeout(() => {
            btnSalvarConfigs.classList.remove("success");
            btnSalvarConfigs.textContent = "Salvar Alterações";
            atualizarEstadoBotaoSalvar(); // volta a ficar desabilitado
        }, 2000);

    } catch (error) {
        console.error(error);
        btnSalvarConfigs.textContent = "Erro ao salvar";
        setTimeout(() => {
            btnSalvarConfigs.textContent = "Salvar Alterações";
            atualizarEstadoBotaoSalvar();
        }, 2000);
    }
});

// =============================
// FORMULÁRIO DE REGISTRO
// =============================
const btnRegistrar = document.getElementById("btnRegistrar");
const inputValorPersonalizado = document.getElementById("valorPersonalizado");
const checkboxValorDif = document.getElementById("temValorDiferenciado");
const labelServicos = document.getElementById("labelServicos");
const labelPagamento = document.getElementById("labelPagamento");
const inputPagamento = document.getElementById("pagamento");
const campoValorPersonalizado = document.getElementById("campoValorPersonalizado");
const undoContainer = document.getElementById("undoContainer");
const btnUndoInline = document.getElementById("btnUndoInline");
const historicoContainer = document.getElementById("historicoContainer");
const btnCarregarMais = document.getElementById("btnCarregarMais");

inputValorPersonalizado?.addEventListener("input", (e) => {
    let value = e.target.value.replace(/\D/g, "");
    if (value === "") {
        e.target.value = "";
        atualizarTextoBotao();
        return;
    }
    value = (parseInt(value, 10) / 100).toFixed(2);
    value = value.replace(".", ",");
    value = value.replace(/(\d)(?=(\d{3})+(?!\d))/g, "$1.");
    e.target.value = value;
    atualizarTextoBotao();
});

// Serviços — agora desmarca se clicar de novo
document.querySelectorAll(".btn-servico").forEach((btn) => {
    btn.addEventListener("click", () => {
        if (btn.classList.contains("selecionado")) {
            btn.classList.remove("selecionado");
            servicoSelecionado = "";
            valorTotalAutomatico = 0;
        } else {
            document.querySelectorAll(".btn-servico").forEach((b) => b.classList.remove("selecionado"));
            btn.classList.add("selecionado");
            servicoSelecionado = btn.getAttribute("data-nome");
            valorTotalAutomatico = parseFloat(btn.getAttribute("data-valor")) || 0;
        }
        labelServicos?.classList.remove("label-erro");
        atualizarTextoBotao();
    });
});

// Pagamento — agora desmarca se clicar de novo
document.querySelectorAll(".chip-pagamento").forEach((chip) => {
    chip.addEventListener("click", () => {
        if (chip.classList.contains("selecionado")) {
            chip.classList.remove("selecionado");
            if (inputPagamento) inputPagamento.value = "";
        } else {
            document.querySelectorAll(".chip-pagamento").forEach((c) => c.classList.remove("selecionado"));
            chip.classList.add("selecionado");
            if (inputPagamento) inputPagamento.value = chip.getAttribute("data-valor");
        }
        labelPagamento?.classList.remove("label-erro");
    });
});

checkboxValorDif?.addEventListener("change", () => {
    if (checkboxValorDif.checked) {
        if (campoValorPersonalizado) campoValorPersonalizado.style.display = "block";
    } else {
        if (campoValorPersonalizado) campoValorPersonalizado.style.display = "none";
        if (inputValorPersonalizado) inputValorPersonalizado.value = "";
    }
    atualizarTextoBotao();
});

// Undo
function dispararUndoInline(idDoc) {
    ultimoIdRegistrado = idDoc;
    if (undoContainer) undoContainer.style.display = "block";

    let segundosRestantes = 10;
    if (btnUndoInline) btnUndoInline.textContent = `Desfazer Registro (${segundosRestantes}s)`;

    if (undoInterval) clearInterval(undoInterval);
    if (undoTimeout) clearTimeout(undoTimeout);

    undoInterval = setInterval(() => {
        segundosRestantes--;
        if (segundosRestantes > 0 && btnUndoInline) {
            btnUndoInline.textContent = `Desfazer Registro (${segundosRestantes}s)`;
        } else {
            clearInterval(undoInterval);
        }
    }, 1000);

    undoTimeout = setTimeout(() => {
        if (undoContainer) undoContainer.style.display = "none";
        ultimoIdRegistrado = null;
        clearInterval(undoInterval);
    }, 10000);
}

btnUndoInline?.addEventListener("click", async () => {
    if (!ultimoIdRegistrado) return;
    if (btnUndoInline) btnUndoInline.textContent = "Desfazendo...";
    clearInterval(undoInterval);
    clearTimeout(undoTimeout);

    try {
        await deleteDoc(doc(db, "atendimentos", ultimoIdRegistrado));
        await carregarAtendimentos();
        if (undoContainer) undoContainer.style.display = "none";
        ultimoIdRegistrado = null;

        if (btnRegistrar) {
            btnRegistrar.textContent = "Registro Desfeito ↩";
            btnRegistrar.style.background = "#ff3b3b";
            btnRegistrar.style.color = "#fff";
            setTimeout(() => {
                btnRegistrar.style.background = "";
                btnRegistrar.style.color = "";
                atualizarTextoBotao();
            }, 2000);
        }
    } catch (error) {
        if (btnUndoInline) btnUndoInline.textContent = "Erro ao desfazer";
    }
});

// Submit registro
document.getElementById("atendimentoForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    let temErro = false;

    if (!servicoSelecionado) {
        dispararErroVisual(labelServicos);
        temErro = true;
    }

    const pagamento = inputPagamento?.value;
    if (!pagamento) {
        dispararErroVisual(labelPagamento);
        temErro = true;
    }

    let valorServicoBruto = 0;
    if (checkboxValorDif?.checked) {
        valorServicoBruto = getValorCustomizado();
        if (valorServicoBruto <= 0) {
            dispararErroVisualInput(inputValorPersonalizado);
            temErro = true;
        }
    } else {
        valorServicoBruto = valorTotalAutomatico;
    }

    if (temErro || valorServicoBruto <= 0) return;

    const finTotal = processarFinanceiro(valorServicoBruto);
    const data = new Date().toISOString();

    if (btnRegistrar) {
        btnRegistrar.textContent = "Salvando...";
        btnRegistrar.style.opacity = "0.7";
    }

    try {
        const docRef = await addDoc(collection(db, "atendimentos"), {
            cliente: "Avulso",
            servico: servicoSelecionado,
            valorServicoBruto: parseFloat(valorServicoBruto.toFixed(2)),
            valorBrutoTotal: parseFloat(valorServicoBruto.toFixed(2)),
            valorLiquido: finTotal.liquidoConta,
            repasseDono: finTotal.repasseDono,
            liquidoBarbeiro: finTotal.liquidoBarbeiro,
            pagamento,
            data
        });

        dispararUndoInline(docRef.id);

        document.getElementById("atendimentoForm")?.reset();
        document.querySelectorAll(".btn-servico, .chip-pagamento").forEach((b) => b.classList.remove("selecionado"));
        servicoSelecionado = "";
        valorTotalAutomatico = 0;
        if (inputPagamento) inputPagamento.value = "";
        if (campoValorPersonalizado) campoValorPersonalizado.style.display = "none";
        if (checkboxValorDif) checkboxValorDif.checked = false;

        atualizarTextoBotao();
        await carregarAtendimentos();

        if (btnRegistrar) {
            btnRegistrar.style.opacity = "1";
            btnRegistrar.classList.add("success");
            btnRegistrar.textContent = "Registrado ✓";
            setTimeout(() => {
                btnRegistrar.classList.remove("success");
                atualizarTextoBotao();
            }, 2000);
        }
    } catch (error) {
        console.error(error);
        if (btnRegistrar) {
            btnRegistrar.style.opacity = "1";
            atualizarTextoBotao();
        }
    }
});

// =============================
// HISTÓRICO
// =============================
function atualizarHistorico() {
    if (!historicoContainer) return;
    historicoContainer.innerHTML = "";

    const hoje = new Date();
    const listaHoje = atendimentos.filter((a) => {
        const data = new Date(a.data);
        return (
            data.getDate() === hoje.getDate() &&
            data.getMonth() === hoje.getMonth() &&
            data.getFullYear() === hoje.getFullYear()
        );
    });

    if (listaHoje.length === 0) {
        historicoContainer.innerHTML = `
            <div style="text-align:center; padding: 30px; color: var(--text-secondary); font-size: 0.9rem;">
                Nenhum atendimento registrado hoje.
            </div>`;
        if (btnCarregarMais) btnCarregarMais.style.display = "none";
        return;
    }

    listaHoje.sort((a, b) => new Date(b.data) - new Date(a.data));
    const listaVisivel = listaHoje.slice(0, limiteExibicao);

    listaVisivel.forEach((a) => {
        const bruto = a.valorBrutoTotal || a.valorBruto || 0;
        const liquido = a.valorLiquido || 0;

        const card = document.createElement("div");
        card.className = "historico-card";
        card.innerHTML = `
            <div class="hist-info">
                <strong>${a.servico}</strong>
                <span>${new Date(a.data).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} • ${a.pagamento}</span>
            </div>
            <div class="hist-valor">
                <strong>R$ ${bruto.toFixed(2).replace(".", ",")}</strong>
                <small>Líq: R$ ${liquido.toFixed(2).replace(".", ",")}</small>
            </div>
            <button onclick="excluirAtendimento('${a.id}', '${a.servico}', ${bruto})" class="btn-delete-hist">
                <i class="fas fa-trash"></i>
            </button>
        `;
        historicoContainer.appendChild(card);
    });

    if (btnCarregarMais) {
        btnCarregarMais.style.display = listaHoje.length > limiteExibicao ? "block" : "none";
    }
}

btnCarregarMais?.addEventListener("click", () => {
    limiteExibicao += 10;
    atualizarHistorico();
});

// =============================
// MODAL EXCLUSÃO
// =============================
window.excluirAtendimento = function (id, servico, valor) {
    idParaExcluir = id;
    const modalDescricao = document.getElementById("modalDescricao");
    if (modalDescricao) {
        modalDescricao.innerHTML = `Excluir o atendimento de <b>${servico} (R$ ${valor.toFixed(2).replace(".", ",")})</b>?`;
    }
    document.getElementById("modalConfirm")?.classList.add("active");
};

document.getElementById("btnCancelar")?.addEventListener("click", () => {
    document.getElementById("modalConfirm")?.classList.remove("active");
    idParaExcluir = null;
});

document.getElementById("btnConfirmar")?.addEventListener("click", async () => {
    if (idParaExcluir) {
        const btn = document.getElementById("btnConfirmar");
        if (btn) btn.textContent = "Excluindo...";
        try {
            await deleteDoc(doc(db, "atendimentos", idParaExcluir));
            await carregarAtendimentos();
        } catch (error) {
            console.error(error);
        }
        if (btn) btn.textContent = "Sim, excluir";
    }
    document.getElementById("modalConfirm")?.classList.remove("active");
    idParaExcluir = null;
});

// =============================
// PAINEL FINANCEIRO
// =============================
document.querySelectorAll(".btn-filtro").forEach((btn) => {
    btn.addEventListener("click", (e) => {
        // Só afeta os filtros do painel financeiro
        if (!e.target.closest("#painelFinanceiro")) return;

        document.querySelectorAll("#painelFinanceiro .btn-filtro").forEach((b) => b.classList.remove("active"));
        e.target.classList.add("active");
        periodoSelecionado = e.target.getAttribute("data-periodo");
        atualizarCards();
    });
});

function atualizarCards() {
    let faturamentoBruto = 0;
    let faturamentoLiquido = 0;
    let totalRepasse = 0;
    let lucroBarbeiro = 0;
    let totalClientes = 0;
    const servicoCount = {};

    const hoje = new Date();
    const inicioSemana = new Date(hoje);
    inicioSemana.setDate(hoje.getDate() - hoje.getDay());
    inicioSemana.setHours(0, 0, 0, 0);

    atendimentos.forEach((a) => {
        const data = new Date(a.data);
        let dentro = false;

        if (periodoSelecionado === "hoje") {
            dentro =
                data.getDate() === hoje.getDate() &&
                data.getMonth() === hoje.getMonth() &&
                data.getFullYear() === hoje.getFullYear();
        } else if (periodoSelecionado === "semana") {
            dentro = data >= inicioSemana;
        } else if (periodoSelecionado === "mes") {
            dentro =
                data.getMonth() === hoje.getMonth() &&
                data.getFullYear() === hoje.getFullYear();
        }

        if (dentro) {
            const bruto = a.valorBrutoTotal || a.valorBruto || 0;
            const liquido = a.valorLiquido || 0;
            const repasse = a.repasseDono || 0;

            faturamentoBruto += bruto;
            faturamentoLiquido += liquido;
            totalRepasse += repasse;
            lucroBarbeiro += a.liquidoBarbeiro || (liquido - repasse) || 0;
            totalClientes++;

            if (a.servico) {
                servicoCount[a.servico] = (servicoCount[a.servico] || 0) + 1;
            }
        }
    });

    const cardFat = document.querySelector("#faturamentoHoje p");
    if (cardFat) {
        cardFat.innerHTML = `
            <div style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 2px;">Seu Lucro Limpo</div>
            <div style="font-size: 1.9rem; color: var(--success); font-weight: 700; margin-bottom: 12px; line-height: 1.1;">
                R$ ${formatarMoeda(lucroBarbeiro)}
            </div>
            <div style="display: flex; justify-content: space-between; border-top: 1px solid var(--border); padding-top: 10px; font-size: 0.85rem;">
                <div style="text-align: left;">
                    <span style="color: var(--text-secondary); display: block; font-size: 0.7rem;">Bruto</span>
                    <span style="color: var(--primary); font-weight: 600;">R$ ${formatarMoeda(faturamentoBruto)}</span>
                </div>
                <div style="text-align: right;">
                    <span style="color: var(--text-secondary); display: block; font-size: 0.7rem;">Repasse (${configSistema.repasseDonoPct || 35}%)</span>
                    <span style="color: var(--warning); font-weight: 600;">R$ ${formatarMoeda(totalRepasse)}</span>
                </div>
            </div>
            <div style="font-size: 0.7rem; color: var(--text); margin-top: 10px; font-weight: 300;">
                Líquido na Conta: R$ ${formatarMoeda(faturamentoLiquido)}
            </div>
        `;
    }

    const ticketMedio = totalClientes > 0 ? faturamentoBruto / totalClientes : 0;
    const cardTicket = document.querySelector("#ticketMedio p");
    if (cardTicket) {
        cardTicket.innerHTML = `<span style="font-size: 1.1rem; font-weight: 500; color: var(--text);">R$ ${formatarMoeda(ticketMedio)}</span>`;
    }

    let maisVendido = "—";
    if (Object.keys(servicoCount).length) {
        maisVendido = Object.keys(servicoCount).reduce((a, b) =>
            servicoCount[a] > servicoCount[b] ? a : b
        );
    }
    const cardMaisVendido = document.querySelector("#servicoMaisVendido p");
    if (cardMaisVendido) {
        cardMaisVendido.innerHTML = `<span style="font-size: 1.1rem; font-weight: 500; color: var(--text);">${maisVendido}</span>`;
    }

    const cardCli = document.querySelector("#clientesAtendidos p");
    if (cardCli) {
        cardCli.innerHTML = `<span style="font-size: 1.1rem; font-weight: 500; color: var(--text);">${totalClientes}</span>`;
    }
}

window.atualizarGrafico = function () {
    const ctx = document.getElementById("graficoFaturamento");
    if (!ctx) return;

    const labels = [];
    const dataFat = [0, 0, 0, 0, 0, 0, 0];

    for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        labels.push(
            `${("0" + d.getDate()).slice(-2)}/${("0" + (d.getMonth() + 1)).slice(-2)}`
        );
    }

    atendimentos.forEach((a) => {
        const dataAt = new Date(a.data);
        const diaHoje = new Date();
        diaHoje.setHours(0, 0, 0, 0);
        dataAt.setHours(0, 0, 0, 0);

        const diffDays = Math.floor((diaHoje.getTime() - dataAt.getTime()) / 86400000);
        if (diffDays >= 0 && diffDays <= 6) {
            dataFat[6 - diffDays] += a.valorBrutoTotal || a.valorBruto || 0;
        }
    });

    if (graficoInstance) graficoInstance.destroy();

    graficoInstance = new Chart(ctx, {
        type: "bar",
        data: {
            labels,
            datasets: [{
                label: "Faturamento Bruto",
                data: dataFat,
                backgroundColor: "rgba(37, 99, 235, 0.35)",
                borderColor: "#3B82F6",
                borderWidth: 1,
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true,
                    grid: { color: "rgba(255,255,255,0.05)" },
                    ticks: { color: "#A0A7B5" }
                },
                x: {
                    grid: { display: false },
                    ticks: { color: "#A0A7B5" }
                }
            },
            plugins: { legend: { display: false } }
        }
    });
};

// =============================
// RELATÓRIOS - BOTÕES DE PERÍODO
// =============================
function setDatasRelatorio(tipo) {
    document.querySelectorAll("#relatorios .btn-filtro").forEach(btn => btn.classList.remove("active"));

    if (tipo === "hoje") document.getElementById("btnRelHoje")?.classList.add("active");
    if (tipo === "semana") document.getElementById("btnRelSemana")?.classList.add("active");
    if (tipo === "mes") document.getElementById("btnRelMes")?.classList.add("active");

    const inputInicio = document.getElementById("dataInicioRelatorio");
    const inputFim = document.getElementById("dataFimRelatorio");
    const hoje = new Date();

    if (tipo === "hoje") {
        const dataStr = formatarDataISO(hoje);
        if (inputInicio) inputInicio.value = dataStr;
        if (inputFim) inputFim.value = dataStr;
    } else if (tipo === "semana") {
        const diaSemana = hoje.getDay();
        const diffInicio = hoje.getDate() - diaSemana + (diaSemana === 0 ? -6 : 1);
        const inicioSemana = new Date(hoje);
        inicioSemana.setDate(diffInicio);
        const fimSemana = new Date(inicioSemana);
        fimSemana.setDate(inicioSemana.getDate() + 6);

        if (inputInicio) inputInicio.value = formatarDataISO(inicioSemana);
        if (inputFim) inputFim.value = formatarDataISO(fimSemana);
    } else if (tipo === "mes") {
        const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
        const fimMes = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0);
        if (inputInicio) inputInicio.value = formatarDataISO(inicioMes);
        if (inputFim) inputFim.value = formatarDataISO(fimMes);
    }
}

document.getElementById("btnRelHoje")?.addEventListener("click", () => setDatasRelatorio("hoje"));
document.getElementById("btnRelSemana")?.addEventListener("click", () => setDatasRelatorio("semana"));
document.getElementById("btnRelMes")?.addEventListener("click", () => setDatasRelatorio("mes"));

// =============================
// TROCA DE SENHA
// =============================
document.getElementById("formAlterarSenha")?.addEventListener("submit", async (e) => {
    e.preventDefault();

    const senhaAtual = document.getElementById("senhaAtual")?.value;
    const novaSenha = document.getElementById("novaSenha")?.value;
    const confirmaSenha = document.getElementById("confirmaSenha")?.value;

    if (novaSenha !== confirmaSenha) {
        alert("A nova senha e a confirmação não batem.");
        return;
    }
    if (!novaSenha || novaSenha.length < 6) {
        alert("A senha precisa ter pelo menos 6 caracteres.");
        return;
    }

    const user = auth.currentUser;
    if (!user) return;

    const btn = document.getElementById("btnSalvarSenha");
    if (btn) {
        btn.textContent = "Atualizando...";
        btn.style.opacity = "0.7";
    }

    try {
        const credential = EmailAuthProvider.credential(user.email, senhaAtual);
        await reauthenticateWithCredential(user, credential);
        await updatePassword(user, novaSenha);

        document.getElementById("formAlterarSenha")?.reset();

        if (btn) {
            btn.style.opacity = "1";
            btn.classList.add("success");
            btn.textContent = "Atualizado ✓";
            setTimeout(() => {
                btn.classList.remove("success");
                btn.textContent = "Atualizar Senha";
            }, 2000);
        }
    } catch (error) {
        console.error(error);
        if (btn) {
            btn.style.opacity = "1";
            btn.textContent = "Atualizar Senha";
        }
        if (error.code === "auth/invalid-credential" || error.code === "auth/wrong-password") {
            alert("A senha atual digitada está incorreta.");
        } else {
            alert("Erro ao atualizar senha. Verifique os dados.");
        }
    }
});

// =============================
// CONFIGURAÇÕES - LÁPIS (EDITAR ITEM)
// =============================
document.querySelectorAll(".config-item").forEach(item => {
    const btnAlterar = item.querySelector(".btn-alterar");
    const editBox = item.querySelector(".config-edit");
    const input = item.querySelector(".input-config");
    const btnSalvar = item.querySelector(".btn-salvar-item");
    const btnCancelar = item.querySelector(".btn-cancelar-item");
    const tipo = item.getAttribute("data-tipo");
    const campo = item.getAttribute("data-campo");

    if (!btnAlterar || !editBox || !input || !btnSalvar || !btnCancelar) return;

    // Aplica máscara
    if (tipo === "moeda") {
        mascaraMoeda(input);
    } else {
        mascaraPorcentagem(input);
    }

    // Abrir edição
    btnAlterar.addEventListener("click", () => {
        // Fecha outros que estiverem abertos
        document.querySelectorAll(".config-edit").forEach(el => el.classList.add("hidden"));
        document.querySelectorAll(".btn-alterar").forEach(btn => btn.style.display = "flex");

        btnAlterar.style.display = "none";
        editBox.classList.remove("hidden");
        input.value = "";
        input.focus();
    });

    // Cancelar
    btnCancelar.addEventListener("click", () => {
        editBox.classList.add("hidden");
        btnAlterar.style.display = "flex";
        input.value = "";
    });

    // Salvar item
    btnSalvar.addEventListener("click", async () => {
        const valor = converterParaNumero(input.value);
        if (valor === null || valor < 0) {
            input.classList.add("input-erro", "shake");
            setTimeout(() => input.classList.remove("shake"), 500);
            setTimeout(() => input.classList.remove("input-erro"), 2000);
            return;
        }

        if (campo === "taxaDebito" || campo === "taxaCredito" || campo === "repasseDonoPct") {
            configSistema[campo] = valor;
        } else {
            if (!configSistema.precos) configSistema.precos = {};
            configSistema.precos[campo] = valor;
        }

        btnSalvar.textContent = "Salvando...";
        btnSalvar.disabled = true;

        try {
            await setDoc(doc(db, "configuracoes", "geral"), configSistema);
            aplicarConfiguracoesNaTela();

            editBox.classList.add("hidden");
            btnAlterar.style.display = "flex";
            input.value = "";
        } catch (error) {
            console.error(error);
            alert("Erro ao salvar. Tente novamente.");
        } finally {
            btnSalvar.textContent = "Salvar";
            btnSalvar.disabled = false;
        }
    });
});