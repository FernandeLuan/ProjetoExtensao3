import {
    signInWithEmailAndPassword,
    sendPasswordResetEmail
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { auth } from "./firebase-init.js?v=9.1";

const form = document.getElementById("loginForm");
const paramsLogin = new URLSearchParams(window.location.search);
const destinoSolicitado = paramsLogin.get("destino") === "admin" ? "admin" : "profissional";
const debugPerf = paramsLogin.get("debug") === "perf";
const destinoBase = destinoSolicitado === "admin" ? "admin/" : "profissional/";
const destinoAposLogin = debugPerf ? `${destinoBase}?debug=perf` : destinoBase;

function animarErro(elemento, mensagem) {
    if (!elemento) return;
    elemento.style.color = "#ff4444";
    elemento.innerText = mensagem;
    elemento.classList.remove("erro-animado");
    void elemento.offsetWidth;
    elemento.classList.add("erro-animado");
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
        await signInWithEmailAndPassword(auth, email, senha);

        // A autorização completa é validada no bootstrap do dashboard, que fica
        // coberto pela tela de entrada. Evitamos repetir aqui as mesmas leituras
        // de usuário + membro e ganhamos uma ida inteira ao Firestore no login.
        btn?.classList.remove("loading");
        btn?.classList.add("success");
        document.body.classList.add("fade-out");

        setTimeout(() => {
            window.location.replace(destinoAposLogin);
        }, 140);
    } catch (error) {
        btn?.classList.remove("loading", "success");

        if (String(error?.code || "").startsWith("auth/")) {
            animarErro(erro, "E-mail ou senha inválidos");
        } else {
            animarErro(erro, "Não foi possível entrar agora. Tente novamente.");
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

const motivoAcesso = paramsLogin.get("motivo");
const mensagemAcesso = document.getElementById("erroLogin");
if (mensagemAcesso && motivoAcesso === "desativado") {
    animarErro(mensagemAcesso, "Seu acesso à barbearia foi desativado pelo administrador.");
}
if (mensagemAcesso && motivoAcesso === "sem-acesso") {
    animarErro(mensagemAcesso, "Esta conta não possui acesso à barbearia.");
}
