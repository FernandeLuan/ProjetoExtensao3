import { abrirPainelHoje } from "./painel.js?v=4.0";
import { abrirHistoricoHoje } from "./historico.js?v=4.0";
import { prepararRelatoriosHoje } from "./relatorios.js?v=4.0";

let inicializado = false;

const menuToggle = document.getElementById("menuToggle");
const sidebarMenu = document.getElementById("sidebarMenu");
const sidebarOverlay = document.getElementById("sidebarOverlay");
const bottomNavItems = document.querySelectorAll(".bottom-nav-item[data-nav-target]");

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

function atualizarNavegacaoAtiva(targetId) {
    bottomNavItems.forEach((item) => {
        const ativo = item.dataset.navTarget === targetId;
        item.classList.toggle("active", ativo);
        if (ativo) item.setAttribute("aria-current", "page");
        else item.removeAttribute("aria-current");
    });
    menuToggle?.classList.toggle("active", ["configuracoes", "conta"].includes(targetId));
}

function animarEntradaSecao(section) {
    section.classList.remove("section-enter");
    void section.offsetWidth;
    section.classList.add("section-enter");
    setTimeout(() => section.classList.remove("section-enter"), 220);
}

export function exibirSecao(href) {
    if (!href?.startsWith("#")) return;
    const target = document.querySelector(href);
    if (!target) return;

    document.querySelectorAll("main > section").forEach((section) => {
        section.style.display = "none";
    });
    target.style.display = "block";
    animarEntradaSecao(target);
    atualizarNavegacaoAtiva(href.slice(1));

    if (href === "#painelFinanceiro") abrirPainelHoje();
    if (href === "#historico") abrirHistoricoHoje();
    if (href === "#relatorios") prepararRelatoriosHoje();
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

    bottomNavItems.forEach((item) => {
        item.addEventListener("click", (event) => {
            event.preventDefault();
            exibirSecao(`#${item.dataset.navTarget}`);
        });
    });

    sidebarMenu?.querySelectorAll("a").forEach((link) => {
        link.addEventListener("click", (event) => {
            if (link.id === "logoutBtnSide") return;
            event.preventDefault();
            exibirSecao(link.getAttribute("href"));
            fecharMenu();
        });
    });
}
