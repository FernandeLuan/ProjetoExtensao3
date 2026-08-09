import { auth, db } from "./firebase-init.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
    collection,
    doc,
    getDoc,
    getDocs
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const PRODUCAO_ID = "3TYly8cYfAWxI9LCdnAJgKL6t2s2";

const ambienteEl = document.getElementById("ambiente");
const badgeEl = document.getElementById("badge");
const qtdAtendimentosEl = document.getElementById("qtdAtendimentos");
const qtdDespesasEl = document.getElementById("qtdDespesas");
const qtdLegadosEl = document.getElementById("qtdLegados");
const qtdDuplicadosEl = document.getElementById("qtdDuplicados");
const qtdResumosProfEl = document.getElementById("qtdResumosProf");
const qtdResumosBarbEl = document.getElementById("qtdResumosBarb");
const dataInicialEl = document.getElementById("dataInicial");
const dataFinalEl = document.getElementById("dataFinal");
const btnAnalisar = document.getElementById("btnAnalisar");
const btnCopiar = document.getElementById("btnCopiar");
const statusEl = document.getElementById("status");

let contexto = null;
let ultimoRelatorio = "";

function status(texto) {
    ultimoRelatorio = texto;
    statusEl.textContent = texto;
    btnCopiar.disabled = !texto;
}

function limparTexto(valor) {
    return String(valor ?? "").trim();
}

function numero(valor) {
    const n = Number(valor);
    return Number.isFinite(n) ? n : 0;
}

function centavosRegistro(item) {
    const candidatos = [
        item?.valorBrutoCentavos,
        item?.valorFinalCentavos,
        item?.valorCentavos,
        Number.isFinite(Number(item?.valorFinal)) ? Number(item.valorFinal) * 100 : null,
        Number.isFinite(Number(item?.valor)) ? Number(item.valor) * 100 : null
    ];

    for (const candidato of candidatos) {
        const n = Number(candidato);
        if (Number.isFinite(n)) return Math.round(n);
    }
    return 0;
}

function paraDate(valor) {
    if (!valor) return null;
    if (valor instanceof Date && !Number.isNaN(valor.getTime())) return valor;
    if (typeof valor?.toDate === "function") {
        const d = valor.toDate();
        return d instanceof Date && !Number.isNaN(d.getTime()) ? d : null;
    }
    if (typeof valor === "number") {
        const d = new Date(valor);
        return Number.isNaN(d.getTime()) ? null : d;
    }
    if (typeof valor === "string") {
        const texto = valor.trim();
        if (!texto) return null;
        const isoLocal = /^\d{4}-\d{2}-\d{2}$/.test(texto) ? `${texto}T12:00:00` : texto;
        const d = new Date(isoLocal);
        return Number.isNaN(d.getTime()) ? null : d;
    }
    return null;
}

function dataAtendimento(item) {
    return paraDate(item?.dataAtendimento)
        || paraDate(item?.dataHora)
        || paraDate(item?.data)
        || paraDate(item?.criadoEm);
}

function dataDespesa(item) {
    return paraDate(item?.dataDespesa)
        || paraDate(item?.data)
        || paraDate(item?.criadoEm);
}

function formatarData(date) {
    if (!date) return "—";
    return new Intl.DateTimeFormat("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric"
    }).format(date);
}

function formatarDataHora(date) {
    if (!date) return "sem data";
    return new Intl.DateTimeFormat("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit"
    }).format(date);
}

function formaPagamento(item) {
    return limparTexto(item?.formaPagamento || item?.pagamento || item?.metodoPagamento).toLowerCase();
}

function servico(item) {
    return limparTexto(
        item?.servicoNome
        || item?.servico
        || item?.nomeServico
        || item?.servicos?.map?.((s) => s?.nome || s)?.join?.("+")
        || ""
    ).toLowerCase();
}

