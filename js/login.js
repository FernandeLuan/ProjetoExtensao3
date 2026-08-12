import {
    browserSessionPersistence,
    setPersistence,
    signInWithEmailAndPassword,
    signOut,
    sendPasswordResetEmail
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { auth } from "./firebase-init.js?v=11.0";
import {
    limparSessaoArea,
    marcarSessaoArea,
    normalizarArea
} from "./shared/auth-area-session.js?v=11.0";

const form = document.getElementById("loginForm");
const paramsLogin = new URLSearchParams(window.location.search);
const area = normalizarArea(document.body?.dataset?.loginArea || paramsLogin.get("destino"));
const destinoAposLogin = "./";
let authPreparado = false;
let preparacaoPromise = null;

function animarErro(elemento, mensagem) {
    if (!elemento) return;
    elemento.style.color = "#ff4444";
    elemento.innerText = mensagem;
    elemento.classList.remove("erro-animado");
    void elemento.offsetWidth;
    elemento.classList.add("erro-animado");
}

async function prepararSessaoDaAba() {
    if (authPreparado) return;
    if (preparacaoPromise) return preparacaoPromise;

    preparacaoPromise = (async () => {
        // Cada aba possui sua própria sessão Firebase. O login da área sempre
        // começa limpo para impedir que Profissional e Admin herdem silenciosamente
        // a conta usada anteriormente na mesma aba.
        await setPersistence(auth, browserSessionPersistence);
        limparSessaoArea();

        try {
            await signOut(auth);
        } catch (_) {
            // Não estar autenticado já é o estado desejado para a tela de login.
        }

        authPreparado = true;
    })();

    try {
        return await preparacaoPromise;
    } finally {
        preparacaoPromise = null;
    }
}

const btn = document.querySelector(".btn-login");
btn?.classList.add("loading");
prepararSessaoDaAba()
    .catch((error) => {
        console.error("Erro ao preparar sessão da aba:", error);
        animarErro(document.getElementById("erroLogin"), "Não foi possível preparar o login. Recarregue a página.");
    })
    .finally(() => btn?.classList.remove("loading"));

form?.addEventListener("submit", async function(e) {
    e.preventDefault();

    const email = document.getElementById("usuario")?.value || "";
    const senha = document.getElementById("senha")?.value || "";
    const erro = document.getElementById("erroLogin");

    btn?.classList.add("loading");
    if (erro) erro.innerText = "";

    try {
        await prepararSessaoDaAba();
        await signInWithEmailAndPassword(auth, email, senha);
        marcarSessaoArea(area);

        // A autorização de papel/membro continua sendo validada pelo bootstrap
        // da própria área, sem duplicar leituras no login.
        btn?.classList.remove("loading");
        btn?.classList.add("success");
        document.body.classList.add("fade-out");

        setTimeout(() => {
            window.location.replace(destinoAposLogin);
        }, 90);
    } catch (error) {
        limparSessaoArea();
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
    animarErro(
        mensagemAcesso,
        area === "admin"
            ? "Esta conta não possui acesso administrativo. Entre com uma conta de administrador."
            : "Esta conta não possui acesso profissional. Entre com uma conta da equipe."
    );
}
if (mensagemAcesso && motivoAcesso === "sessao-area") {
    animarErro(mensagemAcesso, "Entre com a conta que deseja usar nesta área.");
}
