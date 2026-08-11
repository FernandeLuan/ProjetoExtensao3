import { db } from "../../firebase-init.js?v=9.2";
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

import { state, removerAtendimentoDoEstado, mesclarAtendimentos, atualizarAtendimentoNoEstado } from "../state.js?v=9.2";
import { podeAdministrarNaVisaoAtual } from "../permissoes.js?v=9.2";
import { obterUidAtual, obterWorkspaceId } from "./context.js?v=9.2";
import { registrarConsultaFirestore } from "./read-monitor.js?v=9.2";
import { medirAsync } from "../services/perf-service.js?v=9.2";
import {
    anexarDeltasAtendimentosAoBatch,
    RESUMO_VERSION
} from "./resumos-repository.js?v=9.2";

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

function atendimentoNoEstado(id) {
    return (state.atendimentos || []).find((item) => item?.id === id) || null;
}

async function obterAtendimentoOriginal(id) {
    const local = atendimentoNoEstado(id);
    if (local) return local;

    const snap = await getDoc(documentoAtendimento(id));
    registrarConsultaFirestore("atendimentos/original", snap.exists() ? 1 : 0, id);
    return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function listarAtendimentosPorPeriodo(inicio, fim, { profissionalUid = null } = {}) {
    const dataInicio = inicio instanceof Date ? new Date(inicio) : new Date(inicio);
    const dataFim = fim instanceof Date ? new Date(fim) : new Date(fim);
    const fimExclusivo = new Date(dataFim);
    fimExclusivo.setDate(fimExclusivo.getDate() + 1);
    fimExclusivo.setHours(0, 0, 0, 0);
    dataInicio.setHours(0, 0, 0, 0);

    const filtros = [
        where("dataAtendimento", ">=", Timestamp.fromDate(dataInicio)),
        where("dataAtendimento", "<", Timestamp.fromDate(fimExclusivo))
    ];

    const uidFiltro = profissionalUid || (!podeAdministrarNaVisaoAtual() ? obterUidAtual() : null);
    if (uidFiltro) filtros.unshift(where("profissionalUid", "==", uidFiltro));

    const referencia = query(
        colecaoAtendimentos(),
        ...filtros,
        orderBy("dataAtendimento", "desc")
    );

    const snapshot = await getDocs(referencia);
    registrarConsultaFirestore("atendimentos", snapshot.size, `${dataInicio.toISOString().slice(0, 10)} → ${dataFim.toISOString().slice(0, 10)}`);
    return snapshot.docs.map((documento) => ({ id: documento.id, ...documento.data() }));
}

export async function criarAtendimento(payload) {
    const uid = obterUidAtual();
    const nome = nomeUsuarioAtual();
    const dados = {
        ...payload,
        profissionalUid: payload.profissionalUid || uid,
        profissionalNome: payload.profissionalNome || nome,
        registradoPorUid: uid,
        registradoPorNome: nome,
        resumoVersion: RESUMO_VERSION
    };

    const docRef = doc(colecaoAtendimentos());
    const batch = writeBatch(db);

    batch.set(docRef, {
        ...dados,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
    });

    // O atendimento e seu resumo diário são gravados na mesma operação atômica.
    anexarDeltasAtendimentosAoBatch(batch, [
        { atendimento: dados, sinal: 1 }
    ]);

    await medirAsync("Firestore WRITE • atendimento", () => batch.commit());

    // Atualiza a tela localmente. Não faz uma nova leitura só para enxergar o registro recém-criado.
    const agora = new Date();
    mesclarAtendimentos([{
        id: docRef.id,
        ...dados,
        createdAt: agora,
        updatedAt: agora
    }]);

    return docRef.id;
}

export async function editarAtendimento(id, alteracoes) {
    const original = await obterAtendimentoOriginal(id);
    if (!original) throw new Error("Atendimento não encontrado.");

    const agora = new Date();
    const novo = {
        ...original,
        ...alteracoes,
        editado: true,
        editadoEm: agora,
        updatedAt: agora
    };

    const batch = writeBatch(db);
    batch.update(documentoAtendimento(id), {
        ...alteracoes,
        editado: true,
        editadoEm: serverTimestamp(),
        updatedAt: serverTimestamp()
    });

    // Só mexe no resumo quando o registro já pertence à nova arquitetura.
    // Registros antigos serão incorporados pela migração/backfill da próxima etapa.
    if (Number(original.resumoVersion || 0) >= RESUMO_VERSION) {
        anexarDeltasAtendimentosAoBatch(batch, [
            { atendimento: original, sinal: -1 },
            { atendimento: novo, sinal: 1 }
        ]);
    }

    await batch.commit();

    atualizarAtendimentoNoEstado(id, {
        ...alteracoes,
        editado: true,
        editadoEm: agora,
        updatedAt: agora
    });
}

export async function excluirAtendimento(id) {
    const original = await obterAtendimentoOriginal(id);
    if (!original) throw new Error("Atendimento não encontrado.");

    const batch = writeBatch(db);
    batch.delete(documentoAtendimento(id));

    if (Number(original.resumoVersion || 0) >= RESUMO_VERSION) {
        anexarDeltasAtendimentosAoBatch(batch, [
            { atendimento: original, sinal: -1 }
        ]);
    }

    await batch.commit();
    removerAtendimentoDoEstado(id);
}
