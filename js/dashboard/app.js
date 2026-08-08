import { auth } from "../firebase-init.js?v=4.0";
import {
    onAuthStateChanged,
    signOut
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

import { inicializarContexto } from "./data/context.js?v=4.0";
import { recarregarAtendimentos, recarregarConfiguracoes } from "./data/sync.js?v=4.0";
import { initTheme } from "./theme.js?v=4.0";
import { initConnectivity } from "./connectivity.js?v=4.0";
import { initNavigation } from "./navigation.js?v=4.0";
import { initRegistrar } from "./registrar.js?v=4.0";
import { initConfiguracoes } from "./configuracoes.js?v=4.0";
import { initRetroativo } from "./retroativo.js?v=4.0";
import { initConta } from "./conta.js?v=4.0";
import { initRelatorios } from "./relatorios.js?v=4.0";
import { atualizarCards } from "./painel.js?v=4.0";
import { atualizarHistorico } from "./historico.js?v=4.0";
import { mostrarErro } from "./services/feedback-service.js?v=4.0";

let appInicializado = false;

initTheme();
initConnectivity();
initNavigation();
initRelatorios();

async function inicializarApp(user) {
    await inicializarContexto(user);
    await recarregarConfiguracoes();
    await recarregarAtendimentos();

    if (!appInicializado) {
        appInicializado = true;
        initRegistrar();
        initConfiguracoes();
        initRetroativo();
        initConta();
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
        mostrarErro("Não foi possível carregar seu ambiente. Confira as regras do Firestore.");
    }
});
