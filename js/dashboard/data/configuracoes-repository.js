import { db } from "../../firebase-init.js?v=7.4";
import {
    doc,
    getDoc,
    setDoc,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

import { criarConfigPadrao, normalizarConfig, SCHEMA_VERSION } from "../constants.js?v=7.4";
import { obterWorkspaceId } from "./context.js?v=7.4";
import { usuarioEhAdmin } from "../permissoes.js?v=7.4";
import { registrarConsultaFirestore } from "./read-monitor.js?v=7.4";

function referenciaConfiguracao() {
    return doc(db, "barbearias", obterWorkspaceId(), "configuracoes", "geral");
}

export async function carregarConfiguracoesDoBanco() {
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

        return padrao;
    }

    return normalizarConfig(snap.data());
}

export async function salvarConfiguracoes(config) {
    const normalizada = normalizarConfig(config);
    await setDoc(referenciaConfiguracao(), {
        ...normalizada,
        schemaVersion: SCHEMA_VERSION,
        updatedAt: serverTimestamp()
    }, { merge: true });
}

export async function atualizarConfiguracoes(alteracoes) {
    await setDoc(referenciaConfiguracao(), {
        ...alteracoes,
        schemaVersion: SCHEMA_VERSION,
        updatedAt: serverTimestamp()
    }, { merge: true });
}
