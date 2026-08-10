import { normalizarConfig } from "./constants.js?v=8.31";

export const state = {
    user: null,
    perfilUsuario: null,
    membroAtual: null,
    barbearia: null,
    workspaceId: null,
    visaoAtual: "profissional",
    equipe: [],
    atendimentos: [],
    configSistema: normalizarConfig()
};

const listeners = new Map();

function emitir(chave, valor) {
    const conjunto = listeners.get(chave);
    if (!conjunto) return;

    conjunto.forEach((listener) => {
        try {
            listener(valor);
        } catch (error) {
            console.error(`Erro em listener de ${chave}:`, error);
        }
    });
}

export function onStateChange(chave, listener) {
    if (!listeners.has(chave)) listeners.set(chave, new Set());
    listeners.get(chave).add(listener);
    return () => listeners.get(chave)?.delete(listener);
}

export function definirUsuario(user) {
    state.user = user || null;
    emitir("user", state.user);
}

export function definirPerfilUsuario(perfil) {
    state.perfilUsuario = perfil || null;
    emitir("perfilUsuario", state.perfilUsuario);
}

export function definirMembroAtual(membro) {
    state.membroAtual = membro || null;
    emitir("membroAtual", state.membroAtual);
}

export function definirBarbearia(barbearia) {
    state.barbearia = barbearia || null;
    emitir("barbearia", state.barbearia);
}

export function definirWorkspaceId(workspaceId) {
    state.workspaceId = workspaceId || null;
    emitir("workspaceId", state.workspaceId);
}


export function definirVisaoAtual(visao) {
    const normalizada = visao === "barbearia" ? "barbearia" : "profissional";
    state.visaoAtual = normalizada;
    emitir("visaoAtual", state.visaoAtual);
}

export function definirEquipe(equipe) {
    state.equipe = Array.isArray(equipe) ? equipe : [];
    emitir("equipe", state.equipe);
}

export function definirAtendimentos(atendimentos) {
    state.atendimentos = Array.isArray(atendimentos) ? atendimentos : [];
    emitir("atendimentos", state.atendimentos);
}

export function mesclarAtendimentos(atendimentos) {
    const mapa = new Map((state.atendimentos || []).map((item) => [item.id, item]));
    (atendimentos || []).forEach((item) => {
        if (item?.id) mapa.set(item.id, item);
    });
    definirAtendimentos([...mapa.values()]);
}

export function removerAtendimentoDoEstado(id) {
    definirAtendimentos((state.atendimentos || []).filter((item) => item.id !== id));
}

export function atualizarAtendimentoNoEstado(id, alteracoes = {}) {
    if (!id) return;
    definirAtendimentos(
        (state.atendimentos || []).map((item) =>
            item.id === id ? { ...item, ...alteracoes } : item
        )
    );
}

export function definirConfiguracoes(config) {
    state.configSistema = normalizarConfig(config);
    emitir("configSistema", state.configSistema);
}
