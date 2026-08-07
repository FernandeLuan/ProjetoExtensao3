import { auth, db } from "../firebase-init.js";
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
    deleteDoc,
    doc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

import { state } from "./state.js";
import { formatarDataISO } from "./utils.js";
import { carregarConfiguracoes } from "./configuracoes.js";
import { carregarAtendimentos, atualizarHistorico } from "./historico.js";
import { atualizarCards, atualizarGrafico, processarFinanceiro } from "./financeiro.js";

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
            state.periodoSelecionado = "hoje";
            document.querySelectorAll("#painelFinanceiro .btn-filtro").forEach(btn => btn.classList.remove("active"));
            document.querySelector('#painelFinanceiro .btn-filtro[data-periodo="hoje"]')?.classList.add("active");
            atualizarCards();
            atualizarGrafico();
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
// ESTADO LOCAL DO REGISTRO
// =============================
let servicoSelecionado = "";
let valorTotalAutomatico = 0;
let ultimoIdRegistrado = null;
let undoInterval = null;
let undoTimeout = null;

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

    const finTotal = processarFinanceiro(valorServicoBruto, pagamento);
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

