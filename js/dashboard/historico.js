import { state, onStateChange } from "./state.js?v=6.1";
import { excluirAtendimento, editarAtendimento } from "./data/atendimentos-repository.js?v=6.1";
import { recarregarAtendimentosDoDia, invalidarCacheAtendimentos } from "./data/sync.js?v=6.1";
import { criarAtualizacaoFinanceiraAtendimento } from "./services/atendimento-model.js?v=6.1";
import { obterServicoPorId, obterServicoPorNome, obterServicos, resolverPrecoServico, pagamentoEstaAtivo } from "./services/catalogo-service.js?v=6.1";
import { usuarioEhAdmin } from "./permissoes.js?v=6.1";
import { inicioDoDia, somarDias, chaveData, mesmoDia, formatarTituloData, dataDeInput, obterDataAtendimento, formatarDataHora } from "./utils/date.js?v=6.1";
import { formatarMoeda, converterParaNumero, aplicarMascaraMoedaInput } from "./utils/money.js?v=6.1";
import { escaparHtml, abrirSeletorData } from "./utils/dom.js?v=6.1";
import { mostrarErro } from "./services/feedback-service.js?v=6.1";

// =============================
// ELEMENTOS
// =============================
const historicoContainer = document.getElementById("historicoContainer");
const btnHistoricoAnterior = document.getElementById("btnHistoricoAnterior");
const btnHistoricoProxima = document.getElementById("btnHistoricoProxima");
const labelDataHistorico = document.getElementById("labelDataHistorico");
const btnCalendarioHistorico = document.getElementById("btnCalendarioHistorico");
const inputDataHistorico = document.getElementById("inputDataHistorico");

const botoesFiltroPagamento = document.querySelectorAll("[data-historico-pagamento]");
const btnAbrirFiltrosHistorico = document.getElementById("btnAbrirFiltrosHistorico");
const historicoFiltroBadge = document.getElementById("historicoFiltroBadge");
const modalFiltrosHistorico = document.getElementById("modalFiltrosHistorico");
const btnFecharFiltrosHistorico = document.getElementById("btnFecharFiltrosHistorico");
const btnLimparFiltrosHistorico = document.getElementById("btnLimparFiltrosHistorico");
const btnAplicarFiltrosHistorico = document.getElementById("btnAplicarFiltrosHistorico");
const botoesFiltroServico = document.querySelectorAll("[data-historico-servico]");
const filtroHistoricoEditados = document.getElementById("filtroHistoricoEditados");
const filtroHistoricoAjustados = document.getElementById("filtroHistoricoAjustados");

const historicoDetalheOverlay = document.getElementById("historicoDetalheOverlay");
const historicoDetalheConteudo = document.getElementById("historicoDetalheConteudo");
const btnFecharDetalheHistorico = document.getElementById("btnFecharDetalheHistorico");

const modalConfirm = document.getElementById("modalConfirm");
const modalDescricao = document.getElementById("modalDescricao");
const btnConfirmar = document.getElementById("btnConfirmar");

const modalEditarHistorico = document.getElementById("modalEditarHistorico");
const btnFecharEdicaoHistorico = document.getElementById("btnFecharEdicaoHistorico");
const btnCancelarEdicaoHistorico = document.getElementById("btnCancelarEdicaoHistorico");
const btnSalvarEdicaoHistorico = document.getElementById("btnSalvarEdicaoHistorico");
const editServicoHistorico = document.getElementById("editServicoHistorico");
const editValorHistorico = document.getElementById("editValorHistorico");
const editPagamentoHistorico = document.getElementById("editPagamentoHistorico");
const editObservacaoHistorico = document.getElementById("editObservacaoHistorico");


// =============================
// ESTADO DO HISTÓRICO
// =============================
let dataHistoricoSelecionada = inicioDoDia(new Date());
let filtroPagamentoHistorico = "todos";
let filtroServicoHistorico = "todos";
let filtroSomenteEditados = false;
let filtroSomenteAjustados = false;

let filtroRascunhoServico = "todos";
let filtroRascunhoEditados = false;
let filtroRascunhoAjustados = false;

let idParaExcluir = null;
let atendimentoEmEdicao = null;
let atendimentoDetalheAtual = null;


// =============================
// UTILITÁRIOS DO HISTÓRICO
// =============================
function normalizarPagamento(pagamento) {
    return String(pagamento || "").trim().toLowerCase();
}

