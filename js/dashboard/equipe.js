import { state } from "./state.js?v=8.30";
import {
    obterMembroAtual,
    listarMembrosEquipe,
    alterarStatusMembro,
    excluirMembroInativo,
    atualizarFinanceiroMembro
} from "./data/equipe-repository.js?v=8.30";
import { criarAcessoBarbeiro } from "./services/equipe-service.js?v=8.30";
import { obterServicos } from "./services/catalogo-service.js?v=8.30";
import { papelEhAdmin, usuarioEhAdmin } from "./permissoes.js?v=8.30";
import { converterParaNumero, formatarMoeda, aplicarMascaraMoedaInput } from "./utils/money.js?v=8.30";
import { mostrarErro, mostrarSucesso } from "./services/feedback-service.js?v=8.30";

let inicializado = false;
let carregando = false;
let ultimoAcessoCriado = null;
let membroFinanceiroAtual = null;
let membroStatusPendente = null;
let botaoStatusOrigem = null;
let acaoMembroPendente = "status";

const menuEquipeItem = document.getElementById("menuEquipeItem");
const equipeResumo = document.getElementById("equipeResumo");
const equipeListaAtivos = document.getElementById("equipeListaAtivos");
const equipeListaInativos = document.getElementById("equipeListaInativos");
const equipeBlocoInativos = document.getElementById("equipeBlocoInativos");
const secaoEquipe = document.getElementById("equipe");
const btnAdicionarBarbeiro = document.getElementById("btnAdicionarBarbeiro");

const modalAdicionar = document.getElementById("modalAdicionarBarbeiro");
const btnFecharModalAdicionar = document.getElementById("btnFecharModalAdicionar");
const formAdicionarBarbeiro = document.getElementById("formAdicionarBarbeiro");
const inputNomeBarbeiro = document.getElementById("novoBarbeiroNome");
const inputEmailBarbeiro = document.getElementById("novoBarbeiroEmail");
const inputSenhaTemporaria = document.getElementById("novoBarbeiroSenha");
const btnToggleFinanceiroNovo = document.getElementById("btnToggleFinanceiroNovoBarbeiro");
const conteudoFinanceiroNovo = document.getElementById("conteudoFinanceiroNovoBarbeiro");
const inputNovoTaxaDebito = document.getElementById("novoBarbeiroTaxaDebitoPct");
const inputNovoTaxaCredito = document.getElementById("novoBarbeiroTaxaCreditoPct");
const inputNovoRepasse = document.getElementById("novoBarbeiroRepassePct");
const btnCriarAcesso = document.getElementById("btnCriarAcessoBarbeiro");
const btnCancelarAdicionar = document.getElementById("btnCancelarAdicionarBarbeiro");
const cadastroStatus = document.getElementById("cadastroBarbeiroStatus");

const modalAcessoCriado = document.getElementById("modalAcessoCriado");
const acessoCriadoNome = document.getElementById("acessoCriadoNome");
const acessoCriadoEmail = document.getElementById("acessoCriadoEmail");
const acessoCriadoSenha = document.getElementById("acessoCriadoSenha");
const acessoCriadoSenhaLinha = document.getElementById("acessoCriadoSenhaLinha");
const tituloAcessoCriado = document.getElementById("tituloAcessoCriado");
const acessoCriadoDescricao = document.getElementById("acessoCriadoDescricao");
const btnCopiarAcesso = document.getElementById("btnCopiarAcesso");
const btnCompartilharAcesso = document.getElementById("btnCompartilharAcesso");
const btnFecharAcessoCriado = document.getElementById("btnFecharAcessoCriado");

const modalFinanceiro = document.getElementById("modalFinanceiroMembro");
const tituloFinanceiro = document.getElementById("tituloFinanceiroMembro");
const btnFecharFinanceiro = document.getElementById("btnFecharFinanceiroMembro");
const btnCancelarFinanceiro = document.getElementById("btnCancelarFinanceiroMembro");
const btnToggleDados = document.getElementById("btnToggleDadosProfissional");
const conteudoDados = document.getElementById("conteudoDadosProfissional");
const inputNomeMembro = document.getElementById("membroNome");
const lblNomeMembro = document.getElementById("lblMembroNome");
const lblEmailMembro = document.getElementById("lblMembroEmail");
const btnEditarNomeMembro = document.getElementById("btnEditarNomeMembro");
const btnToggleTaxas = document.getElementById("btnToggleTaxasProfissional");
const btnTogglePrecos = document.getElementById("btnTogglePrecosProfissional");
const conteudoTaxas = document.getElementById("conteudoTaxasProfissional");
const conteudoPrecos = document.getElementById("conteudoPrecosProfissional");
const inputRepasse = document.getElementById("membroRepassePct");
const inputTaxaDebito = document.getElementById("membroTaxaDebitoPct");
const inputTaxaCredito = document.getElementById("membroTaxaCreditoPct");
const lblTaxaDebito = document.getElementById("lblMembroTaxaDebito");
const lblTaxaCredito = document.getElementById("lblMembroTaxaCredito");
const lblRepasse = document.getElementById("lblMembroRepasse");
const btnEditarTaxaDebito = document.getElementById("btnEditarTaxaDebito");
const btnEditarTaxaCredito = document.getElementById("btnEditarTaxaCredito");
const btnEditarRepasse = document.getElementById("btnEditarRepasse");
const precosLista = document.getElementById("membroPrecosLista");
const financeiroStatus = document.getElementById("financeiroMembroStatus");
const btnSalvarFinanceiro = document.getElementById("btnSalvarFinanceiroMembro");

const modalStatusMembro = document.getElementById("modalConfirmStatusMembro");
const tituloStatusMembro = document.getElementById("tituloConfirmStatusMembro");
const descricaoStatusMembro = document.getElementById("descricaoConfirmStatusMembro");
const btnCancelarStatusMembro = document.getElementById("btnCancelarStatusMembro");
const btnConfirmarStatusMembro = document.getElementById("btnConfirmarStatusMembro");

function membroEhDono(membro) {
    return membro?.dono === true;
}

function taxaAtualOpcional(membro, campo) {
    if (!membro || !Object.prototype.hasOwnProperty.call(membro, campo)) return null;
    const numero = Number(membro[campo]);
    return Number.isFinite(numero) ? numero : null;
}

function traduzirPapel(papel) {
    if (papelEhAdmin(papel)) return "Administrador";
    if (papel === "barber") return "Barbeiro";
    return "Membro";
}

