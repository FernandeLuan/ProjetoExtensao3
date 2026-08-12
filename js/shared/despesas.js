import { Timestamp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { criarDespesa, criarDespesaParcelada, editarDespesa, excluirDespesaParcelada, listarDespesasPorPeriodo } from "./data/despesas-repository.js?v=11.0";
import { podeAdministrarNaVisaoAtual } from "./permissoes.js?v=11.0";
import { state } from "./state.js?v=11.0";
import { converterParaNumero, aplicarMascaraMoedaInput, formatarMoeda } from "./utils/money.js?v=11.0";
import { chaveData, dataDeInput, inicioDoDia, paraDate } from "./utils/date.js?v=11.0";
import { abrirCalendarioPopover } from "./services/calendario-popover.js?v=11.0";
import { mostrarErro, mostrarSucesso } from "./services/feedback-service.js?v=11.0";
import { iniciarAcaoBotao, concluirAcaoBotao, restaurarAcaoBotao } from "./services/ui-loading-service.js?v=11.0";

let inicializado = false;
let mesSelecionado = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
let despesasMes = [];
let despesaEmEdicao = null;
let despesaParaExcluir = null;
let modoDespesa = "avista";
let carregamentoAtual = null;

const $ = (id) => document.getElementById(id);
const btnMesAnterior = $("btnDespesaMesAnterior");
const btnMesProximo = $("btnDespesaMesProximo");
const btnCalendarioMes = $("btnCalendarioDespesasMes");
const mesLabel = $("despesasMesLabel");
const totalEl = $("despesasTotal");
const quantidadeEl = $("despesasQuantidade");
const listaEl = $("despesasLista");
const btnNova = $("btnNovaDespesa");
const modal = $("modalDespesa");
const tituloModal = $("tituloModalDespesa");
const subtituloModal = $("subtituloModalDespesa");
const btnFecharModal = $("btnFecharModalDespesa");
const form = $("formDespesa");
const inputData = $("despesaData");
const inputCategoria = $("despesaCategoria");
const inputDescricao = $("despesaDescricao");
const inputValor = $("despesaValor");
const statusEl = $("despesaStatus");
const btnSalvar = $("btnSalvarDespesa");
const btnCalendario = $("btnCalendarioDespesa");
const formaField = $("despesaFormaField");
const btnAVista = $("btnDespesaAVista");
const btnParcelada = $("btnDespesaParcelada");
const parcelasField = $("despesaParcelasField");
const inputParcelas = $("despesaParcelas");
const previewParcelas = $("despesaParcelasPreview");
const edicaoParcelamentoInfo = $("despesaEdicaoParcelamentoInfo");
const modalExcluir = $("modalConfirmDespesa");
const descricaoExcluir = $("modalDescricaoDespesa");
const btnCancelarExcluir = $("btnCancelarDespesa");
const btnConfirmarExcluir = $("btnConfirmarDespesa");
const escopoExcluir = $("despesaExcluirEscopo");

const labels = {
    data: $("labelDespesaData"), categoria: $("labelDespesaCategoria"), descricao: $("labelDespesaDescricao"),
    valor: $("labelDespesaValor"), parcelas: $("labelDespesaParcelas")
};

function mesAtual() { const hoje = new Date(); return new Date(hoje.getFullYear(), hoje.getMonth(), 1); }
function tipoDaArea() { return podeAdministrarNaVisaoAtual() ? "barbearia" : "profissional"; }
function obterPeriodoMes(data = mesSelecionado) { return { inicio: new Date(data.getFullYear(), data.getMonth(), 1), fim: new Date(data.getFullYear(), data.getMonth() + 1, 0) }; }
function formatarMes(data) { const texto = data.toLocaleDateString("pt-BR", { month: "long", year: "numeric" }); return texto.charAt(0).toUpperCase() + texto.slice(1); }
function moeda(valor) { return `R$ ${formatarMoeda(Number(valor || 0))}`; }

function atualizarNavegacaoMes() {
    if (mesLabel) mesLabel.textContent = formatarMes(mesSelecionado);
    const atual = mesAtual();
    if (btnMesProximo) {
        const bloqueado = mesSelecionado >= atual;
        btnMesProximo.disabled = bloqueado;
        btnMesProximo.setAttribute("aria-disabled", String(bloqueado));
    }
}

function erroLabel(el) { el?.classList.add("label-erro", "shake"); setTimeout(() => el?.classList.remove("shake"), 500); setTimeout(() => el?.classList.remove("label-erro"), 3000); }
function erroInput(el) { el?.classList.add("input-erro", "shake"); setTimeout(() => el?.classList.remove("shake"), 500); setTimeout(() => el?.classList.remove("input-erro"), 3000); }
function limparErro(el, label) { el?.classList.remove("input-erro"); label?.classList.remove("label-erro"); }
function setStatus(texto = "", erro = false) { if (!statusEl) return; statusEl.textContent = texto; statusEl.hidden = !texto; statusEl.classList.toggle("error", erro); }
function escapar(texto) { return String(texto || "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;"); }

function dataHoraExibicao(despesa) {
    const data = paraDate(despesa.dataDespesa) || paraDate(despesa.data);
    const registro = paraDate(despesa.createdAt) || data;
    const dia = data ? data.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }).replace(".", "") : "—";
    const hora = registro ? registro.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "—";
    return `${dia} • ${hora}`;
}

