import { SCHEMA_VERSION } from "../constants.js?v=13.0";
import { processarFinanceiro } from "./financeiro-service.js?v=13.0";

function taxaProfissional(profissional, campo) {
    const numero = Number(profissional?.[campo]);
    return Number.isFinite(numero) && numero >= 0 && numero < 10 ? numero : null;
}

function configFinanceiraProfissional(config, profissional = null, pagamento = "") {
    const debito = taxaProfissional(profissional, "taxaDebitoPct");
    const credito = taxaProfissional(profissional, "taxaCreditoPct");
    if (pagamento === "Débito" && debito == null) throw new Error("Configure a taxa de débito do profissional antes de registrar no cartão.");
    if (pagamento === "Crédito" && credito == null) throw new Error("Configure a taxa de crédito do profissional antes de registrar no cartão.");
    return {...config, taxaDebito: debito ?? 0, taxaCredito: credito ?? 0};
}

function snapshotFinanceiro(financeiro, config, profissionalDono = false) {
    return {
        profissionalDono: Boolean(profissionalDono),
        taxaDebitoPct: Number(config?.taxaDebito ?? 0),
        taxaCreditoPct: Number(config?.taxaCredito ?? 0),
        taxaAplicadaPct: financeiro.taxaAplicadaPct,
        taxaCartaoValor: financeiro.taxaCartaoValor,
        repasseDonoPct: financeiro.repasseDonoPct,
        valorBruto: financeiro.valorBruto,
        valorLiquido: financeiro.liquidoConta,
        repasseDono: financeiro.repasseDono,
        liquidoBarbeiro: financeiro.liquidoBarbeiro,
        regraRepasseBase: "valorBruto",
        regraFinanceiraVersion: 2
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
    const profissionalDono = profissional?.dono === true;
    const repassePct = profissionalDono
        ? 0
        : Number(profissional?.repassePct ?? config?.repasseDonoPct ?? 35);
    const configProfissional = configFinanceiraProfissional(config, profissional, pagamento);
    const financeiro = processarFinanceiro(valorBruto, pagamento, configProfissional, repassePct);
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
        profissionalDono: Boolean(profissionalDono),
        regraRepasseBase: "valorBruto",
        regraFinanceiraVersion: 2,
        data: data.toISOString(),
        dataAtendimento: data,
        valorDiferenciado: Boolean(valorDiferenciado),
        observacao: String(observacao || "").trim().slice(0, 160),
        editado: false,
        retroativo: Boolean(retroativo),
        horaInformada: Boolean(horaInformada),
        schemaVersion: SCHEMA_VERSION,
        financeiro: snapshotFinanceiro(financeiro, configProfissional, profissionalDono)
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
    const profissionalDono = original?.profissionalDono === true
        || original?.financeiro?.profissionalDono === true;
    const repasseOriginal = Number(original?.financeiro?.repasseDonoPct ?? original?.repasseDonoPct);
    const repassePct = profissionalDono
        ? 0
        : (Number.isFinite(repasseOriginal)
            ? repasseOriginal
            : Number(config?.repasseDonoPct ?? 35));

    const configSnapshot = {
        ...config,
        taxaDebito: Number(original?.financeiro?.taxaDebitoPct ?? 0),
        taxaCredito: Number(original?.financeiro?.taxaCreditoPct ?? 0)
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
        profissionalDono: Boolean(profissionalDono),
        regraRepasseBase: "valorBruto",
        regraFinanceiraVersion: 2,
        schemaVersion: SCHEMA_VERSION,
        financeiro: snapshotFinanceiro(financeiro, configSnapshot, profissionalDono)
    };
}
