import { APP_VERSION } from "./constants.js?v=4.0";
import { state, definirConfiguracoes, onStateChange } from "./state.js?v=4.0";
import { salvarConfiguracoes, atualizarConfiguracoes } from "./data/configuracoes-repository.js?v=4.0";
import { converterParaNumero, formatarMoeda } from "./utils/money.js?v=4.0";
import { mostrarErro } from "./services/feedback-service.js?v=4.0";

let inicializado = false;
let camposAlterados = {};

const btnSalvarConfigs = document.getElementById("btnSalvarConfigs");
const configItems = document.querySelectorAll(".config-item");
const configGroupToggles = document.querySelectorAll(".config-group-toggle");
const pagamentoPadraoButtons = document.querySelectorAll("[data-pagamento-padrao]");
const pagamentoPadraoStatus = document.getElementById("pagamentoPadraoStatus");

function aplicarConfiguracoesNaTela() {
    const config = state.configSistema;
    const precos = config.precos || {};
    const set = (id, texto) => {
        const el = document.getElementById(id);
        if (el) el.textContent = texto;
    };

    set("lblAtualDebito", `Atual: ${Number(config.taxaDebito ?? 1.5).toFixed(2).replace(".", ",")}%`);
    set("lblAtualCredito", `Atual: ${Number(config.taxaCredito ?? 3.51).toFixed(2).replace(".", ",")}%`);
    set("lblAtualRepasse", `Atual: ${Number(config.repasseDonoPct ?? 35).toFixed(2).replace(".", ",")}%`);
    set("labelAtualCombo3", `Atual: R$ ${formatarMoeda(precos["Cabelo + Barba + Sobrancelha"] ?? 110)}`);
    set("labelAtualCombo2", `Atual: R$ ${formatarMoeda(precos["Cabelo + Barba"] ?? 105)}`);
    set("labelAtualCabSob", `Atual: R$ ${formatarMoeda(precos["Cabelo + Sobrancelha"] ?? 75)}`);
    set("labelAtualCabelo", `Atual: R$ ${formatarMoeda(precos.Cabelo ?? 60)}`);
    set("labelAtualBarba", `Atual: R$ ${formatarMoeda(precos.Barba ?? 50)}`);

    document.querySelectorAll(".btn-servico").forEach((btn) => {
        const nome = btn.dataset.nome;
        if (precos[nome] === undefined) return;
        btn.dataset.valor = precos[nome];
        const valor = btn.querySelector(".valor-servico-btn");
        if (valor) valor.textContent = `R$ ${formatarMoeda(precos[nome])}`;
    });

    atualizarPagamentoPadraoConfig();
    const versao = document.getElementById("appVersion");
    if (versao) versao.textContent = `v${APP_VERSION}`;
}

