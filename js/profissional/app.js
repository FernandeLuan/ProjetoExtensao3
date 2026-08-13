import { auth } from "../firebase-init.js?v=13.0";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { inicializarContexto } from "../shared/data/context.js?v=13.0";
import { carregarConfiguracoesDoBanco } from "../shared/data/configuracoes-repository.js?v=13.0";
import { definirConfiguracoes } from "../shared/state.js?v=13.0";
import { initTheme } from "../shared/theme.js?v=13.0";
import { initConnectivity } from "../shared/connectivity.js?v=13.0";
import { mostrarErro } from "../shared/services/feedback-service.js?v=13.0";
import { exigirTrocaSenhaPrimeiroAcesso } from "../shared/primeiro-acesso.js?v=13.0";
import { aplicarPermissoesInterface, podeUsarVisaoProfissional } from "../shared/permissoes.js?v=13.0";
import { initNavigation, configurarNavegacao, abrirInicio, preloadInicio } from "./navigation.js?v=13.4";
import { limparSessaoArea, loginDaArea, marcarSessaoArea, sessaoPertenceArea } from "../shared/auth-area-session.js?v=13.0";

const AREA_ATUAL = "profissional";
const SESSAO_DA_AREA_VALIDA = sessaoPertenceArea(AREA_ATUAL);
if (!SESSAO_DA_AREA_VALIDA) {
    window.location.replace(loginDaArea(AREA_ATUAL, { motivo: "sessao-area" }));
}

let appInicializado = false;
let interfaceLiberada = false;
const inicioBoot = performance.now();
const TROCA_AREA_RAPIDA = sessionStorage.getItem("srnk:troca-area-rapida") === "1";
if (TROCA_AREA_RAPIDA) sessionStorage.removeItem("srnk:troca-area-rapida");
const BOOT_MINIMO_MS = TROCA_AREA_RAPIDA ? 0 : 700;
const preloadPrimeiraTela = SESSAO_DA_AREA_VALIDA ? preloadInicio() : Promise.resolve();

document.body.dataset.srnkVisao = "profissional";
document.body.dataset.srnkArea = "profissional";
initTheme();
initConnectivity();
initNavigation();

const estiloFinanceiro = document.createElement("style");
estiloFinanceiro.dataset.srnkVersion = "1.3.9";
estiloFinanceiro.textContent = `
#painelFinanceiro .finance-main-value {
    font-size: 1.78rem !important;
    font-weight: 700 !important;
    line-height: 1.08 !important;
    letter-spacing: -0.03em !important;
}
#painelFinanceiro .finance-mini-value {
    font-size: 1.2rem !important;
    font-weight: 540 !important;
    line-height: 1.2 !important;
}
#painelFinanceiro .finance-summary-item strong {
    font-size: 1.2rem !important;
    font-weight: 600 !important;
    line-height: 1.2 !important;
}
#painelFinanceiro .finance-service-card-compact {
    min-height: 0 !important;
    height: auto !important;
    padding: 13px 12px 14px !important;
    margin-bottom: 10px !important;
}
#painelFinanceiro .finance-service-card-compact .finance-service-name {
    font-size: 1.2rem !important;
    font-weight: 600 !important;
    line-height: 1.2 !important;
}
`;
document.head.appendChild(estiloFinanceiro);

const elementosBloqueados = [
    document.querySelector(".dashboard-main"),
    document.querySelector(".bottom-nav"),
    document.getElementById("sidebarMenu")
].filter(Boolean);

function bloquearInterface() {
    document.body.classList.add("session-pending");
    elementosBloqueados.forEach((elemento) => {
        elemento.setAttribute("inert", "");
        elemento.setAttribute("aria-busy", "true");
    });
}

function liberarInterface() {
    if (interfaceLiberada) return;
    interfaceLiberada = true;
    document.body.classList.remove("session-pending");
    elementosBloqueados.forEach((elemento) => {
        elemento.removeAttribute("inert");
        elemento.removeAttribute("aria-busy");
    });
}

bloquearInterface();

async function finalizarBoot({ liberar = true, respeitarMinimo = true } = {}) {
    if (respeitarMinimo) {
        const restante = Math.max(0, BOOT_MINIMO_MS - (performance.now() - inicioBoot));
        if (restante > 0) await new Promise((resolve) => setTimeout(resolve, restante));
    }

    document.body.classList.remove("dashboard-booting");
    if (liberar) liberarInterface();
    document.getElementById("appBootStatus")?.setAttribute("hidden", "");
}

async function iniciar(user) {
    const contexto = await inicializarContexto(user);

    if (contexto.perfil?.trocarSenha === true) {
        await exigirTrocaSenhaPrimeiroAcesso(contexto);
    }

    if (!podeUsarVisaoProfissional()) {
        const error = new Error("Esta conta não possui acesso profissional.");
        error.code = "SEM_ACESSO";
        throw error;
    }

    aplicarPermissoesInterface();
    definirConfiguracoes(await carregarConfiguracoesDoBanco());
    configurarNavegacao();

    const statusBoot = document.getElementById("appBootStatus");
    const subtituloBoot = statusBoot?.querySelector(".app-boot-subtitle");
    if (subtituloBoot) subtituloBoot.textContent = "Preparando atendimentos…";

    await preloadPrimeiraTela.catch(() => null);
    await abrirInicio();

    appInicializado = true;
    marcarSessaoArea(AREA_ATUAL);
    await finalizarBoot({ liberar: true });
}

onAuthStateChanged(auth, async (user) => {
    if (!SESSAO_DA_AREA_VALIDA) return;

    if (!user) {
        limparSessaoArea();
        window.location.replace(loginDaArea(AREA_ATUAL));
        return;
    }
    if (appInicializado) return;

    try {
        await iniciar(user);
    } catch (error) {
        console.error("[Profissional] Falha ao iniciar:", error);

        if (error?.code === "ACESSO_DESATIVADO" || error?.code === "SEM_ACESSO") {
            limparSessaoArea();
            await signOut(auth);
            window.location.replace(loginDaArea(AREA_ATUAL, {
                motivo: error.code === "ACESSO_DESATIVADO" ? "desativado" : "sem-acesso"
            }));
            return;
        }

        await finalizarBoot({ liberar: false, respeitarMinimo: false });
        mostrarErro("Não foi possível carregar seu ambiente. Confira sua conexão e tente novamente.");
    }
});
