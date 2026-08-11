import { Timestamp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import {
    criarDespesa,
    criarDespesaParcelada,
    editarDespesa,
    excluirDespesaParcelada,
    listarDespesasPorPeriodo
} from "./data/despesas-repository.js?v=9.5";
import { podeAdministrarNaVisaoAtual } from "./permissoes.js?v=9.5";
import { state } from "./state.js?v=9.5";
import { converterParaNumero, aplicarMascaraMoedaInput, formatarMoeda } from "./utils/money.js?v=9.5";
import { chaveData, dataDeInput, inicioDoDia, paraDate } from "./utils/date.js?v=9.5";
import { abrirSeletorData } from "./utils/dom.js?v=9.5";
import { mostrarErro, mostrarSucesso } from "./services/feedback-service.js?v=9.5";
import {
    iniciarAcaoBotao,
    concluirAcaoBotao,
    restaurarAcaoBotao,
    iniciarLoadingTela,
    finalizarLoadingTela
} from "./services/ui-loading-service.js?v=9.5";

let inicializado = false;
let mesSelecionado = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
let despesasMes = [];
let despesaEmEdicao = null;
let despesaParaExcluir = null;
let modoDespesa = "avista";

const btnMesAnterior = document.getElementById("btnDespesaMesAnterior");
const btnMesProximo = document.getElementById("btnDespesaMesProximo");
const mesLabel = document.getElementById("despesasMesLabel");
const totalEl = document.getElementById("despesasTotal");
const quantidadeEl = document.getElementById("despesasQuantidade");
const listaEl = document.getElementById("despesasLista");
const btnNova = document.getElementById("btnNovaDespesa");

const modal = document.getElementById("modalDespesa");
const tituloModal = document.getElementById("tituloModalDespesa");
const subtituloModal = document.getElementById("subtituloModalDespesa");
const btnFecharModal = document.getElementById("btnFecharModalDespesa");
const form = document.getElementById("formDespesa");
const inputData = document.getElementById("despesaData");
const inputCategoria = document.getElementById("despesaCategoria");
const inputDescricao = document.getElementById("despesaDescricao");
const inputValor = document.getElementById("despesaValor");
const tipoField = document.getElementById("despesaTipoField");
const inputTipo = document.getElementById("despesaTipo");
const statusEl = document.getElementById("despesaStatus");
const btnSalvar = document.getElementById("btnSalvarDespesa");
const btnCalendario = document.getElementById("btnCalendarioDespesa");
const formaField = document.getElementById("despesaFormaField");
const btnAVista = document.getElementById("btnDespesaAVista");
const btnParcelada = document.getElementById("btnDespesaParcelada");
const parcelasField = document.getElementById("despesaParcelasField");
const inputParcelas = document.getElementById("despesaParcelas");
const previewParcelas = document.getElementById("despesaParcelasPreview");
const edicaoParcelamentoInfo = document.getElementById("despesaEdicaoParcelamentoInfo");

const labels = {
    data: document.getElementById("labelDespesaData"),
    categoria: document.getElementById("labelDespesaCategoria"),
    descricao: document.getElementById("labelDespesaDescricao"),
    valor: document.getElementById("labelDespesaValor"),
    parcelas: document.getElementById("labelDespesaParcelas")
};

const modalExcluir = document.getElementById("modalConfirmDespesa");
const descricaoExcluir = document.getElementById("modalDescricaoDespesa");
const btnCancelarExcluir = document.getElementById("btnCancelarDespesa");
const btnConfirmarExcluir = document.getElementById("btnConfirmarDespesa");
const escopoExcluir = document.getElementById("despesaExcluirEscopo");

function obterPeriodoMes(data = mesSelecionado) {
    return {
        inicio: new Date(data.getFullYear(), data.getMonth(), 1),
        fim: new Date(data.getFullYear(), data.getMonth() + 1, 0)
    };
}

function mesAtual() {
    const hoje = new Date();
    return new Date(hoje.getFullYear(), hoje.getMonth(), 1);
}

function mesLimiteFuturo() {
    const atual = mesAtual();
    return new Date(atual.getFullYear(), atual.getMonth() + 36, 1);
}

function formatarMes(data) {
    const texto = data.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
    return texto.charAt(0).toUpperCase() + texto.slice(1);
}

function moeda(valor) {
    return `R$ ${formatarMoeda(Number(valor || 0))}`;
}

function atualizarNavegacaoMes() {
    if (mesLabel) mesLabel.textContent = formatarMes(mesSelecionado);

    if (btnMesProximo) {
        const bloqueado = mesSelecionado >= mesLimiteFuturo();
        btnMesProximo.disabled = bloqueado;
        btnMesProximo.setAttribute("aria-disabled", String(bloqueado));
    }

    if (btnNova) {
        const futuro = mesSelecionado > mesAtual();
        btnNova.disabled = futuro;
        btnNova.setAttribute("aria-disabled", String(futuro));
        btnNova.title = futuro
            ? "Parcelas futuras são geradas automaticamente a partir de uma despesa parcelada."
            : "";
    }
}

function erroLabel(elemento) {
    elemento?.classList.add("label-erro", "shake");
    setTimeout(() => elemento?.classList.remove("shake"), 500);
    setTimeout(() => elemento?.classList.remove("label-erro"), 3000);
}

function erroInput(elemento) {
    elemento?.classList.add("input-erro", "shake");
    setTimeout(() => elemento?.classList.remove("shake"), 500);
    setTimeout(() => elemento?.classList.remove("input-erro"), 3000);
}

function limparErro(elemento, label) {
    elemento?.classList.remove("input-erro");
    label?.classList.remove("label-erro");
}

function setStatus(texto = "", erro = false) {
    if (!statusEl) return;
    statusEl.textContent = texto;
    statusEl.hidden = !texto;
    statusEl.classList.toggle("error", erro);
}

function dataHoraExibicao(despesa) {
    const data = paraDate(despesa.dataDespesa) || paraDate(despesa.data);
    const registro = paraDate(despesa.createdAt) || data;
    const dia = data
        ? data.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }).replace(".", "")
        : "—";
    const hora = registro
        ? registro.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
        : "—";
    return `${dia} • ${hora}`;
}

