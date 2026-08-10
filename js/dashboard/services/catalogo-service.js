import { state } from "../state.js?v=8.30";

export function obterServicos({ somenteAtivos = false } = {}) {
    const servicos = Array.isArray(state.configSistema?.servicos)
        ? state.configSistema.servicos
        : [];

    return servicos
        .filter((servico) => !somenteAtivos || servico.ativo !== false)
        .sort((a, b) => Number(a.ordem || 0) - Number(b.ordem || 0));
}

export function obterServicoPorId(id) {
    return obterServicos().find((servico) => servico.id === id) || null;
}

export function obterServicoPorNome(nome) {
    return obterServicos().find((servico) => servico.nome === nome) || null;
}

export function resolverPrecoServico(servico, membro) {
    if (!servico) return { preco: 0, origem: "padrao", precoBase: 0, precoProfissional: null };

    const precoBase = Number(servico.preco || 0);
    const override = Number(membro?.precosPersonalizados?.[servico.id]);
    const temOverride = Number.isFinite(override) && override > 0 && Math.abs(override - precoBase) >= 0.005;

    return {
        preco: temOverride ? override : precoBase,
        origem: temOverride ? "profissional" : "padrao",
        precoBase,
        precoProfissional: temOverride ? override : null
    };
}

export function pagamentoEstaAtivo(pagamento) {
    return state.configSistema?.pagamentosAtivos?.[pagamento] !== false;
}
