import { Timestamp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

import {
    criarDespesa,
    editarDespesa,
    excluirDespesa,
    listarDespesasPorPeriodo
} from "./data/despesas-repository.js?v=6.1";
import { usuarioEhAdmin } from "./permissoes.js?v=6.1";
import { state } from "./state.js?v=6.1";
import { converterParaNumero, aplicarMascaraMoedaInput, formatarMoeda } from "./utils/money.js?v=6.1";
import { chaveData, dataDeInput, inicioDoDia } from "./utils/date.js?v=6.1";
import { mostrarErro, mostrarSucesso } from "./services/feedback-service.js?v=6.1";

let inicializado = false;
let mesSelecionado = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
let despesasMes = [];
let despesaEmEdicao = null;

const btnMesAnterior = document.getElementById("btnDespesaMesAnterior");
const btnMesProximo = document.getElementById("btnDespesaMesProximo");
const mesLabel = document.getElementById("despesasMesLabel");
const totalEl = document.getElementById("despesasTotal");
const quantidadeEl = document.getElementById("despesasQuantidade");
const listaEl = document.getElementById("despesasLista");
const btnNova = document.getElementById("btnNovaDespesa");

const modal = document.getElementById("modalDespesa");
const tituloModal = document.getElementById("tituloModalDespesa");
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

function obterPeriodoMes(data = mesSelecionado) {
    const inicio = new Date(data.getFullYear(), data.getMonth(), 1);
    const fim = new Date(data.getFullYear(), data.getMonth() + 1, 0);
    return { inicio, fim };
}

function formatarMes(data) {
    const texto = data.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
    return texto.charAt(0).toUpperCase() + texto.slice(1);
}

function moeda(valor) {
    return `R$ ${formatarMoeda(Number(valor || 0))}`;
}

function paraDate(valor) {
    if (!valor) return null;
    if (typeof valor?.toDate === "function") return valor.toDate();
    const data = new Date(valor);
    return Number.isNaN(data.getTime()) ? null : data;
}

function atualizarNavegacaoMes() {
    if (mesLabel) mesLabel.textContent = formatarMes(mesSelecionado);

    if (btnMesProximo) {
        const hoje = new Date();
        const mesAtual = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
        const noMesAtual = mesSelecionado.getTime() >= mesAtual.getTime();
        btnMesProximo.disabled = noMesAtual;
        btnMesProximo.setAttribute("aria-disabled", String(noMesAtual));
    }
}

function criarCardDespesa(despesa) {
    const card = document.createElement("article");
    card.className = "despesa-item";

    const topo = document.createElement("div");
    topo.className = "despesa-item-topo";

    const info = document.createElement("div");
    info.className = "despesa-item-info";

    const titulo = document.createElement("strong");
    titulo.textContent = despesa.descricao || despesa.categoria || "Despesa";

    const meta = document.createElement("span");
    const data = paraDate(despesa.dataDespesa) || paraDate(despesa.data);
    const dataTexto = data
        ? data.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }).replace(".", "")
        : "—";
    const tipoTexto = despesa.tipo === "barbearia" ? "Barbearia" : despesa.categoria || "Profissional";
    meta.textContent = `${dataTexto} • ${tipoTexto}`;

    info.append(titulo, meta);

    const valor = document.createElement("strong");
    valor.className = "despesa-item-valor";
    valor.textContent = moeda(despesa.valor);

    topo.append(info, valor);
    card.appendChild(topo);

    const rodape = document.createElement("div");
    rodape.className = "despesa-item-acoes";

    const editar = document.createElement("button");
    editar.type = "button";
    editar.innerHTML = '<i class="fas fa-pen"></i><span>Editar</span>';
    editar.addEventListener("click", () => abrirModalDespesa(despesa));

    const excluir = document.createElement("button");
    excluir.type = "button";
    excluir.className = "despesa-item-excluir";
    excluir.innerHTML = '<i class="fas fa-trash"></i><span>Excluir</span>';
    excluir.addEventListener("click", () => removerDespesa(despesa));

    rodape.append(editar, excluir);
    card.appendChild(rodape);
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
        const vazio = document.createElement("div");
        vazio.className = "despesas-vazio";
        vazio.innerHTML = '<i class="fas fa-receipt"></i><strong>Nenhuma despesa neste mês</strong><span>Use “Lançar despesa” quando comprar material ou tiver outro custo profissional.</span>';
        listaEl.appendChild(vazio);
        return;
    }

    despesasMes.forEach((despesa) => listaEl.appendChild(criarCardDespesa(despesa)));
}

