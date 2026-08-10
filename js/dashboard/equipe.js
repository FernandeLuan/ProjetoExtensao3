import { state } from "./state.js?v=7.4";
import {
    obterMembroAtual,
    listarMembrosEquipe,
    alterarStatusMembro,
    atualizarFinanceiroMembro
} from "./data/equipe-repository.js?v=8.4";
import { criarAcessoBarbeiro } from "./services/equipe-service.js?v=8.4";
import { obterServicos } from "./services/catalogo-service.js?v=7.4";
import { papelEhAdmin, usuarioEhAdmin } from "./permissoes.js?v=7.4";
import { converterParaNumero, formatarMoeda, aplicarMascaraMoedaInput } from "./utils/money.js?v=7.4";
import { mostrarErro, mostrarSucesso } from "./services/feedback-service.js?v=7.4";

let inicializado = false;
let carregando = false;
let ultimoAcessoCriado = null;
let membroFinanceiroAtual = null;

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
const btnGerarSenha = document.getElementById("btnGerarSenhaTemporaria");
const btnCriarAcesso = document.getElementById("btnCriarAcessoBarbeiro");
const cadastroStatus = document.getElementById("cadastroBarbeiroStatus");

const modalAcessoCriado = document.getElementById("modalAcessoCriado");
const acessoCriadoNome = document.getElementById("acessoCriadoNome");
const acessoCriadoEmail = document.getElementById("acessoCriadoEmail");
const acessoCriadoSenha = document.getElementById("acessoCriadoSenha");
const btnCopiarAcesso = document.getElementById("btnCopiarAcesso");
const btnCompartilharAcesso = document.getElementById("btnCompartilharAcesso");
const btnFecharAcessoCriado = document.getElementById("btnFecharAcessoCriado");

const modalFinanceiro = document.getElementById("modalFinanceiroMembro");
const tituloFinanceiro = document.getElementById("tituloFinanceiroMembro");
const btnFecharFinanceiro = document.getElementById("btnFecharFinanceiroMembro");
const btnCancelarFinanceiro = document.getElementById("btnCancelarFinanceiroMembro");
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

function membroEhDono(membro) {
    if (membro?.dono === true) return true;

    const uid = String(membro?.uid || membro?.id || "").trim();
    const ambienteTeste = String(state.workspaceId || "").startsWith("teste-");

    return ambienteTeste
        && uid === state.user?.uid
        && state.membroAtual?.papel === "admin";
}

function taxaAtual(membro, campo) { const numero = Number(membro?.[campo]); return Number.isFinite(numero) ? numero : 0; }

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

function obterInicial(membro) {
    return obterNomeMembro(membro).trim().charAt(0).toUpperCase() || "U";
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

function gerarSenhaTemporaria() {
    const maiusculas = "ABCDEFGHJKLMNPQRSTUVWXYZ";
    const minusculas = "abcdefghijkmnopqrstuvwxyz";
    const numeros = "23456789";
    const simbolos = "!@#$%";
    const todos = maiusculas + minusculas + numeros + simbolos;

    const escolher = (conjunto) => {
        const array = new Uint32Array(1);
        crypto.getRandomValues(array);
        return conjunto[array[0] % conjunto.length];
    };

    const caracteres = [
        escolher(maiusculas),
        escolher(minusculas),
        escolher(numeros),
        escolher(simbolos)
    ];

    while (caracteres.length < 12) caracteres.push(escolher(todos));

    for (let i = caracteres.length - 1; i > 0; i -= 1) {
        const array = new Uint32Array(1);
        crypto.getRandomValues(array);
        const j = array[0] % (i + 1);
        [caracteres[i], caracteres[j]] = [caracteres[j], caracteres[i]];
    }

    return caracteres.join("");
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
    if (acessoCriadoNome) acessoCriadoNome.textContent = acesso.nome;
    if (acessoCriadoEmail) acessoCriadoEmail.textContent = acesso.email;
    if (acessoCriadoSenha) acessoCriadoSenha.textContent = acesso.senhaTemporaria;

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
        case "auth/email-already-in-use": return "Este e-mail já possui uma conta cadastrada.";
        case "auth/invalid-email": return "Informe um e-mail válido.";
        case "auth/weak-password": return "A senha temporária não atende aos requisitos mínimos.";
        case "permission-denied":
        case "firestore/permission-denied": return "As regras do Firestore ainda não permitem criar este acesso.";
        default: return error?.message || "Não foi possível criar o acesso.";
    }
}

