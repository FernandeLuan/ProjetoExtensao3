import { listarAtendimentosPorPeriodo } from "./atendimentos-repository.js?v=6.1";
import { carregarConfiguracoesDoBanco } from "./configuracoes-repository.js?v=6.1";
import { mesclarAtendimentos, definirConfiguracoes } from "../state.js?v=6.1";
import { inicioDoDia, somarDias } from "../utils/date.js?v=6.1";

const cachePeriodos = new Set();

function chavePeriodo(inicio, fim, profissionalUid = "auto") {
    const a = inicioDoDia(inicio).toISOString().slice(0, 10);
    const b = inicioDoDia(fim).toISOString().slice(0, 10);
    return `${profissionalUid || "todos"}:${a}:${b}`;
}

export async function garantirAtendimentosPeriodo(inicio, fim, { profissionalUid = null, forcar = false } = {}) {
    const chave = chavePeriodo(inicio, fim, profissionalUid || "auto");
    if (!forcar && cachePeriodos.has(chave)) return [];

    const atendimentos = await listarAtendimentosPorPeriodo(inicio, fim, { profissionalUid });
    mesclarAtendimentos(atendimentos);
    cachePeriodos.add(chave);
    return atendimentos;
}

export async function recarregarAtendimentos() {
    // Carrega somente a janela necessária para Painel/Histórico inicial.
    const hoje = inicioDoDia(new Date());
    return garantirAtendimentosPeriodo(somarDias(hoje, -7), hoje, { forcar: true });
}

export async function recarregarAtendimentosDoDia(data, opcoes = {}) {
    return garantirAtendimentosPeriodo(data, data, { ...opcoes, forcar: true });
}

export function invalidarCacheAtendimentos() {
    cachePeriodos.clear();
}

export async function recarregarConfiguracoes() {
    const configuracoes = await carregarConfiguracoesDoBanco();
    definirConfiguracoes(configuracoes);
    return configuracoes;
}
