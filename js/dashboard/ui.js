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
    doc,
    setDoc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

import { state } from "./state.js";
import { formatarDataISO } from "./utils.js";
import { carregarConfiguracoes } from "./configuracoes.js";
import {
    carregarAtendimentos,
    abrirHistoricoHoje
} from "./historico.js";
import {
    processarFinanceiro,
    abrirPainelHoje
} from "./financeiro.js";

// =============================
// CONTROLE DE TEMA
// =============================
const themeModeButtons = document.querySelectorAll("[data-theme-mode]");
const mediaTemaEscuro = window.matchMedia("(prefers-color-scheme: dark)");
let modoTemaAtual = "system";

function normalizarModoTema(valor) {
    return ["system", "light", "dark"].includes(valor)
        ? valor
        : "system";
}

function aplicarTemaVisual(modo) {
    const modoNormalizado = normalizarModoTema(modo);
    const usarEscuro = modoNormalizado === "dark" ||
        (modoNormalizado === "system" && mediaTemaEscuro.matches);

    document.documentElement.classList.toggle("dark", usarEscuro);
    document.documentElement.classList.toggle("light", !usarEscuro);

    themeModeButtons.forEach((botao) => {
        const ativo = botao.dataset.themeMode === modoNormalizado;
        botao.classList.toggle("active", ativo);
        botao.setAttribute("aria-pressed", String(ativo));
    });
}

function definirModoTema(modo, salvar = true) {
    modoTemaAtual = normalizarModoTema(modo);

    if (salvar) {
        localStorage.setItem("tema", modoTemaAtual);
    }

    aplicarTemaVisual(modoTemaAtual);
}

function carregarTema() {
    const salvo = localStorage.getItem("tema");

    // Compatibilidade com o comportamento antigo: "light" e "dark"
    // continuam sendo escolhas manuais válidas.
    definirModoTema(normalizarModoTema(salvo || "system"), false);
}

themeModeButtons.forEach((botao) => {
    botao.addEventListener("click", () => {
        definirModoTema(botao.dataset.themeMode || "system");
    });
});

mediaTemaEscuro.addEventListener?.("change", () => {
    if (modoTemaAtual === "system") {
        aplicarTemaVisual("system");
    }
});

carregarTema();

// =============================
// INDICADOR DE CONEXÃO
// =============================
const connectionStatus = document.getElementById("connectionStatus");
let connectionStatusTimer = null;

function mostrarStatusConexao(tipo, texto, temporario = false) {
    if (!connectionStatus) return;

    if (connectionStatusTimer) {
        clearTimeout(connectionStatusTimer);
        connectionStatusTimer = null;
    }

    const icone = connectionStatus.querySelector("i");
    const textoEl = connectionStatus.querySelector("span");

    connectionStatus.classList.remove("offline", "online");
    connectionStatus.classList.add(tipo);
    connectionStatus.hidden = false;

    if (icone) {
        icone.className = tipo === "offline"
            ? "fas fa-triangle-exclamation"
            : "fas fa-circle-check";
    }

    if (textoEl) textoEl.textContent = texto;

    requestAnimationFrame(() => {
        connectionStatus.classList.add("show");
    });

    if (temporario) {
        connectionStatusTimer = setTimeout(() => {
            connectionStatus.classList.remove("show");

            setTimeout(() => {
                if (!connectionStatus.classList.contains("show")) {
                    connectionStatus.hidden = true;
                }
            }, 190);
        }, 2200);
    }
}

function atualizarStatusConexaoInicial() {
    if (!navigator.onLine) {
        mostrarStatusConexao("offline", "Sem conexão com a internet");
    }
}

window.addEventListener("offline", () => {
    mostrarStatusConexao("offline", "Sem conexão com a internet");
});

window.addEventListener("online", () => {
    mostrarStatusConexao("online", "Conexão restaurada", true);
});

atualizarStatusConexaoInicial();

// =============================
// AUTH & NAVEGAÇÃO
// =============================
document.getElementById("logoutBtnSide")?.addEventListener("click", async (e) => {
    e.preventDefault();
    await signOut(auth);
    window.location.href = "login.html";
});

