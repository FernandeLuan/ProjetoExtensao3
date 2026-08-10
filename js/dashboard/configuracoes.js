import { APP_VERSION, PAGAMENTOS } from "./constants.js?v=8.30";
import { state, definirConfiguracoes, onStateChange } from "./state.js?v=8.30";
import { salvarConfiguracoes } from "./data/configuracoes-repository.js?v=8.30";
import { converterParaNumero, formatarMoeda, aplicarMascaraMoedaInput } from "./utils/money.js?v=8.30";
import { mostrarErro, mostrarSucesso } from "./services/feedback-service.js?v=8.30";

let inicializado = false;

const configGroupToggles = document.querySelectorAll(".config-group-toggle");
const pagamentoPadraoButtons = document.querySelectorAll("[data-pagamento-padrao]");
const pagamentoPadraoStatus = document.getElementById("pagamentoPadraoStatus");
const servicosLista = document.getElementById("configServicosLista");
const paymentList = document.getElementById("configPaymentList");
const btnNovoServico = document.getElementById("btnNovoServico");
const novoServicoForm = document.getElementById("novoServicoForm");
const novoServicoNome = document.getElementById("novoServicoNome");
const novoServicoPreco = document.getElementById("novoServicoPreco");
const btnCancelarNovoServico = document.getElementById("btnCancelarNovoServico");
const btnSalvarNovoServico = document.getElementById("btnSalvarNovoServico");
const servicosStatus = document.getElementById("servicosStatus");
const modalConfirmServico = document.getElementById("modalConfirmServico");
const modalDescricaoServico = document.getElementById("modalDescricaoServico");
const btnCancelarServico = document.getElementById("btnCancelarServico");
const btnConfirmarServico = document.getElementById("btnConfirmarServico");
let servicoParaExcluir = null;

const comissaoProdutosAtual = document.getElementById("configComissaoProdutosAtual");
const btnEditarComissaoProdutos = document.getElementById("btnEditarComissaoProdutos");
const comissaoProdutosEditor = document.getElementById("configComissaoProdutosEditor");
const comissaoProdutosInput = document.getElementById("configComissaoProdutosInput");
const btnCancelarComissaoProdutos = document.getElementById("btnCancelarComissaoProdutos");
const btnSalvarComissaoProdutos = document.getElementById("btnSalvarComissaoProdutos");
const comissaoProdutosStatus = document.getElementById("configComissaoProdutosStatus");

const ordemCardsLista = document.getElementById("configOrdemCardsLista");
const btnRestaurarOrdemCards = document.getElementById("btnRestaurarOrdemCards");
const ordemCardsStatus = document.getElementById("ordemCardsStatus");
const ORDEM_CARDS_PADRAO = ["resumo", "indicadores", "despesas", "servico"];
const CARDS_VISAO = {
    resumo: { nome: "Resumo financeiro", detalhe: "Lucro líquido + faturamento", icone: "fa-wallet" },
    indicadores: { nome: "Indicadores", detalhe: "Ticket médio + atendimentos", icone: "fa-chart-simple" },
    despesas: { nome: "Despesa da barbearia", detalhe: "Gastos administrativos do dia", icone: "fa-receipt" },
    servico: { nome: "Serviço mais vendido", detalhe: "Destaque de vendas do dia", icone: "fa-star" }
};

const ordemNavLista = document.getElementById("configOrdemNavLista");
const btnRestaurarOrdemNav = document.getElementById("btnRestaurarOrdemNav");
const ordemNavStatus = document.getElementById("ordemNavStatus");
const ORDEM_NAV_PADRAO = [
    "barbeariaHome",
    "historico",
    "equipe",
    "relatorios",
    "estoque",
    "despesas",
    "configuracoes",
    "conta"
];
const NAV_BARBEARIA = {
    barbeariaHome: { nome: "Visão geral", detalhe: "Resumo da barbearia", icone: "fa-store" },
    historico: { nome: "Histórico", detalhe: "Atendimentos registrados", icone: "fa-clock-rotate-left" },
    equipe: { nome: "Equipe", detalhe: "Profissionais e acessos", icone: "fa-users" },
    relatorios: { nome: "Relatório", detalhe: "Indicadores e períodos", icone: "fa-file-lines" },
    estoque: { nome: "Estoque", detalhe: "Produtos, vendas e movimentações", icone: "fa-boxes-stacked" },
    despesas: { nome: "Despesas", detalhe: "Gastos da barbearia", icone: "fa-receipt" },
    configuracoes: { nome: "Configurações", detalhe: "Preferências administrativas", icone: "fa-sliders-h" },
    conta: { nome: "Minha conta", detalhe: "Acesso e segurança", icone: "fa-user-lock" }
};


