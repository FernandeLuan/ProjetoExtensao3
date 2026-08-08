import { auth } from "../firebase-init.js?v=6.1";
import {
    onAuthStateChanged,
    signOut
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

import { inicializarContexto } from "./data/context.js?v=6.1";
import { recarregarAtendimentos, recarregarConfiguracoes } from "./data/sync.js?v=6.1";
import { initTheme } from "./theme.js?v=6.1";
import { initConnectivity } from "./connectivity.js?v=6.1";
import { initNavigation } from "./navigation.js?v=6.1";
import { initRegistrar } from "./registrar.js?v=6.1";
import { initConfiguracoes } from "./configuracoes.js?v=6.1";
import { initRetroativo } from "./retroativo.js?v=6.1";
import { initEquipe } from "./equipe.js?v=6.1";
import { initDespesas } from "./despesas.js?v=6.1";
import { initConta } from "./conta.js?v=6.1";
import { initRelatorios } from "./relatorios.js?v=6.1";
import { atualizarCards } from "./painel.js?v=6.1";
import { atualizarHistorico } from "./historico.js?v=6.1";
import { mostrarErro } from "./services/feedback-service.js?v=6.1";
import { exigirTrocaSenhaPrimeiroAcesso } from "./primeiro-acesso.js?v=6.1";
import { aplicarPermissoesInterface, usuarioEhAdmin } from "./permissoes.js?v=6.1";

let appInicializado = false;

initTheme();
initConnectivity();
initNavigation();

async function inicializarApp(user) {
    const contexto = await inicializarContexto(user);
    aplicarPermissoesInterface();

    if (contexto.perfil?.trocarSenha === true) {
        await exigirTrocaSenhaPrimeiroAcesso(contexto);
    }

    await recarregarConfiguracoes();
    await recarregarAtendimentos();

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

    atualizarCards();
    atualizarHistorico();
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

        mostrarErro("Não foi possível carregar seu ambiente. Confira as regras do Firestore.");
    }
});
