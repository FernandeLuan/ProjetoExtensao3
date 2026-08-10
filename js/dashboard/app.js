import { auth } from "../firebase-init.js?v=7.4";
import {
    onAuthStateChanged,
    signOut
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

import { inicializarContexto } from "./data/context.js?v=7.4";
import { recarregarConfiguracoes } from "./data/sync.js?v=7.4";
import { initTheme } from "./theme.js?v=7.4";
import { initConnectivity } from "./connectivity.js?v=7.4";
import { initNavigation } from "./navigation.js?v=8.14";
import { initRegistrar } from "./registrar.js?v=8.15";
import { initConfiguracoes } from "./configuracoes.js?v=8.8";
import { initRetroativo } from "./retroativo.js?v=8.10";
import { initEquipe } from "./equipe.js?v=8.15";
import { initDespesas } from "./despesas.js?v=8.10";
import { initConta } from "./conta.js?v=8.15";
import { initRelatorios } from "./relatorios.js?v=8.11";
import { mostrarErro } from "./services/feedback-service.js?v=7.4";
import { exigirTrocaSenhaPrimeiroAcesso } from "./primeiro-acesso.js?v=8.15";
import { aplicarPermissoesInterface, usuarioEhAdmin } from "./permissoes.js?v=8.12";
import { initVisao } from "./visao.js?v=8.12";

let appInicializado = false;

initTheme();
initConnectivity();
initNavigation();

async function inicializarApp(user) {
    const contexto = await inicializarContexto(user);

    // Primeiro acesso vem antes de qualquer tela operacional.
    if (contexto.perfil?.trocarSenha === true) {
        await exigirTrocaSenhaPrimeiroAcesso(contexto);
    }

    aplicarPermissoesInterface();
    await initVisao();

    // Na entrada carregamos somente contexto + configurações.
    // Painel, Histórico, Relatório, Equipe, Despesas e Conta leem dados só ao serem abertos.
    await recarregarConfiguracoes();

    if (!appInicializado) {
        appInicializado = true;

        await initRegistrar();
        initConta();
        initDespesas();
        initRelatorios();

        if (usuarioEhAdmin()) {
            initConfiguracoes();
            await initRetroativo();
            initEquipe();
        }
    }

    document.body.classList.remove("dashboard-booting");
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

        document.body.classList.remove("dashboard-booting");
        mostrarErro("Não foi possível carregar seu ambiente. Confira as regras do Firestore.");
    }
});
