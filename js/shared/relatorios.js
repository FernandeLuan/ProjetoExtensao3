import { state } from "./state.js?v=12.0";
import { obterAtendimentosPeriodo } from "./data/sync.js?v=12.0";
import { listarVendasPorPeriodo } from "./data/estoque-repository.js?v=12.0";
import { listarDespesasPorPeriodo } from "./data/despesas-repository.js?v=12.0";
import { listarAcertosPorPeriodo, atualizarStatusAcerto } from "./data/acertos-repository.js?v=12.0";
import { podeAdministrarNaVisaoAtual } from "./permissoes.js?v=12.0";
import { obterBrutoAtendimento, obterRepasseAtendimento, obterTaxaCartaoValor } from "./services/financeiro-service.js?v=12.0";
import { inicioDoDia, somarDias, chaveData, paraDate, dataDeInput, formatarTituloData } from "./utils/date.js?v=12.0";
import { formatarMoeda } from "./utils/money.js?v=12.0";
import { abrirCalendarioPopover } from "./services/calendario-popover.js?v=12.0";
import { iniciarAcaoBotao, concluirAcaoBotao, restaurarAcaoBotao, iniciarLoadingTela, finalizarLoadingTela } from "./services/ui-loading-service.js?v=12.0";
import { mostrarErro, mostrarSucesso } from "./services/feedback-service.js?v=12.0";

let inicializado = false;
let periodoInicio = inicioDoDia(new Date());
let periodoFim = inicioDoDia(new Date());
let ultimoTexto = "";
let ultimaMeta = null;
let acertosMesAtual = [];

const CACHE_TTL_MS = 2 * 60 * 60 * 1000;
const el = (id) => document.getElementById(id);
const btnAnterior = el("btnRelDataAnterior");
const btnProxima = el("btnRelDataProxima");
const labelData = el("labelDataRelatorio");
const btnCalendario = el("btnCalendarioRelatorio");
const periodoCustom = el("relatorioPeriodoCustom");
const inputInicio = el("dataInicioRelatorio");
const inputFim = el("dataFimRelatorio");
const btnAplicarPeriodo = el("btnAplicarPeriodoRelatorio");
const btnSolicitar = el("btnSolicitarFechamento");
const resultadoBox = el("fechamentoResultadoBox");
const textoEl = el("fechamentoTexto");
const statusEl = el("relatorioStatus");
const acertosSection = el("fechamentoAcertosEquipe");
const acertosLista = el("fechamentoAcertosLista");
const acertosHistoricoBox = el("fechamentoAcertosHistoricoBox");
const acertosHistorico = el("fechamentoAcertosHistorico");

function moeda(valor) {
    return `R$ ${formatarMoeda(Number(valor || 0))}`;
}

function escaparHtml(valor) {
    return String(valor ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;");
}

function inicioDoMes(data) {
    const d = inicioDoDia(data);
    return new Date(d.getFullYear(), d.getMonth(), 1);
}

function fimDoMes(data) {
    const d = inicioDoMes(data);
    return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
}

function setStatus(texto = "", erro = false) {
    if (!statusEl) return;
    statusEl.textContent = texto;
    statusEl.hidden = !texto;
    statusEl.classList.toggle("error", Boolean(erro));
}

function areaAtual() {
    return podeAdministrarNaVisaoAtual() ? "admin" : "profissional";
}

function chaveCache(inicio = periodoInicio, fim = periodoFim) {
    return `srnk:fechamento:v1.2.0:${areaAtual()}:${state.user?.uid || "anon"}:${chaveData(inicio)}:${chaveData(fim)}`;
}

function chaveUltimoPeriodo() {
    return `srnk:fechamento:v1.2.0:ultimo-periodo:${areaAtual()}:${state.user?.uid || "anon"}`;
}

function lerCache(inicio = periodoInicio, fim = periodoFim) {
    try {
        const bruto = sessionStorage.getItem(chaveCache(inicio, fim));
        if (!bruto) return null;
        const cache = JSON.parse(bruto);
        if (!cache?.texto || !cache?.salvoEm || Date.now() - Number(cache.salvoEm) > CACHE_TTL_MS) {
            sessionStorage.removeItem(chaveCache(inicio, fim));
            return null;
        }
        return cache;
    } catch (_) {
        return null;
    }
}

function salvarCache(texto, meta = {}) {
    try {
        sessionStorage.setItem(chaveCache(), JSON.stringify({ texto, meta, salvoEm: Date.now() }));
        sessionStorage.setItem(chaveUltimoPeriodo(), JSON.stringify({ inicio: chaveData(periodoInicio), fim: chaveData(periodoFim) }));
    } catch (_) {
        // Cache é conveniência; falha não bloqueia o fechamento.
    }
}

function dataDeChave(valor) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(valor || ""))) return null;
    const data = new Date(`${valor}T12:00:00`);
    return Number.isNaN(data.getTime()) ? null : inicioDoDia(data);
}

