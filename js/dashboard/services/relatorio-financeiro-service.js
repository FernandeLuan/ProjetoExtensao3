import {
    obterBrutoAtendimento,
    obterTaxaCartaoValor,
    obterRepasseAtendimento,
    obterLiquidoBarbeiro
} from "./financeiro-service.js?v=8.30";

function numero(valor) {
    const n = Number(valor || 0);
    return Number.isFinite(n) ? n : 0;
}

function arredondar(valor) {
    return Number(numero(valor).toFixed(2));
}

function acumularMapa(mapa, chave, fabrica) {
    if (!mapa.has(chave)) mapa.set(chave, fabrica());
    return mapa.get(chave);
}

export function calcularResumoVendasProdutos(vendas = [], { visaoBarbearia = false } = {}) {
    let vendasBrutas = 0;
    let taxasPagamento = 0;
    let custoProdutos = 0;
    let comissoesEquipe = 0;
    let comissaoProfissional = 0;
    let quantidadeItens = 0;
    const porProfissional = new Map();

    (vendas || []).forEach((venda) => {
        const bruto = numero(venda?.valorBruto);
        const taxa = numero(venda?.taxaPagamentoValor);
        const custo = numero(venda?.custoTotalSnapshot);
        const comissao = numero(venda?.comissaoValor);
        const quantidade = numero(venda?.quantidade);

        vendasBrutas += bruto;
        taxasPagamento += taxa;
        custoProdutos += custo;
        comissoesEquipe += comissao;
        quantidadeItens += quantidade;
        if (!visaoBarbearia) comissaoProfissional += comissao;

        if (visaoBarbearia && venda?.gerarComissao === true && venda?.profissionalUid) {
            const uid = String(venda.profissionalUid);
            const item = acumularMapa(porProfissional, uid, () => ({
                uid,
                nome: String(venda.profissionalNomeSnapshot || "Profissional"),
                vendas: 0,
                itens: 0,
                bruto: 0,
                comissao: 0
            }));
            item.vendas += 1;
            item.itens += quantidade;
            item.bruto += bruto;
            item.comissao += comissao;
        }
    });

    const resultadoBarbearia = vendasBrutas - taxasPagamento - custoProdutos - comissoesEquipe;

    return {
        quantidadeVendas: (vendas || []).length,
        quantidadeItens: arredondar(quantidadeItens),
        vendasBrutas: arredondar(vendasBrutas),
        taxasPagamento: arredondar(taxasPagamento),
        liquidoAposTaxas: arredondar(vendasBrutas - taxasPagamento),
        custoProdutos: arredondar(custoProdutos),
        comissoesEquipe: arredondar(comissoesEquipe),
        comissaoProfissional: arredondar(comissaoProfissional),
        resultadoBarbearia: arredondar(resultadoBarbearia),
        porProfissional: [...porProfissional.values()]
            .map((item) => ({
                ...item,
                bruto: arredondar(item.bruto),
                comissao: arredondar(item.comissao)
            }))
            .sort((a, b) => b.comissao - a.comissao)
    };
}

