import {
    signInWithEmailAndPassword,
    sendPasswordResetEmail,
    signOut
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
    doc,
    getDoc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { auth, db } from "./firebase-init.js?v=8.28";

const form = document.getElementById("loginForm");

function animarErro(elemento, mensagem) {
    if (!elemento) return;
    elemento.style.color = "#ff4444";
    elemento.innerText = mensagem;
    elemento.classList.remove("erro-animado");
    void elemento.offsetWidth;
    elemento.classList.add("erro-animado");
}

async function validarAcessoAntesDoDashboard(user) {
    const usuarioSnap = await getDoc(doc(db, "usuarios", user.uid));
    if (!usuarioSnap.exists()) {
        const error = new Error("Esta conta não possui acesso à barbearia.");
        error.code = "SEM_ACESSO";
        throw error;
    }

    const perfil = usuarioSnap.data();
    const workspaceId = String(perfil?.barbeariaId || "").trim();
    if (!workspaceId) {
        const error = new Error("Esta conta não possui acesso à barbearia.");
        error.code = "SEM_ACESSO";
        throw error;
    }

    const membroSnap = await getDoc(doc(db, "barbearias", workspaceId, "membros", user.uid));
    if (!membroSnap.exists()) {
        const error = new Error("Esta conta não possui acesso à barbearia.");
        error.code = "SEM_ACESSO";
        throw error;
    }

    const membro = membroSnap.data();
    if (membro?.ativo !== true || membro?.removido === true) {
        const error = new Error("Seu acesso à barbearia foi desativado pelo administrador.");
        error.code = "ACESSO_DESATIVADO";
        throw error;
    }

    return { perfil, membro, workspaceId };
}

form?.addEventListener("submit", async function(e) {
    e.preventDefault();

    const email = document.getElementById("usuario")?.value || "";
    const senha = document.getElementById("senha")?.value || "";
    const btn = document.querySelector(".btn-login");
    const erro = document.getElementById("erroLogin");

    btn?.classList.add("loading");
    if (erro) erro.innerText = "";

    try {
        const credencial = await signInWithEmailAndPassword(auth, email, senha);
        await validarAcessoAntesDoDashboard(credencial.user);

        btn?.classList.remove("loading");
        btn?.classList.add("success");

        setTimeout(() => {
            document.body.classList.add("fade-out");
            setTimeout(() => { window.location.href = "dashboard.html"; }, 400);
        }, 600);
    } catch (error) {
        btn?.classList.remove("loading", "success");

        if (error?.code === "ACESSO_DESATIVADO") {
            try { await signOut(auth); } catch (_) {}
            animarErro(erro, "Seu acesso à barbearia foi desativado pelo administrador.");
        } else if (error?.code === "SEM_ACESSO") {
            try { await signOut(auth); } catch (_) {}
            animarErro(erro, "Esta conta não possui acesso à barbearia.");
        } else if (String(error?.code || "").startsWith("auth/")) {
            animarErro(erro, "E-mail ou senha inválidos");
        } else {
            try { await signOut(auth); } catch (_) {}
            animarErro(erro, "Não foi possível validar seu acesso. Tente novamente.");
        }

        console.error("Erro de login/validação:", error?.code || error);
    }
});

const senhaInput = document.getElementById("senha");
const senhaGroup = document.querySelector(".senha-group");
const toggleSenha = document.querySelector(".toggle-senha");

senhaInput?.addEventListener("input", () => {
    senhaGroup?.classList.toggle("show-eye", senhaInput.value.length > 0);
});

toggleSenha?.addEventListener("click", () => {
    if (!senhaInput) return;
    if (senhaInput.type === "password") {
        senhaInput.type = "text";
        toggleSenha.innerHTML = '<i class="fas fa-eye-slash"></i>';
    } else {
        senhaInput.type = "password";
        toggleSenha.innerHTML = '<i class="fas fa-eye"></i>';
    }
});

const btnEsqueci = document.getElementById("btnEsqueciSenha");

btnEsqueci?.addEventListener("click", async function(e) {
    e.preventDefault();
    const email = document.getElementById("usuario")?.value || "";
    const erro = document.getElementById("erroLogin");

    if (!email) {
        animarErro(erro, "Digite seu e-mail no campo acima para recuperar a senha.");
        return;
    }

    try {
        if (erro) { erro.style.color = "#ffffff"; erro.innerText = "Enviando..."; }
        await sendPasswordResetEmail(auth, email);
        if (erro) {
            erro.style.color = "#00e676";
            erro.innerText = "E-mail de recuperação enviado! Verifique sua caixa de entrada.";
        }
    } catch (error) {
        animarErro(erro, "Erro ao enviar. Verifique se o e-mail está correto.");
        console.error("Erro na recuperação:", error.code);
    }
});

const motivoAcesso = new URLSearchParams(window.location.search).get("motivo");
const mensagemAcesso = document.getElementById("erroLogin");
if (mensagemAcesso && motivoAcesso === "desativado") {
    animarErro(mensagemAcesso, "Seu acesso à barbearia foi desativado pelo administrador.");
}
if (mensagemAcesso && motivoAcesso === "sem-acesso") {
    animarErro(mensagemAcesso, "Esta conta não possui acesso à barbearia.");
}
