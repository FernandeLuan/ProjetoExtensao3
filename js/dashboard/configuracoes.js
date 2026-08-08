import { APP_VERSION, PAGAMENTOS } from "./constants.js?v=6.1";
import { state, definirConfiguracoes, onStateChange } from "./state.js?v=6.1";
import { salvarConfiguracoes } from "./data/configuracoes-repository.js?v=6.1";
import { converterParaNumero, formatarMoeda, aplicarMascaraMoedaInput } from "./utils/money.js?v=6.1";
import { mostrarErro, mostrarSucesso } from "./services/feedback-service.js?v=6.1";

let inicializado = false;
let taxasAlteradas = {};

const btnSalvarTaxas = document.getElementById("btnSalvarTaxas");
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

function mascaraPorcentagem(input, maxDigitosInteiros) {
    input.addEventListener("input", (event) => {
        let value = event.target.value.replace(/\D/g, "").replace(/^0+/, "");
        if (!value) {
            event.target.value = "";
            return;
        }
        const maxDigitos = maxDigitosInteiros + 2;
        if (value.length > maxDigitos) value = value.slice(0, maxDigitos);
        event.target.value = (Number.parseInt(value, 10) / 100).toFixed(2).replace(".", ",");
    });
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

async function persistirConfig(novaConfig, mensagem = "Configuração salva.") {
    await salvarConfiguracoes(novaConfig);
    definirConfiguracoes(novaConfig);
    mostrarSucesso(mensagem);
}

function renderizarTaxas() {
    const config = state.configSistema;
    const debito = document.getElementById("lblAtualDebito");
    const credito = document.getElementById("lblAtualCredito");
    if (debito) debito.textContent = `Atual: ${Number(config.taxaDebito ?? 1.5).toFixed(2).replace(".", ",")}%`;
    if (credito) credito.textContent = `Atual: ${Number(config.taxaCredito ?? 3.51).toFixed(2).replace(".", ",")}%`;
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
            const cancelar = document.createElement("button");
            cancelar.type = "button";
            cancelar.textContent = "Cancelar";
            const salvar = document.createElement("button");
            salvar.type = "button";
            salvar.textContent = "Salvar";
            editorActions.append(cancelar, salvar);
            editor.append(inputNome, inputPreco, editorActions);
            row.appendChild(editor);
            inputNome.focus();

            cancelar.addEventListener("click", () => editor.remove());
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

function renderizarTudo() {
    renderizarTaxas();
    renderizarServicos();
    renderizarPagamentos();
    const versao = document.getElementById("appVersion");
    if (versao) versao.textContent = `v${APP_VERSION}`;
}

async function salvarTaxas() {
    if (!Object.keys(taxasAlteradas).length) return;
    if (btnSalvarTaxas) {
        btnSalvarTaxas.disabled = true;
        btnSalvarTaxas.textContent = "Salvando...";
    }

    try {
        await persistirConfig({ ...state.configSistema, ...taxasAlteradas }, "Taxas atualizadas.");
        taxasAlteradas = {};
        document.querySelectorAll('#configGroupTaxas .config-item').forEach((item) => {
            item.querySelector(".btn-alterar")?.classList.remove("hidden");
            const input = item.querySelector(".input-config");
            input?.classList.add("hidden");
            if (input) input.value = "";
        });
    } catch (error) {
        console.error(error);
        mostrarErro("Não foi possível salvar as taxas.");
    } finally {
        if (btnSalvarTaxas) {
            btnSalvarTaxas.textContent = "Salvar taxas";
            btnSalvarTaxas.disabled = true;
        }
    }
}

async function adicionarServico() {
    const nome = String(novoServicoNome?.value || "").trim().slice(0, 60);
    const preco = converterParaNumero(novoServicoPreco?.value) || 0;
    if (nome.length < 2 || preco <= 0) {
        setStatus(servicosStatus, "Informe nome e preço válidos.", true);
        return;
    }
    if (state.configSistema.servicos.some((servico) => servico.nome.toLowerCase() === nome.toLowerCase())) {
        setStatus(servicosStatus, "Já existe um serviço com esse nome.", true);
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
        setStatus(servicosStatus, "Serviço adicionado ✓");
        setTimeout(() => setStatus(servicosStatus, ""), 2200);
    } catch (error) {
        console.error(error);
        setStatus(servicosStatus, "Não foi possível adicionar o serviço.", true);
    } finally {
        btnSalvarNovoServico.disabled = false;
    }
}

export function initConfiguracoes() {
    if (inicializado) return;
    inicializado = true;

    document.querySelectorAll('#configGroupTaxas .config-item').forEach((item) => {
        const btn = item.querySelector(".btn-alterar");
        const input = item.querySelector(".input-config");
        const campo = item.dataset.campo;
        if (!btn || !input) return;
        mascaraPorcentagem(input, 1);

        btn.addEventListener("click", () => {
            btn.classList.add("hidden");
            input.classList.remove("hidden");
            input.value = "";
            input.focus();
        });

        input.addEventListener("input", () => {
            const valor = converterParaNumero(input.value);
            if (valor == null || valor <= 0) delete taxasAlteradas[campo];
            else taxasAlteradas[campo] = valor;
            if (btnSalvarTaxas) btnSalvarTaxas.disabled = Object.keys(taxasAlteradas).length === 0;
        });

        document.addEventListener("click", (event) => {
            if (item.contains(event.target) || input.classList.contains("hidden")) return;
            const valor = converterParaNumero(input.value);
            if (valor && valor > 0) return;
            delete taxasAlteradas[campo];
            input.value = "";
            input.classList.add("hidden");
            btn.classList.remove("hidden");
            if (btnSalvarTaxas) btnSalvarTaxas.disabled = Object.keys(taxasAlteradas).length === 0;
        });
    });

    btnSalvarTaxas?.addEventListener("click", salvarTaxas);

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
        if (!event.target.closest?.(".config-group")) fecharOutrosGruposConfig();
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
        novoServicoForm.hidden = false;
        novoServicoNome?.focus();
    });
    btnCancelarNovoServico?.addEventListener("click", () => {
        novoServicoForm.hidden = true;
        if (novoServicoNome) novoServicoNome.value = "";
        if (novoServicoPreco) novoServicoPreco.value = "";
        setStatus(servicosStatus, "");
    });
    novoServicoPreco?.addEventListener("input", () => aplicarMascaraMoedaInput(novoServicoPreco));
    btnSalvarNovoServico?.addEventListener("click", adicionarServico);

    onStateChange("configSistema", renderizarTudo);
    renderizarTudo();
    fecharVersoesAtualizacao();
}
