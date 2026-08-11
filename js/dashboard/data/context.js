import { db } from "../../firebase-init.js?v=8.32";
import {
    doc,
    getDoc,
    setDoc,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

import { SCHEMA_VERSION } from "../constants.js?v=8.32";
import {
    definirUsuario,
    definirPerfilUsuario,
    definirMembroAtual,
    definirBarbearia,
    definirWorkspaceId,
    state
} from "../state.js?v=8.32";
import { registrarConsultaFirestore } from "./read-monitor.js?v=8.32";
import {
    lerCacheLocal,
    salvarCacheLocal,
    removerCacheLocal
} from "./cache-local.js?v=8.32";

const CACHE_PERFIL_MS = 30 * 60 * 1000;
const CACHE_BARBEARIA_MS = 30 * 60 * 1000;

function erroContexto(code, message) {
    const error = new Error(message);
    error.code = code;
    return error;
}

function chavePerfil(uid) {
    return `contexto:perfil:${uid}`;
}

function chaveBarbearia(workspaceId) {
    return `contexto:barbearia:${workspaceId}`;
}

async function carregarPerfil(user) {
    const chave = chavePerfil(user.uid);
    const cache = lerCacheLocal(chave, CACHE_PERFIL_MS, "contexto/usuario");

    // Primeiro acesso precisa sempre confirmar trocarSenha no banco.
    if (cache?.barbeariaId && cache?.trocarSenha !== true) {
        return cache;
    }

    const usuarioRef = doc(db, "usuarios", user.uid);
    const usuarioSnap = await getDoc(usuarioRef);
    registrarConsultaFirestore("contexto/usuario", 1);

    let perfil = usuarioSnap.exists() ? usuarioSnap.data() : null;
    const workspaceId = perfil?.barbeariaId || user.uid;

    if (!usuarioSnap.exists()) {
        perfil = {
            email: user.email || "",
            barbeariaId: workspaceId,
            schemaVersion: SCHEMA_VERSION
        };

        await setDoc(usuarioRef, {
            ...perfil,
            criadoEm: serverTimestamp(),
            atualizadoEm: serverTimestamp()
        });
    } else if (!perfil?.barbeariaId) {
        perfil = {
            ...perfil,
            barbeariaId: workspaceId,
            schemaVersion: SCHEMA_VERSION
        };

        await setDoc(usuarioRef, {
            barbeariaId: workspaceId,
            schemaVersion: SCHEMA_VERSION,
            atualizadoEm: serverTimestamp()
        }, { merge: true });
    }

    // Não persiste temporariamente perfis que ainda exigem troca de senha.
    // Assim uma conclusão de primeiro acesso nunca fica presa em cache antigo.
    if (perfil?.trocarSenha === true) {
        removerCacheLocal(chave);
    } else {
        salvarCacheLocal(chave, perfil);
    }

    return perfil;
}

async function carregarBarbearia(workspaceId, user) {
    const chave = chaveBarbearia(workspaceId);
    const cache = lerCacheLocal(chave, CACHE_BARBEARIA_MS, "contexto/barbearia");
    if (cache) return cache;

    const barbeariaRef = doc(db, "barbearias", workspaceId);
    const barbeariaSnap = await getDoc(barbeariaRef);
    registrarConsultaFirestore("contexto/barbearia", 1);

    if (barbeariaSnap.exists()) {
        const barbearia = barbeariaSnap.data();
        salvarCacheLocal(chave, barbearia);
        return barbearia;
    }

    if (workspaceId !== user.uid) return null;

    const novaBarbearia = {
        nome: "Sr NK",
        ownerUid: user.uid,
        schemaVersion: SCHEMA_VERSION
    };

    await setDoc(barbeariaRef, {
        ...novaBarbearia,
        criadoEm: serverTimestamp(),
        atualizadoEm: serverTimestamp()
    });

    salvarCacheLocal(chave, novaBarbearia);
    return novaBarbearia;
}

async function carregarMembroAtual(workspaceId, user, perfil) {
    // Membro NÃO usa cache persistente aqui. Papel, ativo, repasse e preços
    // influenciam autorização e valores financeiros; por isso confirmamos ao vivo
    // uma vez em cada inicialização do app.
    const membroRef = doc(db, "barbearias", workspaceId, "membros", user.uid);
    const membroSnap = await getDoc(membroRef);
    registrarConsultaFirestore("contexto/membro", 1);

    if (membroSnap.exists()) return membroSnap.data();

    if (workspaceId !== user.uid) {
        throw erroContexto("SEM_ACESSO", "Sua conta não está vinculada a esta barbearia.");
    }

    const novoMembro = {
        uid: user.uid,
        email: user.email || "",
        nome: perfil?.nome || user.displayName || "",
        papel: "admin",
        ativo: true,
        repassePct: 0,
        precosPersonalizados: {},
        primeiroAcessoPendente: false
    };

    await setDoc(membroRef, {
        ...novoMembro,
        criadoEm: serverTimestamp(),
        atualizadoEm: serverTimestamp()
    });

    return novoMembro;
}

export async function inicializarContexto(user) {
    if (!user?.uid) throw new Error("Usuário não autenticado.");

    definirUsuario(user);

    const perfil = await carregarPerfil(user);
    const workspaceId = perfil?.barbeariaId || user.uid;

    // Depois de descobrir o workspace, barbearia e membro são independentes.
    // Buscar em paralelo evita somar a latência de duas viagens ao Firestore.
    const [barbearia, membro] = await Promise.all([
        carregarBarbearia(workspaceId, user),
        carregarMembroAtual(workspaceId, user, perfil)
    ]);

    if (membro.ativo !== true) {
        throw erroContexto("ACESSO_DESATIVADO", "Seu acesso à barbearia está desativado.");
    }

    definirPerfilUsuario(perfil);
    definirMembroAtual(membro);
    definirBarbearia(barbearia);
    definirWorkspaceId(workspaceId);

    return { user, workspaceId, perfil, membro, barbearia };
}

export function invalidarCachePerfilAtual() {
    if (state.user?.uid) removerCacheLocal(chavePerfil(state.user.uid));
}

export function atualizarCachePerfilAtual(perfil) {
    if (!state.user?.uid || !perfil || perfil?.trocarSenha === true) return;
    salvarCacheLocal(chavePerfil(state.user.uid), perfil);
}

export function invalidarCacheBarbeariaAtual() {
    if (state.workspaceId) removerCacheLocal(chaveBarbearia(state.workspaceId));
}

export function obterWorkspaceId() {
    if (!state.workspaceId) {
        throw new Error("Contexto da barbearia ainda não foi inicializado.");
    }
    return state.workspaceId;
}

export function obterUidAtual() {
    if (!state.user?.uid) throw new Error("Usuário não autenticado.");
    return state.user.uid;
}
