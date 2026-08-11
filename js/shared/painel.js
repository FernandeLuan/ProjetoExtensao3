import { state, onStateChange } from "./state.js?v=9.2";
import { formatarMoeda } from "./utils/money.js?v=9.2";
import { inicioDoDia, somarDias, chaveData, mesmoDia, formatarTituloData, dataDeInput } from "./utils/date.js?v=9.2";
import { setTexto } from "./utils/dom.js?v=9.2";
import { abrirCalendarioPopover } from "./services/calendario-popover.js?v=9.2";
import { obterResumoDoDia } from "./services/financeiro-service.js?v=9.2";
import { garantirAtendimentosPeriodo } from "./data/sync.js?v=9.2";
import { listarResumosProfissionalPorPeriodo } from "./data/resumos-repository.js?v=9.2";
import { obterWorkspaceId } from "./data/context.js?v=9.2";
import { garantirChartJs } from "./services/external-assets.js?v=9.2";
import { iniciarLoadingTela, finalizarLoadingTela } from "./services/ui-loading-service.js?v=9.2";

let dataSelecionada = inicioDoDia(new Date());
let graficoFaturamentoInstance = null;
let graficoTicketInstance = null;
let graficoAtendimentosInstance = null;
let resumosPainel = [];

const btnCalendarioPainel = document.getElementById("btnCalendarioPainel");
const inputDataPainel = document.getElementById("inputDataPainel");

function usarResumosNoPainel() {
    // Durante a homologação, somente o workspace de teste usa a nova leitura.
    // Produção continua no fluxo legado até migrarmos os dados históricos.
    return String(obterWorkspaceId() || "").startsWith("teste-");
}

function centavosParaReais(valor) {
    return Number(valor || 0) / 100;
}

function resumoVazio() {
    return {
        faturamentoBruto: 0,
        totalRepasse: 0,
        lucroBarbeiro: 0,
        totalTaxas: 0,
        totalAtendimentos: 0,
        ticketMedio: 0,
        servicoMaisVendido: "—",
        quantidadeMaisVendida: 0,
        percentualMaisVendido: 0
    };
}

function converterResumoDiario(documento) {
    if (!documento) return resumoVazio();

    const totalAtendimentos = Math.max(0, Number(documento.atendimentos || 0));
    const faturamentoBruto = centavosParaReais(documento.faturamentoBrutoCentavos);
    const servicos = documento.servicosQtd || {};
    const nomes = documento.servicosNomes || {};

    let servicoMaisVendido = "—";
    let quantidadeMaisVendida = 0;

    Object.entries(servicos).forEach(([chave, quantidade]) => {
        const qtd = Math.max(0, Number(quantidade || 0));
        if (qtd > quantidadeMaisVendida) {
            quantidadeMaisVendida = qtd;
            servicoMaisVendido = String(nomes[chave] || "Serviço");
        }
    });

    return {
        faturamentoBruto,
        totalRepasse: centavosParaReais(documento.repasseCentavos),
        lucroBarbeiro: centavosParaReais(documento.liquidoBarbeiroCentavos),
        totalTaxas: centavosParaReais(documento.taxasCartaoCentavos),
        totalAtendimentos,
        ticketMedio: totalAtendimentos ? faturamentoBruto / totalAtendimentos : 0,
        servicoMaisVendido,
        quantidadeMaisVendida,
        percentualMaisVendido: totalAtendimentos
            ? Math.round((quantidadeMaisVendida / totalAtendimentos) * 100)
            : 0
    };
}

function atendimentosDoProfissionalAtual() {
    const uid = state.user?.uid;
    if (!uid) return [];
    return (state.atendimentos || []).filter((item) => item?.profissionalUid === uid);
}

function obterResumoPainel(data) {
    if (!usarResumosNoPainel()) {
        return obterResumoDoDia(atendimentosDoProfissionalAtual(), data);
    }

    const chave = chaveData(data);
    const documento = resumosPainel.find((item) => item.dataChave === chave || item.id === chave);
    return converterResumoDiario(documento);
}

