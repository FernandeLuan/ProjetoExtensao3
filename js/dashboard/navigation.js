import { auth } from "../firebase-init.js?v=8.30";
import { signOut } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { state, onStateChange } from "./state.js?v=8.30";
import { mostrarErro } from "./services/feedback-service.js?v=8.30";
import {
    aplicarPermissoesInterface,
    obterSecaoInicialVisao,
    podeAcessarSecao,
    visaoEhBarbearia
} from "./permissoes.js?v=8.30";

let inicializado = false;
const modulos = new Map();
const carregamentos = new Map();
const execucoesSecao = new Map();

const menuToggle = document.getElementById("menuToggle");
const sidebarMenu = document.getElementById("sidebarMenu");
const sidebarOverlay = document.getElementById("sidebarOverlay");

async function authLogout() {
    try {
        await signOut(auth);
    } finally {
        window.location.href = "login.html";
    }
}

function itensBottomNav() {
    return [...document.querySelectorAll(".bottom-nav-item[data-nav-target]")];
}

function abrirMenu() {
    sidebarMenu?.classList.add("active");
    sidebarOverlay?.classList.add("active");
    menuToggle?.classList.add("menu-open");
    menuToggle?.setAttribute("aria-expanded", "true");
}

export function fecharMenu() {
    sidebarMenu?.classList.remove("active");
    sidebarOverlay?.classList.remove("active");
    menuToggle?.classList.remove("menu-open");
    menuToggle?.setAttribute("aria-expanded", "false");
}

function definirItemNav(slot, { target, icone, label }) {
    const item = document.querySelector(`[data-nav-slot="${slot}"]`);
    if (!item) return;

    item.dataset.navTarget = target;
    item.setAttribute("href", `#${target}`);

    const iconeEl = item.querySelector("i");
    const labelEl = item.querySelector("span");

    if (iconeEl) iconeEl.className = icone;
    if (labelEl) labelEl.textContent = label;
}

const ORDEM_NAV_PADRAO = [
    "barbeariaHome",
    "historico",
    "equipe",
    "relatorios",
    "estoque",
    "despesas",
    "configuracoes",
    "conta"
];

const NAV_BARBEARIA = {
    barbeariaHome: { target: "barbeariaHome", icone: "fas fa-store", label: "Visão geral" },
    historico: { target: "historico", icone: "fas fa-clock-rotate-left", label: "Histórico" },
    equipe: { target: "equipe", icone: "fas fa-users", label: "Equipe" },
    relatorios: { target: "relatorios", icone: "fas fa-file-lines", label: "Relatório" },
    estoque: { target: "estoque", icone: "fas fa-boxes-stacked", label: "Estoque" },
    despesas: { target: "despesas", icone: "fas fa-receipt", label: "Despesas" },
    configuracoes: { target: "configuracoes", icone: "fas fa-sliders-h", label: "Configurações" },
    conta: { target: "conta", icone: "fas fa-user-lock", label: "Minha conta" }
};

function ordemCompletaBarbearia() {
    const salva = Array.isArray(state.configSistema?.ordemNavBarbearia)
        ? state.configSistema.ordemNavBarbearia
        : [];
    const ordem = salva.filter((chave, indice, lista) =>
        ORDEM_NAV_PADRAO.includes(chave) && lista.indexOf(chave) === indice
    );
    ORDEM_NAV_PADRAO.forEach((chave) => {
        if (!ordem.includes(chave)) ordem.push(chave);
    });
    return ordem.slice(0, ORDEM_NAV_PADRAO.length);
}