function restaurarUltimoPeriodo() {
    try {
        const bruto = sessionStorage.getItem(chaveUltimoPeriodo());
        if (!bruto) return;
        const salvo = JSON.parse(bruto);
        const inicio = dataDeChave(salvo?.inicio);
        const fim = dataDeChave(salvo?.fim);
        const hoje = inicioDoDia(new Date());
        if (!inicio || !fim || inicio > fim || fim > hoje) return;
        periodoInicio = inicio;
        periodoFim = fim;
    } catch (_) {}
}

function periodoEhHoje() {
    const hoje = inicioDoDia(new Date());
    return chaveData(periodoInicio) === chaveData(hoje) && chaveData(periodoFim) === chaveData(hoje);
}

function periodoUmDia() {
    return chaveData(periodoInicio) === chaveData(periodoFim);
}

function diasNoPeriodo() {
    const msDia = 24 * 60 * 60 * 1000;
    return Math.max(1, Math.round((inicioDoDia(periodoFim) - inicioDoDia(periodoInicio)) / msDia) + 1);
}

function formatarPeriodoLabel() {
    if (periodoUmDia()) return formatarTituloData(periodoInicio);

    const mesmoMes = periodoInicio.getFullYear() === periodoFim.getFullYear()
        && periodoInicio.getMonth() === periodoFim.getMonth();

    if (mesmoMes) {
        const a = String(periodoInicio.getDate()).padStart(2, "0");
        const b = String(periodoFim.getDate()).padStart(2, "0");
        const mes = periodoFim.toLocaleDateString("pt-BR", { month: "long" });
        return `${a} a ${b} de ${mes}`;
    }

    return `${periodoInicio.toLocaleDateString("pt-BR")} a ${periodoFim.toLocaleDateString("pt-BR")}`;
}

function rotuloPeriodoMensagem() {
    if (periodoEhHoje()) return "hoje";
    if (periodoUmDia()) return periodoInicio.toLocaleDateString("pt-BR");
    return `${periodoInicio.toLocaleDateString("pt-BR")} a ${periodoFim.toLocaleDateString("pt-BR")}`;
}

function esconderResultado() {
    ultimoTexto = "";
    ultimaMeta = null;
    if (resultadoBox) resultadoBox.hidden = true;
    if (textoEl) textoEl.value = "";
    if (acertosSection) acertosSection.hidden = true;
    setStatus();
}

function restaurarResultadoDoCache() {
    const cache = lerCache();
    if (!cache) {
        esconderResultado();
        return false;
    }
    ultimoTexto = cache.texto;
    ultimaMeta = cache.meta || null;
    if (textoEl) textoEl.value = ultimoTexto;
    if (resultadoBox) resultadoBox.hidden = false;
    if (podeAdministrarNaVisaoAtual() && Array.isArray(ultimaMeta?.profissionais)) {
        void carregarAcertosMes({ forcar: false })
            .then(() => renderizarAcertosEquipe(ultimaMeta.profissionais, acertosMesAtual))
            .catch(() => null);
    }
    setStatus();
    return true;
}

function atualizarNavegador() {
    const hoje = inicioDoDia(new Date());
    if (labelData) labelData.textContent = formatarPeriodoLabel();
    if (inputInicio) {
        inputInicio.value = chaveData(periodoInicio);
        inputInicio.max = chaveData(hoje);
    }
    if (inputFim) {
        inputFim.value = chaveData(periodoFim);
        inputFim.max = chaveData(hoje);
        inputFim.min = chaveData(periodoInicio);
    }
    if (btnProxima) {
        const bloqueado = periodoFim >= hoje;
        btnProxima.disabled = bloqueado;
        btnProxima.setAttribute("aria-disabled", String(bloqueado));
    }
    restaurarResultadoDoCache();
}

function aplicarPeriodo(inicio, fim) {
    const hoje = inicioDoDia(new Date());
    let novoInicio = inicioDoDia(inicio);
    let novoFim = inicioDoDia(fim);
    if (novoInicio > novoFim) [novoInicio, novoFim] = [novoFim, novoInicio];
    if (novoFim > hoje) novoFim = hoje;
    if (novoInicio > hoje) novoInicio = hoje;
    periodoInicio = novoInicio;
    periodoFim = novoFim;
    atualizarNavegador();
}