function obterNomeMembro(membro) {
    const nome = String(membro?.nome || "").trim();
    if (nome) return nome;

    if ((membro?.uid || membro?.id) === state.user?.uid) {
        const nomeAtual = String(state.perfilUsuario?.nome || state.user?.displayName || "").trim();
        if (nomeAtual) return nomeAtual;
    }

    return membro?.email || "Membro da equipe";
}

function precosPersonalizadosEfetivos(precos = {}) {
    const padroes = new Map(
        obterServicos().map((servico) => [String(servico.id), Number(servico.preco || 0)])
    );
    const resultado = {};

    Object.entries(precos || {}).forEach(([servicoId, valor]) => {
        const numero = Number(valor);
        const padrao = padroes.get(String(servicoId));
        if (!Number.isFinite(numero) || numero <= 0) return;
        if (Number.isFinite(padrao) && Math.abs(numero - padrao) < 0.005) return;
        resultado[servicoId] = numero;
    });

    return resultado;
}

function obterStatusMembro(membro) {
    if (membro.ativo !== true) return { classe: "inativo", texto: "Desativado" };
    if (membro.primeiroAcessoPendente === true) return { classe: "pendente", texto: "Primeiro acesso" };
    return { classe: "ativo", texto: "Ativo" };
}

function criarBadgeStatus(membro) {
    const status = obterStatusMembro(membro);
    const badge = document.createElement("span");
    badge.className = `equipe-status ${status.classe}`;

    const ponto = document.createElement("span");
    ponto.className = "equipe-status-dot";

    const texto = document.createElement("span");
    texto.textContent = status.texto;

    badge.append(ponto, texto);
    return badge;
}

function setCadastroStatus(texto = "", erro = false) {
    if (!cadastroStatus) return;
    cadastroStatus.textContent = texto;
    cadastroStatus.classList.toggle("error", Boolean(erro));
    cadastroStatus.hidden = !texto;
}

function setFinanceiroStatus(texto = "", erro = false) {
    if (!financeiroStatus) return;
    financeiroStatus.textContent = texto;
    financeiroStatus.classList.toggle("error", Boolean(erro));
    financeiroStatus.hidden = !texto;
}

function limparErroCampo(input) {
    input?.classList.remove("input-erro", "shake");
}

function erroCampo(input, mensagem) {
    if (input) {
        input.classList.remove("shake");
        void input.offsetWidth;
        input.classList.add("input-erro", "shake");
        setTimeout(() => input.classList.remove("shake"), 500);
        setTimeout(() => input.classList.remove("input-erro"), 3000);
        input.focus();
    }
    mostrarErro(mensagem);
}

function normalizarNomeSenha(nome) {
    const primeiroNome = String(nome || "")
        .trim()
        .split(/\s+/)[0]
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-zA-Z0-9]/g, "")
        .toLowerCase();

    return primeiroNome || "barbeiro";
}

function gerarSenhaTemporaria() {
    return `${normalizarNomeSenha(inputNomeBarbeiro?.value)}123`;
}

function preencherNovaSenha() {
    if (inputSenhaTemporaria) inputSenhaTemporaria.value = gerarSenhaTemporaria();
}

function abrirModalAdicionar() {
    if (!modalAdicionar || !usuarioEhAdmin()) return;
    formAdicionarBarbeiro?.reset();
    setCadastroStatus();
    definirSecaoFinanceiro(btnToggleFinanceiroNovo, conteudoFinanceiroNovo, false);
    if(inputNovoTaxaDebito)inputNovoTaxaDebito.value="";
    if(inputNovoTaxaCredito)inputNovoTaxaCredito.value="";
    if(inputNovoRepasse)inputNovoRepasse.value="";
    preencherNovaSenha();
    modalAdicionar.hidden = false;
    document.body.classList.add("modal-equipe-aberto");
    setTimeout(() => inputNomeBarbeiro?.focus(), 0);
}

function fecharModalAdicionar() {
    if (!modalAdicionar || btnCriarAcesso?.disabled) return;
    modalAdicionar.hidden = true;
    document.body.classList.remove("modal-equipe-aberto");
}

function abrirModalAcessoCriado(acesso) {
    ultimoAcessoCriado = acesso;
    const restaurado = acesso?.restaurado === true;

    if (acessoCriadoNome) acessoCriadoNome.textContent = acesso.nome;
    if (acessoCriadoEmail) acessoCriadoEmail.textContent = acesso.email;
    if (acessoCriadoSenha) acessoCriadoSenha.textContent = acesso.senhaTemporaria || "—";
    if (acessoCriadoSenhaLinha) acessoCriadoSenhaLinha.hidden = restaurado;

    if (tituloAcessoCriado) {
        tituloAcessoCriado.textContent = restaurado ? "Acesso restaurado" : "Acesso criado";
    }
    if (acessoCriadoDescricao) {
        acessoCriadoDescricao.textContent = restaurado
            ? "Este e-mail já possuía uma conta. O mesmo acesso foi restaurado para preservar o histórico e o UID do profissional."
            : "Envie estes dados ao novo barbeiro. A senha precisará ser alterada no primeiro acesso.";
    }

    if (modalAcessoCriado) {
        modalAcessoCriado.hidden = false;
        document.body.classList.add("modal-equipe-aberto");
    }
}

function fecharModalAcessoCriado() {
    if (modalAcessoCriado) modalAcessoCriado.hidden = true;
    document.body.classList.remove("modal-equipe-aberto");
    ultimoAcessoCriado = null;
}

function montarTextoAcesso(acesso) {
    if (acesso?.restaurado === true) {
        return [
            "Seu acesso ao Sr NK foi restaurado.",
            "",
            `Nome: ${acesso.nome}`,
            `E-mail: ${acesso.email}`,
            "",
            "Use a senha que já utilizava. Se não lembrar, escolha “Esqueci minha senha” na tela de login."
        ].join("\n");
    }

    return [
        "Seu acesso ao Sr NK foi criado.",
        "",
        `Nome: ${acesso.nome}`,
        `E-mail: ${acesso.email}`,
        `Senha temporária: ${acesso.senhaTemporaria}`,
        "",
        "No primeiro acesso você deverá criar uma nova senha."
    ].join("\n");
}

async function copiarTexto(texto) {
    if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(texto);
        return;
    }

    const area = document.createElement("textarea");
    area.value = texto;
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    document.execCommand("copy");
    area.remove();
}

