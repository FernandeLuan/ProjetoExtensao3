import { state, onStateChange } from "./state.js?v=9.3";
import { criarAtendimento, excluirAtendimento } from "./data/atendimentos-repository.js?v=9.3";
import { invalidarCacheAtendimentos } from "./data/sync.js?v=9.3";
import { criarPayloadAtendimento } from "./services/atendimento-model.js?v=9.3";
import { obterServicos, obterServicoPorId, resolverPrecoServico, pagamentoEstaAtivo } from "./services/catalogo-service.js?v=9.3";
import { usuarioEhAdmin } from "./permissoes.js?v=9.3";
import { aplicarMascaraMoedaInput, converterParaNumero, formatarValorInput, formatarMoeda } from "./utils/money.js?v=9.3";
import { mostrarErro } from "./services/feedback-service.js?v=9.3";
import { iniciarAcaoBotao, concluirAcaoBotao, restaurarAcaoBotao } from "./services/ui-loading-service.js?v=9.3";

let inicializado = false;
let servicoSelecionadoId = "";
let valorTotalAutomatico = 0;
let profissionalSelecionado = null;
let ultimoIdRegistrado = null;
let undoInterval = null;
let undoTimeout = null;
let feedbackTemporario = false;

const atendimentoForm = document.getElementById("atendimentoForm");
const btnRegistrar = document.getElementById("btnRegistrar");
const servicosContainer = document.querySelector("#registrar .grupo-botoes-servicos");
const pagamentosContainer = document.querySelector("#registrar .grupo-chips-pagamento");
const inputValorPersonalizado = document.getElementById("valorPersonalizado");
const checkboxValorDif = document.getElementById("temValorDiferenciado");
const labelServicos = document.getElementById("labelServicos");
const labelPagamento = document.getElementById("labelPagamento");
const inputPagamento = document.getElementById("pagamento");
const campoValorPersonalizado = document.getElementById("campoValorPersonalizado");
const checkboxObservacao = document.getElementById("temObservacao");
const campoObservacao = document.getElementById("campoObservacao");
const inputObservacao = document.getElementById("observacaoAtendimento");
const labelObservacao = document.getElementById("labelObservacaoRegistrar");
const undoContainer = document.getElementById("undoContainer");
const btnUndoInline = document.getElementById("btnUndoInline");

function getValorCustomizado() {
    return converterParaNumero(inputValorPersonalizado?.value) || 0;
}

function obterMembroAtualNormalizado() {
    return {
        id: state.user?.uid,
        uid: state.user?.uid,
        nome: state.perfilUsuario?.nome || state.membroAtual?.nome || state.user?.displayName || state.user?.email || "Profissional",
        repassePct: Number(state.membroAtual?.repassePct ?? state.configSistema?.repasseDonoPct ?? 35),
        precosPersonalizados: state.membroAtual?.precosPersonalizados || {},
        ...state.membroAtual
    };
}

function resolverProfissionalSelecionado() {
    profissionalSelecionado = obterMembroAtualNormalizado();
    return profissionalSelecionado;
}