const menuToggle = document.getElementById("menuToggle");
const sidebarMenu = document.getElementById("sidebarMenu");
const sidebarOverlay = document.getElementById("sidebarOverlay");
const bottomNavItems = document.querySelectorAll(".bottom-nav-item[data-nav-target]");

function abrirMenu() {
    sidebarMenu?.classList.add("active");
    sidebarOverlay?.classList.add("active");
    menuToggle?.classList.add("menu-open");
    menuToggle?.setAttribute("aria-expanded", "true");
}

function fecharMenu() {
    sidebarMenu?.classList.remove("active");
    sidebarOverlay?.classList.remove("active");
    menuToggle?.classList.remove("menu-open");
    menuToggle?.setAttribute("aria-expanded", "false");
}

function atualizarNavegacaoAtiva(targetId) {
    bottomNavItems.forEach((item) => {
        const ativo = item.dataset.navTarget === targetId;
        item.classList.toggle("active", ativo);

        if (ativo) {
            item.setAttribute("aria-current", "page");
        } else {
            item.removeAttribute("aria-current");
        }
    });

    const telaDoMenu = targetId === "configuracoes" || targetId === "conta";
    menuToggle?.classList.toggle("active", telaDoMenu);
}

function animarEntradaSecao(section) {
    section.classList.remove("section-enter");
    void section.offsetWidth;
    section.classList.add("section-enter");

    setTimeout(() => {
        section.classList.remove("section-enter");
    }, 220);
}

function exibirSecao(href) {
    if (!href?.startsWith("#")) return;

    const target = document.querySelector(href);
    if (!target) return;

    document.querySelectorAll("main section").forEach((section) => {
        section.style.display = "none";
    });

    target.style.display = "block";
    animarEntradaSecao(target);

    const targetId = href.slice(1);
    atualizarNavegacaoAtiva(targetId);

    if (href === "#painelFinanceiro") {
        abrirPainelHoje();
    }

    if (href === "#relatorios") {
        const hoje = new Date();
        const dataStr = formatarDataISO(hoje);
        const inputInicio = document.getElementById("dataInicioRelatorio");
        const inputFim = document.getElementById("dataFimRelatorio");

        if (inputInicio) inputInicio.value = dataStr;
        if (inputFim) inputFim.value = dataStr;

        document.querySelectorAll("#relatorios .btn-filtro").forEach((btn) => {
            btn.classList.remove("active");
        });
        document.getElementById("btnRelHoje")?.classList.add("active");
    }

    if (href === "#historico") {
        abrirHistoricoHoje();
    }

    if (href === "#registrar") {
        atualizarBotaoRepetirUltimo();
        aplicarPagamentoPadraoSeVazio();
    }

    if (href === "#configuracoes") {
        atualizarPagamentoPadraoConfig();
    }

    fecharMenu();
    window.scrollTo({ top: 0, behavior: "auto" });
}

menuToggle?.addEventListener("click", () => {
    if (sidebarMenu?.classList.contains("active")) {
        fecharMenu();
    } else {
        abrirMenu();
    }
});

sidebarOverlay?.addEventListener("click", fecharMenu);

document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") fecharMenu();
});

bottomNavItems.forEach((item) => {
    item.addEventListener("click", (e) => {
        e.preventDefault();
        exibirSecao(item.getAttribute("href"));
    });
});

sidebarMenu?.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", (e) => {
        if (link.id === "logoutBtnSide") return;

        e.preventDefault();
        exibirSecao(link.getAttribute("href"));
    });
});

// =============================
// CONFIGURAÇÕES EM GRUPOS
// =============================
const configGroupToggles = document.querySelectorAll(".config-group-toggle");

function fecharOutrosGruposConfig(excecao) {
    configGroupToggles.forEach((botao) => {
        if (botao === excecao) return;

        botao.setAttribute("aria-expanded", "false");
        const id = botao.getAttribute("aria-controls");
        const conteudo = id ? document.getElementById(id) : null;
        if (conteudo) conteudo.hidden = true;
    });
}

