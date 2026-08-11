export const AUTH_AREA_KEY = "srnk:auth-area";
export const AUTH_VALIDATED_KEY = "srnk:sessao-validada";

const AREAS = new Set(["profissional", "admin"]);

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
    const normalizada = normalizarArea(area);
    try {
        sessionStorage.setItem(AUTH_AREA_KEY, normalizada);
        sessionStorage.setItem(AUTH_VALIDATED_KEY, "1");
    } catch (_) {}
}

export function limparSessaoArea() {
    try {
        sessionStorage.removeItem(AUTH_AREA_KEY);
        sessionStorage.removeItem(AUTH_VALIDATED_KEY);
    } catch (_) {}
    // Remove o marcador legado da v3.2 para não confundir diagnósticos antigos.
    try { localStorage.removeItem(AUTH_VALIDATED_KEY); } catch (_) {}
}

export function loginDaArea(area, { motivo = "", trocar = false, debugPerf = false } = {}) {
    const params = new URLSearchParams();
    if (motivo) params.set("motivo", motivo);
    if (trocar) params.set("trocar", "1");
    if (debugPerf) params.set("debug", "perf");
    const query = params.toString();
    return `./login.html${query ? `?${query}` : ""}`;
}

export function debugPerfAtivoNaUrl() {
    return new URLSearchParams(window.location.search).get("debug") === "perf";
}
