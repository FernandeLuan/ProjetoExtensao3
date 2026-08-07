import { db } from "../firebase-init.js";

import {
    collection,
    getDocs,
    deleteDoc,
    updateDoc,
    serverTimestamp,
    doc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

import { state } from "./state.js";
import { atualizarCards, processarFinanceiro } from "./financeiro.js";


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
// UTILITÁRIOS
// =============================
function inicioDoDia(data) {
    const resultado = new Date(data);
    resultado.setHours(0, 0, 0, 0);
    return resultado;
}

function somarDias(data, quantidade) {
    const resultado = inicioDoDia(data);
    resultado.setDate(resultado.getDate() + quantidade);
    return resultado;
}

function chaveData(data) {
    const ano = data.getFullYear();
    const mes = String(data.getMonth() + 1).padStart(2, "0");
    const dia = String(data.getDate()).padStart(2, "0");
    return `${ano}-${mes}-${dia}`;
}

function mesmoDia(dataA, dataB) {
    return chaveData(dataA) === chaveData(dataB);
}

function formatarTituloData(data) {
    const hoje = inicioDoDia(new Date());
    const dia = String(data.getDate()).padStart(2, "0");
    const mes = data.toLocaleDateString("pt-BR", { month: "long" });

    if (mesmoDia(data, hoje)) {
        return `Hoje • ${dia} de ${mes}`;
    }

    return `${dia} de ${mes} de ${data.getFullYear()}`;
}

function formatarMoedaHistorico(valor) {
    return Number(valor || 0).toLocaleString("pt-BR", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}

function converterMoedaHistorico(valor) {
    if (!valor) return 0;

    const normalizado = valor
        .toString()
        .trim()
        .replace(/\./g, "")
        .replace(",", ".");

    return Number(normalizado) || 0;
}

function aplicarMascaraMoedaHistorico(input) {
    if (!input) return;

    let digitos = input.value.replace(/\D/g, "");

    if (!digitos) {
        input.value = "";
        return;
    }

    const numero = Number(digitos) / 100;

    input.value = numero.toLocaleString("pt-BR", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}

function escaparHtml(valor) {
    return String(valor ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function normalizarPagamento(pagamento) {
    return String(pagamento || "").trim().toLowerCase();
}

function obterBruto(atendimento) {
    return Number(
        atendimento.valorBrutoTotal ??
        atendimento.valorBruto ??
        atendimento.valorServicoBruto ??
        0
    );
}

function atendimentoTemValorAjustado(atendimento, bruto = obterBruto(atendimento)) {
    if (atendimento.valorDiferenciado === true) return true;
    if (atendimento.valorDiferenciado === false) return false;

    const precoPadrao = Number(state.configSistema.precos?.[atendimento.servico]);

    if (!Number.isFinite(precoPadrao) || precoPadrao <= 0) {
        return false;
    }

    return Math.abs(Number(bruto) - precoPadrao) > 0.009;
}

function dataDoCampo(valor) {
    if (!valor) return null;

    if (typeof valor.toDate === "function") {
        return valor.toDate();
    }

    const data = valor instanceof Date ? valor : new Date(valor);
    return Number.isNaN(data.getTime()) ? null : data;
}

function formatarDataHoraEdicao(valor) {
    const data = dataDoCampo(valor);
    if (!data) return "Data da edição indisponível";

    const dataFormatada = data.toLocaleDateString("pt-BR");
    const hora = data.toLocaleTimeString("pt-BR", {
        hour: "2-digit",
        minute: "2-digit"
    });

    return `${dataFormatada} às ${hora}`;
}

function abrirCalendario(input) {
    if (!input) return;

    try {
        if (typeof input.showPicker === "function") {
            input.showPicker();
        } else {
            input.click();
        }
    } catch (error) {
        input.click();
    }
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

function selecionarDataHistorico(novaData) {
    const hoje = inicioDoDia(new Date());
    const normalizada = inicioDoDia(novaData);

    dataHistoricoSelecionada = normalizada > hoje ? hoje : normalizada;
    fecharDetalheHistorico();
    atualizarHistorico();
}

export function abrirHistoricoHoje() {
    dataHistoricoSelecionada = inicioDoDia(new Date());
    fecharDetalheHistorico();
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
    abrirCalendario(inputDataHistorico);
});

inputDataHistorico?.addEventListener("change", () => {
    if (!inputDataHistorico.value) return;

    const [ano, mes, dia] = inputDataHistorico.value.split("-").map(Number);
    selecionarDataHistorico(new Date(ano, mes - 1, dia));
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
// BANCO DE DADOS
// =============================
export async function carregarAtendimentos() {
    try {
        const querySnapshot = await getDocs(collection(db, "atendimentos"));

        state.atendimentos = [];

        querySnapshot.forEach((documento) => {
            state.atendimentos.push({
                id: documento.id,
                ...documento.data()
            });
        });

        atualizarHistorico();
        atualizarCards();
    } catch (error) {
        console.error("Erro ao carregar dados:", error);
    }
}


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
        if (!atendimento.data) return false;

        const dataAtendimento = new Date(atendimento.data);
        if (Number.isNaN(dataAtendimento.getTime())) return false;

        return chaveData(dataAtendimento) === chaveSelecionada;
    });

    listaDia.sort((a, b) => new Date(b.data) - new Date(a.data));

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

        const hora = new Date(atendimento.data).toLocaleTimeString("pt-BR", {
            hour: "2-digit",
            minute: "2-digit"
        });

        const pagamento = atendimento.pagamento || "—";
        const dadosPagamento = obterDadosPagamento(pagamento);
        const valorAjustado = atendimentoTemValorAjustado(atendimento, bruto);
        const editado = atendimento.editado === true;
        const observacao = String(atendimento.observacao || "").trim();
        const temDetalhes = Boolean(observacao || editado || valorAjustado);

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
                        R$ ${formatarMoedaHistorico(bruto)}
                    </span>

                    <span class="hist-liquido">
                        Líq. R$ ${formatarMoedaHistorico(liquido)}
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

                    <button
                        type="button"
                        class="btn-delete-hist"
                        aria-label="Excluir atendimento"
                    >
                        <i class="fas fa-trash" aria-hidden="true"></i>
                    </button>
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
    const hora = new Date(atendimento.data).toLocaleTimeString("pt-BR", {
        hour: "2-digit",
        minute: "2-digit"
    });

    historicoDetalheConteudo.innerHTML = `
        <div class="historico-detalhe-title">
            <span>Atendimento</span>
            <h3 id="historicoDetalheTitulo">${escaparHtml(atendimento.servico || "Atendimento")}</h3>
            <strong class="historico-detalhe-value">R$ ${formatarMoedaHistorico(bruto)}</strong>
        </div>

        <div class="historico-detalhe-meta">
            <span><i class="fas fa-clock" aria-hidden="true"></i> ${hora}</span>
            <span><i class="fas fa-wallet" aria-hidden="true"></i> ${escaparHtml(pagamento)}</span>
            ${valorAjustado ? `<span class="hist-valor-ajustado"><i class="fas fa-tag" aria-hidden="true"></i> Valor ajustado</span>` : ""}
            ${editado ? `<span class="hist-editado"><i class="fas fa-pen" aria-hidden="true"></i> Editado</span>` : ""}
        </div>

        ${(observacao || editado) ? '<div class="historico-detalhe-divider"></div>' : ""}

        ${observacao ? `
            <div class="historico-detalhe-block">
                <span>Comentário</span>
                <p>${escaparHtml(observacao)}</p>
            </div>
        ` : ""}

        ${editado ? `
            <div class="historico-detalhe-block">
                <span>Última edição</span>
                <p class="historico-detalhe-editado">${escaparHtml(formatarDataHoraEdicao(atendimento.editadoEm))}</p>
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
function abrirModalEdicao(atendimento, bruto) {
    atendimentoEmEdicao = atendimento;

    if (editServicoHistorico) {
        editServicoHistorico.value = atendimento.servico || "Cabelo";
    }

    if (editPagamentoHistorico) {
        editPagamentoHistorico.value = atendimento.pagamento || "Dinheiro";
    }

    if (editValorHistorico) {
        editValorHistorico.value = formatarMoedaHistorico(bruto);
    }

    if (editObservacaoHistorico) {
        editObservacaoHistorico.value = String(atendimento.observacao || "").slice(0, 160);
    }

    modalEditarHistorico?.classList.add("active");
    modalEditarHistorico?.setAttribute("aria-hidden", "false");
}

function fecharModalEdicao() {
    modalEditarHistorico?.classList.remove("active");
    modalEditarHistorico?.setAttribute("aria-hidden", "true");
    atendimentoEmEdicao = null;
}

editServicoHistorico?.addEventListener("change", () => {
    const precoPadrao = Number(
        state.configSistema.precos?.[editServicoHistorico.value]
    );

    if (editValorHistorico && Number.isFinite(precoPadrao) && precoPadrao > 0) {
        editValorHistorico.value = formatarMoedaHistorico(precoPadrao);
    }
});

editValorHistorico?.addEventListener("input", () => {
    aplicarMascaraMoedaHistorico(editValorHistorico);
});

btnFecharEdicaoHistorico?.addEventListener("click", fecharModalEdicao);
btnCancelarEdicaoHistorico?.addEventListener("click", fecharModalEdicao);

btnSalvarEdicaoHistorico?.addEventListener("click", async () => {
    if (!atendimentoEmEdicao?.id) return;

    const original = atendimentoEmEdicao;
    const brutoOriginal = obterBruto(original);

    const servico = editServicoHistorico?.value || original.servico;
    const pagamento = editPagamentoHistorico?.value || original.pagamento;
    const valorBruto = converterMoedaHistorico(editValorHistorico?.value);
    const observacao = String(editObservacaoHistorico?.value || "").trim().slice(0, 160);

    if (!servico || !pagamento || valorBruto <= 0) {
        alert("Revise o serviço, o valor e a forma de pagamento.");
        return;
    }

    const alterouFinanceiro =
        servico !== original.servico ||
        pagamento !== original.pagamento ||
        Math.abs(valorBruto - brutoOriginal) > 0.009;

    const alterouObservacao = observacao !== String(original.observacao || "").trim();

    if (!alterouFinanceiro && !alterouObservacao) {
        fecharModalEdicao();
        return;
    }

    const atualizacao = {
        observacao,
        editado: true,
        editadoEm: serverTimestamp()
    };

    if (alterouFinanceiro) {
        const financeiro = processarFinanceiro(valorBruto, pagamento);
        const precoPadrao = Number(state.configSistema.precos?.[servico]);

        const valorDiferenciado =
            Number.isFinite(precoPadrao) && precoPadrao > 0
                ? Math.abs(valorBruto - precoPadrao) > 0.009
                : true;

        Object.assign(atualizacao, {
            servico,
            pagamento,
            valorServicoBruto: Number(valorBruto.toFixed(2)),
            valorBrutoTotal: Number(valorBruto.toFixed(2)),
            valorLiquido: financeiro.liquidoConta,
            repasseDono: financeiro.repasseDono,
            liquidoBarbeiro: financeiro.liquidoBarbeiro,
            valorDiferenciado
        });
    }

    const textoOriginal = btnSalvarEdicaoHistorico.textContent;
    btnSalvarEdicaoHistorico.textContent = "Salvando...";
    btnSalvarEdicaoHistorico.disabled = true;

    try {
        await updateDoc(
            doc(db, "atendimentos", original.id),
            atualizacao
        );

        fecharModalEdicao();
        historicoDetalheOverlay?.classList.remove("active");
        historicoDetalheOverlay?.setAttribute("aria-hidden", "true");
        atendimentoDetalheAtual = null;

        await carregarAtendimentos();
    } catch (error) {
        console.error("Erro ao editar atendimento:", error);
        alert("Não foi possível salvar a alteração.");
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
            `Excluir o atendimento de <b>${escaparHtml(servico)} (R$ ${formatarMoedaHistorico(valor)})</b>?`;
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
            await deleteDoc(doc(db, "atendimentos", idParaExcluir));
            await carregarAtendimentos();
        } catch (error) {
            console.error(error);
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
