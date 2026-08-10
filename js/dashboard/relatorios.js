import { APP_NAME } from "./constants.js?v=8.29";
import { state } from "./state.js?v=8.29";
import { obterAtendimentosPeriodo } from "./data/sync.js?v=8.29";
import { listarDespesasPorPeriodo } from "./data/despesas-repository.js?v=8.29";
import { listarMembrosEquipe } from "./data/equipe-repository.js?v=8.29";
import { listarVendasPorPeriodo } from "./data/estoque-repository.js?v=8.29";
import { obterWorkspaceId } from "./data/context.js?v=8.29";
import {
    listarResumosBarbeariaPorPeriodo,
    listarResumosProfissionalPorPeriodo
} from "./data/resumos-repository.js?v=8.29";
import { podeAdministrarNaVisaoAtual } from "./permissoes.js?v=8.29";
import {
    obterBrutoAtendimento,
    obterTaxaCartaoValor,
    obterRepasseAtendimento,
    obterLiquidoBarbeiro
} from "./services/financeiro-service.js?v=8.29";
import {
    chaveData,
    dataDeInput,
    inicioDoDia,
    somarDias,
    obterDataAtendimento,
    formatarTituloData
} from "./utils/date.js?v=8.29";
import { formatarMoeda } from "./utils/money.js?v=8.29";
import { escaparHtml } from "./utils/dom.js?v=8.29";
import { abrirCalendarioPopover } from "./services/calendario-popover.js?v=8.29";
import { calcularFechamentoFinanceiro, calcularResumoVendasProdutos } from "./services/relatorio-financeiro-service.js?v=8.29";

let inicializado = false;
let relatorioAtual = null;
let charts = {};
let timerInfo = null;
let periodoInicio = inicioDoDia(new Date());
let periodoFim = inicioDoDia(new Date());

const el = (id) => document.getElementById(id);
const inicioInput = el("dataInicioRelatorio");
const fimInput = el("dataFimRelatorio");
const periodoCustom = el("relatorioPeriodoCustom");
const profissionalField = el("relatorioProfissionalField");
const profissionalSelect = el("relatorioProfissionalSelect");
const loading = el("relatorioLoading");
const status = el("relatorioStatus");
const infoTooltip = el("relatorioInfoTooltip");
const labelData = el("labelDataRelatorio");
const btnAnterior = el("btnRelDataAnterior");
const btnProxima = el("btnRelDataProxima");
const btnCalendario = el("btnCalendarioRelatorio");
const btnAbaAnalise = el("btnRelatorioAnalise");
const btnAbaFechamento = el("btnRelatorioFechamento");
const painelAnalise = el("relatorioConteudo");
const painelFechamento = el("relatorioFechamento");
let abaRelatorioAtual = "analise";

function moeda(valor) {
    return `R$ ${formatarMoeda(Number(valor || 0))}`;
}

function moedaSinal(valor) {
    const numero = Number(valor || 0);
    const sinal = numero > 0 ? "+ " : numero < 0 ? "- " : "";
    return `${sinal}R$ ${formatarMoeda(Math.abs(numero))}`;
}

function setTexto(id, texto) {
    const elemento = el(id);
    if (elemento) elemento.textContent = texto;
}

function setStatus(texto = "", erro = false) {
    if (!status) return;
    status.textContent = texto;
    status.classList.toggle("error", Boolean(erro));
}

function setCarregando(ativo) {
    if (!loading) return;
    loading.hidden = !ativo;
}

function diasNoPeriodo(inicio = periodoInicio, fim = periodoFim) {
    const msDia = 24 * 60 * 60 * 1000;
    return Math.max(1, Math.round((inicioDoDia(fim) - inicioDoDia(inicio)) / msDia) + 1);
}

function formatarPeriodo(inicio, fim) {
    if (chaveData(inicio) === chaveData(fim)) {
        return formatarTituloData(inicio);
    }

    const mesmoMes =
        inicio.getFullYear() === fim.getFullYear() &&
        inicio.getMonth() === fim.getMonth();

    if (mesmoMes) {
        const diaInicio = String(inicio.getDate()).padStart(2, "0");
        const diaFim = String(fim.getDate()).padStart(2, "0");
        const mes = fim.toLocaleDateString("pt-BR", { month: "long" });
        return `${diaInicio} a ${diaFim} de ${mes} de ${fim.getFullYear()}`;
    }

    return `${inicio.toLocaleDateString("pt-BR")} a ${fim.toLocaleDateString("pt-BR")}`;
}

function atualizarNavegadorPeriodo() {
    const hoje = inicioDoDia(new Date());

    if (labelData) {
        labelData.textContent = formatarPeriodo(periodoInicio, periodoFim);
    }

    if (inicioInput) {
        inicioInput.max = chaveData(hoje);
        inicioInput.value = chaveData(periodoInicio);
    }

    if (fimInput) {
        fimInput.max = chaveData(hoje);
        fimInput.value = chaveData(periodoFim);
        fimInput.min = chaveData(periodoInicio);
    }

    if (btnProxima) {
        const estaNoHoje = periodoFim >= hoje;
        btnProxima.disabled = estaNoHoje;
        btnProxima.setAttribute("aria-disabled", String(estaNoHoje));
    }
}

function abrirPeriodoPersonalizado() {
    if (!periodoCustom) return;
    periodoCustom.hidden = !periodoCustom.hidden;
    atualizarNavegadorPeriodo();

}

function fecharPeriodoPersonalizado() {
    if (periodoCustom) periodoCustom.hidden = true;
}

function aplicarPeriodo(inicio, fim, { carregar = true } = {}) {
    const hoje = inicioDoDia(new Date());
    let novoInicio = inicioDoDia(inicio);
    let novoFim = inicioDoDia(fim);

    if (novoInicio > novoFim) [novoInicio, novoFim] = [novoFim, novoInicio];
    if (novoFim > hoje) novoFim = hoje;
    if (novoInicio > hoje) novoInicio = hoje;

    periodoInicio = novoInicio;
    periodoFim = novoFim;
    atualizarNavegadorPeriodo();

    if (carregar) carregarRelatorio();
}

function irPeriodoAnterior() {
    const dias = diasNoPeriodo();
    const novoFim = somarDias(periodoInicio, -1);
    const novoInicio = somarDias(novoFim, -(dias - 1));
    fecharPeriodoPersonalizado();
    aplicarPeriodo(novoInicio, novoFim);
}

function irProximoPeriodo() {
    const hoje = inicioDoDia(new Date());
    if (periodoFim >= hoje) return;

    const dias = diasNoPeriodo();
    let novoInicio = somarDias(periodoFim, 1);
    let novoFim = somarDias(novoInicio, dias - 1);

    if (novoFim > hoje) {
        novoFim = hoje;
        novoInicio = somarDias(novoFim, -(dias - 1));
    }

    fecharPeriodoPersonalizado();
    aplicarPeriodo(novoInicio, novoFim);
}

function validarPeriodoDosInputs() {
    const inicio = dataDeInput(inicioInput?.value);
    const fim = dataDeInput(fimInput?.value);
    const hoje = inicioDoDia(new Date());

    if (!inicio || !fim) throw new Error("Selecione as duas datas.");
    if (inicio > fim) throw new Error("A data inicial não pode ser maior que a final.");
    if (fim > hoje) throw new Error("O relatório não pode usar uma data futura.");

    return { inicio, fim };
}