function chavePossivelDuplicado(item) {
    const data = dataAtendimento(item);
    if (!data) return null;

    // Só considera candidato quando há horário real. Se a informação original é apenas
    // uma data, dois atendimentos iguais no mesmo dia podem ser perfeitamente legítimos.
    const possuiHorario = Boolean(item?.dataAtendimento || item?.dataHora || item?.criadoEm);
    if (!possuiHorario) return null;

    return [
        data.getTime(),
        limparTexto(item?.profissionalUid),
        servico(item),
        centavosRegistro(item),
        formaPagamento(item)
    ].join("|");
}

function agruparPossiveisDuplicados(atendimentos) {
    const mapa = new Map();

    atendimentos.forEach((item) => {
        const chave = chavePossivelDuplicado(item);
        if (!chave) return;
        if (!mapa.has(chave)) mapa.set(chave, []);
        mapa.get(chave).push(item);
    });

    return [...mapa.values()].filter((grupo) => grupo.length > 1);
}

function resumoPessoa(item, membrosPorUid) {
    const uid = limparTexto(item?.profissionalUid);
    if (!uid) return "LEGADO / sem profissionalUid";
    return limparTexto(item?.profissionalNome)
        || limparTexto(membrosPorUid.get(uid)?.nome)
        || limparTexto(membrosPorUid.get(uid)?.email)
        || uid;
}

function compararDatas(a, b) {
    return a.getTime() - b.getTime();
}

async function carregarContextoSomenteLeitura(user) {
    const usuarioSnap = await getDoc(doc(db, "usuarios", user.uid));
    if (!usuarioSnap.exists()) {
        throw new Error("O documento do usuário autenticado não existe.");
    }

    const perfil = usuarioSnap.data();
    const workspaceId = limparTexto(perfil?.barbeariaId);

    if (!workspaceId) {
        throw new Error("O usuário autenticado não possui barbeariaId.");
    }

    if (workspaceId.startsWith("teste-")) {
        throw new Error("Você está no ambiente de TESTE. Entre com a conta da produção do Marlon para auditar.");
    }

    if (workspaceId !== PRODUCAO_ID) {
        throw new Error(`Ambiente recusado por segurança: ${workspaceId}`);
    }

    const [barbeariaSnap, membroSnap] = await Promise.all([
        getDoc(doc(db, "barbearias", workspaceId)),
        getDoc(doc(db, "barbearias", workspaceId, "membros", user.uid))
    ]);

    if (!barbeariaSnap.exists()) {
        throw new Error("A barbearia de produção não foi encontrada.");
    }

    if (!membroSnap.exists()) {
        throw new Error("O usuário autenticado não é membro da barbearia de produção.");
    }

    const membro = membroSnap.data();
    const papel = limparTexto(membro?.papel).toLowerCase();
    if (!["admin", "owner"].includes(papel)) {
        throw new Error("A auditoria exige uma conta Administrador/Owner da produção.");
    }

    return {
        user,
        workspaceId,
        perfil,
        barbearia: barbeariaSnap.data(),
        membro
    };
}

