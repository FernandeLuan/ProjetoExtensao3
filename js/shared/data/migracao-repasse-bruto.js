import { db } from "../../firebase-init.js?v=11.0";
import { collection, getDocs, writeBatch } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { obterWorkspaceId } from "./context.js?v=11.0";
import { atualizarConfiguracoes } from "./configuracoes-repository.js?v=11.0";
import { anexarDeltasAtendimentosAoBatch, RESUMO_VERSION, invalidarCacheResumos } from "./resumos-repository.js?v=11.0";
import { obterBrutoAtendimento, obterTaxaCartaoValor } from "../services/financeiro-service.js?v=11.0";
import { invalidarCacheAtendimentos } from "./sync.js?v=11.0";

const FLAG_CONFIG = "migracaoRepasseBrutoV1";
const REGRA = "valorBruto";
const VERSAO = 2;
const TAMANHO_LOTE = 120;

function jaMigrado(atendimento) {
    return atendimento?.regraRepasseBase === REGRA
        || atendimento?.financeiro?.regraRepasseBase === REGRA
        || Number(atendimento?.regraFinanceiraVersion || atendimento?.financeiro?.regraFinanceiraVersion || 0) >= VERSAO;
}

function percentualRepasse(atendimento, bruto, taxa) {
    if (atendimento?.profissionalDono === true || atendimento?.financeiro?.profissionalDono === true) return 0;

    const salvo = Number(atendimento?.financeiro?.repasseDonoPct ?? atendimento?.repasseDonoPct);
    if (Number.isFinite(salvo) && salvo >= 0) return salvo;

    // Compatibilidade com registros antigos que guardavam apenas o valor do repasse.
    const antigo = Number(atendimento?.repasseDono ?? atendimento?.financeiro?.repasseDono);
    const baseAntiga = Math.max(0, bruto - taxa);
    if (Number.isFinite(antigo) && antigo >= 0 && baseAntiga > 0) {
        return (antigo / baseAntiga) * 100;
    }

    return 0;
}

function recalcular(atendimento) {
    const bruto = obterBrutoAtendimento(atendimento);
    const taxa = obterTaxaCartaoValor(atendimento);
    const pct = percentualRepasse(atendimento, bruto, taxa);
    const repasseDono = Number((bruto * (pct / 100)).toFixed(2));
    const liquidoBarbeiro = Number((bruto - taxa - repasseDono).toFixed(2));

    return {
        ...atendimento,
        repasseDono,
        liquidoBarbeiro,
        regraRepasseBase: REGRA,
        regraFinanceiraVersion: VERSAO,
        financeiro: {
            ...(atendimento?.financeiro || {}),
            repasseDonoPct: Number(pct.toFixed(2)),
            repasseDono,
            liquidoBarbeiro,
            regraRepasseBase: REGRA,
            regraFinanceiraVersion: VERSAO
        }
    };
}

export async function migrarRepasseParaBaseBruta(configuracoes = {}) {
    if (configuracoes?.[FLAG_CONFIG] === true) return configuracoes;

    const snapshot = await getDocs(collection(db, "barbearias", obterWorkspaceId(), "atendimentos"));
    const pendentes = snapshot.docs
        .map((documento) => ({ ref: documento.ref, id: documento.id, ...documento.data() }))
        .filter((atendimento) => !jaMigrado(atendimento));

    for (let inicio = 0; inicio < pendentes.length; inicio += TAMANHO_LOTE) {
        const lote = pendentes.slice(inicio, inicio + TAMANHO_LOTE);
        const batch = writeBatch(db);
        const deltasResumo = [];

        lote.forEach((original) => {
            const novo = recalcular(original);
            batch.update(original.ref, {
                repasseDono: novo.repasseDono,
                liquidoBarbeiro: novo.liquidoBarbeiro,
                regraRepasseBase: REGRA,
                regraFinanceiraVersion: VERSAO,
                financeiro: novo.financeiro
            });

            if (Number(original?.resumoVersion || 0) >= RESUMO_VERSION) {
                deltasResumo.push(
                    { atendimento: original, sinal: -1 },
                    { atendimento: novo, sinal: 1 }
                );
            }
        });

        if (deltasResumo.length) anexarDeltasAtendimentosAoBatch(batch, deltasResumo);
        await batch.commit();
    }

    await atualizarConfiguracoes({ [FLAG_CONFIG]: true });
    invalidarCacheAtendimentos();
    invalidarCacheResumos();

    return { ...configuracoes, [FLAG_CONFIG]: true };
}
