import { db } from "../../firebase-init.js?v=4.0";
import {
    addDoc,
    collection,
    deleteDoc,
    doc,
    getDocs,
    serverTimestamp,
    updateDoc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

import { obterWorkspaceId } from "./context.js?v=4.0";

function colecaoAtendimentos() {
    return collection(db, "barbearias", obterWorkspaceId(), "atendimentos");
}

function documentoAtendimento(id) {
    return doc(db, "barbearias", obterWorkspaceId(), "atendimentos", id);
}

export async function listarAtendimentos() {
    const snapshot = await getDocs(colecaoAtendimentos());
    return snapshot.docs.map((documento) => ({
        id: documento.id,
        ...documento.data()
    }));
}

export async function criarAtendimento(payload) {
    const docRef = await addDoc(colecaoAtendimentos(), {
        ...payload,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
    });
    return docRef.id;
}

export async function editarAtendimento(id, alteracoes) {
    await updateDoc(documentoAtendimento(id), {
        ...alteracoes,
        editado: true,
        editadoEm: serverTimestamp(),
        updatedAt: serverTimestamp()
    });
}

export async function excluirAtendimento(id) {
    await deleteDoc(documentoAtendimento(id));
}
