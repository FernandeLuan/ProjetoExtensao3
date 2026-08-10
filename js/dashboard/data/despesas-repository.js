import { db } from "../../firebase-init.js?v=8.25";
import {
    collection,
    doc,
    getDoc,
    getDocs,
    orderBy,
    query,
    serverTimestamp,
    Timestamp,
    where,
    writeBatch
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

import { SCHEMA_VERSION } from "../constants.js?v=8.25";
import { state } from "../state.js?v=8.25";
import { usuarioEhAdmin } from "../permissoes.js?v=8.25";
import { obterUidAtual, obterWorkspaceId } from "./context.js?v=8.25";
import { registrarConsultaFirestore } from "./read-monitor.js?v=8.25";
import {
    anexarDeltasDespesasAoBatch,
    RESUMO_VERSION
} from "./resumos-repository.js?v=8.25";

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

function documentoDespesa(id) {
    return doc(db, "barbearias", obterWorkspaceId(), "despesas", id);
}

function nomeAtual() {
    return String(state.perfilUsuario?.nome || state.membroAtual?.nome || state.user?.email || "Profissional").trim();
}

async function obterDespesaOriginal(id, originalInformado = null) {
    if (originalInformado?.id === id) return originalInformado;

    const snap = await getDoc(documentoDespesa(id));
    registrarConsultaFirestore("despesas/original", snap.exists() ? 1 : 0, id);
    return snap.exists() ? { id: snap.id, ...snap.data() } : null;
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
    const dados = {
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
        resumoVersion: RESUMO_VERSION
    };

    const ref = doc(colecaoDespesas());
    const batch = writeBatch(db);

    batch.set(ref, {
        ...dados,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
    });

    anexarDeltasDespesasAoBatch(batch, [
        { despesa: dados, sinal: 1 }
    ]);

    await batch.commit();
    invalidarCacheDespesas();
    return ref;
}

export async function editarDespesa(id, alteracoes, originalInformado = null) {
    const original = await obterDespesaOriginal(id, originalInformado);
    if (!original) throw new Error("Despesa não encontrada.");

    const nova = { ...original, ...alteracoes };
    const batch = writeBatch(db);

    batch.update(documentoDespesa(id), {
        ...alteracoes,
        updatedAt: serverTimestamp(),
        editado: true
    });

    if (Number(original.resumoVersion || 0) >= RESUMO_VERSION) {
        anexarDeltasDespesasAoBatch(batch, [
            { despesa: original, sinal: -1 },
            { despesa: nova, sinal: 1 }
        ]);
    }

    await batch.commit();
    invalidarCacheDespesas();
}

export async function excluirDespesa(id, originalInformado = null) {
    const original = await obterDespesaOriginal(id, originalInformado);
    if (!original) throw new Error("Despesa não encontrada.");

    const batch = writeBatch(db);
    batch.delete(documentoDespesa(id));

    if (Number(original.resumoVersion || 0) >= RESUMO_VERSION) {
        anexarDeltasDespesasAoBatch(batch, [
            { despesa: original, sinal: -1 }
        ]);
    }

    await batch.commit();
    invalidarCacheDespesas();
}