function irPeriodoAnterior() {
    const dias = diasNoPeriodo();
    const novoFim = somarDias(periodoInicio, -1);
    const novoInicio = somarDias(novoFim, -(dias - 1));
    if (periodoCustom) periodoCustom.hidden = true;
    aplicarPeriodo(novoInicio, novoFim);
}

function irProximoPeriodo() {
    const hoje = inicioDoDia(new Date());
    if (periodoFim >= hoje) return;
    const dias = diasNoPeriodo();
    let novoInicio = somarDias(periodoFim, 1);
    let novoFim = somarDias(novoInicio, dias - 1);
    if (novoFim > hoje) {
        novoFim = hoje;
        novoInicio = somarDias(novoFim, -(dias - 1));
    }
    if (periodoCustom) periodoCustom.hidden = true;
    aplicarPeriodo(novoInicio, novoFim);
}

function abrirPeriodoPersonalizado() {
    if (!periodoCustom) return;
    periodoCustom.hidden = !periodoCustom.hidden;
    if (!periodoCustom.hidden) atualizarNavegador();
}

function validarPeriodoInputs() {
    const inicio = dataDeInput(inputInicio?.value);
    const fim = dataDeInput(inputFim?.value);
    const hoje = inicioDoDia(new Date());
    if (!inicio || !fim) throw new Error("Selecione as duas datas.");
    if (inicio > fim) throw new Error("A data inicial não pode ser maior que a final.");
    if (fim > hoje) throw new Error("O fechamento não pode usar data futura.");
    return { inicio, fim };
}

function configurarCalendariosPeriodo() {
    document.querySelectorAll("#relatorioPeriodoCustom .relatorio-date-control").forEach((controle) => {
        const input = el(controle.dataset.dateTarget);
        if (!input || controle.dataset.srnkBound === "true") return;
        controle.dataset.srnkBound = "true";

        const abrir = (event) => {
            event?.preventDefault?.();
            event?.stopPropagation?.();
            const ehInicio = input === inputInicio;
            const atual = dataDeInput(input.value) || (ehInicio ? periodoInicio : periodoFim);
            abrirCalendarioPopover({
                ancora: controle,
                data: atual,
                min: ehInicio ? null : (dataDeInput(inputInicio?.value) || periodoInicio),
                max: ehInicio ? (dataDeInput(inputFim?.value) || periodoFim) : new Date(),
                titulo: ehInicio ? "Data inicial" : "Data final",
                onSelect: (data) => {
                    input.value = chaveData(data);
                    if (ehInicio && inputFim) {
                        const fimAtual = dataDeInput(inputFim.value);
                        if (!fimAtual || fimAtual < data) inputFim.value = chaveData(data);
                    }
                }
            });
        };

        controle.addEventListener("click", abrir);
        input.addEventListener("focus", (event) => {
            input.blur();
            abrir(event);
        });
    });
}

function agrupamentoServicos(atendimentos) {
    const mapa = new Map();
    (atendimentos || []).forEach((item) => {
        const nome = String(item?.servicoNome || item?.servico || "Serviço").trim() || "Serviço";
        mapa.set(nome, (mapa.get(nome) || 0) + 1);
    });
    return [...mapa.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "pt-BR"));
}

function percentualRepasse(atendimentos) {
    const valores = [...new Set((atendimentos || [])
        .map((item) => Number(item?.financeiro?.repasseDonoPct ?? item?.repasseDonoPct))
        .filter(Number.isFinite)
        .map((valor) => Number(valor.toFixed(2))))];
    if (valores.length === 1) return `${valores[0].toFixed(2).replace(/\.00$/, "").replace(".", ",")}%`;
    if (valores.length > 1) return "variável";
    const fallback = state.membroAtual?.dono === true ? 0 : Number(state.membroAtual?.repassePct ?? state.configSistema?.repasseDonoPct ?? 35);
    return `${Number(fallback || 0).toFixed(2).replace(/\.00$/, "").replace(".", ",")}%`;
}

function dentroDoPeriodo(data) {
    const valor = paraDate(data);
    if (!valor) return false;
    const tempo = valor.getTime();
    const min = inicioDoDia(periodoInicio).getTime();
    const max = new Date(periodoFim.getFullYear(), periodoFim.getMonth(), periodoFim.getDate(), 23, 59, 59, 999).getTime();
    return tempo >= min && tempo <= max;
}

