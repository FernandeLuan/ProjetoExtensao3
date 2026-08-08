import { state, onStateChange } from "./state.js?v=4.0";
import { criarAtendimento, excluirAtendimento } from "./data/atendimentos-repository.js?v=4.0";
import { recarregarAtendimentos } from "./data/sync.js?v=4.0";
import { criarPayloadAtendimento } from "./services/atendimento-model.js?v=4.0";
import { aplicarMascaraMoedaInput, converterParaNumero, formatarValorInput } from "./utils/money.js?v=4.0";
import { mostrarErro } from "./services/feedback-service.js?v=4.0";

let inicializado = false;
let servicoSelecionado = "";
let valorTotalAutomatico = 0;
let ultimoIdRegistrado = null;
let undoInterval = null;
let undoTimeout = null;
let feedbackTemporario = false;

const atendimentoForm = document.getElementById("atendimentoForm");
const btnRegistrar = document.getElementById("btnRegistrar");
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

function getValorCustomizado() {
    return converterParaNumero(inputValorPersonalizado?.value) || 0;
}

function atualizarTextoBotao() {
    if (!btnRegistrar || feedbackTemporario) return;

    const valorFinal = checkboxValorDif?.checked
        ? getValorCustomizado()
        : valorTotalAutomatico;

    if (servicoSelecionado && valorFinal > 0) {
        btnRegistrar.textContent =
            `Registrar • R$ ${Number(valorFinal)
                .toFixed(2)
                .replace(".", ",")}`;
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
        .find((item) => item.dataset.nome === nome);
    if (!botao) return false;

    if (permitirDesmarcar && botao.classList.contains("selecionado")) {
        botao.classList.remove("selecionado");
        servicoSelecionado = "";
        valorTotalAutomatico = 0;
    } else {
        document.querySelectorAll(".btn-servico").forEach((item) => item.classList.remove("selecionado"));
        botao.classList.add("selecionado");
        servicoSelecionado = botao.dataset.nome || "";
        valorTotalAutomatico = Number(
            state.configSistema.precos?.[servicoSelecionado] ?? botao.dataset.valor ?? 0
        );
    }

    labelServicos?.classList.remove("label-erro");
    atualizarTextoBotao();
    return true;
}

function selecionarPagamento(valor, permitirDesmarcar = false) {
    const chip = Array.from(document.querySelectorAll(".chip-pagamento"))
        .find((item) => item.dataset.valor === valor);
    if (!chip) return false;

    if (permitirDesmarcar && chip.classList.contains("selecionado")) {
        chip.classList.remove("selecionado");
        if (inputPagamento) inputPagamento.value = "";
    } else {
        document.querySelectorAll(".chip-pagamento").forEach((item) => item.classList.remove("selecionado"));
        chip.classList.add("selecionado");
        if (inputPagamento) inputPagamento.value = valor;
    }

    labelPagamento?.classList.remove("label-erro");
    atualizarTextoBotao();
    return true;
}

function definirValorDiferenciado(ativo, valor = 0) {
    if (checkboxValorDif) checkboxValorDif.checked = ativo;
    if (campoValorPersonalizado) campoValorPersonalizado.style.display = ativo ? "block" : "none";
    if (inputValorPersonalizado) {
        inputValorPersonalizado.value = ativo && valor > 0 ? formatarValorInput(valor) : "";
    }
    atualizarTextoBotao();
}

function definirObservacaoAtiva(ativo, valor = "") {
    if (checkboxObservacao) checkboxObservacao.checked = ativo;
    if (campoObservacao) campoObservacao.style.display = ativo ? "block" : "none";
    if (inputObservacao) inputObservacao.value = ativo ? String(valor || "").slice(0, 160) : "";
    atualizarTextoBotao();
}

function obterPagamentoPadrao() {
    const valor = state.configSistema.pagamentoPadrao;
    return ["Pix", "Dinheiro", "Débito", "Crédito"].includes(valor) ? valor : "nenhum";
}

function aplicarPagamentoPadraoSeVazio() {
    if (inputPagamento?.value) return;
    const pagamento = obterPagamentoPadrao();
    if (pagamento !== "nenhum") selecionarPagamento(pagamento, false);
}

function limparFormularioAposRegistro() {
    atendimentoForm?.reset();
    document.querySelectorAll(".btn-servico, .chip-pagamento").forEach((item) => item.classList.remove("selecionado"));
    servicoSelecionado = "";
    valorTotalAutomatico = 0;
    if (inputPagamento) inputPagamento.value = "";
    definirValorDiferenciado(false, 0);
    definirObservacaoAtiva(false, "");
    aplicarPagamentoPadraoSeVazio();
    atualizarTextoBotao();
}

function dispararUndoInline(idDoc) {
    ultimoIdRegistrado = idDoc;
    if (undoContainer) undoContainer.style.display = "block";
    let segundosRestantes = 10;
    if (btnUndoInline) btnUndoInline.textContent = `Desfazer Registro (${segundosRestantes}s)`;

    clearInterval(undoInterval);
    clearTimeout(undoTimeout);
    undoInterval = setInterval(() => {
        segundosRestantes -= 1;
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

async function mostrarFeedbackBotao(texto, classe = "success", duracao = 1800) {
    if (!btnRegistrar) return;
    feedbackTemporario = true;
btnRegistrar.classList.remove("success", "undo-feedback");

if (classe) {
    btnRegistrar.classList.add(classe);
}    btnRegistrar.textContent = texto;
    await new Promise((resolve) => setTimeout(resolve, duracao));
    if (classe) btnRegistrar.classList.remove(classe);
    feedbackTemporario = false;
    atualizarTextoBotao();
}

async function registrarAtendimentoAtual() {
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

    let valorServicoBruto = checkboxValorDif?.checked ? getValorCustomizado() : valorTotalAutomatico;
    if (checkboxValorDif?.checked && valorServicoBruto <= 0) {
        dispararErroVisualInput(inputValorPersonalizado);
        temErro = true;
    }

    if (temErro || valorServicoBruto <= 0) return;

    const observacao = checkboxObservacao?.checked
        ? String(inputObservacao?.value || "").trim().slice(0, 160)
        : "";

    const payload = criarPayloadAtendimento({
        servico: servicoSelecionado,
        pagamento,
        valorBruto: valorServicoBruto,
        observacao,
        valorDiferenciado: Boolean(checkboxValorDif?.checked),
        dataAtendimento: new Date(),
        retroativo: false,
        horaInformada: true
    }, state.configSistema);

    if (btnRegistrar) {
        btnRegistrar.disabled = true;
        btnRegistrar.textContent = "Salvando...";
        btnRegistrar.style.opacity = "0.7";
    }

    try {
        const id = await criarAtendimento(payload);
        dispararUndoInline(id);
        limparFormularioAposRegistro();
        await recarregarAtendimentos();
        if (btnRegistrar) btnRegistrar.style.opacity = "1";
        mostrarFeedbackBotao("Registrado ✓");
    } catch (error) {
        console.error("Erro ao registrar atendimento:", error);
        mostrarErro("Não foi possível registrar o atendimento.");
        if (btnRegistrar) btnRegistrar.style.opacity = "1";
        feedbackTemporario = false;
        atualizarTextoBotao();
    } finally {
        if (btnRegistrar) btnRegistrar.disabled = false;
    }
}

export function initRegistrar() {
    if (inicializado) return;
    inicializado = true;

    document.querySelectorAll(".btn-servico").forEach((btn) => {
        btn.addEventListener("click", () => selecionarServico(btn.dataset.nome, true));
    });

    document.querySelectorAll(".chip-pagamento").forEach((chip) => {
        chip.addEventListener("click", () => selecionarPagamento(chip.dataset.valor, true));
    });

    inputValorPersonalizado?.addEventListener("input", () => {
        aplicarMascaraMoedaInput(inputValorPersonalizado);
        atualizarTextoBotao();
    });

    checkboxValorDif?.addEventListener("change", () => {
        definirValorDiferenciado(checkboxValorDif.checked, getValorCustomizado());
    });

    checkboxObservacao?.addEventListener("change", () => {
        definirObservacaoAtiva(checkboxObservacao.checked, inputObservacao?.value || "");
        if (checkboxObservacao.checked) setTimeout(() => inputObservacao?.focus(), 0);
    });


atendimentoForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    await registrarAtendimentoAtual();
});

    btnUndoInline?.addEventListener("click", async () => {
        if (!ultimoIdRegistrado) return;
        if (btnUndoInline) btnUndoInline.textContent = "Desfazendo...";
        clearInterval(undoInterval);
        clearTimeout(undoTimeout);

        try {
            await excluirAtendimento(ultimoIdRegistrado);
            await recarregarAtendimentos();
            if (undoContainer) undoContainer.style.display = "none";
            ultimoIdRegistrado = null;
            mostrarFeedbackBotao("Registro Desfeito ↩", "undo-feedback", 1800);
        } catch (error) {
            console.error("Erro ao desfazer atendimento:", error);
            mostrarErro("Não foi possível desfazer o registro.");
            if (btnUndoInline) btnUndoInline.textContent = "Erro ao desfazer";
        }
    });

    onStateChange("configSistema", () => {
        if (servicoSelecionado) {
            valorTotalAutomatico = Number(state.configSistema.precos?.[servicoSelecionado] ?? valorTotalAutomatico);
        }
        aplicarPagamentoPadraoSeVazio();
        atualizarTextoBotao();
    });

    definirValorDiferenciado(false, 0);
    definirObservacaoAtiva(false, "");
    aplicarPagamentoPadraoSeVazio();
    atualizarTextoBotao();
}
