let root = null;
let card = null;
let mesAtual = null;
let dataSelecionada = null;
let dataMaxima = null;
let onSelectAtual = null;
let ancoraAtual = null;
let tituloAtual = "Escolher data";
let listenerResizeAtivo = false;

const MESES = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
];
const DIAS = ["D", "S", "T", "Q", "Q", "S", "S"];

function inicioDoDia(data) {
    const d = data instanceof Date ? new Date(data) : new Date();
    d.setHours(0, 0, 0, 0);
    return d;
}

function mesmaData(a, b) {
    return Boolean(a && b)
        && a.getFullYear() === b.getFullYear()
        && a.getMonth() === b.getMonth()
        && a.getDate() === b.getDate();
}

function clamp(valor, min, max) {
    return Math.min(Math.max(valor, min), max);
}

function garantirEstrutura() {
    if (root) return;

    root = document.createElement("div");
    root.className = "srnk-calendar-layer";
    root.hidden = true;
    root.innerHTML = `
        <div class="srnk-calendar-popover" role="dialog" aria-modal="false" aria-label="Escolher data">
            <div class="srnk-calendar-head">
                <button type="button" class="srnk-calendar-nav" data-cal-prev aria-label="Mês anterior">
                    <i class="fas fa-chevron-left" aria-hidden="true"></i>
                </button>
                <div class="srnk-calendar-title">
                    <strong data-cal-month></strong>
                    <span data-cal-caption></span>
                </div>
                <button type="button" class="srnk-calendar-nav" data-cal-next aria-label="Próximo mês">
                    <i class="fas fa-chevron-right" aria-hidden="true"></i>
                </button>
            </div>
            <div class="srnk-calendar-weekdays"></div>
            <div class="srnk-calendar-grid" data-cal-grid></div>
            <div class="srnk-calendar-footer">
                <button type="button" data-cal-today>Hoje</button>
                <button type="button" data-cal-close>Fechar</button>
            </div>
        </div>
    `;
    document.body.appendChild(root);
    card = root.querySelector(".srnk-calendar-popover");

    const weekdays = root.querySelector(".srnk-calendar-weekdays");
    DIAS.forEach((dia) => {
        const span = document.createElement("span");
        span.textContent = dia;
        weekdays.appendChild(span);
    });

    root.addEventListener("pointerdown", (event) => {
        if (event.target === root) fecharCalendarioPopover();
    });

    root.querySelector("[data-cal-close]")?.addEventListener("click", fecharCalendarioPopover);
    root.querySelector("[data-cal-prev]")?.addEventListener("click", () => moverMes(-1));
    root.querySelector("[data-cal-next]")?.addEventListener("click", () => moverMes(1));
    root.querySelector("[data-cal-today]")?.addEventListener("click", () => {
        const hoje = inicioDoDia(new Date());
        selecionar(hoje > dataMaxima ? dataMaxima : hoje);
    });

    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && root && !root.hidden) fecharCalendarioPopover();
    });
}

function posicionar() {
    if (!root || root.hidden || !card || !ancoraAtual) return;

    const rect = ancoraAtual.getBoundingClientRect();
    const viewport = window.visualViewport;
    const larguraViewport = Math.max(240, viewport?.width || window.innerWidth);
    const alturaViewport = Math.max(320, viewport?.height || window.innerHeight);
    const margem = 10;
    const largura = Math.min(292, Math.max(244, larguraViewport - 24));

    card.style.width = `${largura}px`;
    card.style.maxHeight = `${Math.max(250, alturaViewport - 20)}px`;

    const altura = Math.min(card.scrollHeight || card.offsetHeight || 322, alturaViewport - 20);
    const centro = rect.left + rect.width / 2;
    const left = clamp(
        centro - largura / 2,
        12,
        Math.max(12, larguraViewport - largura - 12)
    );

    // Prioriza ficar logo abaixo do botão. Só sobe quando realmente não há
    // espaço útil, evitando o salto exagerado que o Safari móvel fazia.
    const abaixo = rect.bottom + 6;
    const acima = rect.top - altura - 6;
    let top = abaixo;

    if (abaixo + altura > alturaViewport - margem && acima >= margem) {
        top = acima;
    }

    top = clamp(top, margem, Math.max(margem, alturaViewport - altura - margem));

    card.style.left = `${Math.round(left)}px`;
    card.style.top = `${Math.round(top)}px`;
}