function agrupar(lista, chaveFn, valorFn = () => 1) {
    const mapa = new Map();

    lista.forEach((item) => {
        const chave = chaveFn(item) || "Outros";
        mapa.set(chave, (mapa.get(chave) || 0) + Number(valorFn(item) || 0));
    });

    return [...mapa.entries()].sort((a, b) => b[1] - a[1]);
}

function nomeSnapshotProfissional(uid) {
    if (!uid) return "";

    const registro = (state.atendimentos || []).find((atendimento) => {
        if (atendimento?.profissionalUid !== uid) return false;

        const nome = String(atendimento?.profissionalNome || "").trim();
        if (!nome) return false;

        return !nome.includes("@");
    });

    return String(registro?.profissionalNome || "").trim();
}

function nomeMembro(membro) {
    const uid = membro?.uid || membro?.id;

    if (uid === state.user?.uid) {
        const atual = String(
            state.perfilUsuario?.nome ||
            state.membroAtual?.nome ||
            state.user?.displayName ||
            nomeSnapshotProfissional(uid) ||
            ""
        ).trim();

        if (atual && !atual.includes("@")) return atual;
    }

    const nome = String(membro?.nome || "").trim();
    if (nome && !nome.includes("@")) return nome;

    const snapshot = nomeSnapshotProfissional(uid);
    if (snapshot) return snapshot;

    return String(membro?.email || "Profissional").trim();
}

function profissionalEhDono(uid, atendimento = null) {
    if (!uid) return false;

    if (
        atendimento?.profissionalDono === true ||
        atendimento?.financeiro?.profissionalDono === true
    ) return true;

    if (uid === state.membroAtual?.uid || uid === state.membroAtual?.id) {
        if (state.membroAtual?.dono === true) return true;
    }

    const membro = (state.equipe || [])
        .find((item) => (item.uid || item.id) === uid);
    return membro?.dono === true;
}

async function prepararSeletorProfissional() {
    if (!profissionalSelect || !profissionalField) return;

    if (!podeAdministrarNaVisaoAtual()) {
        profissionalField.hidden = true;
        profissionalSelect.innerHTML = "";
        return;
    }

    profissionalField.hidden = false;
    const valorAnterior = profissionalSelect.value || "barbearia";
    const membros = (state.equipe || []).length
        ? state.equipe
        : await listarMembrosEquipe();
    const ativos = membros
        .filter((membro) => membro.ativo === true)
        .sort((a, b) => nomeMembro(a).localeCompare(nomeMembro(b), "pt-BR"));

    profissionalSelect.innerHTML = '<option value="barbearia">Barbearia</option>';

    ativos.forEach((membro) => {
        const option = document.createElement("option");
        option.value = membro.uid || membro.id;
        option.textContent = nomeMembro(membro);
        profissionalSelect.appendChild(option);
    });

    const existe = [...profissionalSelect.options]
        .some((option) => option.value === valorAnterior);

    profissionalSelect.value = existe ? valorAnterior : "barbearia";
}

function coresGrafico() {
    const estilo = getComputedStyle(document.documentElement);
    const principal = estilo.getPropertyValue("--primary").trim() || "#2563eb";
    const sucesso = estilo.getPropertyValue("--success").trim() || "#22c55e";
    const aviso = estilo.getPropertyValue("--warning").trim() || "#fbbf24";
    const texto = estilo.getPropertyValue("--text-secondary").trim() || "#8a8a8a";
    const borda = estilo.getPropertyValue("--border").trim() || "rgba(128,128,128,.25)";

    return {
        principal,
        sucesso,
        aviso,
        texto,
        borda,
        // Ordem visual pedida: 1º amarelo, 2º verde, 3º azul.
        paleta: [aviso, sucesso, principal, "#8b5cf6", "#06b6d4", "#f97316", "#ec4899", "#64748b"]
    };
}

function destruirGrafico(nome) {
    if (!charts[nome]) return;
    charts[nome].destroy();
    charts[nome] = null;
}

function graficoLinhaDiaria(atendimentos, inicio, fim) {
    destruirGrafico("faturamento");
    const canvas = el("graficoRelatorioFaturamento");
    if (!canvas || typeof Chart === "undefined") return;

    const porDia = new Map();

    atendimentos.forEach((atendimento) => {
        const data = obterDataAtendimento(atendimento);
        if (!data) return;

        const chave = chaveData(data);
        porDia.set(
            chave,
            (porDia.get(chave) || 0) + obterBrutoAtendimento(atendimento)
        );
    });

    const labels = [];
    const dados = [];
    let cursor = inicioDoDia(inicio);

    while (cursor <= fim) {
        const chave = chaveData(cursor);
        labels.push(cursor.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }));
        dados.push(Number((porDia.get(chave) || 0).toFixed(2)));
        cursor = somarDias(cursor, 1);
    }

    const c = coresGrafico();

    charts.faturamento = new Chart(canvas, {
        type: "line",
        data: {
            labels,
            datasets: [{
                label: "Faturamento bruto",
                data: dados,
                borderColor: c.principal,
                backgroundColor: `${c.principal}22`,
                fill: true,
                tension: 0.32,
                pointRadius: 3,
                pointHoverRadius: 5
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: (ctx) => moeda(ctx.raw)
                    }
                }
            },
            scales: {
                x: {
                    ticks: { color: c.texto, maxTicksLimit: 7 },
                    grid: { display: false }
                },
                y: {
                    beginAtZero: true,
                    ticks: {
                        color: c.texto,
                        callback: (v) => `R$ ${Number(v).toLocaleString("pt-BR")}`
                    },
                    grid: { color: c.borda }
                }
            }
        }
    });
}

