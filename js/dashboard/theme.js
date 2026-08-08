let inicializado = false;
const mediaTemaEscuro = window.matchMedia("(prefers-color-scheme: dark)");
let modoTemaAtual = "system";

function normalizarModoTema(valor) {
    return ["system", "light", "dark"].includes(valor) ? valor : "system";
}

function aplicarTemaVisual(modo) {
    const normalizado = normalizarModoTema(modo);
    const usarEscuro = normalizado === "dark" || (normalizado === "system" && mediaTemaEscuro.matches);

    document.documentElement.classList.toggle("dark", usarEscuro);
    document.documentElement.classList.toggle("light", !usarEscuro);

    document.querySelectorAll("[data-theme-mode]").forEach((botao) => {
        const ativo = botao.dataset.themeMode === normalizado;
        botao.classList.toggle("active", ativo);
        botao.setAttribute("aria-pressed", String(ativo));
    });
}

function definirModoTema(modo, salvar = true) {
    modoTemaAtual = normalizarModoTema(modo);
    if (salvar) localStorage.setItem("tema", modoTemaAtual);
    aplicarTemaVisual(modoTemaAtual);
}

export function initTheme() {
    if (inicializado) return;
    inicializado = true;

    definirModoTema(normalizarModoTema(localStorage.getItem("tema") || "system"), false);

    document.querySelectorAll("[data-theme-mode]").forEach((botao) => {
        botao.addEventListener("click", () => definirModoTema(botao.dataset.themeMode || "system"));
    });

    mediaTemaEscuro.addEventListener?.("change", () => {
        if (modoTemaAtual === "system") aplicarTemaVisual("system");
    });
}