function gerarIdServico(nome) {
    const slug = String(nome || "servico")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 32) || "servico";
    return `${slug}-${Date.now().toString(36)}`;
}

function fecharGrupo(botao) {
    if (!botao) return;
    const id = botao.getAttribute("aria-controls");
    const conteudo = id ? document.getElementById(id) : null;
    botao.setAttribute("aria-expanded", "false");
    if (conteudo) conteudo.hidden = true;
}

function fecharOutrosGruposConfig(excecao = null) {
    configGroupToggles.forEach((botao) => {
        if (botao !== excecao) fecharGrupo(botao);
    });
}

function fecharVersoesAtualizacao() {
    document.querySelectorAll(".update-version-toggle").forEach((botao) => {
        botao.setAttribute("aria-expanded", "false");
        const id = botao.getAttribute("aria-controls");
        const detalhe = id ? document.getElementById(id) : null;
        if (detalhe) detalhe.hidden = true;
    });
}

function setStatus(elemento, texto, erro = false) {
    if (!elemento) return;
    elemento.textContent = texto || "";
    elemento.classList.toggle("error", erro);
}

function dispararErroVisualInput(elemento) {
    if (!elemento) return;
    elemento.classList.remove("shake");
    void elemento.offsetWidth;
    elemento.classList.add("input-erro", "shake");
    setTimeout(() => elemento.classList.remove("shake"), 500);
    setTimeout(() => elemento.classList.remove("input-erro"), 3000);
}

function limparErroNovoServico() {
    novoServicoNome?.classList.remove("input-erro", "shake");
    novoServicoPreco?.closest(".config-money-field")?.classList.remove("input-erro", "shake");
}

async function persistirConfig(novaConfig, mensagem = "Configuração salva.") {
    await salvarConfiguracoes(novaConfig);
    definirConfiguracoes(novaConfig);
    mostrarSucesso(mensagem);
}

function fecharModalExclusaoServico() {
    modalConfirmServico?.classList.remove("active");
    modalConfirmServico?.setAttribute("aria-hidden", "true");
    servicoParaExcluir = null;
}

function abrirModalExclusaoServico(servico) {
    servicoParaExcluir = servico;
    if (modalDescricaoServico) {
        modalDescricaoServico.textContent = `Excluir “${servico.nome}” do catálogo? Os atendimentos já registrados continuam no histórico.`;
    }
    modalConfirmServico?.classList.add("active");
    modalConfirmServico?.setAttribute("aria-hidden", "false");
}

async function confirmarExclusaoServico() {
    if (!servicoParaExcluir) return;
    const servico = servicoParaExcluir;

    if (btnConfirmarServico) {
        btnConfirmarServico.disabled = true;
        btnConfirmarServico.textContent = "Excluindo...";
    }

    try {
        const servicos = (state.configSistema.servicos || []).filter((item) => item.id !== servico.id);
        await persistirConfig({ ...state.configSistema, servicos }, "Serviço excluído.");
    } catch (error) {
        console.error(error);
        mostrarErro("Não foi possível excluir o serviço.");
    } finally {
        if (btnConfirmarServico) {
            btnConfirmarServico.disabled = false;
            btnConfirmarServico.textContent = "Excluir";
        }
        fecharModalExclusaoServico();
    }
}

