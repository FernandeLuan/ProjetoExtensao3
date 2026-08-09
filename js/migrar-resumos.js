import { auth, db } from "./firebase-init.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
    collection,
    doc,
    getDocs,
    serverTimestamp,
    Timestamp,
    writeBatch
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

import { inicializarContexto } from "./dashboard/data/context.js?v=7.4";
import {
    anexarDeltasAtendimentosAoBatch,
    anexarDeltasDespesasAoBatch,
    RESUMO_VERSION
} from "./dashboard/data/resumos-repository.js?v=7.4";
import { obterDataAtendimento, paraDate } from "./dashboard/utils/date.js?v=7.4";

const ambienteEl = document.getElementById("ambiente");
const qtdAtendimentosEl = document.getElementById("qtdAtendimentos");
const qtdDespesasEl = document.getElementById("qtdDespesas");
const qtdSemProfissionalEl = document.getElementById("qtdSemProfissional");
const qtdJaMigradosEl = document.getElementById("qtdJaMigrados");
const btnAnalisar = document.getElementById("btnAnalisar");
const btnMigrar = document.getElementById("btnMigrar");
const statusEl = document.getElementById("status");

let workspaceId = null;
let atendimentosPendentes = [];
let despesasPendentes = [];
let bloqueados = [];
let jaMigrados = 0;

function status(texto) {
    statusEl.textContent = texto;
}

function versaoResumo(item) {
    return Number(item?.resumoVersion || 0);
}

function dataDespesa(item) {
    return paraDate(item?.dataDespesa) || paraDate(item?.data);
}

function atendimentoMigravel(item) {
    return Boolean(
        versaoResumo(item) < RESUMO_VERSION &&
        String(item?.profissionalUid || "").trim() &&
        obterDataAtendimento(item)
    );
}

function despesaMigravel(item) {
    if (versaoResumo(item) >= RESUMO_VERSION) return false;
    const data = dataDespesa(item);
    if (!data) return false;
    if (item?.tipo === "barbearia") return true;
    return Boolean(String(item?.profissionalUid || "").trim());
}

function motivoBloqueio(tipo, item) {
    if (versaoResumo(item) >= RESUMO_VERSION) return null;

    const data = tipo === "atendimento" ? obterDataAtendimento(item) : dataDespesa(item);
    if (!data) return "sem data válida";

    if (tipo === "atendimento" && !String(item?.profissionalUid || "").trim()) {
        return "sem profissionalUid";
    }

    if (
        tipo === "despesa" &&
        item?.tipo !== "barbearia" &&
        !String(item?.profissionalUid || "").trim()
    ) {
        return "despesa profissional sem profissionalUid";
    }

    return null;
}

function renderizarContadores() {
    qtdAtendimentosEl.textContent = String(atendimentosPendentes.length);
    qtdDespesasEl.textContent = String(despesasPendentes.length);
    qtdSemProfissionalEl.textContent = String(
        bloqueados.filter((item) => item.motivo.includes("profissionalUid")).length
    );
    qtdJaMigradosEl.textContent = String(jaMigrados);
    btnMigrar.disabled = !(atendimentosPendentes.length || despesasPendentes.length);
}

async function analisar() {
    btnAnalisar.disabled = true;
    btnMigrar.disabled = true;
    status("Lendo atendimentos e despesas uma única vez para analisar...");

    try {
        const [atendSnap, despesasSnap] = await Promise.all([
            getDocs(collection(db, "barbearias", workspaceId, "atendimentos")),
            getDocs(collection(db, "barbearias", workspaceId, "despesas"))
        ]);

        const atendimentos = atendSnap.docs.map((snap) => ({ id: snap.id, ...snap.data() }));
        const despesas = despesasSnap.docs.map((snap) => ({ id: snap.id, ...snap.data() }));

        atendimentosPendentes = atendimentos.filter(atendimentoMigravel);
        despesasPendentes = despesas.filter(despesaMigravel);
        jaMigrados = [...atendimentos, ...despesas]
            .filter((item) => versaoResumo(item) >= RESUMO_VERSION)
            .length;

        bloqueados = [];
        atendimentos.forEach((item) => {
            const motivo = motivoBloqueio("atendimento", item);
            if (motivo) bloqueados.push({ tipo: "atendimento", id: item.id, motivo });
        });
        despesas.forEach((item) => {
            const motivo = motivoBloqueio("despesa", item);
            if (motivo) bloqueados.push({ tipo: "despesa", id: item.id, motivo });
        });

        renderizarContadores();

        const linhas = [
            `Análise concluída no ambiente ${workspaceId}.`,
            `Atendimentos lidos: ${atendimentos.length}`,
            `Despesas lidas: ${despesas.length}`,
            `Atendimentos pendentes e seguros para migrar: ${atendimentosPendentes.length}`,
            `Despesas pendentes e seguras para migrar: ${despesasPendentes.length}`,
            `Registros já incorporados aos resumos: ${jaMigrados}`,
            `Registros bloqueados: ${bloqueados.length}`
        ];

        if (bloqueados.length) {
            linhas.push("", "Bloqueados (não serão alterados):");
            bloqueados.slice(0, 20).forEach((item) => {
                linhas.push(`- ${item.tipo} ${item.id}: ${item.motivo}`);
            });
            if (bloqueados.length > 20) linhas.push(`... e mais ${bloqueados.length - 20}.`);
        }

        status(linhas.join("\n"));
    } catch (error) {
        console.error(error);
        status(`Erro ao analisar: ${error.message}`);
    } finally {
        btnAnalisar.disabled = false;
    }
}

