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
    criarAcessoBarbeiroNoBanco,
    listarMembrosEquipe
} from "../data/equipe-repository.js?v=8.16";

function normalizarComparacao(valor) {
    return String(valor || "")
        .trim()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLocaleLowerCase("pt-BR")
        .replace(/\s+/g, " ");
}

async function validarDuplicidadeEquipe(nome, email) {
    const membros = await listarMembrosEquipe({ forcar: true });
    const nomeNormalizado = normalizarComparacao(nome);
    const emailNormalizado = String(email || "").trim().toLowerCase();

    const nomeDuplicado = membros.find(
        (membro) => normalizarComparacao(membro?.nome) === nomeNormalizado
    );

    if (nomeDuplicado) {
        const error = new Error(
            nomeDuplicado?.removido === true
                ? "Já existe um usuário com este nome."
                : nomeDuplicado.ativo === false
                    ? "Já existe um membro com este nome. Ative o cadastro existente em Membros inativos."
                    : "Já existe um usuário com este nome."
        );
        error.code = "equipe/nome-duplicado";
        error.campo = "nome";
        throw error;
    }

    const emailDuplicado = membros.find(
        (membro) => String(membro?.email || "").trim().toLowerCase() === emailNormalizado
    );

    if (emailDuplicado) {
        const error = new Error(
            emailDuplicado?.removido === true
                ? "Já existe um usuário com este e-mail."
                : emailDuplicado.ativo === false
                    ? "Já existe um membro com este e-mail. Ative o cadastro existente em Membros inativos."
                    : "Já existe um usuário com este e-mail."
        );
        error.code = "equipe/email-duplicado";
        error.campo = "email";
        throw error;
    }
}

export async function criarAcessoBarbeiro({ nome, email, senhaTemporaria, taxaDebitoPct, taxaCreditoPct, repassePct }) {
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

    await validarDuplicidadeEquipe(nomeLimpo, emailLimpo);

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
            email: emailLimpo,
            taxaDebitoPct,
            taxaCreditoPct,
            repassePct
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
