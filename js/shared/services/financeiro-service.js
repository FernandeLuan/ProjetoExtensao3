import { obterDataAtendimento, chaveData } from "../utils/date.js?v=11.2";

export function processarFinanceiro(valorBruto, pagamento, config, repassePctInformado = null) {
    const bruto = Number(valorBruto || 0);
    const taxaDebitoPct = Number(config?.taxaDebito ?? 1.5);
    const taxaCreditoPct = Number(config?.taxaCredito ?? 3.51);
    const repassePct = Number(repassePctInformado ?? config?.repasseDonoPct ?? 35);

    let taxaAplicadaPct = 0;
    if (pagamento === "Débito") taxaAplicadaPct = taxaDebitoPct;
    if (pagamento === "Crédito") taxaAplicadaPct = taxaCreditoPct;

    const taxaCartaoValor = bruto * (taxaAplicadaPct / 100);
    const liquidoConta = bruto - taxaCartaoValor;

    // Regra vigente: o repasse da barbearia é calculado sobre o valor bruto do serviço.
    // A taxa do cartão continua sendo um custo separado do profissional.
    const repasseDono = bruto * (repassePct / 100);
    const liquidoBarbeiro = liquidoConta - repasseDono;

    return {
        valorBruto: Number(bruto.toFixed(2)),
        taxaAplicadaPct: Number(taxaAplicadaPct.toFixed(2)),
        taxaCartaoValor: Number(taxaCartaoValor.toFixed(2)),
        liquidoConta: Number(liquidoConta.toFixed(2)),
        repasseDonoPct: Number(repassePct.toFixed(2)),
        repasseDono: Number(repasseDono.toFixed(2)),
        liquidoBarbeiro: Number(liquidoBarbeiro.toFixed(2))
    };
}

export function obterBrutoAtendimento(atendimento) {
    return Number(
        atendimento?.valorBrutoTotal ??
        atendimento?.valorBruto ??
        atendimento?.valorServicoBruto ??
        atendimento?.financeiro?.valorBruto ??
        0
    );
}

export function obterTaxaCartaoValor(atendimento) {
    const salvo = Number(atendimento?.financeiro?.taxaCartaoValor);
    if (Number.isFinite(salvo)) return salvo;

    const bruto = obterBrutoAtendimento(atendimento);
    const liquido = Number(atendimento?.valorLiquido ?? atendimento?.financeiro?.valorLiquido ?? bruto);
    return Math.max(0, Number((bruto - liquido).toFixed(2)));
}

export function obterRepasseAtendimento(atendimento) {
    return Number(atendimento?.repasseDono ?? atendimento?.financeiro?.repasseDono ?? 0);
}

export function obterLiquidoBarbeiro(atendimento) {
    const salvo = Number(atendimento?.liquidoBarbeiro ?? atendimento?.financeiro?.liquidoBarbeiro);
    if (Number.isFinite(salvo)) return salvo;

    const bruto = obterBrutoAtendimento(atendimento);
    return bruto - obterTaxaCartaoValor(atendimento) - obterRepasseAtendimento(atendimento);
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
    let totalTaxas = 0;
    const servicos = {};

    lista.forEach((atendimento) => {
        const bruto = obterBrutoAtendimento(atendimento);
        faturamentoBruto += bruto;
        totalRepasse += obterRepasseAtendimento(atendimento);
        lucroBarbeiro += obterLiquidoBarbeiro(atendimento);
        totalTaxas += obterTaxaCartaoValor(atendimento);

        const nomeServico = atendimento.servicoNome || atendimento.servico;
        if (nomeServico) servicos[nomeServico] = (servicos[nomeServico] ?? 0) + 1;
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
        totalTaxas,
        totalAtendimentos,
        ticketMedio,
        servicoMaisVendido,
        quantidadeMaisVendida,
        percentualMaisVendido: totalAtendimentos
            ? Math.round((quantidadeMaisVendida / totalAtendimentos) * 100)
            : 0
    };
}