function escaparTexto(texto) {
    return String(texto || "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;");
}

function criarCardDespesa(despesa) {
    const card = document.createElement("article");
    card.className = "despesa-item";

    const badgeTipo = despesa.tipo === "barbearia" && podeAdministrarNaVisaoAtual()
        ? '<span class="despesa-tipo-badge">Barbearia</span>'
        : "";
    const badgeParcela = despesa.parcelada === true
        ? `<span class="despesa-parcela-badge">Parcela ${Number(despesa.parcelaNumero || 1)}/${Number(despesa.parcelasTotal || 1)}</span>`
        : "";

    card.innerHTML = `
        <div class="despesa-item-main">
            <div class="despesa-item-copy">
                <div class="despesa-item-title-row">
                    <strong>${escaparTexto(despesa.descricao || despesa.categoria || "Despesa")}</strong>
                    ${badgeTipo}
                    ${badgeParcela}
                </div>
                <span>${dataHoraExibicao(despesa)} • ${escaparTexto(despesa.categoria || "Outros")}</span>
            </div>
            <strong class="despesa-item-valor">${moeda(despesa.valor)}</strong>
        </div>
        <div class="despesa-item-acoes">
            <button type="button" class="despesa-editar"><i class="fas fa-pen"></i><span>Editar</span></button>
            <button type="button" class="despesa-item-excluir"><i class="fas fa-trash"></i><span>Excluir</span></button>
        </div>
    `;

    card.querySelector(".despesa-editar")?.addEventListener("click", () => abrirModalDespesa(despesa));
    card.querySelector(".despesa-item-excluir")?.addEventListener("click", () => abrirExclusaoDespesa(despesa));
    return card;
}

