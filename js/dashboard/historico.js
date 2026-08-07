import { db } from "../firebase-init.js";

import {
    collection,
    getDocs,
    deleteDoc,
    updateDoc,
    doc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

import { state } from "./state.js";
import { atualizarCards, processarFinanceiro } from "./financeiro.js";


// =============================
// ELEMENTOS
// =============================

const historicoContainer =
    document.getElementById("historicoContainer");

const btnHistoricoAnterior =
    document.getElementById("btnHistoricoAnterior");

const btnHistoricoProxima =
    document.getElementById("btnHistoricoProxima");

const labelDataHistorico =
    document.getElementById("labelDataHistorico");

const btnCalendarioHistorico =
    document.getElementById("btnCalendarioHistorico");

const inputDataHistorico =
    document.getElementById("inputDataHistorico");

const botoesFiltroHistorico =
    document.querySelectorAll("[data-historico-pagamento]");

const modalConfirm =
    document.getElementById("modalConfirm");

const modalDescricao =
    document.getElementById("modalDescricao");

const btnConfirmar =
    document.getElementById("btnConfirmar");

const modalEditarHistorico =
    document.getElementById("modalEditarHistorico");

const btnFecharEdicaoHistorico =
    document.getElementById("btnFecharEdicaoHistorico");

const btnCancelarEdicaoHistorico =
    document.getElementById("btnCancelarEdicaoHistorico");

const btnSalvarEdicaoHistorico =
    document.getElementById("btnSalvarEdicaoHistorico");

const editServicoHistorico =
    document.getElementById("editServicoHistorico");

const editValorHistorico =
    document.getElementById("editValorHistorico");

const editPagamentoHistorico =
    document.getElementById("editPagamentoHistorico");


// =============================
// ESTADO DO HISTÓRICO
// =============================

let dataHistoricoSelecionada =
    inicioDoDia(new Date());

let filtroPagamentoHistorico = "todos";
let idParaExcluir = null;
let atendimentoEmEdicao = null;


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

function normalizarPagamento(pagamento) {
    return String(pagamento || "").trim().toLowerCase();
}

function pagamentoPassaNoFiltro(pagamento) {
    if (filtroPagamentoHistorico === "todos") return true;

    const valor = normalizarPagamento(pagamento);

    if (filtroPagamentoHistorico === "cartao") {
        return valor === "crédito" || valor === "credito" || valor === "débito" || valor === "debito";
    }

    return valor === filtroPagamentoHistorico;
}

function atendimentoTemValorAjustado(atendimento, bruto) {
    if (atendimento.valorDiferenciado === true) return true;
    if (atendimento.valorDiferenciado === false) return false;

    const precoPadrao = Number(
        state.configSistema.precos?.[atendimento.servico]
    );

    if (!Number.isFinite(precoPadrao) || precoPadrao <= 0) {
        return false;
    }

    return Math.abs(Number(bruto) - precoPadrao) > 0.009;
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
    atualizarHistorico();
}

export function abrirHistoricoHoje() {
    dataHistoricoSelecionada = inicioDoDia(new Date());
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

// Sempre que entrar em Histórico, volta para hoje.
document
    .querySelectorAll('a[href="#historico"]')
    .forEach((link) => {
        link.addEventListener("click", () => {
            dataHistoricoSelecionada = inicioDoDia(new Date());
        });
    });


// =============================
// FILTRO POR PAGAMENTO
// =============================

function atualizarFiltroAtivo() {
    botoesFiltroHistorico.forEach((botao) => {
        const filtro = botao.dataset.historicoPagamento;
        const ativo = filtro === filtroPagamentoHistorico;

        botao.classList.toggle("active", ativo);
        botao.setAttribute("aria-pressed", String(ativo));
    });
}

botoesFiltroHistorico.forEach((botao) => {
    botao.addEventListener("click", () => {
        filtroPagamentoHistorico = botao.dataset.historicoPagamento || "todos";
        atualizarFiltroAtivo();
        atualizarHistorico();
    });
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
    historicoContainer.innerHTML = "";

    const chaveSelecionada = chaveData(dataHistoricoSelecionada);

    const listaDia = state.atendimentos.filter((atendimento) => {
        if (!atendimento.data) return false;

        const dataAtendimento = new Date(atendimento.data);

        if (Number.isNaN(dataAtendimento.getTime())) {
            return false;
        }

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

    const listaFiltrada = listaDia.filter((atendimento) =>
        pagamentoPassaNoFiltro(atendimento.pagamento)
    );

    if (listaFiltrada.length === 0) {
        historicoContainer.innerHTML = `
            <div class="historico-vazio">
                Nenhum atendimento com este pagamento neste dia.
            </div>
        `;
        return;
    }

    listaFiltrada.forEach((atendimento) => {
        const bruto = Number(
            atendimento.valorBrutoTotal ??
            atendimento.valorBruto ??
            atendimento.valorServicoBruto ??
            0
        );

        const liquido = Number(atendimento.valorLiquido ?? 0);

        const hora = new Date(atendimento.data).toLocaleTimeString("pt-BR", {
            hour: "2-digit",
            minute: "2-digit"
        });

        const pagamento = atendimento.pagamento || "—";

        let classePag = "dinheiro";
        let iconePag = "fa-money-bill";

        if (pagamento === "Crédito") {
            classePag = "credito";
            iconePag = "fa-credit-card";
        } else if (pagamento === "Débito") {
            classePag = "debito";
            iconePag = "fa-credit-card";
        } else if (pagamento === "Pix") {
            classePag = "pix";
            iconePag = "fa-qrcode";
        }

        const valorAjustado = atendimentoTemValorAjustado(atendimento, bruto);

        const card = document.createElement("article");
        card.className = "historico-card";

        card.innerHTML = `
            <div class="hist-left">
                <div class="hist-servico">
                    ${atendimento.servico || "Atendimento"}
                </div>

                <div class="hist-meta">
                    <span class="hist-hora">${hora}</span>

                    <span class="hist-pagamento ${classePag}">
                        <i class="fas ${iconePag}" aria-hidden="true"></i>
                        ${pagamento}
                    </span>

                    ${valorAjustado ? `
                        <span class="hist-valor-ajustado">
                            <i class="fas fa-tag" aria-hidden="true"></i>
                            Valor ajustado
                        </span>
                    ` : ""}
                </div>
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

    const servico = editServicoHistorico?.value || atendimentoEmEdicao.servico;
    const pagamento = editPagamentoHistorico?.value || atendimentoEmEdicao.pagamento;
    const valorBruto = converterMoedaHistorico(editValorHistorico?.value);

    if (!servico || !pagamento || valorBruto <= 0) {
        alert("Revise o serviço, o valor e a forma de pagamento.");
        return;
    }

    const financeiro = processarFinanceiro(valorBruto, pagamento);
    const precoPadrao = Number(state.configSistema.precos?.[servico]);

    const valorDiferenciado =
        Number.isFinite(precoPadrao) && precoPadrao > 0
            ? Math.abs(valorBruto - precoPadrao) > 0.009
            : true;

    const textoOriginal = btnSalvarEdicaoHistorico.textContent;
    btnSalvarEdicaoHistorico.textContent = "Salvando...";
    btnSalvarEdicaoHistorico.disabled = true;

    try {
        await updateDoc(
            doc(db, "atendimentos", atendimentoEmEdicao.id),
            {
                servico,
                pagamento,
                valorServicoBruto: Number(valorBruto.toFixed(2)),
                valorBrutoTotal: Number(valorBruto.toFixed(2)),
                valorLiquido: financeiro.liquidoConta,
                repasseDono: financeiro.repasseDono,
                liquidoBarbeiro: financeiro.liquidoBarbeiro,
                valorDiferenciado
            }
        );

        fecharModalEdicao();
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
            `Excluir o atendimento de <b>${servico} (R$ ${formatarMoedaHistorico(valor)})</b>?`;
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
