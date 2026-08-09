import { db } from "../../firebase-init.js?v=7.4";
import {
    collection,
    doc,
    getDoc,
    getDocs,
    updateDoc,
    writeBatch,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

import { SCHEMA_VERSION } from "../constants.js?v=7.4";
import { state, definirEquipe, definirMembroAtual } from "../state.js?v=7.4";
import { usuarioEhAdmin, papelEhAdmin } from "../permissoes.js?v=7.4";
import { obterUidAtual, obterWorkspaceId } from "./context.js?v=7.4";
import { registrarConsultaFirestore } from "./read-monitor.js?v=7.4";

const CACHE_EQUIPE_MS = 5 * 60 * 1000;
let cacheEquipe = null;
let cacheEquipeEm = 0;
let consultaEquipeEmAndamento = null;

export function invalidarCacheEquipe() {
    cacheEquipe = null;
    cacheEquipeEm = 0;
}

export async function obterMembroAtual() {
    const workspaceId = obterWorkspaceId();
    const uid = obterUidAtual();
    const snap = await getDoc(doc(db, "barbearias", workspaceId, "membros", uid));
    registrarConsultaFirestore("equipe/membro-atual", 1);
    if (!snap.exists()) return null;
    const membro = { id: snap.id, ...snap.data() };
    definirMembroAtual(membro);
    return membro;
}

export async function obterMembroPorUid(uid) {
    if (!uid) return null;
    const snap = await getDoc(doc(db, "barbearias", obterWorkspaceId(), "membros", uid));
    registrarConsultaFirestore("equipe/membro", 1);
    return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function listarMembrosEquipe({ forcar = false } = {}) {
    const cacheValido =
        !forcar &&
        Array.isArray(cacheEquipe) &&
        (Date.now() - cacheEquipeEm) < CACHE_EQUIPE_MS;

    if (cacheValido) return cacheEquipe;
    if (consultaEquipeEmAndamento) return consultaEquipeEmAndamento;

    consultaEquipeEmAndamento = (async () => {
        const snapshot = await getDocs(
            collection(db, "barbearias", obterWorkspaceId(), "membros")
        );
        registrarConsultaFirestore("equipe", snapshot.size);

        const membros = snapshot.docs.map((documento) => ({
            id: documento.id,
            ...documento.data()
        }));

        // Preenche o cache ANTES de emitir o estado. Assim um listener de "equipe"
        // nunca dispara outra consulta recursiva ao Firestore.
        cacheEquipe = membros;
        cacheEquipeEm = Date.now();

        definirEquipe(membros);
        const atual = membros.find(
            (membro) => (membro.uid || membro.id) === state.user?.uid
        );
        if (atual) definirMembroAtual(atual);
        return membros;
    })();

    try {
        return await consultaEquipeEmAndamento;
    } finally {
        consultaEquipeEmAndamento = null;
    }
}

export async function criarAcessoBarbeiroNoBanco({ uid, nome, email }) {
    if (!usuarioEhAdmin()) {
        throw new Error("Somente o administrador pode adicionar barbeiros.");
    }

    const workspaceId = obterWorkspaceId();
    const uidAtual = obterUidAtual();
    const agora = serverTimestamp();
    const repassePadrao = Number(state.configSistema?.repasseDonoPct ?? 35);

    const batch = writeBatch(db);

    batch.set(doc(db, "usuarios", uid), {
        nome,
        email,
        barbeariaId: workspaceId,
        trocarSenha: true,
        schemaVersion: SCHEMA_VERSION,
        criadoEm: agora,
        atualizadoEm: agora
    });

    batch.set(doc(db, "barbearias", workspaceId, "membros", uid), {
        uid,
        nome,
        email,
        papel: "barber",
        ativo: true,
        repassePct: repassePadrao,
        precosPersonalizados: {},
        primeiroAcessoPendente: true,
        criadoPorUid: uidAtual,
        criadoEm: agora,
        atualizadoEm: agora
    });

    await batch.commit();
    invalidarCacheEquipe();
}

export async function alterarStatusMembro(uid, ativo) {
    if (!usuarioEhAdmin()) throw new Error("Somente o administrador pode alterar acessos.");
    if (!uid) throw new Error("Membro inválido.");
    if (uid === obterUidAtual()) throw new Error("Você não pode desativar o próprio acesso.");

    const membroRef = doc(db, "barbearias", obterWorkspaceId(), "membros", uid);
    const snap = await getDoc(membroRef);
    registrarConsultaFirestore("equipe/alterar-status", 1);
    if (!snap.exists()) throw new Error("Membro não encontrado.");

    if (papelEhAdmin(snap.data().papel)) {
        throw new Error("Outro administrador não pode ser desativado por esta ação.");
    }

    await updateDoc(membroRef, {
        ativo: Boolean(ativo),
        atualizadoEm: serverTimestamp()
    });
    invalidarCacheEquipe();
}

export async function atualizarFinanceiroMembro(uid, { repassePct, precosPersonalizados }) {
    if (!usuarioEhAdmin()) throw new Error("Somente o administrador pode alterar repasses e preços.");
    if (!uid) throw new Error("Membro inválido.");

    const repasse = Number(repassePct);
    if (!Number.isFinite(repasse) || repasse < 0 || repasse > 100) {
        throw new Error("Informe um percentual de repasse entre 0 e 100.");
    }

    const precos = {};
    Object.entries(precosPersonalizados || {}).forEach(([servicoId, valor]) => {
        const numero = Number(valor);
        if (Number.isFinite(numero) && numero > 0) precos[servicoId] = Number(numero.toFixed(2));
    });

    await updateDoc(doc(db, "barbearias", obterWorkspaceId(), "membros", uid), {
        repassePct: Number(repasse.toFixed(2)),
        precosPersonalizados: precos,
        atualizadoEm: serverTimestamp()
    });
    invalidarCacheEquipe();
}