function atualizarTextoBotao() {
    if (!btnRegistrar || feedbackTemporario) return;

    const valorFinal = checkboxValorDif?.checked ? getValorCustomizado() : valorTotalAutomatico;
    btnRegistrar.textContent = servicoSelecionadoId && valorFinal > 0
        ? `Registrar • R$ ${Number(valorFinal).toFixed(2).replace(".", ",")}`
        : "Registrar atendimento";
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

function atualizarPrecoServicoSelecionado() {
    const servico = obterServicoPorId(servicoSelecionadoId);
    if (!servico) {
        valorTotalAutomatico = 0;
        atualizarTextoBotao();
        return;
    }

    const resolvido = resolverPrecoServico(servico, profissionalSelecionado || obterMembroAtualNormalizado());
    valorTotalAutomatico = resolvido.preco;

    const botao = servicosContainer?.querySelector(`[data-servico-id="${CSS.escape(servico.id)}"]`);
    const valor = botao?.querySelector(".valor-servico-btn");
    if (valor) valor.textContent = `R$ ${formatarMoeda(resolvido.preco)}`;
    atualizarTextoBotao();
}

function selecionarServico(id, permitirDesmarcar = false) {
    const botao = servicosContainer?.querySelector(`[data-servico-id="${CSS.escape(id)}"]`);
    if (!botao) return false;

    if (permitirDesmarcar && botao.classList.contains("selecionado")) {
        botao.classList.remove("selecionado");
        servicoSelecionadoId = "";
        valorTotalAutomatico = 0;
    } else {
        servicosContainer?.querySelectorAll(".btn-servico").forEach((item) => item.classList.remove("selecionado"));
        botao.classList.add("selecionado");
        servicoSelecionadoId = id;
        atualizarPrecoServicoSelecionado();
    }

    labelServicos?.classList.remove("label-erro");
    atualizarTextoBotao();
    return true;
}

function selecionarPagamento(valor, permitirDesmarcar = false) {
    const chip = pagamentosContainer?.querySelector(`[data-valor="${CSS.escape(valor)}"]`);
    if (!chip || chip.hidden) return false;

    if (permitirDesmarcar && chip.classList.contains("selecionado")) {
        chip.classList.remove("selecionado");
        if (inputPagamento) inputPagamento.value = "";
    } else {
        pagamentosContainer?.querySelectorAll(".chip-pagamento").forEach((item) => item.classList.remove("selecionado"));
        chip.classList.add("selecionado");
        if (inputPagamento) inputPagamento.value = valor;
    }

    labelPagamento?.classList.remove("label-erro");
    atualizarTextoBotao();
    return true;
}

function renderizarServicos() {
    if (!servicosContainer) return;

    const selecionadoAntes = servicoSelecionadoId;
    servicosContainer.innerHTML = "";

    obterServicos({ somenteAtivos: true }).forEach((servico, indice) => {
        const preco = resolverPrecoServico(servico, profissionalSelecionado || obterMembroAtualNormalizado()).preco;
        const botao = document.createElement("button");
        botao.type = "button";
        botao.className = `btn-servico${indice === 0 ? " full-width" : ""}`;
        botao.dataset.servicoId = servico.id;
        botao.dataset.nome = servico.nome;

        const nomeServico = document.createElement("span");
        nomeServico.textContent = servico.nome;

        const valorServico = document.createElement("span");
        valorServico.className = "valor-servico-btn";
        valorServico.textContent = `R$ ${formatarMoeda(preco)}`;

        botao.append(nomeServico, valorServico);
        servicosContainer.appendChild(botao);
    });

    if (selecionadoAntes && obterServicoPorId(selecionadoAntes)?.ativo !== false) {
        selecionarServico(selecionadoAntes, false);
    } else {
        servicoSelecionadoId = "";
        valorTotalAutomatico = 0;
        atualizarTextoBotao();
    }
}

function renderizarPagamentos() {
    pagamentosContainer?.querySelectorAll(".chip-pagamento").forEach((chip) => {
        const ativo = pagamentoEstaAtivo(chip.dataset.valor);
        chip.hidden = !ativo;
        if (!ativo && inputPagamento?.value === chip.dataset.valor) {
            chip.classList.remove("selecionado");
            inputPagamento.value = "";
        }
    });
    aplicarPagamentoPadraoSeVazio();
}

function definirValorDiferenciado(ativo, valor = 0) {
    if (checkboxValorDif) checkboxValorDif.checked = ativo;
    if (campoValorPersonalizado) campoValorPersonalizado.style.display = ativo ? "block" : "none";
    if (inputValorPersonalizado) inputValorPersonalizado.value = ativo && valor > 0 ? formatarValorInput(valor) : "";
    atualizarTextoBotao();
}

function definirObservacaoAtiva(ativo, valor = "") {
    if (checkboxObservacao) checkboxObservacao.checked = ativo;
    if (campoObservacao) campoObservacao.style.display = ativo ? "block" : "none";
    if (inputObservacao) inputObservacao.value = ativo ? String(valor || "").slice(0, 160) : "";
}

function obterPagamentoPadrao() {
    const valor = state.configSistema.pagamentoPadrao;
    return pagamentoEstaAtivo(valor) ? valor : "nenhum";
}

function aplicarPagamentoPadraoSeVazio() {
    if (inputPagamento?.value) return;
    const pagamento = obterPagamentoPadrao();
    if (pagamento !== "nenhum") selecionarPagamento(pagamento, false);
}

function limparFormularioAposRegistro() {
    atendimentoForm?.reset();
    servicosContainer?.querySelectorAll(".btn-servico").forEach((item) => item.classList.remove("selecionado"));
    pagamentosContainer?.querySelectorAll(".chip-pagamento").forEach((item) => item.classList.remove("selecionado"));
    servicoSelecionadoId = "";
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
    if (btnUndoInline) btnUndoInline.textContent = `Desfazer registro (${segundosRestantes}s)`;

    clearInterval(undoInterval);
    clearTimeout(undoTimeout);
    undoInterval = setInterval(() => {
        segundosRestantes -= 1;
        if (segundosRestantes > 0 && btnUndoInline) btnUndoInline.textContent = `Desfazer registro (${segundosRestantes}s)`;
        else clearInterval(undoInterval);
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
    if (classe) btnRegistrar.classList.add(classe);
    btnRegistrar.textContent = texto;
    await new Promise((resolve) => setTimeout(resolve, duracao));
    if (classe) btnRegistrar.classList.remove(classe);
    feedbackTemporario = false;
    atualizarTextoBotao();
}

async function registrarAtendimentoAtual() {
    let temErro = false;
    if (!servicoSelecionadoId) { dispararErroVisual(labelServicos); temErro = true; }

    const pagamento = inputPagamento?.value;
    if (!pagamento || !pagamentoEstaAtivo(pagamento)) { dispararErroVisual(labelPagamento); temErro = true; }

    const valorServicoBruto = checkboxValorDif?.checked ? getValorCustomizado() : valorTotalAutomatico;
    if (checkboxValorDif?.checked && valorServicoBruto <= 0) {
        dispararErroVisualInput(inputValorPersonalizado);
        temErro = true;
    }

    const observacaoInformada = String(inputObservacao?.value || "").trim();
    if (checkboxObservacao?.checked && !observacaoInformada) {
        dispararErroVisual(labelObservacao);
        dispararErroVisualInput(inputObservacao);
        temErro = true;
    }

    if (temErro || valorServicoBruto <= 0) return;

    resolverProfissionalSelecionado();
    const servico = obterServicoPorId(servicoSelecionadoId);
    if (!servico || !profissionalSelecionado) return;

    const preco = resolverPrecoServico(servico, profissionalSelecionado);
    const observacao = checkboxObservacao?.checked ? observacaoInformada.slice(0, 160) : "";

    const payload = criarPayloadAtendimento({
        servico: servico.nome,
        servicoId: servico.id,
        servicoNome: servico.nome,
        precoBase: preco.precoBase,
        precoProfissional: preco.precoProfissional,
        origemPreco: preco.origem,
        pagamento,
        valorBruto: valorServicoBruto,
        observacao,
        valorDiferenciado: Boolean(checkboxValorDif?.checked),
        dataAtendimento: new Date(),
        retroativo: false,
        horaInformada: true,
        profissional: profissionalSelecionado
    }, state.configSistema);

    feedbackTemporario = true;
    iniciarAcaoBotao(btnRegistrar, "Registrando...");

    try {
        const id = await criarAtendimento(payload);
        dispararUndoInline(id);
        limparFormularioAposRegistro();
        // O novo atendimento já entra no state local pelo repository.
        // Apenas invalida o cache para a próxima tela aberta buscar dados frescos.
        invalidarCacheAtendimentos();
        await concluirAcaoBotao(btnRegistrar, "Registrado ✓", 460);
    } catch (error) {
        console.error("Erro ao registrar atendimento:", error);
        mostrarErro("Não foi possível registrar o atendimento.");
        restaurarAcaoBotao(btnRegistrar);
    } finally {
        feedbackTemporario = false;
        restaurarAcaoBotao(btnRegistrar);
        atualizarTextoBotao();
    }
}

export async function initRegistrar() {
    if (inicializado) return;
    inicializado = true;

    // v8.13: delegação de eventos deixa os seletores resistentes a re-renderizações
    // e evita o cenário em que o botão recebe apenas o foco visual, mas o estado
    // interno do Registrar não é atualizado. Sempre selecionamos explicitamente;
    // clicar novamente no mesmo item mantém a seleção.
    if (servicosContainer && servicosContainer.dataset.srnkRegistrarServicosBound !== "true") {
        servicosContainer.dataset.srnkRegistrarServicosBound = "true";
        servicosContainer.addEventListener("click", (event) => {
            const botao = event.target.closest(".btn-servico");
            if (!botao || !servicosContainer.contains(botao) || botao.hidden) return;
            const servicoId = String(botao.dataset.servicoId || "").trim();
            if (servicoId) selecionarServico(servicoId, false);
        });
    }

    if (pagamentosContainer && pagamentosContainer.dataset.srnkRegistrarPagamentosBound !== "true") {
        pagamentosContainer.dataset.srnkRegistrarPagamentosBound = "true";
        pagamentosContainer.addEventListener("click", (event) => {
            const chip = event.target.closest(".chip-pagamento");
            if (!chip || !pagamentosContainer.contains(chip) || chip.hidden) return;
            const pagamento = String(chip.dataset.valor || "").trim();
            if (pagamento) selecionarPagamento(pagamento, false);
        });
    }

    inputValorPersonalizado?.addEventListener("input", () => {
        aplicarMascaraMoedaInput(inputValorPersonalizado);
        inputValorPersonalizado.classList.remove("input-erro");
        atualizarTextoBotao();
    });

    inputObservacao?.addEventListener("input", () => {
        inputObservacao.classList.remove("input-erro");
        labelObservacao?.classList.remove("label-erro");
    });

    checkboxValorDif?.addEventListener("change", () => {
        definirValorDiferenciado(checkboxValorDif.checked, getValorCustomizado());
        if (checkboxValorDif.checked) setTimeout(() => inputValorPersonalizado?.focus(), 0);
    });

    checkboxObservacao?.addEventListener("change", () => {
        definirObservacaoAtiva(checkboxObservacao.checked, inputObservacao?.value || "");
        if (checkboxObservacao.checked) setTimeout(() => inputObservacao?.focus(), 0);
    });

    if (atendimentoForm && atendimentoForm.dataset.srnkRegistrarSubmitBound !== "true") {
        atendimentoForm.dataset.srnkRegistrarSubmitBound = "true";
        atendimentoForm.addEventListener("submit", async (event) => {
            event.preventDefault();
            await registrarAtendimentoAtual();
        });
    }

    btnUndoInline?.addEventListener("click", async () => {
        if (!ultimoIdRegistrado) return;
        if (btnUndoInline) btnUndoInline.textContent = "Desfazendo...";
        clearInterval(undoInterval);
        clearTimeout(undoTimeout);

        try {
            await excluirAtendimento(ultimoIdRegistrado);
            invalidarCacheAtendimentos();
            if (undoContainer) undoContainer.style.display = "none";
            ultimoIdRegistrado = null;
            mostrarFeedbackBotao("Registro Desfeito ↩", "undo-feedback", 1800);
        } catch (error) {
            console.error("Erro ao desfazer atendimento:", error);
            mostrarErro("Não foi possível desfazer o registro.");
            if (btnUndoInline) btnUndoInline.textContent = "Erro ao desfazer";
        }
    });

    resolverProfissionalSelecionado();
    renderizarServicos();
    renderizarPagamentos();
    definirValorDiferenciado(false, 0);
    definirObservacaoAtiva(false, "");
    aplicarPagamentoPadraoSeVazio();
    atualizarTextoBotao();

    onStateChange("configSistema", () => {
        renderizarServicos();
        renderizarPagamentos();
        atualizarTextoBotao();
    });

}

// v8.16: ao entrar novamente na seção, garante os listeners e atualiza preços/configuração.
export async function abrirRegistrar() {
    if (!inicializado) {
        await initRegistrar();
        return;
    }

    resolverProfissionalSelecionado();
    renderizarServicos();
    renderizarPagamentos();
    aplicarPagamentoPadraoSeVazio();
    atualizarTextoBotao();
}
