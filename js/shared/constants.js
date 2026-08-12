export const APP_NAME = "Sr NK";
export const APP_VERSION = "3.7.0";
export const SCHEMA_VERSION = 3;

export const PAPEIS = Object.freeze({
    ADMIN: "admin",
    BARBER: "barber"
});

export const PAGAMENTOS = Object.freeze([
    "Pix",
    "Dinheiro",
    "Débito",
    "Crédito"
]);

export const SERVICOS_PADRAO = Object.freeze([
    Object.freeze({ id: "cabelo-barba-sobrancelha", nome: "Cabelo + Barba + Sobrancelha", preco: 110, ativo: true, ordem: 1 }),
    Object.freeze({ id: "cabelo-barba", nome: "Cabelo + Barba", preco: 105, ativo: true, ordem: 2 }),
    Object.freeze({ id: "cabelo-sobrancelha", nome: "Cabelo + Sobrancelha", preco: 75, ativo: true, ordem: 3 }),
    Object.freeze({ id: "cabelo", nome: "Cabelo", preco: 60, ativo: true, ordem: 4 }),
    Object.freeze({ id: "barba", nome: "Barba", preco: 50, ativo: true, ordem: 5 })
]);

export const DEFAULT_CONFIG = Object.freeze({
    taxaDebito: 1.5,
    taxaCredito: 3.51,
    repasseDonoPct: 35, // fallback para registros/membros antigos
    comissaoProdutosPct: 20,
    taxaDebitoProdutosPct: 1.5,
    taxaCreditoProdutosPct: 3.51,
    pagamentoPadrao: "nenhum",
    pagamentosAtivos: Object.freeze({
        Pix: true,
        Dinheiro: true,
        "Débito": true,
        "Crédito": true
    })
});

export function criarServicosPadrao() {
    return SERVICOS_PADRAO.map((servico) => ({ ...servico }));
}

export function criarConfigPadrao() {
    const servicos = criarServicosPadrao();

    return {
        taxaDebito: DEFAULT_CONFIG.taxaDebito,
        taxaCredito: DEFAULT_CONFIG.taxaCredito,
        repasseDonoPct: DEFAULT_CONFIG.repasseDonoPct,
        comissaoProdutosPct: DEFAULT_CONFIG.comissaoProdutosPct,
        taxaDebitoProdutosPct: DEFAULT_CONFIG.taxaDebitoProdutosPct,
        taxaCreditoProdutosPct: DEFAULT_CONFIG.taxaCreditoProdutosPct,
        pagamentoPadrao: DEFAULT_CONFIG.pagamentoPadrao,
        pagamentosAtivos: { ...DEFAULT_CONFIG.pagamentosAtivos },
        servicos,
        // Mantido para compatibilidade com dados/telas antigas durante a transição.
        precos: Object.fromEntries(servicos.map((servico) => [servico.nome, servico.preco]))
    };
}

export function normalizarConfig(config = {}) {
    const base = criarConfigPadrao();

    let servicos = Array.isArray(config.servicos) && config.servicos.length
        ? config.servicos.map((servico, indice) => ({
            id: String(servico.id || `servico-${indice + 1}`),
            nome: String(servico.nome || "Serviço").trim().slice(0, 60),
            preco: Number(servico.preco || 0),
            ativo: servico.ativo !== false,
            ordem: Number(servico.ordem ?? indice + 1)
        }))
        : base.servicos.map((servico) => ({
            ...servico,
            preco: Number(config.precos?.[servico.nome] ?? servico.preco)
        }));

    servicos = servicos
        .filter((servico) => servico.nome && Number.isFinite(servico.preco))
        .sort((a, b) => a.ordem - b.ordem);

    const precos = Object.fromEntries(servicos.map((servico) => [servico.nome, Number(servico.preco || 0)]));

    return {
        ...base,
        ...config,
        taxaDebito: Number(config.taxaDebito ?? base.taxaDebito),
        taxaCredito: Number(config.taxaCredito ?? base.taxaCredito),
        repasseDonoPct: Number(config.repasseDonoPct ?? base.repasseDonoPct),
        comissaoProdutosPct: Math.max(0, Math.min(100, Number(config.comissaoProdutosPct ?? base.comissaoProdutosPct))),
        taxaDebitoProdutosPct: Math.max(0, Math.min(9.99, Number(config.taxaDebitoProdutosPct ?? config.taxaDebito ?? base.taxaDebitoProdutosPct))),
        taxaCreditoProdutosPct: Math.max(0, Math.min(9.99, Number(config.taxaCreditoProdutosPct ?? config.taxaCredito ?? base.taxaCreditoProdutosPct))),
        pagamentoPadrao: PAGAMENTOS.includes(config.pagamentoPadrao) ? config.pagamentoPadrao : "nenhum",
        pagamentosAtivos: {
            ...base.pagamentosAtivos,
            ...(config.pagamentosAtivos || {})
        },
        servicos,
        precos
    };
}
