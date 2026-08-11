export const AUTH_AREA_KEY = "srnk:auth-area";

const AREAS = new Set(["profissional", "admin"]);

// Remove resíduos das versões temporárias de diagnóstico/performance.
try {
    localStorage.removeItem("srnk:debug-perf");
    localStorage.removeItem("srnk:sessao-validada");
} catch (_) {}

export function normalizarArea(area) {
    return AREAS.has(area) ? area : "profissional";
}

export function obterAreaSessao() {
    try {
        return sessionStorage.getItem(AUTH_AREA_KEY) || "";
    } catch (_) {
        return "";
    }
}

export function sessaoPertenceArea(area) {
    return obterAreaSessao() === normalizarArea(area);
}

export function marcarSessaoArea(area) {
    try {
        sessionStorage.setItem(AUTH_AREA_KEY, normalizarArea(area));
    } catch (_) {}
}

export function limparSessaoArea() {
    try {
        sessionStorage.removeItem(AUTH_AREA_KEY);
    } catch (_) {}
}

export function loginDaArea(area, { motivo = "", trocar = false } = {}) {
    const params = new URLSearchParams();
    if (motivo) params.set("motivo", motivo);
    if (trocar) params.set("trocar", "1");
    const query = params.toString();
    return `./login.html${query ? `?${query}` : ""}`;
}
