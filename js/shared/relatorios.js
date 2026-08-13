import { state } from "./state.js?v=13.0";
import { obterAtendimentosPeriodo } from "./data/sync.js?v=13.0";
import { listarVendasPorPeriodo } from "./data/estoque-repository.js?v=13.0";
import { listarDespesasPorPeriodo } from "./data/despesas-repository.js?v=13.0";
import { listarAcertosPorPeriodo, atualizarStatusAcerto, atualizarStatusAcertosEmLote } from "./data/acertos-repository.js?v=13.0";
import { podeAdministrarNaVisaoAtual } from "./permissoes.js?v=13.0";
import { obterBrutoAtendimento, obterRepasseAtendimento, obterTaxaCartaoValor } from "./services/financeiro-service.js?v=13.0";
import { inicioDoDia, somarDias, chaveData, paraDate, dataDeInput, formatarTituloData } from "./utils/date.js?v=13.0";
import { formatarMoeda } from "./utils/money.js?v=13.0";
import { abrirCalendarioPopover } from "./services/calendario-popover.js?v=13.0";
import { iniciarAcaoBotao, concluirAcaoBotao, restaurarAcaoBotao, iniciarLoadingTela, finalizarLoadingTela } from "./services/ui-loading-service.js?v=13.0";
import { mostrarErro, mostrarSucesso } from "./services/feedback-service.js?v=13.0";

let inicializado = false;
let periodoInicio = inicioDoDia(new Date());
let periodoFim = inicioDoDia(new Date());
let ultimoTexto = "";
let ultimaMeta = null;
let acertosMesAtual = [];
let acertosOperacionais = [];
let carregandoAcertos = null;

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
    return `srnk:fechamento:v1.3.0:${areaAtual()}:${state.user?.uid || "anon"}:${chaveData(inicio)}:${chaveData(fim)}`;
}