function obterBruto(atendimento) {
    return Number(atendimento.valorBrutoTotal ?? atendimento.valorBruto ?? atendimento.valorServicoBruto ?? 0);
}

function atendimentoTemValorAjustado(atendimento, bruto = obterBruto(atendimento)) {
    if (atendimento.valorDiferenciado === true) return true;
    if (atendimento.valorDiferenciado === false) return false;
    const precoEsperado = Number(atendimento.precoProfissional ?? atendimento.precoBase ?? state.configSistema.precos?.[atendimento.servico]);
    return Number.isFinite(precoEsperado) && precoEsperado > 0
        ? Math.abs(Number(bruto) - precoEsperado) > 0.009
        : false;
}

function obterRotuloHora(atendimento) {
    if (atendimento.retroativo === true && atendimento.horaInformada === false) return "Retroativo";
    const data = obterDataAtendimento(atendimento);
    return data ? data.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "—";
}

function obterDadosPagamento(pagamento) {
    if (pagamento === "Crédito") {
        return { classe: "credito", icone: "fa-credit-card" };
    }

    if (pagamento === "Débito") {
        return { classe: "debito", icone: "fa-credit-card" };
    }

    if (pagamento === "Pix") {
        return { classe: "pix", icone: "fa-qrcode" };
    }

    return { classe: "dinheiro", icone: "fa-money-bill" };
}


// =============================
// NAVEGAÇÃO DE DATA
// =============================
function atualizarNavegadorHistorico() {
    const hoje = inicioDoDia(new Date());

    if (inputDataHistorico) {
        inputDataHistorico.max = chaveData(hoje);
        inputDataHistorico.value = chaveData(dataHistoricoSelecionada);
    }

    if (labelDataHistorico) {
        labelDataHistorico.textContent = formatarTituloData(dataHistoricoSelecionada);
    }

    if (btnHistoricoProxima) {
        const estaHoje = mesmoDia(dataHistoricoSelecionada, hoje);
        btnHistoricoProxima.disabled = estaHoje;
        btnHistoricoProxima.setAttribute("aria-disabled", String(estaHoje));
    }
}

async function selecionarDataHistorico(novaData) {
    const hoje = inicioDoDia(new Date());
    const normalizada = inicioDoDia(novaData);

    dataHistoricoSelecionada = normalizada > hoje ? hoje : normalizada;
    fecharDetalheHistorico();

    try {
        await recarregarAtendimentosDoDia(dataHistoricoSelecionada);
    } catch (error) {
        console.error("Erro ao carregar o dia do histórico:", error);
        mostrarErro("Não foi possível carregar este dia.");
    }
    atualizarHistorico();
}

export async function abrirHistoricoHoje() {
    dataHistoricoSelecionada = inicioDoDia(new Date());
    fecharDetalheHistorico();
    try {
        await recarregarAtendimentosDoDia(dataHistoricoSelecionada);
    } catch (error) {
        console.error("Erro ao carregar o histórico de hoje:", error);
    }
    atualizarHistorico();
}

btnHistoricoAnterior?.addEventListener("click", () => {
    selecionarDataHistorico(somarDias(dataHistoricoSelecionada, -1));
});

btnHistoricoProxima?.addEventListener("click", () => {
    const hoje = inicioDoDia(new Date());
    if (mesmoDia(dataHistoricoSelecionada, hoje)) return;
    selecionarDataHistorico(somarDias(dataHistoricoSelecionada, 1));
});

btnCalendarioHistorico?.addEventListener("click", () => {
    abrirSeletorData(inputDataHistorico);
});

inputDataHistorico?.addEventListener("change", () => {
    if (!inputDataHistorico.value) return;

    const data = dataDeInput(inputDataHistorico.value);
    if (data) selecionarDataHistorico(data);
});


// =============================
// FILTROS
// =============================
function pagamentoPassaNoFiltro(pagamento) {
    if (filtroPagamentoHistorico === "todos") return true;

    const valor = normalizarPagamento(pagamento);

    if (filtroPagamentoHistorico === "cartao") {
        return ["crédito", "credito", "débito", "debito"].includes(valor);
    }

    return valor === filtroPagamentoHistorico;
}