configGroupToggles.forEach((botao) => {
    botao.addEventListener("click", () => {
        const id = botao.getAttribute("aria-controls");
        const conteudo = id ? document.getElementById(id) : null;
        if (!conteudo) return;

        const vaiAbrir = botao.getAttribute("aria-expanded") !== "true";

        if (vaiAbrir) fecharOutrosGruposConfig(botao);

        botao.setAttribute("aria-expanded", String(vaiAbrir));
        conteudo.hidden = !vaiAbrir;
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
let timerViradaDoDia = null;

// =============================
// FORMULÁRIO DE REGISTRO
// =============================
const atendimentoForm = document.getElementById("atendimentoForm");
const btnRegistrar = document.getElementById("btnRegistrar");
const btnRepetirUltimo = document.getElementById("btnRepetirUltimo");
const inputValorPersonalizado = document.getElementById("valorPersonalizado");
const checkboxValorDif = document.getElementById("temValorDiferenciado");
const labelServicos = document.getElementById("labelServicos");
const labelPagamento = document.getElementById("labelPagamento");
const inputPagamento = document.getElementById("pagamento");
const campoValorPersonalizado = document.getElementById("campoValorPersonalizado");
const checkboxObservacao = document.getElementById("temObservacao");
const campoObservacao = document.getElementById("campoObservacao");
const inputObservacao = document.getElementById("observacaoAtendimento");
const undoContainer = document.getElementById("undoContainer");
const btnUndoInline = document.getElementById("btnUndoInline");

function chaveDataLocal(data) {
    const valor = data instanceof Date ? data : new Date(data);
    if (Number.isNaN(valor.getTime())) return "";

    const ano = valor.getFullYear();
    const mes = String(valor.getMonth() + 1).padStart(2, "0");
    const dia = String(valor.getDate()).padStart(2, "0");
    return `${ano}-${mes}-${dia}`;
}

function formatarValorInput(valor) {
    return Number(valor || 0)
        .toFixed(2)
        .replace(".", ",")
        .replace(/\B(?=(\d{3})+(?!\d))/g, ".");
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

function selecionarServico(nome, permitirDesmarcar = false) {
    const botao = Array.from(document.querySelectorAll(".btn-servico"))
        .find((item) => item.getAttribute("data-nome") === nome);

    if (!botao) return false;

    if (permitirDesmarcar && botao.classList.contains("selecionado")) {
        botao.classList.remove("selecionado");
        servicoSelecionado = "";
        valorTotalAutomatico = 0;
    } else {
        document.querySelectorAll(".btn-servico").forEach((item) => {
            item.classList.remove("selecionado");
        });

        botao.classList.add("selecionado");
        servicoSelecionado = botao.getAttribute("data-nome") || "";
        valorTotalAutomatico = Number(
            state.configSistema.precos?.[servicoSelecionado] ??
            botao.getAttribute("data-valor") ??
            0
        );
    }

    labelServicos?.classList.remove("label-erro");
    atualizarTextoBotao();
    return true;
}

function selecionarPagamento(valor, permitirDesmarcar = false) {
    const chip = Array.from(document.querySelectorAll(".chip-pagamento"))
        .find((item) => item.getAttribute("data-valor") === valor);

    if (!chip) return false;

    if (permitirDesmarcar && chip.classList.contains("selecionado")) {
        chip.classList.remove("selecionado");
        if (inputPagamento) inputPagamento.value = "";
    } else {
        document.querySelectorAll(".chip-pagamento").forEach((item) => {
            item.classList.remove("selecionado");
        });

        chip.classList.add("selecionado");
        if (inputPagamento) inputPagamento.value = valor;
    }

    labelPagamento?.classList.remove("label-erro");
    return true;
}

function definirValorDiferenciado(ativo, valor = 0) {
    if (checkboxValorDif) checkboxValorDif.checked = ativo;

    if (campoValorPersonalizado) {
        campoValorPersonalizado.style.display = ativo ? "block" : "none";
    }

    if (inputValorPersonalizado) {
        inputValorPersonalizado.value = ativo && valor > 0
            ? formatarValorInput(valor)
            : "";
    }

    atualizarTextoBotao();
}

function definirObservacaoAtiva(ativo, valor = "") {
    if (checkboxObservacao) checkboxObservacao.checked = ativo;

    if (campoObservacao) {
        campoObservacao.style.display = ativo ? "block" : "none";
    }

    if (inputObservacao) {
        inputObservacao.value = ativo ? String(valor || "").slice(0, 160) : "";
    }
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

document.querySelectorAll(".btn-servico").forEach((btn) => {
    btn.addEventListener("click", () => {
        selecionarServico(btn.getAttribute("data-nome"), true);
    });
});

document.querySelectorAll(".chip-pagamento").forEach((chip) => {
    chip.addEventListener("click", () => {
        selecionarPagamento(chip.getAttribute("data-valor"), true);
    });
});

checkboxValorDif?.addEventListener("change", () => {
    definirValorDiferenciado(checkboxValorDif.checked, getValorCustomizado());
});

checkboxObservacao?.addEventListener("change", () => {
    definirObservacaoAtiva(checkboxObservacao.checked, inputObservacao?.value || "");

    if (checkboxObservacao.checked) {
        setTimeout(() => inputObservacao?.focus(), 0);
    }
});

// =============================
// PAGAMENTO PADRÃO
// =============================
const pagamentoPadraoButtons = document.querySelectorAll("[data-pagamento-padrao]");
const pagamentoPadraoStatus = document.getElementById("pagamentoPadraoStatus");

function obterPagamentoPadrao() {
    const valor = state.configSistema.pagamentoPadrao;
    const validos = ["Pix", "Dinheiro", "Débito", "Crédito"];
    return validos.includes(valor) ? valor : "nenhum";
}

function atualizarPagamentoPadraoConfig() {
    const atual = obterPagamentoPadrao();

    pagamentoPadraoButtons.forEach((botao) => {
        const ativo = botao.dataset.pagamentoPadrao === atual;
        botao.classList.toggle("active", ativo);
        botao.setAttribute("aria-pressed", String(ativo));
    });
}

function aplicarPagamentoPadraoSeVazio() {
    if (inputPagamento?.value) return;

    const pagamento = obterPagamentoPadrao();
    if (pagamento === "nenhum") return;

    selecionarPagamento(pagamento, false);
}

pagamentoPadraoButtons.forEach((botao) => {
    botao.addEventListener("click", async () => {
        const valor = botao.dataset.pagamentoPadrao || "nenhum";

        pagamentoPadraoButtons.forEach((item) => {
            item.disabled = true;
        });

        if (pagamentoPadraoStatus) {
            pagamentoPadraoStatus.textContent = "Salvando...";
        }

        try {
            await setDoc(
                doc(db, "configuracoes", "geral"),
                { pagamentoPadrao: valor },
                { merge: true }
            );

            state.configSistema.pagamentoPadrao = valor;
            atualizarPagamentoPadraoConfig();

            if (pagamentoPadraoStatus) {
                pagamentoPadraoStatus.textContent = "Padrão salvo ✓";
                setTimeout(() => {
                    if (pagamentoPadraoStatus.textContent === "Padrão salvo ✓") {
                        pagamentoPadraoStatus.textContent = "";
                    }
                }, 2200);
            }
        } catch (error) {
            console.error("Erro ao salvar pagamento padrão:", error);
            if (pagamentoPadraoStatus) {
                pagamentoPadraoStatus.textContent = "Não foi possível salvar.";
            }
        } finally {
            pagamentoPadraoButtons.forEach((item) => {
                item.disabled = false;
            });
        }
    });
});

// =============================
// REPETIR ÚLTIMO ATENDIMENTO DO DIA
// =============================
function obterUltimoAtendimentoDeHoje() {
    const hoje = chaveDataLocal(new Date());

    return state.atendimentos
        .filter((atendimento) => {
            if (!atendimento?.data) return false;
            return chaveDataLocal(atendimento.data) === hoje;
        })
        .sort((a, b) => new Date(b.data) - new Date(a.data))[0] || null;
}

function atualizarBotaoRepetirUltimo() {
    if (!btnRepetirUltimo) return;

    const ultimo = obterUltimoAtendimentoDeHoje();
    btnRepetirUltimo.hidden = !ultimo;
    btnRepetirUltimo.disabled = !ultimo;
}

function agendarAtualizacaoNaViradaDoDia() {
    if (timerViradaDoDia) clearTimeout(timerViradaDoDia);

    const agora = new Date();
    const proximaVirada = new Date(agora);
    proximaVirada.setHours(24, 0, 1, 0);

    const espera = Math.max(1000, proximaVirada.getTime() - agora.getTime());

    timerViradaDoDia = setTimeout(() => {
        atualizarBotaoRepetirUltimo();
        agendarAtualizacaoNaViradaDoDia();
    }, espera);
}

btnRepetirUltimo?.addEventListener("click", () => {
    const ultimo = obterUltimoAtendimentoDeHoje();
    if (!ultimo) {
        atualizarBotaoRepetirUltimo();
        return;
    }

    const servico = ultimo.servico || "";
    const pagamento = ultimo.pagamento || "";
    const valorUltimo = Number(
        ultimo.valorBrutoTotal ??
        ultimo.valorBruto ??
        ultimo.valorServicoBruto ??
        0
    );

    selecionarServico(servico, false);
    selecionarPagamento(pagamento, false);

    const botaoServicoAtual = Array.from(document.querySelectorAll(".btn-servico"))
        .find((item) => item.getAttribute("data-nome") === servico);

    const precoAtual = Number(
        state.configSistema.precos?.[servico] ??
        botaoServicoAtual?.getAttribute("data-valor") ??
        0
    );

    const valorFoiDiferenciado = ultimo.valorDiferenciado === true ||
        (valorUltimo > 0 && precoAtual > 0 && Math.abs(valorUltimo - precoAtual) > 0.009);

    definirValorDiferenciado(valorFoiDiferenciado, valorUltimo);

    // Observações são específicas daquele atendimento e nunca são repetidas.
    definirObservacaoAtiva(false, "");

    atualizarTextoBotao();
});

agendarAtualizacaoNaViradaDoDia();

// =============================
// RESET DO FORMULÁRIO
// =============================
function limparFormularioAposRegistro() {
    atendimentoForm?.reset();

    document.querySelectorAll(".btn-servico, .chip-pagamento").forEach((item) => {
        item.classList.remove("selecionado");
    });

    servicoSelecionado = "";
    valorTotalAutomatico = 0;

    if (inputPagamento) inputPagamento.value = "";

    definirValorDiferenciado(false, 0);
    definirObservacaoAtiva(false, "");
    aplicarPagamentoPadraoSeVazio();
    atualizarTextoBotao();
}

// =============================
// UNDO
// =============================
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
        atualizarBotaoRepetirUltimo();

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
        console.error(error);
        if (btnUndoInline) btnUndoInline.textContent = "Erro ao desfazer";
    }
});

// =============================
// SUBMIT REGISTRO
// =============================
atendimentoForm?.addEventListener("submit", async (e) => {
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

    const observacao = checkboxObservacao?.checked
        ? String(inputObservacao?.value || "").trim().slice(0, 160)
        : "";

    const finTotal = processarFinanceiro(valorServicoBruto, pagamento);
    const data = new Date().toISOString();

    if (btnRegistrar) {
        btnRegistrar.disabled = true;
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
            data,
            valorDiferenciado: Boolean(checkboxValorDif?.checked),
            observacao,
            editado: false
        });

        dispararUndoInline(docRef.id);
        limparFormularioAposRegistro();

        await carregarAtendimentos();
        atualizarBotaoRepetirUltimo();

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
    } finally {
        if (btnRegistrar) btnRegistrar.disabled = false;
    }
});

// =============================
// AUTH / CARGA INICIAL
// =============================
onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.href = "login.html";
        return;
    }

    await carregarConfiguracoes();
    atualizarPagamentoPadraoConfig();
    aplicarPagamentoPadraoSeVazio();

    await carregarAtendimentos();
    atualizarBotaoRepetirUltimo();
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