function criarCardDespesa(despesa) {
    const card = document.createElement("article");
    card.className = "despesa-item";
    const badgeParcela = despesa.parcelada === true ? `<span class="despesa-parcela-badge">Parcela ${Number(despesa.parcelaNumero || 1)}/${Number(despesa.parcelasTotal || 1)}</span>` : "";
    card.innerHTML = `<div class="despesa-item-main"><div class="despesa-item-copy"><div class="despesa-item-title-row"><strong>${escapar(despesa.descricao || despesa.categoria || "Despesa")}</strong>${badgeParcela}</div><span>${dataHoraExibicao(despesa)} • ${escapar(despesa.categoria || "Outros")}</span></div><strong class="despesa-item-valor">${moeda(despesa.valor)}</strong></div><div class="despesa-item-acoes"><button type="button" class="despesa-editar"><i class="fas fa-pen"></i><span>Editar</span></button><button type="button" class="despesa-item-excluir"><i class="fas fa-trash"></i><span>Excluir</span></button></div>`;
    card.querySelector(".despesa-editar")?.addEventListener("click", () => abrirModalDespesa(despesa));
    card.querySelector(".despesa-item-excluir")?.addEventListener("click", () => abrirExclusaoDespesa(despesa));
    return card;
}

function renderizarDespesas({ carregando = false } = {}) {
    if (!listaEl) return;
    listaEl.innerHTML = "";
    const total = despesasMes.reduce((soma, item) => soma + Number(item.valor || 0), 0);
    if (totalEl) totalEl.textContent = moeda(total);
    if (quantidadeEl) quantidadeEl.textContent = despesasMes.length === 1 ? "1 lançamento" : `${despesasMes.length} lançamentos`;
    if (despesasMes.length) {
        despesasMes.forEach((despesa) => listaEl.appendChild(criarCardDespesa(despesa)));
        if (carregando) listaEl.insertAdjacentHTML("afterbegin", '<div class="despesas-sync-inline"><span class="ui-button-spinner"></span> Atualizando lançamentos...</div>');
        return;
    }
    if (carregando) {
        listaEl.innerHTML = '<div class="despesas-vazio is-loading"><span class="ui-button-spinner"></span><strong>Buscando lançamentos...</strong><span>Você pode continuar navegando enquanto os dados chegam.</span></div>';
        return;
    }
    listaEl.innerHTML = '<div class="despesas-vazio"><i class="fas fa-receipt"></i><strong>Nenhuma despesa neste mês</strong><span>Os lançamentos deste período aparecerão aqui.</span></div>';
}

