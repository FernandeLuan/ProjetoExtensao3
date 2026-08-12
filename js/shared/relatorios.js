import { state } from "./state.js?v=11.0";
import { obterAtendimentosPeriodo } from "./data/sync.js?v=11.0";
import { listarVendasPorPeriodo } from "./data/estoque-repository.js?v=11.0";
import { listarDespesasPorPeriodo } from "./data/despesas-repository.js?v=11.0";
import { podeAdministrarNaVisaoAtual } from "./permissoes.js?v=11.0";
import { obterBrutoAtendimento, obterRepasseAtendimento, obterTaxaCartaoValor } from "./services/financeiro-service.js?v=11.0";
import { inicioDoDia, chaveData, paraDate } from "./utils/date.js?v=11.0";
import { formatarMoeda } from "./utils/money.js?v=11.0";
import { abrirCalendarioPopover } from "./services/calendario-popover.js?v=11.0";
import { iniciarAcaoBotao, concluirAcaoBotao, restaurarAcaoBotao, iniciarLoadingTela, finalizarLoadingTela } from "./services/ui-loading-service.js?v=11.0";
import { mostrarErro, mostrarSucesso } from "./services/feedback-service.js?v=11.0";

let inicializado = false;
let periodoInicio = inicioDoDia(new Date());
let periodoFim = inicioDoDia(new Date());
let ultimoTexto = "";
let ultimaMeta = null;

const CACHE_TTL_MS = 2 * 60 * 60 * 1000;
const el = (id) => document.getElementById(id);
const btnInicio = el("btnRelDataInicio");
const btnFim = el("btnRelDataFim");
const labelInicio = el("labelRelDataInicio");
const labelFim = el("labelRelDataFim");
const inputInicio = el("dataInicioRelatorio");
const inputFim = el("dataFimRelatorio");
const btnSolicitar = el("btnSolicitarFechamento");
const resultadoBox = el("fechamentoResultadoBox");
const textoEl = el("fechamentoTexto");
const statusEl = el("relatorioStatus");

function moeda(valor) {
    return `R$ ${formatarMoeda(Number(valor || 0))}`;
}

function setStatus(texto = "", erro = false) {
    if (!statusEl) return;
    statusEl.textContent = texto;
    statusEl.hidden = !texto;
    statusEl.classList.toggle("error", Boolean(erro));
}

function areaAtual() {
    return podeAdministrarNaVisaoAtual() ? "admin" : "profissional";
}

function chaveCache(inicio = periodoInicio, fim = periodoFim) {
    return `srnk:fechamento:v1.1.0:${areaAtual()}:${state.user?.uid || "anon"}:${chaveData(inicio)}:${chaveData(fim)}`;
}

function chaveUltimoPeriodo() {
    return `srnk:fechamento:v1.1.0:ultimo-periodo:${areaAtual()}:${state.user?.uid || "anon"}`;
}

function lerCache(inicio = periodoInicio, fim = periodoFim) {
    try {
        const bruto = sessionStorage.getItem(chaveCache(inicio, fim));
        if (!bruto) return null;
        const cache = JSON.parse(bruto);
        if (!cache?.texto || !cache?.salvoEm || Date.now() - Number(cache.salvoEm) > CACHE_TTL_MS) {
            sessionStorage.removeItem(chaveCache(inicio, fim));
            return null;
        }
        return cache;
    } catch (_) {
        return null;
    }
}

function salvarCache(texto, meta = {}) {
    try {
        sessionStorage.setItem(chaveCache(), JSON.stringify({ texto, meta, salvoEm: Date.now() }));
        sessionStorage.setItem(chaveUltimoPeriodo(), JSON.stringify({ inicio: chaveData(periodoInicio), fim: chaveData(periodoFim) }));
    } catch (_) {
        // Cache é apenas conveniência; falha não bloqueia o fechamento.
    }
}

function dataDeChave(valor) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(valor || ""))) return null;
    const data = new Date(`${valor}T12:00:00`);
    return Number.isNaN(data.getTime()) ? null : inicioDoDia(data);
}

function restaurarUltimoPeriodo() {
    try {
        const bruto = sessionStorage.getItem(chaveUltimoPeriodo());
        if (!bruto) return;
        const salvo = JSON.parse(bruto);
        const inicio = dataDeChave(salvo?.inicio);
        const fim = dataDeChave(salvo?.fim);
        const hoje = inicioDoDia(new Date());
        if (!inicio || !fim || inicio > fim || fim > hoje) return;
        periodoInicio = inicio;
        periodoFim = fim;
    } catch (_) {}
}

