import { db } from "../../firebase-init.js?v=8.30";
import {
    doc,
    getDoc,
    setDoc,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

import { criarConfigPadrao, normalizarConfig, SCHEMA_VERSION } from "../constants.js?v=8.30";
import { obterWorkspaceId } from "./context.js?v=8.30";
import { usuarioEhAdmin } from "../permissoes.js?v=8.30";
import { registrarConsultaFirestore } from "./read-monitor.js?v=8.30";
import {
    lerCacheLocal,
    salvarCacheLocal,
    removerCacheLocal
} from "./cache-local.js?v=8.30";

// Configuração contém preços/serviços. TTL curto para economizar reaberturas sem
// manter preço antigo por muito tempo em outro aparelho.
const CACHE_CONFIG_MS = 2 * 60 * 1000;

function referenciaConfiguracao() {
    return doc(db, "barbearias", obterWorkspaceId(), "configuracoes", "geral");
}

function chaveCacheConfiguracao() {
    return `configuracoes:${obterWorkspaceId()}`;
}

export function invalidarCacheConfiguracoes() {
    removerCacheLocal(chaveCacheConfiguracao());
}

export async function carregarConfiguracoesDoBanco({ forcar = false } = {}) {
    const chaveCache = chaveCacheConfiguracao();

    if (!forcar) {
        const cache = lerCacheLocal(chaveCache, CACHE_CONFIG_MS, "configuracoes");
        if (cache) return normalizarConfig(cache);
    }

    const ref = referenciaConfiguracao();
    const snap = await getDoc(ref);
    registrarConsultaFirestore("configuracoes", 1);

    if (!snap.exists()) {
        const padrao = criarConfigPadrao();

        if (usuarioEhAdmin()) {
            await setDoc(ref, {
                ...padrao,
                schemaVersion: SCHEMA_VERSION,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp()
            });
        }

        salvarCacheLocal(chaveCache, padrao);
        return padrao;
    }

    const normalizada = normalizarConfig(snap.data());
    salvarCacheLocal(chaveCache, normalizada);
    return normalizada;
}

export async function salvarConfiguracoes(config) {
    const normalizada = normalizarConfig(config);
    await setDoc(referenciaConfiguracao(), {
        ...normalizada,
        schemaVersion: SCHEMA_VERSION,
        updatedAt: serverTimestamp()
    }, { merge: true });

    // Quem salvou já conhece o valor novo: atualizamos o cache sem nova leitura.
    salvarCacheLocal(chaveCacheConfiguracao(), normalizada);
}

export async function atualizarConfiguracoes(alteracoes) {
    await setDoc(referenciaConfiguracao(), {
        ...alteracoes,
        schemaVersion: SCHEMA_VERSION,
        updatedAt: serverTimestamp()
    }, { merge: true });

    // Atualização parcial: preferimos invalidar a arriscar misturar cache incompleto.
    invalidarCacheConfiguracoes();
}
