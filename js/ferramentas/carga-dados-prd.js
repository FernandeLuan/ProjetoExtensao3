import { auth, db } from "../firebase-init.js?v=9.0";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
    collection,
    doc,
    getDocs,
    query,
    serverTimestamp,
    where,
    writeBatch
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

import { inicializarContexto, obterWorkspaceId } from "../shared/data/context.js?v=9.0";
import { recarregarConfiguracoes, invalidarCacheAtendimentos } from "../shared/data/sync.js?v=9.0";
import { listarMembrosEquipe } from "../shared/data/equipe-repository.js?v=9.0";
import { state } from "../shared/state.js?v=9.0";
import { usuarioEhAdmin } from "../shared/permissoes.js?v=9.0";
import { obterServicos, resolverPrecoServico, pagamentoEstaAtivo } from "../shared/services/catalogo-service.js?v=9.0";
import { criarPayloadAtendimento } from "../shared/services/atendimento-model.js?v=9.0";
import {
    anexarDeltasAtendimentosAoBatch,
    invalidarCacheResumos,
    RESUMO_VERSION
} from "../shared/data/resumos-repository.js?v=9.0";

const PRODUCAO_ID = "3TYly8cYfAWxI9LCdnAJgKL6t2s2";
const EMAIL_MARLON = "fernandemarlon93@gmail.com";
const EMAIL_JOSE = "josehenriqueribeiro405@gmail.com";
const CARGA_JOSE = "ETAPA8_JOSE_20260710_20260810_V1";
const CARGA_MARLON_V1 = "PRD_MARLON_REAL_20260803_20260805_V1";
const CARGA_MARLON = "PRD_MARLON_REAL_20260803_20260805_V2";

const contextoEl = document.getElementById("contextoCarga");
const statusJose = document.getElementById("statusJose");
const statusMarlon = document.getElementById("statusMarlon");
const btnJose = document.getElementById("btnCargaJose");
const btnRemoverJose = document.getElementById("btnRemoverCargaJose");
const btnCompletarJoseHoje = document.getElementById("btnCompletarJoseHoje");
const btnMarlon = document.getElementById("btnCargaMarlon");

let membros = [];
let pronto = false;

function texto(el, valor, classe = "") {
    if (!el) return;
    el.textContent = valor;
    el.classList.remove("carga-ok", "carga-alerta");
    if (classe) el.classList.add(classe);
}

function normalizar(valor) {
    return String(valor || "")
        .trim()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/\s+/g, " ");
}

function membroPorEmail(email) {
    const alvo = String(email || "").trim().toLowerCase();
    return membros.find((m) => String(m?.email || "").trim().toLowerCase() === alvo) || null;
}

function nomeRegistrador() {
    return String(
        state.perfilUsuario?.nome
        || state.membroAtual?.nome
        || state.user?.displayName
        || state.user?.email
        || "Administrador"
    ).trim();
}

function configDoProfissional(membro) {
    const debito = Number(membro?.taxaDebitoPct);
    const credito = Number(membro?.taxaCreditoPct);

    return {
        ...state.configSistema,
        taxaDebito: Number.isFinite(debito) ? debito : state.configSistema?.taxaDebito,
        taxaCredito: Number.isFinite(credito) ? credito : state.configSistema?.taxaCredito
    };
}

function resumoTaxasProfissional(membro) {
    const config = configDoProfissional(membro);
    const debito = Number(config?.taxaDebito);
    const credito = Number(config?.taxaCredito);
    const fmt = (valor) => Number.isFinite(valor) ? `${valor.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%` : "não configurada";
    return {
        debito,
        credito,
        texto: `Débito ${fmt(debito)} • Crédito ${fmt(credito)}`
    };
}

function servicoPorNome(nome) {
    const alvo = normalizar(nome);
    return obterServicos({ somenteAtivos: true })
        .find((s) => normalizar(s?.nome) === alvo) || null;
}

