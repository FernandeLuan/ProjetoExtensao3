import { signInWithEmailAndPassword, sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { auth } from "./firebase-init.js";

const form = document.getElementById("loginForm");

form.addEventListener("submit", async function(e) {
    e.preventDefault();

    const email = document.getElementById("usuario").value; 
    const senha = document.getElementById("senha").value;
    const btn = document.querySelector(".btn-login");
    const erro = document.getElementById("erroLogin");

    btn.classList.add("loading");
    erro.innerText = ""; 

    try {
        await signInWithEmailAndPassword(auth, email, senha);
        
        btn.classList.remove("loading");
        btn.classList.add("success");

        setTimeout(() => {
            document.body.classList.add("fade-out");
            setTimeout(() => {
                window.location.href = "dashboard.html";
            }, 400);
        }, 1000);

    } catch (error) {
        btn.classList.remove("loading");
        erro.style.color = "#ff4444"; // Garante a cor vermelha para erro de login
        erro.innerText = "E-mail ou senha inválidos";
        erro.classList.remove("erro-animado");
        void erro.offsetWidth;
        erro.classList.add("erro-animado");
        console.error("Erro de autenticação:", error.code); 
    }
});

/* MOSTRAR / OCULTAR SENHA */
const senhaInput = document.getElementById("senha");
const senhaGroup = document.querySelector(".senha-group");
const toggleSenha = document.querySelector(".toggle-senha");

senhaInput.addEventListener("input", () => {
    if (senhaInput.value.length > 0) {
        senhaGroup.classList.add("show-eye");
    } else {
        senhaGroup.classList.remove("show-eye");
    }
});

toggleSenha.addEventListener("click", () => {
    if (senhaInput.type === "password") {
        senhaInput.type = "text";
        toggleSenha.innerHTML = '<i class="fas fa-eye-slash"></i>';
    } else {
        senhaInput.type = "password";
        toggleSenha.innerHTML = '<i class="fas fa-eye"></i>';
    }
});

/* --- ESQUECI MINHA SENHA --- */
const btnEsqueci = document.getElementById("btnEsqueciSenha");

btnEsqueci.addEventListener("click", async function(e) {
    e.preventDefault(); 
    
    const email = document.getElementById("usuario").value;
    const erro = document.getElementById("erroLogin");

    if (!email) {
        erro.style.color = "#ff4444"; 
        erro.innerText = "Digite seu e-mail no campo acima para recuperar a senha.";
        erro.classList.remove("erro-animado");
        void erro.offsetWidth;
        erro.classList.add("erro-animado");
        return;
    }

    try {
        erro.style.color = "#ffffff";
        erro.innerText = "Enviando..."; 
        
        await sendPasswordResetEmail(auth, email);
        
        erro.style.color = "#00e676"; 
        erro.innerText = "E-mail de recuperação enviado! Verifique sua caixa de entrada.";
    } catch (error) {
        erro.style.color = "#ff4444";
        erro.innerText = "Erro ao enviar. Verifique se o e-mail está correto.";
        console.error("Erro na recuperação:", error.code);
    }
});
/* --- MENSAGENS DE ACESSO --- */
const motivoAcesso = new URLSearchParams(window.location.search).get("motivo");
const mensagemAcesso = document.getElementById("erroLogin");

if (mensagemAcesso && motivoAcesso === "desativado") {
    mensagemAcesso.style.color = "#ff4444";
    mensagemAcesso.innerText = "Seu acesso à barbearia foi desativado pelo administrador.";
}

if (mensagemAcesso && motivoAcesso === "sem-acesso") {
    mensagemAcesso.style.color = "#ff4444";
    mensagemAcesso.innerText = "Esta conta não possui acesso à barbearia.";
}