export async function carregarDespesasMes({ forcar = false } = {}) {
    atualizarNavegacaoMes();
    const { inicio, fim } = obterPeriodoMes();
    const chaveConsulta = `${tipoDaArea()}:${chaveData(inicio)}:${chaveData(fim)}`;
    if (!forcar && carregamentoAtual?.chave === chaveConsulta) return carregamentoAtual.promessa;

    renderizarDespesas({ carregando: true });
    const promessa = (async () => {
        try {
            let lista = await listarDespesasPorPeriodo(inicio, fim, { incluirBarbearia: podeAdministrarNaVisaoAtual(), forcar });
            lista = podeAdministrarNaVisaoAtual()
                ? lista.filter((item) => item.tipo === "barbearia")
                : lista.filter((item) => item.tipo !== "barbearia" && item.profissionalUid === state.user?.uid);

            // Se o usuário mudou de mês enquanto a consulta estava em voo,
            // não deixamos a resposta antiga sobrescrever o mês atual.
            const periodoAtual = obterPeriodoMes();
            const chaveAtual = `${tipoDaArea()}:${chaveData(periodoAtual.inicio)}:${chaveData(periodoAtual.fim)}`;
            if (chaveAtual !== chaveConsulta) return lista;

            despesasMes = lista;
            renderizarDespesas();
            return lista;
        } catch (error) {
            console.error(error);
            const periodoAtual = obterPeriodoMes();
            const chaveAtual = `${tipoDaArea()}:${chaveData(periodoAtual.inicio)}:${chaveData(periodoAtual.fim)}`;
            if (chaveAtual === chaveConsulta) {
                renderizarDespesas();
                mostrarErro("Não foi possível carregar as despesas.");
            }
            return despesasMes;
        }
    })();
    carregamentoAtual = { chave: chaveConsulta, promessa };
    try { return await promessa; } finally { if (carregamentoAtual?.promessa === promessa) carregamentoAtual = null; }
}

export async function abrirDespesasAtual() {
    atualizarNavegacaoMes();
    renderizarDespesas({ carregando: true });
    void carregarDespesasMes().catch((error) => console.error("Falha ao atualizar despesas em segundo plano:", error));
}