async function criarNovoBarbeiro(event) {
    event.preventDefault();
    setCadastroStatus();

    const nome = String(inputNomeBarbeiro?.value || "").trim();
    const email = String(inputEmailBarbeiro?.value || "").trim().toLowerCase();
    const senhaTemporaria = String(inputSenhaTemporaria?.value || "");
    const taxaDebitoPct=converterParaNumero(inputNovoTaxaDebito?.value);
    const taxaCreditoPct=converterParaNumero(inputNovoTaxaCredito?.value);
    const repassePct=converterParaNumero(inputNovoRepasse?.value);

    if (nome.length < 2) {
        setCadastroStatus("Informe o nome do barbeiro.", true);
        inputNomeBarbeiro?.focus();
        return;
    }
    if (!email || !email.includes("@")) {
        setCadastroStatus("Informe um e-mail válido.", true);
        inputEmailBarbeiro?.focus();
        return;
    }
    if (senhaTemporaria.length < 6) {
        setCadastroStatus("Gere uma senha temporária válida.", true);
        return;
    }
    if(!Number.isFinite(taxaDebitoPct)||taxaDebitoPct<0||taxaDebitoPct>=10){definirSecaoFinanceiro(btnToggleFinanceiroNovo,conteudoFinanceiroNovo,true);setCadastroStatus("Informe a taxa de débito entre 0,00% e 9,99%.",true);inputNovoTaxaDebito?.focus();return;}
    if(!Number.isFinite(taxaCreditoPct)||taxaCreditoPct<0||taxaCreditoPct>=10){definirSecaoFinanceiro(btnToggleFinanceiroNovo,conteudoFinanceiroNovo,true);setCadastroStatus("Informe a taxa de crédito entre 0,00% e 9,99%.",true);inputNovoTaxaCredito?.focus();return;}
    if(!Number.isFinite(repassePct)||repassePct<0||repassePct>99.99){definirSecaoFinanceiro(btnToggleFinanceiroNovo,conteudoFinanceiroNovo,true);setCadastroStatus("Informe o repasse entre 0,00% e 99,99%.",true);inputNovoRepasse?.focus();return;}

    if (btnCriarAcesso) {
        btnCriarAcesso.disabled = true;
        btnCriarAcesso.textContent = "Criando acesso...";
    }

    try {
        const acesso = await criarAcessoBarbeiro({ nome, email, senhaTemporaria, taxaDebitoPct, taxaCreditoPct, repassePct });
        modalAdicionar.hidden = true;
        document.body.classList.remove("modal-equipe-aberto");
        await carregarEquipe();
        abrirModalAcessoCriado(acesso);
    } catch (error) {
        console.error("Erro ao criar barbeiro:", error);
        setCadastroStatus(traduzirErroCadastro(error), true);
    } finally {
        if (btnCriarAcesso) {
            btnCriarAcesso.disabled = false;
            btnCriarAcesso.textContent = "Criar acesso";
        }
    }
}