async function migrarAtendimentos(lista) {
    const TAMANHO_LOTE = 200;
    let processados = 0;

    for (let inicio = 0; inicio < lista.length; inicio += TAMANHO_LOTE) {
        const lote = lista.slice(inicio, inicio + TAMANHO_LOTE);
        const batch = writeBatch(db);

        anexarDeltasAtendimentosAoBatch(
            batch,
            lote.map((atendimento) => ({ atendimento, sinal: 1 }))
        );

        lote.forEach((atendimento) => {
            const alteracoes = {
                resumoVersion: RESUMO_VERSION,
                resumoMigradoEm: serverTimestamp()
            };

            if (!atendimento.dataAtendimento) {
                const data = obterDataAtendimento(atendimento);
                if (data) alteracoes.dataAtendimento = Timestamp.fromDate(data);
            }

            batch.update(
                doc(db, "barbearias", workspaceId, "atendimentos", atendimento.id),
                alteracoes
            );
        });

        await batch.commit();
        processados += lote.length;
        status(`Migrando atendimentos... ${processados}/${lista.length}`);
    }

    return processados;
}

async function migrarDespesas(lista) {
    const TAMANHO_LOTE = 200;
    let processados = 0;

    for (let inicio = 0; inicio < lista.length; inicio += TAMANHO_LOTE) {
        const lote = lista.slice(inicio, inicio + TAMANHO_LOTE);
        const batch = writeBatch(db);

        anexarDeltasDespesasAoBatch(
            batch,
            lote.map((despesa) => ({ despesa, sinal: 1 }))
        );

        lote.forEach((despesa) => {
            const alteracoes = {
                resumoVersion: RESUMO_VERSION,
                resumoMigradoEm: serverTimestamp()
            };

            if (!despesa.dataDespesa) {
                const data = dataDespesa(despesa);
                if (data) alteracoes.dataDespesa = Timestamp.fromDate(data);
            }

            batch.update(
                doc(db, "barbearias", workspaceId, "despesas", despesa.id),
                alteracoes
            );
        });

        await batch.commit();
        processados += lote.length;
        status(`Migrando despesas... ${processados}/${lista.length}`);
    }

    return processados;
}

async function migrar() {
    if (!atendimentosPendentes.length && !despesasPendentes.length) return;

    const resumo = [
        `Ambiente: ${workspaceId}`,
        `Atendimentos: ${atendimentosPendentes.length}`,
        `Despesas: ${despesasPendentes.length}`,
        bloqueados.length
            ? `${bloqueados.length} registro(s) bloqueado(s) ficarão intactos.`
            : "Nenhum registro bloqueado.",
        "",
        "Continuar?"
    ].join("\n");

    if (!window.confirm(resumo)) return;

    btnMigrar.disabled = true;
    btnAnalisar.disabled = true;

    try {
        const totalAtendimentos = await migrarAtendimentos(atendimentosPendentes);
        const totalDespesas = await migrarDespesas(despesasPendentes);

        status(
            `Migração concluída.\n` +
            `${totalAtendimentos} atendimento(s) incorporado(s) aos resumos.\n` +
            `${totalDespesas} despesa(s) incorporada(s) aos resumos.\n` +
            `${bloqueados.length} registro(s) legado(s) permaneceram intactos.\n\n` +
            `Clique em “Analisar registros” novamente. O esperado é 0 pendentes para os registros migráveis.`
        );

        atendimentosPendentes = [];
        despesasPendentes = [];
        renderizarContadores();
    } catch (error) {
        console.error(error);
        status(
            `A migração parou com erro: ${error.message}\n\n` +
            `Os lotes já concluídos são seguros e foram marcados como migrados. ` +
            `Você pode analisar novamente e continuar somente com os pendentes.`
        );
    } finally {
        btnMigrar.disabled = false;
        btnAnalisar.disabled = false;
    }
}

btnAnalisar.addEventListener("click", analisar);
btnMigrar.addEventListener("click", migrar);

onAuthStateChanged(auth, async (user) => {
    if (!user) {
        ambienteEl.textContent = "Não autenticado";
        status("Entre no Sr NK com uma conta administradora e abra esta página novamente.");
        return;
    }

    try {
        const contexto = await inicializarContexto(user);
        workspaceId = contexto.workspaceId;
        const papel = String(contexto.membro?.papel || "");

        if (!["admin", "owner"].includes(papel)) {
            throw new Error("Somente Administrador pode executar esta migração.");
        }

        ambienteEl.textContent = workspaceId;
        btnAnalisar.disabled = false;
        status(
            `Autenticação confirmada.\n` +
            `Ambiente: ${workspaceId}\n\n` +
            `Clique em “Analisar registros”. Nenhum dado será alterado durante a análise.`
        );
    } catch (error) {
        console.error(error);
        ambienteEl.textContent = "Acesso bloqueado";
        status(`Não foi possível abrir a ferramenta: ${error.message}`);
    }
});
