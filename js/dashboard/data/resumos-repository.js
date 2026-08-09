import { db } from "../../firebase-init.js?v=7.4";
import {
    doc,
    increment,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

import { obterWorkspaceId } from "./context.js?v=7.4";
import {
    obterBrutoAtendimento,
    obterLiquidoBarbeiro,
    obterRepasseAtendimento,
    obterTaxaCartaoValor
} from "../services/financeiro-service.js?v=7.4";
import { chaveData, obterDataAtendimento, paraDate } from "../utils/date.js?v=7.4";

export const RESUMO_VERSION = 1;

function paraCentavos(valor) {
    return Math.round(Number(valor || 0) * 100);
}

function hashTexto(texto) {
    let hash = 2166136261;
    const valor = String(texto || "");

    for (let i = 0; i < valor.length; i += 1) {
        hash ^= valor.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }

    return (hash >>> 0).toString(36);
}

function chaveSegura(texto, fallback = "outro") {
    const base = String(texto || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 48);

    return base || fallback;
}

function chaveServico(atendimento) {
    const id = String(atendimento?.servicoId || "").trim();
    if (id) return chaveSegura(id, `servico-${hashTexto(id)}`);

    const nome = String(atendimento?.servicoNome || atendimento?.servico || "Serviço").trim();
    return `legacy-${chaveSegura(nome, "servico")}-${hashTexto(nome)}`;
}

function chavePagamento(pagamento) {
    const normalizada = chaveSegura(pagamento, "outro");
    if (normalizada === "debito") return "debito";
    if (normalizada === "credito") return "credito";
    if (normalizada === "dinheiro") return "dinheiro";
    if (normalizada === "pix") return "pix";
    return `outro-${hashTexto(pagamento)}`;
}

function atendimentoTemAjuste(atendimento, bruto) {
    const esperado = Number(
        atendimento?.precoProfissional ??
        atendimento?.precoBase
    );

    const ajustado =
        atendimento?.valorDiferenciado === true ||
        atendimento?.origemPreco === "ajustado" ||
        (
            Number.isFinite(esperado) &&
            esperado > 0 &&
            Math.abs(Number(bruto || 0) - esperado) > 0.009
        );

    if (!ajustado || !Number.isFinite(esperado) || esperado <= 0) {
        return { quantidade: 0, diferencaCentavos: 0 };
    }

    return {
        quantidade: 1,
        diferencaCentavos: paraCentavos(Number(bruto || 0) - esperado)
    };
}

function referenciaResumoProfissional(uid, dataChave) {
    return doc(
        db,
        "barbearias",
        obterWorkspaceId(),
        "resumosProfissionais",
        uid,
        "dias",
        dataChave
    );
}

function referenciaResumoBarbearia(dataChave) {
    return doc(
        db,
        "barbearias",
        obterWorkspaceId(),
        "resumosBarbearia",
        dataChave
    );
}

function criarDeltaProfissionalBase({ uid, nome, dataChave }) {
    return {
        uid,
        nome: String(nome || "Profissional").trim(),
        dataChave,
        atendimentos: 0,
        faturamentoBrutoCentavos: 0,
        taxasCartaoCentavos: 0,
        repasseCentavos: 0,
        liquidoBarbeiroCentavos: 0,
        ajustesQuantidade: 0,
        ajustesDiferencaCentavos: 0,
        despesasProfissionaisCentavos: 0,
        pagamentosQtd: {},
        pagamentosValorCentavos: {},
        pagamentosNomes: {},
        servicosQtd: {},
        servicosFaturamentoCentavos: {},
        servicosNomes: {}
    };
}

function somarMapaNumero(mapa, chave, valor) {
    mapa[chave] = Number(mapa[chave] || 0) + Number(valor || 0);
}

function obterOuCriarDeltaProfissional(mapa, uid, nome, dataChave) {
    const chave = `${uid}:${dataChave}`;

    if (!mapa.has(chave)) {
        mapa.set(chave, criarDeltaProfissionalBase({ uid, nome, dataChave }));
    }

    const delta = mapa.get(chave);
    if (nome && !String(nome).includes("@")) delta.nome = String(nome).trim();
    return delta;
}

function acumularAtendimento(delta, atendimento, sinal) {
    const bruto = obterBrutoAtendimento(atendimento);
    const taxa = obterTaxaCartaoValor(atendimento);
    const repasse = obterRepasseAtendimento(atendimento);
    const liquido = obterLiquidoBarbeiro(atendimento);
    const ajuste = atendimentoTemAjuste(atendimento, bruto);
    const pagamentoNome = String(atendimento?.pagamento || "Outros").trim();
    const pagamentoChave = chavePagamento(pagamentoNome);
    const servicoNome = String(
        atendimento?.servicoNome ||
        atendimento?.servico ||
        "Serviço"
    ).trim();
    const servicoChave = chaveServico(atendimento);

    delta.atendimentos += sinal;
    delta.faturamentoBrutoCentavos += sinal * paraCentavos(bruto);
    delta.taxasCartaoCentavos += sinal * paraCentavos(taxa);
    delta.repasseCentavos += sinal * paraCentavos(repasse);
    delta.liquidoBarbeiroCentavos += sinal * paraCentavos(liquido);
    delta.ajustesQuantidade += sinal * ajuste.quantidade;
    delta.ajustesDiferencaCentavos += sinal * ajuste.diferencaCentavos;

    somarMapaNumero(delta.pagamentosQtd, pagamentoChave, sinal);
    somarMapaNumero(
        delta.pagamentosValorCentavos,
        pagamentoChave,
        sinal * paraCentavos(bruto)
    );
    delta.pagamentosNomes[pagamentoChave] = pagamentoNome;

    somarMapaNumero(delta.servicosQtd, servicoChave, sinal);
    somarMapaNumero(
        delta.servicosFaturamentoCentavos,
        servicoChave,
        sinal * paraCentavos(bruto)
    );
    delta.servicosNomes[servicoChave] = servicoNome;
}

function objetoIncrementos(mapa) {
    return Object.fromEntries(
        Object.entries(mapa)
            .filter(([, valor]) => Number(valor || 0) !== 0)
            .map(([chave, valor]) => [chave, increment(Number(valor))])
    );
}

function patchResumoProfissional(delta) {
    const patch = {
        dataChave: delta.dataChave,
        profissionalUid: delta.uid,
        profissionalNome: delta.nome,
        resumoVersion: RESUMO_VERSION,
        updatedAt: serverTimestamp()
    };

    const numericos = [
        "atendimentos",
        "faturamentoBrutoCentavos",
        "taxasCartaoCentavos",
        "repasseCentavos",
        "liquidoBarbeiroCentavos",
        "ajustesQuantidade",
        "ajustesDiferencaCentavos",
        "despesasProfissionaisCentavos"
    ];

    numericos.forEach((campo) => {
        if (Number(delta[campo] || 0) !== 0) {
            patch[campo] = increment(Number(delta[campo]));
        }
    });

    const pagamentosQtd = objetoIncrementos(delta.pagamentosQtd);
    const pagamentosValor = objetoIncrementos(delta.pagamentosValorCentavos);
    const servicosQtd = objetoIncrementos(delta.servicosQtd);
    const servicosFaturamento = objetoIncrementos(delta.servicosFaturamentoCentavos);

    if (Object.keys(pagamentosQtd).length) patch.pagamentosQtd = pagamentosQtd;
    if (Object.keys(pagamentosValor).length) patch.pagamentosValorCentavos = pagamentosValor;
    if (Object.keys(delta.pagamentosNomes).length) patch.pagamentosNomes = delta.pagamentosNomes;
    if (Object.keys(servicosQtd).length) patch.servicosQtd = servicosQtd;
    if (Object.keys(servicosFaturamento).length) patch.servicosFaturamentoCentavos = servicosFaturamento;
    if (Object.keys(delta.servicosNomes).length) patch.servicosNomes = delta.servicosNomes;

    return patch;
}

/**
 * Anexa ao mesmo WriteBatch os deltas de um ou mais atendimentos.
 * Cada entrada: { atendimento, sinal }, onde sinal é +1 ou -1.
 */
export function anexarDeltasAtendimentosAoBatch(batch, entradas = []) {
    const deltas = new Map();

    entradas.forEach(({ atendimento, sinal = 1 }) => {
        const uid = String(atendimento?.profissionalUid || "").trim();
        const data = obterDataAtendimento(atendimento);
        if (!uid || !data) return;

        const dataChave = chaveData(data);
        const delta = obterOuCriarDeltaProfissional(
            deltas,
            uid,
            atendimento?.profissionalNome,
            dataChave
        );

        acumularAtendimento(delta, atendimento, Number(sinal) >= 0 ? 1 : -1);
    });

    deltas.forEach((delta) => {
        batch.set(
            referenciaResumoProfissional(delta.uid, delta.dataChave),
            patchResumoProfissional(delta),
            { merge: true }
        );
    });
}

function obterDataDespesa(despesa) {
    return paraDate(despesa?.dataDespesa) || paraDate(despesa?.data);
}

/**
 * Anexa ao mesmo WriteBatch os deltas de despesas.
 * Despesas profissionais atualizam o resumo do profissional.
 * Despesas da barbearia atualizam um resumo diário separado, gravável só por admin.
 */
export function anexarDeltasDespesasAoBatch(batch, entradas = []) {
    const profissionais = new Map();
    const barbearia = new Map();

    entradas.forEach(({ despesa, sinal = 1 }) => {
        const data = obterDataDespesa(despesa);
        if (!data) return;

        const dataChave = chaveData(data);
        const fator = Number(sinal) >= 0 ? 1 : -1;
        const valorCentavos = fator * paraCentavos(despesa?.valor);

        if (despesa?.tipo === "barbearia") {
            barbearia.set(
                dataChave,
                Number(barbearia.get(dataChave) || 0) + valorCentavos
            );
            return;
        }

        const uid = String(despesa?.profissionalUid || "").trim();
        if (!uid) return;

        const delta = obterOuCriarDeltaProfissional(
            profissionais,
            uid,
            despesa?.profissionalNome,
            dataChave
        );

        delta.despesasProfissionaisCentavos += valorCentavos;
    });

    profissionais.forEach((delta) => {
        batch.set(
            referenciaResumoProfissional(delta.uid, delta.dataChave),
            patchResumoProfissional(delta),
            { merge: true }
        );
    });

    barbearia.forEach((valorCentavos, dataChave) => {
        batch.set(
            referenciaResumoBarbearia(dataChave),
            {
                dataChave,
                despesasBarbeariaCentavos: increment(Number(valorCentavos)),
                resumoVersion: RESUMO_VERSION,
                updatedAt: serverTimestamp()
            },
            { merge: true }
        );
    });
}
