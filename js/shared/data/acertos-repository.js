import { db } from "../../firebase-init.js?v=12.0";
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
    where
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

import { obterUidAtual, obterWorkspaceId } from "./context.js?v=12.0";
import { usuarioEhAdmin } from "../permissoes.js?v=12.0";
import { chaveData } from "../utils/date.js?v=12.0";

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