async function carregarResumosPainel(inicio, fim) {
    if (!usarResumosNoPainel()) {
        await garantirAtendimentosPeriodo(inicio, fim, {
            profissionalUid: state.user?.uid || null
        });
        return;
    }

    const uid = state.user?.uid;
    if (!uid) {
        resumosPainel = [];
        return;
    }

    resumosPainel = await listarResumosProfissionalPorPeriodo(uid, inicio, fim);
}


// =============================
// NAVEGAÇÃO DE DATA
// =============================
function atualizarNavegadorData() {
    const label = document.getElementById("labelDataPainel");
    const btnProxima = document.getElementById("btnDataProxima");
    const hoje = inicioDoDia(new Date());

    if (inputDataPainel) {
        inputDataPainel.max = chaveData(hoje);
        inputDataPainel.value = chaveData(dataSelecionada);
    }

    if (label) {
        label.textContent = formatarTituloData(dataSelecionada);
    }

    if (btnProxima) {
        const estaHoje = mesmoDia(dataSelecionada, hoje);
        btnProxima.disabled = estaHoje;
        btnProxima.setAttribute("aria-disabled", String(estaHoje));
    }
}

async function selecionarData(novaData) {
    const hoje = inicioDoDia(new Date());
    const normalizada = inicioDoDia(novaData);

    // O painel nunca permite navegar para o futuro.
    dataSelecionada = normalizada > hoje ? hoje : normalizada;
    const loading = iniciarLoadingTela("Atualizando painel...", { delay: 320 });
    try {
        await carregarResumosPainel(somarDias(dataSelecionada, -6), dataSelecionada);
    } catch (error) {
        console.error("Erro ao carregar período do painel:", error);
    } finally {
        finalizarLoadingTela(loading);
    }
    atualizarCards();
}

export async function abrirPainelHoje() {
    dataSelecionada = inicioDoDia(new Date());
    void garantirChartJs()
        .then(() => {
            const painel = document.getElementById("painelFinanceiro");
            if (painel && getComputedStyle(painel).display !== "none") atualizarGrafico();
        })
        .catch((error) => console.warn("Chart.js indisponível no Painel:", error));
    try {
        await carregarResumosPainel(somarDias(dataSelecionada, -6), dataSelecionada);
    } catch (error) {
        console.error("Erro ao carregar painel de hoje:", error);
    }
    atualizarCards();
}

document.getElementById("btnDataAnterior")?.addEventListener("click", () => {
    selecionarData(somarDias(dataSelecionada, -1));
});

document.getElementById("btnDataProxima")?.addEventListener("click", () => {
    const hoje = inicioDoDia(new Date());
    if (mesmoDia(dataSelecionada, hoje)) return;
    selecionarData(somarDias(dataSelecionada, 1));
});

btnCalendarioPainel?.addEventListener("click", () => {
    abrirCalendarioPopover({
        ancora: btnCalendarioPainel,
        data: dataSelecionada,
        max: new Date(),
        titulo: "Escolher data do painel",
        onSelect: (data) => {
            void selecionarData(data);
        }
    });
});

// O input nativo fica apenas como espelho de valor para compatibilidade.
// No mobile o calendário do Sr NK é usado para evitar o picker inconsistente do iOS.
inputDataPainel?.setAttribute("readonly", "");
inputDataPainel?.setAttribute("aria-hidden", "true");