function filtrarAtendimentos(lista, profissionalUid = null) {
    return (lista || []).filter((item) => dentroDoPeriodo(item?.dataAtendimento || item?.data) && (!profissionalUid || item?.profissionalUid === profissionalUid));
}
function filtrarVendas(lista, profissionalUid = null) {
    return (lista || []).filter((item) => item?.cancelada !== true && dentroDoPeriodo(item?.dataVenda) && (!profissionalUid || item?.profissionalUid === profissionalUid));
}
function filtrarDespesas(lista) {
    return (lista || []).filter((item) => item?.tipo === "barbearia" && dentroDoPeriodo(item?.dataDespesa || item?.data));
}

function fechamentoProfissional({ atendimentos, vendas }) {
    const servicos = agrupamentoServicos(atendimentos);
    const totalBruto = atendimentos.reduce((soma, item) => soma + obterBrutoAtendimento(item), 0);
    const repasse = atendimentos.reduce((soma, item) => soma + obterRepasseAtendimento(item), 0);
    const comissao = vendas.reduce((soma, item) => soma + Number(item?.comissaoValor || 0), 0);
    const devido = Number((repasse - comissao).toFixed(2));
    const linhas = ["Olá,", "", periodoUmDia() ? `Segue fechamento de ${rotuloPeriodoMensagem()}:` : `Segue fechamento do período de ${rotuloPeriodoMensagem()}:`, "", `${atendimentos.length} atendimento${atendimentos.length === 1 ? "" : "s"} sendo`];
    if (servicos.length) servicos.forEach(([nome, qtd]) => linhas.push(`${qtd} ${nome}`));
    else linhas.push("Nenhum atendimento registrado");
    linhas.push("", `Total: ${moeda(totalBruto)}`, `Repasse: ${percentualRepasse(atendimentos)}`);
    if (comissao > 0) linhas.push(`Comissão: ${moeda(comissao)}`);
    linhas.push(devido >= 0 ? `Valor devido: ${moeda(devido)}` : `Valor a receber: ${moeda(Math.abs(devido))}`, "", "Para mais detalhes do meu período consulte o painel gerencial.");
    return { texto: linhas.join("\n"), meta: { atendimentos: atendimentos.length, vendas: vendas.length, atividade: atendimentos.length + vendas.length, repasse, comissao, devido } };
}


function profissionalEhDono(uid, atendimento = null) {
    if (!uid) return false;
    if (atendimento?.profissionalDono === true || atendimento?.financeiro?.profissionalDono === true) return true;
    if (String(uid) === String(state.membroAtual?.uid || state.membroAtual?.id || state.user?.uid || "") && state.membroAtual?.dono === true) return true;
    const membro = (state.equipe || []).find((item) => String(item?.uid || item?.id || "") === String(uid));
    return membro?.dono === true;
}

function agrupamentoProfissionais(atendimentos, vendas = []) {
    const mapa = new Map();
    const obter = (uid, nome) => {
        const chave = String(uid || "sem-uid");
        if (!mapa.has(chave)) {
            mapa.set(chave, {
                uid: chave,
                nome: String(nome || "Profissional").trim() || "Profissional",
                atendimentos: 0,
                bruto: 0,
                repasse: 0,
                comissao: 0,
                dono: profissionalEhDono(chave),
                servicos: new Map()
            });
        }
        return mapa.get(chave);
    };

    (atendimentos || []).forEach((item) => {
        const uid = item?.profissionalUid || "sem-uid";
        const nome = item?.profissionalNome || item?.financeiro?.profissionalNome || "Profissional";
        const atual = obter(uid, nome);
        const nomeServico = String(item?.servicoNome || item?.servico || "Serviço").trim() || "Serviço";
        atual.atendimentos += 1;
        atual.bruto += obterBrutoAtendimento(item);
        atual.dono ||= profissionalEhDono(uid, item);
        if (!atual.dono) atual.repasse += obterRepasseAtendimento(item);
        atual.servicos.set(nomeServico, (atual.servicos.get(nomeServico) || 0) + 1);
    });

    (vendas || []).forEach((venda) => {
        if (!venda?.profissionalUid || venda?.gerarComissao !== true) return;
        const atual = obter(venda.profissionalUid, venda.profissionalNomeSnapshot || "Profissional");
        atual.comissao += Number(venda.comissaoValor || 0);
    });

    return [...mapa.values()]
        .map((item) => ({
            ...item,
            repasse: Number(item.repasse.toFixed(2)),
            comissao: Number(item.comissao.toFixed(2)),
            saldo: Number((item.repasse - item.comissao).toFixed(2)),
            servicos: [...item.servicos.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "pt-BR"))
        }))
        .sort((a, b) => b.bruto - a.bruto || a.nome.localeCompare(b.nome, "pt-BR"));
}

