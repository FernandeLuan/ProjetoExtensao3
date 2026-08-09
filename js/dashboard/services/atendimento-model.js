import { SCHEMA_VERSION } from "../constants.js?v=7.4";
import { processarFinanceiro } from "./financeiro-service.js?v=7.4";

function snapshotFinanceiro(financeiro, config) {
    return {
        taxaDebitoPct: Number(config?.taxaDebito ?? 1.5),
        taxaCreditoPct: Number(config?.taxaCredito ?? 3.51),
        taxaAplicadaPct: financeiro.taxaAplicadaPct,
        taxaCartaoValor: financeiro.taxaCartaoValor,
        repasseDonoPct: financeiro.repasseDonoPct,
        valorBruto: financeiro.valorBruto,
        valorLiquido: financeiro.liquidoConta,
        repasseDono: financeiro.repasseDono,
        liquidoBarbeiro: financeiro.liquidoBarbeiro
    };
}

export function criarPayloadAtendimento({
    servico,
    servicoId = null,
    servicoNome = null,
    precoBase = null,
    precoProfissional = null,
    origemPreco = "padrao",
    pagamento,
    valorBruto,
    observacao = "",
    valorDiferenciado = false,
    dataAtendimento = new Date(),
    retroativo = false,
    horaInformada = true,
    profissional = null
}, config) {
    const nomeServico = servicoNome || servico || "Serviço";
    const repassePct = Number(profissional?.repassePct ?? config?.repasseDonoPct ?? 35);
    const financeiro = processarFinanceiro(valorBruto, pagamento, config, repassePct);
    const data = dataAtendimento instanceof Date ? dataAtendimento : new Date(dataAtendimento);

    return {
        cliente: "Avulso",
        servicoId: servicoId || null,
        servico: nomeServico,
        servicoNome: nomeServico,
        precoBase: Number(precoBase ?? valorBruto ?? 0),
        precoProfissional: precoProfissional == null ? null : Number(precoProfissional),
        origemPreco: valorDiferenciado ? "ajustado" : origemPreco,
        pagamento,
        valorServicoBruto: financeiro.valorBruto,
        valorBrutoTotal: financeiro.valorBruto,
        valorLiquido: financeiro.liquidoConta,
        taxaCartaoValor: financeiro.taxaCartaoValor,
        repasseDono: financeiro.repasseDono,
        liquidoBarbeiro: financeiro.liquidoBarbeiro,
        profissionalUid: profissional?.uid || profissional?.id || null,
        profissionalNome: profissional?.nome || null,
        data: data.toISOString(),
        dataAtendimento: data,
        valorDiferenciado: Boolean(valorDiferenciado),
        observacao: String(observacao || "").trim().slice(0, 160),
        editado: false,
        retroativo: Boolean(retroativo),
        horaInformada: Boolean(horaInformada),
        schemaVersion: SCHEMA_VERSION,
        financeiro: snapshotFinanceiro(financeiro, config)
    };
}

export function criarAtualizacaoFinanceiraAtendimento({
    servico,
    servicoId = null,
    precoBase = null,
    precoProfissional = null,
    origemPreco = "padrao",
    pagamento,
    valorBruto,
    observacao,
    valorDiferenciado
}, config, original = null) {
    const repasseOriginal = Number(original?.financeiro?.repasseDonoPct ?? original?.repasseDonoPct);
    const repassePct = Number.isFinite(repasseOriginal)
        ? repasseOriginal
        : Number(config?.repasseDonoPct ?? 35);

    const configSnapshot = {
        ...config,
        taxaDebito: Number(original?.financeiro?.taxaDebitoPct ?? config?.taxaDebito ?? 1.5),
        taxaCredito: Number(original?.financeiro?.taxaCreditoPct ?? config?.taxaCredito ?? 3.51)
    };

    const financeiro = processarFinanceiro(valorBruto, pagamento, configSnapshot, repassePct);

    return {
        servico,
        servicoNome: servico,
        servicoId,
        precoBase: Number(precoBase ?? original?.precoBase ?? valorBruto),
        precoProfissional: precoProfissional == null ? (original?.precoProfissional ?? null) : Number(precoProfissional),
        origemPreco: valorDiferenciado ? "ajustado" : origemPreco,
        pagamento,
        valorServicoBruto: financeiro.valorBruto,
        valorBrutoTotal: financeiro.valorBruto,
        valorLiquido: financeiro.liquidoConta,
        taxaCartaoValor: financeiro.taxaCartaoValor,
        repasseDono: financeiro.repasseDono,
        liquidoBarbeiro: financeiro.liquidoBarbeiro,
        observacao: String(observacao || "").trim().slice(0, 160),
        valorDiferenciado: Boolean(valorDiferenciado),
        schemaVersion: SCHEMA_VERSION,
        financeiro: snapshotFinanceiro(financeiro, configSnapshot)
    };
}
