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

import { SCHEMA_VERSION } from "../constants.js?v=6.1";
import { state } from "../state.js?v=6.1";
import { usuarioEhAdmin } from "../permissoes.js?v=6.1";
import { obterUidAtual, obterWorkspaceId } from "./context.js?v=6.1";

function colecaoDespesas() {
    return collection(db, "barbearias", obterWorkspaceId(), "despesas");
}

function nomeAtual() {
    return String(state.perfilUsuario?.nome || state.membroAtual?.nome || state.user?.email || "Profissional").trim();
}

export async function listarDespesasPorPeriodo(inicio, fim, { profissionalUid = null, incluirBarbearia = false } = {}) {
    const dataInicio = inicio instanceof Date ? new Date(inicio) : new Date(inicio);
    const dataFim = fim instanceof Date ? new Date(fim) : new Date(fim);
    dataInicio.setHours(0, 0, 0, 0);
    const fimExclusivo = new Date(dataFim);
    fimExclusivo.setDate(fimExclusivo.getDate() + 1);
    fimExclusivo.setHours(0, 0, 0, 0);

    const filtros = [
        where("dataDespesa", ">=", Timestamp.fromDate(dataInicio)),
        where("dataDespesa", "<", Timestamp.fromDate(fimExclusivo))
    ];

    const uidFiltro = profissionalUid || (!usuarioEhAdmin() ? obterUidAtual() : null);
    if (uidFiltro) {
        filtros.unshift(
            where("tipo", "==", "profissional"),
            where("profissionalUid", "==", uidFiltro)
        );
    }

    const snapshot = await getDocs(query(
        colecaoDespesas(),
        ...filtros,
        orderBy("dataDespesa", "desc")
    ));

    let itens = snapshot.docs.map((documento) => ({ id: documento.id, ...documento.data() }));
    if (!incluirBarbearia && uidFiltro) itens = itens.filter((item) => item.tipo !== "barbearia");
    return itens;
}

export async function criarDespesa({ data, categoria, descricao, valor, tipo = "profissional" }) {
    const uid = obterUidAtual();
    const tipoFinal = usuarioEhAdmin() && tipo === "barbearia" ? "barbearia" : "profissional";
    const dataDespesa = data instanceof Date ? data : new Date(data);

    return addDoc(colecaoDespesas(), {
        profissionalUid: tipoFinal === "profissional" ? uid : null,
        profissionalNome: tipoFinal === "profissional" ? nomeAtual() : "Barbearia",
        registradoPorUid: uid,
        registradoPorNome: nomeAtual(),
        tipo: tipoFinal,
        categoria: String(categoria || "Outros").slice(0, 40),
        descricao: String(descricao || "").trim().slice(0, 120),
        valor: Number(Number(valor || 0).toFixed(2)),
        data: dataDespesa.toISOString(),
        dataDespesa,
        schemaVersion: SCHEMA_VERSION,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
    });
}

export async function editarDespesa(id, alteracoes) {
    await updateDoc(doc(db, "barbearias", obterWorkspaceId(), "despesas", id), {
        ...alteracoes,
        updatedAt: serverTimestamp(),
        editado: true
    });
}

export async function excluirDespesa(id) {
    await deleteDoc(doc(db, "barbearias", obterWorkspaceId(), "despesas", id));
}