function atualizarEstadoBotaoSalvar() {
    if (btnSalvarConfigs) btnSalvarConfigs.disabled = Object.keys(camposAlterados).length === 0;
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

function mascaraMoedaLimitada(input) {
    input.addEventListener("input", (event) => {
        let value = event.target.value.replace(/\D/g, "");
        if (!value) {
            event.target.value = "";
            return;
        }
        if (value.length > 5) value = value.slice(0, 5);
        event.target.value = (Number.parseInt(value, 10) / 100).toFixed(2).replace(".", ",");
    });
}

function fecharCampoConfigSeVazio(item) {
    const btnAlterar = item.querySelector(".btn-alterar");
    const input = item.querySelector(".input-config");
    const campo = item.dataset.campo;
    if (!btnAlterar || !input || input.classList.contains("hidden")) return;

    const valor = converterParaNumero(input.value);
    if (valor !== null && valor > 0) return;

    delete camposAlterados[campo];
    input.classList.add("hidden");
    btnAlterar.classList.remove("hidden");
    input.value = "";
    atualizarEstadoBotaoSalvar();
}

function fecharGrupo(botao) {
    if (!botao) return;
    const id = botao.getAttribute("aria-controls");
    const conteudo = id ? document.getElementById(id) : null;
    botao.setAttribute("aria-expanded", "false");
    if (conteudo) conteudo.hidden = true;
}

function fecharVersoesAtualizacao() {
    document.querySelectorAll(".update-version-toggle").forEach((botao) => {
        botao.setAttribute("aria-expanded", "false");
        const id = botao.getAttribute("aria-controls");
        const detalhe = id ? document.getElementById(id) : null;
        if (detalhe) detalhe.hidden = true;
    });
}

function fecharOutrosGruposConfig(excecao = null) {
    configGroupToggles.forEach((botao) => {
        if (botao !== excecao) fecharGrupo(botao);
    });
}

function obterPagamentoPadrao() {
    const valor = state.configSistema.pagamentoPadrao;
    return ["Pix", "Dinheiro", "Débito", "Crédito"].includes(valor) ? valor : "nenhum";
}

function atualizarPagamentoPadraoConfig() {
    const atual = obterPagamentoPadrao();
    pagamentoPadraoButtons.forEach((botao) => {
        const ativo = botao.dataset.pagamentoPadrao === atual;
        botao.classList.toggle("active", ativo);
        botao.setAttribute("aria-pressed", String(ativo));
    });
}

async function salvarCamposAlterados() {
    if (!Object.keys(camposAlterados).length) return;

    const novaConfig = {
        ...state.configSistema,
        precos: { ...(state.configSistema.precos || {}) }
    };

    Object.entries(camposAlterados).forEach(([campo, valor]) => {
        if (["taxaDebito", "taxaCredito", "repasseDonoPct"].includes(campo)) novaConfig[campo] = valor;
        else novaConfig.precos[campo] = valor;
    });

    btnSalvarConfigs.textContent = "Salvando...";
    btnSalvarConfigs.disabled = true;

    try {
        await salvarConfiguracoes(novaConfig);
        definirConfiguracoes(novaConfig);
        camposAlterados = {};
        configItems.forEach((item) => {
            const btn = item.querySelector(".btn-alterar");
            const input = item.querySelector(".input-config");
            btn?.classList.remove("hidden");
            input?.classList.add("hidden");
            if (input) input.value = "";
        });
        btnSalvarConfigs.classList.add("success");
        btnSalvarConfigs.textContent = "Salvo ✓";
        setTimeout(() => {
            btnSalvarConfigs.classList.remove("success");
            btnSalvarConfigs.textContent = "Salvar Alterações";
            atualizarEstadoBotaoSalvar();
        }, 2000);
    } catch (error) {
        console.error("Erro ao salvar configurações:", error);
        mostrarErro("Não foi possível salvar as configurações.");
        btnSalvarConfigs.textContent = "Erro ao salvar";
        setTimeout(() => {
            btnSalvarConfigs.textContent = "Salvar Alterações";
            atualizarEstadoBotaoSalvar();
        }, 2000);
    }
}

export function initConfiguracoes() {
    if (inicializado) return;
    inicializado = true;

    configItems.forEach((item) => {
        const btnAlterar = item.querySelector(".btn-alterar");
        const input = item.querySelector(".input-config");
        const tipo = item.dataset.tipo;
        const campo = item.dataset.campo;
        if (!btnAlterar || !input) return;

        if (tipo === "moeda") mascaraMoedaLimitada(input);
        else if (["taxaDebito", "taxaCredito"].includes(campo)) mascaraPorcentagem(input, 1);
        else if (campo === "repasseDonoPct") mascaraPorcentagem(input, 2);

        btnAlterar.addEventListener("click", () => {
            btnAlterar.classList.add("hidden");
            input.classList.remove("hidden");
            input.value = "";
            input.focus();
        });

        input.addEventListener("input", () => {
            const valor = converterParaNumero(input.value);
            if (valor === null || valor === 0) delete camposAlterados[campo];
            else camposAlterados[campo] = valor;
            atualizarEstadoBotaoSalvar();
        });
    });

    document.addEventListener("click", (event) => {
        configItems.forEach((item) => {
            if (!item.contains(event.target)) fecharCampoConfigSeVazio(item);
        });

        const grupoClicado = event.target.closest?.(".config-group");
        if (!grupoClicado) fecharOutrosGruposConfig();
    });

    configGroupToggles.forEach((botao) => {
        botao.addEventListener("click", () => {
            const id = botao.getAttribute("aria-controls");
            const conteudo = id ? document.getElementById(id) : null;
            if (!conteudo) return;
            const vaiAbrir = botao.getAttribute("aria-expanded") !== "true";

            if (vaiAbrir) {
                fecharOutrosGruposConfig(botao);
                if (botao.dataset.configGroup === "sobre") fecharVersoesAtualizacao();
            }

            botao.setAttribute("aria-expanded", String(vaiAbrir));
            conteudo.hidden = !vaiAbrir;
        });
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
            pagamentoPadraoButtons.forEach((item) => item.disabled = true);
            if (pagamentoPadraoStatus) pagamentoPadraoStatus.textContent = "Salvando...";

            try {
                await atualizarConfiguracoes({ pagamentoPadrao: valor });
                definirConfiguracoes({ ...state.configSistema, pagamentoPadrao: valor });
                if (pagamentoPadraoStatus) {
                    pagamentoPadraoStatus.textContent = "Padrão salvo ✓";
                    setTimeout(() => {
                        if (pagamentoPadraoStatus.textContent === "Padrão salvo ✓") pagamentoPadraoStatus.textContent = "";
                    }, 2200);
                }
            } catch (error) {
                console.error("Erro ao salvar pagamento padrão:", error);
                mostrarErro("Não foi possível salvar o pagamento padrão.");
                if (pagamentoPadraoStatus) pagamentoPadraoStatus.textContent = "Não foi possível salvar.";
            } finally {
                pagamentoPadraoButtons.forEach((item) => item.disabled = false);
            }
        });
    });

    btnSalvarConfigs?.addEventListener("click", salvarCamposAlterados);
    onStateChange("configSistema", aplicarConfiguracoesNaTela);
    aplicarConfiguracoesNaTela();
    fecharVersoesAtualizacao();
}
