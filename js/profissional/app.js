import { auth } from "../firebase-init.js?v=9.1";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { inicializarContexto } from "../shared/data/context.js?v=9.1";
import { carregarConfiguracoesDoBanco } from "../shared/data/configuracoes-repository.js?v=9.1";
import { definirConfiguracoes } from "../shared/state.js?v=9.1";
import { initTheme } from "../shared/theme.js?v=9.1";
import { initConnectivity } from "../shared/connectivity.js?v=9.1";
import { mostrarErro } from "../shared/services/feedback-service.js?v=9.1";
import { exigirTrocaSenhaPrimeiroAcesso } from "../shared/primeiro-acesso.js?v=9.1";
import { aplicarPermissoesInterface, podeUsarVisaoProfissional, usuarioEhAdmin, podeUsarVisaoBarbearia } from "../shared/permissoes.js?v=9.1";
import { iniciarMedicao, finalizarMedicao, medirAsync, registrarEventoPerf } from "../shared/services/perf-service.js?v=9.1";
import { initNavigation, configurarNavegacao, abrirInicio, preloadInicio } from "./navigation.js?v=9.1";

let appInicializado = false;
const inicioBoot = performance.now();
const BOOT_MINIMO_MS = 100;
const medicaoBoot = iniciarMedicao("BOOT total", "profissional");

document.body.dataset.srnkVisao = "profissional";
document.body.dataset.srnkArea = "profissional";
initTheme();
initConnectivity();
initNavigation();
registrarEventoPerf("Bootstrap JS iniciado", "profissional");

async function finalizarBoot() {
    const restante = Math.max(0, BOOT_MINIMO_MS - (performance.now() - inicioBoot));
    if (restante) await new Promise((resolve) => setTimeout(resolve, restante));
    document.body.classList.remove("dashboard-booting");
    document.getElementById("appBootStatus")?.setAttribute("hidden", "");
}

async function iniciar(user) {
    const contexto = await medirAsync("Contexto", () => inicializarContexto(user));

    if (contexto.perfil?.trocarSenha === true) {
        await medirAsync("Primeiro acesso", () => exigirTrocaSenhaPrimeiroAcesso(contexto));
    }

    if (!podeUsarVisaoProfissional()) {
        if (usuarioEhAdmin() && podeUsarVisaoBarbearia()) {
            window.location.replace("../admin/");
            return;
        }
        const error = new Error("Esta conta não possui acesso profissional.");
        error.code = "SEM_ACESSO";
        throw error;
    }

    aplicarPermissoesInterface();

    // Começa a baixar o módulo da primeira tela enquanto a configuração é resolvida.
    // O browser reutiliza o módulo quando abrirInicio() for chamado.
    const preload = preloadInicio();
    const configuracoes = await medirAsync("Configurações", () => carregarConfiguracoesDoBanco());
    definirConfiguracoes(configuracoes);
    configurarNavegacao();

    await preload.catch(() => null);
    await medirAsync("Tela inicial", () => abrirInicio());

    appInicializado = true;
    await finalizarBoot();
    finalizarMedicao(medicaoBoot);
}

onAuthStateChanged(auth, async (user) => {
    registrarEventoPerf("Auth resolvido", user ? "sessão encontrada" : "sem sessão");

    if (!user) {
        window.location.replace("../login.html?destino=profissional");
        return;
    }
    if (appInicializado) return;

    try {
        await iniciar(user);
    } catch (error) {
        console.error("[Profissional] Falha ao iniciar:", error);
        finalizarMedicao(medicaoBoot, "erro");

        if (error?.code === "ACESSO_DESATIVADO" || error?.code === "SEM_ACESSO") {
            await signOut(auth);
            window.location.replace(
                `../login.html?destino=profissional&motivo=${error.code === "ACESSO_DESATIVADO" ? "desativado" : "sem-acesso"}`
            );
            return;
        }

        await finalizarBoot();
        mostrarErro("Não foi possível carregar seu ambiente. Confira sua conexão e tente novamente.");
    }
});
