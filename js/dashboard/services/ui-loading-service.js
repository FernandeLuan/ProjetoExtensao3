const estadosBotoes = new WeakMap();
const loadingsTela = new Map();
let sequenciaLoading = 0;

function aguardar(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function definirConteudoBotao(botao, { texto, tipo = "loading" }) {
    if (!botao) return;
    botao.replaceChildren();

    const icone = document.createElement("span");
    icone.setAttribute("aria-hidden", "true");
    icone.className = tipo === "success" ? "ui-button-check" : "ui-button-spinner";

    const label = document.createElement("span");
    label.className = "ui-button-label";
    label.textContent = texto;

    botao.append(icone, label);
}

export function iniciarAcaoBotao(botao, texto = "Salvando...") {
    if (!botao) return;

    if (!estadosBotoes.has(botao)) {
        const largura = Math.ceil(botao.getBoundingClientRect().width || 0);
        estadosBotoes.set(botao, {
            html: botao.innerHTML,
            disabled: botao.disabled,
            minWidth: botao.style.minWidth,
            ariaBusy: botao.getAttribute("aria-busy")
        });
        if (largura > 0) botao.style.minWidth = `${largura}px`;
    }

    botao.disabled = true;
    botao.setAttribute("aria-busy", "true");
    botao.classList.remove("ui-action-success");
    botao.classList.add("ui-action-loading");
    definirConteudoBotao(botao, { texto, tipo: "loading" });
}

export function restaurarAcaoBotao(botao) {
    if (!botao) return;
    const estado = estadosBotoes.get(botao);

    botao.classList.remove("ui-action-loading", "ui-action-success");

    if (!estado) {
        botao.removeAttribute("aria-busy");
        return;
    }

    botao.innerHTML = estado.html;
    botao.disabled = estado.disabled;
    botao.style.minWidth = estado.minWidth;

    if (estado.ariaBusy === null) botao.removeAttribute("aria-busy");
    else botao.setAttribute("aria-busy", estado.ariaBusy);

    estadosBotoes.delete(botao);
}

export async function concluirAcaoBotao(botao, texto = "Concluído!", duracao = 720) {
    if (!botao) return;

    botao.classList.remove("ui-action-loading");
    botao.classList.add("ui-action-success");
    botao.setAttribute("aria-busy", "false");
    definirConteudoBotao(botao, { texto, tipo: "success" });

    if (duracao > 0) await aguardar(duracao);
    restaurarAcaoBotao(botao);
}

function overlayLoading() {
    return document.getElementById("appAsyncLoading");
}

function atualizarOverlayLoading() {
    const overlay = overlayLoading();
    if (!overlay) return;

    const visiveis = [...loadingsTela.values()].filter((item) => item.visivel);
    if (!visiveis.length) {
        overlay.hidden = true;
        document.body.classList.remove("app-loading-em-andamento");
        return;
    }

    const atual = visiveis[visiveis.length - 1];
    const texto = document.getElementById("appAsyncLoadingText");
    if (texto) texto.textContent = atual.mensagem;

    overlay.hidden = false;
    document.body.classList.add("app-loading-em-andamento");
}

export function iniciarLoadingTela(mensagem = "Carregando...", { delay = 240 } = {}) {
    const token = `loading-${++sequenciaLoading}`;
    const item = {
        mensagem: String(mensagem || "Carregando..."),
        visivel: false,
        timer: null
    };

    item.timer = setTimeout(() => {
        const atual = loadingsTela.get(token);
        if (!atual) return;
        atual.visivel = true;
        atualizarOverlayLoading();
    }, Math.max(0, Number(delay) || 0));

    loadingsTela.set(token, item);
    return token;
}

export function finalizarLoadingTela(token) {
    const item = loadingsTela.get(token);
    if (!item) return;

    clearTimeout(item.timer);
    loadingsTela.delete(token);
    atualizarOverlayLoading();
}