function fechamentoBarbearia({ atendimentos, vendas, despesas }) {
    const servicos = agrupamentoServicos(atendimentos);
    const brutoServicos = atendimentos.reduce((soma, item) => soma + obterBrutoAtendimento(item), 0);
    const repasseEquipe = atendimentos.reduce((soma, item) => {
        const dono = profissionalEhDono(item?.profissionalUid, item);
        return soma + (dono ? 0 : obterRepasseAtendimento(item));
    }, 0);
    const receitaDono = atendimentos.reduce((soma, item) => {
        const dono = profissionalEhDono(item?.profissionalUid, item);
        return soma + (dono ? Math.max(0, obterBrutoAtendimento(item) - obterTaxaCartaoValor(item)) : 0);
    }, 0);
    const vendasBrutas = vendas.reduce((soma, item) => soma + Number(item?.valorBruto || 0), 0);
    const comissoesProdutos = vendas.reduce((soma, item) => soma + Number(item?.comissaoValor || 0), 0);
    const resultadoProdutos = vendas.reduce((soma, item) => soma + Number(item?.resultadoBarbearia || 0), 0);
    const despesasBarbearia = despesas.reduce((soma, item) => soma + Number(item?.valor || 0), 0);
    const resultado = Number((receitaDono + repasseEquipe + resultadoProdutos - despesasBarbearia).toFixed(2));

    const profissionais = agrupamentoProfissionais(atendimentos, vendas);
    const linhas = [
        "Olá,",
        "",
        periodoUmDia()
            ? `Segue fechamento da barbearia de ${rotuloPeriodoMensagem()}:`
            : `Segue fechamento da barbearia do período de ${rotuloPeriodoMensagem()}:`,
        "",
        `${atendimentos.length} atendimento${atendimentos.length === 1 ? "" : "s"} sendo`
    ];

    if (servicos.length) servicos.forEach(([nome, qtd]) => linhas.push(`${qtd} ${nome}`));
    else linhas.push("Nenhum atendimento registrado");

    const comAtendimento = profissionais.filter((item) => item.atendimentos > 0);
    if (comAtendimento.length) {
        linhas.push("", "Atendimentos por profissional:");
        comAtendimento.forEach((item) => {
            linhas.push("", `${item.nome}:`);
            item.servicos.forEach(([nome, qtd]) => linhas.push(`${qtd} ${nome}`));
            linhas.push(`Total: ${moeda(item.bruto)}`);
        });
    }

    linhas.push(
        "",
        `Serviços: ${moeda(brutoServicos)}`,
        `Repasse da equipe: ${moeda(repasseEquipe)}`,
        `Vendas de produtos: ${moeda(vendasBrutas)}`,
        `Comissões de produtos: ${moeda(comissoesProdutos)}`
    );
    if (despesasBarbearia > 0) linhas.push(`Despesas: ${moeda(despesasBarbearia)}`);
    linhas.push(
        `Resultado: ${moeda(resultado)}`,
        "",
        "Para mais detalhes, consulte a Visão Geral e o Histórico."
    );

    return {
        texto: linhas.join("\n"),
        meta: {
            atendimentos: atendimentos.length,
            vendas: vendas.length,
            despesas: despesas.length,
            atividade: atendimentos.length + vendas.length + despesas.length,
            brutoServicos,
            repasseEquipe,
            vendasBrutas,
            comissoesProdutos,
            resultado,
            profissionais
        }
    };
}

function dataAcerto(valor) {
    return paraDate(valor) || (valor?.toDate ? valor.toDate() : null);
}

function acertoDoPeriodo(lista, uid) {
    const inicioChave = chaveData(periodoInicio);
    const fimChave = chaveData(periodoFim);
    return (lista || []).find((item) =>
        String(item?.profissionalUid || "") === String(uid || "")
        && chaveData(dataAcerto(item?.periodoInicio)) === inicioChave
        && chaveData(dataAcerto(item?.periodoFim)) === fimChave
    ) || null;
}

function baixaValida(valorAtual, valorSalvo, flag) {
    return flag === true && Math.abs(Number(valorAtual || 0) - Number(valorSalvo || 0)) < 0.01;
}

function statusAcerto(item, acerto) {
    const precisaRepasse = Number(item.repasse || 0) > 0;
    const precisaComissao = Number(item.comissao || 0) > 0;
    const repasseOk = !precisaRepasse || baixaValida(item.repasse, acerto?.repasseValor, acerto?.repasseRecebido);
    const comissaoOk = !precisaComissao || baixaValida(item.comissao, acerto?.comissaoValor, acerto?.comissaoPaga);
    return repasseOk && comissaoOk;
}