// =============================
// PAINEL FINANCEIRO
// =============================
function atualizarComparativo(resumoAtual, resumoAnterior) {
    const comparativo = document.getElementById("comparativoLucro");
    if (!comparativo) return;

    comparativo.hidden = true;
    comparativo.classList.remove("positive", "negative", "neutral");
    comparativo.textContent = "";

    // Só mostra percentual quando os dois dias realmente possuem dados.
    if (resumoAtual.totalAtendimentos === 0 || resumoAnterior.totalAtendimentos === 0) {
        return;
    }

    if (resumoAnterior.lucroBarbeiro === 0) {
        return;
    }

    const variacao = ((resumoAtual.lucroBarbeiro - resumoAnterior.lucroBarbeiro) / resumoAnterior.lucroBarbeiro) * 100;
    const valorFormatado = Math.abs(variacao).toLocaleString("pt-BR", {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1
    });

    const hoje = inicioDoDia(new Date());
    const referencia = mesmoDia(dataSelecionada, hoje)
        ? "em relação a ontem"
        : "em relação ao dia anterior";

if (variacao > 0) {
    comparativo.classList.add("positive");

    comparativo.innerHTML = `
        <i class="fas fa-arrow-up"></i>
        <span class="finance-comparison-percent">${valorFormatado}%</span>
        <span>${referencia}</span>
    `;
} else if (variacao < 0) {
    comparativo.classList.add("negative");

    comparativo.innerHTML = `
        <i class="fas fa-arrow-down"></i>
        <span class="finance-comparison-percent">${valorFormatado}%</span>
        <span>${referencia}</span>
    `;
} else {
    comparativo.classList.add("neutral");

    comparativo.innerHTML = `
        <i class="fas fa-minus"></i>
        <span class="finance-comparison-percent">0,0%</span>
        <span>${referencia}</span>
    `;
}

    comparativo.hidden = false;
}

export function atualizarCards() {
    atualizarNavegadorData();

    const resumoAtual = obterResumoPainel(dataSelecionada);
    const resumoAnterior = obterResumoPainel(somarDias(dataSelecionada, -1));

    setTexto("lucroLiquidoPainel", `R$ ${formatarMoeda(resumoAtual.lucroBarbeiro)}`);
    setTexto("faturamentoBrutoPainel", `R$ ${formatarMoeda(resumoAtual.faturamentoBruto)}`);
    setTexto("repassePainel", `R$ ${formatarMoeda(resumoAtual.totalRepasse)}`);
    setTexto("ticketMedioPainel", `R$ ${formatarMoeda(resumoAtual.ticketMedio)}`);
    setTexto("clientesAtendidosPainel", String(resumoAtual.totalAtendimentos));
    setTexto("servicoMaisVendidoPainel", resumoAtual.servicoMaisVendido);

    const palavraVenda = resumoAtual.quantidadeMaisVendida === 1 ? "venda" : "vendas";
    const metaServico = document.getElementById("servicoMaisVendidoMeta");

    if (metaServico) {
        metaServico.innerHTML =
            `<span class="finance-service-sales">${resumoAtual.quantidadeMaisVendida} ${palavraVenda}</span>` +
            ` • ${resumoAtual.percentualMaisVendido}% dos atendimentos`;
    }

    atualizarComparativo(resumoAtual, resumoAnterior);

    // Evita criar gráficos enquanto o Painel estiver escondido.
    const painel = document.getElementById("painelFinanceiro");
    if (painel && getComputedStyle(painel).display !== "none") {
        atualizarGrafico();
    }
}

// =============================
// GRÁFICOS - 7 DIAS ATÉ A DATA SELECIONADA
// =============================
function obterSerieSeteDias() {
    const serie = [];

    for (let deslocamento = 6; deslocamento >= 0; deslocamento--) {
        const data = somarDias(dataSelecionada, -deslocamento);
        const resumo = obterResumoPainel(data);

        serie.push({
            label: `${String(data.getDate()).padStart(2, "0")}/${String(data.getMonth() + 1).padStart(2, "0")}`,
            faturamento: resumo.faturamentoBruto,
            ticket: resumo.ticketMedio,
            atendimentos: resumo.totalAtendimentos
        });
    }

    return serie;
}

function obterCoresDoTema() {
    const estilos = getComputedStyle(document.documentElement);

    return {
        primary: estilos.getPropertyValue("--primary").trim() || "#3B82F6",
        textSecondary: estilos.getPropertyValue("--text-secondary").trim() || "#A0A7B5",
        border: estilos.getPropertyValue("--border").trim() || "rgba(255,255,255,0.08)"
    };
}

function corComAlpha(cor, alpha) {
    const hexadecimal = cor.replace("#", "").trim();

    if (/^[0-9a-fA-F]{6}$/.test(hexadecimal)) {
        const r = parseInt(hexadecimal.slice(0, 2), 16);
        const g = parseInt(hexadecimal.slice(2, 4), 16);
        const b = parseInt(hexadecimal.slice(4, 6), 16);
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }

    return cor;
}
function destruirGrafico(instancia) {
    if (instancia) instancia.destroy();
}