export async function carregarDespesasMes({ forcar = false } = {}) {
    atualizarNavegacaoMes();
    if (listaEl) listaEl.classList.add("carregando");

    try {
        const { inicio, fim } = obterPeriodoMes();
        despesasMes = await listarDespesasPorPeriodo(inicio, fim, {
            incluirBarbearia: usuarioEhAdmin()
        });

        if (usuarioEhAdmin()) {
            despesasMes = despesasMes.filter((item) =>
                item.tipo === "barbearia" || item.profissionalUid === state.user?.uid
            );
        }
        renderizarDespesas();
        return despesasMes;
    } catch (error) {
        console.error("Erro ao carregar despesas:", error);
        despesasMes = [];
        renderizarDespesas();
        mostrarErro("Não foi possível carregar as despesas.");
        return [];
    } finally {
        if (listaEl) listaEl.classList.remove("carregando");
    }
}

export async function abrirDespesasAtual() {
    await carregarDespesasMes({ forcar: true });
}

function setStatus(texto = "", erro = false) {
    if (!statusEl) return;
    statusEl.textContent = texto;
    statusEl.hidden = !texto;
    statusEl.classList.toggle("error", Boolean(erro));
}

function abrirModalDespesa(despesa = null) {
    despesaEmEdicao = despesa;
    form?.reset();
    setStatus();

    const admin = usuarioEhAdmin();
    if (tipoField) tipoField.hidden = !admin;

    if (despesa) {
        if (tituloModal) tituloModal.textContent = "Editar despesa";
        const data = paraDate(despesa.dataDespesa) || paraDate(despesa.data) || new Date();
        if (inputData) inputData.value = chaveData(data);
        if (inputCategoria) inputCategoria.value = despesa.categoria || "Outros";
        if (inputDescricao) inputDescricao.value = despesa.descricao || "";
        if (inputValor) inputValor.value = formatarMoeda(Number(despesa.valor || 0));
        if (inputTipo) inputTipo.value = admin && despesa.tipo === "barbearia" ? "barbearia" : "profissional";
        if (btnSalvar) btnSalvar.textContent = "Salvar alterações";
    } else {
        if (tituloModal) tituloModal.textContent = "Nova despesa";
        if (inputData) inputData.value = chaveData(new Date());
        if (inputCategoria) inputCategoria.value = "Material";
        if (inputTipo) inputTipo.value = "profissional";
        if (btnSalvar) btnSalvar.textContent = "Registrar despesa";
    }

    if (inputData) inputData.max = chaveData(new Date());
    if (modal) modal.hidden = false;
    document.body.classList.add("modal-equipe-aberto");
    setTimeout(() => inputDescricao?.focus(), 0);
}

function fecharModalDespesa() {
    if (btnSalvar?.disabled) return;
    if (modal) modal.hidden = true;
    document.body.classList.remove("modal-equipe-aberto");
    despesaEmEdicao = null;
    setStatus();
}