function payloadPara({ membro, servico, pagamento, data, horaInformada, cargaId, cargaItem }) {
    const preco = resolverPrecoServico(servico, membro);
    const config = configDoProfissional(membro);
    const payload = criarPayloadAtendimento({
        servico: servico.nome,
        servicoId: servico.id,
        servicoNome: servico.nome,
        precoBase: preco.precoBase,
        precoProfissional: preco.precoProfissional,
        origemPreco: preco.origem,
        pagamento,
        valorBruto: preco.preco,
        observacao: "",
        valorDiferenciado: false,
        dataAtendimento: data,
        retroativo: true,
        horaInformada,
        profissional: membro
    }, config);

    return {
        ...payload,
        cargaId,
        cargaItem,
        origemCarga: "etapa8"
    };
}

function referenciaAtendimentos() {
    return collection(db, "barbearias", obterWorkspaceId(), "atendimentos");
}

async function buscarCarga(cargaId) {
    const snap = await getDocs(query(referenciaAtendimentos(), where("cargaId", "==", cargaId)));
    return snap.docs.map((d) => ({ id: d.id, ref: d.ref, ...d.data() }));
}

async function gravarCarga(registros, cargaId) {
    const existentes = await buscarCarga(cargaId);
    if (existentes.length) {
        throw new Error(`Esta carga já existe com ${existentes.length} atendimento(s). Nada foi duplicado.`);
    }

    const batch = writeBatch(db);
    const entradasResumo = [];
    const uidRegistrador = state.user?.uid;
    const registradorNome = nomeRegistrador();

    registros.forEach((registro) => {
        const ref = doc(referenciaAtendimentos());
        const dados = {
            ...registro,
            registradoPorUid: uidRegistrador,
            registradoPorNome: registradorNome,
            resumoVersion: RESUMO_VERSION
        };

        batch.set(ref, {
            ...dados,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
        });
        entradasResumo.push({ atendimento: dados, sinal: 1 });
    });

    anexarDeltasAtendimentosAoBatch(batch, entradasResumo);
    await batch.commit();
    invalidarCacheAtendimentos();
    invalidarCacheResumos();
}

async function gravarRegistrosAdicionais(registros) {
    if (!registros.length) return 0;

    const batch = writeBatch(db);
    const entradasResumo = [];
    const uidRegistrador = state.user?.uid;
    const registradorNome = nomeRegistrador();

    registros.forEach((registro) => {
        const ref = doc(referenciaAtendimentos());
        const dados = {
            ...registro,
            registradoPorUid: uidRegistrador,
            registradoPorNome: registradorNome,
            resumoVersion: RESUMO_VERSION
        };

        batch.set(ref, {
            ...dados,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
        });
        entradasResumo.push({ atendimento: dados, sinal: 1 });
    });

    anexarDeltasAtendimentosAoBatch(batch, entradasResumo);
    await batch.commit();
    invalidarCacheAtendimentos();
    invalidarCacheResumos();
    return registros.length;
}

async function substituirCarga(existentes, registros) {
    const batch = writeBatch(db);
    existentes.forEach((item) => batch.delete(item.ref));

    const entradasResumo = [
        ...existentes.map((atendimento) => ({ atendimento, sinal: -1 })),
        ...registros.map((atendimento) => ({ atendimento, sinal: 1 }))
    ];

    const uidRegistrador = state.user?.uid;
    const registradorNome = nomeRegistrador();

    registros.forEach((registro) => {
        const ref = doc(referenciaAtendimentos());
        batch.set(ref, {
            ...registro,
            registradoPorUid: uidRegistrador,
            registradoPorNome: registradorNome,
            resumoVersion: RESUMO_VERSION,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
        });
    });

    anexarDeltasAtendimentosAoBatch(batch, entradasResumo);
    await batch.commit();
    invalidarCacheAtendimentos();
    invalidarCacheResumos();
}

