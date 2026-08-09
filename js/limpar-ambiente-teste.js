import { auth, db } from "./firebase-init.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
    collection,
    doc,
    getDocs,
    serverTimestamp,
    writeBatch
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

import { inicializarContexto } from "./dashboard/data/context.js?v=7.4";

const ambienteEl = document.getElementById("ambiente");
const qtdAtendimentosEl = document.getElementById("qtdAtendimentos");
const qtdDespesasEl = document.getElementById("qtdDespesas");
const qtdResumosProfEl = document.getElementById("qtdResumosProf");
const qtdResumosBarbEl = document.getElementById("qtdResumosBarb");
const btnAnalisar = document.getElementById("btnAnalisar");
const btnLimpar = document.getElementById("btnLimpar");
const confirmacaoEl = document.getElementById("confirmacao");
const statusEl = document.getElementById("status");

const FRASE_CONFIRMACAO = "LIMPAR TESTE";
const TAMANHO_LOTE = 350;

let workspaceId = null;
let usuarioAtual = null;
let analiseAtual = null;
let limpezaEmAndamento = false;

function status(texto) {
    statusEl.textContent = texto;
}

function ambienteTesteValido() {
    return Boolean(
        usuarioAtual?.uid &&
        workspaceId === `teste-${usuarioAtual.uid}`
    );
}

function exigirAmbienteTeste() {
    if (!ambienteTesteValido()) {
        throw new Error(
            "Bloqueio de segurança: esta ferramenta só funciona quando o ambiente é exatamente teste-<UID do usuário autenticado>."
        );
    }
}

function normalizarUidMembro(membroSnap) {
    const dados = membroSnap.data() || {};
    return String(dados.uid || membroSnap.id || "").trim();
}

function nomeMembro(membroSnap) {
    const dados = membroSnap.data() || {};
    return String(dados.nome || dados.email || dados.uid || membroSnap.id || "Profissional").trim();
}

function resumoProfissionalZerado(item) {
    return {
        dataChave: item.dataChave,
        profissionalUid: item.uid,
        profissionalNome: item.nome,
        resumoVersion: 1,
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
        servicosNomes: {},
        limpoAmbienteTeste: true,
        updatedAt: serverTimestamp()
    };
}

function resumoBarbeariaZerado(item) {
    return {
        dataChave: item.dataChave,
        despesasBarbeariaCentavos: 0,
        resumoVersion: 1,
        limpoAmbienteTeste: true,
        updatedAt: serverTimestamp()
    };
}

async function coletarDados() {
    exigirAmbienteTeste();

    const [atendSnap, despesasSnap, membrosSnap, resumosBarbeariaSnap] = await Promise.all([
        getDocs(collection(db, "barbearias", workspaceId, "atendimentos")),
        getDocs(collection(db, "barbearias", workspaceId, "despesas")),
        getDocs(collection(db, "barbearias", workspaceId, "membros")),
        getDocs(collection(db, "barbearias", workspaceId, "resumosBarbearia"))
    ]);

    const resumosProfissionais = [];

    for (const membroSnap of membrosSnap.docs) {
        const uid = normalizarUidMembro(membroSnap);
        if (!uid) continue;

        const diasSnap = await getDocs(
            collection(db, "barbearias", workspaceId, "resumosProfissionais", uid, "dias")
        );

        diasSnap.docs.forEach((diaSnap) => {
            const dados = diaSnap.data() || {};
            resumosProfissionais.push({
                ref: diaSnap.ref,
                uid,
                nome: String(dados.profissionalNome || nomeMembro(membroSnap)).trim(),
                dataChave: String(dados.dataChave || diaSnap.id)
            });
        });
    }

    return {
        atendimentos: atendSnap.docs.map((snap) => snap.ref),
        despesas: despesasSnap.docs.map((snap) => snap.ref),
        resumosProfissionais,
        resumosBarbearia: resumosBarbeariaSnap.docs.map((snap) => ({
            ref: snap.ref,
            dataChave: String(snap.data()?.dataChave || snap.id)
        }))
    };
}

function atualizarContadores(dados) {
    qtdAtendimentosEl.textContent = String(dados.atendimentos.length);
    qtdDespesasEl.textContent = String(dados.despesas.length);
    qtdResumosProfEl.textContent = String(dados.resumosProfissionais.length);
    qtdResumosBarbEl.textContent = String(dados.resumosBarbearia.length);
}

function atualizarEstadoBotao() {
    btnLimpar.disabled = Boolean(
        limpezaEmAndamento ||
        !analiseAtual ||
        confirmacaoEl.value.trim().toUpperCase() !== FRASE_CONFIRMACAO
    );
}

async function analisar() {
    btnAnalisar.disabled = true;
    btnLimpar.disabled = true;
    confirmacaoEl.disabled = true;
    confirmacaoEl.value = "";
    status("Analisando somente o ambiente de teste...");

    try {
        analiseAtual = await coletarDados();
        atualizarContadores(analiseAtual);

        const total =
            analiseAtual.atendimentos.length +
            analiseAtual.despesas.length;

        status(
            `Análise concluída em ${workspaceId}.\n\n` +
            `Serão EXCLUÍDOS:\n` +
            `- ${analiseAtual.atendimentos.length} atendimento(s)\n` +
            `- ${analiseAtual.despesas.length} despesa(s)\n\n` +
            `Serão ZERADOS:\n` +
            `- ${analiseAtual.resumosProfissionais.length} resumo(s) profissional(is)\n` +
            `- ${analiseAtual.resumosBarbearia.length} resumo(s) da barbearia\n\n` +
            `Serão PRESERVADOS:\n` +
            `- membros/equipe\n- serviços\n- configurações\n- usuários\n- autenticação\n\n` +
            (total
                ? `Se estiver correto, digite ${FRASE_CONFIRMACAO}.`
                : "Não existem atendimentos ou despesas para excluir. Você ainda pode zerar resumos existentes, se houver.")
        );

        confirmacaoEl.disabled = false;
        confirmacaoEl.focus();
    } catch (error) {
        console.error(error);
        analiseAtual = null;
        status(`Análise bloqueada: ${error.message}`);
    } finally {
        btnAnalisar.disabled = false;
        atualizarEstadoBotao();
    }
}