function graficoRosca(nome, canvasId, entradas, labelFn) {
    destruirGrafico(nome);
    const canvas = el(canvasId);
    if (!canvas || typeof Chart === "undefined") return;

    const dados = entradas.length ? entradas : [["Sem dados", 1]];
    const c = coresGrafico();
    const semDados = !entradas.length;

    charts[nome] = new Chart(canvas, {
        type: "doughnut",
        data: {
            labels: dados.map(([rotulo]) => rotulo),
            datasets: [{
                data: dados.map(([, valor]) => valor),
                backgroundColor: semDados
                    ? [c.borda]
                    : dados.map((_, indice) => c.paleta[indice % c.paleta.length]),
                borderWidth: 0,
                hoverOffset: semDados ? 0 : 6,
                spacing: semDados ? 0 : 3
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: "67%",
            layout: { padding: 18 },
            plugins: {
                legend: { display: false },
                tooltip: {
                    enabled: !semDados,
                    callbacks: {
                        label: (ctx) => labelFn ? labelFn(ctx) : String(ctx.raw)
                    }
                }
            }
        }
    });
}

function renderRanking(
    containerId,
    entradas,
    { totalBase = 0, valorMonetario = false, subtituloFn = null } = {}
) {
    const container = el(containerId);
    if (!container) return;

    container.innerHTML = "";

    if (!entradas.length) {
        container.innerHTML =
            '<div class="relatorio-ranking-vazio">Sem dados no período.</div>';
        return;
    }

    const c = coresGrafico();

    entradas.forEach(([nome, valor], indice) => {
        const item = document.createElement("div");
        item.className = "relatorio-ranking-item";

        const percentual =
            totalBase > 0
                ? (Number(valor) / totalBase) * 100
                : 0;

        const valorTexto =
            valorMonetario
                ? moeda(valor)
                : `${Number(valor)} atendimento${Number(valor) === 1 ? "" : "s"}`;

        const sub =
            subtituloFn
                ? subtituloFn(nome, valor)
                : `${percentual.toFixed(1).replace(".", ",")}%`;

        const cor = c.paleta[indice % c.paleta.length];

        item.innerHTML = `
            <span class="relatorio-ranking-pos" style="--rank-color:${cor}">${indice + 1}</span>
            <div class="relatorio-ranking-copy">
                <strong>${escaparHtml(nome)}</strong>
                <small>${escaparHtml(sub)}</small>
            </div>
            <strong class="relatorio-ranking-value">${escaparHtml(valorTexto)}</strong>
        `;

        container.appendChild(item);
    });
}

function calcularResumo(atendimentos, despesas, visaoBarbearia) {
    const faturamento =
        atendimentos.reduce((soma, atendimento) =>
            soma + obterBrutoAtendimento(atendimento), 0);

    const taxas =
        atendimentos.reduce((soma, atendimento) =>
            soma + obterTaxaCartaoValor(atendimento), 0);

    const repasse =
        atendimentos.reduce((soma, atendimento) =>
            soma + obterRepasseAtendimento(atendimento), 0);

    const liquidoBarbeiro =
        atendimentos.reduce((soma, atendimento) =>
            soma + obterLiquidoBarbeiro(atendimento), 0);

    const despesasConsideradas =
        despesas.filter((despesa) =>
            visaoBarbearia
                ? despesa.tipo === "barbearia"
                : despesa.tipo !== "barbearia"
        );

    const totalDespesas =
        despesasConsideradas.reduce((soma, despesa) =>
            soma + Number(despesa.valor || 0), 0);

    const ticket =
        atendimentos.length
            ? faturamento / atendimentos.length
            : 0;

    const resultado =
        visaoBarbearia
            ? repasse
            : liquidoBarbeiro - totalDespesas;

    return {
        faturamento,
        taxas,
        repasse,
        liquidoBarbeiro,
        totalDespesas,
        despesasConsideradas,
        ticket,
        resultado
    };
}


function percentual(valor) {
    return `${Number(valor || 0).toFixed(2).replace(".", ",")}%`;
}

function criarFechamentoDadosCompletos(relatorio) {
    return calcularFechamentoFinanceiro({
        atendimentos: relatorio?.atendimentos || [],
        despesas: relatorio?.despesas || [],
        vendas: relatorio?.vendas || [],
        visaoBarbearia: relatorio?.visaoBarbearia === true,
        ehProfissionalDono: profissionalEhDono,
        nomeProfissional: (_uid, atendimento) => nomeProfissionalAtendimento(atendimento)
    });
}

function criarFechamentoResumos(resumo, visaoBarbearia, vendas = []) {
    const bruto = Number(resumo?.faturamento || 0);
    const taxas = Number(resumo?.taxas || 0);
    const repasse = Number(resumo?.repasse || 0);
    const despesas = Number(resumo?.totalDespesas || 0);
    const liquidoAposTaxas = bruto - taxas;
    const equipe = Array.isArray(resumo?.equipe) ? resumo.equipe : [];
    const produtos = calcularResumoVendasProdutos(vendas, { visaoBarbearia });

    const producaoDonoLiquida = visaoBarbearia
        ? equipe.filter((item) => item.dono).reduce((soma, item) => soma + Number(item.liquido || 0), 0)
        : 0;
    const valorServicosProfissional = visaoBarbearia ? 0 : Number(resumo?.liquidoBarbeiro || 0);
    const receitaServicosBarbearia = visaoBarbearia ? producaoDonoLiquida + repasse : 0;
    const totalProfissional = valorServicosProfissional + produtos.comissaoProfissional;
    const receitaAntesDespesas = visaoBarbearia
        ? receitaServicosBarbearia + produtos.resultadoBarbearia
        : totalProfissional;
    const resultadoLiquido = receitaAntesDespesas - despesas;
    const baseMargem = visaoBarbearia ? bruto + produtos.vendasBrutas : bruto;
    const margemLiquida = baseMargem > 0 ? (resultadoLiquido / baseMargem) * 100 : 0;

    return {
        faturamentoBruto: bruto,
        taxasCartao: taxas,
        liquidoAposTaxas,
        repasse,
        repasseEquipe: visaoBarbearia ? repasse : 0,
        repasseRecebido: visaoBarbearia ? repasse : 0,
        repasseBarbearia: visaoBarbearia ? 0 : repasse,
        producaoDonoLiquida,
        valorServicosProfissional,
        totalProfissional,
        receitaServicosBarbearia,
        receitaAntesDespesas,
        totalDespesas: despesas,
        resultadoLiquido,
        resultadoAposCustos: resultadoLiquido,
        margemLiquida,
        ticketMedio: Number(resumo?.ticket || 0),
        atendimentos: Number(resumo?.totalAtendimentos || 0),
        produtos,
        pagamentos: (resumo?.pagamentos || []).map(([nome, valor]) => ({
            nome,
            bruto: Number(valor || 0),
            taxas: null,
            liquidoAposTaxas: null,
            quantidade: null
        })),
        despesasPorCategoria: despesas > 0
            ? [{ nome: "Total do período", valor: despesas, agregado: true }]
            : [],
        equipe: equipe.map((item) => ({
            uid: item.uid,
            nome: item.nome,
            dono: Boolean(item.dono),
            quantidade: Number(item.qtd || 0),
            bruto: Number(item.faturamento || 0),
            taxas: Number(item.taxas || 0),
            repasse: Number(item.repasse || 0)
        }))
    };
}

function renderizarListaFechamento(containerId, html) {
    const container = el(containerId);
    if (!container) return;
    container.innerHTML = html || '<div class="fechamento-lista-vazia">Sem movimentação neste período.</div>';
}

function renderizarFechamento(relatorio) {
    const fechamento = relatorio?.fechamento;
    if (!fechamento) return;

    const admin = relatorio.visaoBarbearia === true;
    const produtos = fechamento.produtos || {};

    setTexto("fechamentoPeriodoLabel", formatarPeriodo(relatorio.inicio, relatorio.fim));
    setTexto("fechamentoResultadoLabel", admin ? "Resultado líquido" : "Total do profissional");
    setTexto("fechamentoPagamentosDescricao", admin ? "Bruto e líquido após taxas" : "Bruto, taxas pagas e líquido após taxas");
    setTexto("fechamentoBruto", moeda(fechamento.faturamentoBruto));

    const margemBox = el("fechamentoMargemBox");
    if (margemBox) margemBox.hidden = !admin;
    setTexto("fechamentoMargem", percentual(fechamento.margemLiquida));

    if (admin) {
        setTexto("fechamentoResultado", moeda(fechamento.resultadoLiquido));
        setTexto("fechamentoBrutoLabel", "Faturamento bruto");
        setTexto("fechamentoTaxasLabel", "Líquido após taxas");
        setTexto("fechamentoTaxas", moeda(fechamento.liquidoAposTaxas));
        setTexto("fechamentoRepasseLabel", "Repasse da Equipe");
        setTexto("fechamentoRepasse", moeda(fechamento.repasseEquipe ?? fechamento.repasse));
        setTexto("fechamentoQuartoLabel", "Despesas da barbearia");
        setTexto("fechamentoDespesas", moeda(fechamento.totalDespesas));
    } else {
        setTexto("fechamentoResultado", moeda(fechamento.totalProfissional));
        setTexto("fechamentoBrutoLabel", "Produção bruta");
        setTexto("fechamentoTaxasLabel", "Taxas de pagamento");
        setTexto("fechamentoTaxas", moeda(fechamento.taxasCartao));
        setTexto("fechamentoRepasseLabel", "Repasse à barbearia");
        setTexto("fechamentoRepasse", moeda(fechamento.repasseBarbearia));
        setTexto("fechamentoQuartoLabel", "Valor dos serviços");
        setTexto("fechamentoDespesas", moeda(fechamento.valorServicosProfissional));
    }

    const fluxo = el("fechamentoFluxo");
    if (fluxo) {
        const linhas = admin
            ? [
                { label: "Faturamento bruto de serviços", valor: fechamento.faturamentoBruto },
                { label: "Líquido após taxas", valor: fechamento.liquidoAposTaxas, subtotal: true },
                { label: "Repasse da Equipe", valor: fechamento.repasseEquipe ?? fechamento.repasse, subtotal: true },
                ...(Number(produtos.vendasBrutas || 0) > 0 ? [
                    { label: "Resultado com produtos", valor: produtos.resultadoBarbearia, subtotal: true }
                ] : []),
                { label: "Despesas da barbearia", valor: fechamento.totalDespesas, minus: true },
                { label: "Resultado líquido", valor: fechamento.resultadoLiquido, total: true }
            ]
            : [
                { label: "Produção bruta", valor: fechamento.faturamentoBruto },
                { label: "Taxas de pagamento", valor: fechamento.taxasCartao, minus: true },
                { label: "Líquido após taxas", valor: fechamento.liquidoAposTaxas, subtotal: true },
                { label: "Repasse à barbearia", valor: fechamento.repasseBarbearia, minus: true },
                { label: "Valor dos serviços", valor: fechamento.valorServicosProfissional, subtotal: true },
                ...(Number(produtos.comissaoProfissional || 0) > 0 ? [
                    { label: "Comissão em produtos", valor: produtos.comissaoProfissional, subtotal: true }
                ] : []),
                { label: "Total do profissional", valor: fechamento.totalProfissional, total: true }
            ];

        fluxo.innerHTML = linhas.map((linha) => `
            <div class="fechamento-fluxo-linha${linha.minus ? " is-minus" : ""}${linha.subtotal ? " is-subtotal" : ""}${linha.total ? " is-total" : ""}">
                <span>${escaparHtml(linha.label)}</span>
                <strong>${linha.minus && Number(linha.valor || 0) > 0 ? "- " : ""}${moeda(linha.valor)}</strong>
            </div>
        `).join("");
    }

    renderizarListaFechamento(
        "fechamentoPagamentosLista",
        (fechamento.pagamentos || []).map((item) => admin
            ? `
                <div class="fechamento-lista-item">
                    <div><strong>${escaparHtml(item.nome)}</strong><small>${item.quantidade == null ? "Faturamento no período" : `${item.quantidade} pagamento${item.quantidade === 1 ? "" : "s"}`}</small></div>
                    <div><strong>${moeda(item.bruto)}</strong><span class="fechamento-item-taxa">${Number.isFinite(item.liquidoAposTaxas) ? `Líquido ${moeda(item.liquidoAposTaxas)}` : "Incluído no líquido do período"}</span></div>
                </div>`
            : `
                <div class="fechamento-lista-item">
                    <div><strong>${escaparHtml(item.nome)}</strong><small>${item.quantidade == null ? "Faturamento no período" : `${item.quantidade} pagamento${item.quantidade === 1 ? "" : "s"}`} • líquido ${Number.isFinite(item.liquidoAposTaxas) ? moeda(item.liquidoAposTaxas) : "incluído no total"}</small></div>
                    <div><strong>${moeda(item.bruto)}</strong><span class="fechamento-item-taxa">${Number.isFinite(item.taxas) ? `Taxas - ${moeda(item.taxas)}` : "Taxas no total geral"}</span></div>
                </div>`
        ).join("")
    );

    const equipeCard = el("fechamentoEquipeCard");
    if (equipeCard) equipeCard.hidden = !admin;
    if (admin) {
        renderizarListaFechamento(
            "fechamentoEquipeLista",
            (fechamento.equipe || []).map((item) => `
                <div class="fechamento-lista-item">
                    <div><strong>${escaparHtml(item.nome)}${item.dono ? " • dono" : ""}</strong><small>${item.quantidade} atendimento${item.quantidade === 1 ? "" : "s"}</small></div>
                    <div><strong>${moeda(item.bruto)}</strong><span class="fechamento-item-taxa">Repasse ${moeda(item.repasse)}</span></div>
                </div>
            `).join("")
        );
    }

    const produtosCard = el("fechamentoProdutosCard");
    const temProdutos = Number(produtos.quantidadeVendas || 0) > 0;
    if (produtosCard) produtosCard.hidden = !temProdutos;
    if (temProdutos) {
        if (el("fechamentoProdutosDescricao")) {
            el("fechamentoProdutosDescricao").textContent = admin
                ? "Vendas, custo, comissão e resultado dos produtos"
                : "Vendas realizadas e comissão do profissional";
        }
        const linhasProduto = admin
            ? [
                ["Vendas de produtos", produtos.vendasBrutas],
                ["Líquido após taxas", produtos.liquidoAposTaxas],
                ["Custo dos produtos", produtos.custoProdutos, true],
                ["Comissões da equipe", produtos.comissoesEquipe, true],
                ["Resultado com produtos", produtos.resultadoBarbearia]
            ]
            : [
                ["Vendas realizadas", produtos.vendasBrutas],
                ["Comissão em produtos", produtos.comissaoProfissional]
            ];
        renderizarListaFechamento("fechamentoProdutosLista", linhasProduto.map(([label, valor, negativo]) => `
            <div class="fechamento-lista-item"><div><strong>${escaparHtml(label)}</strong><small>${label === "Resultado com produtos" && admin ? "Já considera custo, comissão e taxas das vendas" : "No período selecionado"}</small></div><span>${negativo && Number(valor || 0) > 0 ? "- " : ""}${moeda(valor)}</span></div>
        `).join(""));
    }

    const comissoesCard = el("fechamentoComissoesCard");
    if (comissoesCard) comissoesCard.hidden = !admin || !(produtos.porProfissional || []).length;
    if (admin && (produtos.porProfissional || []).length) {
        renderizarListaFechamento("fechamentoComissoesLista", produtos.porProfissional.map((item) => `
            <div class="fechamento-lista-item"><div><strong>${escaparHtml(item.nome)}</strong><small>${item.vendas} venda${item.vendas === 1 ? "" : "s"} • bruto ${moeda(item.bruto)}</small></div><span>${moeda(item.comissao)}</span></div>
        `).join(""));
    }

    const custosProfissionaisCard = el("fechamentoCustosProfissionaisCard");
    if (custosProfissionaisCard) custosProfissionaisCard.hidden = admin;
    if (!admin) {
        const listaCustos = [
            ...(fechamento.despesasPorCategoria || []).map((item) => ({ nome: item.nome, valor: item.valor, agregado: item.agregado })),
            { nome: "Resultado após custos", valor: fechamento.resultadoAposCustos, resultado: true }
        ];
        renderizarListaFechamento("fechamentoCustosProfissionaisLista", listaCustos.map((item) => `
            <div class="fechamento-lista-item${item.resultado ? " is-total" : ""}"><div><strong>${escaparHtml(item.nome)}</strong><small>${item.resultado ? "Total do profissional menos despesas profissionais" : (item.agregado ? "Detalhamento indisponível no resumo consolidado" : "Custo profissional após o cálculo do repasse")}</small></div><span>${item.resultado ? moeda(item.valor) : `- ${moeda(item.valor)}`}</span></div>
        `).join(""));
    }

    const despesasCard = el("fechamentoDespesasCard");
    if (despesasCard) despesasCard.hidden = !admin;
    if (admin) {
        renderizarListaFechamento(
            "fechamentoDespesasLista",
            (fechamento.despesasPorCategoria || []).map((item) => `
                <div class="fechamento-lista-item"><div><strong>${escaparHtml(item.nome)}</strong><small>${item.agregado ? "Detalhamento por categoria indisponível no resumo consolidado" : "Despesa da barbearia no período"}</small></div><span>${moeda(item.valor)}</span></div>
            `).join("")
        );
    }
}

function selecionarAbaRelatorio(aba) {
    abaRelatorioAtual = aba === "fechamento" ? "fechamento" : "analise";
    const fechamentoAtivo = abaRelatorioAtual === "fechamento";

    if (painelAnalise) painelAnalise.hidden = fechamentoAtivo;
    if (painelFechamento) painelFechamento.hidden = !fechamentoAtivo;

    btnAbaAnalise?.classList.toggle("active", !fechamentoAtivo);
    btnAbaAnalise?.setAttribute("aria-selected", String(!fechamentoAtivo));
    btnAbaFechamento?.classList.toggle("active", fechamentoAtivo);
    btnAbaFechamento?.setAttribute("aria-selected", String(fechamentoAtivo));
}

function calcularAjustes(atendimentos) {
    let quantidade = 0;
    let diferenca = 0;

    atendimentos.forEach((atendimento) => {
        const esperado = Number(
            atendimento.precoProfissional ??
            atendimento.precoBase
        );

        const bruto = obterBrutoAtendimento(atendimento);

        const ajustado =
            atendimento.valorDiferenciado === true ||
            atendimento.origemPreco === "ajustado" ||
            (
                Number.isFinite(esperado) &&
                esperado > 0 &&
                Math.abs(bruto - esperado) > 0.009
            );

        if (!ajustado || !Number.isFinite(esperado) || esperado <= 0) return;

        quantidade += 1;
        diferenca += bruto - esperado;
    });

    return { quantidade, diferenca };
}

function nomeProfissionalAtendimento(atendimento) {
    const uid = atendimento?.profissionalUid;

    if (!uid) {
        return "Registros antigos sem profissional";
    }

    if (uid === state.user?.uid) {
        return String(
            state.perfilUsuario?.nome ||
            state.membroAtual?.nome ||
            atendimento.profissionalNome ||
            state.user?.displayName ||
            state.user?.email ||
            "Profissional"
        );
    }

    const membro = (state.equipe || [])
        .find((item) => (item.uid || item.id) === uid);

    return membro
        ? nomeMembro(membro)
        : String(atendimento.profissionalNome || "Profissional");
}

function renderEquipe(atendimentos) {
    const card = el("relatorioEquipeCard");
    const lista = el("relatorioEquipeLista");

    if (!card || !lista) return;

    const exibir =
        podeAdministrarNaVisaoAtual() &&
        profissionalSelect?.value === "barbearia";

    card.hidden = !exibir;
    if (!exibir) return;

    lista.innerHTML = "";
    const mapa = new Map();

    atendimentos.forEach((atendimento) => {
        const uid = atendimento.profissionalUid || "__legado__";

        if (!mapa.has(uid)) {
            mapa.set(uid, {
                nome: nomeProfissionalAtendimento(atendimento),
                qtd: 0,
                faturamento: 0,
                repasse: 0
            });
        }

        const item = mapa.get(uid);
        item.qtd += 1;
        item.faturamento += obterBrutoAtendimento(atendimento);
        item.repasse += obterRepasseAtendimento(atendimento);
    });

    const dados = [...mapa.values()]
        .sort((a, b) => b.faturamento - a.faturamento);

    if (!dados.length) {
        lista.innerHTML =
            '<div class="relatorio-ranking-vazio">Sem produção no período.</div>';
        return;
    }

    dados.forEach((item) => {
        const linha = document.createElement("div");
        linha.className = "relatorio-equipe-item";
        linha.innerHTML = `
            <div>
                <strong>${escaparHtml(item.nome)}</strong>
                <span>${item.qtd} atendimento${item.qtd === 1 ? "" : "s"}</span>
            </div>
            <div>
                <strong>${moeda(item.faturamento)}</strong>
                <span>Repasse ${moeda(item.repasse)}</span>
            </div>
        `;
        lista.appendChild(linha);
    });
}

function renderizar(relatorio) {
    const {
        atendimentos,
        despesas,
        inicio,
        fim,
        visaoBarbearia
    } = relatorio;

    const resumo =
        calcularResumo(
            atendimentos,
            despesas,
            visaoBarbearia
        );

    const ajustes =
        calcularAjustes(atendimentos);

    setTexto(
        "relatorioResultadoLabel",
        visaoBarbearia
            ? "Repasse previsto"
            : "Resultado profissional"
    );

    setTexto(
        "relatorioResultado",
        moeda(resumo.resultado)
    );

    const detalheResultado = el("relatorioResultadoDetalhe");

    if (detalheResultado) {
        detalheResultado.hidden = true;
        detalheResultado.textContent = "";
    }

    // A visão já está identificada no select. Aqui mostramos somente o período.
    setTexto(
        "relatorioPeriodoLabel",
        formatarPeriodo(inicio, fim)
    );

    setTexto("relatorioFaturamento", moeda(resumo.faturamento));
    setTexto("relatorioAtendimentos", String(atendimentos.length));
    setTexto("relatorioTicket", moeda(resumo.ticket));
    setTexto("relatorioDespesas", moeda(resumo.totalDespesas));
    setTexto("relatorioAjustesQtd", String(ajustes.quantidade));
    setTexto("relatorioAjustesValor", moedaSinal(ajustes.diferenca));

    const servicosQtd =
        agrupar(
            atendimentos,
            (a) => a.servicoNome || a.servico || "Outros"
        );

    const servicosFaturamento =
        new Map(
            agrupar(
                atendimentos,
                (a) => a.servicoNome || a.servico || "Outros",
                obterBrutoAtendimento
            )
        );

    const pagamentos =
        agrupar(
            atendimentos,
            (a) => a.pagamento || "Outros",
            obterBrutoAtendimento
        );

    renderEquipe(atendimentos);
    graficoLinhaDiaria(atendimentos, inicio, fim);

    graficoRosca(
        "servicos",
        "graficoRelatorioServicos",
        servicosQtd,
        (ctx) =>
            `${ctx.raw} atendimento${ctx.raw === 1 ? "" : "s"}`
    );

    graficoRosca(
        "pagamentos",
        "graficoRelatorioPagamentos",
        pagamentos,
        (ctx) => moeda(ctx.raw)
    );

    renderRanking(
        "relatorioServicosLista",
        servicosQtd,
        {
            totalBase: atendimentos.length,
            subtituloFn: (nome, qtd) => {
                const percentual =
                    atendimentos.length
                        ? (qtd / atendimentos.length) * 100
                        : 0;

                return `${percentual.toFixed(1).replace(".", ",")}% • bruto ${moeda(servicosFaturamento.get(nome) || 0)}`;
            }
        }
    );

    renderRanking(
        "relatorioPagamentosLista",
        pagamentos,
        {
            totalBase: resumo.faturamento,
            valorMonetario: true
        }
    );

    relatorio.resumo = resumo;
    relatorio.ajustes = ajustes;
    relatorio.fechamento = criarFechamentoDadosCompletos(relatorio);
    renderizarFechamento(relatorio);
}

function usarResumosNoRelatorio() {
    // Homologação controlada: o ambiente de teste já começou limpo.
    // Produção continua lendo os registros antigos até a migração ser validada.
    return String(obterWorkspaceId() || "").startsWith("teste-");
}

function centavosParaReais(valor) {
    return Number(valor || 0) / 100;
}

function somarMapaPorNome(destino, resumo, campoValores, campoNomes) {
    const valores = resumo?.[campoValores] || {};
    const nomes = resumo?.[campoNomes] || {};

    Object.entries(valores).forEach(([chave, valor]) => {
        const numero = Number(valor || 0);
        if (!numero) return;

        const nome = String(nomes[chave] || chave || "Outros").trim() || "Outros";
        destino.set(nome, (destino.get(nome) || 0) + numero);
    });
}

function nomeProfissionalResumo(resumo) {
    const uid = resumo?.profissionalUid;
    const membro = (state.equipe || [])
        .find((item) => (item.uid || item.id) === uid);

    if (membro) return nomeMembro(membro);

    const snapshot = String(resumo?.profissionalNome || "").trim();
    return snapshot || "Profissional";
}

function consolidarResumos(resumos, resumosBarbearia, visaoBarbearia) {
    const dados = {
        faturamento: 0,
        taxas: 0,
        repasse: 0,
        liquidoBarbeiro: 0,
        totalDespesas: 0,
        totalAtendimentos: 0,
        ticket: 0,
        resultado: 0,
        ajustesQuantidade: 0,
        ajustesDiferenca: 0,
        servicosQtd: new Map(),
        servicosFaturamento: new Map(),
        pagamentos: new Map(),
        porDia: new Map(),
        equipe: new Map()
    };

    (resumos || []).forEach((resumo) => {
        const qtd = Math.max(0, Number(resumo?.atendimentos || 0));
        const bruto = centavosParaReais(resumo?.faturamentoBrutoCentavos);
        const taxas = centavosParaReais(resumo?.taxasCartaoCentavos);
        const repasse = centavosParaReais(resumo?.repasseCentavos);
        const liquido = centavosParaReais(resumo?.liquidoBarbeiroCentavos);

        dados.totalAtendimentos += qtd;
        dados.faturamento += bruto;
        dados.taxas += taxas;
        dados.repasse += repasse;
        dados.liquidoBarbeiro += liquido;
        dados.ajustesQuantidade += Math.max(0, Number(resumo?.ajustesQuantidade || 0));
        dados.ajustesDiferenca += centavosParaReais(resumo?.ajustesDiferencaCentavos);

        if (!visaoBarbearia) {
            dados.totalDespesas += centavosParaReais(resumo?.despesasProfissionaisCentavos);
        }

        const dia = String(resumo?.dataChave || resumo?.id || "").trim();
        if (dia) dados.porDia.set(dia, (dados.porDia.get(dia) || 0) + bruto);

        somarMapaPorNome(dados.servicosQtd, resumo, "servicosQtd", "servicosNomes");
        somarMapaPorNome(
            dados.servicosFaturamento,
            resumo,
            "servicosFaturamentoCentavos",
            "servicosNomes"
        );
        somarMapaPorNome(
            dados.pagamentos,
            resumo,
            "pagamentosValorCentavos",
            "pagamentosNomes"
        );

        if (visaoBarbearia && resumo?.profissionalUid) {
            const uid = resumo.profissionalUid;
            if (!dados.equipe.has(uid)) {
                dados.equipe.set(uid, {
                    uid,
                    nome: nomeProfissionalResumo(resumo),
                    dono: profissionalEhDono(uid),
                    qtd: 0,
                    faturamento: 0,
                    taxas: 0,
                    repasse: 0,
                    liquido: 0
                });
            }

            const item = dados.equipe.get(uid);
            item.qtd += qtd;
            item.faturamento += bruto;
            item.taxas += taxas;
            item.repasse += repasse;
            item.liquido += liquido;
        }
    });

    if (visaoBarbearia) {
        dados.totalDespesas = (resumosBarbearia || []).reduce(
            (soma, resumo) => soma + centavosParaReais(resumo?.despesasBarbeariaCentavos),
            0
        );
    }

    dados.ticket = dados.totalAtendimentos
        ? dados.faturamento / dados.totalAtendimentos
        : 0;

    dados.resultado = visaoBarbearia
        ? dados.repasse
        : dados.liquidoBarbeiro - dados.totalDespesas;

    dados.servicosQtd = [...dados.servicosQtd.entries()]
        .filter(([, valor]) => Number(valor) > 0)
        .sort((a, b) => b[1] - a[1]);

    dados.servicosFaturamento = new Map(
        [...dados.servicosFaturamento.entries()]
            .map(([nome, valorCentavos]) => [nome, Number(valorCentavos || 0) / 100])
    );

    dados.pagamentos = [...dados.pagamentos.entries()]
        .map(([nome, valorCentavos]) => [nome, Number(valorCentavos || 0) / 100])
        .filter(([, valor]) => Number(valor) > 0)
        .sort((a, b) => b[1] - a[1]);

    dados.equipe = [...dados.equipe.values()]
        .filter((item) => item.qtd > 0 || item.faturamento !== 0 || item.repasse !== 0 || item.liquido !== 0)
        .sort((a, b) => b.faturamento - a.faturamento);

    return dados;
}

function graficoLinhaDiariaResumos(resumo, inicio, fim) {
    destruirGrafico("faturamento");
    const canvas = el("graficoRelatorioFaturamento");
    if (!canvas || typeof Chart === "undefined") return;

    const labels = [];
    const dados = [];
    let cursor = inicioDoDia(inicio);

    while (cursor <= fim) {
        const chave = chaveData(cursor);
        labels.push(cursor.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }));
        dados.push(Number((resumo.porDia.get(chave) || 0).toFixed(2)));
        cursor = somarDias(cursor, 1);
    }

    const c = coresGrafico();

    charts.faturamento = new Chart(canvas, {
        type: "line",
        data: {
            labels,
            datasets: [{
                label: "Faturamento bruto",
                data: dados,
                borderColor: c.principal,
                backgroundColor: `${c.principal}22`,
                fill: true,
                tension: 0.32,
                pointRadius: 3,
                pointHoverRadius: 5
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: { callbacks: { label: (ctx) => moeda(ctx.raw) } }
            },
            scales: {
                x: {
                    ticks: { color: c.texto, maxTicksLimit: 7 },
                    grid: { display: false }
                },
                y: {
                    beginAtZero: true,
                    ticks: {
                        color: c.texto,
                        callback: (v) => `R$ ${Number(v).toLocaleString("pt-BR")}`
                    },
                    grid: { color: c.borda }
                }
            }
        }
    });
}

function renderEquipeResumos(itens) {
    const card = el("relatorioEquipeCard");
    const lista = el("relatorioEquipeLista");
    if (!card || !lista) return;

    const exibir = podeAdministrarNaVisaoAtual() && profissionalSelect?.value === "barbearia";
    card.hidden = !exibir;
    if (!exibir) return;

    lista.innerHTML = "";

    if (!itens.length) {
        lista.innerHTML = '<div class="relatorio-ranking-vazio">Sem produção no período.</div>';
        return;
    }

    itens.forEach((item) => {
        const linha = document.createElement("div");
        linha.className = "relatorio-equipe-item";
        linha.innerHTML = `
            <div>
                <strong>${escaparHtml(item.nome)}</strong>
                <span>${item.qtd} atendimento${item.qtd === 1 ? "" : "s"}</span>
            </div>
            <div>
                <strong>${moeda(item.faturamento)}</strong>
                <span>Repasse ${moeda(item.repasse)}</span>
            </div>
        `;
        lista.appendChild(linha);
    });
}

function renderizarResumos(relatorio) {
    const resumo = consolidarResumos(
        relatorio.resumos,
        relatorio.resumosBarbearia,
        relatorio.visaoBarbearia
    );

    const ajustes = {
        quantidade: resumo.ajustesQuantidade,
        diferenca: resumo.ajustesDiferenca
    };

    setTexto(
        "relatorioResultadoLabel",
        relatorio.visaoBarbearia ? "Repasse previsto" : "Resultado profissional"
    );
    setTexto("relatorioResultado", moeda(resumo.resultado));

    const detalheResultado = el("relatorioResultadoDetalhe");
    if (detalheResultado) {
        detalheResultado.hidden = true;
        detalheResultado.textContent = "";
    }

    setTexto("relatorioPeriodoLabel", formatarPeriodo(relatorio.inicio, relatorio.fim));
    setTexto("relatorioFaturamento", moeda(resumo.faturamento));
    setTexto("relatorioAtendimentos", String(resumo.totalAtendimentos));
    setTexto("relatorioTicket", moeda(resumo.ticket));
    setTexto("relatorioDespesas", moeda(resumo.totalDespesas));
    setTexto("relatorioAjustesQtd", String(ajustes.quantidade));
    setTexto("relatorioAjustesValor", moedaSinal(ajustes.diferenca));

    renderEquipeResumos(resumo.equipe);
    graficoLinhaDiariaResumos(resumo, relatorio.inicio, relatorio.fim);

    graficoRosca(
        "servicos",
        "graficoRelatorioServicos",
        resumo.servicosQtd,
        (ctx) => `${ctx.raw} atendimento${ctx.raw === 1 ? "" : "s"}`
    );

    graficoRosca(
        "pagamentos",
        "graficoRelatorioPagamentos",
        resumo.pagamentos,
        (ctx) => moeda(ctx.raw)
    );

    renderRanking(
        "relatorioServicosLista",
        resumo.servicosQtd,
        {
            totalBase: resumo.totalAtendimentos,
            subtituloFn: (nome, qtd) => {
                const percentual = resumo.totalAtendimentos
                    ? (qtd / resumo.totalAtendimentos) * 100
                    : 0;

                return `${percentual.toFixed(1).replace(".", ",")}% • bruto ${moeda(resumo.servicosFaturamento.get(nome) || 0)}`;
            }
        }
    );

    renderRanking(
        "relatorioPagamentosLista",
        resumo.pagamentos,
        { totalBase: resumo.faturamento, valorMonetario: true }
    );

    relatorio.resumo = resumo;
    relatorio.ajustes = ajustes;
    relatorio.fechamento = criarFechamentoResumos(resumo, relatorio.visaoBarbearia, relatorio.vendas || []);
    renderizarFechamento(relatorio);
}

async function carregarDadosPorResumos(inicio, fim, visaoBarbearia, profissionalUid) {
    if (!visaoBarbearia) {
        const resumos = await listarResumosProfissionalPorPeriodo(
            profissionalUid,
            inicio,
            fim
        );
        return { resumos, resumosBarbearia: [] };
    }

    const membros = (state.equipe || []).length
        ? state.equipe
        : await listarMembrosEquipe();

    const uids = [...new Set(
        membros
            .map((membro) => String(membro?.uid || membro?.id || "").trim())
            .filter(Boolean)
    )];

    const [porProfissional, resumosBarbearia] = await Promise.all([
        Promise.all(
            uids.map((uid) =>
                listarResumosProfissionalPorPeriodo(uid, inicio, fim)
            )
        ),
        listarResumosBarbeariaPorPeriodo(inicio, fim)
    ]);

    return {
        resumos: porProfissional.flat(),
        resumosBarbearia
    };
}

function obterNomeVisao(uid, visaoBarbearia) {
    if (visaoBarbearia) return "Barbearia";

    if (!uid || uid === state.user?.uid) {
        return (
            state.perfilUsuario?.nome ||
            state.membroAtual?.nome ||
            state.user?.displayName ||
            "Meu desempenho"
        );
    }

    const membro =
        (state.equipe || [])
            .find((item) => (item.uid || item.id) === uid);

    return nomeMembro(membro);
}

export async function carregarRelatorio() {
    const inicio = inicioDoDia(periodoInicio);
    const fim = inicioDoDia(periodoFim);

    const admin = podeAdministrarNaVisaoAtual();
    const selecao =
        admin
            ? (profissionalSelect?.value || "barbearia")
            : state.user?.uid;

    const visaoBarbearia =
        admin &&
        selecao === "barbearia";

    const profissionalUid =
        visaoBarbearia
            ? null
            : selecao;

    setCarregando(true);
    setStatus();

    try {
        if (usarResumosNoRelatorio()) {
            const [{ resumos, resumosBarbearia }, vendas] = await Promise.all([
                carregarDadosPorResumos(inicio, fim, visaoBarbearia, profissionalUid),
                listarVendasPorPeriodo(inicio, fim, { profissionalUid: visaoBarbearia ? null : profissionalUid })
            ]);

            relatorioAtual = {
                inicio,
                fim,
                resumos,
                resumosBarbearia,
                vendas,
                visaoBarbearia,
                profissionalUid,
                modoResumos: true,
                nomeVisao: obterNomeVisao(profissionalUid, visaoBarbearia)
            };

            renderizarResumos(relatorioAtual);
            return;
        }

        const [atendimentos, despesas, vendas] =
            await Promise.all([
                obterAtendimentosPeriodo(
                    inicio,
                    fim,
                    { profissionalUid }
                ),
                listarDespesasPorPeriodo(
                    inicio,
                    fim,
                    {
                        profissionalUid:
                            visaoBarbearia
                                ? null
                                : profissionalUid,
                        incluirBarbearia:
                            visaoBarbearia
                    }
                ),
                listarVendasPorPeriodo(inicio, fim, {
                    profissionalUid: visaoBarbearia ? null : profissionalUid
                })
            ]);

        relatorioAtual = {
            inicio,
            fim,
            atendimentos,
            despesas,
            vendas,
            visaoBarbearia,
            profissionalUid,
            nomeVisao:
                obterNomeVisao(
                    profissionalUid,
                    visaoBarbearia
                )
        };

        renderizar(relatorioAtual);
    } catch (error) {
        console.error(
            "Erro ao carregar relatório:",
            error
        );

        setStatus(
            String(error?.message || "")
                .toLowerCase()
                .includes("index")
                ? "O Firestore pediu um índice para esta consulta. Confira os índices publicados."
                : "Não foi possível carregar o relatório.",
            true
        );
    } finally {
        setCarregando(false);
    }
}

function montarFechamentoWhatsApp() {
    if (!relatorioAtual?.fechamento) return "";

    const r = relatorioAtual;
    const f = r.fechamento;
    const produtos = f.produtos || {};
    const linhas = [
        `*${APP_NAME.toUpperCase()}*`,
        r.visaoBarbearia
            ? "*FECHAMENTO DA BARBEARIA*"
            : `*FECHAMENTO PROFISSIONAL - ${String(r.nomeVisao || "Profissional").toUpperCase()}*`,
        formatarPeriodo(r.inicio, r.fim),
        ""
    ];

    if (r.visaoBarbearia) {
        linhas.push(
            `Faturamento bruto de serviços: ${moeda(f.faturamentoBruto)}`,
            `Líquido após taxas: ${moeda(f.liquidoAposTaxas)}`,
            `Repasse da Equipe: ${moeda(f.repasseEquipe ?? f.repasse)}`
        );
        if (Number(produtos.quantidadeVendas || 0) > 0) {
            linhas.push(
                "",
                "*PRODUTOS*",
                `Vendas de produtos: ${moeda(produtos.vendasBrutas)}`,
                `Líquido de produtos após taxas: ${moeda(produtos.liquidoAposTaxas)}`,
                `Custo dos produtos: - ${moeda(produtos.custoProdutos)}`,
                `Comissões da equipe: - ${moeda(produtos.comissoesEquipe)}`,
                `Resultado com produtos: ${moeda(produtos.resultadoBarbearia)}`
            );
        }
        linhas.push(
            "",
            `Despesas da barbearia: - ${moeda(f.totalDespesas)}`,
            `*RESULTADO LÍQUIDO: ${moeda(f.resultadoLiquido)}*`
        );
    } else {
        linhas.push(
            `Produção bruta: ${moeda(f.faturamentoBruto)}`,
            `Taxas de pagamento: - ${moeda(f.taxasCartao)}`,
            `Líquido após taxas: ${moeda(f.liquidoAposTaxas)}`,
            `Repasse à barbearia: - ${moeda(f.repasseBarbearia)}`,
            `Valor dos serviços: ${moeda(f.valorServicosProfissional)}`
        );
        if (Number(produtos.comissaoProfissional || 0) > 0) {
            linhas.push(`Comissão em produtos: ${moeda(produtos.comissaoProfissional)}`);
        }
        linhas.push(`*TOTAL DO PROFISSIONAL: ${moeda(f.totalProfissional)}*`);
    }

    if (r.visaoBarbearia && f.equipe?.length) {
        linhas.push("", "*EQUIPE*");
        f.equipe.forEach((item) => {
            linhas.push(`${item.nome}: bruto ${moeda(item.bruto)} | repasse ${moeda(item.repasse)}`);
        });
    }

    if (r.visaoBarbearia && (produtos.porProfissional || []).length) {
        linhas.push("", "*COMISSÕES DE PRODUTOS*");
        produtos.porProfissional.forEach((item) => {
            linhas.push(`${item.nome}: ${item.vendas} venda${item.vendas === 1 ? "" : "s"} | comissão ${moeda(item.comissao)}`);
        });
    }

    if (r.visaoBarbearia && f.despesasPorCategoria?.length) {
        linhas.push("", "*DESPESAS*");
        f.despesasPorCategoria.forEach((item) => linhas.push(`${item.nome}: ${moeda(item.valor)}`));
    }

    return linhas.join("\n");
}

function enviarWhatsApp() {
    const mensagem = montarFechamentoWhatsApp();

    if (!mensagem) {
        setStatus("Carregue um fechamento antes de compartilhar.", true);
        return;
    }

    window.open(
        `https://wa.me/?text=${encodeURIComponent(mensagem)}`,
        "_blank",
        "noopener,noreferrer"
    );
}

function mostrarInfoResultado(event) {
    if (!infoTooltip || !relatorioAtual?.resumo) return;

    event?.stopPropagation();

    clearTimeout(timerInfo);

    const botao =
        event?.currentTarget ||
        el("btnInfoResultadoRelatorio");

    if (!botao) return;

    infoTooltip.textContent =
        relatorioAtual.visaoBarbearia
            ? "Repasse previsto é o valor líquido que a barbearia deve receber dos profissionais. A taxa do cartão é descontada antes do cálculo do repasse."
            : "Resultado profissional é o valor que resta depois das taxas do cartão, do repasse ao proprietário e das despesas profissionais do período.";

    infoTooltip.hidden = false;

    const rect = botao.getBoundingClientRect();

    requestAnimationFrame(() => {
        const larguraTooltip =
            infoTooltip.offsetWidth;

        const metade =
            larguraTooltip / 2;

        const margem = 16;

        let centroX =
            rect.left +
            rect.width / 2;

        centroX = Math.max(
            margem + metade,
            Math.min(
                window.innerWidth -
                    margem -
                    metade,
                centroX
            )
        );

        infoTooltip.style.left =
            `${centroX}px`;

        infoTooltip.style.top =
            `${rect.top - 9}px`;
    });

    timerInfo = setTimeout(
        () => {
            infoTooltip.hidden = true;
        },
        5000
    );
}

function registrarEventosData() {
    btnAnterior?.addEventListener("click", irPeriodoAnterior);
    btnProxima?.addEventListener("click", irProximoPeriodo);
    btnCalendario?.addEventListener("click", abrirPeriodoPersonalizado);

    document
        .querySelectorAll("#relatorioPeriodoCustom .relatorio-date-control")
        .forEach((controle) => {
            const input = el(controle.dataset.dateTarget);
            if (!input) return;

            // O valor continua no formato ISO esperado pelo relatório, mas o picker
            // passa a ser 100% do Sr NK em navegador, iOS e Android.
            input.setAttribute("readonly", "");
            input.setAttribute("inputmode", "none");

            const abrir = (event) => {
                event?.preventDefault?.();
                event?.stopPropagation?.();

                const ehInicio = input === inicioInput;
                const valorAtual = dataDeInput(input.value)
                    || (ehInicio ? periodoInicio : periodoFim)
                    || new Date();

                abrirCalendarioPopover({
                    ancora: controle,
                    data: valorAtual,
                    max: new Date(),
                    titulo: ehInicio ? "Data inicial" : "Data final",
                    onSelect: (data) => {
                        input.value = chaveData(data);

                        if (ehInicio) {
                            if (fimInput && (!fimInput.value || dataDeInput(fimInput.value) < data)) {
                                fimInput.value = chaveData(data);
                            }
                        } else if (inicioInput && (!inicioInput.value || dataDeInput(inicioInput.value) > data)) {
                            inicioInput.value = chaveData(data);
                        }
                    }
                });
            };

            controle.addEventListener("click", abrir);
            input.addEventListener("focus", (event) => {
                input.blur();
                abrir(event);
            });
        });

    el("btnAplicarPeriodoRelatorio")?.addEventListener("click", () => {
        try {
            const { inicio, fim } = validarPeriodoDosInputs();
            fecharPeriodoPersonalizado();
            aplicarPeriodo(inicio, fim);
        } catch (error) {
            setStatus(error.message, true);
        }
    });
}

export async function prepararRelatoriosHoje() {
    const hoje = inicioDoDia(new Date());

    fecharPeriodoPersonalizado();
    aplicarPeriodo(hoje, hoje, { carregar: false });

    if (!inicializado) return;

    await prepararSeletorProfissional();
    await carregarRelatorio();
}

export async function initRelatorios() {
    if (inicializado) return;
    inicializado = true;

    periodoInicio = inicioDoDia(new Date());
    periodoFim = inicioDoDia(new Date());

    atualizarNavegadorPeriodo();
    registrarEventosData();
    selecionarAbaRelatorio(abaRelatorioAtual);

    btnAbaAnalise?.addEventListener("click", () => selecionarAbaRelatorio("analise"));
    btnAbaFechamento?.addEventListener("click", () => selecionarAbaRelatorio("fechamento"));

    profissionalSelect
        ?.addEventListener(
            "change",
            carregarRelatorio
        );

    el("btnWhatsApp")
        ?.addEventListener(
            "click",
            enviarWhatsApp
        );

    el("btnInfoResultadoRelatorio")
        ?.addEventListener(
            "click",
            mostrarInfoResultado
        );
}