async function copiarAcessoCriado() {
    if (!ultimoAcessoCriado) return;
    try {
        await copiarTexto(montarTextoAcesso(ultimoAcessoCriado));
        mostrarSucesso("Dados de acesso copiados.");
    } catch (error) {
        console.error("Erro ao copiar dados de acesso:", error);
        mostrarErro("Não foi possível copiar os dados de acesso.");
    }
}

async function compartilharAcessoCriado() {
    if (!ultimoAcessoCriado) return;
    const texto = montarTextoAcesso(ultimoAcessoCriado);

    if (navigator.share) {
        try {
            await navigator.share({ title: "Acesso Sr NK", text: texto });
            return;
        } catch (error) {
            if (error?.name === "AbortError") return;
        }
    }

    await copiarAcessoCriado();
}

function traduzirErroCadastro(error) {
    switch (error?.code) {
        case "equipe/nome-duplicado":
        case "equipe/email-duplicado":
            return error?.message || "Já existe um usuário com estes dados.";
        case "auth/email-already-in-use":
            return "Este e-mail já possui uma conta cadastrada.";
        case "auth/invalid-email":
            return "Informe um e-mail válido.";
        case "auth/weak-password":
            return "A senha temporária não atende aos requisitos mínimos.";
        case "permission-denied":
        case "firestore/permission-denied":
            return "As regras do Firestore não permitem criar este acesso.";
        default:
            return error?.message || "Não foi possível criar o acesso.";
    }
}

async function criarNovoBarbeiro(event) {
    event.preventDefault();
    setCadastroStatus();

    const nome = String(inputNomeBarbeiro?.value || "").trim();
    const email = String(inputEmailBarbeiro?.value || "").trim().toLowerCase();
    preencherNovaSenha();
    const senhaTemporaria = String(inputSenhaTemporaria?.value || "");
    const taxaDebitoPct = converterParaNumero(inputNovoTaxaDebito?.value);
    const taxaCreditoPct = converterParaNumero(inputNovoTaxaCredito?.value);
    const repassePct = converterParaNumero(inputNovoRepasse?.value);

    if (nome.length < 2) {
        erroCampo(inputNomeBarbeiro, "Informe o nome do barbeiro.");
        return;
    }

    if (!email || !email.includes("@")) {
        erroCampo(inputEmailBarbeiro, "Informe um e-mail válido.");
        return;
    }

    if (senhaTemporaria.length < 6) {
        erroCampo(inputSenhaTemporaria, "Não foi possível gerar uma senha temporária válida.");
        return;
    }

    if (taxaDebitoPct !== null && (!Number.isFinite(taxaDebitoPct) || taxaDebitoPct < 0 || taxaDebitoPct >= 10)) {
        definirSecaoFinanceiro(btnToggleFinanceiroNovo, conteudoFinanceiroNovo, true);
        erroCampo(inputNovoTaxaDebito, "Informe a taxa de débito entre 0,00% e 9,99% ou deixe em branco.");
        return;
    }

    if (taxaCreditoPct !== null && (!Number.isFinite(taxaCreditoPct) || taxaCreditoPct < 0 || taxaCreditoPct >= 10)) {
        definirSecaoFinanceiro(btnToggleFinanceiroNovo, conteudoFinanceiroNovo, true);
        erroCampo(inputNovoTaxaCredito, "Informe a taxa de crédito entre 0,00% e 9,99% ou deixe em branco.");
        return;
    }

    if (repassePct === null || !Number.isFinite(repassePct) || repassePct < 0 || repassePct > 99.99) {
        definirSecaoFinanceiro(btnToggleFinanceiroNovo, conteudoFinanceiroNovo, true);
        erroCampo(inputNovoRepasse, "Informe o repasse entre 0,00% e 99,99%.");
        return;
    }

    if (btnCriarAcesso) {
        btnCriarAcesso.disabled = true;
        btnCriarAcesso.textContent = "Salvando...";
    }
    if (btnCancelarAdicionar) btnCancelarAdicionar.disabled = true;

    try {
        const acesso = await criarAcessoBarbeiro({
            nome,
            email,
            senhaTemporaria,
            taxaDebitoPct,
            taxaCreditoPct,
            repassePct
        });

        modalAdicionar.hidden = true;
        document.body.classList.remove("modal-equipe-aberto");
        await carregarEquipe();
        abrirModalAcessoCriado(acesso);
    } catch (error) {
        console.error("Erro ao criar barbeiro:", error);
        const mensagem = traduzirErroCadastro(error);

        if (error?.campo === "nome" || error?.code === "equipe/nome-duplicado") {
            erroCampo(inputNomeBarbeiro, mensagem);
        } else if (
            error?.campo === "email"
            || error?.code === "equipe/email-duplicado"
            || error?.code === "auth/email-already-in-use"
            || error?.code === "auth/invalid-email"
        ) {
            erroCampo(inputEmailBarbeiro, mensagem);
        } else {
            mostrarErro(mensagem);
        }
    } finally {
        if (btnCriarAcesso) {
            btnCriarAcesso.disabled = false;
            btnCriarAcesso.textContent = "Salvar";
        }
        if (btnCancelarAdicionar) btnCancelarAdicionar.disabled = false;
    }
}

function formatarPercentualInput(valor) {
    if (valor === null || valor === undefined || String(valor).trim() === "") return "";
    const numero = Number(valor);
    if (!Number.isFinite(numero)) return "";
    return numero.toFixed(2).replace(".", ",");
}

function aplicarMascaraPercentual(elemento, maxDigitosInteiros) {
    if (!elemento) return;
    let value = String(elemento.value || "").replace(/\D/g, "");
    value = value.replace(/^0+/, "");
    if (value === "") { elemento.value = ""; return; }
    const maxDigitos = maxDigitosInteiros + 2;
    if (value.length > maxDigitos) value = value.slice(0, maxDigitos);
    elemento.value = (Number.parseInt(value, 10) / 100).toFixed(2).replace(".", ",");
}

function mostrarEditorFinanceiro(botao,input,valorAtual){if(!botao||!input)return;botao.classList.add("hidden");input.classList.remove("hidden");input.value=formatarPercentualInput(valorAtual);input.focus();input.select?.();}
function mostrarEditorTexto(botao, input, valorAtual = "") {
    if (!botao || !input) return;
    botao.classList.add("hidden");
    input.classList.remove("hidden");
    input.value = String(valorAtual || "");
    input.focus();
    input.select?.();
}