// =============================
// TOOLTIP DOS MINI GRÁFICOS
// =============================
const sparklineTooltipTimers = new WeakMap();

function mostrarTooltipSparkline(context, formatarValor) {
    const { chart, tooltip } = context;

    // O próprio timer controla quando o tooltip desaparece.
    if (
        !tooltip ||
        tooltip.opacity === 0 ||
        !tooltip.dataPoints?.length
    ) {
        return;
    }

    const wrapper = chart.canvas.parentElement;

    if (!wrapper) return;

    let elemento = wrapper.querySelector(
        ".sparkline-touch-tooltip"
    );

    // Cria o tooltip somente na primeira utilização
    if (!elemento) {
        elemento = document.createElement("div");
        elemento.className = "sparkline-touch-tooltip";
        wrapper.appendChild(elemento);
    }

    const ponto = tooltip.dataPoints[0];

    const titulo = tooltip.title?.[0] ?? "";
    const valor = formatarValor(ponto.raw ?? 0);

    elemento.innerHTML = `
        <span>${titulo}</span>
        <strong>${valor}</strong>
    `;

    // Evita o tooltip sair para os lados do card
    const larguraWrapper = wrapper.clientWidth;

    const x = Math.max(
        45,
        Math.min(
            tooltip.caretX,
            larguraWrapper - 45
        )
    );

    elemento.style.left = `${x}px`;

    elemento.classList.add("show");

    // Cancela timer anterior
    const timerAnterior =
        sparklineTooltipTimers.get(chart);

    if (timerAnterior) {
        clearTimeout(timerAnterior);
    }

    // Some automaticamente depois de 3 segundos
    const timer = setTimeout(() => {
        elemento.classList.remove("show");
    }, 3000);

    sparklineTooltipTimers.set(chart, timer);
}


// =============================
// MINI GRÁFICO - TICKET MÉDIO
// =============================
function criarSparklineLinha(canvas, labels, dados, cor) {
    if (!canvas || typeof Chart === "undefined") return null;

    return new Chart(canvas, {
        type: "line",

        data: {
            labels,

            datasets: [{
                data: dados,

                borderColor: cor,
                backgroundColor: corComAlpha(cor, 0.08),

                borderWidth: 1.5,

                fill: true,
                tension: 0.35,

                pointRadius: 0,
                pointHoverRadius: 4,

                // Aumenta a área de toque no celular
                pointHitRadius: 18
            }]
        },

        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: false,

            interaction: {
                mode: "index",
                intersect: false
            },

            scales: {
                x: {
                    display: false
                },

                y: {
                    display: false,
                    beginAtZero: true
                }
            },

            plugins: {
                legend: {
                    display: false
                },

                tooltip: {
                    enabled: false,

                    external: (context) => {
                        mostrarTooltipSparkline(
                            context,
                            (valor) =>
                                `R$ ${formatarMoeda(valor)}`
                        );
                    }
                }
            }
        }
    });
}


// =============================
// MINI GRÁFICO - ATENDIMENTOS
// =============================
function criarSparklineBarras(canvas, labels, dados, cor) {
    if (!canvas || typeof Chart === "undefined") return null;

    return new Chart(canvas, {
        type: "bar",

        data: {
            labels,

            datasets: [{
                data: dados,

                backgroundColor: corComAlpha(cor, 0.85),

                borderRadius: 2,
                borderSkipped: false,

                barPercentage: 0.62,
                categoryPercentage: 0.9
            }]
        },

        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: false,

            interaction: {
                mode: "index",
                intersect: false
            },

            scales: {
                x: {
                    display: false
                },

                y: {
                    display: false,
                    beginAtZero: true
                }
            },

            plugins: {
                legend: {
                    display: false
                },

                tooltip: {
                    enabled: false,

                    external: (context) => {
                        mostrarTooltipSparkline(
                            context,
                            (valor) => {
                                const quantidade = Number(valor);

                                return quantidade === 1
                                    ? "1 atendimento"
                                    : `${quantidade} atendimentos`;
                            }
                        );
                    }
                }
            }
        }
    });
}

