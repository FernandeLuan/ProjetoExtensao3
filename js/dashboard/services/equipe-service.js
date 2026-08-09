import {
    firebaseConfig
} from "../../firebase-init.js?v=7.4";

import {
    initializeApp,
    deleteApp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";

import {
    createUserWithEmailAndPassword,
    deleteUser,
    getAuth,
    signOut,
    updateProfile
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

import {
    criarAcessoBarbeiroNoBanco
} from "../data/equipe-repository.js?v=7.4";

export async function criarAcessoBarbeiro({ nome, email, senhaTemporaria }) {
    const nomeLimpo = String(nome || "").trim().slice(0, 60);
    const emailLimpo = String(email || "").trim().toLowerCase();

    if (nomeLimpo.length < 2) {
        throw new Error("Informe o nome do barbeiro.");
    }

    if (!emailLimpo || !emailLimpo.includes("@")) {
        throw new Error("Informe um e-mail válido.");
    }

    if (String(senhaTemporaria || "").length < 6) {
        throw new Error("A senha temporária precisa ter pelo menos 6 caracteres.");
    }

    const appSecundario = initializeApp(
        firebaseConfig,
        `cadastro-barbeiro-${Date.now()}-${Math.random().toString(36).slice(2)}`
    );

    const authSecundario = getAuth(appSecundario);
    let usuarioCriado = null;

    try {
        const credencial = await createUserWithEmailAndPassword(
            authSecundario,
            emailLimpo,
            senhaTemporaria
        );

        usuarioCriado = credencial.user;

        await updateProfile(usuarioCriado, {
            displayName: nomeLimpo
        });

        await criarAcessoBarbeiroNoBanco({
            uid: usuarioCriado.uid,
            nome: nomeLimpo,
            email: emailLimpo
        });

        return {
            uid: usuarioCriado.uid,
            nome: nomeLimpo,
            email: emailLimpo,
            senhaTemporaria
        };
    } catch (error) {
        if (usuarioCriado) {
            try {
                await deleteUser(usuarioCriado);
            } catch (cleanupError) {
                console.warn("Não foi possível remover a conta criada após falha no cadastro:", cleanupError);
            }
        }

        throw error;
    } finally {
        try {
            await signOut(authSecundario);
        } catch (_) {}

        try {
            await deleteApp(appSecundario);
        } catch (_) {}
    }
}