async function salvarDespesa(event) {
    event.preventDefault();

    const data = dataDeInput(inputData?.value);
    const valor = converterParaNumero(inputValor?.value);
    const descricao = String(inputDescricao?.value || "").trim();
    const categoria = String(inputCategoria?.value || "Outros");
    const tipo = usuarioEhAdmin() ? (inputTipo?.value || "profissional") : "profissional";

    if (!data || data > inicioDoDia(new Date())) {
        setStatus("Informe uma data válida, sem usar uma data futura.", true);
        return;
    }

    if (!descricao) {
        setStatus("Informe uma descrição para a despesa.", true);
        inputDescricao?.focus();
        return;
    }

    if (!Number.isFinite(valor) || valor <= 0) {
        setStatus("Informe um valor maior que zero.", true);
        inputValor?.focus();
        return;
    }

    if (btnSalvar) {
        btnSalvar.disabled = true;
        btnSalvar.textContent = despesaEmEdicao ? "Salvando..." : "Registrando...";
    }

    try {
        if (despesaEmEdicao) {
            // Não troca o responsável histórico da despesa ao editar.
            const tipoFinal = usuarioEhAdmin() ? tipo : "profissional";
            const alteracoes = {
                data: data.toISOString(),
                dataDespesa: Timestamp.fromDate(data),
                categoria,
                descricao: descricao.slice(0, 120),
                valor: Number(valor.toFixed(2)),
                tipo: tipoFinal
            };

            // Se um admin transformar uma despesa própria em despesa da barbearia,
            // o relatório deixa de atribuí-la ao profissional.
            if (usuarioEhAdmin() && tipoFinal === "barbearia") {
                alteracoes.profissionalUid = null;
                alteracoes.profissionalNome = "Barbearia";
            } else if (usuarioEhAdmin() && tipoFinal === "profissional" && !despesaEmEdicao.profissionalUid) {
                alteracoes.profissionalUid = state.user?.uid || null;
                alteracoes.profissionalNome = String(state.perfilUsuario?.nome || state.membroAtual?.nome || state.user?.email || "Administrador");
            }

            await editarDespesa(despesaEmEdicao.id, alteracoes);
            mostrarSucesso("Despesa atualizada.");
        } else {
            await criarDespesa({ data, categoria, descricao, valor, tipo });
            mostrarSucesso("Despesa registrada.");
        }

        mesSelecionado = new Date(data.getFullYear(), data.getMonth(), 1);
        fecharModalDespesa();
        await carregarDespesasMes({ forcar: true });
    } catch (error) {
        console.error("Erro ao salvar despesa:", error);
        setStatus(error?.message || "Não foi possível salvar a despesa.", true);
    } finally {
        if (btnSalvar) {
            btnSalvar.disabled = false;
            btnSalvar.textContent = despesaEmEdicao ? "Salvar alterações" : "Registrar despesa";
        }
    }
}

async function removerDespesa(despesa) {
    const nome = despesa.descricao || despesa.categoria || "esta despesa";
    if (!window.confirm(`Excluir ${nome}? Esta ação não poderá ser desfeita.`)) return;

    try {
        await excluirDespesa(despesa.id);
        despesasMes = despesasMes.filter((item) => item.id !== despesa.id);
        renderizarDespesas();
        mostrarSucesso("Despesa excluída.");
    } catch (error) {
        console.error("Erro ao excluir despesa:", error);
        mostrarErro("Não foi possível excluir a despesa.");
    }
}

export function initDespesas() {
    if (inicializado) return;
    inicializado = true;

    inputValor?.addEventListener("input", () => aplicarMascaraMoedaInput(inputValor, 9));

    btnMesAnterior?.addEventListener("click", async () => {
        mesSelecionado = new Date(mesSelecionado.getFullYear(), mesSelecionado.getMonth() - 1, 1);
        await carregarDespesasMes({ forcar: true });
    });

    btnMesProximo?.addEventListener("click", async () => {
        const proximo = new Date(mesSelecionado.getFullYear(), mesSelecionado.getMonth() + 1, 1);
        const hoje = new Date();
        const atual = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
        if (proximo > atual) return;
        mesSelecionado = proximo;
        await carregarDespesasMes({ forcar: true });
    });

    btnNova?.addEventListener("click", () => abrirModalDespesa());
    btnFecharModal?.addEventListener("click", fecharModalDespesa);
    form?.addEventListener("submit", salvarDespesa);
    modal?.addEventListener("click", (event) => {
        if (event.target === modal) fecharModalDespesa();
    });

    atualizarNavegacaoMes();
}
