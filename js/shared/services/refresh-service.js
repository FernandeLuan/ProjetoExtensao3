const EVENTO_PENDENTE = "srnk:dados-pendentes";
const EVENTO_ATUALIZADO = "srnk:dados-atualizados";
const pendencias = new Set();
const atualizacoes = new Map();

function normalizarTipos(tipos) {
    const lista = Array.isArray(tipos) ? tipos : [tipos];
    return lista.map((item) => String(item || "").trim()).filter(Boolean);
}

export function marcarDadosPendentes(tipo = "geral") {
    const tipos = normalizarTipos(tipo);
    tipos.forEach((item) => pendencias.add(item));
    document.dispatchEvent(new CustomEvent(EVENTO_PENDENTE, { detail: { tipos } }));
}

export function temDadosPendentes(tipos = []) {
    const alvo = normalizarTipos(tipos);
    if (!alvo.length) return pendencias.size > 0;
    return alvo.some((item) => pendencias.has(item) || pendencias.has("geral"));
}

export function limparDadosPendentes(tipos = []) {
    const alvo = normalizarTipos(tipos);
    if (!alvo.length) pendencias.clear();
    else alvo.forEach((item) => pendencias.delete(item));
    document.dispatchEvent(new CustomEvent(EVENTO_ATUALIZADO, { detail: { tipos: alvo } }));
}

export function registrarAtualizacao(chave, tiposResolvidos = []) {
    const id = String(chave || "geral");
    const agora = Date.now();
    atualizacoes.set(id, agora);
    try { sessionStorage.setItem(`srnk:atualizado:${id}`, String(agora)); } catch (_) {}
    limparDadosPendentes(tiposResolvidos);
    return agora;
}

export function obterUltimaAtualizacao(chave) {
    const id = String(chave || "geral");
    if (atualizacoes.has(id)) return atualizacoes.get(id);
    try {
        const salvo = Number(sessionStorage.getItem(`srnk:atualizado:${id}`) || 0);
        if (salvo > 0) {
            atualizacoes.set(id, salvo);
            return salvo;
        }
    } catch (_) {}
    return 0;
}

export function textoUltimaAtualizacao(chave) {
    const em = obterUltimaAtualizacao(chave);
    if (!em) return "Dados carregados";
    const segundos = Math.max(0, Math.floor((Date.now() - em) / 1000));
    if (segundos < 45) return "Atualizado agora";
    const minutos = Math.floor(segundos / 60);
    if (minutos < 60) return `Atualizado há ${minutos} min`;
    const horas = Math.floor(minutos / 60);
    if (horas < 24) return `Atualizado há ${horas} h`;
    return "Atualizado anteriormente";
}

export function observarMudancas(callback) {
    if (typeof callback !== "function") return () => {};
    const handler = (event) => callback(event?.detail || {});
    document.addEventListener(EVENTO_PENDENTE, handler);
    document.addEventListener(EVENTO_ATUALIZADO, handler);
    return () => {
        document.removeEventListener(EVENTO_PENDENTE, handler);
        document.removeEventListener(EVENTO_ATUALIZADO, handler);
    };
}

export function habilitarPullToRefresh(elemento, onRefresh, { limite = 78 } = {}) {
    if (!elemento || typeof onRefresh !== "function") return () => {};
    let inicioY = null;
    let inicioX = null;
    let bloqueado = false;

    const ativo = () => {
        const estilo = getComputedStyle(elemento);
        return estilo.display !== "none" && !elemento.hidden;
    };

    const touchStart = (event) => {
        if (!ativo() || window.scrollY > 2 || bloqueado || !event.touches?.length) return;
        inicioY = event.touches[0].clientY;
        inicioX = event.touches[0].clientX;
    };

    const touchEnd = async (event) => {
        if (inicioY === null || bloqueado) {
            inicioY = null;
            inicioX = null;
            return;
        }
        const toque = event.changedTouches?.[0];
        const deltaY = toque ? toque.clientY - inicioY : 0;
        const deltaX = toque ? Math.abs(toque.clientX - inicioX) : 999;
        inicioY = null;
        inicioX = null;

        if (deltaY < limite || deltaX > Math.max(55, deltaY * 0.7) || window.scrollY > 2) return;
        bloqueado = true;
        try { await onRefresh(); } finally { bloqueado = false; }
    };

    elemento.addEventListener("touchstart", touchStart, { passive: true });
    elemento.addEventListener("touchend", touchEnd, { passive: true });

    return () => {
        elemento.removeEventListener("touchstart", touchStart);
        elemento.removeEventListener("touchend", touchEnd);
    };
}
