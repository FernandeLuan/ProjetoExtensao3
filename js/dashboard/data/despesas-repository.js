import { db } from "../../firebase-init.js?v=7.4";
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

import { SCHEMA_VERSION } from "../constants.js?v=7.4";
import { state } from "../state.js?v=7.4";
import { usuarioEhAdmin } from "../permissoes.js?v=7.4";
import { obterUidAtual, obterWorkspaceId } from "./context.js?v=7.4";
import { registrarConsultaFirestore } from "./read-monitor.js?v=7.4";

const CACHE_DESPESAS_MS = 2 * 60 * 1000;
const cacheDespesas = new Map();
const despesasEmAndamento = new Map();

function invalidarCacheDespesas() {
    cacheDespesas.clear();
}

function chaveDespesas(dataInicio, dataFim, uidFiltro, incluirBarbearia) {
    return [
        dataInicio.toISOString().slice(0, 10),
        dataFim.toISOString().slice(0, 10),
        uidFiltro || "todos",
        incluirBarbearia ? "com-barbearia" : "sem-barbearia"
    ].join(":");
}

function colecaoDespesas() {
    return collection(db, "barbearias", obterWorkspaceId(), "despesas");
}

function nomeAtual() {
    return String(state.perfilUsuario?.nome || state.membroAtual?.nome || state.user?.email || "Profissional").trim();
}

export async function listarDespesasPorPeriodo(
    inicio,
    fim,
    { profissionalUid = null, incluirBarbearia = false, forcar = false } = {}
) {
    const dataInicio = inicio instanceof Date ? new Date(inicio) : new Date(inicio);
    const dataFim = fim instanceof Date ? new Date(fim) : new Date(fim);
    dataInicio.setHours(0, 0, 0, 0);
    const fimExclusivo = new Date(dataFim);
    fimExclusivo.setDate(fimExclusivo.getDate() + 1);
    fimExclusivo.setHours(0, 0, 0, 0);

    const uidFiltro = profissionalUid || (!usuarioEhAdmin() ? obterUidAtual() : null);
    const chave = chaveDespesas(dataInicio, dataFim, uidFiltro, incluirBarbearia);
    const cache = cacheDespesas.get(chave);

    if (!forcar && cache && (Date.now() - cache.salvoEm) < CACHE_DESPESAS_MS) {
        return cache.itens;
    }
    if (despesasEmAndamento.has(chave)) return despesasEmAndamento.get(chave);

    const promessa = (async () => {
        const filtros = [
            where("dataDespesa", ">=", Timestamp.fromDate(dataInicio)),
            where("dataDespesa", "<", Timestamp.fromDate(fimExclusivo))
        ];

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
        registrarConsultaFirestore("despesas", snapshot.size);

        let itens = snapshot.docs.map((documento) => ({ id: documento.id, ...documento.data() }));
        if (!incluirBarbearia && uidFiltro) {
            itens = itens.filter((item) => item.tipo !== "barbearia");
        }

        cacheDespesas.set(chave, { itens, salvoEm: Date.now() });
        return itens;
    })();

    despesasEmAndamento.set(chave, promessa);
    try {
        return await promessa;
    } finally {
        despesasEmAndamento.delete(chave);
    }
}

export async function criarDespesa({ data, categoria, descricao, valor, tipo = "profissional" }) {
    const uid = obterUidAtual();
    const tipoFinal = usuarioEhAdmin() && tipo === "barbearia" ? "barbearia" : "profissional";
    const dataDespesa = data instanceof Date ? data : new Date(data);

    const ref = await addDoc(colecaoDespesas(), {
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
    invalidarCacheDespesas();
    return ref;
}

export async function editarDespesa(id, alteracoes) {
    await updateDoc(doc(db, "barbearias", obterWorkspaceId(), "despesas", id), {
        ...alteracoes,
        updatedAt: serverTimestamp(),
        editado: true
    });
    invalidarCacheDespesas();
}

export async function excluirDespesa(id) {
    await deleteDoc(doc(db, "barbearias", obterWorkspaceId(), "despesas", id));
    invalidarCacheDespesas();
}
