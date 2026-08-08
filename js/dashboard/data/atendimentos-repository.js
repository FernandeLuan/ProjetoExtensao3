import { db } from "../../firebase-init.js?v=6.1";
import {
    addDoc,
    collection,
    deleteDoc,
    doc,
    getDocs,
    orderBy,
    query,
    serverTimestamp,
    Timestamp,
    updateDoc,
    where
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

import { state, removerAtendimentoDoEstado } from "../state.js?v=6.1";
import { usuarioEhAdmin } from "../permissoes.js?v=6.1";
import { obterUidAtual, obterWorkspaceId } from "./context.js?v=6.1";

function colecaoAtendimentos() {
    return collection(db, "barbearias", obterWorkspaceId(), "atendimentos");
}

function documentoAtendimento(id) {
    return doc(db, "barbearias", obterWorkspaceId(), "atendimentos", id);
}

function nomeUsuarioAtual() {
    return String(
        state.perfilUsuario?.nome ||
        state.membroAtual?.nome ||
        state.user?.displayName ||
        state.user?.email ||
        "Profissional"
    ).trim();
}

export async function listarAtendimentosPorPeriodo(inicio, fim, { profissionalUid = null } = {}) {
    const dataInicio = inicio instanceof Date ? inicio : new Date(inicio);
    const dataFim = fim instanceof Date ? fim : new Date(fim);
    const fimExclusivo = new Date(dataFim);
    fimExclusivo.setDate(fimExclusivo.getDate() + 1);
    fimExclusivo.setHours(0, 0, 0, 0);
    dataInicio.setHours(0, 0, 0, 0);

    const filtros = [
        where("dataAtendimento", ">=", Timestamp.fromDate(dataInicio)),
        where("dataAtendimento", "<", Timestamp.fromDate(fimExclusivo))
    ];

    const uidFiltro = profissionalUid || (!usuarioEhAdmin() ? obterUidAtual() : null);
    if (uidFiltro) filtros.unshift(where("profissionalUid", "==", uidFiltro));

    const referencia = query(
        colecaoAtendimentos(),
        ...filtros,
        orderBy("dataAtendimento", "desc")
    );

    const snapshot = await getDocs(referencia);
    return snapshot.docs.map((documento) => ({ id: documento.id, ...documento.data() }));
}

export async function criarAtendimento(payload) {
    const uid = obterUidAtual();
    const nome = nomeUsuarioAtual();

    const docRef = await addDoc(colecaoAtendimentos(), {
        ...payload,
        profissionalUid: payload.profissionalUid || uid,
        profissionalNome: payload.profissionalNome || nome,
        registradoPorUid: uid,
        registradoPorNome: nome,
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
    removerAtendimentoDoEstado(id);
}