function formatarPercentualInput(valor) {
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

function abrirFinanceiroMembro(membro){
 if(!modalFinanceiro||!usuarioEhAdmin())return;membroFinanceiroAtual=membro;setFinanceiroStatus();definirSecaoFinanceiro(btnToggleTaxas,conteudoTaxas,false);definirSecaoFinanceiro(btnTogglePrecos,conteudoPrecos,false);
 const dono=membroEhDono(membro),debito=taxaAtual(membro,"taxaDebitoPct"),credito=taxaAtual(membro,"taxaCreditoPct"),repasse=dono?0:Number(membro.repassePct??0);
 if(tituloFinanceiro)tituloFinanceiro.textContent=obterNomeMembro(membro);
 if(inputTaxaDebito){inputTaxaDebito.value=formatarPercentualInput(debito);inputTaxaDebito.classList.add("hidden");}
 if(inputTaxaCredito){inputTaxaCredito.value=formatarPercentualInput(credito);inputTaxaCredito.classList.add("hidden");}
 if(inputRepasse){inputRepasse.value=formatarPercentualInput(repasse);inputRepasse.classList.add("hidden");}
 if(lblTaxaDebito)lblTaxaDebito.textContent=`Atual: ${formatarPercentualInput(debito)}%`;
 if(lblTaxaCredito)lblTaxaCredito.textContent=`Atual: ${formatarPercentualInput(credito)}%`;
 if(lblRepasse)lblRepasse.textContent=dono?"Atual: Sem repasse":`Atual: ${formatarPercentualInput(repasse)}%`;
 btnEditarTaxaDebito?.classList.remove("hidden");btnEditarTaxaCredito?.classList.remove("hidden");if(btnEditarRepasse)btnEditarRepasse.classList.toggle("hidden",dono);
 if(precosLista){precosLista.innerHTML="";obterServicos().forEach(servico=>{const row=document.createElement("div");row.className="config-item equipe-config-item equipe-preco-item";if(servico.ativo===false)row.classList.add("desativado");const left=document.createElement("div");left.className="config-item-left";const icon=document.createElement("div");icon.className="config-icon";icon.innerHTML='<i class="fas fa-scissors"></i>';const info=document.createElement("div");info.className="config-info";const nome=document.createElement("span");nome.className="config-nome";nome.textContent=servico.nome;const atualLabel=document.createElement("span");atualLabel.className="config-atual";const personalizado=Number(membro.precosPersonalizados?.[servico.id]);const tem=Number.isFinite(personalizado)&&personalizado>0;const valor=tem?personalizado:Number(servico.preco||0);atualLabel.textContent=`Atual: R$ ${formatarMoeda(valor)}`;info.append(nome,atualLabel);left.append(icon,info);const action=document.createElement("div");action.className="config-action";const alterar=document.createElement("button");alterar.type="button";alterar.className="btn-alterar";alterar.innerHTML='<i class="fas fa-pen"></i> Alterar';const editor=document.createElement("div");editor.className="equipe-price-editor hidden";const input=document.createElement("input");input.className="input-config";input.type="tel";input.inputMode="numeric";input.placeholder="0,00";input.dataset.servicoId=servico.id;input.dataset.precoPadrao=String(Number(servico.preco||0));input.dataset.touched="false";input.value="";input.addEventListener("input",()=>{input.dataset.touched="true";aplicarMascaraMoedaInput(input,7);});alterar.addEventListener("click",()=>{alterar.classList.add("hidden");editor.classList.remove("hidden");input.value="";input.dataset.touched="false";input.focus();});editor.append(input);action.append(alterar,editor);row.append(left,action);precosLista.appendChild(row);});}
 modalFinanceiro.hidden=false;document.body.classList.add("modal-equipe-aberto");
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
    const repasse = dono ? 0 : converterParaNumero(inputRepasse?.value);
    const taxaDebitoPct = converterParaNumero(inputTaxaDebito?.value);
    const taxaCreditoPct = converterParaNumero(inputTaxaCredito?.value);

    if (!Number.isFinite(taxaDebitoPct) || taxaDebitoPct < 0 || taxaDebitoPct >= 10) {
        setFinanceiroStatus("Informe a taxa de débito entre 0,00% e 9,99%.", true);
        return;
    }

    if (!Number.isFinite(taxaCreditoPct) || taxaCreditoPct < 0 || taxaCreditoPct >= 10) {
        setFinanceiroStatus("Informe a taxa de crédito entre 0,00% e 9,99%.", true);
        return;
    }

    if (!Number.isFinite(repasse) || repasse < 0 || repasse > 99.99) {
        setFinanceiroStatus("Informe um repasse entre 0,00% e 99,99%.", true);
        return;
    }

    const precosPersonalizados = {};
    Object.entries(membroFinanceiroAtual.precosPersonalizados || {}).forEach(([servicoId, valor]) => {
        const numero = Number(valor);
        if (Number.isFinite(numero) && numero > 0) precosPersonalizados[servicoId] = numero;
    });

    precosLista?.querySelectorAll("input[data-servico-id]").forEach((input) => {
        if (input.dataset.touched !== "true") return;
        const numero = converterParaNumero(input.value);
        if (Number.isFinite(numero) && numero > 0) {
            precosPersonalizados[input.dataset.servicoId] = numero;
        } else {
            delete precosPersonalizados[input.dataset.servicoId];
        }
    });

    if (btnSalvarFinanceiro) {
        btnSalvarFinanceiro.disabled = true;
        btnSalvarFinanceiro.textContent = "Salvando...";
    }

    try {
        await atualizarFinanceiroMembro(
            membroFinanceiroAtual.uid || membroFinanceiroAtual.id,
            {
                repassePct: repasse,
                taxaDebitoPct,
                taxaCreditoPct,
                precosPersonalizados
            }
        );
        // Mantém o usuário na mesma tela após salvar e atualiza os valores exibidos.
        membroFinanceiroAtual = {
            ...membroFinanceiroAtual,
            repassePct: repasse,
            taxaDebitoPct,
            taxaCreditoPct,
            precosPersonalizados: { ...precosPersonalizados }
        };

        if (lblTaxaDebito) lblTaxaDebito.textContent = `Atual: ${formatarPercentualInput(taxaDebitoPct)}%`;
        if (lblTaxaCredito) lblTaxaCredito.textContent = `Atual: ${formatarPercentualInput(taxaCreditoPct)}%`;
        if (lblRepasse) lblRepasse.textContent = dono ? "Atual: Sem repasse" : `Atual: ${formatarPercentualInput(repasse)}%`;

        [
            [btnEditarTaxaDebito, inputTaxaDebito],
            [btnEditarTaxaCredito, inputTaxaCredito],
            [btnEditarRepasse, inputRepasse]
        ].forEach(([botao, input]) => {
            input?.classList.add("hidden");
            if (botao && !(botao === btnEditarRepasse && dono)) botao.classList.remove("hidden");
        });

        const servicosPorId = new Map(obterServicos().map((servico) => [String(servico.id), servico]));
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

        mostrarSucesso("Configurações do profissional salvas.");
        // Atualiza os cards ao fundo, mas não fecha o modal nem muda de tela.
        await carregarEquipe();
    } catch (error) {
        console.error("Erro ao salvar financeiro do profissional:", error);
        setFinanceiroStatus(error?.message || "Não foi possível salvar.", true);
    } finally {
        if (btnSalvarFinanceiro) {
            btnSalvarFinanceiro.disabled = false;
            btnSalvarFinanceiro.textContent = "Salvar";
        }
    }
}

async function executarAlteracaoStatus(membro, botao) {
    const estaAtivo = membro.ativo === true;
    const novoStatus = !estaAtivo;
    const nome = obterNomeMembro(membro);

    const confirmar = window.confirm(
        novoStatus
            ? `Reativar o acesso de ${nome}?`
            : `Desativar o acesso de ${nome}? Essa pessoa deixará de acessar os dados da barbearia.`
    );
    if (!confirmar) return;

    if (botao) {
        botao.disabled = true;
        botao.textContent = novoStatus ? "Reativando..." : "Desativando...";
    }

    try {
        await alterarStatusMembro(membro.uid || membro.id, novoStatus);
        mostrarSucesso(novoStatus ? "Acesso reativado." : "Acesso desativado.");
        await carregarEquipe();
    } catch (error) {
        console.error("Erro ao alterar status do membro:", error);
        mostrarErro(error.message || "Não foi possível alterar o acesso.");
    } finally {
        if (botao) botao.disabled = false;
    }
}

function criarCardMembro(membro) {
    const ativo = membro.ativo === true;
    const admin = papelEhAdmin(membro.papel);

    const card = document.createElement("article");
    card.className = "equipe-card";
    if (!ativo) card.classList.add("desativado");

    const topo = document.createElement("div");
    topo.className = "equipe-card-topo";
    const avatar = document.createElement("div");
    avatar.className = "equipe-avatar";
    avatar.textContent = obterInicial(membro);
    const dados = document.createElement("div");
    dados.className = "equipe-dados";
    const nome = document.createElement("strong");
    nome.className = "equipe-nome";
    nome.textContent = obterNomeMembro(membro);
    const email = document.createElement("span");
    email.className = "equipe-email";
    email.textContent = membro.email || "—";
    dados.append(nome, email);
    topo.append(avatar, dados);

    const meta = document.createElement("div");
    meta.className = "equipe-meta";

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
    meta.append(perfil, status);

    card.append(topo, meta);

    const resumoFinanceiro = document.createElement("div");
    resumoFinanceiro.className = "equipe-financeiro-resumo";
    const dono = membroEhDono(membro);
    const repasse = dono ? 0 : Number(membro.repassePct ?? 0);
    const debito = taxaAtual(membro, "taxaDebitoPct");
    const credito = taxaAtual(membro, "taxaCreditoPct");
    const overrides = Object.keys(membro.precosPersonalizados || {}).length;
    resumoFinanceiro.innerHTML = [
        `<span>Repasse <strong>${dono ? "Sem repasse" : `${repasse.toFixed(2).replace(".", ",")}%`}</strong></span>`,
        `<span>Débito <strong>${debito.toFixed(2).replace(".", ",")}%</strong></span>`,
        `<span>Crédito <strong>${credito.toFixed(2).replace(".", ",")}%</strong></span>`,
        `<span>Preços próprios <strong>${overrides || "Nenhum"}</strong></span>`
    ].join("");
    card.appendChild(resumoFinanceiro);

    const acoes = document.createElement("div");
    acoes.className = "equipe-card-acoes";

    const configurar = document.createElement("button");
    configurar.type = "button";
    configurar.className = "equipe-action-btn configurar";
    configurar.innerHTML = '<i class="fas fa-sliders"></i><span>Financeiro</span>';
    configurar.addEventListener("click", () => abrirFinanceiroMembro(membro));
    acoes.appendChild(configurar);

    if (!admin) {
        const botao = document.createElement("button");
        botao.type = "button";
        botao.className = ativo ? "equipe-action-btn desativar" : "equipe-action-btn reativar";
        botao.innerHTML = ativo
            ? '<i class="fas fa-user-slash"></i><span>Desativar</span>'
            : '<i class="fas fa-user-check"></i><span>Reativar</span>';
        botao.addEventListener("click", () => executarAlteracaoStatus(membro, botao));
        acoes.appendChild(botao);
    }

    card.appendChild(acoes);
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
        const ativos = ordenarMembros(membros.filter((membro) => membro.ativo === true));
        const inativos = ordenarMembros(membros.filter((membro) => membro.ativo !== true));

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
    btnGerarSenha?.addEventListener("click", preencherNovaSenha);
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

    inputRepasse?.addEventListener("input", () => aplicarMascaraPercentual(inputRepasse, 2));
    inputTaxaDebito?.addEventListener("input", () => aplicarMascaraPercentual(inputTaxaDebito, 1));
    inputTaxaCredito?.addEventListener("input", () => aplicarMascaraPercentual(inputTaxaCredito, 1));
    inputNovoTaxaDebito?.addEventListener("input",()=>aplicarMascaraPercentual(inputNovoTaxaDebito,1));
    inputNovoTaxaCredito?.addEventListener("input",()=>aplicarMascaraPercentual(inputNovoTaxaCredito,1));
    inputNovoRepasse?.addEventListener("input",()=>aplicarMascaraPercentual(inputNovoRepasse,2));
    btnEditarTaxaDebito?.addEventListener("click",()=>mostrarEditorFinanceiro(btnEditarTaxaDebito,inputTaxaDebito,converterParaNumero(inputTaxaDebito?.value)));
    btnEditarTaxaCredito?.addEventListener("click",()=>mostrarEditorFinanceiro(btnEditarTaxaCredito,inputTaxaCredito,converterParaNumero(inputTaxaCredito?.value)));
    btnEditarRepasse?.addEventListener("click",()=>mostrarEditorFinanceiro(btnEditarRepasse,inputRepasse,converterParaNumero(inputRepasse?.value)));
    btnFecharFinanceiro?.addEventListener("click", fecharFinanceiroMembro);
    btnCancelarFinanceiro?.addEventListener("click", fecharFinanceiroMembro);

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

}

export async function abrirEquipe() {
    if (!inicializado) return;
    await prepararEquipe();
}