function servicoPassaNoFiltro(servico) {
    if (filtroServicoHistorico === "todos") return true;

    const valor = String(servico || "").trim();

    if (filtroServicoHistorico === "cabelo") return valor === "Cabelo";
    if (filtroServicoHistorico === "barba") return valor === "Barba";
    if (filtroServicoHistorico === "combos") return valor.includes("+");

    return true;
}

function atendimentoPassaFiltros(atendimento) {
    const bruto = obterBruto(atendimento);

    if (!pagamentoPassaNoFiltro(atendimento.pagamento)) return false;
    if (!servicoPassaNoFiltro(atendimento.servico)) return false;
    if (filtroSomenteEditados && atendimento.editado !== true) return false;
    if (filtroSomenteAjustados && !atendimentoTemValorAjustado(atendimento, bruto)) return false;

    return true;
}

function quantidadeFiltrosAtivos() {
    let quantidade = 0;
    if (filtroPagamentoHistorico !== "todos") quantidade += 1;
    if (filtroServicoHistorico !== "todos") quantidade += 1;
    if (filtroSomenteEditados) quantidade += 1;
    if (filtroSomenteAjustados) quantidade += 1;
    return quantidade;
}

function atualizarFiltroAtivo() {
    botoesFiltroPagamento.forEach((botao) => {
        const filtro = botao.dataset.historicoPagamento;
        const ativo = filtro === filtroPagamentoHistorico;

        botao.classList.toggle("active", ativo);
        botao.setAttribute("aria-pressed", String(ativo));
    });

    const quantidade = quantidadeFiltrosAtivos();
    const filtrosAvancadosAtivos =
        filtroServicoHistorico !== "todos" ||
        filtroSomenteEditados ||
        filtroSomenteAjustados;

    btnAbrirFiltrosHistorico?.classList.toggle("active", filtrosAvancadosAtivos);

    if (historicoFiltroBadge) {
        historicoFiltroBadge.hidden = quantidade === 0;
        historicoFiltroBadge.textContent = String(quantidade);
    }
}

function atualizarRascunhoFiltrosNaTela() {
    botoesFiltroServico.forEach((botao) => {
        const ativo = botao.dataset.historicoServico === filtroRascunhoServico;
        botao.classList.toggle("active", ativo);
        botao.setAttribute("aria-pressed", String(ativo));
    });

    if (filtroHistoricoEditados) {
        filtroHistoricoEditados.checked = filtroRascunhoEditados;
    }

    if (filtroHistoricoAjustados) {
        filtroHistoricoAjustados.checked = filtroRascunhoAjustados;
    }
}

function abrirFiltrosHistorico() {
    filtroRascunhoServico = filtroServicoHistorico;
    filtroRascunhoEditados = filtroSomenteEditados;
    filtroRascunhoAjustados = filtroSomenteAjustados;

    atualizarRascunhoFiltrosNaTela();
    modalFiltrosHistorico?.classList.add("active");
    modalFiltrosHistorico?.setAttribute("aria-hidden", "false");
}

function fecharFiltrosHistorico() {
    modalFiltrosHistorico?.classList.remove("active");
    modalFiltrosHistorico?.setAttribute("aria-hidden", "true");
}

botoesFiltroPagamento.forEach((botao) => {
    botao.addEventListener("click", () => {
        filtroPagamentoHistorico = botao.dataset.historicoPagamento || "todos";
        atualizarFiltroAtivo();
        atualizarHistorico();
    });
});

btnAbrirFiltrosHistorico?.addEventListener("click", abrirFiltrosHistorico);
btnFecharFiltrosHistorico?.addEventListener("click", fecharFiltrosHistorico);

modalFiltrosHistorico?.addEventListener("click", (event) => {
    if (event.target === modalFiltrosHistorico) {
        fecharFiltrosHistorico();
    }
});

botoesFiltroServico.forEach((botao) => {
    botao.addEventListener("click", () => {
        filtroRascunhoServico = botao.dataset.historicoServico || "todos";
        atualizarRascunhoFiltrosNaTela();
    });
});

filtroHistoricoEditados?.addEventListener("change", () => {
    filtroRascunhoEditados = filtroHistoricoEditados.checked;
});

filtroHistoricoAjustados?.addEventListener("change", () => {
    filtroRascunhoAjustados = filtroHistoricoAjustados.checked;
});

