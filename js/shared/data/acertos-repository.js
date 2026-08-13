import { db } from "../../firebase-init.js?v=13.0";
import {
    collection,
    doc,
    getDocs,
    getDocsFromServer,
    orderBy,
    query,
    serverTimestamp,
    setDoc,
    Timestamp,
    writeBatch,
    where
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

import { obterUidAtual, obterWorkspaceId } from "./context.js?v=13.0";
import { usuarioEhAdmin } from "../permissoes.js?v=13.0";
import { chaveData } from "../utils/date.js?v=13.0";

function col() {
    return collection(db, "barbearias", obterWorkspaceId(), "acertosEquipe");
}

function normalizarDia(valor) {
    const data = valor instanceof Date ? new Date(valor) : new Date(valor);
    data.setHours(0, 0, 0, 0);
    return data;
}

function acertoId(profissionalUid, inicio, fim) {
    return `${chaveData(normalizarDia(inicio))}_${chaveData(normalizarDia(fim))}_${String(profissionalUid || "sem-uid")}`;
}

export async function listarAcertosPorPeriodo(inicio, fim, { forcar = false } = {}) {
    if (!usuarioEhAdmin()) return [];
    const dataInicio = normalizarDia(inicio);
    const fimExclusivo = normalizarDia(fim);
    fimExclusivo.setDate(fimExclusivo.getDate() + 1);
    const referencia = query(
        col(),
        where("periodoInicio", ">=", Timestamp.fromDate(dataInicio)),
        where("periodoInicio", "<", Timestamp.fromDate(fimExclusivo)),
        orderBy("periodoInicio", "desc")
    );
    const snapshot = forcar ? await getDocsFromServer(referencia) : await getDocs(referencia);
    return snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
}

export async function atualizarStatusAcerto({
    profissionalUid,
    profissionalNome,
    inicio,
    fim,
    repasse = 0,
    comissao = 0,
    saldo = 0,
    tipo,
    pago
}) {
    if (!usuarioEhAdmin()) throw new Error("Somente o administrador pode dar baixa nos acertos.");
    if (!profissionalUid) throw new Error("Profissional inválido.");
    if (!["repasse", "comissao"].includes(tipo)) throw new Error("Tipo de acerto inválido.");

    const id = acertoId(profissionalUid, inicio, fim);
    const referencia = doc(col(), id);
    const agora = serverTimestamp();
    const dados = {
        profissionalUid,
        profissionalNome: String(profissionalNome || "Profissional"),
        periodoInicio: Timestamp.fromDate(normalizarDia(inicio)),
        periodoFim: Timestamp.fromDate(normalizarDia(fim)),
        repasseValor: Number(Number(repasse || 0).toFixed(2)),
        comissaoValor: Number(Number(comissao || 0).toFixed(2)),
        saldoValor: Number(Number(saldo || 0).toFixed(2)),
        atualizadoPorUid: obterUidAtual(),
        atualizadoEm: agora
    };

    if (tipo === "repasse") {
        dados.repasseRecebido = pago === true;
        dados.repasseRecebidoEm = pago === true ? agora : null;
    } else {
        dados.comissaoPaga = pago === true;
        dados.comissaoPagaEm = pago === true ? agora : null;
    }

    await setDoc(referencia, {
        ...dados,
        criadoEm: agora
    }, { merge: true });

    return id;
}


export async function atualizarStatusAcertosEmLote(itens = []) {
    if (!usuarioEhAdmin()) throw new Error("Somente o administrador pode dar baixa nos acertos.");
    const validos = (itens || []).filter((item) => item?.profissionalUid && ["repasse", "comissao"].includes(item?.tipo));
    if (!validos.length) return [];

    const ids = [];
    // Folga abaixo do limite de 500 operações por batch do Firestore.
    for (let inicioChunk = 0; inicioChunk < validos.length; inicioChunk += 400) {
        const chunk = validos.slice(inicioChunk, inicioChunk + 400);
        const batch = writeBatch(db);
        chunk.forEach((item) => {
            const inicio = normalizarDia(item.inicio);
            const fim = normalizarDia(item.fim);
            const id = acertoId(item.profissionalUid, inicio, fim);
            const agora = serverTimestamp();
            const dados = {
                profissionalUid: item.profissionalUid,
                profissionalNome: String(item.profissionalNome || "Profissional"),
                periodoInicio: Timestamp.fromDate(inicio),
                periodoFim: Timestamp.fromDate(fim),
                repasseValor: Number(Number(item.repasse || 0).toFixed(2)),
                comissaoValor: Number(Number(item.comissao || 0).toFixed(2)),
                saldoValor: Number(Number(item.saldo || 0).toFixed(2)),
                atualizadoPorUid: obterUidAtual(),
                atualizadoEm: agora
            };
            if (item.tipo === "repasse") {
                dados.repasseRecebido = item.pago === true;
                dados.repasseRecebidoEm = item.pago === true ? agora : null;
            } else {
                dados.comissaoPaga = item.pago === true;
                dados.comissaoPagaEm = item.pago === true ? agora : null;
            }
            batch.set(doc(col(), id), dados, { merge: true });
            ids.push(id);
        });
        await batch.commit();
    }
    return ids;
}

/**
 * Quita repasse e comissão de vários dias em uma única operação por documento.
 * Usado no fechamento semanal: um toque por profissional, sem precisar baixar dia a dia.
 */
export async function quitarAcertosEmLote(itens = []) {
    if (!usuarioEhAdmin()) throw new Error("Somente o administrador pode dar baixa nos acertos.");
    const validos = (itens || []).filter((item) => item?.profissionalUid);
    if (!validos.length) return [];

    const ids = [];
    for (let inicioChunk = 0; inicioChunk < validos.length; inicioChunk += 400) {
        const chunk = validos.slice(inicioChunk, inicioChunk + 400);
        const batch = writeBatch(db);
        chunk.forEach((item) => {
            const inicio = normalizarDia(item.inicio);
            const fim = normalizarDia(item.fim);
            const id = acertoId(item.profissionalUid, inicio, fim);
            const agora = serverTimestamp();
            const repasse = Number(Number(item.repasse || 0).toFixed(2));
            const comissao = Number(Number(item.comissao || 0).toFixed(2));
            const dados = {
                profissionalUid: item.profissionalUid,
                profissionalNome: String(item.profissionalNome || "Profissional"),
                periodoInicio: Timestamp.fromDate(inicio),
                periodoFim: Timestamp.fromDate(fim),
                repasseValor: repasse,
                comissaoValor: comissao,
                saldoValor: Number(Number(item.saldo || repasse - comissao).toFixed(2)),
                atualizadoPorUid: obterUidAtual(),
                atualizadoEm: agora
            };
            if (repasse > 0.009) {
                dados.repasseRecebido = true;
                dados.repasseRecebidoEm = agora;
            }
            if (comissao > 0.009) {
                dados.comissaoPaga = true;
                dados.comissaoPagaEm = agora;
            }
            batch.set(doc(col(), id), dados, { merge: true });
            ids.push(id);
        });
        await batch.commit();
    }
    return ids;
}