function formatarDataCurta(data) {
    const hoje = inicioDoDia(new Date());
    if (chaveData(data) === chaveData(hoje)) return "Hoje";
    return data.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: data.getFullYear() === hoje.getFullYear() ? undefined : "numeric" }).replace(".", "");
}

function periodoEhHoje() {
    const hoje = inicioDoDia(new Date());
    return chaveData(periodoInicio) === chaveData(hoje) && chaveData(periodoFim) === chaveData(hoje);
}

function periodoUmDia() {
    return chaveData(periodoInicio) === chaveData(periodoFim);
}

function rotuloPeriodoMensagem() {
    if (periodoEhHoje()) return "hoje";
    if (periodoUmDia()) return periodoInicio.toLocaleDateString("pt-BR");
    return `${periodoInicio.toLocaleDateString("pt-BR")} a ${periodoFim.toLocaleDateString("pt-BR")}`;
}

function atualizarNavegador() {
    const hoje = inicioDoDia(new Date());
    if (labelInicio) labelInicio.textContent = formatarDataCurta(periodoInicio);
    if (labelFim) labelFim.textContent = formatarDataCurta(periodoFim);
    if (inputInicio) { inputInicio.value = chaveData(periodoInicio); inputInicio.max = chaveData(hoje); }
    if (inputFim) { inputFim.value = chaveData(periodoFim); inputFim.max = chaveData(hoje); inputFim.min = chaveData(periodoInicio); }
    restaurarResultadoDoCache();
}

function esconderResultado() {
    ultimoTexto = "";
    ultimaMeta = null;
    if (resultadoBox) resultadoBox.hidden = true;
    if (textoEl) textoEl.value = "";
    setStatus();
}

function restaurarResultadoDoCache() {
    const cache = lerCache();
    if (!cache) {
        esconderResultado();
        return false;
    }
    ultimoTexto = cache.texto;
    ultimaMeta = cache.meta || null;
    if (textoEl) textoEl.value = ultimoTexto;
    if (resultadoBox) resultadoBox.hidden = false;
    setStatus();
    return true;
}

function selecionarInicio(data) {
    const hoje = inicioDoDia(new Date());
    const nova = inicioDoDia(data);
    periodoInicio = nova > hoje ? hoje : nova;
    if (periodoFim < periodoInicio) periodoFim = periodoInicio;
    atualizarNavegador();
}

function selecionarFim(data) {
    const hoje = inicioDoDia(new Date());
    const nova = inicioDoDia(data);
    periodoFim = nova > hoje ? hoje : nova;
    if (periodoInicio > periodoFim) periodoInicio = periodoFim;
    atualizarNavegador();
}

function agrupamentoServicos(atendimentos) {
    const mapa = new Map();
    (atendimentos || []).forEach((item) => {
        const nome = String(item?.servicoNome || item?.servico || "Serviço").trim() || "Serviço";
        mapa.set(nome, (mapa.get(nome) || 0) + 1);
    });
    return [...mapa.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "pt-BR"));
}

function percentualRepasse(atendimentos) {
    const valores = [...new Set((atendimentos || [])
        .map((item) => Number(item?.financeiro?.repasseDonoPct ?? item?.repasseDonoPct))
        .filter(Number.isFinite)
        .map((valor) => Number(valor.toFixed(2))))];
    if (valores.length === 1) return `${valores[0].toFixed(2).replace(/\.00$/, "").replace(".", ",")}%`;
    if (valores.length > 1) return "variável";
    const fallback = state.membroAtual?.dono === true ? 0 : Number(state.membroAtual?.repassePct ?? state.configSistema?.repasseDonoPct ?? 35);
    return `${Number(fallback || 0).toFixed(2).replace(/\.00$/, "").replace(".", ",")}%`;
}

function dentroDoPeriodo(data) {
    const valor = paraDate(data);
    if (!valor) return false;
    const tempo = valor.getTime();
    const min = inicioDoDia(periodoInicio).getTime();
    const max = new Date(periodoFim.getFullYear(), periodoFim.getMonth(), periodoFim.getDate(), 23, 59, 59, 999).getTime();
    return tempo >= min && tempo <= max;
}

function filtrarAtendimentos(lista, profissionalUid = null) {
    return (lista || []).filter((item) => dentroDoPeriodo(item?.dataAtendimento || item?.data) && (!profissionalUid || item?.profissionalUid === profissionalUid));
}
function filtrarVendas(lista, profissionalUid = null) {
    return (lista || []).filter((item) => item?.cancelada !== true && dentroDoPeriodo(item?.dataVenda) && (!profissionalUid || item?.profissionalUid === profissionalUid));
}
function filtrarDespesas(lista) {
    return (lista || []).filter((item) => item?.tipo === "barbearia" && dentroDoPeriodo(item?.dataDespesa || item?.data));
}