function definirSecaoFinanceiro(botao, conteudo, aberta) {
    if (!botao || !conteudo) return;
    botao.setAttribute("aria-expanded", aberta ? "true" : "false");
    conteudo.hidden = !aberta;
}

function alternarSecaoFinanceiro(botao, conteudo) {
    if (!botao || !conteudo) return;
    const aberta = botao.getAttribute("aria-expanded") === "true";
    definirSecaoFinanceiro(botao, conteudo, !aberta);
}

function abrirFinanceiroMembro(membro) {
    if (!modalFinanceiro || !usuarioEhAdmin()) return;

    membroFinanceiroAtual = membro;
    setFinanceiroStatus();
    definirSecaoFinanceiro(btnToggleDados, conteudoDados, false);
    definirSecaoFinanceiro(btnToggleTaxas, conteudoTaxas, false);
    definirSecaoFinanceiro(btnTogglePrecos, conteudoPrecos, false);

    const dono = membroEhDono(membro);
    const debito = taxaAtualOpcional(membro, "taxaDebitoPct");
    const credito = taxaAtualOpcional(membro, "taxaCreditoPct");
    const repasseSalvo = Object.prototype.hasOwnProperty.call(membro || {}, "repassePct")
        ? Number(membro.repassePct)
        : null;
    const repasse = dono ? 0 : (Number.isFinite(repasseSalvo) ? repasseSalvo : null);

    if (tituloFinanceiro) tituloFinanceiro.textContent = obterNomeMembro(membro);

    if (lblNomeMembro) lblNomeMembro.textContent = `Atual: ${obterNomeMembro(membro)}`;
    if (lblEmailMembro) lblEmailMembro.textContent = membro?.email || "—";
    if (inputNomeMembro) {
        inputNomeMembro.value = String(membro?.nome || obterNomeMembro(membro));
        inputNomeMembro.classList.add("hidden");
        limparErroCampo(inputNomeMembro);
    }
    if (btnEditarNomeMembro) {
        btnEditarNomeMembro.classList.toggle("hidden", membro?.papel !== "barber");
    }

    if (inputTaxaDebito) {
        inputTaxaDebito.value = formatarPercentualInput(debito);
        inputTaxaDebito.classList.add("hidden");
        limparErroCampo(inputTaxaDebito);
    }

    if (inputTaxaCredito) {
        inputTaxaCredito.value = formatarPercentualInput(credito);
        inputTaxaCredito.classList.add("hidden");
        limparErroCampo(inputTaxaCredito);
    }

    if (inputRepasse) {
        inputRepasse.value = formatarPercentualInput(repasse);
        inputRepasse.classList.add("hidden");
        limparErroCampo(inputRepasse);
    }

    if (lblTaxaDebito) {
        lblTaxaDebito.textContent = debito === null
            ? "Atual: Não informada"
            : `Atual: ${formatarPercentualInput(debito)}%`;
    }

    if (lblTaxaCredito) {
        lblTaxaCredito.textContent = credito === null
            ? "Atual: Não informada"
            : `Atual: ${formatarPercentualInput(credito)}%`;
    }

    if (lblRepasse) {
        lblRepasse.textContent = dono
            ? "Atual: Sem repasse"
            : repasse === null
                ? "Atual: Não informado"
                : `Atual: ${formatarPercentualInput(repasse)}%`;
    }

    btnEditarTaxaDebito?.classList.remove("hidden");
    btnEditarTaxaCredito?.classList.remove("hidden");
    if (btnEditarRepasse) btnEditarRepasse.classList.toggle("hidden", dono);

    if (precosLista) {
        precosLista.innerHTML = "";

        obterServicos().forEach((servico) => {
            const row = document.createElement("div");
            row.className = "config-item equipe-config-item equipe-preco-item";
            if (servico.ativo === false) row.classList.add("desativado");

            const left = document.createElement("div");
            left.className = "config-item-left";

            const icon = document.createElement("div");
            icon.className = "config-icon";
            icon.innerHTML = '<i class="fas fa-scissors"></i>';

            const info = document.createElement("div");
            info.className = "config-info";

            const nome = document.createElement("span");
            nome.className = "config-nome";
            nome.textContent = servico.nome;

            const atualLabel = document.createElement("span");
            atualLabel.className = "config-atual";

            const precoPadrao = Number(servico.preco || 0);
            const personalizado = Number(membro.precosPersonalizados?.[servico.id]);
            const tem = Number.isFinite(personalizado)
                && personalizado > 0
                && Math.abs(personalizado - precoPadrao) >= 0.005;
            const valor = tem ? personalizado : precoPadrao;
            atualLabel.textContent = `Atual: R$ ${formatarMoeda(valor)}`;

            info.append(nome, atualLabel);
            left.append(icon, info);

            const action = document.createElement("div");
            action.className = "config-action";

            const alterar = document.createElement("button");
            alterar.type = "button";
            alterar.className = "btn-alterar";
            alterar.innerHTML = '<i class="fas fa-pen"></i> Alterar';

            const editor = document.createElement("div");
            editor.className = "equipe-price-editor hidden";

            const input = document.createElement("input");
            input.className = "input-config";
            input.type = "tel";
            input.inputMode = "numeric";
            input.placeholder = "0,00";
            input.dataset.servicoId = servico.id;
            input.dataset.precoPadrao = String(Number(servico.preco || 0));
            input.dataset.touched = "false";
            input.value = "";

            input.addEventListener("input", () => {
                input.dataset.touched = "true";
                aplicarMascaraMoedaInput(input, 7);
            });

            alterar.addEventListener("click", () => {
                alterar.classList.add("hidden");
                editor.classList.remove("hidden");
                input.value = "";
                input.dataset.touched = "false";
                input.focus();
            });

            editor.append(input);
            action.append(alterar, editor);
            row.append(left, action);
            precosLista.appendChild(row);
        });
    }

    modalFinanceiro.hidden = false;
    document.body.classList.add("modal-equipe-aberto");
}

function fecharFinanceiroMembro({ forcar = false } = {}) {
    if (btnSalvarFinanceiro?.disabled && !forcar) return;
    if (modalFinanceiro) modalFinanceiro.hidden = true;
    document.body.classList.remove("modal-equipe-aberto");
    membroFinanceiroAtual = null;
    setFinanceiroStatus();
}