btnAplicarFiltrosHistorico?.addEventListener("click", () => {
    filtroServicoHistorico = filtroRascunhoServico;
    filtroSomenteEditados = filtroRascunhoEditados;
    filtroSomenteAjustados = filtroRascunhoAjustados;

    atualizarFiltroAtivo();
    fecharFiltrosHistorico();
    atualizarHistorico();
});

btnLimparFiltrosHistorico?.addEventListener("click", () => {
    filtroPagamentoHistorico = "todos";
    filtroServicoHistorico = "todos";
    filtroSomenteEditados = false;
    filtroSomenteAjustados = false;

    filtroRascunhoServico = "todos";
    filtroRascunhoEditados = false;
    filtroRascunhoAjustados = false;

    atualizarRascunhoFiltrosNaTela();
    atualizarFiltroAtivo();
    fecharFiltrosHistorico();
    atualizarHistorico();
});

atualizarFiltroAtivo();


// =============================
// HISTÓRICO
// =============================
export function atualizarHistorico() {
    if (!historicoContainer) return;

    atualizarNavegadorHistorico();
    atualizarFiltroAtivo();
    historicoContainer.innerHTML = "";

    const chaveSelecionada = chaveData(dataHistoricoSelecionada);

    const listaDia = state.atendimentos.filter((atendimento) => {
        const dataAtendimento = obterDataAtendimento(atendimento);
        return dataAtendimento && chaveData(dataAtendimento) === chaveSelecionada;
    });

    listaDia.sort((a, b) => obterDataAtendimento(b) - obterDataAtendimento(a));

    if (listaDia.length === 0) {
        const hoje = inicioDoDia(new Date());
        const texto = mesmoDia(dataHistoricoSelecionada, hoje)
            ? "Nenhum atendimento registrado hoje."
            : "Nenhum atendimento registrado neste dia.";

        historicoContainer.innerHTML = `
            <div class="historico-vazio">
                ${texto}
            </div>
        `;
        return;
    }

    const listaFiltrada = listaDia.filter(atendimentoPassaFiltros);

    if (listaFiltrada.length === 0) {
        historicoContainer.innerHTML = `
            <div class="historico-vazio">
                Nenhum atendimento encontrado com os filtros atuais.
            </div>
        `;
        return;
    }

    listaFiltrada.forEach((atendimento) => {
        const bruto = obterBruto(atendimento);
        const liquido = Number(atendimento.valorLiquido ?? 0);

        const hora = obterRotuloHora(atendimento);

        const pagamento = atendimento.pagamento || "—";
        const dadosPagamento = obterDadosPagamento(pagamento);
        const valorAjustado = atendimentoTemValorAjustado(atendimento, bruto);
        const editado = atendimento.editado === true;
        const observacao = String(atendimento.observacao || "").trim();
        const temDetalhes = Boolean(observacao || editado || valorAjustado || atendimento.retroativo);
        const podeExcluir = usuarioEhAdmin();

        const card = document.createElement("article");
        card.className = "historico-card";

        card.innerHTML = `
            <div class="hist-left">
                <div class="hist-servico-row">
                    <div class="hist-servico">
                        ${escaparHtml(atendimento.servico || "Atendimento")}
                    </div>

                    ${temDetalhes ? `
                        <button
                            type="button"
                            class="btn-expand-hist"
                            aria-label="Ver mais informações deste atendimento"
                        >
                            <i class="fas fa-chevron-right" aria-hidden="true"></i>
                        </button>
                    ` : ""}
                </div>

                <div class="hist-meta">
                    <span class="hist-hora">${hora}</span>

                    <span class="hist-pagamento ${dadosPagamento.classe}">
                        <i class="fas ${dadosPagamento.icone}" aria-hidden="true"></i>
                        ${escaparHtml(pagamento)}
                    </span>

                    ${usuarioEhAdmin() && atendimento.profissionalNome ? `
                        <span class="hist-profissional">
                            <i class="fas fa-user" aria-hidden="true"></i>
                            ${escaparHtml(atendimento.profissionalNome)}
                        </span>
                    ` : ""}

                    ${valorAjustado ? `
                        <span class="hist-valor-ajustado">
                            <i class="fas fa-tag" aria-hidden="true"></i>
                            Valor ajustado
                        </span>
                    ` : ""}

                    ${editado ? `
                        <span class="hist-editado">
                            <i class="fas fa-pen" aria-hidden="true"></i>
                            Editado
                        </span>
                    ` : ""}
                </div>

                ${observacao ? `
                    <div class="hist-comentario-preview">
                        <strong>Comentário:</strong> ${escaparHtml(observacao)}
                    </div>
                ` : ""}
            </div>

            <div class="hist-right">
                <div class="hist-valores">
                    <span class="hist-bruto">
                        R$ ${formatarMoeda(bruto)}
                    </span>

                    <span class="hist-liquido">
                        Líq. R$ ${formatarMoeda(liquido)}
                    </span>
                </div>

                <div class="hist-actions">
                    <button
                        type="button"
                        class="btn-edit-hist"
                        aria-label="Editar atendimento"
                    >
                        <i class="fas fa-pen" aria-hidden="true"></i>
                    </button>

                    ${podeExcluir ? `
                    <button
                        type="button"
                        class="btn-delete-hist"
                        aria-label="Excluir atendimento"
                    >
                        <i class="fas fa-trash" aria-hidden="true"></i>
                    </button>
                    ` : ""}
                </div>
            </div>
        `;

        card.querySelector(".btn-expand-hist")?.addEventListener("click", () => {
            abrirDetalheHistorico(atendimento);
        });

        card.querySelector(".btn-edit-hist")?.addEventListener("click", () => {
            abrirModalEdicao(atendimento, bruto);
        });

        card.querySelector(".btn-delete-hist")?.addEventListener("click", () => {
            abrirModalExclusao(
                atendimento.id,
                atendimento.servico,
                bruto
            );
        });

        historicoContainer.appendChild(card);
    });
}