function fechamentoProfissional({ atendimentos, vendas }) {
    const servicos = agrupamentoServicos(atendimentos);
    const totalBruto = atendimentos.reduce((soma, item) => soma + obterBrutoAtendimento(item), 0);
    const repasse = atendimentos.reduce((soma, item) => soma + obterRepasseAtendimento(item), 0);
    const comissao = vendas.reduce((soma, item) => soma + Number(item?.comissaoValor || 0), 0);
    const devido = Number((repasse - comissao).toFixed(2));
    const linhas = ["Olá,", "", periodoUmDia() ? `Segue fechamento de ${rotuloPeriodoMensagem()}:` : `Segue fechamento do período de ${rotuloPeriodoMensagem()}:`, "", `${atendimentos.length} atendimento${atendimentos.length === 1 ? "" : "s"} sendo`];
    if (servicos.length) servicos.forEach(([nome, qtd]) => linhas.push(`${qtd} ${nome}`));
    else linhas.push("Nenhum atendimento registrado");
    linhas.push("", `Total: ${moeda(totalBruto)}`, `Repasse: ${percentualRepasse(atendimentos)}`);
    if (comissao > 0) linhas.push(`Comissão: ${moeda(comissao)}`);
    linhas.push(devido >= 0 ? `Valor devido: ${moeda(devido)}` : `Valor a receber: ${moeda(Math.abs(devido))}`, "", "Para mais detalhes do meu período consulte o painel gerencial.");
    return { texto: linhas.join("\n"), meta: { atendimentos: atendimentos.length, vendas: vendas.length, atividade: atendimentos.length + vendas.length, repasse, comissao, devido } };
}

function fechamentoBarbearia({ atendimentos, vendas, despesas }) {
    const servicos = agrupamentoServicos(atendimentos);
    const brutoServicos = atendimentos.reduce((soma, item) => soma + obterBrutoAtendimento(item), 0);
    const repasseEquipe = atendimentos.reduce((soma, item) => {
        const dono = item?.profissionalDono === true || item?.financeiro?.profissionalDono === true;
        return soma + (dono ? 0 : obterRepasseAtendimento(item));
    }, 0);
    const receitaDono = atendimentos.reduce((soma, item) => {
        const dono = item?.profissionalDono === true || item?.financeiro?.profissionalDono === true;
        return soma + (dono ? Math.max(0, obterBrutoAtendimento(item) - obterTaxaCartaoValor(item)) : 0);
    }, 0);
    const vendasBrutas = vendas.reduce((soma, item) => soma + Number(item?.valorBruto || 0), 0);
    const comissoesProdutos = vendas.reduce((soma, item) => soma + Number(item?.comissaoValor || 0), 0);
    const resultadoProdutos = vendas.reduce((soma, item) => soma + Number(item?.resultadoBarbearia || 0), 0);
    const despesasBarbearia = despesas.reduce((soma, item) => soma + Number(item?.valor || 0), 0);
    const resultado = Number((receitaDono + repasseEquipe + resultadoProdutos - despesasBarbearia).toFixed(2));

    const linhas = ["Olá,", "", periodoUmDia() ? `Segue fechamento da barbearia de ${rotuloPeriodoMensagem()}:` : `Segue fechamento da barbearia do período de ${rotuloPeriodoMensagem()}:`, "", `${atendimentos.length} atendimento${atendimentos.length === 1 ? "" : "s"} sendo`];
    if (servicos.length) servicos.forEach(([nome, qtd]) => linhas.push(`${qtd} ${nome}`));
    else linhas.push("Nenhum atendimento registrado");
    linhas.push("", `Serviços: ${moeda(brutoServicos)}`, `Repasse da equipe: ${moeda(repasseEquipe)}`, `Vendas de produtos: ${moeda(vendasBrutas)}`, `Comissões de produtos: ${moeda(comissoesProdutos)}`);
    if (despesasBarbearia > 0) linhas.push(`Despesas: ${moeda(despesasBarbearia)}`);
    linhas.push(`Resultado: ${moeda(resultado)}`, "", "Para mais detalhes individuais gere um relatório separado.");
    return { texto: linhas.join("\n"), meta: { atendimentos: atendimentos.length, vendas: vendas.length, despesas: despesas.length, atividade: atendimentos.length + vendas.length + despesas.length, brutoServicos, repasseEquipe, vendasBrutas, comissoesProdutos, resultado } };
}

