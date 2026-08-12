import { state } from "./state.js?v=9.7";
import { obterAtendimentosPeriodo } from "./data/sync.js?v=9.7";
import { listarVendasPorPeriodo } from "./data/estoque-repository.js?v=9.7";
import { listarDespesasPorPeriodo } from "./data/despesas-repository.js?v=9.7";
import { podeAdministrarNaVisaoAtual } from "./permissoes.js?v=9.7";
import { obterBrutoAtendimento, obterRepasseAtendimento, obterTaxaCartaoValor } from "./services/financeiro-service.js?v=9.7";
import { inicioDoDia, somarDias, chaveData, mesmoDia, formatarTituloData } from "./utils/date.js?v=9.7";
import { formatarMoeda } from "./utils/money.js?v=9.7";
import { abrirCalendarioPopover } from "./services/calendario-popover.js?v=9.7";
import { iniciarAcaoBotao, concluirAcaoBotao, restaurarAcaoBotao, iniciarLoadingTela, finalizarLoadingTela } from "./services/ui-loading-service.js?v=9.7";
import { mostrarErro, mostrarSucesso } from "./services/feedback-service.js?v=9.7";
import { registrarAtualizacao } from "./services/refresh-service.js?v=9.7";

let inicializado = false;
let dataSelecionada = inicioDoDia(new Date());
let ultimoTexto = "";

const el = (id) => document.getElementById(id);
const btnAnterior = el("btnRelDataAnterior");
const btnProxima = el("btnRelDataProxima");
const btnCalendario = el("btnCalendarioRelatorio");
const inputData = el("dataInicioRelatorio");
const profissionalField = el("relatorioProfissionalField");
const profissionalSelect = el("relatorioProfissionalSelect");
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
    statusEl.classList.toggle("error", Boolean(erro));
}

function nomeMembro(membro) {
    return String(membro?.nome || membro?.email || "Profissional").trim();
}

function atualizarNavegador() {
    const hoje = inicioDoDia(new Date());
    const label = el("labelDataRelatorio");
    if (label) label.textContent = formatarTituloData(dataSelecionada);
    if (inputData) {
        inputData.value = chaveData(dataSelecionada);
        inputData.max = chaveData(hoje);
    }
    if (btnProxima) {
        const atual = mesmoDia(dataSelecionada, hoje);
        btnProxima.disabled = atual;
        btnProxima.setAttribute("aria-disabled", String(atual));
    }
    limparResultado();
}

function limparResultado() {
    ultimoTexto = "";
    if (resultadoBox) resultadoBox.hidden = true;
    if (textoEl) textoEl.value = "";
    setStatus();
}

async function prepararSeletorProfissional() {
    const admin = podeAdministrarNaVisaoAtual();
    if (!profissionalField || !profissionalSelect) return;
    profissionalField.hidden = !admin;
    if (!admin) return;

    const atual = profissionalSelect.value || "barbearia";
    const membros = [...(state.equipe || [])];
    const uidAtual = state.user?.uid;
    if (uidAtual && state.membroAtual && !membros.some((item) => (item.uid || item.id) === uidAtual)) {
        membros.push({ uid: uidAtual, id: uidAtual, ...state.membroAtual });
    }
    const ativos = membros
        .filter((item) => item?.ativo === true && item?.atuaComoProfissional !== false && item?.removido !== true)
        .sort((a, b) => nomeMembro(a).localeCompare(nomeMembro(b), "pt-BR"));

    profissionalSelect.innerHTML = '<option value="barbearia">Barbearia</option>';
    ativos.forEach((membro) => {
        const uid = membro.uid || membro.id;
        if (!uid) return;
        const option = document.createElement("option");
        option.value = uid;
        option.textContent = nomeMembro(membro);
        profissionalSelect.appendChild(option);
    });
    profissionalSelect.value = [...profissionalSelect.options].some((item) => item.value === atual)
        ? atual
        : "barbearia";
}

