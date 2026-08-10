import {
    obterBrutoAtendimento,
    obterTaxaCartaoValor,
    obterRepasseAtendimento,
    obterLiquidoBarbeiro
} from "./financeiro-service.js?v=8.27";

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

export function calcularFechamentoFinanceiro({
    atendimentos = [],
    despesas = [],
    visaoBarbearia = false,
    ehProfissionalDono = () => false,
    nomeProfissional = () => "Profissional"
} = {}) {
    let faturamentoBruto = 0;
    let taxasCartao = 0;
    let repasseBarbearia = 0;
    let liquidoProfissionais = 0;
    let producaoDonoLiquida = 0;
    let liquidoProfissional = 0;

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
        liquidoProfissional += liquido;

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
                repasse: 0,
                liquidoProfissional: 0
            }));
            itemEquipe.quantidade += 1;
            itemEquipe.bruto += bruto;
            itemEquipe.taxas += taxa;
            itemEquipe.repasse += repasse;
            itemEquipe.liquidoProfissional += liquido;
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
        const atual = despesasPorCategoria.get(categoria) || 0;
        despesasPorCategoria.set(categoria, atual + valor);
    });

    const liquidoAposTaxas = faturamentoBruto - taxasCartao;
    const receitaAntesDespesas = visaoBarbearia
        ? producaoDonoLiquida + repasseBarbearia
        : liquidoProfissional;
    const saidaParticipacao = visaoBarbearia
        ? liquidoProfissionais
        : repasseBarbearia;
    const resultadoLiquido = receitaAntesDespesas - totalDespesas;
    const margemLiquida = faturamentoBruto > 0
        ? (resultadoLiquido / faturamentoBruto) * 100
        : 0;
    const ticketMedio = atendimentos.length
        ? faturamentoBruto / atendimentos.length
        : 0;

    return {
        faturamentoBruto: arredondar(faturamentoBruto),
        taxasCartao: arredondar(taxasCartao),
        liquidoAposTaxas: arredondar(liquidoAposTaxas),
        repasse: arredondar(repasseBarbearia),
        repasseRecebido: visaoBarbearia ? arredondar(repasseBarbearia) : 0,
        repasseBarbearia: !visaoBarbearia ? arredondar(repasseBarbearia) : 0,
        liquidoProfissionais: arredondar(liquidoProfissionais),
        producaoDonoLiquida: arredondar(producaoDonoLiquida),
        receitaAntesDespesas: arredondar(receitaAntesDespesas),
        totalDespesas: arredondar(totalDespesas),
        resultadoLiquido: arredondar(resultadoLiquido),
        margemLiquida: Number(margemLiquida.toFixed(2)),
        ticketMedio: arredondar(ticketMedio),
        atendimentos: atendimentos.length,
        saidaParticipacao: arredondar(saidaParticipacao),
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
                repasse: arredondar(item.repasse),
                liquidoProfissional: arredondar(item.liquidoProfissional)
            }))
            .sort((a, b) => b.bruto - a.bruto)
    };
}