async function salvarFinanceiroMembro() {
    if (!membroFinanceiroAtual) return;

    const dono = membroEhDono(membroFinanceiroAtual);
    const nomeAtual = String(membroFinanceiroAtual?.nome || obterNomeMembro(membroFinanceiroAtual)).trim();
    const nomeEditado = membroFinanceiroAtual?.papel === "barber"
        ? String(inputNomeMembro?.value || nomeAtual).trim().replace(/\s+/g, " ")
        : nomeAtual;

    if (membroFinanceiroAtual?.papel === "barber" && nomeEditado.length < 2) {
        definirSecaoFinanceiro(btnToggleDados, conteudoDados, true);
        if (inputNomeMembro?.classList.contains("hidden")) {
            mostrarEditorTexto(btnEditarNomeMembro, inputNomeMembro, nomeAtual);
        }
        erroCampo(inputNomeMembro, "Informe o nome do profissional.");
        return;
    }

    const repasse = dono ? 0 : converterParaNumero(inputRepasse?.value);
    const taxaDebitoPct = converterParaNumero(inputTaxaDebito?.value);
    const taxaCreditoPct = converterParaNumero(inputTaxaCredito?.value);

    if (!dono && (repasse === null || !Number.isFinite(repasse) || repasse < 0 || repasse > 99.99)) {
        definirSecaoFinanceiro(btnToggleTaxas, conteudoTaxas, true);
        if (inputRepasse?.classList.contains("hidden")) {
            mostrarEditorFinanceiro(btnEditarRepasse, inputRepasse, null);
        }
        erroCampo(inputRepasse, "Informe um repasse entre 0,00% e 99,99%.");
        return;
    }

    if (taxaDebitoPct !== null && (!Number.isFinite(taxaDebitoPct) || taxaDebitoPct < 0 || taxaDebitoPct >= 10)) {
        definirSecaoFinanceiro(btnToggleTaxas, conteudoTaxas, true);
        erroCampo(inputTaxaDebito, "Informe a taxa de débito entre 0,00% e 9,99% ou deixe em branco.");
        return;
    }

    if (taxaCreditoPct !== null && (!Number.isFinite(taxaCreditoPct) || taxaCreditoPct < 0 || taxaCreditoPct >= 10)) {
        definirSecaoFinanceiro(btnToggleTaxas, conteudoTaxas, true);
        erroCampo(inputTaxaCredito, "Informe a taxa de crédito entre 0,00% e 9,99% ou deixe em branco.");
        return;
    }

    const precosPersonalizados = precosPersonalizadosEfetivos(
        membroFinanceiroAtual.precosPersonalizados || {}
    );

    precosLista?.querySelectorAll("input[data-servico-id]").forEach((input) => {
        if (input.dataset.touched !== "true") return;
        const numero = converterParaNumero(input.value);

        const precoPadrao = Number(input.dataset.precoPadrao || 0);
        if (
            Number.isFinite(numero)
            && numero > 0
            && (!Number.isFinite(precoPadrao) || Math.abs(numero - precoPadrao) >= 0.005)
        ) {
            precosPersonalizados[input.dataset.servicoId] = numero;
        } else {
            delete precosPersonalizados[input.dataset.servicoId];
        }
    });

    if (btnSalvarFinanceiro) {
        btnSalvarFinanceiro.disabled = true;
        btnSalvarFinanceiro.textContent = "Salvando...";
    }
    if (btnCancelarFinanceiro) btnCancelarFinanceiro.disabled = true;

    try {
        await atualizarFinanceiroMembro(
            membroFinanceiroAtual.uid || membroFinanceiroAtual.id,
            {
                nome: membroFinanceiroAtual?.papel === "barber" ? nomeEditado : null,
                repassePct: repasse,
                taxaDebitoPct,
                taxaCreditoPct,
                precosPersonalizados
            }
        );

        membroFinanceiroAtual = {
            ...membroFinanceiroAtual,
            nome: membroFinanceiroAtual?.papel === "barber" ? nomeEditado : membroFinanceiroAtual?.nome,
            repassePct: repasse,
            precosPersonalizados: { ...precosPersonalizados },
            ...(taxaDebitoPct !== null ? { taxaDebitoPct } : {}),
            ...(taxaCreditoPct !== null ? { taxaCreditoPct } : {})
        };

        if (membroFinanceiroAtual?.papel === "barber") {
            if (lblNomeMembro) lblNomeMembro.textContent = `Atual: ${nomeEditado}`;
            if (tituloFinanceiro) tituloFinanceiro.textContent = nomeEditado;
            if (inputNomeMembro) {
                inputNomeMembro.value = nomeEditado;
                inputNomeMembro.classList.add("hidden");
                limparErroCampo(inputNomeMembro);
            }
            btnEditarNomeMembro?.classList.remove("hidden");
        }

        if (lblTaxaDebito) {
            const valor = taxaDebitoPct !== null
                ? taxaDebitoPct
                : taxaAtualOpcional(membroFinanceiroAtual, "taxaDebitoPct");
            lblTaxaDebito.textContent = valor === null
                ? "Atual: Não informada"
                : `Atual: ${formatarPercentualInput(valor)}%`;
        }

        if (lblTaxaCredito) {
            const valor = taxaCreditoPct !== null
                ? taxaCreditoPct
                : taxaAtualOpcional(membroFinanceiroAtual, "taxaCreditoPct");
            lblTaxaCredito.textContent = valor === null
                ? "Atual: Não informada"
                : `Atual: ${formatarPercentualInput(valor)}%`;
        }

        if (lblRepasse) {
            lblRepasse.textContent = dono
                ? "Atual: Sem repasse"
                : `Atual: ${formatarPercentualInput(repasse)}%`;
        }

        [
            [btnEditarTaxaDebito, inputTaxaDebito],
            [btnEditarTaxaCredito, inputTaxaCredito],
            [btnEditarRepasse, inputRepasse]
        ].forEach(([botao, input]) => {
            input?.classList.add("hidden");
            limparErroCampo(input);
            if (botao && !(botao === btnEditarRepasse && dono)) botao.classList.remove("hidden");
        });

        const servicosPorId = new Map(
            obterServicos().map((servico) => [String(servico.id), servico])
        );

        precosLista?.querySelectorAll("input[data-servico-id]").forEach((input) => {
            const id = String(input.dataset.servicoId || "");
            const row = input.closest(".equipe-preco-item");
            const atual = row?.querySelector(".config-atual");
            const personalizado = Number(precosPersonalizados[id]);
            const servico = servicosPorId.get(id);
            const valorAtual = Number.isFinite(personalizado) && personalizado > 0
                ? personalizado
                : Number(servico?.preco || input.dataset.precoPadrao || 0);

            if (atual) atual.textContent = `Atual: R$ ${formatarMoeda(valorAtual)}`;
            input.value = "";
            input.dataset.touched = "false";
            input.closest(".equipe-price-editor")?.classList.add("hidden");
            row?.querySelector(".btn-alterar")?.classList.remove("hidden");
        });

        mostrarSucesso("Dados do profissional salvos.");
        await carregarEquipe();
    } catch (error) {
        console.error("Erro ao salvar dados do profissional:", error);
        if (error?.campo === "nome" || error?.code === "equipe/nome-duplicado") {
            definirSecaoFinanceiro(btnToggleDados, conteudoDados, true);
            if (inputNomeMembro?.classList.contains("hidden")) {
                mostrarEditorTexto(btnEditarNomeMembro, inputNomeMembro, nomeAtual);
            }
            erroCampo(inputNomeMembro, error?.message || "Não foi possível alterar o nome.");
        } else {
            mostrarErro(error?.message || "Não foi possível salvar.");
        }
    } finally {
        if (btnSalvarFinanceiro) {
            btnSalvarFinanceiro.disabled = false;
            btnSalvarFinanceiro.textContent = "Salvar";
        }
        if (btnCancelarFinanceiro) btnCancelarFinanceiro.disabled = false;
    }
}