function renderizarHistoricoAcertos() {
    if (!acertosHistoricoBox || !acertosHistorico) return;
    const comMovimento = (acertosMesAtual || []).filter((item) => item.repasseRecebido === true || item.comissaoPaga === true);
    acertosHistoricoBox.hidden = !comMovimento.length;
    if (!comMovimento.length) {
        acertosHistorico.innerHTML = "";
        return;
    }
    acertosHistorico.innerHTML = comMovimento.slice(0, 20).map((item) => {
        const inicio = dataAcerto(item.periodoInicio);
        const fim = dataAcerto(item.periodoFim);
        const periodo = inicio && fim
            ? (chaveData(inicio) === chaveData(fim) ? inicio.toLocaleDateString("pt-BR") : `${inicio.toLocaleDateString("pt-BR")} a ${fim.toLocaleDateString("pt-BR")}`)
            : "Período";
        const estados = [
            item.repasseRecebido === true ? "repasse recebido" : null,
            item.comissaoPaga === true ? "comissão paga" : null
        ].filter(Boolean).join(" • ");
        return `<div class="acerto-historico-item"><div><strong>${escaparHtml(item.profissionalNome || "Profissional")}</strong><span>${escaparHtml(periodo)} • ${escaparHtml(estados || "registro")}</span></div><strong>${moeda(item.saldoValor || 0)}</strong></div>`;
    }).join("");
}

async function carregarAcertosMes({ forcar = false } = {}) {
    if (!podeAdministrarNaVisaoAtual()) return [];
    acertosMesAtual = await listarAcertosPorPeriodo(inicioDoMes(periodoInicio), fimDoMes(periodoInicio), { forcar });
    renderizarHistoricoAcertos();
    return acertosMesAtual;
}

function renderizarAcertosEquipe(profissionais = [], acertos = acertosMesAtual) {
    if (!acertosSection || !acertosLista || !podeAdministrarNaVisaoAtual()) return;
    const itens = (profissionais || []).filter((item) => item.uid && item.uid !== "sem-uid" && item.dono !== true && (Number(item.repasse || 0) > 0 || Number(item.comissao || 0) > 0));
    acertosSection.hidden = !itens.length;
    if (!itens.length) {
        acertosLista.innerHTML = '<div class="relatorio-ranking-vazio">Nenhum acerto de equipe neste período.</div>';
        renderizarHistoricoAcertos();
        return;
    }

    acertosLista.innerHTML = itens.map((item) => {
        const acerto = acertoDoPeriodo(acertos, item.uid);
        const quitado = statusAcerto(item, acerto);
        const repasseDone = baixaValida(item.repasse, acerto?.repasseValor, acerto?.repasseRecebido);
        const comissaoDone = baixaValida(item.comissao, acerto?.comissaoValor, acerto?.comissaoPaga);
        const repassePendente = repasseDone ? 0 : Number(item.repasse || 0);
        const comissaoPendente = comissaoDone ? 0 : Number(item.comissao || 0);
        const saldoPendente = Number((repassePendente - comissaoPendente).toFixed(2));
        const saldoLabel = quitado ? "Acerto quitado" : (saldoPendente >= 0 ? "Saldo a receber" : "Saldo a pagar");
        return `<article class="acerto-profissional-card" data-acerto-uid="${escaparHtml(item.uid)}">
            <div class="acerto-profissional-head"><div><strong>${escaparHtml(item.nome)}</strong><span>${item.atendimentos} atendimento${item.atendimentos === 1 ? "" : "s"}</span></div><span class="acerto-status ${quitado ? "is-ok" : "is-pending"}">${quitado ? "Quitado" : "Pendente"}</span></div>
            <div class="acerto-linhas">
                ${Number(item.repasse || 0) > 0 ? `<div class="acerto-linha is-credit"><div class="acerto-linha-copy"><span>Repasse a receber</span><strong>+ ${moeda(item.repasse)}</strong></div><button class="acerto-baixa-btn${repasseDone ? " is-done" : ""}" data-acerto-tipo="repasse" data-acerto-pago="${repasseDone ? "1" : "0"}" type="button">${repasseDone ? "Recebido ✓" : "Marcar recebido"}</button></div>` : ""}
                ${Number(item.comissao || 0) > 0 ? `<div class="acerto-linha is-debit"><div class="acerto-linha-copy"><span>Comissão a pagar</span><strong>- ${moeda(item.comissao)}</strong></div><button class="acerto-baixa-btn${comissaoDone ? " is-done" : ""}" data-acerto-tipo="comissao" data-acerto-pago="${comissaoDone ? "1" : "0"}" type="button">${comissaoDone ? "Paga ✓" : "Marcar paga"}</button></div>` : ""}
            </div>
            <div class="acerto-saldo"><span>${saldoLabel}</span><strong>${moeda(Math.abs(saldoPendente))}</strong></div>
        </article>`;
    }).join("");
    renderizarHistoricoAcertos();
}

