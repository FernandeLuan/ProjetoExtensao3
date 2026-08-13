import { auth } from "../firebase-init.js?v=13.0";
import { signOut } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { state, onStateChange } from "../shared/state.js?v=13.0";
import { podeUsarVisaoProfissional } from "../shared/permissoes.js?v=13.0";
import { mostrarErro } from "../shared/services/feedback-service.js?v=13.0";
import { iniciarLoadingTela, finalizarLoadingTela } from "../shared/services/ui-loading-service.js?v=13.0";
import { limparSessaoArea, marcarSessaoArea } from "../shared/auth-area-session.js?v=13.0";

let inicializado = false;
let secaoAtual = null;
const modulos = new Map();
const carregamentos = new Map();
const execucoesSecao = new Map();
const menuToggle = document.getElementById("menuToggle");
const sidebarMenu = document.getElementById("sidebarMenu");
const sidebarOverlay = document.getElementById("sidebarOverlay");
const ORDEM_PADRAO = ["barbeariaHome", "historico", "equipe", "relatorios", "estoque", "despesas", "configuracoes", "conta"];
const NAV = {
    barbeariaHome: { target: "barbeariaHome", icone: "fas fa-store", label: "Visão geral" },
    historico: { target: "historico", icone: "fas fa-clock-rotate-left", label: "Histórico" },
    equipe: { target: "equipe", icone: "fas fa-users", label: "Equipe" },
    relatorios: { target: "relatorios", icone: "fas fa-file-invoice-dollar", label: "Fechamento" },
    estoque: { target: "estoque", icone: "fas fa-boxes-stacked", label: "Estoque" },
    despesas: { target: "despesas", icone: "fas fa-receipt", label: "Despesas" },
    configuracoes: { target: "configuracoes", icone: "fas fa-sliders-h", label: "Configurações" },
    conta: { target: "conta", icone: "fas fa-user-lock", label: "Minha conta" }
};
const MENSAGENS = { barbeariaHome: "Atualizando visão geral...", historico: "Buscando histórico...", equipe: "Carregando equipe...", relatorios: "Preparando fechamento...", estoque: "Carregando estoque...", despesas: "Carregando despesas...", configuracoes: "Carregando configurações...", conta: "Carregando sua conta..." };

function ordemCompleta() {
    const salva = Array.isArray(state.configSistema?.ordemNavBarbearia) ? state.configSistema.ordemNavBarbearia : [];
    const ordem = salva.filter((k, i, lista) => ORDEM_PADRAO.includes(k) && lista.indexOf(k) === i);
    ORDEM_PADRAO.forEach((k) => { if (!ordem.includes(k)) ordem.push(k); });
    return ordem.slice(0, ORDEM_PADRAO.length);
}
function definirSlot(slot, meta) { const item = document.querySelector(`[data-nav-slot="${slot}"]`); if (!item || !meta) return; item.dataset.navTarget = meta.target; item.href = `#${meta.target}`; const i = item.querySelector("i"), s = item.querySelector("span"); if (i) i.className = meta.icone; if (s) s.textContent = meta.label; }
export function configurarNavegacao() {
    const ordem = ordemCompleta();
    ordem.slice(0, 4).forEach((k, i) => definirSlot(String(i + 1), NAV[k]));
    const lista = sidebarMenu?.querySelector("ul"); if (!lista) return;
    const voltar = podeUsarVisaoProfissional() ? '<li><a class="menu-area-switch" data-area-destino="profissional" href="../profissional/"><i class="fas fa-user"></i><span>Área profissional</span></a></li>' : "";
    lista.innerHTML = `${ordem.slice(4).map((k) => NAV[k]).filter(Boolean).map((m) => `<li><a href="#${m.target}"><i class="${m.icone}"></i><span>${m.label}</span></a></li>`).join("")}${voltar}<li aria-hidden="true" class="menu-divider"></li><li><a class="menu-logout" href="#"><i class="fas fa-sign-out-alt"></i><span>Sair do sistema</span></a></li>`;
}
function itensBottomNav() { return [...document.querySelectorAll(".bottom-nav-item[data-nav-target]")]; }
function abrirMenu() { sidebarMenu?.classList.add("active"); sidebarOverlay?.classList.add("active"); menuToggle?.classList.add("menu-open"); menuToggle?.setAttribute("aria-expanded", "true"); }
export function fecharMenu() { sidebarMenu?.classList.remove("active"); sidebarOverlay?.classList.remove("active"); menuToggle?.classList.remove("menu-open"); menuToggle?.setAttribute("aria-expanded", "false"); }
function atualizarAtivo(targetId) { let ativoNaBarra = false; itensBottomNav().forEach((item) => { const ativo = item.dataset.navTarget === targetId; ativoNaBarra ||= ativo; item.classList.toggle("active", ativo); if (ativo) item.setAttribute("aria-current", "page"); else item.removeAttribute("aria-current"); }); menuToggle?.classList.toggle("active", !ativoNaBarra && ORDEM_PADRAO.includes(targetId)); }
function preaquecerOutraArea() {
    const executar = () => { void fetch("../profissional/", { credentials: "same-origin", cache: "force-cache" }).catch(() => null); };
    if ("requestIdleCallback" in window) window.requestIdleCallback(executar, { timeout: 2200 });
    else window.setTimeout(executar, 1200);
}

