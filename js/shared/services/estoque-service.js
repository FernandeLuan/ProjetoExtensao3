export const CATEGORIAS_ESTOQUE = Object.freeze([
    "Uso profissional",
    "Higiene",
    "Bebidas",
    "Comidas",
    "Outros"
]);

export const FORMAS_PAGAMENTO_VENDA = Object.freeze([
    "Pix",
    "Dinheiro",
    "Débito",
    "Crédito"
]);

export function normalizarCodigoBarras(valor) {
    return String(valor || "")
        .trim()
        .replace(/\s+/g, "")
        .slice(0, 64);
}

export function numeroSeguro(valor, fallback = 0) {
    const numero = Number(valor);
    return Number.isFinite(numero) ? numero : fallback;
}

export function arredondar2(valor) {
    return Number(numeroSeguro(valor).toFixed(2));
}

export function normalizarQuantidade(valor) {
    const numero = numeroSeguro(valor, NaN);
    if (!Number.isFinite(numero) || numero < 0) return null;
    return Number(numero.toFixed(3));
}

export function statusEstoque(produto) {
    if (produto?.ativo === false) return "arquivado";
    return numeroSeguro(produto?.quantidadeAtual) <= 0 ? "zerado" : "ok";
}

export function formatarQuantidadeEstoque(valor) {
    const numero = numeroSeguro(valor);
    const casas = Number.isInteger(numero) ? 0 : Math.min(3, String(numero).split(".")[1]?.length || 0);
    return numero.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: 3 });
}

export function taxaPagamentoProdutos(configVenda, formaPagamento) {
    if (formaPagamento === "Débito") {
        return Math.max(0, Math.min(9.99, numeroSeguro(configVenda?.taxaDebitoProdutosPct ?? configVenda?.taxaDebito, 1.5)));
    }
    if (formaPagamento === "Crédito") {
        return Math.max(0, Math.min(9.99, numeroSeguro(configVenda?.taxaCreditoProdutosPct ?? configVenda?.taxaCredito, 3.51)));
    }
    return 0;
}

export function calcularVendaProduto({
    produto,
    quantidade = 1,
    formaPagamento = "Pix",
    gerarComissao = false,
    comissaoPct = 0,
    configVenda = null
} = {}) {
    const qtd = Math.max(0, numeroSeguro(quantidade));
    const precoUnitario = Math.max(0, numeroSeguro(produto?.precoVenda));
    const custoUnitario = Math.max(0, numeroSeguro(produto?.custoUnitario));
    const bruto = arredondar2(precoUnitario * qtd);
    const taxaPct = taxaPagamentoProdutos(configVenda, formaPagamento);
    const taxaValor = arredondar2(bruto * taxaPct / 100);
    const pct = gerarComissao ? Math.max(0, Math.min(100, numeroSeguro(comissaoPct))) : 0;
    const comissaoValor = gerarComissao ? arredondar2(bruto * pct / 100) : 0;
    const custoTotal = arredondar2(custoUnitario * qtd);
    const resultadoBarbearia = arredondar2(bruto - taxaValor - comissaoValor - custoTotal);

    return {
        quantidade: qtd,
        precoUnitario,
        custoUnitario,
        valorBruto: bruto,
        taxaPagamentoPct: arredondar2(taxaPct),
        taxaPagamentoValor: taxaValor,
        comissaoPct: arredondar2(pct),
        comissaoValor,
        custoTotal,
        resultadoBarbearia
    };
}

export function validarProduto(produto = {}) {
    const nome = String(produto.nome || "").trim().slice(0, 80);
    const categoria = CATEGORIAS_ESTOQUE.includes(produto.categoria)
        ? produto.categoria
        : "Outros";
    const quantidadeAtual = normalizarQuantidade(produto.quantidadeAtual);
    const custoUnitario = arredondar2(produto.custoUnitario);
    const precoVenda = arredondar2(produto.precoVenda);

    if (nome.length < 2) throw new Error("Informe o nome do produto.");
    if (quantidadeAtual === null) throw new Error("Informe uma quantidade válida.");
    if (custoUnitario < 0) throw new Error("Informe um custo válido.");
    if (precoVenda <= 0) throw new Error("Informe o preço de venda do produto.");

    return {
        nome,
        categoria,
        codigoBarras: normalizarCodigoBarras(produto.codigoBarras),
        // Campos mantidos internamente para compatibilidade com os documentos antigos.
        unidade: String(produto.unidade || "un"),
        quantidadeAtual,
        estoqueMinimo: 0,
        custoUnitario,
        precoVenda,
        vendavel: true,
        ativo: produto.ativo !== false
    };
}
