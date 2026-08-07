import { state } from "./state.js";
import { formatarMoeda, formatarDataISO } from "./utils.js";

let dataSelecionada = inicioDoDia(new Date());
let graficoFaturamentoInstance = null;
let graficoTicketInstance = null;
let graficoAtendimentosInstance = null;

const btnCalendarioPainel = document.getElementById("btnCalendarioPainel");
const inputDataPainel = document.getElementById("inputDataPainel");

// =============================
// CÁLCULOS FINANCEIROS
// =============================
export function processarFinanceiro(valorBruto, pagamento) {
    const taxaDebito = (state.configSistema.taxaDebito ?? 1.5) / 100;
    const taxaCredito = (state.configSistema.taxaCredito ?? 3.51) / 100;
    const repassePct = (state.configSistema.repasseDonoPct ?? 35) / 100;

    let liquidoConta = valorBruto;

    if (pagamento === "Débito") {
        liquidoConta -= valorBruto * taxaDebito;
    } else if (pagamento === "Crédito") {
        liquidoConta -= valorBruto * taxaCredito;
    }

    const repasseDono = liquidoConta * repassePct;
    const liquidoBarbeiro = liquidoConta - repasseDono;

    return {
        liquidoConta: Number(liquidoConta.toFixed(2)),
        repasseDono: Number(repasseDono.toFixed(2)),
        liquidoBarbeiro: Number(liquidoBarbeiro.toFixed(2))
    };
}

// =============================
// DATA DO PAINEL
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

function selecionarData(novaData) {
    const hoje = inicioDoDia(new Date());
    const normalizada = inicioDoDia(novaData);

    // O painel nunca permite navegar para o futuro.
    dataSelecionada = normalizada > hoje ? hoje : normalizada;
    atualizarCards();
}

export function abrirPainelHoje() {
    dataSelecionada = inicioDoDia(new Date());
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
    abrirCalendario(inputDataPainel);
});

inputDataPainel?.addEventListener("change", () => {
    if (!inputDataPainel.value) return;

    const [ano, mes, dia] = inputDataPainel.value.split("-").map(Number);
    selecionarData(new Date(ano, mes - 1, dia));
});

// =============================
// RESUMO DE UM DIA
// =============================
function obterAtendimentosDoDia(data) {
    const chave = chaveData(data);

    return state.atendimentos.filter((atendimento) => {
        const dataAtendimento = new Date(atendimento.data);
        return chaveData(dataAtendimento) === chave;
    });
}

function obterResumoDoDia(data) {
    const lista = obterAtendimentosDoDia(data);
    let faturamentoBruto = 0;
    let totalRepasse = 0;
    let lucroBarbeiro = 0;
    const servicos = {};

    lista.forEach((atendimento) => {
        const bruto = Number(atendimento.valorBrutoTotal ?? atendimento.valorBruto ?? 0);
        const liquidoConta = Number(atendimento.valorLiquido ?? bruto);
        const repasse = Number(atendimento.repasseDono ?? 0);
        const lucro = Number(atendimento.liquidoBarbeiro ?? (liquidoConta - repasse));

        faturamentoBruto += bruto;
        totalRepasse += repasse;
        lucroBarbeiro += lucro;

        if (atendimento.servico) {
            servicos[atendimento.servico] = (servicos[atendimento.servico] ?? 0) + 1;
        }
    });

    const totalAtendimentos = lista.length;
    const ticketMedio = totalAtendimentos > 0
        ? faturamentoBruto / totalAtendimentos
        : 0;

    let servicoMaisVendido = "—";
    let quantidadeMaisVendida = 0;

    Object.entries(servicos).forEach(([servico, quantidade]) => {
        if (quantidade > quantidadeMaisVendida) {
            servicoMaisVendido = servico;
            quantidadeMaisVendida = quantidade;
        }
    });

    const percentualMaisVendido = totalAtendimentos > 0
        ? Math.round((quantidadeMaisVendida / totalAtendimentos) * 100)
        : 0;

    return {
        faturamentoBruto,
        totalRepasse,
        lucroBarbeiro,
        totalAtendimentos,
        ticketMedio,
        servicoMaisVendido,
        quantidadeMaisVendida,
        percentualMaisVendido
    };
}

// =============================
// PAINEL FINANCEIRO
// =============================
function setTexto(id, texto) {
    const elemento = document.getElementById(id);
    if (elemento) elemento.textContent = texto;
}

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

    const resumoAtual = obterResumoDoDia(dataSelecionada);
    const resumoAnterior = obterResumoDoDia(somarDias(dataSelecionada, -1));

    setTexto("lucroLiquidoPainel", `R$ ${formatarMoeda(resumoAtual.lucroBarbeiro)}`);
    setTexto("faturamentoBrutoPainel", `R$ ${formatarMoeda(resumoAtual.faturamentoBruto)}`);
    setTexto("repassePainel", `R$ ${formatarMoeda(resumoAtual.totalRepasse)}`);
    setTexto("ticketMedioPainel", `R$ ${formatarMoeda(resumoAtual.ticketMedio)}`);
    setTexto("clientesAtendidosPainel", String(resumoAtual.totalAtendimentos));
    setTexto("servicoMaisVendidoPainel", resumoAtual.servicoMaisVendido);

    const palavraVenda = resumoAtual.quantidadeMaisVendida === 1 ? "venda" : "vendas";
    setTexto(
        "servicoMaisVendidoMeta",
        `${resumoAtual.quantidadeMaisVendida} ${palavraVenda} • ${resumoAtual.percentualMaisVendido}% dos atendimentos`
    );

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
        const resumo = obterResumoDoDia(data);

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
// RELATÓRIOS - BOTÕES DE PERÍODO
// =============================
function setDatasRelatorio(tipo) {
    document.querySelectorAll("#relatorios .btn-filtro").forEach((btn) => btn.classList.remove("active"));

    if (tipo === "hoje") document.getElementById("btnRelHoje")?.classList.add("active");
    if (tipo === "semana") document.getElementById("btnRelSemana")?.classList.add("active");
    if (tipo === "mes") document.getElementById("btnRelMes")?.classList.add("active");

    const inputInicio = document.getElementById("dataInicioRelatorio");
    const inputFim = document.getElementById("dataFimRelatorio");
    const hoje = new Date();

    if (tipo === "hoje") {
        const dataStr = formatarDataISO(hoje);
        if (inputInicio) inputInicio.value = dataStr;
        if (inputFim) inputFim.value = dataStr;
    } else if (tipo === "semana") {
        const diaSemana = hoje.getDay();
        const diffInicio = hoje.getDate() - diaSemana + (diaSemana === 0 ? -6 : 1);
        const inicioSemana = new Date(hoje);
        inicioSemana.setDate(diffInicio);
        const fimSemana = new Date(inicioSemana);
        fimSemana.setDate(inicioSemana.getDate() + 6);

        if (inputInicio) inputInicio.value = formatarDataISO(inicioSemana);
        if (inputFim) inputFim.value = formatarDataISO(fimSemana);
    } else if (tipo === "mes") {
        const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
        const fimMes = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0);
        if (inputInicio) inputInicio.value = formatarDataISO(inicioMes);
        if (inputFim) inputFim.value = formatarDataISO(fimMes);
    }
}

document.getElementById("btnRelHoje")?.addEventListener("click", () => setDatasRelatorio("hoje"));
document.getElementById("btnRelSemana")?.addEventListener("click", () => setDatasRelatorio("semana"));
document.getElementById("btnRelMes")?.addEventListener("click", () => setDatasRelatorio("mes"));

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