export function atualizarGrafico() {
    if (typeof Chart === "undefined") return;

    const serie = obterSerieSeteDias();
    const cores = obterCoresDoTema();

    destruirGrafico(graficoFaturamentoInstance);
    destruirGrafico(graficoTicketInstance);
    destruirGrafico(graficoAtendimentosInstance);

const labels = serie.map((item) => item.label);

graficoTicketInstance = criarSparklineLinha(
    document.getElementById("graficoTicketMedio"),
    labels,
    serie.map((item) => item.ticket),
    cores.primary
);

graficoAtendimentosInstance = criarSparklineBarras(
    document.getElementById("graficoAtendimentos"),
    labels,
    serie.map((item) => item.atendimentos),
    cores.primary
);
    const canvasFaturamento = document.getElementById("graficoFaturamento");
    if (!canvasFaturamento) return;

    graficoFaturamentoInstance = new Chart(canvasFaturamento, {
        type: "bar",
        data: {
            labels: serie.map((item) => item.label),
            datasets: [{
                data: serie.map((item) => item.faturamento),
                backgroundColor: corComAlpha(cores.primary, 0.9),
                borderRadius: 4,
                borderSkipped: false,
                barPercentage: 0.72,
                categoryPercentage: 0.82
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: { duration: 220 },
            scales: {
                y: {
                    beginAtZero: true,
                    border: { display: false },
                    grid: { color: cores.border },
                    ticks: {
                        color: cores.textSecondary,
                        font: { size: 9 },
                        maxTicksLimit: 5,
                        callback: (valor) => Number(valor).toLocaleString("pt-BR", {
                            maximumFractionDigits: 0
                        })
                    }
                },
                x: {
                    border: { display: false },
                    grid: { display: false },
                    ticks: {
                        color: cores.textSecondary,
                        font: { size: 9 },
                        maxRotation: 0,
                        autoSkip: false
                    }
                }
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    displayColors: false,
                    callbacks: {
                        label: (contexto) => `R$ ${formatarMoeda(contexto.raw ?? 0)}`
                    }
                }
            }
        }
    });
}

// =============================
// TOOLTIP DE INFORMAÇÕES
// =============================
const financeInfoTooltip = document.getElementById("financeInfoTooltip");

let financeInfoTimer = null;

function esconderFinanceInfo() {
    if (!financeInfoTooltip) return;

    financeInfoTooltip.hidden = true;

    if (financeInfoTimer) {
        clearTimeout(financeInfoTimer);
        financeInfoTimer = null;
    }
}

document.querySelectorAll(".finance-info-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
        e.stopPropagation();

        if (!financeInfoTooltip) return;

        const rect = btn.getBoundingClientRect();

        financeInfoTooltip.textContent = btn.dataset.info;
        financeInfoTooltip.hidden = false;

        requestAnimationFrame(() => {
            const larguraTooltip = financeInfoTooltip.offsetWidth;
            const metade = larguraTooltip / 2;

            const margem = 16;

            let centroX =
                rect.left +
                rect.width / 2;

            centroX = Math.max(
                margem + metade,
                Math.min(
                    window.innerWidth - margem - metade,
                    centroX
                )
            );

            financeInfoTooltip.style.left =
                `${centroX}px`;

            financeInfoTooltip.style.top =
                `${rect.top - 9}px`;
        });

        if (financeInfoTimer) {
            clearTimeout(financeInfoTimer);
        }

        financeInfoTimer = setTimeout(() => {
            esconderFinanceInfo();
        }, 5000);
    });
});

document.addEventListener("click", esconderFinanceInfo);

function painelEstaVisivel(){
    const painel=document.getElementById("painelFinanceiro");
    return Boolean(painel && getComputedStyle(painel).display !== "none");
}

onStateChange("atendimentos", () => {
    if (!usarResumosNoPainel() && painelEstaVisivel()) atualizarCards();
});
onStateChange("configSistema", () => { if (painelEstaVisivel()) atualizarCards(); });
