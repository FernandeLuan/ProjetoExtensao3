import { abrirPainelHoje } from "./painel.js?v=7.4";
import { abrirHistoricoHoje } from "./historico.js?v=8.4";
import { prepararRelatoriosHoje } from "./relatorios.js?v=8.11";
import { abrirDespesasAtual } from "./despesas.js?v=8.10";
import { abrirEquipe } from "./equipe.js?v=8.11";
import { abrirConta } from "./conta.js?v=8.11";
import { prepararRetroativoParaUso } from "./retroativo.js?v=8.10";
import { abrirVisaoGeralBarbearia } from "./barbearia-home.js?v=8.4";
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

export function configurarNavegacaoParaVisao() {
    if (visaoEhBarbearia()) {
        definirItemNav("1", { target: "barbeariaHome", icone: "fas fa-store", label: "Visão geral" });
        definirItemNav("2", { target: "historico", icone: "fas fa-clock-rotate-left", label: "Histórico" });
        definirItemNav("3", { target: "equipe", icone: "fas fa-users", label: "Equipe" });
        definirItemNav("4", { target: "relatorios", icone: "fas fa-file-lines", label: "Relatório" });
    } else {
        definirItemNav("1", { target: "registrar", icone: "fas fa-house", label: "Início" });
        definirItemNav("2", { target: "painelFinanceiro", icone: "fas fa-chart-line", label: "Painel" });
        definirItemNav("3", { target: "historico", icone: "fas fa-clock-rotate-left", label: "Histórico" });
        definirItemNav("4", { target: "relatorios", icone: "fas fa-file-lines", label: "Relatório" });
    }

    aplicarPermissoesInterface();
}

function atualizarNavegacaoAtiva(targetId) {
    itensBottomNav().forEach((item) => {
        const ativo = item.dataset.navTarget === targetId;
        item.classList.toggle("active", ativo);
        if (ativo) item.setAttribute("aria-current", "page");
        else item.removeAttribute("aria-current");
    });

    menuToggle?.classList.toggle(
        "active",
        ["configuracoes", "despesas", "conta"].includes(targetId)
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

    sidebarMenu?.querySelectorAll("a").forEach((link) => {
        link.addEventListener("click", (event) => {
            if (link.id === "logoutBtnSide") return;
            event.preventDefault();
            void exibirSecao(link.getAttribute("href"));
            fecharMenu();
        });
    });
}