function agrupamentoServicos(atendimentos) {
    const mapa = new Map();
    (atendimentos || []).forEach((item) => {
        const nome = String(item?.servicoNome || item?.servico || "Serviço").trim() || "Serviço";
        mapa.set(nome, (mapa.get(nome) || 0) + 1);
    });
    return [...mapa.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "pt-BR"));
}

function linhaQuantidade(qtd, nome) {
    return `${Number(qtd || 0)} ${nome}`;
}

function rotuloDataMensagem() {
    return mesmoDia(dataSelecionada, new Date())
        ? "hoje"
        : dataSelecionada.toLocaleDateString("pt-BR");
}

function percentualRepasse(atendimentos, membro = null) {
    const valores = [...new Set(
        (atendimentos || [])
            .map((item) => Number(item?.financeiro?.repasseDonoPct ?? item?.repasseDonoPct))
            .filter((valor) => Number.isFinite(valor))
            .map((valor) => Number(valor.toFixed(2)))
    )];
    if (valores.length === 1) return `${valores[0].toFixed(2).replace(/\.00$/, "").replace(".", ",")}%`;
    if (valores.length > 1) return "variável";
    const fallback = membro?.dono === true ? 0 : Number(membro?.repassePct ?? state.configSistema?.repasseDonoPct ?? 35);
    return `${Number(fallback || 0).toFixed(2).replace(/\.00$/, "").replace(".", ",")}%`;
}

function membroPorUid(uid) {
    if (!uid) return null;
    if (uid === state.user?.uid) return state.membroAtual;
    return (state.equipe || []).find((item) => (item.uid || item.id) === uid) || null;
}

function fechamentoProfissional({ atendimentos, vendas, profissionalUid, geradoPeloAdmin = false }) {
    const servicos = agrupamentoServicos(atendimentos);
    const totalBruto = atendimentos.reduce((soma, item) => soma + obterBrutoAtendimento(item), 0);
    const repasse = atendimentos.reduce((soma, item) => soma + obterRepasseAtendimento(item), 0);
    const comissao = vendas.reduce((soma, item) => soma + Number(item?.comissaoValor || 0), 0);
    const devido = Number((repasse - comissao).toFixed(2));
    const membro = membroPorUid(profissionalUid);

    const linhas = [
        "Olá,",
        "",
        `Segue fechamento de ${rotuloDataMensagem()}:`,
        "",
        `${atendimentos.length} atendimento${atendimentos.length === 1 ? "" : "s"} sendo`
    ];

    if (servicos.length) servicos.forEach(([nome, qtd]) => linhas.push(linhaQuantidade(qtd, nome)));
    else linhas.push("Nenhum atendimento registrado");

    linhas.push(
        "",
        `Total: ${moeda(totalBruto)}`,
        `Repasse: ${percentualRepasse(atendimentos, membro)}`
    );

    if (comissao > 0) linhas.push(`Comissão: ${moeda(comissao)}`);
    linhas.push(
        devido >= 0 ? `Valor devido: ${moeda(devido)}` : `Valor a receber: ${moeda(Math.abs(devido))}`,
        "",
        geradoPeloAdmin
            ? "Para mais detalhes do dia consulte o painel gerencial."
            : "Para mais detalhes do meu dia consulte no painel gerencial."
    );

    return linhas.join("\n");
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
    const despesasBarbearia = despesas
        .filter((item) => item?.tipo === "barbearia")
        .reduce((soma, item) => soma + Number(item?.valor || 0), 0);
    const resultado = Number((receitaDono + repasseEquipe + resultadoProdutos - despesasBarbearia).toFixed(2));

    const linhas = [
        "Olá,",
        "",
        `Segue fechamento da barbearia de ${rotuloDataMensagem()}:`,
        "",
        `${atendimentos.length} atendimento${atendimentos.length === 1 ? "" : "s"} sendo`
    ];
    if (servicos.length) servicos.forEach(([nome, qtd]) => linhas.push(linhaQuantidade(qtd, nome)));
    else linhas.push("Nenhum atendimento registrado");

    linhas.push("", `Serviços: ${moeda(brutoServicos)}`, `Repasse da equipe: ${moeda(repasseEquipe)}`);
    if (vendas.length) {
        linhas.push(`Vendas de produtos: ${moeda(vendasBrutas)}`);
        if (comissoesProdutos > 0) linhas.push(`Comissões de produtos: ${moeda(comissoesProdutos)}`);
    }
    if (despesasBarbearia > 0) linhas.push(`Despesas: ${moeda(despesasBarbearia)}`);
    linhas.push(`Resultado: ${moeda(resultado)}`, "", "Para mais detalhes consulte a Visão Geral gerencial.");
    return linhas.join("\n");
}

