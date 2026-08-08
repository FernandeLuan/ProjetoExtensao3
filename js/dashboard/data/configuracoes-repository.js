import { db } from "../../firebase-init.js?v=4.0";
import {
    doc,
    getDoc,
    setDoc,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

import { criarConfigPadrao, SCHEMA_VERSION } from "../constants.js?v=4.0";
import { obterWorkspaceId } from "./context.js?v=4.0";

function referenciaConfiguracao() {
    return doc(db, "barbearias", obterWorkspaceId(), "configuracoes", "geral");
}

export async function carregarConfiguracoesDoBanco() {
    const ref = referenciaConfiguracao();
    const snap = await getDoc(ref);

    if (!snap.exists()) {
        const padrao = criarConfigPadrao();
        await setDoc(ref, {
            ...padrao,
            schemaVersion: SCHEMA_VERSION,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
        });
        return padrao;
    }

    return snap.data();
}

export async function salvarConfiguracoes(config) {
    await setDoc(referenciaConfiguracao(), {
        ...config,
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