// =============================
// DETALHES SOBREPOSTOS
// =============================
function abrirDetalheHistorico(atendimento) {
    if (!historicoDetalheConteudo || !historicoDetalheOverlay) return;

    atendimentoDetalheAtual = atendimento;

    const bruto = obterBruto(atendimento);
    const observacao = String(atendimento.observacao || "").trim();
    const valorAjustado = atendimentoTemValorAjustado(atendimento, bruto);
    const editado = atendimento.editado === true;
    const pagamento = atendimento.pagamento || "—";
    const hora = obterRotuloHora(atendimento);

    historicoDetalheConteudo.innerHTML = `
        <div class="historico-detalhe-title">
            <span>Atendimento</span>
            <h3 id="historicoDetalheTitulo">${escaparHtml(atendimento.servico || "Atendimento")}</h3>
            <strong class="historico-detalhe-value">R$ ${formatarMoeda(bruto)}</strong>
        </div>

        <div class="historico-detalhe-meta">
            <span><i class="fas fa-clock" aria-hidden="true"></i> ${hora}</span>
            <span><i class="fas fa-wallet" aria-hidden="true"></i> ${escaparHtml(pagamento)}</span>
            ${usuarioEhAdmin() && atendimento.profissionalNome ? `<span><i class="fas fa-user" aria-hidden="true"></i> ${escaparHtml(atendimento.profissionalNome)}</span>` : ""}
            ${valorAjustado ? `<span class="hist-valor-ajustado"><i class="fas fa-tag" aria-hidden="true"></i> Valor ajustado</span>` : ""}
            ${editado ? `<span class="hist-editado"><i class="fas fa-pen" aria-hidden="true"></i> Editado</span>` : ""}
        </div>

        ${(observacao || editado || atendimento.retroativo) ? '<div class="historico-detalhe-divider"></div>' : ""}

        ${observacao ? `
            <div class="historico-detalhe-block">
                <span>Comentário</span>
                <p>${escaparHtml(observacao)}</p>
            </div>
        ` : ""}

        ${atendimento.retroativo ? `
            <div class="historico-detalhe-block">
                <span>Registro</span>
                <p>Atendimento inserido retroativamente para a data selecionada.</p>
            </div>
        ` : ""}

        ${editado ? `
            <div class="historico-detalhe-block">
                <span>Última edição</span>
                <p class="historico-detalhe-editado">${escaparHtml(formatarDataHora(atendimento.editadoEm))}</p>
            </div>
        ` : ""}
    `;

    historicoDetalheOverlay.classList.add("active");
    historicoDetalheOverlay.setAttribute("aria-hidden", "false");
}

function fecharDetalheHistorico() {
    if (atendimentoEmEdicao) return;

    historicoDetalheOverlay?.classList.remove("active");
    historicoDetalheOverlay?.setAttribute("aria-hidden", "true");
    atendimentoDetalheAtual = null;
}