async function analisar() {
    if (!contexto?.workspaceId) return;

    btnAnalisar.disabled = true;
    status("Lendo a produção. Nenhum documento será alterado...\n\nAguarde até aparecer ‘AUDITORIA CONCLUÍDA’. ");

    try {
        const base = ["barbearias", contexto.workspaceId];

        const [atendSnap, despesasSnap, membrosSnap, resumoBarbSnap] = await Promise.all([
            getDocs(collection(db, ...base, "atendimentos")),
            getDocs(collection(db, ...base, "despesas")),
            getDocs(collection(db, ...base, "membros")),
            getDocs(collection(db, ...base, "resumosBarbearia"))
        ]);

        const atendimentos = atendSnap.docs.map((snap) => ({ id: snap.id, ...snap.data() }));
        const despesas = despesasSnap.docs.map((snap) => ({ id: snap.id, ...snap.data() }));
        const membros = membrosSnap.docs.map((snap) => ({ id: snap.id, ...snap.data() }));
        const membrosPorUid = new Map(membros.map((m) => [m.id, m]));

        // Cada membro tem sua própria subcoleção dias. Esta é a única forma segura de
        // enumerá-las sem uma collectionGroup que misture outras barbearias.
        const resumosPorProfissional = [];
        for (const membro of membros) {
            const diasSnap = await getDocs(
                collection(db, ...base, "resumosProfissionais", membro.id, "dias")
            );
            if (diasSnap.size > 0) {
                resumosPorProfissional.push({
                    uid: membro.id,
                    nome: limparTexto(membro.nome) || limparTexto(membro.email) || membro.id,
                    quantidade: diasSnap.size
                });
            }
        }

        const legados = atendimentos.filter((item) => !limparTexto(item?.profissionalUid));
        const comProfissional = atendimentos.length - legados.length;
        const semData = atendimentos.filter((item) => !dataAtendimento(item));
        const marcadosResumo = atendimentos.filter((item) => numero(item?.resumoVersion) > 0);
        const duplicados = agruparPossiveisDuplicados(atendimentos);

        const datasAtendimentos = atendimentos.map(dataAtendimento).filter(Boolean).sort(compararDatas);
        const datasDespesas = despesas.map(dataDespesa).filter(Boolean).sort(compararDatas);
        const todasDatas = [...datasAtendimentos, ...datasDespesas].sort(compararDatas);
        const primeiraData = todasDatas[0] || null;
        const ultimaData = todasDatas[todasDatas.length - 1] || null;

        const porProfissional = new Map();
        atendimentos.forEach((item) => {
            const nome = resumoPessoa(item, membrosPorUid);
            porProfissional.set(nome, (porProfissional.get(nome) || 0) + 1);
        });

        qtdAtendimentosEl.textContent = String(atendimentos.length);
        qtdDespesasEl.textContent = String(despesas.length);
        qtdLegadosEl.textContent = String(legados.length);
        qtdDuplicadosEl.textContent = String(duplicados.reduce((total, grupo) => total + grupo.length, 0));
        qtdResumosProfEl.textContent = String(resumosPorProfissional.reduce((t, x) => t + x.quantidade, 0));
        qtdResumosBarbEl.textContent = String(resumoBarbSnap.size);
        dataInicialEl.textContent = formatarData(primeiraData);
        dataFinalEl.textContent = formatarData(ultimaData);

        const linhas = [
            "AUDITORIA CONCLUÍDA — SOMENTE LEITURA",
            "",
            `Ambiente: ${contexto.workspaceId}`,
            `Barbearia: ${limparTexto(contexto.barbearia?.nome) || "sem nome"}`,
            `Conta usada: ${limparTexto(contexto.membro?.nome) || contexto.user.email || contexto.user.uid}`,
            `Papel: ${limparTexto(contexto.membro?.papel) || "—"}`,
            "",
            "DADOS PRINCIPAIS",
            `- Atendimentos: ${atendimentos.length}`,
            `- Despesas: ${despesas.length}`,
            `- Atendimentos com profissionalUid: ${comProfissional}`,
            `- Atendimentos SEM profissionalUid: ${legados.length}`,
            `- Atendimentos sem data reconhecível: ${semData.length}`,
            `- Atendimentos já marcados com resumoVersion: ${marcadosResumo.length}`,
            `- Primeiro registro reconhecido: ${formatarData(primeiraData)}`,
            `- Último registro reconhecido: ${formatarData(ultimaData)}`,
            "",
            "RESUMOS EXISTENTES",
            `- Dias em resumos profissionais: ${resumosPorProfissional.reduce((t, x) => t + x.quantidade, 0)}`,
            `- Dias em resumos da barbearia: ${resumoBarbSnap.size}`
        ];

        if (resumosPorProfissional.length) {
            resumosPorProfissional.forEach((item) => {
                linhas.push(`  • ${item.nome}: ${item.quantidade} dia(s)`);
            });
        }

        linhas.push("", "ATENDIMENTOS POR PROFISSIONAL");
        if (porProfissional.size === 0) {
            linhas.push("- nenhum atendimento");
        } else {
            [...porProfissional.entries()]
                .sort((a, b) => b[1] - a[1])
                .forEach(([nome, quantidade]) => linhas.push(`- ${nome}: ${quantidade}`));
        }

        linhas.push("", "LEGADOS SEM profissionalUid");
        if (!legados.length) {
            linhas.push("- nenhum");
        } else {
            legados.slice(0, 50).forEach((item) => {
                linhas.push(
                    `- ${item.id} | ${formatarDataHora(dataAtendimento(item))} | ` +
                    `${limparTexto(item.servicoNome || item.servico || item.nomeServico) || "serviço não identificado"} | ` +
                    `R$ ${(centavosRegistro(item) / 100).toFixed(2).replace(".", ",")} | ` +
                    `${limparTexto(item.formaPagamento || item.pagamento || item.metodoPagamento) || "pagamento não identificado"}`
                );
            });
            if (legados.length > 50) linhas.push(`... e mais ${legados.length - 50}.`);
        }

        linhas.push("", "POSSÍVEIS DUPLICADOS");
        if (!duplicados.length) {
            linhas.push("- nenhum candidato exato encontrado");
        } else {
            linhas.push("Atenção: são apenas candidatos com mesma data/hora + profissional + serviço + valor + pagamento. Não serão excluídos automaticamente.");
            duplicados.slice(0, 20).forEach((grupo, indice) => {
                linhas.push(`- Grupo ${indice + 1}: ${grupo.map((item) => item.id).join(", ")}`);
            });
            if (duplicados.length > 20) linhas.push(`... e mais ${duplicados.length - 20} grupo(s).`);
        }

        linhas.push(
            "",
            "NENHUM DADO FOI MODIFICADO.",
            "Copie este resultado e envie no chat antes de qualquer migração."
        );

        status(linhas.join("\n"));
    } catch (error) {
        console.error(error);
        status(`Erro durante a auditoria: ${error.message}\n\nNenhum dado foi alterado.`);
    } finally {
        btnAnalisar.disabled = false;
    }
}

