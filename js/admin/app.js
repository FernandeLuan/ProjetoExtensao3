import { auth } from "../firebase-init.js?v=9.2";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { inicializarContexto } from "../shared/data/context.js?v=9.2";
import { carregarConfiguracoesDoBanco } from "../shared/data/configuracoes-repository.js?v=9.2";
import { definirConfiguracoes } from "../shared/state.js?v=9.2";
import { initTheme } from "../shared/theme.js?v=9.2";
import { initConnectivity } from "../shared/connectivity.js?v=9.2";
import { mostrarErro } from "../shared/services/feedback-service.js?v=9.2";
import { exigirTrocaSenhaPrimeiroAcesso } from "../shared/primeiro-acesso.js?v=9.2";
import { aplicarPermissoesInterface, usuarioEhAdmin, podeUsarVisaoBarbearia, podeUsarVisaoProfissional } from "../shared/permissoes.js?v=9.2";
import { iniciarMedicao, finalizarMedicao, medirAsync, registrarEventoPerf } from "../shared/services/perf-service.js?v=9.2";
import { initNavigation, configurarNavegacao, abrirInicio, preloadInicio } from "./navigation.js?v=9.2";

let appInicializado = false;
let interfaceLiberada = false;
const inicioBoot = performance.now();
const PREVIEW_DELAY_MS = 90;
const medicaoBoot = iniciarMedicao("BOOT total", "admin");
const medicaoAuth = iniciarMedicao("Firebase Auth", "admin");
const medicaoPrimeiroVisual = iniciarMedicao("Primeiro visual", "admin");
let primeiroVisualFinalizado = false;
const preloadPrimeiraTela = preloadInicio();

document.body.dataset.srnkVisao = "barbearia";
document.body.dataset.srnkArea = "admin";
initTheme();
initConnectivity();
initNavigation();
registrarEventoPerf("Bootstrap JS iniciado", "admin");

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
    registrarEventoPerf("Interface liberada", "admin");
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
const previewTimer = window.setTimeout(mostrarInterfaceOtimista, PREVIEW_DELAY_MS);

function finalizarBoot({ liberar = true } = {}) {
    clearTimeout(previewTimer);
    finalizarPrimeiroVisual("app pronto");
    document.body.classList.remove("dashboard-booting");
    if (liberar) liberarInterface();
    document.getElementById("appBootStatus")?.setAttribute("hidden", "");
}

async function iniciar(user) {
    const contexto = await medirAsync("Contexto", () => inicializarContexto(user));

    if (contexto.perfil?.trocarSenha === true) {
        await medirAsync("Primeiro acesso", () => exigirTrocaSenhaPrimeiroAcesso(contexto));
    }

    if (!(usuarioEhAdmin() && podeUsarVisaoBarbearia())) {
        if (podeUsarVisaoProfissional()) {
            window.location.replace("../profissional/");
            return;
        }
        const error = new Error("Esta conta não possui acesso administrativo.");
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
    try { localStorage.setItem("srnk:sessao-validada", "1"); } catch (_) {}
    finalizarBoot({ liberar: true });
    finalizarMedicao(medicaoBoot);
}

onAuthStateChanged(auth, async (user) => {
    finalizarMedicao(medicaoAuth, user ? "sessão encontrada" : "sem sessão");
    registrarEventoPerf("Auth resolvido", user ? "sessão encontrada" : "sem sessão");

    if (!user) {
        clearTimeout(previewTimer);
        try { localStorage.removeItem("srnk:sessao-validada"); } catch (_) {}
        window.location.replace("../login.html?destino=admin");
        return;
    }
    if (appInicializado) return;

    try {
        await iniciar(user);
    } catch (error) {
        console.error("[Admin] Falha ao iniciar:", error);
        finalizarMedicao(medicaoBoot, "erro");

        if (error?.code === "ACESSO_DESATIVADO" || error?.code === "SEM_ACESSO") {
            try { localStorage.removeItem("srnk:sessao-validada"); } catch (_) {}
            await signOut(auth);
            window.location.replace(
                `../login.html?destino=admin&motivo=${error.code === "ACESSO_DESATIVADO" ? "desativado" : "sem-acesso"}`
            );
            return;
        }

        finalizarBoot({ liberar: false });
        mostrarErro("Não foi possível carregar a gestão da barbearia. Confira sua conexão e tente novamente.");
    }
});