function renderizarDespesas() {
    if (!listaEl) return;
    listaEl.innerHTML = "";

    const total = despesasMes.reduce((soma, item) => soma + Number(item.valor || 0), 0);
    if (totalEl) totalEl.textContent = moeda(total);
    if (quantidadeEl) {
        quantidadeEl.textContent = despesasMes.length === 1
            ? "1 lançamento"
            : `${despesasMes.length} lançamentos`;
    }

    if (!despesasMes.length) {
        listaEl.innerHTML = '<div class="despesas-vazio"><i class="fas fa-receipt"></i><strong>Nenhuma despesa neste mês</strong><span>Lance custos à vista ou consulte aqui as parcelas que vencem neste período.</span></div>';
        return;
    }

    despesasMes.forEach((despesa) => listaEl.appendChild(criarCardDespesa(despesa)));
}

export async function carregarDespesasMes() {
    atualizarNavegacaoMes();
    listaEl?.classList.add("carregando");
    const loading = iniciarLoadingTela("Carregando despesas...", { delay: 320 });

    try {
        const { inicio, fim } = obterPeriodoMes();
        despesasMes = await listarDespesasPorPeriodo(inicio, fim, {
            incluirBarbearia: podeAdministrarNaVisaoAtual()
        });

        if (podeAdministrarNaVisaoAtual()) {
            despesasMes = despesasMes.filter((item) =>
                item.tipo === "barbearia" || item.profissionalUid === state.user?.uid
            );
        }

        renderizarDespesas();
        return despesasMes;
    } catch (error) {
        console.error(error);
        despesasMes = [];
        renderizarDespesas();
        mostrarErro("Não foi possível carregar as despesas.");
        return [];
    } finally {
        finalizarLoadingTela(loading);
        listaEl?.classList.remove("carregando");
    }
}

export async function abrirDespesasAtual() {
    await carregarDespesasMes();
}

function limitesMesParaModal({ permitirFuturo = false } = {}) {
    const { inicio, fim } = obterPeriodoMes();
    const hoje = inicioDoDia(new Date());
    const max = permitirFuturo ? fim : (fim > hoje ? hoje : fim);
    return { min: chaveData(inicio), max: chaveData(max), inicio, fim: max };
}

function dataPadraoNovoLancamento() {
    const { inicio, fim } = limitesMesParaModal();
    const hoje = inicioDoDia(new Date());
    return hoje >= inicio && hoje <= fim ? hoje : fim;
}

function edicaoPermiteDataFutura(despesa = despesaEmEdicao) {
    if (!despesa) return false;
    const data = paraDate(despesa.dataDespesa) || paraDate(despesa.data);
    return Boolean(data && inicioDoDia(data) > inicioDoDia(new Date()));
}

function combinarDataComHora(data, horaReferencia = new Date()) {
    const resultado = new Date(data);
    resultado.setHours(
        horaReferencia.getHours(),
        horaReferencia.getMinutes(),
        horaReferencia.getSeconds(),
        0
    );
    return resultado;
}

function dataParcela(base, deslocamentoMeses) {
    const origem = new Date(base);
    const diaOriginal = origem.getDate();
    const primeiroDoMes = new Date(origem.getFullYear(), origem.getMonth() + deslocamentoMeses, 1);
    const ultimoDia = new Date(primeiroDoMes.getFullYear(), primeiroDoMes.getMonth() + 1, 0).getDate();
    const resultado = new Date(
        primeiroDoMes.getFullYear(),
        primeiroDoMes.getMonth(),
        Math.min(diaOriginal, ultimoDia)
    );
    resultado.setHours(origem.getHours(), origem.getMinutes(), origem.getSeconds(), 0);
    return resultado;
}

