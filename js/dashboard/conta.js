import { auth } from "../firebase-init.js?v=4.0";
import {
    EmailAuthProvider,
    reauthenticateWithCredential,
    updatePassword
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

let inicializado = false;

export function initConta() {
    if (inicializado) return;
    inicializado = true;

    document.getElementById("formAlterarSenha")?.addEventListener("submit", async (event) => {
        event.preventDefault();
        const senhaAtual = document.getElementById("senhaAtual")?.value;
        const novaSenha = document.getElementById("novaSenha")?.value;
        const confirmaSenha = document.getElementById("confirmaSenha")?.value;
        const btn = document.getElementById("btnSalvarSenha");

        if (novaSenha !== confirmaSenha) {
            alert("A nova senha e a confirmação não batem.");
            return;
        }
        if (!novaSenha || novaSenha.length < 6) {
            alert("A senha precisa ter pelo menos 6 caracteres.");
            return;
        }

        const user = auth.currentUser;
        if (!user) return;

        if (btn) {
            btn.disabled = true;
            btn.textContent = "Atualizando...";
            btn.style.opacity = "0.7";
        }

        try {
            const credential = EmailAuthProvider.credential(user.email, senhaAtual);
            await reauthenticateWithCredential(user, credential);
            await updatePassword(user, novaSenha);
            document.getElementById("formAlterarSenha")?.reset();
            if (btn) {
                btn.style.opacity = "1";
                btn.classList.add("success");
                btn.textContent = "Atualizado ✓";
                setTimeout(() => {
                    btn.classList.remove("success");
                    btn.textContent = "Atualizar Senha";
                }, 2000);
            }
        } catch (error) {
            console.error("Erro ao atualizar senha:", error);
            if (btn) {
                btn.style.opacity = "1";
                btn.textContent = "Atualizar Senha";
            }
            if (["auth/invalid-credential", "auth/wrong-password"].includes(error.code)) {
                alert("A senha atual digitada está incorreta.");
            } else {
                alert("Erro ao atualizar senha. Verifique os dados.");
            }
        } finally {
            if (btn) btn.disabled = false;
        }
    });
}