btnFecharDetalheHistorico?.addEventListener("click", fecharDetalheHistorico);

historicoDetalheOverlay?.addEventListener("click", (event) => {
    if (event.target === historicoDetalheOverlay && !atendimentoEmEdicao) {
        fecharDetalheHistorico();
    }
});


// =============================
// EDIÇÃO
// =============================
function membroDoAtendimento(atendimento) {
    const uid = atendimento?.profissionalUid;
    if (!uid || uid === state.user?.uid) return state.membroAtual;
    return (state.equipe || []).find((item) => (item.uid || item.id) === uid) || null;
}

function preencherSelectsEdicao(atendimento) {
    if (editServicoHistorico) {
        const atual = atendimento.servicoNome || atendimento.servico || "";
        editServicoHistorico.innerHTML = "";

        obterServicos({ somenteAtivos: true }).forEach((servico) => {
            const option = document.createElement("option");
            option.value = servico.nome;
            option.dataset.servicoId = servico.id;
            option.textContent = servico.nome;
            editServicoHistorico.appendChild(option);
        });

        if (atual && ![...editServicoHistorico.options].some((option) => option.value === atual)) {
            const option = document.createElement("option");
            option.value = atual;
            option.dataset.servicoId = atendimento.servicoId || "";
            option.textContent = `${atual} (histórico)`;
            editServicoHistorico.appendChild(option);
        }
        editServicoHistorico.value = atual;
    }

    if (editPagamentoHistorico) {
        const atual = atendimento.pagamento || "Dinheiro";
        const pagamentos = ["Pix", "Dinheiro", "Débito", "Crédito"];
        editPagamentoHistorico.innerHTML = "";
        pagamentos.forEach((pagamento) => {
            if (!pagamentoEstaAtivo(pagamento) && pagamento !== atual) return;
            const option = document.createElement("option");
            option.value = pagamento;
            option.textContent = pagamentoEstaAtivo(pagamento) ? pagamento : `${pagamento} (desativado)`;
            editPagamentoHistorico.appendChild(option);
        });
        editPagamentoHistorico.value = atual;
    }
}

function servicoSelecionadoEdicao() {
    const option = editServicoHistorico?.selectedOptions?.[0];
    const id = option?.dataset?.servicoId || null;
    const servico = id ? obterServicoPorId(id) : obterServicoPorNome(editServicoHistorico?.value);
    return servico;
}

function precoAtualParaEdicao(atendimento) {
    const servico = servicoSelecionadoEdicao();
    if (!servico) return null;
    return resolverPrecoServico(servico, membroDoAtendimento(atendimento));
}

function abrirModalEdicao(atendimento, bruto) {
    atendimentoEmEdicao = atendimento;
    preencherSelectsEdicao(atendimento);

    if (editValorHistorico) editValorHistorico.value = formatarMoeda(bruto);
    if (editObservacaoHistorico) editObservacaoHistorico.value = String(atendimento.observacao || "").slice(0, 160);

    modalEditarHistorico?.classList.add("active");
    modalEditarHistorico?.setAttribute("aria-hidden", "false");
}

function fecharModalEdicao() {
    modalEditarHistorico?.classList.remove("active");
    modalEditarHistorico?.setAttribute("aria-hidden", "true");
    atendimentoEmEdicao = null;
}

editServicoHistorico?.addEventListener("change", () => {
    if (!atendimentoEmEdicao) return;
    const resolvido = precoAtualParaEdicao(atendimentoEmEdicao);
    if (editValorHistorico && Number(resolvido?.preco) > 0) {
        editValorHistorico.value = formatarMoeda(resolvido.preco);
    }
});

editValorHistorico?.addEventListener("input", () => {
    aplicarMascaraMoedaInput(editValorHistorico);
});

btnFecharEdicaoHistorico?.addEventListener("click", fecharModalEdicao);
btnCancelarEdicaoHistorico?.addEventListener("click", fecharModalEdicao);

