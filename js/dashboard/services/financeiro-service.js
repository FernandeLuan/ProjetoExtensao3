import { obterDataAtendimento, chaveData } from "../utils/date.js?v=4.0";

export function processarFinanceiro(valorBruto, pagamento, config) {
    const bruto = Number(valorBruto || 0);
    const taxaDebito = Number(config?.taxaDebito ?? 1.5) / 100;
    const taxaCredito = Number(config?.taxaCredito ?? 3.51) / 100;
    const repassePct = Number(config?.repasseDonoPct ?? 35) / 100;

    let liquidoConta = bruto;
    let taxaAplicadaPct = 0;

    if (pagamento === "Débito") {
        taxaAplicadaPct = Number(config?.taxaDebito ?? 1.5);
        liquidoConta -= bruto * taxaDebito;
    } else if (pagamento === "Crédito") {
        taxaAplicadaPct = Number(config?.taxaCredito ?? 3.51);
        liquidoConta -= bruto * taxaCredito;
    }

    const repasseDono = liquidoConta * repassePct;
    const liquidoBarbeiro = liquidoConta - repasseDono;

    return {
        valorBruto: Number(bruto.toFixed(2)),
        liquidoConta: Number(liquidoConta.toFixed(2)),
        repasseDono: Number(repasseDono.toFixed(2)),
        liquidoBarbeiro: Number(liquidoBarbeiro.toFixed(2)),
        taxaAplicadaPct,
        repasseDonoPct: Number(config?.repasseDonoPct ?? 35)
    };
}

export function obterAtendimentosDoDia(atendimentos, data) {
    const chave = chaveData(data);
    return (atendimentos || []).filter((atendimento) => {
        const dataAtendimento = obterDataAtendimento(atendimento);
        return dataAtendimento && chaveData(dataAtendimento) === chave;
    });
}

export function obterResumoDoDia(atendimentos, data) {
    const lista = obterAtendimentosDoDia(atendimentos, data);
    let faturamentoBruto = 0;
    let totalRepasse = 0;
    let lucroBarbeiro = 0;
    const servicos = {};

    lista.forEach((atendimento) => {
        const bruto = Number(atendimento.valorBrutoTotal ?? atendimento.valorBruto ?? atendimento.valorServicoBruto ?? 0);
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
    const ticketMedio = totalAtendimentos ? faturamentoBruto / totalAtendimentos : 0;
    let servicoMaisVendido = "—";
    let quantidadeMaisVendida = 0;

    Object.entries(servicos).forEach(([servico, quantidade]) => {
        if (quantidade > quantidadeMaisVendida) {
            servicoMaisVendido = servico;
            quantidadeMaisVendida = quantidade;
        }
    });

    return {
        faturamentoBruto,
        totalRepasse,
        lucroBarbeiro,
        totalAtendimentos,
        ticketMedio,
        servicoMaisVendido,
        quantidadeMaisVendida,
        percentualMaisVendido: totalAtendimentos
            ? Math.round((quantidadeMaisVendida / totalAtendimentos) * 100)
            : 0
    };
}
