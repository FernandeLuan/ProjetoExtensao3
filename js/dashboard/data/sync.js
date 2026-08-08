import { listarAtendimentos } from "./atendimentos-repository.js?v=4.0";
import { carregarConfiguracoesDoBanco } from "./configuracoes-repository.js?v=4.0";
import { definirAtendimentos, definirConfiguracoes } from "../state.js?v=4.0";

export async function recarregarAtendimentos() {
    const atendimentos = await listarAtendimentos();
    definirAtendimentos(atendimentos);
    return atendimentos;
}

export async function recarregarConfiguracoes() {
    const configuracoes = await carregarConfiguracoesDoBanco();
    definirConfiguracoes(configuracoes);
    return configuracoes;
}