btnSalvarEdicaoHistorico?.addEventListener("click", async () => {
    if (!atendimentoEmEdicao?.id) return;

    const original = atendimentoEmEdicao;
    const brutoOriginal = obterBruto(original);
    const servicoNome = editServicoHistorico?.value || original.servicoNome || original.servico;
    const pagamento = editPagamentoHistorico?.value || original.pagamento;
    const valorBruto = converterParaNumero(editValorHistorico?.value) || 0;
    const observacao = String(editObservacaoHistorico?.value || "").trim().slice(0, 160);

    if (!servicoNome || !pagamento || valorBruto <= 0) {
        alert("Revise o serviço, o valor e a forma de pagamento.");
        return;
    }

    const nomeOriginal = original.servicoNome || original.servico;
    const alterouFinanceiro =
        servicoNome !== nomeOriginal ||
        pagamento !== original.pagamento ||
        Math.abs(valorBruto - brutoOriginal) > 0.009;
    const alterouObservacao = observacao !== String(original.observacao || "").trim();

    if (!alterouFinanceiro && !alterouObservacao) {
        fecharModalEdicao();
        return;
    }

    let atualizacao = { observacao };

    if (alterouFinanceiro) {
        const servico = servicoSelecionadoEdicao();
        const precoResolvido = servico
            ? resolverPrecoServico(servico, membroDoAtendimento(original))
            : {
                preco: Number(original.precoProfissional ?? original.precoBase ?? valorBruto),
                precoBase: Number(original.precoBase ?? valorBruto),
                precoProfissional: original.precoProfissional ?? null,
                origem: original.origemPreco || "padrao"
            };

        const esperado = Number(precoResolvido.preco || 0);
        const valorDiferenciado = esperado > 0
            ? Math.abs(valorBruto - esperado) > 0.009
            : true;

        atualizacao = criarAtualizacaoFinanceiraAtendimento({
            servico: servicoNome,
            servicoId: servico?.id || original.servicoId || null,
            precoBase: precoResolvido.precoBase,
            precoProfissional: precoResolvido.precoProfissional,
            origemPreco: precoResolvido.origem,
            pagamento,
            valorBruto,
            observacao,
            valorDiferenciado
        }, state.configSistema, original);
    }

    const textoOriginal = btnSalvarEdicaoHistorico.textContent;
    btnSalvarEdicaoHistorico.textContent = "Salvando...";
    btnSalvarEdicaoHistorico.disabled = true;

    try {
        await editarAtendimento(original.id, atualizacao);
        fecharModalEdicao();
        historicoDetalheOverlay?.classList.remove("active");
        historicoDetalheOverlay?.setAttribute("aria-hidden", "true");
        atendimentoDetalheAtual = null;
        invalidarCacheAtendimentos();
        await recarregarAtendimentosDoDia(dataHistoricoSelecionada);
    } catch (error) {
        console.error("Erro ao editar atendimento:", error);
        mostrarErro("Não foi possível salvar a alteração.");
    } finally {
        btnSalvarEdicaoHistorico.textContent = textoOriginal;
        btnSalvarEdicaoHistorico.disabled = false;
    }
});


// =============================
// MODAL DE EXCLUSÃO
// =============================
function abrirModalExclusao(id, servico, valor) {
    idParaExcluir = id;

    if (modalDescricao) {
        modalDescricao.innerHTML =
            `Excluir o atendimento de <b>${escaparHtml(servico)} (R$ ${formatarMoeda(valor)})</b>?`;
    }

    modalConfirm?.classList.add("active");
}

document.getElementById("btnCancelar")?.addEventListener("click", () => {
    modalConfirm?.classList.remove("active");
    idParaExcluir = null;
});

btnConfirmar?.addEventListener("click", async () => {
    if (idParaExcluir) {
        btnConfirmar.textContent = "Excluindo...";

        try {
            await excluirAtendimento(idParaExcluir);
            invalidarCacheAtendimentos();
        await recarregarAtendimentosDoDia(dataHistoricoSelecionada);
        } catch (error) {
            console.error(error);
            mostrarErro("Não foi possível excluir o atendimento.");
        }

        btnConfirmar.textContent = "Sim, excluir";
    }

    modalConfirm?.classList.remove("active");
    idParaExcluir = null;
});


document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;

    if (modalEditarHistorico?.classList.contains("active")) {
        return;
    }

    if (modalFiltrosHistorico?.classList.contains("active")) {
        fecharFiltrosHistorico();
        return;
    }

    if (historicoDetalheOverlay?.classList.contains("active")) {
        fecharDetalheHistorico();
    }
});


onStateChange("atendimentos", atualizarHistorico);
onStateChange("configSistema", atualizarHistorico);
