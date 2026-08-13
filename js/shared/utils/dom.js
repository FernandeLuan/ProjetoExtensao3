export function escaparHtml(valor) {
    return String(valor ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

export function setTexto(id, texto) {
    const elemento = document.getElementById(id);
    if (elemento) elemento.textContent = texto;
}

export function abrirSeletorData(input) {
    if (!input) return;
    try {
        if (typeof input.showPicker === "function") input.showPicker();
        else input.click();
    } catch {
        input.click();
    }
}

let tooltipsFinanceirosInicializados = false;
let tooltipTimer = null;
let tooltipAnchorAtual = null;

function esconderTooltipFinanceiro() {
    const tooltip = document.getElementById("financeInfoTooltip");
    if (!tooltip) return;
    tooltip.hidden = true;
    tooltipAnchorAtual = null;
    tooltip.classList.remove("is-above", "is-below");
    tooltip.style.removeProperty("left");
    tooltip.style.removeProperty("top");
    tooltip.style.removeProperty("--tooltip-arrow-left");
    if (tooltipTimer) clearTimeout(tooltipTimer);
    tooltipTimer = null;
}

function posicionarTooltipFinanceiro(botao, tooltip) {
    const rect = botao.getBoundingClientRect();
    const margem = 12;
    const espaco = 10;
    const largura = tooltip.offsetWidth;
    const altura = tooltip.offsetHeight;
    const centroIdeal = rect.left + (rect.width / 2);
    const centroX = Math.max(
        margem + largura / 2,
        Math.min(window.innerWidth - margem - largura / 2, centroIdeal)
    );

    const cabeAcima = rect.top >= altura + espaco + margem;
    tooltip.classList.toggle("is-above", cabeAcima);
    tooltip.classList.toggle("is-below", !cabeAcima);
    tooltip.style.left = `${centroX}px`;
    tooltip.style.top = cabeAcima
        ? `${rect.top - espaco}px`
        : `${rect.bottom + espaco}px`;

    // Quando o balão é limitado pela borda da tela, a seta continua apontando
    // para o ícone real em vez de ficar sempre no centro do balão.
    const esquerdaTooltip = centroX - largura / 2;
    const centroBotao = rect.left + rect.width / 2;
    const seta = Math.max(12, Math.min(largura - 12, centroBotao - esquerdaTooltip));
    tooltip.style.setProperty("--tooltip-arrow-left", `${seta}px`);
}

export function inicializarTooltipsFinanceiros() {
    if (tooltipsFinanceirosInicializados) return;
    tooltipsFinanceirosInicializados = true;

    document.addEventListener("click", (event) => {
        const botao = event.target.closest(".finance-info-btn[data-info]");
        if (!botao) {
            if (!event.target.closest("#financeInfoTooltip")) esconderTooltipFinanceiro();
            return;
        }

        event.preventDefault();
        event.stopPropagation();
        const tooltip = document.getElementById("financeInfoTooltip");
        if (!tooltip) return;

        if (!tooltip.hidden && tooltipAnchorAtual === botao) {
            esconderTooltipFinanceiro();
            return;
        }

        tooltipAnchorAtual = botao;
        tooltip.textContent = botao.dataset.info || "";
        tooltip.hidden = false;
        tooltip.style.position = "fixed";
        tooltip.style.transform = "translateX(-50%)";
        requestAnimationFrame(() => posicionarTooltipFinanceiro(botao, tooltip));

        if (tooltipTimer) clearTimeout(tooltipTimer);
        tooltipTimer = setTimeout(esconderTooltipFinanceiro, 5000);
    });

    window.addEventListener("resize", esconderTooltipFinanceiro, { passive: true });
    window.addEventListener("scroll", esconderTooltipFinanceiro, { passive: true });
}
