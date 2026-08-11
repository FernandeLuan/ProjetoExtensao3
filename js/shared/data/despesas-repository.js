import { db } from "../../firebase-init.js?v=9.3";
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

import { SCHEMA_VERSION } from "../constants.js?v=9.3";
import { state } from "../state.js?v=9.3";
import { podeAdministrarNaVisaoAtual } from "../permissoes.js?v=9.3";
import { obterUidAtual, obterWorkspaceId } from "./context.js?v=9.3";
import { registrarConsultaFirestore } from "./read-monitor.js?v=9.3";
import {
    anexarDeltasDespesasAoBatch,
    RESUMO_VERSION
} from "./resumos-repository.js?v=9.3";

const CACHE_DESPESAS_MS = 5 * 60 * 1000;
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

function arredondar2(valor) {
    return Number(Number(valor || 0).toFixed(2));
}

function construirDadosDespesa({
    data,
    categoria,
    descricao,
    valor,
    tipo = "profissional",
    extras = {}
}) {
    const uid = obterUidAtual();
    const tipoFinal = podeAdministrarNaVisaoAtual() && tipo === "barbearia" ? "barbearia" : "profissional";
    const dataDespesa = data instanceof Date ? data : new Date(data);

    return {
        profissionalUid: tipoFinal === "profissional" ? uid : null,
        profissionalNome: tipoFinal === "profissional" ? nomeAtual() : "Barbearia",
        registradoPorUid: uid,
        registradoPorNome: nomeAtual(),
        tipo: tipoFinal,
        categoria: String(categoria || "Outros").slice(0, 40),
        descricao: String(descricao || "").trim().slice(0, 120),
        valor: arredondar2(valor),
        data: dataDespesa.toISOString(),
        dataDespesa,
        schemaVersion: SCHEMA_VERSION,
        resumoVersion: RESUMO_VERSION,
        ...extras
    };
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

    const uidFiltro = profissionalUid || (!podeAdministrarNaVisaoAtual() ? obterUidAtual() : null);
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
    const dados = construirDadosDespesa({ data, categoria, descricao, valor, tipo, extras: { parcelada: false } });
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

export async function criarDespesaParcelada({
    parcelas = [],
    categoria,
    descricao,
    valorTotal,
    tipo = "profissional"
}) {
    if (!Array.isArray(parcelas) || parcelas.length < 2 || parcelas.length > 36) {
        throw new Error("O parcelamento deve ter entre 2 e 36 parcelas.");
    }

    const totalCentavos = Math.round(Number(valorTotal || 0) * 100);
    const somaCentavos = parcelas.reduce((soma, parcela) => soma + Math.round(Number(parcela?.valor || 0) * 100), 0);
    if (totalCentavos <= 0 || somaCentavos !== totalCentavos) {
        throw new Error("Os valores das parcelas não correspondem ao valor total.");
    }

    const parcelamentoId = doc(colecaoDespesas()).id;
    const totalParcelas = parcelas.length;
    const primeiraData = parcelas[0]?.data instanceof Date ? parcelas[0].data : new Date(parcelas[0]?.data);
    const diaOriginal = primeiraData.getDate();
    const batch = writeBatch(db);
    const entradasResumo = [];
    const refs = [];

    parcelas.forEach((parcela, indice) => {
        const numero = indice + 1;
        const ref = documentoDespesa(`${parcelamentoId}_${String(numero).padStart(2, "0")}`);
        const dados = construirDadosDespesa({
            data: parcela.data,
            categoria,
            descricao,
            valor: parcela.valor,
            tipo,
            extras: {
                parcelada: true,
                parcelamentoId,
                parcelaNumero: numero,
                parcelasTotal: totalParcelas,
                valorTotalParcelamento: arredondar2(valorTotal),
                diaVencimentoOriginal: diaOriginal
            }
        });

        batch.set(ref, {
            ...dados,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
        });
        entradasResumo.push({ despesa: dados, sinal: 1 });
        refs.push(ref);
    });

    anexarDeltasDespesasAoBatch(batch, entradasResumo);
    await batch.commit();
    invalidarCacheDespesas();

    return { parcelamentoId, refs, parcelas: totalParcelas };
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

export async function excluirDespesaParcelada(despesa, { incluirProximas = false } = {}) {
    const parcelamentoId = String(despesa?.parcelamentoId || "").trim();
    const parcelaAtual = Math.max(1, Number(despesa?.parcelaNumero || 1));
    const total = Math.max(parcelaAtual, Number(despesa?.parcelasTotal || parcelaAtual));

    if (!parcelamentoId || despesa?.parcelada !== true || !incluirProximas) {
        await excluirDespesa(despesa.id, despesa);
        return { quantidade: 1 };
    }

    const ids = [];
    for (let numero = parcelaAtual; numero <= total; numero += 1) {
        ids.push(`${parcelamentoId}_${String(numero).padStart(2, "0")}`);
    }

    const snapshots = await Promise.all(ids.map((id) => getDoc(documentoDespesa(id))));
    const originais = snapshots
        .filter((snap) => snap.exists())
        .map((snap) => ({ id: snap.id, ...snap.data() }));

    if (!originais.length) return { quantidade: 0 };

    const batch = writeBatch(db);
    const deltas = [];

    originais.forEach((original) => {
        batch.delete(documentoDespesa(original.id));
        if (Number(original.resumoVersion || 0) >= RESUMO_VERSION) {
            deltas.push({ despesa: original, sinal: -1 });
        }
    });

    if (deltas.length) anexarDeltasDespesasAoBatch(batch, deltas);
    await batch.commit();
    invalidarCacheDespesas();
    return { quantidade: originais.length };
}
