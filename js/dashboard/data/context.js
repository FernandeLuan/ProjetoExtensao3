import { db } from "../../firebase-init.js?v=7.4";
import {
    doc,
    getDoc,
    setDoc,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

import { SCHEMA_VERSION } from "../constants.js?v=7.4";
import {
    definirUsuario,
    definirPerfilUsuario,
    definirMembroAtual,
    definirBarbearia,
    definirWorkspaceId,
    state
} from "../state.js?v=7.4";
import { registrarConsultaFirestore } from "./read-monitor.js?v=7.4";

function erroContexto(code, message) {
    const error = new Error(message);
    error.code = code;
    return error;
}

export async function inicializarContexto(user) {
    if (!user?.uid) throw new Error("Usuário não autenticado.");

    definirUsuario(user);

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

    const barbeariaRef = doc(db, "barbearias", workspaceId);
    let barbeariaSnap = await getDoc(barbeariaRef);
    registrarConsultaFirestore("contexto/barbearia", 1);

    if (!barbeariaSnap.exists() && workspaceId === user.uid) {
        await setDoc(barbeariaRef, {
            nome: "Sr NK",
            ownerUid: user.uid,
            schemaVersion: SCHEMA_VERSION,
            criadoEm: serverTimestamp(),
            atualizadoEm: serverTimestamp()
        });
        barbeariaSnap = await getDoc(barbeariaRef);
        registrarConsultaFirestore("contexto/barbearia", 1);
    }

    const barbearia = barbeariaSnap.exists() ? barbeariaSnap.data() : null;

    const membroRef = doc(db, "barbearias", workspaceId, "membros", user.uid);
    let membroSnap = await getDoc(membroRef);
    registrarConsultaFirestore("contexto/membro", 1);

    if (!membroSnap.exists() && workspaceId === user.uid) {
        await setDoc(membroRef, {
            uid: user.uid,
            email: user.email || "",
            nome: perfil?.nome || user.displayName || "",
            papel: "admin",
            ativo: true,
            repassePct: 0,
            precosPersonalizados: {},
            primeiroAcessoPendente: false,
            criadoEm: serverTimestamp(),
            atualizadoEm: serverTimestamp()
        });
        membroSnap = await getDoc(membroRef);
        registrarConsultaFirestore("contexto/membro", 1);
    }

    if (!membroSnap.exists()) {
        throw erroContexto("SEM_ACESSO", "Sua conta não está vinculada a esta barbearia.");
    }

    const membro = membroSnap.data();

    if (membro.ativo !== true) {
        throw erroContexto("ACESSO_DESATIVADO", "Seu acesso à barbearia está desativado.");
    }

    definirPerfilUsuario(perfil);
    definirMembroAtual(membro);
    definirBarbearia(barbearia);
    definirWorkspaceId(workspaceId);

    return { user, workspaceId, perfil, membro, barbearia };
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