function acertoSobrepoePeriodo(acerto) {
    const inicio = dataAcerto(acerto?.periodoInicio);
    const fim = dataAcerto(acerto?.periodoFim);
    if (!inicio || !fim) return false;
    const a0 = inicioDoDia(inicio).getTime();
    const a1 = new Date(fim.getFullYear(), fim.getMonth(), fim.getDate(), 23, 59, 59, 999).getTime();
    const b0 = inicioDoDia(periodoInicio).getTime();
    const b1 = new Date(periodoFim.getFullYear(), periodoFim.getMonth(), periodoFim.getDate(), 23, 59, 59, 999).getTime();
    return a0 <= b1 && a1 >= b0;
}

function ehMesmoPeriodoAcerto(acerto) {
    return chaveData(dataAcerto(acerto?.periodoInicio)) === chaveData(periodoInicio)
        && chaveData(dataAcerto(acerto?.periodoFim)) === chaveData(periodoFim);
}

async function alternarBaixaAcerto(botao) {
    const card = botao?.closest("[data-acerto-uid]");
    const uid = card?.dataset.acertoUid;
    const tipo = botao?.dataset.acertoTipo;
    const item = ultimaMeta?.profissionais?.find((prof) => String(prof.uid) === String(uid));
    if (!item || !["repasse", "comissao"].includes(tipo)) return;
    const pagoAtual = botao.dataset.acertoPago === "1";
    if (!pagoAtual) {
        const conflito = (acertosMesAtual || []).find((acerto) => {
            if (String(acerto?.profissionalUid || "") !== String(uid || "")) return false;
            if (ehMesmoPeriodoAcerto(acerto) || !acertoSobrepoePeriodo(acerto)) return false;
            return tipo === "repasse" ? acerto?.repasseRecebido === true : acerto?.comissaoPaga === true;
        });
        if (conflito) {
            mostrarErro("Já existe uma baixa em um período que se sobrepõe a este. Reabra a baixa anterior antes de registrar outra.");
            return;
        }
    }
    iniciarAcaoBotao(botao, pagoAtual ? "Reabrindo..." : "Salvando...");
    try {
        await atualizarStatusAcerto({
            profissionalUid: item.uid,
            profissionalNome: item.nome,
            inicio: periodoInicio,
            fim: periodoFim,
            repasse: item.repasse,
            comissao: item.comissao,
            saldo: item.saldo,
            tipo,
            pago: !pagoAtual
        });
        await carregarAcertosMes({ forcar: true });
        renderizarAcertosEquipe(ultimaMeta?.profissionais || [], acertosMesAtual);
        mostrarSucesso(!pagoAtual
            ? (tipo === "repasse" ? "Repasse marcado como recebido." : "Comissão marcada como paga.")
            : "Baixa reaberta.");
    } catch (error) {
        console.error(error);
        mostrarErro(error?.message || "Não foi possível atualizar o acerto.");
    } finally {
        restaurarAcaoBotao(botao);
    }
}

async function buscarDadosFrescos() {
    const admin = podeAdministrarNaVisaoAtual();
    const profissionalUid = admin ? null : state.user?.uid;
    const tarefas = [
        obterAtendimentosPeriodo(periodoInicio, periodoFim, { profissionalUid, forcar: true }),
        listarVendasPorPeriodo(periodoInicio, periodoFim, { profissionalUid, forcar: true })
    ];
    if (admin) tarefas.push(listarDespesasPorPeriodo(periodoInicio, periodoFim, { incluirBarbearia: true, forcar: true }));
    const [atendimentosBrutos, vendasBrutas, despesasBrutas = []] = await Promise.all(tarefas);
    return {
        atendimentos: filtrarAtendimentos(atendimentosBrutos, profissionalUid),
        vendas: filtrarVendas(vendasBrutas, profissionalUid),
        despesas: admin ? filtrarDespesas(despesasBrutas) : []
    };
}