function renderizarMenu(itens, { profissional = false } = {}) {
    const lista = sidebarMenu?.querySelector("ul");
    if (!lista) return;

    const itensVisiveis = profissional
        ? [
            { target: "estoque", icone: "fas fa-cart-shopping", label: "Vender produto" },
            { target: "despesas", icone: "fas fa-receipt", label: "Despesas" },
            { target: "conta", icone: "fas fa-user-lock", label: "Minha conta" }
        ]
        : itens.map((chave) => NAV_BARBEARIA[chave]).filter(Boolean);

    lista.innerHTML = `
        ${itensVisiveis.map((meta) => `
            <li>
                <a href="#${meta.target}">
                    <i class="${meta.icone}"></i>
                    <span>${meta.label}</span>
                </a>
            </li>
        `).join("")}
        <li aria-hidden="true" class="menu-divider"></li>
        <li>
            <a class="menu-logout" href="#" id="logoutBtnSide">
                <i class="fas fa-sign-out-alt"></i>
                <span>Sair do sistema</span>
            </a>
        </li>
    `;
}

export function configurarNavegacaoParaVisao() {
    if (visaoEhBarbearia()) {
        const ordem = ordemCompletaBarbearia();
        ordem.slice(0, 4).forEach((chave, indice) => {
            definirItemNav(String(indice + 1), NAV_BARBEARIA[chave]);
        });
        renderizarMenu(ordem.slice(4));
    } else {
        definirItemNav("1", { target: "registrar", icone: "fas fa-house", label: "Início" });
        definirItemNav("2", { target: "painelFinanceiro", icone: "fas fa-chart-line", label: "Painel" });
        definirItemNav("3", { target: "historico", icone: "fas fa-clock-rotate-left", label: "Histórico" });
        definirItemNav("4", { target: "relatorios", icone: "fas fa-file-lines", label: "Relatório" });
        renderizarMenu([], { profissional: true });
    }

    aplicarPermissoesInterface();
}

function atualizarNavegacaoAtiva(targetId) {
    let ativoNaBarra = false;

    itensBottomNav().forEach((item) => {
        const ativo = item.dataset.navTarget === targetId;
        ativoNaBarra = ativoNaBarra || ativo;
        item.classList.toggle("active", ativo);
        if (ativo) item.setAttribute("aria-current", "page");
        else item.removeAttribute("aria-current");
    });

    const destinosAdministrativos = [
        "barbeariaHome",
        "historico",
        "equipe",
        "relatorios",
        "estoque",
        "despesas",
        "configuracoes",
        "conta"
    ];

    menuToggle?.classList.toggle(
        "active",
        !ativoNaBarra && destinosAdministrativos.includes(targetId)
    );
}

function animarEntradaSecao(section) {
    section.classList.remove("section-enter");
    void section.offsetWidth;
    section.classList.add("section-enter");
    setTimeout(() => section.classList.remove("section-enter"), 220);
}

async function importarModulo(chave, caminho) {
    if (modulos.has(chave)) return modulos.get(chave);
    if (carregamentos.has(chave)) return carregamentos.get(chave);

    const promessa = import(caminho)
        .then((modulo) => {
            modulos.set(chave, modulo);
            carregamentos.delete(chave);
            return modulo;
        })
        .catch((error) => {
            carregamentos.delete(chave);
            throw error;
        });

    carregamentos.set(chave, promessa);
    return promessa;
}

