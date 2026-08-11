import { state } from "./state.js?v=9.0";

const SECOES_APENAS_BARBEARIA = new Set([
    "barbeariaHome",
    "configuracoes",
    "equipe"
]);

const SECOES_APENAS_PROFISSIONAL = new Set([
    "registrar",
    "painelFinanceiro"
]);

export function papelEhAdmin(papel) {
    return papel === "admin" || papel === "owner";
}

export function usuarioEhAdmin() {
    return state.membroAtual?.ativo === true && papelEhAdmin(state.membroAtual?.papel);
}

export function usuarioEhBarbeiro() {
    return state.membroAtual?.ativo === true && state.membroAtual?.papel === "barber";
}

export function usuarioEhDono() {
    return state.membroAtual?.ativo === true && state.membroAtual?.dono === true;
}

export function usuarioAtuaComoProfissional() {
    if (state.membroAtual?.ativo !== true) return false;
    return state.membroAtual?.atuaComoProfissional !== false;
}

export function podeUsarVisaoBarbearia() {
    if (state.membroAtual?.ativo !== true) return false;
    return papelEhAdmin(state.membroAtual?.papel)
        || state.membroAtual?.acessoBarbearia === true;
}

export function podeUsarVisaoProfissional() {
    return usuarioAtuaComoProfissional();
}

export function visaoEhBarbearia() {
    return document.body?.dataset?.srnkVisao === "barbearia";
}

export function visaoEhProfissional() {
    return !visaoEhBarbearia();
}

export function podeAdministrarNaVisaoAtual() {
    return usuarioEhAdmin() && podeUsarVisaoBarbearia() && visaoEhBarbearia();
}

export function obterSecaoInicialVisao() {
    return visaoEhBarbearia() ? "barbeariaHome" : "registrar";
}

export function podeAcessarSecao(targetId) {
    if (SECOES_APENAS_BARBEARIA.has(targetId)) {
        return podeAdministrarNaVisaoAtual();
    }

    if (SECOES_APENAS_PROFISSIONAL.has(targetId)) {
        return podeUsarVisaoProfissional() && visaoEhProfissional();
    }

    return true;
}

export function aplicarPermissoesInterface() {
    const adminNaVisao = podeAdministrarNaVisaoAtual();
    const profissional = podeUsarVisaoProfissional() && visaoEhProfissional();

    const itemConfiguracoes = document.getElementById("menuConfiguracoesItem");
    const itemEquipe = document.getElementById("menuEquipeItem");
    const itemDespesas = document.getElementById("menuDespesasItem");

    if (itemConfiguracoes) itemConfiguracoes.hidden = !adminNaVisao;
    if (itemEquipe) itemEquipe.hidden = !adminNaVisao;
    if (itemDespesas) itemDespesas.hidden = false;

    document.body.classList.toggle("usuario-admin", usuarioEhAdmin());
    document.body.classList.toggle("usuario-barbeiro", !usuarioEhAdmin());
    document.body.classList.toggle("contexto-administrativo", adminNaVisao);
    document.body.classList.toggle("contexto-profissional", profissional);
    document.body.classList.toggle("visao-profissional", profissional);
    document.body.classList.toggle("visao-barbearia", adminNaVisao);
}