function renderizarServicos() {
    if (!servicosLista) return;
    servicosLista.innerHTML = "";

    (state.configSistema.servicos || []).forEach((servico) => {
        const row = document.createElement("article");
        row.className = `config-service-row${servico.ativo === false ? " desativado" : ""}`;

        const main = document.createElement("div");
        main.className = "config-service-main";
        const nome = document.createElement("strong");
        nome.textContent = servico.nome;
        const preco = document.createElement("span");
        preco.textContent = `Padrão: R$ ${formatarMoeda(servico.preco)}`;
        main.append(nome, preco);

        const actions = document.createElement("div");
        actions.className = "config-service-actions";

        const toggle = document.createElement("button");
        toggle.type = "button";
        toggle.className = `config-mini-switch${servico.ativo !== false ? " ativo" : ""}`;
        toggle.textContent = servico.ativo !== false ? "Habilitado" : "Desabilitado";
        toggle.addEventListener("click", async () => {
            toggle.disabled = true;
            try {
                const servicos = state.configSistema.servicos.map((item) => item.id === servico.id ? { ...item, ativo: item.ativo === false } : { ...item });
                await persistirConfig({ ...state.configSistema, servicos }, servico.ativo === false ? "Serviço habilitado." : "Serviço desabilitado.");
            } catch (error) {
                console.error(error);
                mostrarErro("Não foi possível alterar o serviço.");
            } finally {
                toggle.disabled = false;
            }
        });

        const editar = document.createElement("button");
        editar.type = "button";
        editar.setAttribute("aria-label", `Editar ${servico.nome}`);
        editar.innerHTML = '<i class="fas fa-pen"></i>';

        actions.append(toggle, editar);
        row.append(main, actions);

        editar.addEventListener("click", () => {
            if (row.querySelector(".config-service-edit")) return;

            const editor = document.createElement("div");
            editor.className = "config-service-edit";
            const inputNome = document.createElement("input");
            inputNome.value = servico.nome;
            inputNome.maxLength = 60;
            const inputPreco = document.createElement("input");
            inputPreco.type = "tel";
            inputPreco.inputMode = "numeric";
            inputPreco.value = Number(servico.preco || 0).toFixed(2).replace(".", ",");
            inputPreco.addEventListener("input", () => aplicarMascaraMoedaInput(inputPreco, 8));

            const editorActions = document.createElement("div");
            editorActions.className = "config-service-edit-actions";
            const excluir = document.createElement("button");
            excluir.type = "button";
            excluir.className = "config-service-delete";
            excluir.innerHTML = '<i class="fas fa-trash"></i> Excluir';
            const cancelar = document.createElement("button");
            cancelar.type = "button";
            cancelar.textContent = "Cancelar";
            const salvar = document.createElement("button");
            salvar.type = "button";
            salvar.textContent = "Salvar";
            editorActions.append(excluir, cancelar, salvar);
            editor.append(inputNome, inputPreco, editorActions);
            row.appendChild(editor);
            inputNome.focus();

            excluir.addEventListener("click", (event) => {
                event.stopPropagation();
                abrirModalExclusaoServico(servico);
            });
            cancelar.addEventListener("click", (event) => {
                event.stopPropagation();
                editor.remove();
            });
            salvar.addEventListener("click", async () => {
                const novoNome = inputNome.value.trim().slice(0, 60);
                const novoPreco = converterParaNumero(inputPreco.value) || 0;
                if (novoNome.length < 2 || novoPreco <= 0) {
                    mostrarErro("Informe nome e preço válidos.");
                    return;
                }
                salvar.disabled = true;
                try {
                    const servicos = state.configSistema.servicos.map((item) => item.id === servico.id ? { ...item, nome: novoNome, preco: novoPreco } : { ...item });
                    await persistirConfig({ ...state.configSistema, servicos }, "Serviço atualizado.");
                } catch (error) {
                    console.error(error);
                    mostrarErro("Não foi possível atualizar o serviço.");
                } finally {
                    salvar.disabled = false;
                }
            });
        });

        servicosLista.appendChild(row);
    });
}