function abrirConfirmacaoStatus(membro, botao) {
    if (!modalStatusMembro || papelEhAdmin(membro?.papel) || membro?.removido === true) return;

    acaoMembroPendente = "status";
    membroStatusPendente = membro;
    botaoStatusOrigem = botao || null;

    const ativar = membro?.ativo !== true;
    const nome = obterNomeMembro(membro);

    if (tituloStatusMembro) {
        tituloStatusMembro.textContent = ativar
            ? "Confirmar ativação"
            : "Confirmar desativação";
    }

    if (descricaoStatusMembro) {
        descricaoStatusMembro.innerHTML = ativar
            ? `Ativar novamente o acesso de <strong>${escapeHtml(nome)}</strong>?`
            : `Desativar o acesso de <strong>${escapeHtml(nome)}</strong>? Essa pessoa deixará de acessar os dados da barbearia.`;
    }

    if (btnConfirmarStatusMembro) {
        btnConfirmarStatusMembro.textContent = ativar ? "Ativar" : "Desativar";
        btnConfirmarStatusMembro.classList.toggle("ativar", ativar);
        btnConfirmarStatusMembro.disabled = false;
    }

    modalStatusMembro.classList.add("active");
    modalStatusMembro.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-equipe-aberto");
}

function abrirConfirmacaoExclusao(membro, botao) {
    if (!modalStatusMembro || papelEhAdmin(membro?.papel) || membro?.ativo === true) return;

    acaoMembroPendente = "excluir";
    membroStatusPendente = membro;
    botaoStatusOrigem = botao || null;
    const nome = obterNomeMembro(membro);

    if (tituloStatusMembro) tituloStatusMembro.textContent = "Confirmar exclusão";
    if (descricaoStatusMembro) {
        descricaoStatusMembro.innerHTML = `Excluir <strong>${escapeHtml(nome)}</strong> da equipe? O acesso continuará bloqueado e o cadastro sairá da lista de membros.`;
    }
    if (btnConfirmarStatusMembro) {
        btnConfirmarStatusMembro.textContent = "Excluir";
        btnConfirmarStatusMembro.classList.remove("ativar");
        btnConfirmarStatusMembro.disabled = false;
    }

    modalStatusMembro.classList.add("active");
    modalStatusMembro.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-equipe-aberto");
}

function fecharConfirmacaoStatus({ forcar = false } = {}) {
    if (!modalStatusMembro) return;
    if (btnConfirmarStatusMembro?.disabled && !forcar) return;

    modalStatusMembro.classList.remove("active");
    modalStatusMembro.setAttribute("aria-hidden", "true");
    document.body.classList.remove("modal-equipe-aberto");
    membroStatusPendente = null;
    botaoStatusOrigem = null;
    acaoMembroPendente = "status";
}

async function confirmarAlteracaoStatus() {
    if (!membroStatusPendente) return;

    const membro = membroStatusPendente;
    const novoStatus = membro.ativo !== true;
    const excluindo = acaoMembroPendente === "excluir";

    if (btnConfirmarStatusMembro) {
        btnConfirmarStatusMembro.disabled = true;
        btnConfirmarStatusMembro.textContent = excluindo
            ? "Excluindo..."
            : (novoStatus ? "Ativando..." : "Desativando...");
    }
    if (btnCancelarStatusMembro) btnCancelarStatusMembro.disabled = true;
    if (botaoStatusOrigem) botaoStatusOrigem.disabled = true;

    try {
        if (excluindo) {
            await excluirMembroInativo(membro.uid || membro.id);
            fecharConfirmacaoStatus({ forcar: true });
            mostrarSucesso("Membro excluído da equipe.");
        } else {
            await alterarStatusMembro(membro.uid || membro.id, novoStatus);
            fecharConfirmacaoStatus({ forcar: true });
            mostrarSucesso(novoStatus ? "Acesso ativado." : "Acesso desativado.");
        }
        await carregarEquipe();
    } catch (error) {
        console.error("Erro ao alterar membro:", error);
        mostrarErro(error?.message || "Não foi possível concluir a ação.");
    } finally {
        if (btnConfirmarStatusMembro) btnConfirmarStatusMembro.disabled = false;
        if (btnCancelarStatusMembro) btnCancelarStatusMembro.disabled = false;
        if (botaoStatusOrigem) botaoStatusOrigem.disabled = false;
    }
}

