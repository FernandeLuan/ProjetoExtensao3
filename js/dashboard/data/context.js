import { db } from "../../firebase-init.js?v=4.0";
import {
    doc,
    getDoc,
    setDoc,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

import { SCHEMA_VERSION } from "../constants.js?v=4.0";
import { definirUsuario, definirWorkspaceId, state } from "../state.js?v=4.0";

export async function inicializarContexto(user) {
    if (!user?.uid) throw new Error("Usuário não autenticado.");

    definirUsuario(user);

    const usuarioRef = doc(db, "usuarios", user.uid);
    const usuarioSnap = await getDoc(usuarioRef);
    const perfil = usuarioSnap.exists() ? usuarioSnap.data() : null;
    const workspaceId = perfil?.barbeariaId || user.uid;

    if (!usuarioSnap.exists()) {
        await setDoc(usuarioRef, {
            email: user.email || "",
            barbeariaId: workspaceId,
            schemaVersion: SCHEMA_VERSION,
            criadoEm: serverTimestamp(),
            atualizadoEm: serverTimestamp()
        });
    } else if (!perfil?.barbeariaId) {
        await setDoc(usuarioRef, {
            barbeariaId: workspaceId,
            schemaVersion: SCHEMA_VERSION,
            atualizadoEm: serverTimestamp()
        }, { merge: true });
    }

    const barbeariaRef = doc(db, "barbearias", workspaceId);
    const barbeariaSnap = await getDoc(barbeariaRef);

    if (!barbeariaSnap.exists() && workspaceId === user.uid) {
        await setDoc(barbeariaRef, {
            nome: "Marlon Barber",
            ownerUid: user.uid,
            schemaVersion: SCHEMA_VERSION,
            criadoEm: serverTimestamp(),
            atualizadoEm: serverTimestamp()
        });
    }

    const membroRef = doc(db, "barbearias", workspaceId, "membros", user.uid);
    const membroSnap = await getDoc(membroRef);

    if (!membroSnap.exists() && workspaceId === user.uid) {
        await setDoc(membroRef, {
            uid: user.uid,
            email: user.email || "",
            papel: "owner",
            ativo: true,
            criadoEm: serverTimestamp()
        });
    }

    definirWorkspaceId(workspaceId);
    return { user, workspaceId };
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
