import { state } from "./state.js?v=8.25";
import {
    aplicarPermissoesInterface,
    podeUsarVisaoBarbearia,
    podeUsarVisaoProfissional,
    usuarioEhAdmin,
    visaoEhBarbearia
} from "./permissoes.js?v=8.25";
import {
    abrirInicioDaVisaoAtual,
    configurarNavegacaoParaVisao
} from "./navigation.js?v=8.25";

const VISAO_PROFISSIONAL = "profissional";
const VISAO_BARBEARIA = "barbearia";

let inicializado = false;
let toastTimer = null;

function visaoAtual() {
    return visaoEhBarbearia() ? VISAO_BARBEARIA : VISAO_PROFISSIONAL;
}

function definirVisaoAtual(visao) {
    if (!document.body) return;
    document.body.dataset.srnkVisao = visao === VISAO_BARBEARIA
        ? VISAO_BARBEARIA
        : VISAO_PROFISSIONAL;
}

function chavePreferencia() {
    return `srnk:visao:${state.user?.uid || "anon"}`;
}

function visaoPermitida(visao) {
    if (visao === VISAO_BARBEARIA) return podeUsarVisaoBarbearia();
    return podeUsarVisaoProfissional();
}

function obterVisaoInicial() {
    let salva = null;

    try {
        salva = localStorage.getItem(chavePreferencia());
    } catch (error) {
        console.warn("Não foi possível ler a preferência de visão:", error);
    }

    if (salva && visaoPermitida(salva)) return salva;
    if (podeUsarVisaoProfissional()) return VISAO_PROFISSIONAL;
    if (podeUsarVisaoBarbearia()) return VISAO_BARBEARIA;
    return VISAO_PROFISSIONAL;
}

function salvarPreferencia(visao) {
    try {
        localStorage.setItem(chavePreferencia(), visao);
    } catch (error) {
        console.warn("Não foi possível salvar a preferência de visão:", error);
    }
}

function atualizarSeletor() {
    const bloco = document.getElementById("contaVisaoCard");
    const btnProfissional = document.getElementById("btnVisaoProfissional");
    const btnBarbearia = document.getElementById("btnVisaoBarbearia");
    const permiteProfissional = podeUsarVisaoProfissional();
    const permiteBarbearia = podeUsarVisaoBarbearia();
    const podeAlternar =
        usuarioEhAdmin() &&
        permiteProfissional &&
        permiteBarbearia;

    if (bloco) bloco.hidden = !podeAlternar;

    if (!podeAlternar) {
        const conteudo = document.getElementById("contaVisaoContent");
        const toggle = document.getElementById("btnToggleVisao");

        if (conteudo) conteudo.hidden = true;
        if (toggle) {
            toggle.setAttribute("aria-expanded", "false");
            toggle.classList.remove("aberto");
        }
    }

    [
        [btnProfissional, VISAO_PROFISSIONAL],
        [btnBarbearia, VISAO_BARBEARIA]
    ].forEach(([botao, visao]) => {
        if (!botao) return;
        const ativa = visaoAtual() === visao;
        botao.classList.toggle("active", ativa);
        botao.setAttribute("aria-pressed", ativa ? "true" : "false");
    });
}

function recolherSeletorVisao() {
    const conteudo = document.getElementById("contaVisaoContent");
    const toggle = document.getElementById("btnToggleVisao");

    if (conteudo) conteudo.hidden = true;

    if (toggle) {
        toggle.setAttribute("aria-expanded", "false");
        toggle.classList.remove("aberto");
    }
}


function mostrarLoading(mostrar) {
    const overlay = document.getElementById("visaoLoading");
    if (!overlay) return;
    overlay.hidden = !mostrar;
    document.body.classList.toggle("troca-visao-em-andamento", mostrar);
}

function mostrarToast(visao) {
    const toast = document.getElementById("visaoToast");
    if (!toast) return;

    clearTimeout(toastTimer);
    toast.innerHTML = visao === VISAO_BARBEARIA
        ? '<i class="fas fa-store" aria-hidden="true"></i><span>Você está na visão da barbearia</span>'
        : '<i class="fas fa-user" aria-hidden="true"></i><span>Você está na visão profissional</span>';

    toast.hidden = false;
    requestAnimationFrame(() => toast.classList.add("show"));

    toastTimer = setTimeout(() => {
        toast.classList.remove("show");
        setTimeout(() => { toast.hidden = true; }, 220);
    }, 3000);
}

async function aplicarVisao(visao, { navegar = true, feedback = false } = {}) {
    const alvo = visao === VISAO_BARBEARIA ? VISAO_BARBEARIA : VISAO_PROFISSIONAL;
    if (!visaoPermitida(alvo)) return;

    if (feedback) {
        recolherSeletorVisao();
    }

    mostrarLoading(true);

    try {
        definirVisaoAtual(alvo);
        salvarPreferencia(alvo);
        configurarNavegacaoParaVisao();
        aplicarPermissoesInterface();
        atualizarSeletor();

        if (navegar) await abrirInicioDaVisaoAtual();
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    } finally {
        mostrarLoading(false);
    }

    if (feedback) mostrarToast(alvo);
}

export async function initVisao() {
    if (inicializado) return;
    inicializado = true;

    document.getElementById("btnVisaoProfissional")?.addEventListener("click", () => {
        if (visaoAtual() !== VISAO_PROFISSIONAL) {
            void aplicarVisao(VISAO_PROFISSIONAL, { navegar: true, feedback: true });
        }
    });

    document.getElementById("btnVisaoBarbearia")?.addEventListener("click", () => {
        if (visaoAtual() !== VISAO_BARBEARIA) {
            void aplicarVisao(VISAO_BARBEARIA, { navegar: true, feedback: true });
        }
    });

    await aplicarVisao(obterVisaoInicial(), { navegar: true, feedback: false });
}