function renderizarPagamentos() {
    if (paymentList) {
        paymentList.innerHTML = "";
        PAGAMENTOS.forEach((pagamento) => {
            const ativo = state.configSistema.pagamentosAtivos?.[pagamento] !== false;
            const row = document.createElement("div");
            row.className = `config-payment-row${ativo ? "" : " desativado"}`;
            const info = document.createElement("div");
            const nome = document.createElement("strong");
            nome.textContent = pagamento;
            const detalhe = document.createElement("span");
            detalhe.textContent = ativo ? "Disponível no Registrar" : "Oculto no Registrar";
            info.append(nome, detalhe);

            const toggle = document.createElement("button");
            toggle.type = "button";
            toggle.className = `config-mini-switch${ativo ? " ativo" : ""}`;
            toggle.textContent = ativo ? "Habilitado" : "Desabilitado";
            toggle.addEventListener("click", async () => {
                const novoAtivo = !ativo;
                const pagamentosAtivos = { ...state.configSistema.pagamentosAtivos, [pagamento]: novoAtivo };
                let pagamentoPadrao = state.configSistema.pagamentoPadrao;
                if (!novoAtivo && pagamentoPadrao === pagamento) pagamentoPadrao = "nenhum";
                toggle.disabled = true;
                try {
                    await persistirConfig({ ...state.configSistema, pagamentosAtivos, pagamentoPadrao }, `${pagamento} ${novoAtivo ? "habilitado" : "desabilitado"}.`);
                } catch (error) {
                    console.error(error);
                    mostrarErro("Não foi possível alterar a forma de pagamento.");
                } finally {
                    toggle.disabled = false;
                }
            });

            row.append(info, toggle);
            paymentList.appendChild(row);
        });
    }

    const atual = PAGAMENTOS.includes(state.configSistema.pagamentoPadrao) ? state.configSistema.pagamentoPadrao : "nenhum";
    pagamentoPadraoButtons.forEach((botao) => {
        const valor = botao.dataset.pagamentoPadrao;
        const disponivel = valor === "nenhum" || state.configSistema.pagamentosAtivos?.[valor] !== false;
        botao.hidden = !disponivel;
        const selecionado = valor === atual;
        botao.classList.toggle("active", selecionado);
        botao.setAttribute("aria-pressed", String(selecionado));
    });
}

function normalizarOrdemCards(ordem = state.configSistema?.ordemCardsVisaoGeral) {
    const validos = Array.isArray(ordem)
        ? ordem.filter((chave, indice, lista) => ORDEM_CARDS_PADRAO.includes(chave) && lista.indexOf(chave) === indice)
        : [];
    ORDEM_CARDS_PADRAO.forEach((chave) => {
        if (!validos.includes(chave)) validos.push(chave);
    });
    return validos;
}

async function salvarOrdemCards(ordem, mensagem = "Ordem da Visão Geral atualizada.") {
    const novaOrdem = normalizarOrdemCards(ordem);
    if (ordemCardsStatus) setStatus(ordemCardsStatus, "Salvando...");
    try {
        await persistirConfig({ ...state.configSistema, ordemCardsVisaoGeral: novaOrdem }, mensagem);
        if (ordemCardsStatus) {
            setStatus(ordemCardsStatus, "Ordem salva ✓");
            setTimeout(() => setStatus(ordemCardsStatus, ""), 1800);
        }
    } catch (error) {
        console.error(error);
        if (ordemCardsStatus) setStatus(ordemCardsStatus, "Não foi possível salvar.", true);
    }
}

function renderizarOrdemCards() {
    if (!ordemCardsLista) return;
    const ordem = normalizarOrdemCards();
    ordemCardsLista.innerHTML = "";

    ordem.forEach((chave, indice) => {
        const meta = CARDS_VISAO[chave];
        const item = document.createElement("div");
        item.className = "config-order-item";
        item.innerHTML = `
            <span class="config-order-icon"><i class="fas ${meta.icone}"></i></span>
            <span class="config-order-copy"><strong>${meta.nome}</strong><span>${meta.detalhe}</span></span>
            <span class="config-order-actions">
                <button type="button" data-order-up aria-label="Mover ${meta.nome} para cima" ${indice === 0 ? "disabled" : ""}><i class="fas fa-chevron-up"></i></button>
                <button type="button" data-order-down aria-label="Mover ${meta.nome} para baixo" ${indice === ordem.length - 1 ? "disabled" : ""}><i class="fas fa-chevron-down"></i></button>
            </span>`;

        item.querySelector("[data-order-up]")?.addEventListener("click", async () => {
            if (indice <= 0) return;
            const nova = [...ordem];
            [nova[indice - 1], nova[indice]] = [nova[indice], nova[indice - 1]];
            await salvarOrdemCards(nova);
        });
        item.querySelector("[data-order-down]")?.addEventListener("click", async () => {
            if (indice >= ordem.length - 1) return;
            const nova = [...ordem];
            [nova[indice + 1], nova[indice]] = [nova[indice], nova[indice + 1]];
            await salvarOrdemCards(nova);
        });
        ordemCardsLista.appendChild(item);
    });
}

