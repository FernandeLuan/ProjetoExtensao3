import { auth, db } from "../firebase-init.js?v=8.26";
import {
    updatePassword,
    signOut
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
    doc,
    serverTimestamp,
    writeBatch
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

function obterElementos() {
    return {
        modal: document.getElementById("primeiroAcessoModal"),
        form: document.getElementById("formPrimeiroAcesso"),
        novaSenha: document.getElementById("primeiroAcessoNovaSenha"),
        confirmaSenha: document.getElementById("primeiroAcessoConfirmaSenha"),
        erro: document.getElementById("primeiroAcessoErro"),
        btnSalvar: document.getElementById("btnSalvarPrimeiroAcesso"),
        btnSair: document.getElementById("btnSairPrimeiroAcesso")
    };
}

function mostrarErro(elemento, mensagem) {
    if (!elemento) return;
    elemento.textContent = mensagem || "";
    elemento.hidden = !mensagem;
}

export function exigirTrocaSenhaPrimeiroAcesso({ workspaceId, perfil, membro }) {
    if (perfil?.trocarSenha !== true) {
        return Promise.resolve(false);
    }

    const elementos = obterElementos();

    if (!elementos.modal || !elementos.form) {
        return Promise.reject(new Error("Tela de primeiro acesso não encontrada."));
    }

    elementos.modal.hidden = false;
    document.body.classList.add("primeiro-acesso-bloqueado");

    setTimeout(() => elementos.novaSenha?.focus(), 0);

    return new Promise((resolve, reject) => {
        const finalizar = () => {
            elementos.form.removeEventListener("submit", aoEnviar);
            elementos.btnSair?.removeEventListener("click", aoSair);
        };

        const aoSair = async () => {
            finalizar();
            try {
                await signOut(auth);
            } finally {
                window.location.href = "login.html";
            }
        };

        const aoEnviar = async (event) => {
            event.preventDefault();
            mostrarErro(elementos.erro, "");

            const novaSenha = elementos.novaSenha?.value || "";
            const confirmaSenha = elementos.confirmaSenha?.value || "";

            if (novaSenha.length < 6) {
                mostrarErro(elementos.erro, "Use uma senha com pelo menos 6 caracteres.");
                return;
            }

            if (novaSenha !== confirmaSenha) {
                mostrarErro(elementos.erro, "As senhas não coincidem.");
                return;
            }

            if (elementos.btnSalvar) {
                elementos.btnSalvar.disabled = true;
                elementos.btnSalvar.textContent = "Salvando...";
            }

            try {
                const user = auth.currentUser;
                if (!user) throw new Error("Usuário não autenticado.");

                await updatePassword(user, novaSenha);

                const batch = writeBatch(db);
                batch.set(
                    doc(db, "usuarios", user.uid),
                    {
                        trocarSenha: false,
                        atualizadoEm: serverTimestamp()
                    },
                    { merge: true }
                );

                batch.set(
                    doc(db, "barbearias", workspaceId, "membros", user.uid),
                    {
                        primeiroAcessoPendente: false,
                        atualizadoEm: serverTimestamp()
                    },
                    { merge: true }
                );

                await batch.commit();

                perfil.trocarSenha = false;
                if (membro) membro.primeiroAcessoPendente = false;

                elementos.form.reset();
                elementos.modal.hidden = true;
                document.body.classList.remove("primeiro-acesso-bloqueado");
                finalizar();
                resolve(true);
            } catch (error) {
                console.error("Erro ao concluir primeiro acesso:", error);
                mostrarErro(
                    elementos.erro,
                    error?.code === "auth/requires-recent-login"
                        ? "Entre novamente com a senha temporária e tente outra vez."
                        : "Não foi possível atualizar a senha. Tente novamente."
                );
            } finally {
                if (elementos.btnSalvar) {
                    elementos.btnSalvar.disabled = false;
                    elementos.btnSalvar.textContent = "Definir minha senha";
                }
            }
        };

        elementos.form.addEventListener("submit", aoEnviar);
        elementos.btnSair?.addEventListener("click", aoSair);
    });
}
