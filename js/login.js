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

/* PARTICULAS */
const canvas = document.getElementById("particles");
const ctx = canvas.getContext("2d");
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

let particles = [];
for (let i = 0; i < 60; i++) {
    particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        r: Math.random() * 2,
        dx: (Math.random() - 0.5) * 0.5,
        dy: (Math.random() - 0.5) * 0.5
    });
}

function animate() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    particles.forEach(p => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(0,240,255,0.5)";
        ctx.fill();
        p.x += p.dx;
        p.y += p.dy;
        if (p.x < 0 || p.x > canvas.width) p.dx *= -1;
        if (p.y < 0 || p.y > canvas.height) p.dy *= -1;
    });
    requestAnimationFrame(animate);
}
animate();

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