function preaquecerHistorico() { const executar = () => { void importar("historico", "../shared/historico.js?v=13.4").catch(() => null); }; if ("requestIdleCallback" in window) window.requestIdleCallback(executar, { timeout: 1800 }); else window.setTimeout(executar, 900); }
function rolarParaOTopo({ suave = true } = {}) {
    const behavior = suave ? "smooth" : "auto";
    const secao = secaoAtual ? document.getElementById(secaoAtual) : null;
    const main = document.querySelector(".dashboard-main");

    const zerar = (modo = behavior) => {
        // Safari/PWA pode alternar o elemento responsável pela rolagem entre
        // window, documentElement e body. Zeramos todos os candidatos e o main.
        [main, document.scrollingElement, document.documentElement, document.body]
            .filter(Boolean)
            .forEach((alvo) => {
                try { alvo.scrollTo?.({ top: 0, left: 0, behavior: modo }); }
                catch (_) { try { alvo.scrollTop = 0; } catch (_) {} }
                try { alvo.scrollTop = 0; } catch (_) {}
            });
        try { window.scrollTo({ top: 0, left: 0, behavior: modo }); }
        catch (_) { try { window.scrollTo(0, 0); } catch (_) {} }
    };

    // Primeiro posiciona a seção ativa no viewport; em seguida zera o documento.
    // A repetição curta cobre o momentum scroll do iOS sem recarregar a seção.
    try { (secao || main)?.scrollIntoView?.({ behavior, block: "start", inline: "nearest" }); } catch (_) {}
    zerar();
    requestAnimationFrame(() => zerar());
    window.setTimeout(() => zerar("auto"), 80);
    window.setTimeout(() => zerar("auto"), 260);
}