function normalizarOrdemNav(ordem = state.configSistema?.ordemNavBarbearia) {
    const validos = Array.isArray(ordem)
        ? ordem.filter((chave, indice, lista) => ORDEM_NAV_PADRAO.includes(chave) && lista.indexOf(chave) === indice)
        : [];
    ORDEM_NAV_PADRAO.forEach((chave) => {
        if (!validos.includes(chave)) validos.push(chave);
    });
    return validos.slice(0, ORDEM_NAV_PADRAO.length);
}

async function salvarOrdemNav(ordem, mensagem = "Ordem da navegação atualizada.") {
    const novaOrdem = normalizarOrdemNav(ordem);
    if (ordemNavStatus) setStatus(ordemNavStatus, "Salvando...");
    try {
        await persistirConfig({ ...state.configSistema, ordemNavBarbearia: novaOrdem }, mensagem);
        if (ordemNavStatus) {
            setStatus(ordemNavStatus, "Ordem salva ✓");
            setTimeout(() => setStatus(ordemNavStatus, ""), 1800);
        }
    } catch (error) {
        console.error(error);
        if (ordemNavStatus) setStatus(ordemNavStatus, "Não foi possível salvar.", true);
    }
}

function renderizarOrdemNav() {
    if (!ordemNavLista) return;
    const ordem = normalizarOrdemNav();
    ordemNavLista.innerHTML = "";

    ordem.forEach((chave, indice) => {
        const meta = NAV_BARBEARIA[chave];
        const item = document.createElement("div");
        item.className = "config-order-item";
        item.innerHTML = `
            <span class="config-order-icon"><i class="fas ${meta.icone}"></i></span>
            <span class="config-order-copy"><strong>${meta.nome}</strong><span>${indice < 4 ? "Barra inferior" : "Menu"} • ${meta.detalhe}</span></span>
            <span class="config-order-actions">
                <button type="button" data-nav-up aria-label="Mover ${meta.nome} para cima" ${indice === 0 ? "disabled" : ""}><i class="fas fa-chevron-up"></i></button>
                <button type="button" data-nav-down aria-label="Mover ${meta.nome} para baixo" ${indice === ordem.length - 1 ? "disabled" : ""}><i class="fas fa-chevron-down"></i></button>
            </span>`;

        item.querySelector("[data-nav-up]")?.addEventListener("click", async () => {
            if (indice <= 0) return;
            const nova = [...ordem];
            [nova[indice - 1], nova[indice]] = [nova[indice], nova[indice - 1]];
            await salvarOrdemNav(nova);
        });
        item.querySelector("[data-nav-down]")?.addEventListener("click", async () => {
            if (indice >= ordem.length - 1) return;
            const nova = [...ordem];
            [nova[indice + 1], nova[indice]] = [nova[indice], nova[indice + 1]];
            await salvarOrdemNav(nova);
        });

        ordemNavLista.appendChild(item);
    });
}

function renderizarComissaoProdutos() {
    const valor = Math.max(0, Math.min(100, Number(state.configSistema?.comissaoProdutosPct ?? 20)));
    if (comissaoProdutosAtual) comissaoProdutosAtual.textContent = `Atual: ${valor.toFixed(2).replace(".", ",")}%`;
    if (comissaoProdutosInput && comissaoProdutosEditor?.hidden !== false) {
        comissaoProdutosInput.value = valor.toFixed(2).replace(".", ",");
    }
}

