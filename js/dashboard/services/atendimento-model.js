import { SCHEMA_VERSION } from "../constants.js?v=4.0";
import { processarFinanceiro } from "./financeiro-service.js?v=4.0";

export function criarPayloadAtendimento({
    servico,
    pagamento,
    valorBruto,
    observacao = "",
    valorDiferenciado = false,
    dataAtendimento = new Date(),
    retroativo = false,
    horaInformada = true
}, config) {
    const financeiro = processarFinanceiro(valorBruto, pagamento, config);
    const data = dataAtendimento instanceof Date ? dataAtendimento : new Date(dataAtendimento);

    return {
        cliente: "Avulso",
        servico,
        pagamento,
        valorServicoBruto: financeiro.valorBruto,
        valorBrutoTotal: financeiro.valorBruto,
        valorLiquido: financeiro.liquidoConta,
        repasseDono: financeiro.repasseDono,
        liquidoBarbeiro: financeiro.liquidoBarbeiro,
        data: data.toISOString(),
        dataAtendimento: data,
        valorDiferenciado: Boolean(valorDiferenciado),
        observacao: String(observacao || "").trim().slice(0, 160),
        editado: false,
        retroativo: Boolean(retroativo),
        horaInformada: Boolean(horaInformada),
        schemaVersion: SCHEMA_VERSION,
        financeiro: {
            taxaDebitoPct: Number(config?.taxaDebito ?? 1.5),
            taxaCreditoPct: Number(config?.taxaCredito ?? 3.51),
            taxaAplicadaPct: financeiro.taxaAplicadaPct,
            repasseDonoPct: financeiro.repasseDonoPct,
            valorBruto: financeiro.valorBruto,
            valorLiquido: financeiro.liquidoConta,
            repasseDono: financeiro.repasseDono,
            liquidoBarbeiro: financeiro.liquidoBarbeiro
        }
    };
}

export function criarAtualizacaoFinanceiraAtendimento({
    servico,
    pagamento,
    valorBruto,
    observacao,
    valorDiferenciado
}, config) {
    const financeiro = processarFinanceiro(valorBruto, pagamento, config);

    return {
        servico,
        pagamento,
        valorServicoBruto: financeiro.valorBruto,
        valorBrutoTotal: financeiro.valorBruto,
        valorLiquido: financeiro.liquidoConta,
        repasseDono: financeiro.repasseDono,
        liquidoBarbeiro: financeiro.liquidoBarbeiro,
        observacao: String(observacao || "").trim().slice(0, 160),
        valorDiferenciado: Boolean(valorDiferenciado),
        schemaVersion: SCHEMA_VERSION,
        financeiro: {
            taxaDebitoPct: Number(config?.taxaDebito ?? 1.5),
            taxaCreditoPct: Number(config?.taxaCredito ?? 3.51),
            taxaAplicadaPct: financeiro.taxaAplicadaPct,
            repasseDonoPct: financeiro.repasseDonoPct,
            valorBruto: financeiro.valorBruto,
            valorLiquido: financeiro.liquidoConta,
            repasseDono: financeiro.repasseDono,
            liquidoBarbeiro: financeiro.liquidoBarbeiro
        }
    };
}