function limitesMesParaModal() {
    const { inicio, fim } = obterPeriodoMes();
    const hoje = inicioDoDia(new Date());
    const max = fim > hoje ? hoje : fim;
    return { min: chaveData(inicio), max: chaveData(max), inicio: inicioDoDia(inicio), fim: inicioDoDia(max) };
}
function dataPadraoNovoLancamento() { const { inicio, fim } = limitesMesParaModal(); const hoje = inicioDoDia(new Date()); return hoje >= inicio && hoje <= fim ? hoje : fim; }
function combinarDataComHora(data, horaReferencia = new Date()) { const resultado = new Date(data); resultado.setHours(horaReferencia.getHours(), horaReferencia.getMinutes(), horaReferencia.getSeconds(), 0); return resultado; }
function dataParcela(base, deslocamentoMeses) { const origem = new Date(base); const diaOriginal = origem.getDate(); const primeiro = new Date(origem.getFullYear(), origem.getMonth() + deslocamentoMeses, 1); const ultimo = new Date(primeiro.getFullYear(), primeiro.getMonth() + 1, 0).getDate(); const resultado = new Date(primeiro.getFullYear(), primeiro.getMonth(), Math.min(diaOriginal, ultimo)); resultado.setHours(origem.getHours(), origem.getMinutes(), origem.getSeconds(), 0); return resultado; }
function calcularParcelas(valorTotal, quantidade, dataInicial) { const total = Math.round(Number(valorTotal || 0) * 100); const qtd = Math.max(2, Math.min(36, Number(quantidade || 0))); if (!Number.isFinite(total) || total <= 0 || !dataInicial || qtd < 2) return []; const base = Math.floor(total / qtd); const resto = total - base * qtd; return Array.from({ length: qtd }, (_, indice) => ({ numero: indice + 1, data: dataParcela(dataInicial, indice), valor: (base + (indice === qtd - 1 ? resto : 0)) / 100 })); }
function formatarDataCurta(data) { return data.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" }); }

function atualizarPreviewParcelas() {
    if (!previewParcelas) return;
    if (modoDespesa !== "parcelada" || despesaEmEdicao) { previewParcelas.hidden = true; previewParcelas.innerHTML = ""; return; }
    const parcelas = calcularParcelas(converterParaNumero(inputValor?.value), Number(inputParcelas?.value || 0), dataDeInput(inputData?.value));
    if (!parcelas.length) { previewParcelas.hidden = true; previewParcelas.innerHTML = ""; return; }
    const primeira = parcelas[0], ultima = parcelas.at(-1);
    previewParcelas.innerHTML = `<div class="despesa-parcelas-resumo"><strong>${parcelas.length}x • total ${moeda(parcelas.reduce((s,p)=>s+p.valor,0))}</strong><span>${formatarDataCurta(primeira.data)} → ${formatarDataCurta(ultima.data)}</span></div>`;
    previewParcelas.hidden = false;
}
function selecionarModoDespesa(novoModo) { modoDespesa = novoModo === "parcelada" ? "parcelada" : "avista"; const parcelada = modoDespesa === "parcelada"; btnAVista?.classList.toggle("active", !parcelada); btnAVista?.setAttribute("aria-pressed", String(!parcelada)); btnParcelada?.classList.toggle("active", parcelada); btnParcelada?.setAttribute("aria-pressed", String(parcelada)); if (parcelasField) parcelasField.hidden = !parcelada || Boolean(despesaEmEdicao); if (labels.valor) labels.valor.textContent = parcelada && !despesaEmEdicao ? "Valor total" : (despesaEmEdicao?.parcelada ? "Valor da parcela" : "Valor"); atualizarPreviewParcelas(); }

function abrirModalDespesa(despesa = null) {
    despesaEmEdicao = despesa;
    form?.reset();
    setStatus();
    const editandoParcela = despesa?.parcelada === true;
    if (formaField) formaField.hidden = Boolean(despesa);
    if (edicaoParcelamentoInfo) edicaoParcelamentoInfo.hidden = !editandoParcela;
    const limites = limitesMesParaModal();
    if (inputData) { inputData.min = limites.min; inputData.max = limites.max; inputData.setAttribute("readonly", ""); inputData.setAttribute("inputmode", "none"); }
    if (despesa) {
        if (tituloModal) tituloModal.textContent = "Editar despesa";
        if (subtituloModal) subtituloModal.textContent = editandoParcela ? "A alteração afeta somente esta parcela." : "Altere os dados deste lançamento.";
        const data = paraDate(despesa.dataDespesa) || paraDate(despesa.data) || dataPadraoNovoLancamento();
        if (inputData) inputData.value = chaveData(data);
        if (inputCategoria) inputCategoria.value = despesa.categoria || "Outros";
        if (inputDescricao) inputDescricao.value = despesa.descricao || "";
        if (inputValor) inputValor.value = formatarMoeda(Number(despesa.valor || 0));
        if (btnSalvar) btnSalvar.textContent = "Salvar alterações";
        if (editandoParcela && edicaoParcelamentoInfo) edicaoParcelamentoInfo.innerHTML = `<i class="fas fa-layer-group"></i><span>Parcela <strong>${Number(despesa.parcelaNumero || 1)}/${Number(despesa.parcelasTotal || 1)}</strong></span>`;
        selecionarModoDespesa("avista");
    } else {
        if (tituloModal) tituloModal.textContent = "Nova despesa";
        if (subtituloModal) subtituloModal.textContent = podeAdministrarNaVisaoAtual() ? "Lançamento da barbearia no mês selecionado." : "Seu lançamento no mês selecionado.";
        if (inputData) inputData.value = chaveData(dataPadraoNovoLancamento());
        if (inputCategoria) inputCategoria.value = "Material";
        if (inputParcelas) inputParcelas.value = "2";
        if (btnSalvar) btnSalvar.textContent = "Registrar despesa";
        selecionarModoDespesa("avista");
    }
    if (modal) modal.hidden = false;
    document.body.classList.add("modal-equipe-aberto");
    setTimeout(() => inputDescricao?.focus(), 0);
}
function fecharModalDespesa({ forcar = false } = {}) { if (btnSalvar?.disabled && !forcar) return; if (modal) modal.hidden = true; document.body.classList.remove("modal-equipe-aberto"); despesaEmEdicao = null; setStatus(); if (previewParcelas) previewParcelas.hidden = true; }

async function salvarDespesa(event) {
    event.preventDefault();
    setStatus();
    const dataBase = dataDeInput(inputData?.value);
    const valor = converterParaNumero(inputValor?.value);
    const descricao = String(inputDescricao?.value || "").trim();
    const categoria = String(inputCategoria?.value || "");
    const tipo = tipoDaArea();
    const quantidadeParcelas = Number(inputParcelas?.value || 0);
    const parcelada = !despesaEmEdicao && modoDespesa === "parcelada";
    const limites = limitesMesParaModal();
    let erro = false;
    if (!dataBase || dataBase < limites.inicio || dataBase > limites.fim) { erroLabel(labels.data); erroInput(inputData); erro = true; }
    if (!categoria) { erroLabel(labels.categoria); erroInput(inputCategoria); erro = true; }
    if (!descricao) { erroLabel(labels.descricao); erroInput(inputDescricao); erro = true; }
    if (!Number.isFinite(valor) || valor <= 0) { erroLabel(labels.valor); erroInput(inputValor); erro = true; }
    if (parcelada && (!Number.isInteger(quantidadeParcelas) || quantidadeParcelas < 2 || quantidadeParcelas > 36)) { erroLabel(labels.parcelas); erroInput(inputParcelas); erro = true; }
    if (erro) return;

    const originalData = despesaEmEdicao ? (paraDate(despesaEmEdicao.dataDespesa) || paraDate(despesaEmEdicao.data)) : null;
    const data = combinarDataComHora(dataBase, originalData || new Date());
    iniciarAcaoBotao(btnSalvar, despesaEmEdicao ? "Salvando..." : (parcelada ? "Gerando parcelas..." : "Registrando..."));
    try {
        if (despesaEmEdicao) {
            const alteracoes = { data: data.toISOString(), dataDespesa: Timestamp.fromDate(data), categoria, descricao: descricao.slice(0, 120), valor: Number(valor.toFixed(2)), tipo };
            if (tipo === "barbearia") { alteracoes.profissionalUid = null; alteracoes.profissionalNome = "Barbearia"; }
            await editarDespesa(despesaEmEdicao.id, alteracoes, despesaEmEdicao);
            despesasMes = despesasMes.map((item) => item.id === despesaEmEdicao.id ? { ...item, ...alteracoes, dataDespesa: data } : item);
            mostrarSucesso(despesaEmEdicao.parcelada ? "Parcela atualizada." : "Despesa atualizada.");
        } else if (parcelada) {
            const parcelas = calcularParcelas(valor, quantidadeParcelas, data);
            await criarDespesaParcelada({ parcelas, categoria, descricao, valorTotal: valor, tipo });
            mostrarSucesso(`${quantidadeParcelas} parcelas registradas.`);
        } else {
            const ref = await criarDespesa({ data, categoria, descricao, valor, tipo });
            despesasMes.unshift({ id: ref?.id || `local-${Date.now()}`, data, dataDespesa: data, categoria, descricao: descricao.slice(0,120), valor: Number(valor.toFixed(2)), tipo, profissionalUid: tipo === "profissional" ? state.user?.uid : null, parcelada: false, createdAt: new Date() });
            mostrarSucesso("Despesa registrada.");
        }
        renderizarDespesas();
        await concluirAcaoBotao(btnSalvar, despesaEmEdicao ? "Alteração salva ✓" : (parcelada ? "Parcelas registradas ✓" : "Despesa registrada ✓"), 520);
        fecharModalDespesa({ forcar: true });
        void carregarDespesasMes({ forcar: true });
    } catch (error) {
        console.error(error);
        restaurarAcaoBotao(btnSalvar);
        mostrarErro(error?.message || "Não foi possível salvar a despesa.");
    } finally { restaurarAcaoBotao(btnSalvar); }
}

function abrirExclusaoDespesa(despesa) {
    despesaParaExcluir = despesa;
    const parcelada = despesa?.parcelada === true;
    if (descricaoExcluir) descricaoExcluir.textContent = parcelada ? `Excluir a parcela ${Number(despesa.parcelaNumero || 1)}/${Number(despesa.parcelasTotal || 1)} de “${despesa.descricao || despesa.categoria || "Despesa"}”?` : `Excluir “${despesa.descricao || despesa.categoria || "Despesa"}” no valor de ${moeda(despesa.valor)}?`;
    if (escopoExcluir) { escopoExcluir.hidden = !parcelada; const somente = escopoExcluir.querySelector('input[value="somente"]'); if (somente) somente.checked = true; }
    modalExcluir?.classList.add("active"); modalExcluir?.setAttribute("aria-hidden", "false");
}
function fecharExclusaoDespesa() { despesaParaExcluir = null; modalExcluir?.classList.remove("active"); modalExcluir?.setAttribute("aria-hidden", "true"); if (escopoExcluir) escopoExcluir.hidden = true; }
async function confirmarExclusaoDespesa() {
    if (!despesaParaExcluir?.id) return;
    const despesa = despesaParaExcluir;
    const incluirProximas = despesa.parcelada === true && escopoExcluir?.querySelector('input[name="despesaExcluirOpcao"]:checked')?.value === "proximas";
    iniciarAcaoBotao(btnConfirmarExcluir, "Excluindo...");
    try {
        const resultado = await excluirDespesaParcelada(despesa, { incluirProximas });
        if (incluirProximas && despesa.parcelamentoId) despesasMes = despesasMes.filter((item) => !(item.parcelamentoId === despesa.parcelamentoId && Number(item.parcelaNumero || 0) >= Number(despesa.parcelaNumero || 0)));
        else despesasMes = despesasMes.filter((item) => item.id !== despesa.id);
        renderizarDespesas();
        await concluirAcaoBotao(btnConfirmarExcluir, "Despesa excluída ✓", 420);
        mostrarSucesso(incluirProximas ? `${resultado.quantidade} parcelas excluídas.` : (despesa.parcelada ? "Parcela excluída." : "Despesa excluída."));
        fecharExclusaoDespesa();
    } catch (error) { console.error(error); mostrarErro("Não foi possível excluir a despesa."); }
    finally { restaurarAcaoBotao(btnConfirmarExcluir); }
}

function abrirCalendarioDespesa() {
    const limites = limitesMesParaModal();
    abrirCalendarioPopover({ ancora: btnCalendario || inputData, data: dataDeInput(inputData?.value) || dataPadraoNovoLancamento(), min: limites.inicio, max: limites.fim, titulo: "Data da despesa", onSelect: (data) => { if (inputData) inputData.value = chaveData(data); limparErro(inputData, labels.data); atualizarPreviewParcelas(); } });
}
function abrirCalendarioMes() {
    abrirCalendarioPopover({ ancora: btnCalendarioMes || mesLabel, data: mesSelecionado, max: new Date(), titulo: "Mês das despesas", onSelect: (data) => { mesSelecionado = new Date(data.getFullYear(), data.getMonth(), 1); void carregarDespesasMes(); } });
}

export function initDespesas() {
    if (inicializado) return;
    inicializado = true;
    inputData?.setAttribute("readonly", ""); inputData?.setAttribute("inputmode", "none");
    inputValor?.addEventListener("input", () => { aplicarMascaraMoedaInput(inputValor, 9); limparErro(inputValor, labels.valor); atualizarPreviewParcelas(); });
    inputDescricao?.addEventListener("input", () => limparErro(inputDescricao, labels.descricao));
    inputCategoria?.addEventListener("change", () => limparErro(inputCategoria, labels.categoria));
    inputParcelas?.addEventListener("input", () => { limparErro(inputParcelas, labels.parcelas); atualizarPreviewParcelas(); });
    btnAVista?.addEventListener("click", () => selecionarModoDespesa("avista"));
    btnParcelada?.addEventListener("click", () => selecionarModoDespesa("parcelada"));
    btnCalendario?.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); abrirCalendarioDespesa(); });
    inputData?.addEventListener("click", (e) => { e.preventDefault(); abrirCalendarioDespesa(); });
    btnCalendarioMes?.addEventListener("click", abrirCalendarioMes);
    btnMesAnterior?.addEventListener("click", () => { mesSelecionado = new Date(mesSelecionado.getFullYear(), mesSelecionado.getMonth() - 1, 1); void carregarDespesasMes(); });
    btnMesProximo?.addEventListener("click", () => { const proximo = new Date(mesSelecionado.getFullYear(), mesSelecionado.getMonth() + 1, 1); if (proximo > mesAtual()) return; mesSelecionado = proximo; void carregarDespesasMes(); });
    btnNova?.addEventListener("click", () => abrirModalDespesa());
    btnFecharModal?.addEventListener("click", () => fecharModalDespesa());
    form?.addEventListener("submit", salvarDespesa);
    modal?.addEventListener("click", (event) => { if (event.target === modal) fecharModalDespesa(); });
    btnCancelarExcluir?.addEventListener("click", fecharExclusaoDespesa);
    btnConfirmarExcluir?.addEventListener("click", confirmarExclusaoDespesa);
    modalExcluir?.addEventListener("click", (event) => { if (event.target === modalExcluir) fecharExclusaoDespesa(); });
    atualizarNavegacaoMes();
}
