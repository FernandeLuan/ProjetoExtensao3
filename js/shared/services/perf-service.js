const params = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
const habilitado = Boolean(
    params?.get("debug") === "perf" ||
    (typeof localStorage !== "undefined" && localStorage.getItem("srnk:debug-perf") === "1")
);

const inicioSessao = typeof performance !== "undefined" ? performance.now() : 0;
const eventos = [];
let sequencia = 0;
let painel = null;

function arredondar(valor) {
    return Math.round(Number(valor || 0) * 10) / 10;
}

function garantirPainel() {
    if (!habilitado || typeof document === "undefined" || painel) return painel;

    painel = document.createElement("aside");
    painel.id = "srnkPerfPanel";
    painel.setAttribute("aria-live", "polite");
    painel.style.cssText = [
        "position:fixed",
        "right:8px",
        "bottom:8px",
        "z-index:2147483647",
        "width:min(330px,calc(100vw - 16px))",
        "max-height:48vh",
        "overflow:auto",
        "padding:10px 12px",
        "border-radius:14px",
        "background:rgba(8,10,14,.94)",
        "color:#fff",
        "font:12px/1.35 system-ui,-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif",
        "box-shadow:0 12px 38px rgba(0,0,0,.38)",
        "backdrop-filter:blur(10px)",
        "pointer-events:auto"
    ].join(";");

    painel.addEventListener("dblclick", () => {
        painel.hidden = !painel.hidden;
    });

    document.body?.appendChild(painel);
    return painel;
}

function atualizarPainel() {
    if (!habilitado) return;
    const el = garantirPainel();
    if (!el) return;

    const recentes = eventos.slice(-8).reverse();
    const total = arredondar((typeof performance !== "undefined" ? performance.now() : 0) - inicioSessao);
    const lentos = [...eventos]
        .filter((item) => Number.isFinite(item.ms))
        .sort((a, b) => b.ms - a.ms)
        .slice(0, 3);

    el.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px">
            <strong style="font-size:13px">SR NK • PERF</strong>
            <span style="opacity:.68">sessão ${total} ms</span>
        </div>
        <div style="margin-bottom:8px;padding:7px 8px;border-radius:9px;background:rgba(255,255,255,.06)">
            ${lentos.length ? lentos.map((item) => `<div><strong>${item.nome}</strong> <span style="float:right">${arredondar(item.ms)} ms</span></div>`).join("") : "Aguardando medições…"}
        </div>
        ${recentes.map((item) => `
            <div style="display:grid;grid-template-columns:1fr auto;gap:8px;padding:4px 0;border-top:1px solid rgba(255,255,255,.06)">
                <span>${item.nome}${item.detalhe ? `<small style="display:block;opacity:.55">${item.detalhe}</small>` : ""}</span>
                <strong>${Number.isFinite(item.ms) ? `${arredondar(item.ms)} ms` : "•"}</strong>
            </div>
        `).join("")}
        <div style="margin-top:8px;opacity:.55">Console: __SRNK_PERF__()</div>
    `;
}

export function perfAtivo() {
    return habilitado;
}

export function iniciarMedicao(nome, detalhe = "") {
    if (!habilitado || typeof performance === "undefined") return null;
    return {
        id: ++sequencia,
        nome: String(nome || "medição"),
        detalhe: String(detalhe || ""),
        inicio: performance.now()
    };
}

export function finalizarMedicao(token, detalheExtra = "") {
    if (!habilitado || !token || typeof performance === "undefined") return 0;
    const fim = performance.now();
    const evento = {
        id: token.id,
        nome: token.nome,
        detalhe: [token.detalhe, detalheExtra].filter(Boolean).join(" • "),
        ms: fim - token.inicio,
        em: Date.now()
    };
    eventos.push(evento);
    if (eventos.length > 120) eventos.splice(0, eventos.length - 120);
    console.info(`[SR NK • PERF] ${evento.nome}: ${arredondar(evento.ms)} ms`, evento.detalhe || "");
    atualizarPainel();
    return evento.ms;
}

export function registrarEventoPerf(nome, detalhe = "") {
    if (!habilitado) return;
    eventos.push({
        id: ++sequencia,
        nome: String(nome || "evento"),
        detalhe: String(detalhe || ""),
        ms: null,
        em: Date.now()
    });
    if (eventos.length > 120) eventos.splice(0, eventos.length - 120);
    atualizarPainel();
}

export async function medirAsync(nome, fn, detalhe = "") {
    const token = iniciarMedicao(nome, detalhe);
    try {
        return await fn();
    } finally {
        finalizarMedicao(token);
    }
}

export function obterDiagnosticoPerformance() {
    return {
        habilitado,
        sessaoMs: arredondar((typeof performance !== "undefined" ? performance.now() : 0) - inicioSessao),
        eventos: eventos.map((item) => ({ ...item, ms: Number.isFinite(item.ms) ? arredondar(item.ms) : null })),
        maisLentos: [...eventos]
            .filter((item) => Number.isFinite(item.ms))
            .sort((a, b) => b.ms - a.ms)
            .slice(0, 10)
            .map((item) => ({ nome: item.nome, ms: arredondar(item.ms), detalhe: item.detalhe }))
    };
}

if (typeof window !== "undefined") {
    window.__SRNK_PERF__ = obterDiagnosticoPerformance;
    if (habilitado) {
        window.addEventListener("DOMContentLoaded", () => {
            garantirPainel();
            registrarEventoPerf("DOM pronto", document.body?.dataset?.srnkArea || "");
        }, { once: true });
    }
}
