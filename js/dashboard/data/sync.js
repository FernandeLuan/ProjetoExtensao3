import { listarAtendimentosPorPeriodo } from "./atendimentos-repository.js?v=7.4";
import { carregarConfiguracoesDoBanco } from "./configuracoes-repository.js?v=7.4";
import { mesclarAtendimentos, definirConfiguracoes, state } from "../state.js?v=7.4";
import { inicioDoDia, somarDias, paraDate } from "../utils/date.js?v=7.4";
import { usuarioEhAdmin } from "../permissoes.js?v=7.4";

const CACHE_TTL_MS = 2 * 60 * 1000;
const CACHE_MAX_ITENS = 24;
const cachePeriodos = new Map();
const consultasEmAndamento = new Map();

function escopoConsulta(profissionalUid) {
    if (profissionalUid) return profissionalUid;
    return usuarioEhAdmin() ? "__todos__" : (state.user?.uid || "__usuario__");
}

function normalizarPeriodo(inicio, fim) {
    return {
        inicio: inicioDoDia(inicio),
        fim: inicioDoDia(fim)
    };
}

function chavePeriodo(inicio, fim, escopo) {
    const a = inicio.toISOString().slice(0, 10);
    const b = fim.toISOString().slice(0, 10);
    return `${escopo}:${a}:${b}`;
}

function cacheValido(item) {
    return item && (Date.now() - item.salvoEm) < CACHE_TTL_MS;
}

function filtrarPeriodo(itens, inicio, fim, profissionalUid = null) {
    const min = inicio.getTime();
    const max = new Date(fim.getFullYear(), fim.getMonth(), fim.getDate(), 23, 59, 59, 999).getTime();

    return (itens || []).filter((item) => {
        const data = paraDate(item.dataAtendimento) || paraDate(item.data);
        if (!data) return false;
        const tempo = data.getTime();
        if (tempo < min || tempo > max) return false;
        return !profissionalUid || item.profissionalUid === profissionalUid;
    });
}

function procurarCacheAbrangente(inicio, fim, escopo, profissionalUid) {
    for (const item of cachePeriodos.values()) {
        if (!cacheValido(item)) continue;

        const escopoCompativel =
            item.escopo === escopo ||
            (profissionalUid && item.escopo === "__todos__");

        if (!escopoCompativel) continue;
        if (item.inicio <= inicio && item.fim >= fim) {
            return filtrarPeriodo(item.atendimentos, inicio, fim, profissionalUid);
        }
    }
    return null;
}

function salvarCache(chave, dados) {
    cachePeriodos.set(chave, { ...dados, salvoEm: Date.now() });
    while (cachePeriodos.size > CACHE_MAX_ITENS) {
        cachePeriodos.delete(cachePeriodos.keys().next().value);
    }
}

export async function obterAtendimentosPeriodo(
    inicio,
    fim,
    { profissionalUid = null, forcar = false } = {}
) {
    const periodo = normalizarPeriodo(inicio, fim);
    const escopo = escopoConsulta(profissionalUid);
    const chave = chavePeriodo(periodo.inicio, periodo.fim, escopo);

    if (!forcar) {
        const exato = cachePeriodos.get(chave);
        if (cacheValido(exato)) return exato.atendimentos;

        const abrangente = procurarCacheAbrangente(
            periodo.inicio,
            periodo.fim,
            escopo,
            profissionalUid
        );
        if (abrangente) return abrangente;
    }

    if (consultasEmAndamento.has(chave)) {
        return consultasEmAndamento.get(chave);
    }

    const promessa = (async () => {
        const atendimentos = await listarAtendimentosPorPeriodo(
            periodo.inicio,
            periodo.fim,
            { profissionalUid }
        );

        mesclarAtendimentos(atendimentos);
        salvarCache(chave, {
            inicio: periodo.inicio,
            fim: periodo.fim,
            escopo,
            atendimentos
        });
        return atendimentos;
    })();

    consultasEmAndamento.set(chave, promessa);
    try {
        return await promessa;
    } finally {
        consultasEmAndamento.delete(chave);
    }
}

export async function garantirAtendimentosPeriodo(inicio, fim, opcoes = {}) {
    return obterAtendimentosPeriodo(inicio, fim, opcoes);
}

export async function recarregarAtendimentos() {
    const hoje = inicioDoDia(new Date());
    return obterAtendimentosPeriodo(somarDias(hoje, -7), hoje);
}

export async function recarregarAtendimentosDoDia(data, opcoes = {}) {
    return obterAtendimentosPeriodo(data, data, { ...opcoes, forcar: true });
}

export function invalidarCacheAtendimentos() {
    cachePeriodos.clear();
}

export async function recarregarConfiguracoes() {
    const configuracoes = await carregarConfiguracoesDoBanco();
    definirConfiguracoes(configuracoes);
    return configuracoes;
}
