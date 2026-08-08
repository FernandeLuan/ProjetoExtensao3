import { criarConfigPadrao } from "./constants.js?v=4.0";

export const state = {
    user: null,
    workspaceId: null,
    atendimentos: [],
    configSistema: criarConfigPadrao()
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

export function definirWorkspaceId(workspaceId) {
    state.workspaceId = workspaceId || null;
    emitir("workspaceId", state.workspaceId);
}

export function definirAtendimentos(atendimentos) {
    state.atendimentos = Array.isArray(atendimentos) ? atendimentos : [];
    emitir("atendimentos", state.atendimentos);
}

export function definirConfiguracoes(config) {
    const base = criarConfigPadrao();
    state.configSistema = {
        ...base,
        ...(config || {}),
        precos: {
            ...base.precos,
            ...(config?.precos || {})
        }
    };
    emitir("configSistema", state.configSistema);
}
