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
import {
    lerCacheLocal,
    salvarCacheLocal,
    removerCacheLocal
} from "./cache-local.js?v=7.4";

const CACHE_EQUIPE_MS = 5 * 60 * 1000;
let cacheEquipe = null;
let cacheEquipeEm = 0;
let consultaEquipeEmAndamento = null;

function chaveCacheEquipe() {
    return `equipe:${obterWorkspaceId()}`;
}

function aplicarEquipeNoEstado(membros, { atualizarMembroAtual = false } = {}) {
    definirEquipe(membros);

    if (!atualizarMembroAtual && state.membroAtual) return;

    const atual = membros.find(
        (membro) => (membro.uid || membro.id) === state.user?.uid
    );
    if (atual) definirMembroAtual(atual);
}

export function invalidarCacheEquipe() {
    cacheEquipe = null;
    cacheEquipeEm = 0;

    try {
        removerCacheLocal(chaveCacheEquipe());
    } catch (_) {
        // Contexto ainda pode não estar inicializado durante algum teardown.
    }
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

    const emEstado = (state.equipe || []).find(
        (membro) => (membro.uid || membro.id) === uid
    );
    if (emEstado) return emEstado;

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

    if (!forcar) {
        const persistido = lerCacheLocal(
            chaveCacheEquipe(),
            CACHE_EQUIPE_MS,
            "equipe"
        );

        if (Array.isArray(persistido)) {
            cacheEquipe = persistido;
            cacheEquipeEm = Date.now();

            // Não substitui state.membroAtual por uma versão persistida. O membro
            // atual foi confirmado ao vivo na inicialização para preservar repasse,
            // preços, papel e status corretos.
            aplicarEquipeNoEstado(persistido, { atualizarMembroAtual: false });
            return persistido;
        }
    }

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

        // Preenche os caches ANTES de emitir o estado. Assim um listener de "equipe"
        // nunca dispara outra consulta recursiva ao Firestore.
        cacheEquipe = membros;
        cacheEquipeEm = Date.now();
        salvarCacheLocal(chaveCacheEquipe(), membros);

        aplicarEquipeNoEstado(membros, { atualizarMembroAtual: true });
        return membros;
    })();

    try {
        return await consultaEquipeEmAndamento;
    } finally {
        consultaEquipeEmAndamento = null;
    }
}

export async function criarAcessoBarbeiroNoBanco({ uid, nome, email, taxaDebitoPct, taxaCreditoPct, repassePct }) {
    if (!usuarioEhAdmin()) {
        throw new Error("Somente o administrador pode adicionar barbeiros.");
    }

    const workspaceId = obterWorkspaceId();
    const uidAtual = obterUidAtual();
    const agora = serverTimestamp();
    const debito = validarTaxaProfissional(taxaDebitoPct, "débito");
    const credito = validarTaxaProfissional(taxaCreditoPct, "crédito");
    const repasse = Number(repassePct);
    if (!Number.isFinite(repasse) || repasse < 0 || repasse > 99.99) throw new Error("Informe um percentual de repasse entre 0,00% e 99,99%.");

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
        repassePct: Number(repasse.toFixed(2)),
        taxaDebitoPct: debito,
        taxaCreditoPct: credito,
        dono: false,
        atuaComoProfissional: true,
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

function validarTaxaProfissional(valor, rotulo) {
    const numero = Number(valor);
    if (!Number.isFinite(numero) || numero < 0 || numero >= 10) {
        throw new Error(`Informe uma taxa de ${rotulo} entre 0,00% e 9,99%.`);
    }
    return Number(numero.toFixed(2));
}

export async function atualizarTaxasProprias({ taxaDebitoPct, taxaCreditoPct }) {
    const uid = obterUidAtual();
    if (!uid) throw new Error("Usuário inválido.");
    if (state.membroAtual?.ativo !== true) throw new Error("Seu acesso não está ativo.");

    const debito = validarTaxaProfissional(taxaDebitoPct, "débito");
    const credito = validarTaxaProfissional(taxaCreditoPct, "crédito");

    await updateDoc(doc(db, "barbearias", obterWorkspaceId(), "membros", uid), {
        taxaDebitoPct: debito,
        taxaCreditoPct: credito,
        atualizadoEm: serverTimestamp()
    });

    definirMembroAtual({
        ...state.membroAtual,
        taxaDebitoPct: debito,
        taxaCreditoPct: credito
    });
    invalidarCacheEquipe();

    return { taxaDebitoPct: debito, taxaCreditoPct: credito };
}

export async function atualizarFinanceiroMembro(uid, {
    repassePct,
    precosPersonalizados,
    taxaDebitoPct,
    taxaCreditoPct
}) {
    if (!usuarioEhAdmin()) throw new Error("Somente o administrador pode alterar repasses e preços.");
    if (!uid) throw new Error("Membro inválido.");

    const repasse = Number(repassePct);
    if (!Number.isFinite(repasse) || repasse < 0 || repasse > 99.99) {
        throw new Error("Informe um percentual de repasse entre 0,00% e 99,99%.");
    }

    const debito = validarTaxaProfissional(taxaDebitoPct, "débito");
    const credito = validarTaxaProfissional(taxaCreditoPct, "crédito");

    const precos = {};
    Object.entries(precosPersonalizados || {}).forEach(([servicoId, valor]) => {
        const numero = Number(valor);
        if (Number.isFinite(numero) && numero > 0) precos[servicoId] = Number(numero.toFixed(2));
    });

    await updateDoc(doc(db, "barbearias", obterWorkspaceId(), "membros", uid), {
        repassePct: Number(repasse.toFixed(2)),
        taxaDebitoPct: debito,
        taxaCreditoPct: credito,
        precosPersonalizados: precos,
        atualizadoEm: serverTimestamp()
    });
    invalidarCacheEquipe();
}