export function calcularFechamentoFinanceiro({
    atendimentos = [],
    despesas = [],
    vendas = [],
    visaoBarbearia = false,
    ehProfissionalDono = () => false,
    nomeProfissional = () => "Profissional"
} = {}) {
    let faturamentoBruto = 0;
    let taxasCartao = 0;
    let repasseBarbearia = 0;
    let liquidoProfissionais = 0;
    let producaoDonoLiquida = 0;
    let valorServicosProfissional = 0;

    const pagamentos = new Map();
    const equipe = new Map();

    (atendimentos || []).forEach((atendimento) => {
        const bruto = obterBrutoAtendimento(atendimento);
        const taxa = obterTaxaCartaoValor(atendimento);
        const repasse = obterRepasseAtendimento(atendimento);
        const liquido = obterLiquidoBarbeiro(atendimento);
        const uid = String(atendimento?.profissionalUid || "__legado__");
        const dono = Boolean(
            atendimento?.profissionalDono === true ||
            atendimento?.financeiro?.profissionalDono === true ||
            ehProfissionalDono(uid, atendimento)
        );

        faturamentoBruto += bruto;
        taxasCartao += taxa;
        repasseBarbearia += repasse;
        valorServicosProfissional += liquido;

        if (visaoBarbearia) {
            if (dono) producaoDonoLiquida += liquido;
            else liquidoProfissionais += liquido;
        }

        const pagamentoNome = String(atendimento?.pagamento || "Outros").trim() || "Outros";
        const pagamento = acumularMapa(pagamentos, pagamentoNome, () => ({
            nome: pagamentoNome,
            quantidade: 0,
            bruto: 0,
            taxas: 0,
            liquidoAposTaxas: 0
        }));
        pagamento.quantidade += 1;
        pagamento.bruto += bruto;
        pagamento.taxas += taxa;
        pagamento.liquidoAposTaxas += bruto - taxa;

        if (visaoBarbearia) {
            const itemEquipe = acumularMapa(equipe, uid, () => ({
                uid,
                nome: nomeProfissional(uid, atendimento),
                dono,
                quantidade: 0,
                bruto: 0,
                taxas: 0,
                repasse: 0
            }));
            itemEquipe.quantidade += 1;
            itemEquipe.bruto += bruto;
            itemEquipe.taxas += taxa;
            itemEquipe.repasse += repasse;
        }
    });

    const despesasConsideradas = (despesas || []).filter((despesa) =>
        visaoBarbearia
            ? despesa?.tipo === "barbearia"
            : despesa?.tipo !== "barbearia"
    );

    const despesasPorCategoria = new Map();
    let totalDespesas = 0;

    despesasConsideradas.forEach((despesa) => {
        const valor = numero(despesa?.valor);
        const categoria = String(despesa?.categoria || "Outros").trim() || "Outros";
        totalDespesas += valor;
        despesasPorCategoria.set(categoria, (despesasPorCategoria.get(categoria) || 0) + valor);
    });

    const produtos = calcularResumoVendasProdutos(vendas, { visaoBarbearia });
    const liquidoAposTaxas = faturamentoBruto - taxasCartao;

    // Serviços e produtos têm naturezas diferentes:
    // - na barbearia, entram líquido do dono + repasses da equipe + resultado das vendas de produtos;
    // - no profissional, entra o valor dos serviços + comissão de produtos.
    const receitaServicosBarbearia = producaoDonoLiquida + repasseBarbearia;
    const totalProfissional = valorServicosProfissional + produtos.comissaoProfissional;
    const receitaAntesDespesas = visaoBarbearia
        ? receitaServicosBarbearia + produtos.resultadoBarbearia
        : totalProfissional;
    const resultadoAposCustos = receitaAntesDespesas - totalDespesas;
    const baseMargem = visaoBarbearia
        ? faturamentoBruto + produtos.vendasBrutas
        : faturamentoBruto;
    const margemLiquida = baseMargem > 0
        ? (resultadoAposCustos / baseMargem) * 100
        : 0;
    const ticketMedio = atendimentos.length
        ? faturamentoBruto / atendimentos.length
        : 0;

    return {
        faturamentoBruto: arredondar(faturamentoBruto),
        taxasCartao: arredondar(taxasCartao),
        liquidoAposTaxas: arredondar(liquidoAposTaxas),
        repasse: arredondar(repasseBarbearia),
        repasseEquipe: visaoBarbearia ? arredondar(repasseBarbearia) : 0,
        repasseRecebido: visaoBarbearia ? arredondar(repasseBarbearia) : 0, // compatibilidade
        repasseBarbearia: !visaoBarbearia ? arredondar(repasseBarbearia) : 0,
        liquidoProfissionais: arredondar(liquidoProfissionais), // compatibilidade, não exibido no fechamento admin
        producaoDonoLiquida: arredondar(producaoDonoLiquida),
        valorServicosProfissional: arredondar(valorServicosProfissional),
        totalProfissional: arredondar(totalProfissional),
        receitaServicosBarbearia: arredondar(receitaServicosBarbearia),
        receitaAntesDespesas: arredondar(receitaAntesDespesas),
        totalDespesas: arredondar(totalDespesas),
        resultadoLiquido: arredondar(resultadoAposCustos),
        resultadoAposCustos: arredondar(resultadoAposCustos),
        margemLiquida: Number(margemLiquida.toFixed(2)),
        ticketMedio: arredondar(ticketMedio),
        atendimentos: atendimentos.length,
        saidaParticipacao: visaoBarbearia ? 0 : arredondar(repasseBarbearia),
        produtos,
        pagamentos: [...pagamentos.values()]
            .map((item) => ({
                ...item,
                bruto: arredondar(item.bruto),
                taxas: arredondar(item.taxas),
                liquidoAposTaxas: arredondar(item.liquidoAposTaxas)
            }))
            .sort((a, b) => b.bruto - a.bruto),
        despesasPorCategoria: [...despesasPorCategoria.entries()]
            .map(([nome, valor]) => ({ nome, valor: arredondar(valor) }))
            .sort((a, b) => b.valor - a.valor),
        equipe: [...equipe.values()]
            .map((item) => ({
                ...item,
                bruto: arredondar(item.bruto),
                taxas: arredondar(item.taxas),
                repasse: arredondar(item.repasse)
            }))
            .sort((a, b) => b.bruto - a.bruto)
    };
}