function limiteProximoMes() {
    if (!dataMaxima) return false;
    return (
        mesAtual.getFullYear() > dataMaxima.getFullYear()
        || (
            mesAtual.getFullYear() === dataMaxima.getFullYear()
            && mesAtual.getMonth() >= dataMaxima.getMonth()
        )
    );
}

function moverMes(delta) {
    if (!mesAtual) return;
    const candidato = new Date(mesAtual.getFullYear(), mesAtual.getMonth() + delta, 1);
    if (delta > 0 && dataMaxima) {
        const maxMes = new Date(dataMaxima.getFullYear(), dataMaxima.getMonth(), 1);
        if (candidato > maxMes) return;
    }
    mesAtual = candidato;
    renderizar();
}

function renderizar() {
    if (!root || !mesAtual) return;

    const monthLabel = root.querySelector("[data-cal-month]");
    const caption = root.querySelector("[data-cal-caption]");
    const grid = root.querySelector("[data-cal-grid]");
    const next = root.querySelector("[data-cal-next]");

    if (monthLabel) monthLabel.textContent = `${MESES[mesAtual.getMonth()]} ${mesAtual.getFullYear()}`;
    if (caption) caption.textContent = tituloAtual;
    if (next) next.disabled = limiteProximoMes();
    if (!grid) return;

    grid.innerHTML = "";
    const primeiro = new Date(mesAtual.getFullYear(), mesAtual.getMonth(), 1);
    const offset = primeiro.getDay();
    const ultimoDia = new Date(mesAtual.getFullYear(), mesAtual.getMonth() + 1, 0).getDate();
    const hoje = inicioDoDia(new Date());

    for (let i = 0; i < offset; i += 1) {
        const vazio = document.createElement("span");
        vazio.className = "srnk-calendar-empty";
        grid.appendChild(vazio);
    }

    for (let dia = 1; dia <= ultimoDia; dia += 1) {
        const data = new Date(mesAtual.getFullYear(), mesAtual.getMonth(), dia);
        const botao = document.createElement("button");
        botao.type = "button";
        botao.textContent = String(dia);
        botao.className = "srnk-calendar-day";

        if (mesmaData(data, hoje)) botao.classList.add("hoje");
        if (mesmaData(data, dataSelecionada)) botao.classList.add("selecionado");

        const futuro = dataMaxima && data > dataMaxima;
        botao.disabled = Boolean(futuro);
        if (!futuro) botao.addEventListener("click", () => selecionar(data));

        grid.appendChild(botao);
    }

    requestAnimationFrame(posicionar);
}

function selecionar(data) {
    const escolhida = inicioDoDia(data);
    dataSelecionada = escolhida;
    const callback = onSelectAtual;
    fecharCalendarioPopover();
    if (typeof callback === "function") callback(escolhida);
}

export function fecharCalendarioPopover() {
    if (!root) return;
    root.hidden = true;
    document.body.classList.remove("srnk-calendar-open");
    onSelectAtual = null;
    ancoraAtual = null;

    if (listenerResizeAtivo) {
        window.removeEventListener("resize", posicionar);
        window.removeEventListener("scroll", posicionar, true);
        window.visualViewport?.removeEventListener("resize", posicionar);
        window.visualViewport?.removeEventListener("scroll", posicionar);
        listenerResizeAtivo = false;
    }
}

export function abrirCalendarioPopover({
    ancora,
    data = new Date(),
    max = new Date(),
    titulo = "Escolher data",
    onSelect
} = {}) {
    if (!ancora) return;

    garantirEstrutura();

    dataSelecionada = inicioDoDia(data);
    dataMaxima = inicioDoDia(max || new Date());
    if (dataSelecionada > dataMaxima) dataSelecionada = new Date(dataMaxima);
    mesAtual = new Date(dataSelecionada.getFullYear(), dataSelecionada.getMonth(), 1);
    onSelectAtual = onSelect;
    ancoraAtual = ancora;
    tituloAtual = titulo;

    root.hidden = false;
    document.body.classList.add("srnk-calendar-open");
    renderizar();

    if (!listenerResizeAtivo) {
        window.addEventListener("resize", posicionar);
        window.addEventListener("scroll", posicionar, true);
        window.visualViewport?.addEventListener("resize", posicionar);
        window.visualViewport?.addEventListener("scroll", posicionar);
        listenerResizeAtivo = true;
    }

    requestAnimationFrame(posicionar);
}
