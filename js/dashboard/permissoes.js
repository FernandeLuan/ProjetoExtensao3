import { state } from "./state.js?v=7.4";

const SECOES_APENAS_ADMIN = new Set([
    "configuracoes",
    "equipe"
]);

export function papelEhAdmin(papel) {
    // "owner" continua aceito para não quebrar o ambiente já existente.
    return papel === "admin" || papel === "owner";
}

export function usuarioEhAdmin() {
    return state.membroAtual?.ativo === true && papelEhAdmin(state.membroAtual?.papel);
}

export function usuarioEhBarbeiro() {
    return state.membroAtual?.ativo === true && state.membroAtual?.papel === "barber";
}

export function podeAcessarSecao(targetId) {
    if (!SECOES_APENAS_ADMIN.has(targetId)) return true;
    return usuarioEhAdmin();
}

export function aplicarPermissoesInterface() {
    const admin = usuarioEhAdmin();

    const itemConfiguracoes = document
        .querySelector('#sidebarMenu a[href="#configuracoes"]')
        ?.closest("li");

    const itemEquipe = document.getElementById("menuEquipeItem");
    const itemDespesas = document.getElementById("menuDespesasItem");

    if (itemConfiguracoes) itemConfiguracoes.hidden = !admin;
    if (itemEquipe) itemEquipe.hidden = !admin;
    if (itemDespesas) itemDespesas.hidden = false;

    document.body.classList.toggle("usuario-admin", admin);
    document.body.classList.toggle("usuario-barbeiro", !admin);
}
