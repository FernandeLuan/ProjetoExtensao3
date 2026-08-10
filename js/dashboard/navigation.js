import { abrirPainelHoje } from "./painel.js?v=8.22";
import { auth } from "../firebase-init.js?v=7.4";
import { signOut } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { state, onStateChange } from "./state.js?v=7.4";
import { abrirRegistrar } from "./registrar.js?v=8.16";
import { abrirHistoricoHoje } from "./historico.js?v=8.22";
import { prepararRelatoriosHoje } from "./relatorios.js?v=8.22";
import { abrirDespesasAtual } from "./despesas.js?v=8.10";
import { abrirEquipe } from "./equipe.js?v=8.22";
import { abrirConta } from "./conta.js?v=8.22";
import { prepararRetroativoParaUso } from "./retroativo.js?v=8.22";
import { abrirVisaoGeralBarbearia } from "./barbearia-home.js?v=8.22";
import {
    aplicarPermissoesInterface,
    obterSecaoInicialVisao,
    podeAcessarSecao,
    visaoEhBarbearia
} from "./permissoes.js?v=7.5";

let inicializado = false;

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
    "despesas",
    "configuracoes",
    "conta"
];
const NAV_BARBEARIA = {
    barbeariaHome: { target: "barbeariaHome", icone: "fas fa-store", label: "Visão geral" },
    historico: { target: "historico", icone: "fas fa-clock-rotate-left", label: "Histórico" },
    equipe: { target: "equipe", icone: "fas fa-users", label: "Equipe" },
    relatorios: { target: "relatorios", icone: "fas fa-file-lines", label: "Relatório" },
    despesas: { target: "despesas", icone: "fas fa-receipt", label: "Despesas" },
    configuracoes: { target: "configuracoes", icone: "fas fa-sliders-h", label: "Configurações" },
    conta: { target: "conta", icone: "fas fa-user-lock", label: "Minha Conta" }
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
            { target: "despesas", icone: "fas fa-receipt", label: "Despesas" },
            { target: "conta", icone: "fas fa-user-lock", label: "Minha Conta" }
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
                <span>Sair do Sistema</span>
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

    if (href === "#registrar") await abrirRegistrar();
    if (href === "#barbeariaHome") await abrirVisaoGeralBarbearia();
    if (href === "#painelFinanceiro") void abrirPainelHoje();
    if (href === "#historico") void abrirHistoricoHoje();
    if (href === "#relatorios") void prepararRelatoriosHoje();
    if (href === "#despesas") void abrirDespesasAtual();
    if (href === "#equipe") void abrirEquipe();
    if (href === "#conta") void abrirConta();
    if (href === "#configuracoes") void prepararRetroativoParaUso();
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

    // A ordem salva pelo administrador é aplicada assim que a configuração chega do Firestore.
    onStateChange("configSistema", configurarNavegacaoParaVisao);
}
