import { limparSessaoArea } from "./auth-area-session.js?v=9.7";
import { auth } from "../firebase-init.js?v=9.7";
import { state } from "./state.js?v=9.7";

import {
    EmailAuthProvider,
    reauthenticateWithCredential,
    updatePassword,
    signOut
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

import {
    obterDadosConta,
    salvarFotoConta
} from "./data/conta-repository.js?v=9.7";
import { atualizarTaxasProprias } from "./data/equipe-repository.js?v=9.7";

import {
    mostrarErro,
    mostrarSucesso
} from "./services/feedback-service.js?v=9.7";
import { iniciarAcaoBotao, concluirAcaoBotao, restaurarAcaoBotao } from "./services/ui-loading-service.js?v=9.7";


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

const btnToggleConta =
    document.getElementById("btnToggleConta");

const contaAccountContent =
    document.getElementById("contaAccountContent");

const btnToggleVisao =
    document.getElementById("btnToggleVisao");

const contaVisaoContent =
    document.getElementById("contaVisaoContent");

const contaTaxasCard =
    document.getElementById("contaTaxasCard");

const btnToggleTaxasConta =
    document.getElementById("btnToggleTaxasConta");

const contaTaxasContent =
    document.getElementById("contaTaxasContent");

const btnToggleSeguranca =
    document.getElementById("btnToggleSeguranca");

const contaSecurityContent =
    document.getElementById("contaSecurityContent");

const btnToggleAparencia =
    document.getElementById("btnToggleAparencia");

const contaThemeContent =
    document.getElementById("contaThemeContent");

const btnToggleInformacoes =
    document.getElementById("btnToggleInformacoes");

const contaInfoContent =
    document.getElementById("contaInfoContent");

const btnSairConta =
    document.getElementById("btnSairConta");

const contaTaxaDebito =
    document.getElementById("contaTaxaDebito");

const contaTaxaCredito =
    document.getElementById("contaTaxaCredito");

const contaTaxasStatus =
    document.getElementById("contaTaxasStatus");

const btnSalvarTaxasConta =
    document.getElementById("btnSalvarTaxasConta");


function atualizarVisibilidadeTaxasConta(membro = state.membroAtual) {
    if (!contaTaxasCard) return false;

    const podeEditar =
        membro?.ativo === true &&
        membro?.papel === "barber";

    contaTaxasCard.hidden = !podeEditar;

    if (!podeEditar && contaTaxasContent && btnToggleTaxasConta) {
        contaTaxasContent.hidden = true;
        btnToggleTaxasConta.setAttribute("aria-expanded", "false");
        btnToggleTaxasConta.classList.remove("aberto");
    }

    return podeEditar;
}


function mascaraTaxa(input) {
    if (!input) return;
    let value = input.value.replace(/\D/g, "").replace(/^0+/, "");
    if (!value) {
        input.value = "";
        return;
    }
    if (value.length > 3) value = value.slice(0, 3);
    input.value = (Number.parseInt(value, 10) / 100).toFixed(2).replace(".", ",");
}

function taxaNumero(valor) {
    const numero = Number(String(valor || "").replace(",", "."));
    return Number.isFinite(numero) ? numero : NaN;
}

function formatarTaxa(valor, fallback) {
    const numero = Number(valor ?? fallback);
    return Number.isFinite(numero)
        ? numero.toFixed(2).replace(".", ",")
        : "";
}

function setTaxasStatus(texto = "", erro = false) {
    if (!contaTaxasStatus) return;
    contaTaxasStatus.textContent = texto;
    contaTaxasStatus.hidden = !texto;
    contaTaxasStatus.classList.toggle("error", Boolean(erro));
}

function preencherTaxasConta(membro = state.membroAtual) {
    if (contaTaxaDebito) {
        contaTaxaDebito.value = formatarTaxa(membro?.taxaDebitoPct, 0);
    }

    if (contaTaxaCredito) {
        contaTaxaCredito.value = formatarTaxa(membro?.taxaCreditoPct, 0);
    }
}

async function salvarTaxasConta() {
    const debito = taxaNumero(contaTaxaDebito?.value);
    const credito = taxaNumero(contaTaxaCredito?.value);

    if (!Number.isFinite(debito) || debito < 0 || debito >= 10) {
        setTaxasStatus("Informe a taxa de débito entre 0,00% e 9,99%.", true);
        return;
    }

    if (!Number.isFinite(credito) || credito < 0 || credito >= 10) {
        setTaxasStatus("Informe a taxa de crédito entre 0,00% e 9,99%.", true);
        return;
    }

    iniciarAcaoBotao(btnSalvarTaxasConta, "Salvando taxas...");

    setTaxasStatus();

    try {
        const taxas = await atualizarTaxasProprias({
            taxaDebitoPct: debito,
            taxaCreditoPct: credito
        });
        preencherTaxasConta({ ...state.membroAtual, ...taxas });
        await concluirAcaoBotao(btnSalvarTaxasConta, "Taxas salvas ✓", 460);
        mostrarSucesso("Taxas atualizadas.");
    } catch (error) {
        console.error("Erro ao salvar taxas do cartão:", error);
        setTaxasStatus(error?.message || "Não foi possível salvar as taxas.", true);
    } finally {
        restaurarAcaoBotao(btnSalvarTaxasConta);
    }
}


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
            membro.nome ||
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

        if (atualizarVisibilidadeTaxasConta(membro)) {
            preencherTaxasConta(membro);
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

    iniciarAcaoBotao(btnSelecionarFoto, "Enviando foto...");

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

        await concluirAcaoBotao(btnSelecionarFoto, "Foto atualizada ✓", 460);

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

        restaurarAcaoBotao(btnSelecionarFoto);

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


function alternarConta() {
    alternarCardRecolhivel(
        btnToggleConta,
        contaAccountContent
    );
}

function alternarVisao() {
    alternarCardRecolhivel(
        btnToggleVisao,
        contaVisaoContent
    );
}

function alternarTaxasConta() {
    alternarCardRecolhivel(
        btnToggleTaxasConta,
        contaTaxasContent
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


function alternarInformacoes() {
    alternarCardRecolhivel(
        btnToggleInformacoes,
        contaInfoContent
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

    iniciarAcaoBotao(btn, "Atualizando senha...");

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

        await concluirAcaoBotao(btn, "Senha atualizada ✓", 460);

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
        restaurarAcaoBotao(btn);
    }
}


/* =============================
   INIT
============================= */

export function initConta() {

    if (inicializado) return;

    inicializado = true;


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


    btnToggleConta
        ?.addEventListener(
            "click",
            alternarConta
        );

    btnToggleVisao
        ?.addEventListener(
            "click",
            alternarVisao
        );

    btnToggleTaxasConta
        ?.addEventListener(
            "click",
            alternarTaxasConta
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

    btnToggleInformacoes
        ?.addEventListener(
            "click",
            alternarInformacoes
        );


    document
        .getElementById(
            "formAlterarSenha"
        )
        ?.addEventListener(
            "submit",
            alterarSenha
        );


    contaTaxaDebito?.addEventListener(
        "input",
        () => mascaraTaxa(contaTaxaDebito)
    );

    contaTaxaCredito?.addEventListener(
        "input",
        () => mascaraTaxa(contaTaxaCredito)
    );

    btnSalvarTaxasConta?.addEventListener(
        "click",
        salvarTaxasConta
    );


    btnSairConta?.addEventListener(
        "click",
        async () => {

            try {
                limparSessaoArea();
                await signOut(auth);
                window.location.href = "./login.html";
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