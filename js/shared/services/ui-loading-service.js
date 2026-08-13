const estadosBotoes = new WeakMap();
const confirmacoesBotoes = new WeakMap();
const loadingsTela = new Map();
let sequenciaLoading = 0;

const LOADING_DELAY_PADRAO_MS = 420;
const LOADING_VISIVEL_MINIMO_MS = 220;


function limparConfirmacaoBotao(botao) {
    if (!botao) return;
    const timer = confirmacoesBotoes.get(botao);
    if (timer) clearTimeout(timer);
    confirmacoesBotoes.delete(botao);
    botao.classList.remove("ui-action-confirmed");
    delete botao.dataset.uiSuccess;
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
    limparConfirmacaoBotao(botao);

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

export function concluirAcaoBotao(botao, texto = "Concluído!", duracao = 520) {
    if (!botao) return Promise.resolve();

    // A gravação já terminou. O botão volta a ficar utilizável imediatamente e o
    // sucesso aparece como uma camada visual temporária, sem segurar o fluxo.
    restaurarAcaoBotao(botao);
    limparConfirmacaoBotao(botao);
    botao.classList.add("ui-action-confirmed");
    botao.dataset.uiSuccess = String(texto || "Concluído!");

    const tempoVisual = Math.max(180, Math.min(900, Number(duracao) || 520));
    const timer = setTimeout(() => limparConfirmacaoBotao(botao), tempoVisual);
    confirmacoesBotoes.set(botao, timer);
    return Promise.resolve();
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

export function iniciarLoadingTela(mensagem = "Carregando...", { delay = LOADING_DELAY_PADRAO_MS } = {}) {
    const token = `loading-${++sequenciaLoading}`;
    const item = {
        mensagem: String(mensagem || "Carregando..."),
        visivel: false,
        exibidoEm: 0,
        timer: null,
        timerSaida: null
    };

    item.timer = setTimeout(() => {
        const atual = loadingsTela.get(token);
        if (!atual) return;

        // Durante o bootstrap já existe um único loading de entrada. Não
        // sobrepomos um segundo loading de seção por cima dele.
        if (document.body.classList.contains("dashboard-booting") ||
            document.body.classList.contains("session-pending")) {
            atual.suprimidoNoBoot = true;
            return;
        }

        atual.visivel = true;
        atual.exibidoEm = performance.now();
        atualizarOverlayLoading();
    }, Math.max(0, Number(delay) || 0));

    loadingsTela.set(token, item);
    return token;
}

export function finalizarLoadingTela(token) {
    const item = loadingsTela.get(token);
    if (!item) return;

    clearTimeout(item.timer);

    // Se o overlay chegou a aparecer, evita o efeito de "flash de erro".
    // Mantemos um tempo visual mínimo curto para a transição parecer intencional.
    if (item.visivel && item.exibidoEm) {
        const decorrido = performance.now() - item.exibidoEm;
        const restante = Math.max(0, LOADING_VISIVEL_MINIMO_MS - decorrido);
        if (restante > 0) {
            if (item.timerSaida) return;
            item.timerSaida = setTimeout(() => {
                loadingsTela.delete(token);
                atualizarOverlayLoading();
            }, restante);
            return;
        }
    }

    if (item.timerSaida) clearTimeout(item.timerSaida);
    loadingsTela.delete(token);
    atualizarOverlayLoading();
}