async function solicitarFechamento() {
    iniciarAcaoBotao(btnSolicitar, "Consultando...");
    const loading = iniciarLoadingTela("Consultando movimentações...", { delay: 180 });
    setStatus();
    const anterior = lerCache();

    try {
        let dados = await buscarDadosFrescos();
        let atividade = dados.atendimentos.length + dados.vendas.length + dados.despesas.length;
        if (atividade === 0 && Number(anterior?.meta?.atividade || 0) > 0) {
            // Uma leitura vazia isolada não substitui um fechamento confirmado recente.
            // Fazemos uma segunda leitura curta; se continuar vazia, preservamos o último resultado.
            await new Promise((resolve) => setTimeout(resolve, 250));
            dados = await buscarDadosFrescos();
            atividade = dados.atendimentos.length + dados.vendas.length + dados.despesas.length;
            if (atividade === 0) {
                restaurarResultadoDoCache();
                setStatus("Não foi possível confirmar os dados agora. Mantivemos o último fechamento gerado.", true);
                return;
            }
        }

        const resultado = podeAdministrarNaVisaoAtual()
            ? fechamentoBarbearia(dados)
            : fechamentoProfissional(dados);
        ultimoTexto = resultado.texto;
        ultimaMeta = resultado.meta;
        salvarCache(ultimoTexto, ultimaMeta);
        if (textoEl) textoEl.value = ultimoTexto;
        if (resultadoBox) resultadoBox.hidden = false;
        if (podeAdministrarNaVisaoAtual()) {
            try {
                await carregarAcertosMes({ forcar: true });
                renderizarAcertosEquipe(resultado.meta?.profissionais || [], acertosMesAtual);
            } catch (errorAcerto) {
                console.warn("Não foi possível carregar os acertos:", errorAcerto);
                renderizarAcertosEquipe(resultado.meta?.profissionais || [], []);
            }
        }
        await concluirAcaoBotao(btnSolicitar, "Fechamento pronto ✓", 420);
        setStatus();
        resultadoBox?.scrollIntoView?.({ behavior: "smooth", block: "start" });
    } catch (error) {
        console.error("Erro ao gerar fechamento:", error);
        if (anterior?.texto) {
            restaurarResultadoDoCache();
            setStatus("Não foi possível atualizar agora. O último fechamento continua disponível.", true);
        } else {
            mostrarErro("Não foi possível gerar o fechamento. Confira a conexão e tente novamente.");
            setStatus("Não foi possível gerar o fechamento.", true);
        }
    } finally {
        finalizarLoadingTela(loading);
        restaurarAcaoBotao(btnSolicitar);
    }
}

async function copiarFechamento() {
    if (!ultimoTexto) return;
    try {
        await navigator.clipboard.writeText(ultimoTexto);
        mostrarSucesso("Fechamento copiado.");
    } catch (_) {
        textoEl?.focus();
        textoEl?.select();
        document.execCommand?.("copy");
        mostrarSucesso("Fechamento copiado.");
    }
}

function enviarWhatsApp() {
    if (!ultimoTexto) return;
    window.open(`https://wa.me/?text=${encodeURIComponent(ultimoTexto)}`, "_blank", "noopener,noreferrer");
}

export async function prepararRelatoriosHoje() {
    atualizarNavegador();
}

export async function initRelatorios() {
    if (inicializado) return;
    inicializado = true;
    // Primeiro acesso ao Fechamento sempre começa em Hoje, igual ao Histórico.
    // Ao sair e voltar sem recarregar o app, o período atual permanece em memória.

    [inputInicio, inputFim].forEach((input) => {
        input?.setAttribute("readonly", "");
        input?.setAttribute("inputmode", "none");
    });

    btnAnterior?.addEventListener("click", irPeriodoAnterior);
    btnProxima?.addEventListener("click", irProximoPeriodo);
    btnCalendario?.addEventListener("click", abrirPeriodoPersonalizado);
    configurarCalendariosPeriodo();

    btnAplicarPeriodo?.addEventListener("click", () => {
        try {
            const { inicio, fim } = validarPeriodoInputs();
            if (periodoCustom) periodoCustom.hidden = true;
            aplicarPeriodo(inicio, fim);
        } catch (error) {
            setStatus(error?.message || "Período inválido.", true);
        }
    });

    btnSolicitar?.addEventListener("click", () => void solicitarFechamento());
    el("btnCopiarFechamento")?.addEventListener("click", () => void copiarFechamento());
    el("btnWhatsApp")?.addEventListener("click", enviarWhatsApp);
    acertosLista?.addEventListener("click", (event) => {
        const botao = event.target.closest("[data-acerto-tipo]");
        if (botao) void alternarBaixaAcerto(botao);
    });
    atualizarNavegador();
}