function fecharEditorComissaoProdutos() {
    if (comissaoProdutosEditor) comissaoProdutosEditor.hidden = true;
    setStatus(comissaoProdutosStatus, "");
}

async function salvarComissaoProdutos() {
    const valor = converterParaNumero(comissaoProdutosInput?.value);
    if (valor === null || valor < 0 || valor > 100) {
        dispararErroVisualInput(comissaoProdutosInput);
        mostrarErro("Informe uma comissão entre 0,00% e 100,00%.");
        return;
    }
    btnSalvarComissaoProdutos.disabled = true;
    setStatus(comissaoProdutosStatus, "Salvando...");
    try {
        await persistirConfig({ ...state.configSistema, comissaoProdutosPct: Number(valor.toFixed(2)) }, "Comissão sobre produtos atualizada.");
        fecharEditorComissaoProdutos();
    } catch (error) {
        console.error(error);
        setStatus(comissaoProdutosStatus, "Não foi possível salvar.", true);
    } finally {
        btnSalvarComissaoProdutos.disabled = false;
    }
}

function renderizarTudo() {
    renderizarServicos();
    renderizarPagamentos();
    renderizarOrdemCards();
    renderizarOrdemNav();
    renderizarComissaoProdutos();
    const versao = document.getElementById("appVersion");
    if (versao) versao.textContent = `v${APP_VERSION}`;
}

async function adicionarServico() {
    limparErroNovoServico();

    const nome = String(novoServicoNome?.value || "").trim().slice(0, 60);
    const preco = converterParaNumero(novoServicoPreco?.value) || 0;
    const precoContainer = novoServicoPreco?.closest(".config-money-field");

    let invalido = false;
    if (nome.length < 2) {
        dispararErroVisualInput(novoServicoNome);
        invalido = true;
    }
    if (preco <= 0) {
        dispararErroVisualInput(precoContainer);
        invalido = true;
    }
    if (invalido) {
        mostrarErro("Informe nome e preço válidos.");
        return;
    }

    if (state.configSistema.servicos.some((servico) => servico.nome.toLowerCase() === nome.toLowerCase())) {
        dispararErroVisualInput(novoServicoNome);
        mostrarErro("Já existe um serviço com esse nome.");
        return;
    }

    btnSalvarNovoServico.disabled = true;
    try {
        const ordem = Math.max(0, ...state.configSistema.servicos.map((servico) => Number(servico.ordem || 0))) + 1;
        const servicos = [...state.configSistema.servicos, { id: gerarIdServico(nome), nome, preco, ativo: true, ordem }];
        await persistirConfig({ ...state.configSistema, servicos }, "Serviço adicionado.");
        novoServicoForm.hidden = true;
        novoServicoNome.value = "";
        novoServicoPreco.value = "";
        limparErroNovoServico();
    } catch (error) {
        console.error(error);
        mostrarErro("Não foi possível adicionar o serviço.");
    } finally {
        btnSalvarNovoServico.disabled = false;
    }
}

