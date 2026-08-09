import { auth } from "../firebase-init.js?v=7.4";
import { state } from "./state.js?v=7.4";

import {
    EmailAuthProvider,
    reauthenticateWithCredential,
    updatePassword,
    signOut
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

import {
    obterDadosConta,
    salvarNomeConta,
    salvarFotoConta
} from "./data/conta-repository.js?v=7.4";

import {
    mostrarErro,
    mostrarSucesso
} from "./services/feedback-service.js?v=7.4";


let inicializado = false;
let contaCarregada = false;
let contaCarregando = null;


/* =============================
   ELEMENTOS
============================= */

const contaNome =
    document.getElementById("contaNome");

const contaEmail =
    document.getElementById("contaEmail");

const contaPerfil =
    document.getElementById("contaPerfil");

const contaUltimoAcesso =
    document.getElementById("contaUltimoAcesso");

const fotoPerfil =
    document.getElementById("fotoPerfil");

const fotoPerfilFallback =
    document.getElementById("fotoPerfilFallback");

const inputFotoPerfil =
    document.getElementById("inputFotoPerfil");

const btnFotoPerfil =
    document.getElementById("btnFotoPerfil");

const btnSelecionarFoto =
    document.getElementById("btnSelecionarFoto");

const contaNomeVisual =
    document.getElementById("contaNomeVisual");

const contaNomeEditor =
    document.getElementById("contaNomeEditor");

const inputNomeConta =
    document.getElementById("inputNomeConta");

const btnEditarNome =
    document.getElementById("btnEditarNome");

const btnSalvarNome =
    document.getElementById("btnSalvarNome");

const btnCancelarNome =
    document.getElementById("btnCancelarNome");

const btnToggleSeguranca =
    document.getElementById("btnToggleSeguranca");

const contaSecurityContent =
    document.getElementById("contaSecurityContent");

const btnToggleAparencia =
    document.getElementById("btnToggleAparencia");

const contaThemeContent =
    document.getElementById("contaThemeContent");

const btnSairConta =
    document.getElementById("btnSairConta");


/* =============================
   PERFIL
============================= */

function traduzirPerfil(papel) {

    const perfis = {
        admin: "Administrador",
        owner: "Administrador",
        barber: "Barbeiro"
    };

    return perfis[papel] || "Membro";
}


function formatarUltimoAcesso(valor) {

    if (!valor) return "—";

    const data = new Date(valor);

    if (
        Number.isNaN(
            data.getTime()
        )
    ) {
        return "—";
    }

    const agora = new Date();

    const mesmoDia =
        data.getDate() === agora.getDate() &&
        data.getMonth() === agora.getMonth() &&
        data.getFullYear() === agora.getFullYear();

    const hora =
        data.toLocaleTimeString(
            "pt-BR",
            {
                hour: "2-digit",
                minute: "2-digit"
            }
        );

    if (mesmoDia) {
        return `Hoje às ${hora}`;
    }

    const dataFormatada =
        data.toLocaleDateString(
            "pt-BR",
            {
                day: "2-digit",
                month: "2-digit",
                year: "numeric"
            }
        );

    return `${dataFormatada} às ${hora}`;
}


function atualizarAvatar(
    fotoUrl,
    nome,
    email
) {

    if (
        fotoUrl &&
        fotoPerfil
    ) {
        fotoPerfil.src = fotoUrl;
        fotoPerfil.hidden = false;

        if (fotoPerfilFallback) {
            fotoPerfilFallback.hidden = true;
        }

        return;
    }

    if (fotoPerfil) {
        fotoPerfil.hidden = true;
    }

    if (fotoPerfilFallback) {

        fotoPerfilFallback.hidden = false;

        const texto =
            String(
                nome ||
                email ||
                "U"
            ).trim();

        const inicial =
            texto.charAt(0)
                .toUpperCase();

        fotoPerfilFallback.textContent =
            inicial || "U";
    }
}


async function carregarConta() {

    try {

        const user =
            auth.currentUser;

        if (!user) return;

        const {
            usuario,
            membro
        } = await obterDadosConta();

        const nome =
            usuario.nome ||
            user.displayName ||
            "";

        const email =
            user.email ||
            usuario.email ||
            "";

        const perfil =
            traduzirPerfil(
                membro.papel
            );

        if (contaNome) {
            contaNome.textContent =
                nome || "Definir nome";
        }

        if (contaEmail) {
            contaEmail.textContent =
                email || "—";
        }

        if (contaPerfil) {
            contaPerfil.textContent =
                perfil;
        }

        if (contaUltimoAcesso) {
            contaUltimoAcesso.textContent =
                formatarUltimoAcesso(
                    user.metadata
                        ?.lastSignInTime
                );
        }

atualizarAvatar(
    usuario.fotoPerfil,
    nome,
    email
);

    } catch (error) {

        console.error(
            "Erro ao carregar conta:",
            error
        );

        mostrarErro(
            "Não foi possível carregar os dados da conta."
        );
    }
}


/* =============================
   NOME
============================= */

function abrirEdicaoNome() {

    if (
        !contaNomeEditor ||
        !contaNomeVisual
    ) return;

    inputNomeConta.value =
        contaNome?.textContent === "Definir nome"
            ? ""
            : contaNome?.textContent || "";

    contaNomeVisual.hidden = true;
    contaNomeEditor.hidden = false;

    inputNomeConta?.focus();
}


function fecharEdicaoNome() {

    if (
        !contaNomeEditor ||
        !contaNomeVisual
    ) return;

    contaNomeEditor.hidden = true;
    contaNomeVisual.hidden = false;
}


async function salvarNome() {

    const nome =
        String(
            inputNomeConta?.value || ""
        ).trim();

    if (nome.length < 2) {

        mostrarErro(
            "Informe um nome válido."
        );

        return;
    }

    if (btnSalvarNome) {
        btnSalvarNome.disabled = true;
        btnSalvarNome.textContent =
            "Salvando...";
    }

    try {

        const nomeSalvo =
            await salvarNomeConta(nome);

        if (contaNome) {
            contaNome.textContent =
                nomeSalvo;
        }

        if (state.perfilUsuario) {
            state.perfilUsuario.nome = nomeSalvo;
        }

        if (state.membroAtual) {
            state.membroAtual.nome = nomeSalvo;
        }

        fecharEdicaoNome();

        atualizarAvatar(
            fotoPerfil?.src || "",
            nomeSalvo,
            auth.currentUser?.email || ""
        );

        mostrarSucesso(
            "Nome atualizado."
        );

    } catch (error) {

        console.error(
            "Erro ao salvar nome:",
            error
        );

        mostrarErro(
            "Não foi possível atualizar o nome."
        );

    } finally {

        if (btnSalvarNome) {
            btnSalvarNome.disabled = false;
            btnSalvarNome.textContent =
                "Salvar";
        }
    }
}


/* =============================
   FOTO
============================= */

function abrirSeletorFoto() {

    inputFotoPerfil?.click();
}

function prepararFotoPerfil(arquivo) {
    return new Promise((resolve, reject) => {
        const leitor = new FileReader();

        leitor.onload = () => {
            const imagem = new Image();

            imagem.onload = () => {
                const tamanho = 220;

                const canvas =
                    document.createElement("canvas");

                canvas.width = tamanho;
                canvas.height = tamanho;

                const contexto =
                    canvas.getContext("2d");

                const lado =
                    Math.min(
                        imagem.width,
                        imagem.height
                    );

                const origemX =
                    (imagem.width - lado) / 2;

                const origemY =
                    (imagem.height - lado) / 2;

                contexto.drawImage(
                    imagem,
                    origemX,
                    origemY,
                    lado,
                    lado,
                    0,
                    0,
                    tamanho,
                    tamanho
                );

                const fotoBase64 =
                    canvas.toDataURL(
                        "image/jpeg",
                        0.72
                    );

                resolve(fotoBase64);
            };

            imagem.onerror = reject;
            imagem.src = leitor.result;
        };

        leitor.onerror = reject;
        leitor.readAsDataURL(arquivo);
    });
}
async function alterarFoto(
    arquivo
) {

    if (!arquivo) return;

    if (
        !arquivo.type
            .startsWith("image/")
    ) {
        mostrarErro(
            "Selecione uma imagem válida."
        );

        return;
    }

    const limite =
        4 * 1024 * 1024;

    if (
        arquivo.size > limite
    ) {
        mostrarErro(
            "A imagem deve ter no máximo 4 MB."
        );

        return;
    }

    btnFotoPerfil?.classList.add(
        "carregando"
    );

    if (btnSelecionarFoto) {
        btnSelecionarFoto.disabled = true;
        btnSelecionarFoto.textContent =
            "Enviando...";
    }

    try {

const fotoBase64 =
    await prepararFotoPerfil(
        arquivo
    );

await salvarFotoConta(
    fotoBase64
);

atualizarAvatar(
    fotoBase64,
            contaNome?.textContent || "",
            auth.currentUser?.email || ""
        );

        mostrarSucesso(
            "Foto atualizada."
        );

    } catch (error) {

        console.error(
            "Erro ao atualizar foto:",
            error
        );

        mostrarErro(
            "Não foi possível atualizar a foto."
        );

    } finally {

        btnFotoPerfil?.classList.remove(
            "carregando"
        );

        if (btnSelecionarFoto) {
            btnSelecionarFoto.disabled =
                false;

            btnSelecionarFoto.textContent =
                "Alterar foto";
        }

        if (inputFotoPerfil) {
            inputFotoPerfil.value = "";
        }
    }
}


/* =============================
   SEGURANÇA
============================= */

function alternarCardRecolhivel(botao, conteudo) {

    if (!botao || !conteudo) return;

    const abrir = conteudo.hidden;

    conteudo.hidden = !abrir;

    botao.setAttribute(
        "aria-expanded",
        String(abrir)
    );

    botao.classList.toggle(
        "aberto",
        abrir
    );
}


function alternarSeguranca() {
    alternarCardRecolhivel(
        btnToggleSeguranca,
        contaSecurityContent
    );
}


function alternarAparencia() {
    alternarCardRecolhivel(
        btnToggleAparencia,
        contaThemeContent
    );
}


async function alterarSenha(
    event
) {

    event.preventDefault();

    const senhaAtual =
        document.getElementById(
            "senhaAtual"
        )?.value;

    const novaSenha =
        document.getElementById(
            "novaSenha"
        )?.value;

    const confirmaSenha =
        document.getElementById(
            "confirmaSenha"
        )?.value;

    const btn =
        document.getElementById(
            "btnSalvarSenha"
        );

    if (
        novaSenha !== confirmaSenha
    ) {
        mostrarErro(
            "A nova senha e a confirmação não batem."
        );

        return;
    }

    if (
        !novaSenha ||
        novaSenha.length < 6
    ) {
        mostrarErro(
            "A senha precisa ter pelo menos 6 caracteres."
        );

        return;
    }

    const user =
        auth.currentUser;

    if (!user?.email) return;

    if (btn) {
        btn.disabled = true;
        btn.textContent =
            "Atualizando...";
    }

    try {

        const credential =
            EmailAuthProvider
                .credential(
                    user.email,
                    senhaAtual
                );

        await reauthenticateWithCredential(
            user,
            credential
        );

        await updatePassword(
            user,
            novaSenha
        );

        document
            .getElementById(
                "formAlterarSenha"
            )
            ?.reset();

        mostrarSucesso(
            "Senha atualizada."
        );

        contaSecurityContent.hidden =
            true;

        btnToggleSeguranca
            ?.classList
            .remove("aberto");

        btnToggleSeguranca
            ?.setAttribute(
                "aria-expanded",
                "false"
            );

    } catch (error) {

        console.error(
            "Erro ao atualizar senha:",
            error
        );

        if (
            [
                "auth/invalid-credential",
                "auth/wrong-password"
            ].includes(error.code)
        ) {
            mostrarErro(
                "A senha atual está incorreta."
            );
        } else {
            mostrarErro(
                "Não foi possível atualizar a senha."
            );
        }

    } finally {

        if (btn) {
            btn.disabled = false;
            btn.textContent =
                "Atualizar Senha";
        }
    }
}


/* =============================
   INIT
============================= */

export function initConta() {

    if (inicializado) return;

    inicializado = true;


    btnEditarNome?.addEventListener(
        "click",
        abrirEdicaoNome
    );


    btnCancelarNome?.addEventListener(
        "click",
        fecharEdicaoNome
    );


    btnSalvarNome?.addEventListener(
        "click",
        salvarNome
    );


    inputNomeConta?.addEventListener(
        "keydown",
        (event) => {

            if (
                event.key === "Enter"
            ) {
                event.preventDefault();
                salvarNome();
            }

            if (
                event.key === "Escape"
            ) {
                fecharEdicaoNome();
            }
        }
    );


    btnFotoPerfil?.addEventListener(
        "click",
        abrirSeletorFoto
    );


    btnSelecionarFoto?.addEventListener(
        "click",
        abrirSeletorFoto
    );


    inputFotoPerfil?.addEventListener(
        "change",
        () => {
            alterarFoto(
                inputFotoPerfil.files?.[0]
            );
        }
    );


    btnToggleSeguranca
        ?.addEventListener(
            "click",
            alternarSeguranca
        );


    btnToggleAparencia
        ?.addEventListener(
            "click",
            alternarAparencia
        );


    document
        .getElementById(
            "formAlterarSenha"
        )
        ?.addEventListener(
            "submit",
            alterarSenha
        );


    btnSairConta?.addEventListener(
        "click",
        async () => {

            try {
                await signOut(auth);
                window.location.href =
                    "login.html";
            } catch (error) {
                console.error(
                    "Erro ao sair:",
                    error
                );

                mostrarErro(
                    "Não foi possível sair da conta."
                );
            }
        }
    );

}

export async function abrirConta() {
    if (contaCarregada) return;
    if (contaCarregando) return contaCarregando;

    contaCarregando = (async () => {
        await carregarConta();
        contaCarregada = true;
    })();

    try {
        await contaCarregando;
    } finally {
        contaCarregando = null;
    }
}