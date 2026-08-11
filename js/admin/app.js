import { auth } from "../firebase-init.js?v=9.5";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { inicializarContexto } from "../shared/data/context.js?v=9.5";
import { carregarConfiguracoesDoBanco } from "../shared/data/configuracoes-repository.js?v=9.5";
import { definirConfiguracoes } from "../shared/state.js?v=9.5";
import { initTheme } from "../shared/theme.js?v=9.5";
import { initConnectivity } from "../shared/connectivity.js?v=9.5";
import { mostrarErro } from "../shared/services/feedback-service.js?v=9.5";
import { exigirTrocaSenhaPrimeiroAcesso } from "../shared/primeiro-acesso.js?v=9.5";
import { aplicarPermissoesInterface, usuarioEhAdmin, podeUsarVisaoBarbearia } from "../shared/permissoes.js?v=9.5";
import { migrarRepasseParaBaseBruta } from "../shared/data/migracao-repasse-bruto.js?v=9.5";
import { initNavigation, configurarNavegacao, abrirInicio, preloadInicio } from "./navigation.js?v=9.5";
import { limparSessaoArea, loginDaArea, marcarSessaoArea, sessaoPertenceArea } from "../shared/auth-area-session.js?v=9.5";

const AREA_ATUAL = "admin";
const SESSAO_DA_AREA_VALIDA = sessaoPertenceArea(AREA_ATUAL);
if (!SESSAO_DA_AREA_VALIDA) {
    window.location.replace(loginDaArea(AREA_ATUAL, { motivo: "sessao-area" }));
}

let appInicializado = false;
let interfaceLiberada = false;
const PREVIEW_DELAY_MS = 90;
const preloadPrimeiraTela = SESSAO_DA_AREA_VALIDA ? preloadInicio() : Promise.resolve();

document.body.dataset.srnkVisao = "barbearia";
document.body.dataset.srnkArea = "admin";
initTheme();
initConnectivity();
initNavigation();

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

function mostrarInterfaceOtimista() {
    if (appInicializado || !document.body.classList.contains("dashboard-booting")) return;
    document.body.classList.remove("dashboard-booting");
    document.body.classList.add("session-pending");
    const status = document.getElementById("appBootStatus");
    status?.removeAttribute("hidden");
    const subtitle = status?.querySelector(".app-boot-subtitle");
    if (subtitle) subtitle.textContent = "Validando sua sessão…";
}

bloquearInterface();
const previewTimer = SESSAO_DA_AREA_VALIDA ? window.setTimeout(mostrarInterfaceOtimista, PREVIEW_DELAY_MS) : 0;

function finalizarBoot({ liberar = true } = {}) {
    clearTimeout(previewTimer);
    document.body.classList.remove("dashboard-booting");
    if (liberar) liberarInterface();
    document.getElementById("appBootStatus")?.setAttribute("hidden", "");
}

async function iniciar(user) {
    const contexto = await inicializarContexto(user);

    if (contexto.perfil?.trocarSenha === true) {
        await exigirTrocaSenhaPrimeiroAcesso(contexto);
    }

    if (!(usuarioEhAdmin() && podeUsarVisaoBarbearia())) {
        const error = new Error("Esta conta não possui acesso administrativo.");
        error.code = "SEM_ACESSO";
        throw error;
    }

    aplicarPermissoesInterface();

    let configuracoes = await carregarConfiguracoesDoBanco();
    const status = document.getElementById("appBootStatus");
    const subtitle = status?.querySelector(".app-boot-subtitle");
    if (configuracoes?.migracaoRepasseBrutoV1 !== true && subtitle) {
        subtitle.textContent = "Atualizando regra financeira…";
    }
    configuracoes = await migrarRepasseParaBaseBruta(configuracoes);
    definirConfiguracoes(configuracoes);
    configurarNavegacao();

    await preloadPrimeiraTela.catch(() => null);
    await abrirInicio();

    appInicializado = true;
    marcarSessaoArea(AREA_ATUAL);
    finalizarBoot({ liberar: true });
}

onAuthStateChanged(auth, async (user) => {
    if (!SESSAO_DA_AREA_VALIDA) return;

    if (!user) {
        clearTimeout(previewTimer);
        limparSessaoArea();
        window.location.replace(loginDaArea(AREA_ATUAL));
        return;
    }
    if (appInicializado) return;

    try {
        await iniciar(user);
    } catch (error) {
        console.error("[Admin] Falha ao iniciar:", error);

        if (error?.code === "ACESSO_DESATIVADO" || error?.code === "SEM_ACESSO") {
            limparSessaoArea();
            await signOut(auth);
            window.location.replace(loginDaArea(AREA_ATUAL, {
                motivo: error.code === "ACESSO_DESATIVADO" ? "desativado" : "sem-acesso"
            }));
            return;
        }

        finalizarBoot({ liberar: false });
        mostrarErro("Não foi possível carregar a gestão da barbearia. Confira sua conexão e tente novamente.");
    }
});
