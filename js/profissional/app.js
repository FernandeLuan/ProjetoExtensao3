import { auth } from "../firebase-init.js?v=9.3";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { inicializarContexto } from "../shared/data/context.js?v=9.3";
import { carregarConfiguracoesDoBanco } from "../shared/data/configuracoes-repository.js?v=9.3";
import { definirConfiguracoes } from "../shared/state.js?v=9.3";
import { initTheme } from "../shared/theme.js?v=9.3";
import { initConnectivity } from "../shared/connectivity.js?v=9.3";
import { mostrarErro } from "../shared/services/feedback-service.js?v=9.3";
import { exigirTrocaSenhaPrimeiroAcesso } from "../shared/primeiro-acesso.js?v=9.3";
import { aplicarPermissoesInterface, podeUsarVisaoProfissional } from "../shared/permissoes.js?v=9.3";
import { iniciarMedicao, finalizarMedicao, medirAsync, registrarEventoPerf } from "../shared/services/perf-service.js?v=9.3";
import { initNavigation, configurarNavegacao, abrirInicio, preloadInicio } from "./navigation.js?v=9.3";
import {
    debugPerfAtivoNaUrl,
    limparSessaoArea,
    loginDaArea,
    marcarSessaoArea,
    sessaoPertenceArea
} from "../shared/auth-area-session.js?v=9.3";

const AREA_ATUAL = "profissional";
const SESSAO_DA_AREA_VALIDA = sessaoPertenceArea(AREA_ATUAL);
if (!SESSAO_DA_AREA_VALIDA) {
    window.location.replace(loginDaArea(AREA_ATUAL, {
        motivo: "sessao-area",
        debugPerf: debugPerfAtivoNaUrl()
    }));
}

let appInicializado = false;
let interfaceLiberada = false;
const inicioBoot = performance.now();
const PREVIEW_DELAY_MS = 90;
const medicaoBoot = iniciarMedicao("BOOT total", "profissional");
const medicaoAuth = iniciarMedicao("Firebase Auth", "profissional");
const medicaoPrimeiroVisual = iniciarMedicao("Primeiro visual", "profissional");
let primeiroVisualFinalizado = false;

// Importa/evalua a primeira tela enquanto o Firebase Auth restaura a sessão.
// Isso tira o import do caminho crítico pós-auth sem acessar dados privados.
const preloadPrimeiraTela = SESSAO_DA_AREA_VALIDA ? preloadInicio() : Promise.resolve();

document.body.dataset.srnkVisao = "profissional";
document.body.dataset.srnkArea = "profissional";
initTheme();
initConnectivity();
initNavigation();
registrarEventoPerf("Bootstrap JS iniciado", "profissional");

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
    registrarEventoPerf("Interface liberada", "profissional");
}

function finalizarPrimeiroVisual(detalhe) {
    if (primeiroVisualFinalizado) return;
    primeiroVisualFinalizado = true;
    finalizarMedicao(medicaoPrimeiroVisual, detalhe);
}

function mostrarInterfaceOtimista() {
    if (appInicializado || !document.body.classList.contains("dashboard-booting")) return;
    document.body.classList.remove("dashboard-booting");
    document.body.classList.add("session-pending");
    const status = document.getElementById("appBootStatus");
    status?.removeAttribute("hidden");
    const subtitle = status?.querySelector(".app-boot-subtitle");
    if (subtitle) subtitle.textContent = "Validando sua sessão…";
    finalizarPrimeiroVisual("otimista");
    registrarEventoPerf("Interface otimista visível", `${Math.round(performance.now() - inicioBoot)} ms`);
}

bloquearInterface();
const previewTimer = SESSAO_DA_AREA_VALIDA ? window.setTimeout(mostrarInterfaceOtimista, PREVIEW_DELAY_MS) : 0;

function finalizarBoot({ liberar = true } = {}) {
    clearTimeout(previewTimer);
    finalizarPrimeiroVisual("app pronto");
    document.body.classList.remove("dashboard-booting");
    if (liberar) liberarInterface();
    const status = document.getElementById("appBootStatus");
    status?.setAttribute("hidden", "");
}

async function iniciar(user) {
    const contexto = await medirAsync("Contexto", () => inicializarContexto(user));

    if (contexto.perfil?.trocarSenha === true) {
        await medirAsync("Primeiro acesso", () => exigirTrocaSenhaPrimeiroAcesso(contexto));
    }

    if (!podeUsarVisaoProfissional()) {
        const error = new Error("Esta conta não possui acesso profissional.");
        error.code = "SEM_ACESSO";
        throw error;
    }

    aplicarPermissoesInterface();

    const configuracoes = await medirAsync("Configurações", () => carregarConfiguracoesDoBanco());
    definirConfiguracoes(configuracoes);
    configurarNavegacao();

    await preloadPrimeiraTela.catch(() => null);
    await medirAsync("Tela inicial", () => abrirInicio());

    appInicializado = true;
    marcarSessaoArea(AREA_ATUAL);
    finalizarBoot({ liberar: true });
    finalizarMedicao(medicaoBoot);
}

onAuthStateChanged(auth, async (user) => {
    if (!SESSAO_DA_AREA_VALIDA) return;
    finalizarMedicao(medicaoAuth, user ? "sessão encontrada" : "sem sessão");
    registrarEventoPerf("Auth resolvido", user ? "sessão encontrada" : "sem sessão");

    if (!user) {
        clearTimeout(previewTimer);
        limparSessaoArea();
        window.location.replace(loginDaArea(AREA_ATUAL, { debugPerf: debugPerfAtivoNaUrl() }));
        return;
    }
    if (appInicializado) return;

    try {
        await iniciar(user);
    } catch (error) {
        console.error("[Profissional] Falha ao iniciar:", error);
        finalizarMedicao(medicaoBoot, "erro");

        if (error?.code === "ACESSO_DESATIVADO" || error?.code === "SEM_ACESSO") {
            limparSessaoArea();
            await signOut(auth);
            window.location.replace(loginDaArea(AREA_ATUAL, {
                motivo: error.code === "ACESSO_DESATIVADO" ? "desativado" : "sem-acesso",
                debugPerf: debugPerfAtivoNaUrl()
            }));
            return;
        }

        finalizarBoot({ liberar: false });
        mostrarErro("Não foi possível carregar seu ambiente. Confira sua conexão e tente novamente.");
    }
});