function animar(section) { section.classList.remove("section-enter"); void section.offsetWidth; section.classList.add("section-enter"); setTimeout(() => section.classList.remove("section-enter"), 220); }
async function importar(chave, caminho) { if (modulos.has(chave)) return modulos.get(chave); if (carregamentos.has(chave)) return carregamentos.get(chave); const p = import(caminho).then((m) => { modulos.set(chave, m); carregamentos.delete(chave); return m; }).catch((e) => { carregamentos.delete(chave); throw e; }); carregamentos.set(chave, p); return p; }
export function preloadInicio() { return importar("barbeariaHome", "../shared/barbearia-home.js?v=13.4"); }
async function carregar(targetId) {
    switch (targetId) {
        case "barbeariaHome": { const m = await importar("barbeariaHome", "../shared/barbearia-home.js?v=13.4"); await m.abrirVisaoGeralBarbearia?.(); return; }
        case "historico": { const m = await importar("historico", "../shared/historico.js?v=13.4"); await m.abrirHistoricoHoje?.(); return; }
        case "equipe": { const m = await importar("equipe", "../shared/equipe.js?v=13.0"); m.initEquipe?.(); await m.abrirEquipe?.(); return; }
        case "relatorios": { const m = await importar("relatorios", "../shared/relatorios.js?v=13.4"); await m.initRelatorios?.(); await m.prepararRelatoriosHoje?.(); return; }
        case "estoque": { const m = await importar("estoque", "../shared/estoque.js?v=13.4"); m.initEstoque?.(); await m.abrirEstoque?.(); return; }
        case "despesas": { const m = await importar("despesas", "../shared/despesas.js?v=13.0"); m.initDespesas?.(); await m.abrirDespesasAtual?.(); return; }
        case "conta": { const m = await importar("conta", "../shared/conta.js?v=13.0"); m.initConta?.(); await m.abrirConta?.(); return; }
        case "configuracoes": { const [c, r] = await Promise.all([importar("configuracoes", "../shared/configuracoes.js?v=13.4"), importar("retroativo", "../shared/retroativo.js?v=13.4")]); c.initConfiguracoes?.(); await r.initRetroativo?.(); await r.prepararRetroativoParaUso?.(); return; }
    }
}
function iniciarCarregamento(targetId, section) { section?.setAttribute("aria-busy", "true"); section?.classList.add("section-module-loading"); if (execucoesSecao.has(targetId)) return execucoesSecao.get(targetId); const token = document.body.classList.contains("session-pending") || document.body.classList.contains("dashboard-booting") ? null : iniciarLoadingTela(MENSAGENS[targetId] || "Carregando...", { delay: 420 }); const p = carregar(targetId).catch((e) => { console.error(`[Admin] Erro ao carregar ${targetId}:`, e); mostrarErro("Não foi possível abrir esta seção. Tente novamente."); throw e; }).finally(() => { finalizarLoadingTela(token); execucoesSecao.delete(targetId); section?.removeAttribute("aria-busy"); section?.classList.remove("section-module-loading"); }); execucoesSecao.set(targetId, p); return p; }
export async function exibirSecao(href) { if (!href?.startsWith("#")) return; const targetId = href.slice(1); if (!ORDEM_PADRAO.includes(targetId)) return exibirSecao("#barbeariaHome"); if (secaoAtual === targetId) { rolarParaOTopo({ suave: true }); return; } const target = document.querySelector(href); if (!target) return; document.querySelectorAll("main > section").forEach((s) => { s.style.display = "none"; }); target.style.display = "block"; rolarParaOTopo({ suave: false }); animar(target); secaoAtual = targetId; atualizarAtivo(targetId); return iniciarCarregamento(targetId, target); }
export async function abrirInicio() { fecharMenu(); await exibirSecao("#barbeariaHome"); preaquecerHistorico(); }
async function logout() { try { limparSessaoArea(); await signOut(auth); } finally { window.location.href = "./login.html"; } }
export function initNavigation() { if (inicializado) return; inicializado = true; preaquecerOutraArea(); menuToggle?.addEventListener("click", () => sidebarMenu?.classList.contains("active") ? fecharMenu() : abrirMenu()); sidebarOverlay?.addEventListener("click", fecharMenu); document.addEventListener("keydown", (e) => { if (e.key === "Escape") fecharMenu(); }); document.querySelector(".bottom-nav")?.addEventListener("click", (e) => { const item = e.target.closest(".bottom-nav-item[data-nav-target]"); if (!item) return; e.preventDefault(); fecharMenu(); if (item.dataset.navTarget === secaoAtual) { rolarParaOTopo({ suave: true }); return; } void exibirSecao(`#${item.dataset.navTarget}`); }); sidebarMenu?.addEventListener("click", (e) => { const link = e.target.closest("a"); if (!link) return; if (link.classList.contains("menu-logout")) { e.preventDefault(); void logout(); return; } if (link.classList.contains("menu-area-switch")) { e.preventDefault(); if (link.dataset.areaDestino === "profissional" && podeUsarVisaoProfissional()) { sessionStorage.setItem("srnk:troca-area-rapida", "1"); marcarSessaoArea("profissional"); window.location.href = "../profissional/"; } return; } const href = link.getAttribute("href"); if (href?.startsWith("#")) { e.preventDefault(); void exibirSecao(href); fecharMenu(); } }); onStateChange("configSistema", configurarNavegacao); }