function calcularParcelas(valorTotal, quantidade, dataInicial) {
    const totalCentavos = Math.round(Number(valorTotal || 0) * 100);
    const qtd = Math.max(2, Math.min(36, Number(quantidade || 0)));
    if (!Number.isFinite(totalCentavos) || totalCentavos <= 0 || !dataInicial || qtd < 2) return [];

    const base = Math.floor(totalCentavos / qtd);
    const resto = totalCentavos - (base * qtd);

    return Array.from({ length: qtd }, (_, indice) => ({
        numero: indice + 1,
        data: dataParcela(dataInicial, indice),
        valor: (base + (indice === qtd - 1 ? resto : 0)) / 100
    }));
}

function formatarDataCurta(data) {
    return data.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

function atualizarPreviewParcelas() {
    if (!previewParcelas) return;

    if (modoDespesa !== "parcelada" || despesaEmEdicao) {
        previewParcelas.hidden = true;
        previewParcelas.innerHTML = "";
        return;
    }

    const valor = converterParaNumero(inputValor?.value);
    const quantidade = Number(inputParcelas?.value || 0);
    const dataBase = dataDeInput(inputData?.value);
    const parcelas = calcularParcelas(valor, quantidade, dataBase);

    if (!parcelas.length) {
        previewParcelas.hidden = true;
        previewParcelas.innerHTML = "";
        return;
    }

    const primeira = parcelas[0];
    const ultima = parcelas.at(-1);
    const valorPadrao = primeira.valor;
    const ultimaDiferente = Math.abs(ultima.valor - valorPadrao) > 0.001;

    previewParcelas.innerHTML = `
        <div class="despesa-parcelas-resumo">
            <strong>${parcelas.length}x de ${moeda(valorPadrao)}${ultimaDiferente ? ` • última ${moeda(ultima.valor)}` : ""}</strong>
            <span>${formatarDataCurta(primeira.data)} → ${formatarDataCurta(ultima.data)}</span>
        </div>
        <div class="despesa-parcelas-lista">
            ${parcelas.map((parcela) => `
                <div><span>${parcela.numero}/${parcelas.length} • ${formatarDataCurta(parcela.data)}</span><strong>${moeda(parcela.valor)}</strong></div>
            `).join("")}
        </div>
    `;
    previewParcelas.hidden = false;
}

function selecionarModoDespesa(novoModo) {
    modoDespesa = novoModo === "parcelada" ? "parcelada" : "avista";
    const parcelada = modoDespesa === "parcelada";

    btnAVista?.classList.toggle("active", !parcelada);
    btnAVista?.setAttribute("aria-pressed", String(!parcelada));
    btnParcelada?.classList.toggle("active", parcelada);
    btnParcelada?.setAttribute("aria-pressed", String(parcelada));

    if (parcelasField) parcelasField.hidden = !parcelada || Boolean(despesaEmEdicao);
    if (labels.valor) labels.valor.textContent = parcelada && !despesaEmEdicao ? "Valor total" : (despesaEmEdicao?.parcelada ? "Valor da parcela" : "Valor");
    atualizarPreviewParcelas();
}

function abrirModalDespesa(despesa = null) {
    despesaEmEdicao = despesa;
    form?.reset();
    setStatus();

    const admin = podeAdministrarNaVisaoAtual();
    const editandoParcela = despesa?.parcelada === true;

    if (tipoField) tipoField.hidden = !admin;
    if (inputTipo) inputTipo.disabled = !admin || editandoParcela;
    if (formaField) formaField.hidden = Boolean(despesa);
    if (edicaoParcelamentoInfo) edicaoParcelamentoInfo.hidden = !editandoParcela;

    const limites = limitesMesParaModal({ permitirFuturo: edicaoPermiteDataFutura(despesa) });
    if (inputData) {
        inputData.min = limites.min;
        inputData.max = limites.max;
    }

    if (despesa) {
        if (tituloModal) tituloModal.textContent = "Editar despesa";
        if (subtituloModal) subtituloModal.textContent = editandoParcela
            ? "A alteração afeta somente esta parcela."
            : "Altere somente os dados deste lançamento.";

        const data = paraDate(despesa.dataDespesa) || paraDate(despesa.data) || dataPadraoNovoLancamento();
        if (inputData) inputData.value = chaveData(data);
        if (inputCategoria) inputCategoria.value = despesa.categoria || "Outros";
        if (inputDescricao) inputDescricao.value = despesa.descricao || "";
        if (inputValor) inputValor.value = formatarMoeda(Number(despesa.valor || 0));
        if (inputTipo) inputTipo.value = admin && despesa.tipo === "barbearia" ? "barbearia" : "profissional";
        if (btnSalvar) btnSalvar.textContent = "Salvar alterações";

        if (editandoParcela && edicaoParcelamentoInfo) {
            edicaoParcelamentoInfo.innerHTML = `
                <i class="fas fa-layer-group"></i>
                <span>Parcela <strong>${Number(despesa.parcelaNumero || 1)}/${Number(despesa.parcelasTotal || 1)}</strong> • compra original ${moeda(despesa.valorTotalParcelamento || 0)}</span>
            `;
        }
        selecionarModoDespesa("avista");
    } else {
        if (tituloModal) tituloModal.textContent = "Nova despesa";
        if (subtituloModal) subtituloModal.textContent = "Registre um custo à vista ou distribua o valor em parcelas mensais.";
        if (inputData) inputData.value = chaveData(dataPadraoNovoLancamento());
        if (inputCategoria) inputCategoria.value = "Material";
        if (inputTipo) inputTipo.value = "profissional";
        if (inputParcelas) inputParcelas.value = "2";
        if (btnSalvar) btnSalvar.textContent = "Registrar despesa";
        selecionarModoDespesa("avista");
    }

    if (modal) modal.hidden = false;
    document.body.classList.add("modal-equipe-aberto");
    setTimeout(() => inputDescricao?.focus(), 0);
}

function fecharModalDespesa({ forcar = false } = {}) {
    if (btnSalvar?.disabled && !forcar) return;
    if (modal) modal.hidden = true;
    document.body.classList.remove("modal-equipe-aberto");
    despesaEmEdicao = null;
    setStatus();
    if (previewParcelas) previewParcelas.hidden = true;
}

async function salvarDespesa(event) {
    event.preventDefault();
    setStatus();

    const dataBase = dataDeInput(inputData?.value);
    const valor = converterParaNumero(inputValor?.value);
    const descricao = String(inputDescricao?.value || "").trim();
    const categoria = String(inputCategoria?.value || "");
    const tipo = podeAdministrarNaVisaoAtual()
        ? (inputTipo?.value || "profissional")
        : "profissional";
    const quantidadeParcelas = Number(inputParcelas?.value || 0);
    const parcelada = !despesaEmEdicao && modoDespesa === "parcelada";
    let erro = false;

    const limites = limitesMesParaModal({ permitirFuturo: edicaoPermiteDataFutura(despesaEmEdicao) });
    if (!dataBase || dataBase < inicioDoDia(limites.inicio) || dataBase > inicioDoDia(limites.fim)) {
        erroLabel(labels.data);
        erroInput(inputData);
        erro = true;
    }
    if (!categoria) {
        erroLabel(labels.categoria);
        erroInput(inputCategoria);
        erro = true;
    }
    if (!descricao) {
        erroLabel(labels.descricao);
        erroInput(inputDescricao);
        erro = true;
    }
    if (!Number.isFinite(valor) || valor <= 0) {
        erroLabel(labels.valor);
        erroInput(inputValor);
        erro = true;
    }
    if (parcelada && (!Number.isInteger(quantidadeParcelas) || quantidadeParcelas < 2 || quantidadeParcelas > 36)) {
        erroLabel(labels.parcelas);
        erroInput(inputParcelas);
        erro = true;
    }
    if (erro) return;

    const originalData = despesaEmEdicao
        ? (paraDate(despesaEmEdicao.dataDespesa) || paraDate(despesaEmEdicao.data))
        : null;
    const data = combinarDataComHora(dataBase, originalData || new Date());

    iniciarAcaoBotao(
        btnSalvar,
        despesaEmEdicao ? "Salvando..." : (parcelada ? "Gerando parcelas..." : "Registrando...")
    );

    try {
        if (despesaEmEdicao) {
            const tipoFinal = despesaEmEdicao.parcelada === true
                ? despesaEmEdicao.tipo
                : (podeAdministrarNaVisaoAtual() ? tipo : "profissional");
            const alteracoes = {
                data: data.toISOString(),
                dataDespesa: Timestamp.fromDate(data),
                categoria,
                descricao: descricao.slice(0, 120),
                valor: Number(valor.toFixed(2)),
                tipo: tipoFinal
            };

            if (podeAdministrarNaVisaoAtual() && tipoFinal === "barbearia") {
                alteracoes.profissionalUid = null;
                alteracoes.profissionalNome = "Barbearia";
            } else if (tipoFinal === "profissional" && !despesaEmEdicao.profissionalUid) {
                alteracoes.profissionalUid = state.user?.uid || null;
                alteracoes.profissionalNome = String(
                    state.perfilUsuario?.nome ||
                    state.membroAtual?.nome ||
                    state.user?.email ||
                    "Administrador"
                );
            }

            await editarDespesa(despesaEmEdicao.id, alteracoes, despesaEmEdicao);
            mostrarSucesso(despesaEmEdicao.parcelada ? "Parcela atualizada." : "Despesa atualizada.");
        } else if (parcelada) {
            const parcelas = calcularParcelas(valor, quantidadeParcelas, data);
            await criarDespesaParcelada({
                parcelas,
                categoria,
                descricao,
                valorTotal: valor,
                tipo
            });
            mostrarSucesso(`${quantidadeParcelas} parcelas registradas.`);
        } else {
            await criarDespesa({ data, categoria, descricao, valor, tipo });
            mostrarSucesso("Despesa registrada.");
        }

        await concluirAcaoBotao(
            btnSalvar,
            despesaEmEdicao ? "Alteração salva ✓" : (parcelada ? "Parcelas registradas ✓" : "Despesa registrada ✓"),
            720
        );

        fecharModalDespesa({ forcar: true });
        await carregarDespesasMes();
    } catch (error) {
        console.error(error);
        restaurarAcaoBotao(btnSalvar);
        mostrarErro(error?.message || "Não foi possível salvar a despesa.");
    } finally {
        restaurarAcaoBotao(btnSalvar);
    }
}

function abrirExclusaoDespesa(despesa) {
    despesaParaExcluir = despesa;
    const parcelada = despesa?.parcelada === true;

    if (descricaoExcluir) {
        descricaoExcluir.textContent = parcelada
            ? `Excluir a parcela ${Number(despesa.parcelaNumero || 1)}/${Number(despesa.parcelasTotal || 1)} de “${despesa.descricao || despesa.categoria || "Despesa"}”?`
            : `Excluir “${despesa.descricao || despesa.categoria || "Despesa"}” no valor de ${moeda(despesa.valor)}?`;
    }

    if (escopoExcluir) {
        escopoExcluir.hidden = !parcelada;
        const somente = escopoExcluir.querySelector('input[value="somente"]');
        if (somente) somente.checked = true;
    }

    modalExcluir?.classList.add("active");
    modalExcluir?.setAttribute("aria-hidden", "false");
}

function fecharExclusaoDespesa() {
    despesaParaExcluir = null;
    modalExcluir?.classList.remove("active");
    modalExcluir?.setAttribute("aria-hidden", "true");
    if (escopoExcluir) escopoExcluir.hidden = true;
}

async function confirmarExclusaoDespesa() {
    if (!despesaParaExcluir?.id) return;

    const despesa = despesaParaExcluir;
    const incluirProximas = despesa.parcelada === true &&
        escopoExcluir?.querySelector('input[name="despesaExcluirOpcao"]:checked')?.value === "proximas";

    iniciarAcaoBotao(btnConfirmarExcluir, "Excluindo despesa...");

    try {
        const resultado = await excluirDespesaParcelada(despesa, { incluirProximas });
        const idsRemovidos = new Set();

        if (incluirProximas && despesa.parcelamentoId) {
            despesasMes.forEach((item) => {
                if (
                    item.parcelamentoId === despesa.parcelamentoId &&
                    Number(item.parcelaNumero || 0) >= Number(despesa.parcelaNumero || 0)
                ) idsRemovidos.add(item.id);
            });
        } else {
            idsRemovidos.add(despesa.id);
        }

        despesasMes = despesasMes.filter((item) => !idsRemovidos.has(item.id));
        renderizarDespesas();
        await concluirAcaoBotao(btnConfirmarExcluir, "Despesa excluída ✓", 460);
        mostrarSucesso(
            incluirProximas
                ? `${resultado.quantidade} parcela${resultado.quantidade === 1 ? "" : "s"} excluída${resultado.quantidade === 1 ? "" : "s"}.`
                : (despesa.parcelada ? "Parcela excluída." : "Despesa excluída.")
        );
        fecharExclusaoDespesa();
    } catch (error) {
        restaurarAcaoBotao(btnConfirmarExcluir);
        console.error(error);
        mostrarErro("Não foi possível excluir a despesa.");
    } finally {
        restaurarAcaoBotao(btnConfirmarExcluir);
    }
}

export function initDespesas() {
    if (inicializado) return;
    inicializado = true;

    inputValor?.addEventListener("input", () => {
        aplicarMascaraMoedaInput(inputValor, 9);
        limparErro(inputValor, labels.valor);
        atualizarPreviewParcelas();
    });
    inputDescricao?.addEventListener("input", () => limparErro(inputDescricao, labels.descricao));
    inputCategoria?.addEventListener("change", () => limparErro(inputCategoria, labels.categoria));
    inputData?.addEventListener("change", () => {
        limparErro(inputData, labels.data);
        atualizarPreviewParcelas();
    });
    inputParcelas?.addEventListener("input", () => {
        limparErro(inputParcelas, labels.parcelas);
        atualizarPreviewParcelas();
    });

    btnAVista?.addEventListener("click", () => selecionarModoDespesa("avista"));
    btnParcelada?.addEventListener("click", () => selecionarModoDespesa("parcelada"));

    btnCalendario?.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        abrirSeletorData(inputData);
    });

    btnMesAnterior?.addEventListener("click", async () => {
        mesSelecionado = new Date(mesSelecionado.getFullYear(), mesSelecionado.getMonth() - 1, 1);
        await carregarDespesasMes();
    });

    btnMesProximo?.addEventListener("click", async () => {
        const proximo = new Date(mesSelecionado.getFullYear(), mesSelecionado.getMonth() + 1, 1);
        if (proximo > mesLimiteFuturo()) return;
        mesSelecionado = proximo;
        await carregarDespesasMes();
    });

    btnNova?.addEventListener("click", () => {
        if (mesSelecionado > mesAtual()) return;
        abrirModalDespesa();
    });
    btnFecharModal?.addEventListener("click", () => fecharModalDespesa());
    form?.addEventListener("submit", salvarDespesa);
    modal?.addEventListener("click", (event) => {
        if (event.target === modal) fecharModalDespesa();
    });

    btnCancelarExcluir?.addEventListener("click", fecharExclusaoDespesa);
    btnConfirmarExcluir?.addEventListener("click", confirmarExclusaoDespesa);
    modalExcluir?.addEventListener("click", (event) => {
        if (event.target === modalExcluir) fecharExclusaoDespesa();
    });

    atualizarNavegacaoMes();
}