btnAnalisar.addEventListener("click", analisar);
btnCopiar.addEventListener("click", async () => {
    if (!ultimoRelatorio) return;
    try {
        await navigator.clipboard.writeText(ultimoRelatorio);
        const textoOriginal = btnCopiar.textContent;
        btnCopiar.textContent = "Copiado";
        setTimeout(() => { btnCopiar.textContent = textoOriginal; }, 1400);
    } catch {
        window.prompt("Copie o relatório abaixo:", ultimoRelatorio);
    }
});

onAuthStateChanged(auth, async (user) => {
    if (!user) {
        ambienteEl.textContent = "Não autenticado";
        status("Entre no Sr NK com a conta administradora/owner da PRODUÇÃO e abra esta página novamente.");
        return;
    }

    try {
        contexto = await carregarContextoSomenteLeitura(user);
        ambienteEl.textContent = `${contexto.workspaceId} • ${limparTexto(contexto.barbearia?.nome) || "Sr NK"}`;
        badgeEl.hidden = false;
        btnAnalisar.disabled = false;
        status(
            `Produção confirmada.\n` +
            `Ambiente: ${contexto.workspaceId}\n` +
            `Usuário: ${limparTexto(contexto.membro?.nome) || user.email || user.uid}\n\n` +
            `Clique em “Analisar produção”. A operação é somente leitura.`
        );
    } catch (error) {
        console.error(error);
        contexto = null;
        ambienteEl.textContent = "Acesso bloqueado";
        badgeEl.hidden = true;
        btnAnalisar.disabled = true;
        status(`Não foi possível abrir a auditoria:\n${error.message}\n\nNenhum dado foi alterado.`);
    }
});