export function initConfiguracoes() {
    if (inicializado) return;
    inicializado = true;


    configGroupToggles.forEach((botao) => {
        botao.addEventListener("click", () => {
            const id = botao.getAttribute("aria-controls");
            const conteudo = id ? document.getElementById(id) : null;
            if (!conteudo) return;
            const abrir = botao.getAttribute("aria-expanded") !== "true";
            if (abrir) {
                fecharOutrosGruposConfig(botao);
                if (botao.dataset.configGroup === "sobre") fecharVersoesAtualizacao();
            }
            botao.setAttribute("aria-expanded", String(abrir));
            conteudo.hidden = !abrir;
        });
    });

    document.addEventListener("click", (event) => {
        const dentroDeGrupo = event.composedPath?.().some((node) => node?.classList?.contains?.("config-group"));
        if (!dentroDeGrupo) fecharOutrosGruposConfig();
    });

    document.querySelectorAll(".update-version-toggle").forEach((botao) => {
        botao.addEventListener("click", () => {
            const id = botao.getAttribute("aria-controls");
            const detalhe = id ? document.getElementById(id) : null;
            if (!detalhe) return;
            const abrir = botao.getAttribute("aria-expanded") !== "true";
            botao.setAttribute("aria-expanded", String(abrir));
            detalhe.hidden = !abrir;
        });
    });

    pagamentoPadraoButtons.forEach((botao) => {
        botao.addEventListener("click", async () => {
            const valor = botao.dataset.pagamentoPadrao || "nenhum";
            if (valor !== "nenhum" && state.configSistema.pagamentosAtivos?.[valor] === false) return;
            pagamentoPadraoButtons.forEach((item) => item.disabled = true);
            setStatus(pagamentoPadraoStatus, "Salvando...");
            try {
                await persistirConfig({ ...state.configSistema, pagamentoPadrao: valor }, "Pagamento padrão atualizado.");
                setStatus(pagamentoPadraoStatus, "Padrão salvo ✓");
                setTimeout(() => setStatus(pagamentoPadraoStatus, ""), 2200);
            } catch (error) {
                console.error(error);
                setStatus(pagamentoPadraoStatus, "Não foi possível salvar.", true);
            } finally {
                pagamentoPadraoButtons.forEach((item) => item.disabled = false);
            }
        });
    });

    btnNovoServico?.addEventListener("click", () => {
        limparErroNovoServico();
        novoServicoForm.hidden = false;
        novoServicoNome?.focus();
    });
    btnCancelarNovoServico?.addEventListener("click", () => {
        novoServicoForm.hidden = true;
        if (novoServicoNome) novoServicoNome.value = "";
        if (novoServicoPreco) novoServicoPreco.value = "";
        limparErroNovoServico();
        setStatus(servicosStatus, "");
    });
    novoServicoNome?.addEventListener("input", () => novoServicoNome.classList.remove("input-erro", "shake"));
    novoServicoPreco?.addEventListener("input", () => {
        novoServicoPreco.closest(".config-money-field")?.classList.remove("input-erro", "shake");
        aplicarMascaraMoedaInput(novoServicoPreco);
    });
    btnSalvarNovoServico?.addEventListener("click", adicionarServico);

    btnEditarComissaoProdutos?.addEventListener("click", () => {
        const valor = Math.max(0, Math.min(100, Number(state.configSistema?.comissaoProdutosPct ?? 20)));
        if (comissaoProdutosInput) comissaoProdutosInput.value = valor.toFixed(2).replace(".", ",");
        if (comissaoProdutosEditor) comissaoProdutosEditor.hidden = false;
        comissaoProdutosInput?.focus();
    });
    btnCancelarComissaoProdutos?.addEventListener("click", fecharEditorComissaoProdutos);
    btnSalvarComissaoProdutos?.addEventListener("click", salvarComissaoProdutos);
    comissaoProdutosInput?.addEventListener("input", () => comissaoProdutosInput.classList.remove("input-erro", "shake"));

    btnRestaurarOrdemCards?.addEventListener("click", async () => {
        btnRestaurarOrdemCards.disabled = true;
        try {
            await salvarOrdemCards(ORDEM_CARDS_PADRAO, "Ordem padrão restaurada.");
        } finally {
            btnRestaurarOrdemCards.disabled = false;
        }
    });

    btnRestaurarOrdemNav?.addEventListener("click", async () => {
        btnRestaurarOrdemNav.disabled = true;
        try {
            await salvarOrdemNav(ORDEM_NAV_PADRAO, "Navegação padrão restaurada.");
        } finally {
            btnRestaurarOrdemNav.disabled = false;
        }
    });

    btnCancelarServico?.addEventListener("click", fecharModalExclusaoServico);
    btnConfirmarServico?.addEventListener("click", confirmarExclusaoServico);
    modalConfirmServico?.addEventListener("click", (event) => {
        if (event.target === modalConfirmServico) fecharModalExclusaoServico();
    });
    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && modalConfirmServico?.classList.contains("active")) {
            fecharModalExclusaoServico();
        }
    });

    onStateChange("configSistema", renderizarTudo);
    renderizarTudo();
    fecharVersoesAtualizacao();
}
