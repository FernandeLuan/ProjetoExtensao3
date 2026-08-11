const carregamentos = new Map();

function carregarScript({ chave, src, pronto }) {
    if (typeof pronto === "function" && pronto()) return Promise.resolve(true);
    if (carregamentos.has(chave)) return carregamentos.get(chave);

    const promessa = new Promise((resolve, reject) => {
        const existente = document.querySelector(`script[data-srnk-external="${chave}"]`);

        const finalizarSePronto = () => {
            if (typeof pronto !== "function" || pronto()) {
                resolve(true);
                return true;
            }
            return false;
        };

        if (existente) {
            if (finalizarSePronto()) return;
            existente.addEventListener("load", () => {
                if (!finalizarSePronto()) reject(new Error(`Recurso ${chave} carregou sem inicializar.`));
            }, { once: true });
            existente.addEventListener("error", () => reject(new Error(`Falha ao carregar ${chave}.`)), { once: true });
            return;
        }

        const script = document.createElement("script");
        script.src = src;
        script.async = true;
        script.dataset.srnkExternal = chave;
        script.addEventListener("load", () => {
            if (!finalizarSePronto()) reject(new Error(`Recurso ${chave} carregou sem inicializar.`));
        }, { once: true });
        script.addEventListener("error", () => reject(new Error(`Falha ao carregar ${chave}.`)), { once: true });
        document.head.appendChild(script);
    }).catch((error) => {
        carregamentos.delete(chave);
        throw error;
    });

    carregamentos.set(chave, promessa);
    return promessa;
}

export function garantirChartJs() {
    return carregarScript({
        chave: "chartjs",
        src: "https://cdn.jsdelivr.net/npm/chart.js",
        pronto: () => typeof window.Chart !== "undefined"
    });
}

export function garantirZXing() {
    return carregarScript({
        chave: "zxing",
        src: "https://unpkg.com/@zxing/browser@0.2.1",
        pronto: () => Boolean(window.ZXingBrowser?.BrowserMultiFormatReader)
    });
}
