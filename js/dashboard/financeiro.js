import { state } from "./state.js";
import { formatarMoeda, formatarDataISO } from "./utils.js";

let graficoInstance = null;

// =============================
// CÁLCULOS FINANCEIROS
// =============================
export function processarFinanceiro(valorBruto, pagamento) {
    const taxaDebito = (state.configSistema.taxaDebito || 1.5) / 100;
    const taxaCredito = (state.configSistema.taxaCredito || 3.51) / 100;
    const repassePct = (state.configSistema.repasseDonoPct || 35) / 100;

    let liquidoConta = valorBruto;

    if (pagamento === "Débito") {
        liquidoConta -= valorBruto * taxaDebito;
    } else if (pagamento === "Crédito") {
        liquidoConta -= valorBruto * taxaCredito;
    }

    const repasseDono = liquidoConta * repassePct;
    const liquidoBarbeiro = liquidoConta - repasseDono;

    return {
        liquidoConta: parseFloat(liquidoConta.toFixed(2)),
        repasseDono: parseFloat(repasseDono.toFixed(2)),
        liquidoBarbeiro: parseFloat(liquidoBarbeiro.toFixed(2))
    };
}

// =============================
// PAINEL FINANCEIRO
// =============================
document.querySelectorAll("#painelFinanceiro .btn-filtro").forEach((btn) => {
    btn.addEventListener("click", (e) => {
        document.querySelectorAll("#painelFinanceiro .btn-filtro").forEach((b) => b.classList.remove("active"));
        e.currentTarget.classList.add("active");
        state.periodoSelecionado = e.currentTarget.getAttribute("data-periodo");
        atualizarCards();
    });
});

export function atualizarCards() {
    let faturamentoBruto = 0;
    let faturamentoLiquido = 0;
    let totalRepasse = 0;
    let lucroBarbeiro = 0;
    let totalClientes = 0;
    const servicoCount = {};

    const hoje = new Date();
    const inicioSemana = new Date(hoje);
    inicioSemana.setDate(hoje.getDate() - hoje.getDay());
    inicioSemana.setHours(0, 0, 0, 0);

    state.atendimentos.forEach((a) => {
        const data = new Date(a.data);
        let dentro = false;

        if (state.periodoSelecionado === "hoje") {
            dentro =
                data.getDate() === hoje.getDate() &&
                data.getMonth() === hoje.getMonth() &&
                data.getFullYear() === hoje.getFullYear();
        } else if (state.periodoSelecionado === "semana") {
            dentro = data >= inicioSemana;
        } else if (state.periodoSelecionado === "mes") {
            dentro =
                data.getMonth() === hoje.getMonth() &&
                data.getFullYear() === hoje.getFullYear();
        }

        if (dentro) {
            const bruto = a.valorBrutoTotal || a.valorBruto || 0;
            const liquido = a.valorLiquido || 0;
            const repasse = a.repasseDono || 0;

            faturamentoBruto += bruto;
            faturamentoLiquido += liquido;
            totalRepasse += repasse;
            lucroBarbeiro += a.liquidoBarbeiro || (liquido - repasse) || 0;
            totalClientes++;

            if (a.servico) {
                servicoCount[a.servico] = (servicoCount[a.servico] || 0) + 1;
            }
        }
    });

    const cardFat = document.querySelector("#faturamentoHoje p");
    if (cardFat) {
        cardFat.innerHTML = `
            <div style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 2px;">Seu Lucro Limpo</div>
            <div style="font-size: 1.9rem; color: var(--success); font-weight: 700; margin-bottom: 12px; line-height: 1.1;">
                R$ ${formatarMoeda(lucroBarbeiro)}
            </div>
            <div style="display: flex; justify-content: space-between; border-top: 1px solid var(--border); padding-top: 10px; font-size: 0.85rem;">
                <div style="text-align: left;">
                    <span style="color: var(--text-secondary); display: block; font-size: 0.7rem;">Bruto</span>
                    <span style="color: var(--primary); font-weight: 600;">R$ ${formatarMoeda(faturamentoBruto)}</span>
                </div>
                <div style="text-align: right;">
                    <span style="color: var(--text-secondary); display: block; font-size: 0.7rem;">Repasse (${state.configSistema.repasseDonoPct || 35}%)</span>
                    <span style="color: var(--warning); font-weight: 600;">R$ ${formatarMoeda(totalRepasse)}</span>
                </div>
            </div>
            <div style="font-size: 0.7rem; color: var(--text); margin-top: 10px; font-weight: 300;">
                Líquido na Conta: R$ ${formatarMoeda(faturamentoLiquido)}
            </div>
        `;
    }

    const ticketMedio = totalClientes > 0 ? faturamentoBruto / totalClientes : 0;
    const cardTicket = document.querySelector("#ticketMedio p");
    if (cardTicket) {
        cardTicket.innerHTML = `<span style="font-size: 1.1rem; font-weight: 500; color: var(--text);">R$ ${formatarMoeda(ticketMedio)}</span>`;
    }

    let maisVendido = "—";
    if (Object.keys(servicoCount).length) {
        maisVendido = Object.keys(servicoCount).reduce((a, b) =>
            servicoCount[a] > servicoCount[b] ? a : b
        );
    }

    const cardMaisVendido = document.querySelector("#servicoMaisVendido p");
    if (cardMaisVendido) {
        cardMaisVendido.innerHTML = `<span style="font-size: 1.1rem; font-weight: 500; color: var(--text);">${maisVendido}</span>`;
    }

    const cardCli = document.querySelector("#clientesAtendidos p");
    if (cardCli) {
        cardCli.innerHTML = `<span style="font-size: 1.1rem; font-weight: 500; color: var(--text);">${totalClientes}</span>`;
    }
}

export function atualizarGrafico() {
    const ctx = document.getElementById("graficoFaturamento");
    if (!ctx) return;

    const labels = [];
    const dataFat = [0, 0, 0, 0, 0, 0, 0];

    for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        labels.push(
            `${("0" + d.getDate()).slice(-2)}/${("0" + (d.getMonth() + 1)).slice(-2)}`
        );
    }

    state.atendimentos.forEach((a) => {
        const dataAt = new Date(a.data);
        const diaHoje = new Date();
        diaHoje.setHours(0, 0, 0, 0);
        dataAt.setHours(0, 0, 0, 0);

        const diffDays = Math.floor((diaHoje.getTime() - dataAt.getTime()) / 86400000);
        if (diffDays >= 0 && diffDays <= 6) {
            dataFat[6 - diffDays] += a.valorBrutoTotal || a.valorBruto || 0;
        }
    });

    if (graficoInstance) graficoInstance.destroy();

    graficoInstance = new Chart(ctx, {
        type: "bar",
        data: {
            labels,
            datasets: [{
                label: "Faturamento Bruto",
                data: dataFat,
                backgroundColor: "rgba(37, 99, 235, 0.35)",
                borderColor: "#3B82F6",
                borderWidth: 1,
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true,
                    grid: { color: "rgba(255,255,255,0.05)" },
                    ticks: { color: "#A0A7B5" }
                },
                x: {
                    grid: { display: false },
                    ticks: { color: "#A0A7B5" }
                }
            },
            plugins: { legend: { display: false } }
        }
    });
}

// =============================
// RELATÓRIOS - BOTÕES DE PERÍODO
// =============================
function setDatasRelatorio(tipo) {
    document.querySelectorAll("#relatorios .btn-filtro").forEach(btn => btn.classList.remove("active"));

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