function ehDataLocal(data, ano, mes, dia) {
    const valor = data?.toDate ? data.toDate() : (data instanceof Date ? data : new Date(data));
    return valor instanceof Date
        && !Number.isNaN(valor.getTime())
        && valor.getFullYear() === ano
        && valor.getMonth() === mes - 1
        && valor.getDate() === dia;
}

function registrosJoseHojePlanejados(jose) {
    return gerarCargaJose(jose).filter((registro) => ehDataLocal(registro.dataAtendimento, 2026, 8, 10));
}

async function removerCarga(cargaId) {
    const existentes = await buscarCarga(cargaId);
    if (!existentes.length) return 0;

    const batch = writeBatch(db);
    existentes.forEach((item) => batch.delete(item.ref));
    anexarDeltasAtendimentosAoBatch(
        batch,
        existentes.map((atendimento) => ({ atendimento, sinal: -1 }))
    );
    await batch.commit();
    invalidarCacheAtendimentos();
    invalidarCacheResumos();
    return existentes.length;
}

function mulberry32(seed) {
    let a = seed >>> 0;
    return function rand() {
        a |= 0;
        a = a + 0x6D2B79F5 | 0;
        let t = Math.imul(a ^ a >>> 15, 1 | a);
        t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
}

function escolhaPonderada(rand, itens) {
    const total = itens.reduce((s, i) => s + i.peso, 0);
    let alvo = rand() * total;
    for (const item of itens) {
        alvo -= item.peso;
        if (alvo <= 0) return item.valor;
    }
    return itens[itens.length - 1]?.valor;
}

function pesosServicos(servicos) {
    return servicos.map((servico) => {
        const n = normalizar(servico.nome);
        let peso = 8;
        if (n === "cabelo") peso = 45;
        else if (n.includes("cabelo + sobrancelha")) peso = 18;
        else if (n.includes("cabelo + barba") && !n.includes("sobrancelha")) peso = 17;
        else if (n === "barba") peso = 10;
        else if (n.includes("cabelo") && n.includes("barba") && n.includes("sobrancelha")) peso = 10;
        return { valor: servico, peso };
    });
}

function gerarCargaJose(jose) {
    const servicos = obterServicos({ somenteAtivos: true });
    if (!servicos.length) throw new Error("Nenhum serviço ativo foi encontrado.");

    const rand = mulberry32(20260710);
    const servicosPeso = pesosServicos(servicos);
    // Distribuição de teste mais próxima de um cenário real de operação e,
    // principalmente, útil para validar as taxas de cartão no retroativo.
    const pagamentos = [
        { valor: "Pix", peso: 55 },
        { valor: "Débito", peso: 25 },
        { valor: "Crédito", peso: 20 }
    ].filter((item) => pagamentoEstaAtivo(item.valor));

    if (!pagamentos.length) throw new Error("Nenhuma forma de pagamento está ativa.");

    const inicio = new Date(2026, 6, 10);
    const fim = new Date(2026, 7, 10);
    const registros = [];
    let dia = new Date(inicio);
    let item = 0;

    while (dia <= fim) {
        const semana = dia.getDay();
        if (semana !== 0) {
            const quantidade = 5 + Math.floor(rand() * 6);
            const slots = Array.from({ length: 15 }, (_, i) => 9 * 60 + i * 42);

            for (let i = slots.length - 1; i > 0; i -= 1) {
                const j = Math.floor(rand() * (i + 1));
                [slots[i], slots[j]] = [slots[j], slots[i]];
            }

            slots.slice(0, quantidade).sort((a, b) => a - b).forEach((minutos) => {
                item += 1;
                const data = new Date(dia);
                data.setHours(Math.floor(minutos / 60), minutos % 60, 0, 0);
                const servico = escolhaPonderada(rand, servicosPeso);
                const pagamento = escolhaPonderada(rand, pagamentos);
                registros.push(payloadPara({
                    membro: jose,
                    servico,
                    pagamento,
                    data,
                    horaInformada: true,
                    cargaId: CARGA_JOSE,
                    cargaItem: item
                }));
            });
        }
        dia.setDate(dia.getDate() + 1);
    }

    return registros;
}

function dataSemHora(ano, mes, dia) {
    const data = new Date(ano, mes - 1, dia, 12, 0, 0, 0);
    return data;
}

function gerarCargaMarlon(marlon) {
    const cabelo = servicoPorNome("Cabelo");
    const cabeloSobrancelha = servicoPorNome("Cabelo + Sobrancelha");
    const cabeloBarba = servicoPorNome("Cabelo + Barba");

    if (!cabelo || !cabeloSobrancelha || !cabeloBarba) {
        throw new Error("Os serviços Cabelo, Cabelo + Sobrancelha e Cabelo + Barba precisam existir e estar ativos.");
    }

    const plano = [
        // 03/08: 6 Cabelo • exatamente 1 Crédito + 5 Pix
        { data: dataSemHora(2026, 8, 3), pagamento: "Crédito", servico: cabelo },
        ...Array.from({ length: 5 }, () => ({ data: dataSemHora(2026, 8, 3), pagamento: "Pix", servico: cabelo })),

        // 04/08: 2 Cabelo no Crédito, 1 Cabelo no Débito e os 5 restantes no Pix.
        // Serviços do dia: 2 Cabelo + Sobrancelha, 1 Cabelo + Barba e 5 Cabelo.
        { data: dataSemHora(2026, 8, 4), pagamento: "Crédito", servico: cabelo },
        { data: dataSemHora(2026, 8, 4), pagamento: "Crédito", servico: cabelo },
        { data: dataSemHora(2026, 8, 4), pagamento: "Débito", servico: cabelo },
        { data: dataSemHora(2026, 8, 4), pagamento: "Pix", servico: cabeloSobrancelha },
        { data: dataSemHora(2026, 8, 4), pagamento: "Pix", servico: cabeloSobrancelha },
        { data: dataSemHora(2026, 8, 4), pagamento: "Pix", servico: cabeloBarba },
        { data: dataSemHora(2026, 8, 4), pagamento: "Pix", servico: cabelo },
        { data: dataSemHora(2026, 8, 4), pagamento: "Pix", servico: cabelo },

        // 05/08: 1 Cabelo + Barba e 6 Cabelo • 1 Crédito + 3 Débito + 3 Pix.
        // O usuário informou os totais por pagamento, sem vincular um pagamento específico ao combo.
        { data: dataSemHora(2026, 8, 5), pagamento: "Pix", servico: cabeloBarba },
        { data: dataSemHora(2026, 8, 5), pagamento: "Crédito", servico: cabelo },
        { data: dataSemHora(2026, 8, 5), pagamento: "Débito", servico: cabelo },
        { data: dataSemHora(2026, 8, 5), pagamento: "Débito", servico: cabelo },
        { data: dataSemHora(2026, 8, 5), pagamento: "Débito", servico: cabelo },
        { data: dataSemHora(2026, 8, 5), pagamento: "Pix", servico: cabelo },
        { data: dataSemHora(2026, 8, 5), pagamento: "Pix", servico: cabelo }
    ];

    return plano.map((item, indice) => payloadPara({
        membro: marlon,
        servico: item.servico,
        pagamento: item.pagamento,
        data: item.data,
        horaInformada: false,
        cargaId: CARGA_MARLON,
        cargaItem: indice + 1
    }));
}

async function atualizarEstadoBotoes() {
    const jose = membroPorEmail(EMAIL_JOSE);
    const marlon = membroPorEmail(EMAIL_MARLON);
    const [joseExistente, marlonV1Existente, marlonExistente] = await Promise.all([
        buscarCarga(CARGA_JOSE),
        buscarCarga(CARGA_MARLON_V1),
        buscarCarga(CARGA_MARLON)
    ]);

    btnCompletarJoseHoje.disabled = true;

    if (!jose) {
        texto(statusJose, "José Henrique não foi encontrado na coleção membros. Restaure/crie o acesso pela tela Equipe antes de executar a carga.", "carga-alerta");
        btnJose.disabled = true;
        btnRemoverJose.disabled = joseExistente.length === 0;
    } else if (jose.removido === true || jose.ativo !== true) {
        texto(statusJose, `José Henrique foi encontrado, mas está ${jose.removido === true ? "removido" : "inativo"}. Restaure/ative o acesso em Equipe primeiro.`, "carga-alerta");
        btnJose.disabled = true;
        btnRemoverJose.disabled = joseExistente.length === 0;
    } else if (joseExistente.length) {
        const planejadosHoje = registrosJoseHojePlanejados(jose);
        const itensExistentes = new Set(joseExistente.map((item) => Number(item.cargaItem)));
        const hojePresentes = planejadosHoje.filter((item) => itensExistentes.has(Number(item.cargaItem))).length;
        const faltamHoje = Math.max(0, planejadosHoje.length - hojePresentes);
        const taxas = resumoTaxasProfissional(jose);

        btnJose.textContent = "Recriar carga completa do José com taxas atuais";
        btnJose.disabled = false;
        btnRemoverJose.disabled = false;

        if (faltamHoje > 0) {
            texto(statusJose, `Carga encontrada com ${joseExistente.length} atendimento(s). Faltam ${faltamHoje} dos ${planejadosHoje.length} previstos para hoje. Taxas atuais: ${taxas.texto}. Para atualizar também todo o retroativo, use “Recriar carga completa”.`, "carga-alerta");
            btnCompletarJoseHoje.disabled = false;
        } else {
            const classe = (taxas.debito > 0 && taxas.credito > 0) ? "carga-ok" : "carga-alerta";
            const aviso = (taxas.debito > 0 && taxas.credito > 0)
                ? "A recriação recalculará todos os snapshots financeiros com essas taxas."
                : "Configure Débito e Crédito no José antes de recriar se quiser validar descontos de cartão.";
            texto(statusJose, `Carga atual: ${joseExistente.length} atendimentos. Hoje (10/08): ${planejadosHoje.length} previstos. Taxas atuais: ${taxas.texto}. ${aviso}`, classe);
        }
    } else {
        const previstos = gerarCargaJose(jose);
        const hoje = registrosJoseHojePlanejados(jose);
        const taxas = resumoTaxasProfissional(jose);
        btnJose.textContent = "Inserir carga completa do José Henrique";
        texto(statusJose, `Pronto para inserir ${previstos.length} atendimentos entre 10/07 e 10/08, sem domingos. Inclui ${hoje.length} atendimentos hoje. Pagamentos: Pix, Débito e Crédito. Taxas atuais: ${taxas.texto}.`, (taxas.debito > 0 && taxas.credito > 0) ? "carga-ok" : "carga-alerta");
        btnJose.disabled = false;
        btnRemoverJose.disabled = true;
    }

    if (!marlon) {
        texto(statusMarlon, "Marlon não foi encontrado na coleção membros.", "carga-alerta");
        btnMarlon.disabled = true;
    } else if (marlon.ativo !== true || marlon.removido === true) {
        texto(statusMarlon, "O cadastro do Marlon não está ativo. A carga real foi bloqueada.", "carga-alerta");
        btnMarlon.disabled = true;
    } else if (marlonExistente.length) {
        texto(statusMarlon, `Carga real corrigida já inserida: ${marlonExistente.length} atendimentos. Nada será duplicado.`, "carga-ok");
        btnMarlon.disabled = true;
    } else if (marlonV1Existente.length) {
        texto(statusMarlon, `Foi encontrada a carga anterior com ${marlonV1Existente.length} atendimentos. Clique abaixo para corrigir a distribuição dos pagamentos de 04/08 sem duplicar os dados.`, "carga-alerta");
        btnMarlon.textContent = "Corrigir os 21 atendimentos do Marlon";
        btnMarlon.disabled = false;
    } else {
        btnMarlon.textContent = "Inserir 21 atendimentos reais do Marlon";
        texto(statusMarlon, "Pronto para inserir exatamente 21 atendimentos reais nos dias 03, 04 e 05/08 com a distribuição de pagamentos informada.", "carga-ok");
        btnMarlon.disabled = false;
    }
}

btnJose?.addEventListener("click", async () => {
    if (!pronto) return;
    btnJose.disabled = true;
    try {
        // Recarrega o membro imediatamente antes da geração. Assim as taxas recém-salvas
        // em Equipe > Dados entram nos snapshots de TODO o período retroativo.
        membros = await listarMembrosEquipe({ forcar: true });
        const jose = membroPorEmail(EMAIL_JOSE);
        if (!jose || jose.ativo !== true || jose.removido === true) throw new Error("José Henrique precisa estar ativo.");

        const taxas = resumoTaxasProfissional(jose);
        const existentes = await buscarCarga(CARGA_JOSE);
        const registros = gerarCargaJose(jose);

        if (existentes.length) {
            const confirmar = confirm(
                `Recriar TODOS os ${existentes.length} atendimentos de teste do José entre 10/07 e 10/08?\n\n` +
                `Taxas que serão usadas nos novos snapshots:\n${taxas.texto}\n\n` +
                `A carga antiga será removida, os resumos serão revertidos e os atendimentos serão gerados novamente. Nenhum atendimento manual será apagado.`
            );
            if (!confirmar) return;

            texto(statusJose, `Removendo a carga anterior (${existentes.length}) e revertendo resumos...`);
            await removerCarga(CARGA_JOSE);
            texto(statusJose, `Recriando ${registros.length} atendimentos retroativos com as taxas atuais...`);
            await gravarCarga(registros, CARGA_JOSE);
            texto(statusJose, `${registros.length} atendimentos do José recriados com snapshots financeiros atualizados ✓`, "carga-ok");
        } else {
            const confirmar = confirm(
                `Inserir ${registros.length} atendimentos de teste do José entre 10/07 e 10/08?\n\n` +
                `Taxas atuais: ${taxas.texto}\nPagamentos: Pix, Débito e Crédito.`
            );
            if (!confirmar) return;

            texto(statusJose, `Inserindo ${registros.length} atendimentos...`);
            await gravarCarga(registros, CARGA_JOSE);
            texto(statusJose, `${registros.length} atendimentos de teste inseridos com sucesso ✓`, "carga-ok");
        }
    } catch (error) {
        console.error(error);
        texto(statusJose, error.message || "Falha na carga do José.", "carga-alerta");
    } finally {
        await atualizarEstadoBotoes();
    }
});

btnCompletarJoseHoje?.addEventListener("click", async () => {
    if (!pronto) return;
    btnCompletarJoseHoje.disabled = true;
    try {
        membros = await listarMembrosEquipe({ forcar: true });
        const jose = membroPorEmail(EMAIL_JOSE);
        if (!jose || jose.ativo !== true || jose.removido === true) throw new Error("José Henrique precisa estar ativo.");

        const existentes = await buscarCarga(CARGA_JOSE);
        if (!existentes.length) throw new Error("A carga principal do José ainda não foi executada. Use primeiro “Inserir carga do José Henrique”.");

        const itensExistentes = new Set(existentes.map((item) => Number(item.cargaItem)));
        const faltantes = registrosJoseHojePlanejados(jose)
            .filter((item) => !itensExistentes.has(Number(item.cargaItem)));

        if (!faltantes.length) {
            texto(statusJose, "Os atendimentos previstos para hoje já estão completos. Nada foi duplicado.", "carga-ok");
        } else {
            texto(statusJose, `Inserindo ${faltantes.length} atendimento(s) que faltavam hoje...`);
            await gravarRegistrosAdicionais(faltantes);
            texto(statusJose, `${faltantes.length} atendimento(s) de hoje inserido(s) sem duplicar a carga anterior ✓`, "carga-ok");
        }
    } catch (error) {
        console.error(error);
        texto(statusJose, error.message || "Falha ao completar os atendimentos de hoje do José.", "carga-alerta");
    } finally {
        await atualizarEstadoBotoes();
    }
});

btnRemoverJose?.addEventListener("click", async () => {
    if (!pronto) return;
    if (!confirm("Remover somente os atendimentos gerados pela carga de teste do José Henrique?")) return;
    btnRemoverJose.disabled = true;
    try {
        texto(statusJose, "Removendo carga de teste e revertendo os resumos...");
        const removidos = await removerCarga(CARGA_JOSE);
        texto(statusJose, `${removidos} atendimento(s) de teste removidos ✓`, "carga-ok");
    } catch (error) {
        console.error(error);
        texto(statusJose, error.message || "Falha ao remover a carga do José.", "carga-alerta");
    } finally {
        await atualizarEstadoBotoes();
    }
});

btnMarlon?.addEventListener("click", async () => {
    if (!pronto) return;
    btnMarlon.disabled = true;
    try {
        membros = await listarMembrosEquipe({ forcar: true });
        const marlon = membroPorEmail(EMAIL_MARLON);
        if (!marlon || marlon.ativo !== true || marlon.removido === true) throw new Error("Marlon precisa estar ativo.");

        const [v1, v2] = await Promise.all([
            buscarCarga(CARGA_MARLON_V1),
            buscarCarga(CARGA_MARLON)
        ]);

        if (v2.length) {
            throw new Error(`A carga corrigida já existe com ${v2.length} atendimento(s). Nada foi duplicado.`);
        }

        const registros = gerarCargaMarlon(marlon);

        if (v1.length) {
            if (!confirm("A carga anterior do Marlon foi encontrada. Corrigir os 21 registros, preservando os totais e ajustando a distribuição dos pagamentos de 04/08?")) return;
            texto(statusMarlon, "Corrigindo os 21 atendimentos e recalculando os resumos...");
            await substituirCarga(v1, registros);
            texto(statusMarlon, "21 atendimentos do Marlon corrigidos com sucesso ✓", "carga-ok");
        } else {
            if (!confirm("Inserir os 21 atendimentos reais informados para o Marlon em 03, 04 e 05/08?")) return;
            texto(statusMarlon, "Inserindo 21 atendimentos e atualizando resumos...");
            await gravarCarga(registros, CARGA_MARLON);
            texto(statusMarlon, "21 atendimentos reais do Marlon inseridos com sucesso ✓", "carga-ok");
        }
    } catch (error) {
        console.error(error);
        texto(statusMarlon, error.message || "Falha na carga do Marlon.", "carga-alerta");
    } finally {
        await atualizarEstadoBotoes();
    }
});

onAuthStateChanged(auth, async (user) => {
    if (!user) {
        location.href = "login.html";
        return;
    }

    try {
        const contexto = await inicializarContexto(user);
        if (contexto.workspaceId !== PRODUCAO_ID) {
            throw new Error(`Ambiente recusado: ${contexto.workspaceId}. Esta ferramenta aceita apenas a produção oficial.`);
        }
        if (!usuarioEhAdmin()) {
            throw new Error("É necessário entrar com um Admin/Owner ativo.");
        }

        await recarregarConfiguracoes();
        membros = await listarMembrosEquipe({ forcar: true });
        pronto = true;
        texto(contextoEl, `Produção confirmada • ${contexto.workspaceId}\nConta: ${user.email || user.uid}`, "carga-ok");
        await atualizarEstadoBotoes();
    } catch (error) {
        console.error(error);
        pronto = false;
        texto(contextoEl, error.message || "Não foi possível validar a produção.", "carga-alerta");
    }
});