function chaveUltimoPeriodo() {
    return `srnk:fechamento:v1.3.0:ultimo-periodo:${areaAtual()}:${state.user?.uid || "anon"}`;
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
    if (acertosSection && !podeAdministrarNaVisaoAtual()) acertosSection.hidden = true;
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
    if (podeAdministrarNaVisaoAtual() && inicializado) void carregarAcertosDoPeriodo({ forcar: false });
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
            linhas.push(`Repasse: ${moeda(item.repasse)}`);
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

function diaLabel(data) {
    const d = inicioDoDia(data);
    return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

function membroNome(uid, fallback = "Profissional") {
    const membro = (state.equipe || []).find((item) => String(item?.uid || item?.id || "") === String(uid || ""));
    return String(membro?.nome || fallback || "Profissional").trim() || "Profissional";
}

function chaveAcertoDiario(uid, dia) {
    return `${String(uid || "sem-uid")}:${chaveData(inicioDoDia(dia))}`;
}

function montarAcertosDiarios(atendimentos = [], vendas = []) {
    const mapa = new Map();
    const obter = (uid, nome, dia) => {
        const data = inicioDoDia(dia);
        const chave = chaveAcertoDiario(uid, data);
        if (!mapa.has(chave)) mapa.set(chave, {
            chave,
            uid: String(uid || ""),
            nome: membroNome(uid, nome),
            dia: data,
            repasse: 0,
            comissao: 0,
            atendimentos: 0
        });
        return mapa.get(chave);
    };

    atendimentos.forEach((item) => {
        const uid = item?.profissionalUid;
        const data = paraDate(item?.dataAtendimento || item?.data);
        if (!uid || !data || profissionalEhDono(uid, item)) return;
        const atual = obter(uid, item?.profissionalNome || item?.financeiro?.profissionalNome, data);
        atual.repasse += obterRepasseAtendimento(item);
        atual.atendimentos += 1;
    });

    vendas.forEach((venda) => {
        const uid = venda?.profissionalUid;
        const data = paraDate(venda?.dataVenda);
        if (!uid || !data || venda?.cancelada === true || venda?.gerarComissao !== true) return;
        const atual = obter(uid, venda?.profissionalNomeSnapshot, data);
        atual.comissao += Number(venda?.comissaoValor || 0);
    });

    return [...mapa.values()]
        .map((item) => ({ ...item, repasse: Number(item.repasse.toFixed(2)), comissao: Number(item.comissao.toFixed(2)), saldo: Number((item.repasse - item.comissao).toFixed(2)) }))
        .filter((item) => item.repasse > .009 || item.comissao > .009)
        .sort((a, b) => a.dia - b.dia || a.nome.localeCompare(b.nome, "pt-BR"));
}

function acertoDiarioSalvo(item, acertos = acertosMesAtual) {
    const chave = chaveData(item.dia);
    return (acertos || []).find((acerto) => {
        const inicio = dataAcerto(acerto?.periodoInicio);
        const fim = dataAcerto(acerto?.periodoFim);
        return String(acerto?.profissionalUid || "") === String(item.uid)
            && inicio && fim
            && chaveData(inicio) === chave
            && chaveData(fim) === chave;
    }) || null;
}

function baixaValida(valorAtual, valorSalvo, flag) {
    return flag === true && Math.abs(Number(valorAtual || 0) - Number(valorSalvo || 0)) < 0.01;
}

function linhaAcertoHtml(item, tipo, acerto) {
    const valor = tipo === "repasse" ? item.repasse : item.comissao;
    if (valor <= .009) return "";
    const feito = tipo === "repasse"
        ? baixaValida(valor, acerto?.repasseValor, acerto?.repasseRecebido)
        : baixaValida(valor, acerto?.comissaoValor, acerto?.comissaoPaga);
    const credito = tipo === "repasse";
    const label = credito ? "Repasse a receber" : "Comissão a pagar";
    const acao = feito ? "Pago ✓" : (credito ? "Receber" : "Pagar");
    return `<div class="acerto-linha ${credito ? "is-credit" : "is-debit"}${feito ? " is-done" : ""}" data-acerto-chave="${escaparHtml(item.chave)}">
        <div class="acerto-linha-copy"><span>${label} <small>(${diaLabel(item.dia)})</small></span><strong>${credito ? "+" : "-"} ${moeda(valor)}</strong></div>
        <button class="acerto-baixa-btn${feito ? " is-done" : ""}" data-acerto-tipo="${tipo}" data-acerto-pago="${feito ? "1" : "0"}" type="button">${acao}</button>
    </div>`;
}

function renderizarAcertosEquipe(itens = acertosOperacionais, acertos = acertosMesAtual) {
    if (!acertosSection || !acertosLista || !podeAdministrarNaVisaoAtual()) return;
    acertosSection.hidden = false;
    const grupos = new Map();
    (itens || []).forEach((item) => {
        if (!grupos.has(item.uid)) grupos.set(item.uid, { uid: item.uid, nome: item.nome, itens: [] });
        grupos.get(item.uid).itens.push(item);
    });

    if (!grupos.size) {
        acertosLista.innerHTML = '<div class="acerto-vazio"><strong>Nenhum acerto neste período.</strong><span>Quando houver repasse ou comissão, a pendência aparecerá aqui.</span></div>';
        if (acertosHistoricoBox) acertosHistoricoBox.hidden = true;
        return;
    }

    acertosLista.innerHTML = [...grupos.values()].map((grupo) => {
        let pendencias = 0;
        let receber = 0;
        let pagar = 0;
        let repassesPendentes = 0;
        let comissoesPendentes = 0;
        const linhas = grupo.itens.map((item) => {
            const acerto = acertoDiarioSalvo(item, acertos);
            const repasseDone = item.repasse <= .009 || baixaValida(item.repasse, acerto?.repasseValor, acerto?.repasseRecebido);
            const comissaoDone = item.comissao <= .009 || baixaValida(item.comissao, acerto?.comissaoValor, acerto?.comissaoPaga);
            if (!repasseDone && item.repasse > .009) { pendencias += 1; repassesPendentes += 1; receber += item.repasse; }
            if (!comissaoDone && item.comissao > .009) { pendencias += 1; comissoesPendentes += 1; pagar += item.comissao; }
            return linhaAcertoHtml(item, "repasse", acerto) + linhaAcertoHtml(item, "comissao", acerto);
        }).join("");
        const saldo = Number((receber - pagar).toFixed(2));
        const acoes = repassesPendentes || comissoesPendentes ? `<div class="acerto-lote-actions">
            ${repassesPendentes ? `<button data-acerto-lote="repasse" type="button"><i class="fas fa-arrow-down"></i> Receber repasses</button>` : ""}
            ${comissoesPendentes ? `<button class="is-debit" data-acerto-lote="comissao" type="button"><i class="fas fa-arrow-up"></i> Pagar comissões</button>` : ""}
        </div>` : "";
        return `<details class="acerto-profissional-card" data-acerto-uid="${escaparHtml(grupo.uid)}">
            <summary class="acerto-profissional-head"><div><strong>${escaparHtml(grupo.nome)}</strong><span>${pendencias ? `${pendencias} pendência${pendencias === 1 ? "" : "s"}` : "Tudo quitado no período"}</span></div><span class="acerto-status ${pendencias ? "is-pending" : "is-ok"}">${pendencias ? "Pendente" : "Quitado"}</span><i class="fas fa-chevron-down"></i></summary>
            ${acoes}
            <div class="acerto-linhas">${linhas}</div>
            <div class="acerto-saldo"><span>${saldo >= 0 ? "Saldo a receber" : "Saldo a pagar"}</span><strong>${moeda(Math.abs(saldo))}</strong></div>
        </details>`;
    }).join("");
    if (acertosHistoricoBox) acertosHistoricoBox.hidden = true;
}

async function carregarAcertosDoPeriodo({ forcar = false, dados = null } = {}) {
    if (!podeAdministrarNaVisaoAtual()) return [];
    if (carregandoAcertos && !forcar && !dados) return carregandoAcertos;
    if (acertosSection) acertosSection.hidden = false;
    if (acertosLista && !dados) acertosLista.innerHTML = '<div class="acerto-vazio is-loading"><span class="ui-button-spinner"></span><strong>Carregando acertos…</strong></div>';

    const tarefa = (async () => {
        const origem = dados || await (async () => {
            const [atendimentos, vendas] = await Promise.all([
                obterAtendimentosPeriodo(periodoInicio, periodoFim, { profissionalUid: null, forcar }),
                listarVendasPorPeriodo(periodoInicio, periodoFim, { profissionalUid: null, forcar, incluirCanceladas: false })
            ]);
            return { atendimentos: filtrarAtendimentos(atendimentos), vendas: filtrarVendas(vendas) };
        })();
        const acertos = await listarAcertosPorPeriodo(periodoInicio, periodoFim, { forcar });
        acertosOperacionais = montarAcertosDiarios(origem.atendimentos || [], origem.vendas || []);
        acertosMesAtual = acertos;
        renderizarAcertosEquipe(acertosOperacionais, acertosMesAtual);
        return acertosOperacionais;
    })();
    carregandoAcertos = tarefa;
    try { return await tarefa; }
    catch (error) {
        console.warn("Não foi possível carregar acertos:", error);
        if (acertosLista) acertosLista.innerHTML = '<div class="acerto-vazio"><strong>Não foi possível carregar os acertos.</strong><span>Tente novamente ao abrir o Fechamento.</span></div>';
        return [];
    } finally { if (carregandoAcertos === tarefa) carregandoAcertos = null; }
}

async function alternarBaixaAcerto(botao) {
    const linha = botao?.closest("[data-acerto-chave]");
    const chave = linha?.dataset.acertoChave;
    const tipo = botao?.dataset.acertoTipo;
    const item = acertosOperacionais.find((registro) => registro.chave === chave);
    if (!item || !["repasse", "comissao"].includes(tipo)) return;
    const pagoAtual = botao.dataset.acertoPago === "1";
    iniciarAcaoBotao(botao, pagoAtual ? "Reabrindo..." : "Salvando...");
    try {
        await atualizarStatusAcerto({
            profissionalUid: item.uid,
            profissionalNome: item.nome,
            inicio: item.dia,
            fim: item.dia,
            repasse: item.repasse,
            comissao: item.comissao,
            saldo: item.saldo,
            tipo,
            pago: !pagoAtual
        });
        acertosMesAtual = await listarAcertosPorPeriodo(periodoInicio, periodoFim, { forcar: true });
        renderizarAcertosEquipe(acertosOperacionais, acertosMesAtual);
        mostrarSucesso(!pagoAtual ? (tipo === "repasse" ? "Repasse marcado como recebido." : "Comissão marcada como paga.") : "Baixa reaberta.");
    } catch (error) {
        console.error(error);
        mostrarErro(error?.message || "Não foi possível atualizar o acerto.");
    } finally { restaurarAcaoBotao(botao); }
}

async function baixarAcertosEmLote(botao) {
    const card = botao?.closest("[data-acerto-uid]");
    const uid = card?.dataset.acertoUid;
    const tipo = botao?.dataset.acertoLote;
    if (!uid || !["repasse", "comissao"].includes(tipo)) return;
    const itens = acertosOperacionais.filter((item) => String(item.uid) === String(uid)).filter((item) => {
        const acerto = acertoDiarioSalvo(item, acertosMesAtual);
        return tipo === "repasse"
            ? item.repasse > .009 && !baixaValida(item.repasse, acerto?.repasseValor, acerto?.repasseRecebido)
            : item.comissao > .009 && !baixaValida(item.comissao, acerto?.comissaoValor, acerto?.comissaoPaga);
    });
    if (!itens.length) return;
    iniciarAcaoBotao(botao, tipo === "repasse" ? "Recebendo..." : "Pagando...");
    try {
        await atualizarStatusAcertosEmLote(itens.map((item) => ({
            profissionalUid: item.uid, profissionalNome: item.nome, inicio: item.dia, fim: item.dia,
            repasse: item.repasse, comissao: item.comissao, saldo: item.saldo, tipo, pago: true
        })));
        acertosMesAtual = await listarAcertosPorPeriodo(periodoInicio, periodoFim, { forcar: true });
        renderizarAcertosEquipe(acertosOperacionais, acertosMesAtual);
        mostrarSucesso(tipo === "repasse" ? "Repasses do período marcados como recebidos." : "Comissões do período marcadas como pagas.");
    } catch (error) {
        console.error(error);
        mostrarErro(error?.message || "Não foi possível concluir as baixas.");
    } finally { restaurarAcaoBotao(botao); }
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

        if (podeAdministrarNaVisaoAtual()) await carregarAcertosDoPeriodo({ forcar: true, dados });
        const resultado = podeAdministrarNaVisaoAtual()
            ? fechamentoBarbearia(dados)
            : fechamentoProfissional(dados);
        ultimoTexto = resultado.texto;
        ultimaMeta = resultado.meta;
        salvarCache(ultimoTexto, ultimaMeta);
        if (textoEl) textoEl.value = ultimoTexto;
        if (resultadoBox) resultadoBox.hidden = false;
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
    if (podeAdministrarNaVisaoAtual()) await carregarAcertosDoPeriodo({ forcar: false });
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
        const lote = event.target.closest("[data-acerto-lote]");
        if (lote) { void baixarAcertosEmLote(lote); return; }
        const botao = event.target.closest("[data-acerto-tipo]");
        if (botao) void alternarBaixaAcerto(botao);
    });
    atualizarNavegador();
}
