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

// Carrega preferência salva ou usa a do sistema
function carregarTema() {
    const temaSalvo = localStorage.getItem("tema");

    if (temaSalvo) {
        aplicarTema(temaSalvo);
    } else {
        // Segue o tema do celular
        const prefereEscuro = window.matchMedia("(prefers-color-scheme: dark)").matches;
        aplicarTema(prefereEscuro ? "dark" : "light");
    }
}

// Quando o usuário clica no interruptor
themeToggle?.addEventListener("change", () => {
    const novoTema = themeToggle.checked ? "dark" : "light";
    localStorage.setItem("tema", novoTema);
    aplicarTema(novoTema);
});

// Inicia o tema assim que a página carrega
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
// =============================
// MÁSCARAS DE INPUT (Configurações)
// =============================

// Formata como moeda brasileira enquanto digita (ex: 110,00)
function mascaraMoeda(input) {
    input.addEventListener("input", (e) => {
        let value = e.target.value.replace(/\D/g, ""); // só números

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

// Formata porcentagem (permite 1 ou 2 casas decimais)
function mascaraPorcentagem(input) {
    input.addEventListener("input", (e) => {
        let value = e.target.value.replace(/[^\d,]/g, ""); // só números e vírgula

        // Impede mais de uma vírgula
        const parts = value.split(",");
        if (parts.length > 2) {
            value = parts[0] + "," + parts[1];
        }

        // Limita a 2 casas decimais
        if (parts[1] && parts[1].length > 2) {
            value = parts[0] + "," + parts[1].slice(0, 2);
        }

        e.target.value = value;
    });
}

// Aplica as máscaras nos campos de configuração
function aplicarMascarasConfiguracao() {
    // Campos de preço (moeda)
    const camposMoeda = [
        "cfgPrecoCombo3",
        "cfgPrecoCombo2",
        "cfgPrecoCabSob",
        "cfgPrecoCabelo",
        "cfgPrecoBarba"
    ];

    camposMoeda.forEach(id => {
        const input = document.getElementById(id);
        if (input) mascaraMoeda(input);
    });

    // Campos de taxa / porcentagem
    const camposPorcentagem = [
        "cfgTaxaDebito",
        "cfgTaxaCredito",
        "cfgRepasseDono"
    ];

    camposPorcentagem.forEach(id => {
        const input = document.getElementById(id);
        if (input) mascaraPorcentagem(input);
    });
}

// Chama a função quando a página carregar
aplicarMascarasConfiguracao();
function processarFinanceiro(valorBruto) {
    const taxaDebito = (configSistema.taxaDebito || 1.5) / 100;
    const taxaCredito = (configSistema.taxaCredito || 3.51) / 100;
    const repassePct = (configSistema.repasseDonoPct || 35) / 100;

    let liquidoConta = valorBruto;

    if (inputPagamento.value === "Débito") {
        liquidoConta -= valorBruto * taxaDebito;
    } else if (inputPagamento.value === "Crédito") {
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

// Partículas
const canvas = document.getElementById("particles");
if (canvas) {
    const ctx = canvas.getContext("2d");
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const particles = Array.from({ length: 60 }, () => ({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        r: Math.random() * 2,
        dx: (Math.random() - 0.5) * 0.5,
        dy: (Math.random() - 0.5) * 0.5
    }));

    function animate() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        particles.forEach((p) => {
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
            ctx.fillStyle = "rgba(0,240,255,0.5)";
            ctx.fill();
            p.x += p.dx;
            p.y += p.dy;
            if (p.x < 0 || p.x > canvas.width) p.dx *= -1;
            if (p.y < 0 || p.y > canvas.height) p.dy *= -1;
        });
        requestAnimationFrame(animate);
    }
    animate();

    window.addEventListener("resize", () => {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    });
}

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

sidebarMenu?.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", (e) => {
        if (link.id === "logoutBtnSide") return;
        e.preventDefault();

        const href = link.getAttribute("href");
        document.querySelectorAll("main section").forEach((s) => (s.style.display = "none"));
        const target = document.querySelector(href);
        if (target) target.style.display = "block";

        if (href === "#painelFinanceiro") {
            atualizarCards();
            if (typeof window.atualizarGrafico === "function") window.atualizarGrafico();
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
            "Cabelo + Barba + Sobrancelha": 110, "Cabelo + Barba": 105,
            "Cabelo + Sobrancelha": 75, "Cabelo": 60, "Barba": 50
        };
    }

    // Exibe os valores atuais apenas nos textos verdes
    document.getElementById("lblAtualDebito").textContent = `Atual: ${Number(configSistema.taxaDebito || 1.5).toFixed(2)}%`;
    document.getElementById("lblAtualCredito").textContent = `Atual: ${Number(configSistema.taxaCredito || 3.51).toFixed(2)}%`;
    document.getElementById("lblAtualRepasse").textContent = `Atual: ${Number(configSistema.repasseDonoPct || 35).toFixed(0)}%`;
    
    let pCombo3 = configSistema.precos["Cabelo + Barba + Sobrancelha"] || 110;
    let pCombo2 = configSistema.precos["Cabelo + Barba"] || 105;
    let pCabSob = configSistema.precos["Cabelo + Sobrancelha"] || 75;
    let pCabelo = configSistema.precos["Cabelo"] || 60;
    let pBarba = configSistema.precos["Barba"] || 50;

    document.getElementById("labelAtualCombo3").textContent = `Atual: R$ ${formatarMoeda(pCombo3)}`;
    document.getElementById("labelAtualCombo2").textContent = `Atual: R$ ${formatarMoeda(pCombo2)}`;
    document.getElementById("labelAtualCabSob").textContent = `Atual: R$ ${formatarMoeda(pCabSob)}`;
    document.getElementById("labelAtualCabelo").textContent = `Atual: R$ ${formatarMoeda(pCabelo)}`;
    document.getElementById("labelAtualBarba").textContent = `Atual: R$ ${formatarMoeda(pBarba)}`;

    // Zera os inputs para mostrar o Placeholder limpo!
    document.querySelectorAll("#formConfiguracoes input").forEach(input => input.value = "");

    // Atualiza a tela Registrar (sem mexer na estrutura dela, apenas injetando os valores formatados)
    document.querySelectorAll(".btn-servico").forEach(btn => {
        let nome = btn.getAttribute("data-nome");
        if (configSistema.precos[nome] !== undefined) {
            let novoValor = configSistema.precos[nome];
            btn.setAttribute("data-valor", novoValor);
            let spanValor = btn.querySelector(".valor-servico-btn");
            if(spanValor) spanValor.textContent = `R$ ${formatarMoeda(novoValor)}`;
        }
    });
}

// =============================
// SALVAR CONFIGURAÇÕES
// =============================
document.getElementById("formConfiguracoes")?.addEventListener("submit", async (e) => {
    e.preventDefault();

    const btn = document.getElementById("btnSalvarConfigs");
    if (!btn) return;

    // Função que só pega o valor se o usuário digitou algo
    const pegarValor = (id) => {
        const input = document.getElementById(id);
        if (!input) return null;
        const valor = input.value.trim().replace(",", ".");
        return valor !== "" ? parseFloat(valor) : null;
    };

    const novaTaxaDebito = pegarValor("cfgTaxaDebito");
    const novaTaxaCredito = pegarValor("cfgTaxaCredito");
    const novoRepasse = pegarValor("cfgRepasseDono");
    const novoCombo3 = pegarValor("cfgPrecoCombo3");
    const novoCombo2 = pegarValor("cfgPrecoCombo2");
    const novoCabSob = pegarValor("cfgPrecoCabSob");
    const novoCabelo = pegarValor("cfgPrecoCabelo");
    const novoBarba = pegarValor("cfgPrecoBarba");

    // Verifica se pelo menos um campo foi preenchido
    const temAlgumValor = [
        novaTaxaDebito, novaTaxaCredito, novoRepasse,
        novoCombo3, novoCombo2, novoCabSob, novoCabelo, novoBarba
    ].some(v => v !== null);

    if (!temAlgumValor) {
        alert("Preencha pelo menos um campo para salvar.");
        return;
    }

    // Atualiza apenas os campos que o usuário preencheu
    if (novaTaxaDebito !== null) configSistema.taxaDebito = novaTaxaDebito;
    if (novaTaxaCredito !== null) configSistema.taxaCredito = novaTaxaCredito;
    if (novoRepasse !== null) configSistema.repasseDonoPct = novoRepasse;

    if (!configSistema.precos) configSistema.precos = {};

    if (novoCombo3 !== null) configSistema.precos["Cabelo + Barba + Sobrancelha"] = novoCombo3;
    if (novoCombo2 !== null) configSistema.precos["Cabelo + Barba"] = novoCombo2;
    if (novoCabSob !== null) configSistema.precos["Cabelo + Sobrancelha"] = novoCabSob;
    if (novoCabelo !== null) configSistema.precos["Cabelo"] = novoCabelo;
    if (novoBarba !== null) configSistema.precos["Barba"] = novoBarba;

    // Feedback visual
    btn.textContent = "Salvando...";
    btn.style.opacity = "0.7";
    btn.disabled = true;

    try {
        await setDoc(doc(db, "configuracoes", "geral"), configSistema);
        aplicarConfiguracoesNaTela();

        btn.style.opacity = "1";
        btn.disabled = false;
        btn.classList.add("success");
        btn.textContent = "Salvo ✓";

        setTimeout(() => {
            btn.classList.remove("success");
            btn.textContent = "Salvar Alterações";
        }, 2000);

    } catch (error) {
        console.error(error);
        btn.style.opacity = "1";
        btn.disabled = false;
        btn.textContent = "Erro ao salvar";
        setTimeout(() => {
            btn.textContent = "Salvar Alterações";
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

document.querySelectorAll(".btn-servico").forEach((btn) => {
    btn.addEventListener("click", () => {
        document.querySelectorAll(".btn-servico").forEach((b) => b.classList.remove("selecionado"));
        btn.classList.add("selecionado");
        labelServicos?.classList.remove("label-erro");
        servicoSelecionado = btn.getAttribute("data-nome");
        valorTotalAutomatico = parseFloat(btn.getAttribute("data-valor")) || 0;
        atualizarTextoBotao();
    });
});

document.querySelectorAll(".chip-pagamento").forEach((chip) => {
    chip.addEventListener("click", () => {
        document.querySelectorAll(".chip-pagamento").forEach((c) => c.classList.remove("selecionado"));
        chip.classList.add("selecionado");
        labelPagamento?.classList.remove("label-erro");
        if (inputPagamento) inputPagamento.value = chip.getAttribute("data-valor");
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

// Undo inline
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
        document.querySelectorAll(".btn-servico, .chip-pagamento").forEach((b) =>
            b.classList.remove("selecionado")
        );
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
            <div style="text-align:center; padding: 30px; color: #a0a0a0; font-size: 0.9rem;">
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
        document.querySelectorAll(".btn-filtro").forEach((b) => b.classList.remove("active"));
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
            lucroBarbeiro += a.liquidoBarbeiro || liquido - repasse || 0;
            totalClientes++;

            if (a.servico) {
                servicoCount[a.servico] = (servicoCount[a.servico] || 0) + 1;
            }
        }
    });

    const cardFat = document.querySelector("#faturamentoHoje p");
    if (cardFat) {
        cardFat.innerHTML = `
            <div style="font-size: 0.85rem; color: #a0a0a0; margin-bottom: 2px;">Seu Lucro Limpo</div>
            <div style="font-size: 1.9rem; color: #00e676; font-weight: 700; margin-bottom: 12px; line-height: 1.1;">
                R$ ${formatarMoeda(lucroBarbeiro)}
            </div>
            <div style="display: flex; justify-content: space-between; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 10px; font-size: 0.85rem;">
                <div style="text-align: left;">
                    <span style="color: #a0a0a0; display: block; font-size: 0.7rem;">Bruto</span>
                    <span style="color: #00f0ff; font-weight: 600;">R$ ${formatarMoeda(faturamentoBruto)}</span>
                </div>
                <div style="text-align: right;">
                    <span style="color: #a0a0a0; display: block; font-size: 0.7rem;">Repasse (${configSistema.repasseDonoPct || 35}%)</span>
                    <span style="color: #ffcc00; font-weight: 600;">R$ ${formatarMoeda(totalRepasse)}</span>
                </div>
            </div>
            <div style="font-size: 0.7rem; color: white; margin-top: 10px; font-weight: 300;">
                Líquido na Conta: R$ ${formatarMoeda(faturamentoLiquido)}
            </div>
        `;
    }

    const ticketMedio = totalClientes > 0 ? faturamentoBruto / totalClientes : 0;
    const cardTicket = document.querySelector("#ticketMedio p");
    if (cardTicket) {
        cardTicket.innerHTML = `<span style="font-size: 1.1rem; font-weight: 400; color: #e0e7ff;">R$ ${formatarMoeda(ticketMedio)}</span>`;
    }

    let maisVendido = "—";
    if (Object.keys(servicoCount).length) {
        maisVendido = Object.keys(servicoCount).reduce((a, b) =>
            servicoCount[a] > servicoCount[b] ? a : b
        );
    }
    const cardMaisVendido = document.querySelector("#servicoMaisVendido p");
    if (cardMaisVendido) {
        cardMaisVendido.innerHTML = `<span style="font-size: 1.1rem; font-weight: 400; color: #e0e7ff;">${maisVendido}</span>`;
    }

    const cardCli = document.querySelector("#clientesAtendidos p");
    if (cardCli) {
        cardCli.innerHTML = `<span style="font-size: 1.1rem; font-weight: 400; color: #e0e7ff;">${totalClientes}</span>`;
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
            datasets: [
                {
                    label: "Faturamento Bruto",
                    data: dataFat,
                    backgroundColor: "rgba(0, 240, 255, 0.4)",
                    borderColor: "#00f0ff",
                    borderWidth: 1,
                    borderRadius: 4
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true,
                    grid: { color: "rgba(255,255,255,0.05)" },
                    ticks: { color: "#a0a0a0" }
                },
                x: {
                    grid: { display: false },
                    ticks: { color: "#a0a0a0" }
                }
            },
            plugins: { legend: { display: false } }
        }
    });
};

// =============================
// SALVAR CONFIGURAÇÕES (único listener)
// =============================
document.getElementById("formConfiguracoes")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = document.getElementById("btnSalvarConfigs");
    if (btn) {
        btn.textContent = "Salvando...";
        btn.style.opacity = "0.7";
    }

    configSistema.taxaDebito = parseFloat(document.getElementById("cfgTaxaDebito")?.value) || 1.5;
    configSistema.taxaCredito = parseFloat(document.getElementById("cfgTaxaCredito")?.value) || 3.51;
    configSistema.repasseDonoPct = parseFloat(document.getElementById("cfgRepasseDono")?.value) || 35;

    configSistema.precos = {
        "Cabelo + Barba + Sobrancelha": parseFloat(document.getElementById("cfgPrecoCombo3")?.value) || 110,
        "Cabelo + Barba": parseFloat(document.getElementById("cfgPrecoCombo2")?.value) || 105,
        "Cabelo + Sobrancelha": parseFloat(document.getElementById("cfgPrecoCabSob")?.value) || 75,
        "Cabelo": parseFloat(document.getElementById("cfgPrecoCabelo")?.value) || 60,
        "Barba": parseFloat(document.getElementById("cfgPrecoBarba")?.value) || 50
    };

    try {
        await setDoc(doc(db, "configuracoes", "geral"), configSistema);
        aplicarConfiguracoesNaTela();

        if (btn) {
            btn.style.opacity = "1";
            btn.classList.add("success");
            btn.textContent = "Salvo ✓";
            setTimeout(() => {
                btn.classList.remove("success");
                btn.textContent = "Salvar Alterações";
            }, 2000);
        }
    } catch (error) {
        console.error(error);
        if (btn) {
            btn.style.opacity = "1";
            btn.textContent = "Erro ao salvar";
            setTimeout(() => (btn.textContent = "Salvar Alterações"), 2000);
        }
    }
});

// =============================
// TROCA DE SENHA (único listener)
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
// GERAÇÃO DO FECHAMENTO VIA WHATSAPP
// =============================
document.getElementById("btnWhatsApp")?.addEventListener("click", async () => {
    const dataInicio = document.getElementById("dataInicioRelatorio").value;
    const dataFim = document.getElementById("dataFimRelatorio").value;

    if (!dataInicio || !dataFim) {
        alert("Por favor, selecione as datas inicial e final para gerar o fechamento.");
        return;
    }

    const btn = document.getElementById("btnWhatsApp");
    btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Calculando...`;
    btn.style.opacity = "0.7";

    try {
        const user = auth.currentUser;
        if (!user) throw new Error("Usuário não autenticado");

        // Busca os atendimentos do usuário no Firebase
        const q = query(collection(db, "atendimentos"), where("userId", "==", user.uid));
        const snapshot = await getDocs(q);

        let bruto = 0;
        let descontosTaxa = 0;
        let repasseTotal = 0;
        let qtdCortes = 0;

        // Varre os registros para fazer a matemática
        snapshot.forEach(doc => {
            const dados = doc.data();
            const dataAtendimento = dados.dataHora.split('T')[0]; // Isola apenas a data (AAAA-MM-DD)

            // Filtra os registros que caem dentro da janela de tempo escolhida
            if (dataAtendimento >= dataInicio && dataAtendimento <= dataFim) {
                const cobrado = dados.valorCobrado || 0;
                const liquidoMaquininha = dados.valorLiquidoMaquininha || cobrado; // Se for Dinheiro/Pix, é igual ao cobrado
                
                bruto += cobrado;
                descontosTaxa += (cobrado - liquidoMaquininha); // A diferença é o que a maquininha comeu
                repasseTotal += dados.valorRepasse || 0; // O que vai para o dono da barbearia
                qtdCortes++;
            }
        });

        // O que realmente sobra no seu bolso
        const liquidoBarbeiro = bruto - descontosTaxa - repasseTotal;

        // Formata as datas para o padrão Brasileiro (DD/MM/AAAA) para ficar bonito no texto
        const inicioBR = dataInicio.split('-').reverse().join('/');
        const fimBR = dataFim.split('-').reverse().join('/');

        // Monta a mensagem executiva
        const texto = `✂️ *Fechamento Marlon Barber*\n` +
                      `📅 *Período:* ${inicioBR} a ${fimBR}\n\n` +
                      `💈 *Atendimentos:* ${qtdCortes}\n` +
                      `💰 *Bruto:* R$ ${formatarMoeda(bruto)}\n` +
                      `💳 *Taxas Cartão:* - R$ ${formatarMoeda(descontosTaxa)}\n` +
                      `✂️ *Repasse:* - R$ ${formatarMoeda(repasseTotal)}\n\n` +
                      `✅ *Líquido:* *R$ ${formatarMoeda(liquidoBarbeiro)}*`;

        // Gera o link universal do WhatsApp
        const url = `https://wa.me/?text=${encodeURIComponent(texto)}`;
        
        // Abre o link em uma nova aba/janela
        window.open(url, '_blank');

        // Animação de sucesso no botão
        btn.innerHTML = `<i class="fab fa-whatsapp"></i> Fechamento Pronto ✓`;
        btn.style.opacity = "1";
        btn.classList.add("success");
        
        setTimeout(() => {
            btn.classList.remove("success");
            btn.innerHTML = `<i class="fab fa-whatsapp"></i> Enviar Fechamento`;
        }, 2500);

    } catch (error) {
        console.error("Erro ao gerar fechamento:", error);
        btn.innerHTML = `Erro ao gerar!`;
        btn.style.opacity = "1";
        setTimeout(() => {
            btn.innerHTML = `<i class="fab fa-whatsapp"></i> Enviar Fechamento`;
        }, 2000);
    }
});

// Função auxiliar para formatar a data para o padrão do calendário (AAAA-MM-DD)
function formatarDataISO(data) {
    const ano = data.getFullYear();
    const mes = String(data.getMonth() + 1).padStart(2, '0');
    const dia = String(data.getDate()).padStart(2, '0');
    return `${ano}-${mes}-${dia}`;
}

// Preencher datas rapidamente e dar o feedback visual
function setDatasRelatorio(tipo) {
    // 1. Apaga a luz (remove 'active') de todos os 3 botões
    document.querySelectorAll('#relatorios .btn-filtro').forEach(btn => {
        btn.classList.remove('active');
    });
    
    // 2. Acende a luz (adiciona 'active') só no botão que foi clicado
    if (tipo === 'hoje') document.getElementById('btnRelHoje').classList.add('active');
    if (tipo === 'semana') document.getElementById('btnRelSemana').classList.add('active');
    if (tipo === 'mes') document.getElementById('btnRelMes').classList.add('active');

    // 3. Faz a matemática das datas
    const inputInicio = document.getElementById('dataInicioRelatorio');
    const inputFim = document.getElementById('dataFimRelatorio');
    const hoje = new Date();

    if (tipo === 'hoje') {
        const dataStr = formatarDataISO(hoje);
        inputInicio.value = dataStr;
        inputFim.value = dataStr;
    } 
    else if (tipo === 'semana') {
        const diaSemana = hoje.getDay(); // 0 (Dom) a 6 (Sáb)
        const diffInicio = hoje.getDate() - diaSemana + (diaSemana === 0 ? -6 : 1); // Força começar na Segunda-feira
        
        const inicioSemana = new Date(hoje.setDate(diffInicio));
        const fimSemana = new Date(hoje.setDate(diffInicio + 6)); // Termina no Domingo
        
        inputInicio.value = formatarDataISO(inicioSemana);
        inputFim.value = formatarDataISO(fimSemana);
    } 
    else if (tipo === 'mes') {
        // Primeiro dia do mês atual
        const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
        // Último dia do mês atual
        const fimMes = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0);
        
        inputInicio.value = formatarDataISO(inicioMes);
        inputFim.value = formatarDataISO(fimMes);
    }
}

// 4. Cria os ouvintes de clique para cada botão
document.getElementById("btnRelHoje")?.addEventListener("click", () => setDatasRelatorio('hoje'));
document.getElementById("btnRelSemana")?.addEventListener("click", () => setDatasRelatorio('semana'));
document.getElementById("btnRelMes")?.addEventListener("click", () => setDatasRelatorio('mes'));