async function solicitarFechamento() {
    const admin = podeAdministrarNaVisaoAtual();
    const selecao = admin ? (profissionalSelect?.value || "barbearia") : state.user?.uid;
    const visaoBarbearia = admin && selecao === "barbearia";
    const profissionalUid = visaoBarbearia ? null : selecao;
    const inicio = inicioDoDia(dataSelecionada);
    const fim = inicioDoDia(dataSelecionada);

    iniciarAcaoBotao(btnSolicitar, "Consultando...");
    const loading = iniciarLoadingTela("Consultando movimentações...", { delay: 180 });
    setStatus();

    try {
        const tarefas = [
            obterAtendimentosPeriodo(inicio, fim, { profissionalUid, forcar: true }),
            listarVendasPorPeriodo(inicio, fim, { profissionalUid, forcar: true })
        ];
        if (visaoBarbearia) tarefas.push(listarDespesasPorPeriodo(inicio, fim, { incluirBarbearia: true, forcar: true }));

        const [atendimentos, vendas, despesas = []] = await Promise.all(tarefas);
        ultimoTexto = visaoBarbearia
            ? fechamentoBarbearia({ atendimentos, vendas, despesas })
            : fechamentoProfissional({ atendimentos, vendas, profissionalUid, geradoPeloAdmin: admin });

        if (textoEl) textoEl.value = ultimoTexto;
        if (resultadoBox) resultadoBox.hidden = false;
        registrarAtualizacao("fechamento", []);
        await concluirAcaoBotao(btnSolicitar, "Fechamento pronto ✓", 420);
        setStatus("Fechamento atualizado agora.");
        resultadoBox?.scrollIntoView?.({ behavior: "smooth", block: "start" });
    } catch (error) {
        console.error("Erro ao gerar fechamento:", error);
        mostrarErro("Não foi possível gerar o fechamento. Confira a conexão e tente novamente.");
        setStatus("Não foi possível gerar o fechamento.", true);
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

function selecionarData(data) {
    const hoje = inicioDoDia(new Date());
    const nova = inicioDoDia(data);
    dataSelecionada = nova > hoje ? hoje : nova;
    atualizarNavegador();
}

export async function prepararRelatoriosHoje() {
    dataSelecionada = inicioDoDia(new Date());
    atualizarNavegador();
    await prepararSeletorProfissional();
}

export async function initRelatorios() {
    if (inicializado) return;
    inicializado = true;
    inputData?.setAttribute("readonly", "");
    inputData?.setAttribute("aria-hidden", "true");

    btnAnterior?.addEventListener("click", () => selecionarData(somarDias(dataSelecionada, -1)));
    btnProxima?.addEventListener("click", () => {
        if (!mesmoDia(dataSelecionada, new Date())) selecionarData(somarDias(dataSelecionada, 1));
    });
    btnCalendario?.addEventListener("click", () => {
        abrirCalendarioPopover({
            ancora: btnCalendario,
            data: dataSelecionada,
            max: new Date(),
            titulo: "Data do fechamento",
            onSelect: selecionarData
        });
    });
    profissionalSelect?.addEventListener("change", limparResultado);
    btnSolicitar?.addEventListener("click", () => void solicitarFechamento());
    el("btnCopiarFechamento")?.addEventListener("click", () => void copiarFechamento());
    el("btnWhatsApp")?.addEventListener("click", enviarWhatsApp);
}