async function buscarDadosFrescos() {
    const admin = podeAdministrarNaVisaoAtual();
    const profissionalUid = admin ? null : state.user?.uid;
    const tarefas = [
        obterAtendimentosPeriodo(periodoInicio, periodoFim, { profissionalUid, forcar: true }),
        listarVendasPorPeriodo(periodoInicio, periodoFim, { profissionalUid, forcar: true })
    ];
    if (admin) tarefas.push(listarDespesasPorPeriodo(periodoInicio, periodoFim, { incluirBarbearia: true, forcar: true }));
    const [atendimentosBrutos, vendasBrutas, despesasBrutas = []] = await Promise.all(tarefas);
    return {
        atendimentos: filtrarAtendimentos(atendimentosBrutos, profissionalUid),
        vendas: filtrarVendas(vendasBrutas, profissionalUid),
        despesas: admin ? filtrarDespesas(despesasBrutas) : []
    };
}

async function solicitarFechamento() {
    iniciarAcaoBotao(btnSolicitar, "Consultando...");
    const loading = iniciarLoadingTela("Consultando movimentações...", { delay: 180 });
    setStatus();
    const anterior = lerCache();

    try {
        let dados = await buscarDadosFrescos();
        let atividade = dados.atendimentos.length + dados.vendas.length + dados.despesas.length;
        if (atividade === 0 && Number(anterior?.meta?.atividade || 0) > 0) {
            // Uma leitura vazia isolada não substitui um fechamento confirmado recente.
            // Fazemos uma segunda leitura curta; se continuar vazia, preservamos o último resultado.
            await new Promise((resolve) => setTimeout(resolve, 250));
            dados = await buscarDadosFrescos();
            atividade = dados.atendimentos.length + dados.vendas.length + dados.despesas.length;
            if (atividade === 0) {
                restaurarResultadoDoCache();
                setStatus("Não foi possível confirmar os dados agora. Mantivemos o último fechamento gerado.", true);
                return;
            }
        }

        const resultado = podeAdministrarNaVisaoAtual()
            ? fechamentoBarbearia(dados)
            : fechamentoProfissional(dados);
        ultimoTexto = resultado.texto;
        ultimaMeta = resultado.meta;
        salvarCache(ultimoTexto, ultimaMeta);
        if (textoEl) textoEl.value = ultimoTexto;
        if (resultadoBox) resultadoBox.hidden = false;
        await concluirAcaoBotao(btnSolicitar, "Fechamento pronto ✓", 420);
        setStatus();
        resultadoBox?.scrollIntoView?.({ behavior: "smooth", block: "start" });
    } catch (error) {
        console.error("Erro ao gerar fechamento:", error);
        if (anterior?.texto) {
            restaurarResultadoDoCache();
            setStatus("Não foi possível atualizar agora. O último fechamento continua disponível.", true);
        } else {
            mostrarErro("Não foi possível gerar o fechamento. Confira a conexão e tente novamente.");
            setStatus("Não foi possível gerar o fechamento.", true);
        }
    } finally {
        finalizarLoadingTela(loading);
        restaurarAcaoBotao(btnSolicitar);
    }
}

async function copiarFechamento() {
    if (!ultimoTexto) return;
    try {
        await navigator.clipboard.writeText(ultimoTexto);
        mostrarSucesso("Fechamento copiado.");
    } catch (_) {
        textoEl?.focus();
        textoEl?.select();
        document.execCommand?.("copy");
        mostrarSucesso("Fechamento copiado.");
    }
}

function enviarWhatsApp() {
    if (!ultimoTexto) return;
    window.open(`https://wa.me/?text=${encodeURIComponent(ultimoTexto)}`, "_blank", "noopener,noreferrer");
}

export async function prepararRelatoriosHoje() {
    atualizarNavegador();
}

export async function initRelatorios() {
    if (inicializado) return;
    inicializado = true;
    restaurarUltimoPeriodo();
    [inputInicio, inputFim].forEach((input) => { input?.setAttribute("readonly", ""); input?.setAttribute("inputmode", "none"); });

    btnInicio?.addEventListener("click", () => abrirCalendarioPopover({ ancora: btnInicio, data: periodoInicio, max: periodoFim, titulo: "Data inicial", onSelect: selecionarInicio }));
    btnFim?.addEventListener("click", () => abrirCalendarioPopover({ ancora: btnFim, data: periodoFim, min: periodoInicio, max: new Date(), titulo: "Data final", onSelect: selecionarFim }));
    btnSolicitar?.addEventListener("click", () => void solicitarFechamento());
    el("btnCopiarFechamento")?.addEventListener("click", () => void copiarFechamento());
    el("btnWhatsApp")?.addEventListener("click", enviarWhatsApp);
    atualizarNavegador();
}