async function carregarSecao(targetId) {
    switch (targetId) {
        case "registrar": {
            const modulo = await importarModulo("registrar", "./registrar.js?v=8.30");
            await modulo.initRegistrar?.();
            await modulo.abrirRegistrar?.();
            return;
        }
        case "barbeariaHome": {
            const modulo = await importarModulo("barbeariaHome", "./barbearia-home.js?v=8.30");
            await modulo.abrirVisaoGeralBarbearia?.();
            return;
        }
        case "painelFinanceiro": {
            const modulo = await importarModulo("painel", "./painel.js?v=8.30");
            await modulo.abrirPainelHoje?.();
            return;
        }
        case "historico": {
            const modulo = await importarModulo("historico", "./historico.js?v=8.30");
            await modulo.abrirHistoricoHoje?.();
            return;
        }
        case "relatorios": {
            const modulo = await importarModulo("relatorios", "./relatorios.js?v=8.30");
            await modulo.initRelatorios?.();
            await modulo.prepararRelatoriosHoje?.();
            return;
        }
        case "estoque": {
            const modulo = await importarModulo("estoque", "./estoque.js?v=8.30");
            modulo.initEstoque?.();
            await modulo.abrirEstoque?.();
            return;
        }
        case "despesas": {
            const modulo = await importarModulo("despesas", "./despesas.js?v=8.30");
            modulo.initDespesas?.();
            await modulo.abrirDespesasAtual?.();
            return;
        }
        case "equipe": {
            const modulo = await importarModulo("equipe", "./equipe.js?v=8.30");
            modulo.initEquipe?.();
            await modulo.abrirEquipe?.();
            return;
        }
        case "conta": {
            const modulo = await importarModulo("conta", "./conta.js?v=8.30");
            modulo.initConta?.();
            await modulo.abrirConta?.();
            return;
        }
        case "configuracoes": {
            const [configuracoes, retroativo] = await Promise.all([
                importarModulo("configuracoes", "./configuracoes.js?v=8.30"),
                importarModulo("retroativo", "./retroativo.js?v=8.30")
            ]);
            configuracoes.initConfiguracoes?.();
            await retroativo.initRetroativo?.();
            await retroativo.prepararRetroativoParaUso?.();
            return;
        }
        default:
            return;
    }
}

function iniciarCarregamentoSecao(targetId, section) {
    section?.setAttribute("aria-busy", "true");
    section?.classList.add("section-module-loading");

    if (execucoesSecao.has(targetId)) return;

    const execucao = carregarSecao(targetId)
        .catch((error) => {
            console.error(`Erro ao carregar a seção ${targetId}:`, error);
            mostrarErro("Não foi possível abrir esta seção. Tente novamente.");
        })
        .finally(() => {
            execucoesSecao.delete(targetId);
            section?.removeAttribute("aria-busy");
            section?.classList.remove("section-module-loading");
        });

    execucoesSecao.set(targetId, execucao);
}

export async function exibirSecao(href) {
    if (!href?.startsWith("#")) return;
    let targetId = href.slice(1);

    if (!podeAcessarSecao(targetId)) {
        targetId = obterSecaoInicialVisao();
        href = `#${targetId}`;
    }

    const target = document.querySelector(href);
    if (!target) return;

    document.querySelectorAll("main > section").forEach((section) => {
        section.style.display = "none";
    });
    target.style.display = "block";
    animarEntradaSecao(target);
    atualizarNavegacaoAtiva(targetId);

    // A navegação fica responsiva imediatamente. O módulo e os dados da seção
    // são carregados em segundo plano e não bloqueiam a abertura do aplicativo.
    iniciarCarregamentoSecao(targetId, target);
}

export async function abrirInicioDaVisaoAtual() {
    fecharMenu();
    await exibirSecao(`#${obterSecaoInicialVisao()}`);
}

export function initNavigation() {
    if (inicializado) return;
    inicializado = true;

    menuToggle?.addEventListener("click", () => {
        if (sidebarMenu?.classList.contains("active")) fecharMenu();
        else abrirMenu();
    });

    sidebarOverlay?.addEventListener("click", fecharMenu);
    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") fecharMenu();
    });

    document.querySelector(".bottom-nav")?.addEventListener("click", (event) => {
        const item = event.target.closest(".bottom-nav-item[data-nav-target]");
        if (!item) return;

        event.preventDefault();
        fecharMenu();
        void exibirSecao(`#${item.dataset.navTarget}`);
    });

    sidebarMenu?.addEventListener("click", (event) => {
        const link = event.target.closest("a");
        if (!link) return;

        if (link.id === "logoutBtnSide" || link.classList.contains("menu-logout")) {
            event.preventDefault();
            authLogout();
            return;
        }

        const href = link.getAttribute("href");
        if (!href?.startsWith("#")) return;
        event.preventDefault();
        void exibirSecao(href);
        fecharMenu();
    });

    onStateChange("configSistema", configurarNavegacaoParaVisao);
}