async function executarOperacoesEmLotes(operacoes) {
    let processadas = 0;

    for (let inicio = 0; inicio < operacoes.length; inicio += TAMANHO_LOTE) {
        exigirAmbienteTeste();

        const lote = operacoes.slice(inicio, inicio + TAMANHO_LOTE);
        const batch = writeBatch(db);

        lote.forEach((operacao) => {
            if (operacao.tipo === "delete") {
                batch.delete(operacao.ref);
                return;
            }

            if (operacao.tipo === "zerar-profissional") {
                batch.set(operacao.ref, resumoProfissionalZerado(operacao.item));
                return;
            }

            if (operacao.tipo === "zerar-barbearia") {
                batch.set(operacao.ref, resumoBarbeariaZerado(operacao.item));
            }
        });

        await batch.commit();
        processadas += lote.length;
        status(`Limpando ambiente de teste... ${processadas}/${operacoes.length} operação(ões).`);
    }
}

async function limpar() {
    if (limpezaEmAndamento) return;

    if (confirmacaoEl.value.trim().toUpperCase() !== FRASE_CONFIRMACAO) {
        status(`Digite exatamente ${FRASE_CONFIRMACAO} para continuar.`);
        return;
    }

    limpezaEmAndamento = true;
    btnAnalisar.disabled = true;
    btnLimpar.disabled = true;
    confirmacaoEl.disabled = true;

    try {
        exigirAmbienteTeste();

        // Releitura imediatamente antes da limpeza para não depender de uma análise antiga.
        status("Conferindo novamente o ambiente antes de excluir qualquer registro...");
        const dados = await coletarDados();
        atualizarContadores(dados);

        const operacoes = [
            ...dados.atendimentos.map((ref) => ({ tipo: "delete", ref })),
            ...dados.despesas.map((ref) => ({ tipo: "delete", ref })),
            ...dados.resumosProfissionais.map((item) => ({
                tipo: "zerar-profissional",
                ref: item.ref,
                item
            })),
            ...dados.resumosBarbearia.map((item) => ({
                tipo: "zerar-barbearia",
                ref: item.ref,
                item
            }))
        ];

        await executarOperacoesEmLotes(operacoes);

        const excluidosAtendimentos = dados.atendimentos.length;
        const excluidasDespesas = dados.despesas.length;
        const zeradosProfissionais = dados.resumosProfissionais.length;
        const zeradosBarbearia = dados.resumosBarbearia.length;

        qtdAtendimentosEl.textContent = "0";
        qtdDespesasEl.textContent = "0";
        qtdResumosProfEl.textContent = String(zeradosProfissionais);
        qtdResumosBarbEl.textContent = String(zeradosBarbearia);

        analiseAtual = null;
        confirmacaoEl.value = "";

        status(
            `LIMPEZA CONCLUÍDA no ambiente ${workspaceId}.\n\n` +
            `${excluidosAtendimentos} atendimento(s) excluído(s).\n` +
            `${excluidasDespesas} despesa(s) excluída(s).\n` +
            `${zeradosProfissionais} resumo(s) profissional(is) zerado(s).\n` +
            `${zeradosBarbearia} resumo(s) da barbearia zerado(s).\n\n` +
            `Equipe, serviços, configurações, usuários e autenticação foram preservados.\n` +
            `Agora o ambiente de teste pode começar do zero com a arquitetura nova.`
        );
    } catch (error) {
        console.error(error);
        status(
            `A limpeza parou com erro: ${error.message}\n\n` +
            `Não execute novamente às cegas. Clique em “Analisar ambiente de teste” para conferir o que ainda existe.`
        );
    } finally {
        limpezaEmAndamento = false;
        btnAnalisar.disabled = false;
        confirmacaoEl.disabled = false;
        atualizarEstadoBotao();
    }
}

confirmacaoEl.addEventListener("input", atualizarEstadoBotao);
btnAnalisar.addEventListener("click", analisar);
btnLimpar.addEventListener("click", limpar);

onAuthStateChanged(auth, async (user) => {
    usuarioAtual = user || null;

    if (!user) {
        ambienteEl.textContent = "Não autenticado";
        status("Entre no Sr NK com sua conta administradora de teste e abra esta página novamente.");
        return;
    }

    try {
        const contexto = await inicializarContexto(user);
        workspaceId = contexto.workspaceId;
        const papel = String(contexto.membro?.papel || "");

        if (!["admin", "owner"].includes(papel)) {
            throw new Error("Somente Administrador pode executar esta ferramenta.");
        }

        ambienteEl.textContent = workspaceId;
        exigirAmbienteTeste();

        btnAnalisar.disabled = false;
        status(
            `Segurança confirmada.\n` +
            `Ambiente: ${workspaceId}\n\n` +
            `Clique em “Analisar ambiente de teste”. Nenhum dado será alterado durante a análise.`
        );
    } catch (error) {
        console.error(error);
        ambienteEl.textContent = workspaceId || "Acesso bloqueado";
        btnAnalisar.disabled = true;
        btnLimpar.disabled = true;
        confirmacaoEl.disabled = true;
        status(`Ferramenta bloqueada: ${error.message}`);
    }
});
