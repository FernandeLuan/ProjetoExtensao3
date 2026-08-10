import { auth } from "../firebase-init.js?v=8.31";
import {
    onAuthStateChanged,
    signOut
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

import { inicializarContexto } from "./data/context.js?v=8.31";
import { carregarConfiguracoesDoBanco } from "./data/configuracoes-repository.js?v=8.31";
import { definirConfiguracoes } from "./state.js?v=8.31";
import { initTheme } from "./theme.js?v=8.31";
import { initConnectivity } from "./connectivity.js?v=8.31";
import { initNavigation } from "./navigation.js?v=8.31";
import { mostrarErro } from "./services/feedback-service.js?v=8.31";
import { exigirTrocaSenhaPrimeiroAcesso } from "./primeiro-acesso.js?v=8.31";
import { aplicarPermissoesInterface } from "./permissoes.js?v=8.31";
import { initVisao } from "./visao.js?v=8.31";

let appInicializado = false;
const inicioBoot = performance.now();
const BOOT_MINIMO_MS = 760;

initTheme();
initConnectivity();
initNavigation();

async function finalizarBoot() {
    const decorrido = performance.now() - inicioBoot;
    const restante = Math.max(0, BOOT_MINIMO_MS - decorrido);
    if (restante > 0) await new Promise((resolve) => setTimeout(resolve, restante));

    document.body.classList.remove("dashboard-booting");
    document.getElementById("appBootStatus")?.setAttribute("hidden", "");

    const duracao = Math.round(performance.now() - inicioBoot);
    if (duracao > 4000) {
        console.info(`[SR NK • Boot] Aplicativo liberado em ${duracao} ms.`);
    }
}

async function inicializarApp(user) {
    const contexto = await inicializarContexto(user);

    // Primeiro acesso continua bloqueando qualquer tela operacional por segurança.
    if (contexto.perfil?.trocarSenha === true) {
        await exigirTrocaSenhaPrimeiroAcesso(contexto);
    }

    aplicarPermissoesInterface();

    // Mantemos preços, meios de pagamento e regras financeiras consistentes antes
    // de liberar ações operacionais. O restante das telas passou a lazy-loading.
    definirConfiguracoes(await carregarConfiguracoesDoBanco());
    await initVisao();

    appInicializado = true;
    await finalizarBoot();
}

document.getElementById("logoutBtnSide")?.addEventListener("click", async (event) => {
    event.preventDefault();
    await signOut(auth);
    window.location.href = "login.html";
});

onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.href = "login.html";
        return;
    }

    if (appInicializado) return;

    try {
        await inicializarApp(user);
    } catch (error) {
        console.error("Erro ao inicializar o ambiente do usuário:", error);

        if (error?.code === "ACESSO_DESATIVADO") {
            await signOut(auth);
            window.location.href = "login.html?motivo=desativado";
            return;
        }

        if (error?.code === "SEM_ACESSO") {
            await signOut(auth);
            window.location.href = "login.html?motivo=sem-acesso";
            return;
        }

        await finalizarBoot();
        mostrarErro("Não foi possível carregar seu ambiente. Confira sua conexão e tente novamente.");
    }
});
