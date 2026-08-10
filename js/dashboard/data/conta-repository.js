import {
    db
} from "../../firebase-init.js?v=8.27";

import {
    doc,
    getDoc,
    setDoc,
    writeBatch,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

import {
    obterUidAtual,
    obterWorkspaceId
} from "./context.js?v=8.27";

import { registrarConsultaFirestore } from "./read-monitor.js?v=8.27";


export async function obterDadosConta() {

    const uid = obterUidAtual();
    const workspaceId = obterWorkspaceId();

    const usuarioRef =
        doc(db, "usuarios", uid);

    const membroRef =
        doc(
            db,
            "barbearias",
            workspaceId,
            "membros",
            uid
        );

    const [
        usuarioSnap,
        membroSnap
    ] = await Promise.all([
        getDoc(usuarioRef),
        getDoc(membroRef)
    ]);

    registrarConsultaFirestore("conta", 2);

    return {
        usuario: usuarioSnap.exists()
            ? usuarioSnap.data()
            : {},

        membro: membroSnap.exists()
            ? membroSnap.data()
            : {}
    };
}


export async function salvarNomeConta(nome) {

    const uid = obterUidAtual();

    const nomeLimpo =
        String(nome || "")
            .trim()
            .slice(0, 60);

    if (!nomeLimpo) {
        throw new Error("Nome inválido.");
    }

    const workspaceId = obterWorkspaceId();
    const batch = writeBatch(db);
    const agora = serverTimestamp();

    batch.set(
        doc(db, "usuarios", uid),
        {
            nome: nomeLimpo,
            atualizadoEm: agora
        },
        { merge: true }
    );

    batch.set(
        doc(db, "barbearias", workspaceId, "membros", uid),
        {
            nome: nomeLimpo,
            atualizadoEm: agora
        },
        { merge: true }
    );

    await batch.commit();
    return nomeLimpo;
}

export async function salvarFotoConta(fotoBase64) {
    const uid = obterUidAtual();

    if (!fotoBase64) {
        throw new Error("Imagem inválida.");
    }

    await setDoc(
        doc(db, "usuarios", uid),
        {
            fotoPerfil: fotoBase64,
            atualizadoEm: serverTimestamp()
        },
        {
            merge: true
        }
    );

    return fotoBase64;
}