function escapeHtml(valor) {
    return String(valor ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function formatarPercentualResumo(valor) {
    return valor === null
        ? "Não informada"
        : `${Number(valor).toFixed(2).replace(".", ",")}%`;
}

function criarCardMembro(membro) {
    const ativo = membro.ativo === true;
    const admin = papelEhAdmin(membro.papel);

    const card = document.createElement("article");
    card.className = "equipe-card";
    if (!ativo) card.classList.add("desativado");

    const cabecalho = document.createElement("button");
    cabecalho.type = "button";
    cabecalho.className = "equipe-card-toggle";
    cabecalho.setAttribute("aria-expanded", "false");

    const avatar = document.createElement("span");
    avatar.className = "equipe-avatar";
    avatar.innerHTML = '<i class="fas fa-user" aria-hidden="true"></i>';

    const nome = document.createElement("strong");
    nome.className = "equipe-nome";
    nome.textContent = obterNomeMembro(membro);

    const chevron = document.createElement("i");
    chevron.className = "fas fa-chevron-down equipe-card-chevron";
    chevron.setAttribute("aria-hidden", "true");

    cabecalho.append(avatar, nome, chevron);

    const conteudo = document.createElement("div");
    conteudo.className = "equipe-card-conteudo";
    conteudo.hidden = true;

    const meta = document.createElement("div");
    meta.className = "equipe-meta";

    const email = document.createElement("div");
    email.className = "equipe-meta-item equipe-meta-wide";
    const emailLabel = document.createElement("span");
    emailLabel.className = "equipe-meta-label";
    emailLabel.textContent = "E-mail";
    const emailValor = document.createElement("strong");
    emailValor.className = "equipe-email-valor";
    emailValor.textContent = membro.email || "—";
    email.append(emailLabel, emailValor);

    const perfil = document.createElement("div");
    perfil.className = "equipe-meta-item";
    const perfilLabel = document.createElement("span");
    perfilLabel.className = "equipe-meta-label";
    perfilLabel.textContent = "Perfil";
    const perfilValor = document.createElement("strong");
    perfilValor.textContent = traduzirPapel(membro.papel);
    perfil.append(perfilLabel, perfilValor);

    const status = document.createElement("div");
    status.className = "equipe-meta-item";
    const statusLabel = document.createElement("span");
    statusLabel.className = "equipe-meta-label";
    statusLabel.textContent = "Status";
    status.append(statusLabel, criarBadgeStatus(membro));

    meta.append(email, perfil, status);
    conteudo.appendChild(meta);

    const resumoFinanceiro = document.createElement("div");
    resumoFinanceiro.className = "equipe-financeiro-resumo";

    const dono = membroEhDono(membro);
    const repasseSalvo = Object.prototype.hasOwnProperty.call(membro || {}, "repassePct")
        ? Number(membro.repassePct)
        : null;
    const repasse = dono ? 0 : (Number.isFinite(repasseSalvo) ? repasseSalvo : null);
    const debito = taxaAtualOpcional(membro, "taxaDebitoPct");
    const credito = taxaAtualOpcional(membro, "taxaCreditoPct");
    const overrides = Object.keys(precosPersonalizadosEfetivos(membro.precosPersonalizados || {})).length;

    const itensFinanceiros = [
        ["Repasse %", dono ? "Sem repasse" : formatarPercentualResumo(repasse)],
        ["Débito %", formatarPercentualResumo(debito)],
        ["Crédito %", formatarPercentualResumo(credito)],
        ["Preços próprios", overrides || "Nenhum"]
    ];

    itensFinanceiros.forEach(([rotulo, valor]) => {
        const item = document.createElement("span");
        item.textContent = rotulo;
        const strong = document.createElement("strong");
        strong.textContent = String(valor);
        item.appendChild(strong);
        resumoFinanceiro.appendChild(item);
    });

    conteudo.appendChild(resumoFinanceiro);

    const acoes = document.createElement("div");
    acoes.className = "equipe-card-acoes";

    if (ativo || admin) {
        const configurar = document.createElement("button");
        configurar.type = "button";
        configurar.className = "equipe-action-btn configurar";
        configurar.innerHTML = '<i class="fas fa-sliders" aria-hidden="true"></i><span>Dados</span>';
        configurar.addEventListener("click", (event) => {
            event.stopPropagation();
            abrirFinanceiroMembro(membro);
        });
        acoes.appendChild(configurar);
    }

    if (!admin) {
        if (ativo) {
            const botao = document.createElement("button");
            botao.type = "button";
            botao.className = "equipe-action-btn desativar";
            botao.innerHTML = '<i class="fas fa-user-slash" aria-hidden="true"></i><span>Desativar</span>';
            botao.addEventListener("click", (event) => {
                event.stopPropagation();
                abrirConfirmacaoStatus(membro, botao);
            });
            acoes.appendChild(botao);
        } else {
            const excluir = document.createElement("button");
            excluir.type = "button";
            excluir.className = "equipe-action-btn excluir";
            excluir.innerHTML = '<i class="fas fa-trash" aria-hidden="true"></i><span>Excluir</span>';
            excluir.addEventListener("click", (event) => {
                event.stopPropagation();
                abrirConfirmacaoExclusao(membro, excluir);
            });

            const ativar = document.createElement("button");
            ativar.type = "button";
            ativar.className = "equipe-action-btn reativar";
            ativar.innerHTML = '<i class="fas fa-user-check" aria-hidden="true"></i><span>Ativar</span>';
            ativar.addEventListener("click", (event) => {
                event.stopPropagation();
                abrirConfirmacaoStatus(membro, ativar);
            });

            acoes.append(excluir, ativar);
        }
    }

    conteudo.appendChild(acoes);

    cabecalho.addEventListener("click", () => {
        const abrir = conteudo.hidden;
        conteudo.hidden = !abrir;
        cabecalho.setAttribute("aria-expanded", abrir ? "true" : "false");
        card.classList.toggle("expandido", abrir);
    });

    card.append(cabecalho, conteudo);
    return card;
}

function ordenarMembros(lista) {
    return [...lista].sort((a, b) => {
        if (papelEhAdmin(a.papel) && !papelEhAdmin(b.papel)) return -1;
        if (papelEhAdmin(b.papel) && !papelEhAdmin(a.papel)) return 1;
        return obterNomeMembro(a).localeCompare(obterNomeMembro(b), "pt-BR");
    });
}

export async function carregarEquipe() {
    if (carregando) return state.equipe || [];
    carregando = true;
    if (equipeResumo) equipeResumo.textContent = "Carregando equipe...";

    try {
        const membros = await listarMembrosEquipe();
        const visiveis = membros.filter((membro) => membro?.removido !== true);
        const ativos = ordenarMembros(visiveis.filter((membro) => membro.ativo === true));
        const inativos = ordenarMembros(visiveis.filter((membro) => membro.ativo !== true));

        if (equipeListaAtivos) {
            equipeListaAtivos.innerHTML = "";
            ativos.forEach((membro) => equipeListaAtivos.appendChild(criarCardMembro(membro)));
        }
        if (equipeListaInativos) {
            equipeListaInativos.innerHTML = "";
            inativos.forEach((membro) => equipeListaInativos.appendChild(criarCardMembro(membro)));
        }
        if (equipeBlocoInativos) equipeBlocoInativos.hidden = inativos.length === 0;
        if (equipeResumo) {
            equipeResumo.textContent = ativos.length === 1 ? "1 membro ativo" : `${ativos.length} membros ativos`;
        }
        return membros;
    } catch (error) {
        console.error("Erro ao carregar equipe:", error);
        if (equipeResumo) equipeResumo.textContent = "Não foi possível carregar a equipe.";
        mostrarErro("Não foi possível carregar a equipe.");
        return [];
    } finally {
        carregando = false;
    }
}

async function prepararEquipe() {
    try {
        const membroAtual = state.membroAtual || await obterMembroAtual();
        const podeGerenciar = membroAtual?.ativo === true && papelEhAdmin(membroAtual?.papel);
        if (menuEquipeItem) menuEquipeItem.hidden = !podeGerenciar;
        if (btnAdicionarBarbeiro) btnAdicionarBarbeiro.hidden = !podeGerenciar;

        if (!podeGerenciar) {
            if (secaoEquipe) secaoEquipe.style.display = "none";
            return;
        }
        await carregarEquipe();
    } catch (error) {
        console.error("Erro ao verificar acesso à equipe:", error);
        if (menuEquipeItem) menuEquipeItem.hidden = true;
    }
}

export function initEquipe() {
    if (inicializado) return;
    inicializado = true;

    btnAdicionarBarbeiro?.addEventListener("click", abrirModalAdicionar);
    btnFecharModalAdicionar?.addEventListener("click", fecharModalAdicionar);
    btnCancelarAdicionar?.addEventListener("click", fecharModalAdicionar);
    inputNomeBarbeiro?.addEventListener("input", () => {
        limparErroCampo(inputNomeBarbeiro);
        preencherNovaSenha();
    });
    inputEmailBarbeiro?.addEventListener("input", () => limparErroCampo(inputEmailBarbeiro));
    inputSenhaTemporaria?.addEventListener("input", () => limparErroCampo(inputSenhaTemporaria));
    formAdicionarBarbeiro?.addEventListener("submit", criarNovoBarbeiro);
    modalAdicionar?.addEventListener("click", (event) => {
        if (event.target === modalAdicionar) fecharModalAdicionar();
    });

    btnCopiarAcesso?.addEventListener("click", copiarAcessoCriado);
    btnCompartilharAcesso?.addEventListener("click", compartilharAcessoCriado);
    btnFecharAcessoCriado?.addEventListener("click", fecharModalAcessoCriado);
    modalAcessoCriado?.addEventListener("click", (event) => {
        if (event.target === modalAcessoCriado) fecharModalAcessoCriado();
    });

    inputNomeMembro?.addEventListener("input", () => limparErroCampo(inputNomeMembro));
    btnEditarNomeMembro?.addEventListener("click", () =>
        mostrarEditorTexto(btnEditarNomeMembro, inputNomeMembro, membroFinanceiroAtual?.nome || obterNomeMembro(membroFinanceiroAtual))
    );
    inputRepasse?.addEventListener("input", () => { limparErroCampo(inputRepasse); aplicarMascaraPercentual(inputRepasse, 2); });
    inputTaxaDebito?.addEventListener("input", () => { limparErroCampo(inputTaxaDebito); aplicarMascaraPercentual(inputTaxaDebito, 1); });
    inputTaxaCredito?.addEventListener("input", () => { limparErroCampo(inputTaxaCredito); aplicarMascaraPercentual(inputTaxaCredito, 1); });
    inputNovoTaxaDebito?.addEventListener("input", () => { limparErroCampo(inputNovoTaxaDebito); aplicarMascaraPercentual(inputNovoTaxaDebito, 1); });
    inputNovoTaxaCredito?.addEventListener("input", () => { limparErroCampo(inputNovoTaxaCredito); aplicarMascaraPercentual(inputNovoTaxaCredito, 1); });
    inputNovoRepasse?.addEventListener("input", () => { limparErroCampo(inputNovoRepasse); aplicarMascaraPercentual(inputNovoRepasse, 2); });
    btnEditarTaxaDebito?.addEventListener("click",()=>mostrarEditorFinanceiro(btnEditarTaxaDebito,inputTaxaDebito,converterParaNumero(inputTaxaDebito?.value)));
    btnEditarTaxaCredito?.addEventListener("click",()=>mostrarEditorFinanceiro(btnEditarTaxaCredito,inputTaxaCredito,converterParaNumero(inputTaxaCredito?.value)));
    btnEditarRepasse?.addEventListener("click",()=>mostrarEditorFinanceiro(btnEditarRepasse,inputRepasse,converterParaNumero(inputRepasse?.value)));
    btnFecharFinanceiro?.addEventListener("click", fecharFinanceiroMembro);
    btnCancelarFinanceiro?.addEventListener("click", fecharFinanceiroMembro);

    btnToggleDados?.addEventListener("click", () => {
        alternarSecaoFinanceiro(btnToggleDados, conteudoDados);
    });

    btnToggleTaxas?.addEventListener("click", () => {
        alternarSecaoFinanceiro(btnToggleTaxas, conteudoTaxas);
    });

    btnTogglePrecos?.addEventListener("click", () => {
        alternarSecaoFinanceiro(btnTogglePrecos, conteudoPrecos);
    });
    btnToggleFinanceiroNovo?.addEventListener("click",()=>alternarSecaoFinanceiro(btnToggleFinanceiroNovo,conteudoFinanceiroNovo));

    btnSalvarFinanceiro?.addEventListener("click", salvarFinanceiroMembro);
    modalFinanceiro?.addEventListener("click", (event) => {
        if (event.target === modalFinanceiro) fecharFinanceiroMembro();
    });

    btnCancelarStatusMembro?.addEventListener("click", () => fecharConfirmacaoStatus());
    btnConfirmarStatusMembro?.addEventListener("click", confirmarAlteracaoStatus);
    modalStatusMembro?.addEventListener("click", (event) => {
        if (event.target === modalStatusMembro) fecharConfirmacaoStatus();
    });

    document.addEventListener("keydown", (event) => {
        if (event.key !== "Escape") return;
        if (modalStatusMembro?.classList.contains("active")) fecharConfirmacaoStatus();
    });

}

export async function abrirEquipe() {
    // v8.16: a navegação pode abrir a tela mesmo se o bootstrap foi interrompido.
    // Inicializamos de forma idempotente aqui para não deixar "Carregando equipe..." preso.
    if (!inicializado) initEquipe();
    await prepararEquipe();
}
