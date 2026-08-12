import { state } from "./state.js?v=11.0";
import { listarMembrosEquipe } from "./data/equipe-repository.js?v=11.0";
import { listarResumosBarbeariaPorPeriodo, listarResumosProfissionalPorPeriodo } from "./data/resumos-repository.js?v=11.0";
import { chaveData, dataDeInput, formatarTituloData, inicioDoDia, mesmoDia, somarDias } from "./utils/date.js?v=11.0";
import { abrirCalendarioPopover } from "./services/calendario-popover.js?v=11.0";
import { inicializarTooltipsFinanceiros } from "./utils/dom.js?v=11.0";
import { garantirChartJs } from "./services/external-assets.js?v=11.0";
import { iniciarLoadingTela, finalizarLoadingTela } from "./services/ui-loading-service.js?v=11.0";

let dataSelecionada = inicioDoDia(new Date());
let carregamentoEmAndamento = null;
let eventosConfigurados = false;
let graficoFaturamento = null;
let graficoServicos = null;
let graficoPagamentos = null;
let ultimoTotalRenderizado = null;

const ORDEM_CARDS_PADRAO = ["resumo", "indicadores", "despesas", "servico"];

function el(id) { return document.getElementById(id); }
function moeda(valor) { return Number(valor || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }); }
function centavosParaReais(valor) { return Number(valor || 0) / 100; }
function escapeHtml(valor) {
    return String(valor ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

function normalizarOrdemCards(ordem = state.configSistema?.ordemCardsVisaoGeral) {
    const validos = Array.isArray(ordem)
        ? ordem.filter((chave, indice, lista) => ORDEM_CARDS_PADRAO.includes(chave) && lista.indexOf(chave) === indice)
        : [];
    ORDEM_CARDS_PADRAO.forEach((chave) => { if (!validos.includes(chave)) validos.push(chave); });
    return validos;
}

function aplicarOrdemCardsVisaoGeral() {
    const container = el("barbeariaHomeCardsOrdenaveis");
    if (!container) return;
    const elementos = new Map([...container.querySelectorAll(":scope > [data-visao-card]")].map((item) => [item.dataset.visaoCard, item]));
    normalizarOrdemCards().forEach((chave) => { const item = elementos.get(chave); if (item) container.appendChild(item); });
}

function nomeMembro(membro, resumos = []) {
    const uid = String(membro?.uid || membro?.id || "").trim();
    const nomePerfilAtual = uid === state.user?.uid ? String(state.perfilUsuario?.nome || state.user?.displayName || "").trim() : "";
    const nomeMembroSalvo = String(membro?.nome || "").trim();
    const nomeResumo = String((resumos || []).find((item) => String(item?.profissionalNome || "").trim())?.profissionalNome || "").trim();
    return nomePerfilAtual || nomeMembroSalvo || nomeResumo || String(membro?.email || uid || "Profissional").trim();
}

function membrosAtivos(membros) {
    const mapa = new Map();
    (membros || []).filter((membro) => membro?.ativo !== false).forEach((membro) => {
        const uid = String(membro?.uid || membro?.id || "").trim();
        if (uid) mapa.set(uid, membro);
    });
    const atual = state.membroAtual;
    const uidAtual = String(atual?.uid || atual?.id || state.user?.uid || "").trim();
    if (uidAtual && atual?.ativo !== false && !mapa.has(uidAtual)) mapa.set(uidAtual, { id: uidAtual, uid: uidAtual, ...atual });
    return [...mapa.values()];
}

function somarMapa(destino, origem, nomes = {}, divisor = 1) {
    Object.entries(origem || {}).forEach(([chave, valor]) => {
        const numero = Number(valor || 0) / divisor;
        if (!numero) return;
        const nome = String(nomes?.[chave] || chave || "Outros").trim() || "Outros";
        destino.set(nome, (destino.get(nome) || 0) + numero);
    });
}

function consolidarProfissional(membro, resumos, dataAtual) {
    const atual = {
        uid: String(membro?.uid || membro?.id || "").trim(),
        nome: nomeMembro(membro, resumos),
        dono: membro?.dono === true,
        atendimentos: 0,
        faturamento: 0,
        taxas: 0,
        repasseBarbearia: 0,
        servicos: new Map(),
        pagamentos: new Map(),
        porDia: new Map()
    };

    (resumos || []).forEach((resumo) => {
        const dia = String(resumo?.dataChave || resumo?.id || "");
        const bruto = centavosParaReais(resumo?.faturamentoBrutoCentavos);
        if (dia) atual.porDia.set(dia, (atual.porDia.get(dia) || 0) + bruto);
        if (dia !== dataAtual) return;

        atual.atendimentos += Math.max(0, Number(resumo?.atendimentos || 0));
        atual.faturamento += bruto;
        atual.taxas += centavosParaReais(resumo?.taxasCartaoCentavos);
        atual.repasseBarbearia += centavosParaReais(resumo?.repasseCentavos);
        somarMapa(atual.servicos, resumo?.servicosQtd, resumo?.servicosNomes);
        somarMapa(atual.pagamentos, resumo?.pagamentosValorCentavos, resumo?.pagamentosNomes, 100);
    });
    return atual;
}

function consolidarBarbearia(profissionais, resumosBarbearia, dataAtual) {
    const total = {
        atendimentos: 0,
        faturamento: 0,
        receitaBarbearia: 0,
        despesasBarbearia: 0,
        lucroLiquido: 0,
        ticket: 0,
        servicoMaisVendido: "—",
        servicoMaisVendidoQtd: 0,
        servicos: new Map(),
        pagamentos: new Map(),
        porDia: new Map()
    };

    profissionais.forEach((profissional) => {
        total.atendimentos += profissional.atendimentos;
        total.faturamento += profissional.faturamento;
        total.receitaBarbearia += profissional.dono
            ? Math.max(0, profissional.faturamento - profissional.taxas)
            : profissional.repasseBarbearia;
        profissional.servicos.forEach((qtd, nome) => total.servicos.set(nome, (total.servicos.get(nome) || 0) + qtd));
        profissional.pagamentos.forEach((valor, nome) => total.pagamentos.set(nome, (total.pagamentos.get(nome) || 0) + valor));
        profissional.porDia.forEach((valor, dia) => total.porDia.set(dia, (total.porDia.get(dia) || 0) + valor));
    });

    total.despesasBarbearia = (resumosBarbearia || [])
        .filter((resumo) => String(resumo?.dataChave || resumo?.id || "") === dataAtual)
        .reduce((soma, resumo) => soma + centavosParaReais(resumo?.despesasBarbeariaCentavos), 0);
    total.lucroLiquido = total.receitaBarbearia - total.despesasBarbearia;
    total.ticket = total.atendimentos ? total.faturamento / total.atendimentos : 0;

    [...total.servicos.entries()].forEach(([nome, qtd]) => {
        if (qtd > total.servicoMaisVendidoQtd) {
            total.servicoMaisVendido = nome;
            total.servicoMaisVendidoQtd = qtd;
        }
    });
    return total;
}

function renderEquipe(profissionais) {
    const lista = el("barbeariaHomeEquipeLista");
    const totalEl = el("barbeariaHomeEquipeTotal");
    if (!lista) return;
    const comMovimento = profissionais.filter((item) => item.atendimentos > 0 || item.faturamento > 0).sort((a, b) => b.faturamento - a.faturamento);
    if (totalEl) totalEl.textContent = `${comMovimento.length} profissional${comMovimento.length === 1 ? "" : "is"}`;
    if (!comMovimento.length) {
        lista.innerHTML = '<div class="barbearia-home-vazio">Nenhum atendimento registrado neste dia.</div>';
        return;
    }
    lista.innerHTML = comMovimento.map((item) => `
        <div class="relatorio-equipe-item barbearia-home-equipe-item">
            <div><strong>${escapeHtml(item.nome)}</strong><span>${item.atendimentos} atendimento${item.atendimentos === 1 ? "" : "s"}</span></div>
            <div><strong>${moeda(item.faturamento)}</strong><span>Bruto</span></div>
        </div>`).join("");
}

function renderResumo(total, profissionais) {
    aplicarOrdemCardsVisaoGeral();
    if (el("barbeariaHomeLucro")) el("barbeariaHomeLucro").textContent = moeda(total.lucroLiquido);
    if (el("barbeariaHomeFaturamento")) el("barbeariaHomeFaturamento").textContent = moeda(total.faturamento);
    if (el("barbeariaHomeFaturamentoSub")) el("barbeariaHomeFaturamentoSub").textContent = "Bruto do dia";
    if (el("barbeariaHomeAtendimentos")) el("barbeariaHomeAtendimentos").textContent = String(total.atendimentos);
    if (el("barbeariaHomeTicket")) el("barbeariaHomeTicket").textContent = moeda(total.ticket);
    if (el("barbeariaHomeDespesas")) el("barbeariaHomeDespesas").textContent = moeda(total.despesasBarbearia);
    if (el("barbeariaHomeServico")) el("barbeariaHomeServico").textContent = total.servicoMaisVendido;
    if (el("barbeariaHomeServicoSub")) el("barbeariaHomeServicoSub").textContent = total.servicoMaisVendidoQtd ? `${total.servicoMaisVendidoQtd} venda${total.servicoMaisVendidoQtd === 1 ? "" : "s"}` : "Nenhuma venda";
    renderEquipe(profissionais);
    ultimoTotalRenderizado = total;
    renderGraficos(total);
}

function coresTema() {
    const css = getComputedStyle(document.documentElement);
    return {
        primary: css.getPropertyValue("--primary").trim() || "#3b82f6",
        border: css.getPropertyValue("--border").trim() || "rgba(128,128,128,.2)",
        text: css.getPropertyValue("--text-secondary").trim() || "#888"
    };
}

function destruir(instance) { if (instance) instance.destroy(); }
function paleta(primary) { return [primary, "#22c55e", "#f59e0b", "#8b5cf6", "#06b6d4", "#f97316", "#ec4899"]; }

function renderRanking(id, entradas, formatar) {
    const container = el(id);
    if (!container) return;
    if (!entradas.length) {
        container.innerHTML = '<div class="relatorio-ranking-vazio">Sem dados nesta data.</div>';
        return;
    }
    container.innerHTML = entradas.map(([nome, valor], indice) => `
        <div class="relatorio-ranking-item"><span class="relatorio-ranking-pos">${indice + 1}</span><div class="relatorio-ranking-copy"><strong>${escapeHtml(nome)}</strong></div><strong class="relatorio-ranking-value">${formatar(valor)}</strong></div>
    `).join("");
}

function pluginNumerosRosca() {
    return {
        id: "srnkNumerosRoscaAdmin",
        afterDatasetsDraw(chart, _args, opcoes) {
            if (!opcoes?.mostrar) return;
            const meta = chart.getDatasetMeta(0);
            const valores = chart.data.datasets?.[0]?.data || [];
            const ctx = chart.ctx;
            ctx.save();
            meta.data.forEach((arco, indice) => {
                const valor = Number(valores[indice] || 0);
                if (valor <= 0 || !arco) return;
                const pos = arco.getCenterPoint();
                const raio = valor >= 10 ? 12 : 11;
                ctx.beginPath();
                ctx.arc(pos.x, pos.y, raio, 0, Math.PI * 2);
                ctx.fillStyle = "rgba(15, 23, 42, .82)";
                ctx.fill();
                ctx.fillStyle = "#fff";
                ctx.font = "700 11px Poppins, sans-serif";
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";
                ctx.fillText(String(valor), pos.x, pos.y + .5);
            });
            ctx.restore();
        }
    };
}

function criarRosca(canvasId, entradas, tooltip, { mostrarNumeros = false } = {}) {
    const canvas = el(canvasId);
    if (!canvas || typeof Chart === "undefined") return null;
    const cores = coresTema();
    const dados = entradas.length ? entradas : [["Sem dados", 1]];
    const vazio = !entradas.length;
    const coresLista = paleta(cores.primary);
    const corSeparacao = getComputedStyle(document.documentElement).getPropertyValue("--bg-card").trim() || "#fff";
    return new Chart(canvas, {
        type: "doughnut",
        plugins: [pluginNumerosRosca()],
        data: {
            labels: dados.map(([nome]) => nome),
            datasets: [{
                data: dados.map(([, valor]) => valor),
                backgroundColor: vazio ? [cores.border] : dados.map((_, i) => coresLista[i % coresLista.length]),
                borderWidth: 0,
                spacing: vazio ? 0 : 2,
                hoverOffset: vazio ? 0 : 5
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: "68%",
            animation: { duration: 180 },
            plugins: {
                srnkNumerosRoscaAdmin: { mostrar: mostrarNumeros && !vazio },
                legend: { display: false },
                tooltip: { enabled: !vazio, callbacks: { label: (ctx) => tooltip(ctx.raw, ctx.label) } }
            }
        }
    });
}

function renderGraficos(total) {
    const servicos = [...total.servicos.entries()].sort((a, b) => b[1] - a[1]);
    const pagamentos = [...total.pagamentos.entries()].sort((a, b) => b[1] - a[1]);
    renderRanking("barbeariaServicosLista", servicos, (valor) => `${valor}x`);
    renderRanking("barbeariaPagamentosLista", pagamentos, (valor) => moeda(valor));
    if (typeof Chart === "undefined") return;

    destruir(graficoFaturamento); destruir(graficoServicos); destruir(graficoPagamentos);
    const cores = coresTema();
    const labels = [];
    const valores = [];
    for (let i = 6; i >= 0; i -= 1) {
        const data = somarDias(dataSelecionada, -i);
        const chave = chaveData(data);
        labels.push(`${String(data.getDate()).padStart(2, "0")}/${String(data.getMonth() + 1).padStart(2, "0")}`);
        valores.push(Number(total.porDia.get(chave) || 0));
    }
    const canvas = el("graficoBarbeariaFaturamento");
    if (canvas) {
        graficoFaturamento = new Chart(canvas, {
            type: "bar",
            data: { labels, datasets: [{ data: valores, backgroundColor: cores.primary, borderRadius: 4, borderSkipped: false }] },
            options: { responsive: true, maintainAspectRatio: false, animation: { duration: 180 }, plugins: { legend: { display: false }, tooltip: { callbacks: { label: (ctx) => moeda(ctx.raw) } } }, scales: { x: { grid: { display: false }, ticks: { color: cores.text } }, y: { beginAtZero: true, grid: { color: cores.border }, ticks: { color: cores.text } } } }
        });
    }
    graficoServicos = criarRosca("graficoBarbeariaServicos", servicos, (valor) => `${valor} atendimento${Number(valor) === 1 ? "" : "s"}`, { mostrarNumeros: true });
    graficoPagamentos = criarRosca("graficoBarbeariaPagamentos", pagamentos, (valor) => moeda(valor));
}

function setStatus(mensagem = "", tipo = "aviso") {
    const status = el("barbeariaHomeStatus");
    if (!status) return;
    status.hidden = !mensagem;
    status.textContent = mensagem;
    status.dataset.tipo = tipo;
}

function atualizarNavegadorData() {
    const hoje = inicioDoDia(new Date());
    const input = el("inputDataBarbeariaHome");
    const label = el("labelDataBarbeariaHome");
    const proxima = el("btnBarbeariaDataProxima");
    if (label) label.textContent = formatarTituloData(dataSelecionada);
    if (input) { input.max = chaveData(hoje); input.value = chaveData(dataSelecionada); }
    if (proxima) {
        const estaHoje = mesmoDia(dataSelecionada, hoje);
        proxima.disabled = estaHoje;
        proxima.setAttribute("aria-disabled", String(estaHoje));
    }
}

async function carregarSerieAnterior(membros, total, { forcar = false } = {}) {
    const fim = somarDias(inicioDoDia(dataSelecionada), -1);
    const inicio = somarDias(inicioDoDia(dataSelecionada), -6);
    if (fim < inicio) return;

    const resumosPorMembro = await Promise.all(membros.map(async (membro) => {
        const uid = String(membro?.uid || membro?.id || "").trim();
        return uid ? listarResumosProfissionalPorPeriodo(uid, inicio, fim, { forcar }) : [];
    }));

    resumosPorMembro.flat().forEach((resumo) => {
        const dia = String(resumo?.dataChave || resumo?.id || "").trim();
        if (!dia) return;
        const bruto = centavosParaReais(resumo?.faturamentoBrutoCentavos);
        total.porDia.set(dia, (total.porDia.get(dia) || 0) + bruto);
    });

    if (ultimoTotalRenderizado === total) {
        void garantirChartJs().then(() => renderGraficos(total)).catch(() => null);
    }
}

async function carregarDados({ forcar = false, aguardarSerie = false } = {}) {
    // O primeiro desenho da Visão Geral depende somente do dia selecionado.
    // Os seis dias anteriores do gráfico entram depois e não atrasam o boot do Admin.
    const dia = inicioDoDia(dataSelecionada);
    const dataAtual = chaveData(dataSelecionada);
    const resumosBarbeariaPromise = listarResumosBarbeariaPorPeriodo(dia, dia, { forcar });
    const membros = membrosAtivos((state.equipe || []).length ? state.equipe : await listarMembrosEquipe());
    const resumosEquipePromise = Promise.all(membros.map(async (membro) => {
        const uid = String(membro?.uid || membro?.id || "").trim();
        const resumos = uid ? await listarResumosProfissionalPorPeriodo(uid, dia, dia, { forcar }) : [];
        return consolidarProfissional(membro, resumos, dataAtual);
    }));
    const [resumosEquipe, resumosBarbearia] = await Promise.all([resumosEquipePromise, resumosBarbeariaPromise]);
    const total = consolidarBarbearia(resumosEquipe, resumosBarbearia, dataAtual);
    renderResumo(total, resumosEquipe);
    setStatus();

    const serie = carregarSerieAnterior(membros, total, { forcar });
    if (aguardarSerie) await serie;
    else void serie.catch((error) => console.warn("Não foi possível completar o gráfico de 7 dias:", error));
}

export async function abrirVisaoGeralBarbearia({ forcar = false, aguardarSerie = false } = {}) {
    if (carregamentoEmAndamento && !forcar) return carregamentoEmAndamento;
    atualizarNavegadorData();
    void garantirChartJs().then(() => {
        if (ultimoTotalRenderizado && el("barbeariaHome") && getComputedStyle(el("barbeariaHome")).display !== "none") {
            renderGraficos(ultimoTotalRenderizado);
        }
    }).catch(() => null);

    const promessa = (async () => {
        try { await carregarDados({ forcar, aguardarSerie }); }
        catch (error) {
            console.error("Erro ao carregar visão geral da barbearia:", error);
            setStatus("Não foi possível carregar a visão geral agora. Tente atualizar.", "erro");
        }
    })();
    carregamentoEmAndamento = promessa;
    try { return await promessa; }
    finally {
        if (carregamentoEmAndamento === promessa) carregamentoEmAndamento = null;
    }
}

async function selecionarData(novaData) {
    const hoje = inicioDoDia(new Date());
    const normalizada = inicioDoDia(novaData);
    dataSelecionada = normalizada.getTime() > hoje.getTime() ? hoje : normalizada;
    atualizarNavegadorData();
    const loading = iniciarLoadingTela("Atualizando visão geral...", { delay: 420 });
    try { await abrirVisaoGeralBarbearia(); }
    finally { finalizarLoadingTela(loading); }
}

function configurarEventos() {
    if (eventosConfigurados) return;
    eventosConfigurados = true;
    el("btnBarbeariaDataAnterior")?.addEventListener("click", () => void selecionarData(somarDias(dataSelecionada, -1)));
    el("btnBarbeariaDataProxima")?.addEventListener("click", () => { if (!mesmoDia(dataSelecionada, new Date())) void selecionarData(somarDias(dataSelecionada, 1)); });
    const input = el("inputDataBarbeariaHome");
    const calendario = el("btnCalendarioBarbeariaHome");
    calendario?.addEventListener("click", () => abrirCalendarioPopover({ ancora: calendario, data: dataSelecionada, max: new Date(), titulo: "Visão Geral", onSelect: (data) => void selecionarData(data) }));
    input?.addEventListener("change", () => { const escolhida = dataDeInput(input.value); if (escolhida) void selecionarData(escolhida); });
}

inicializarTooltipsFinanceiros();
configurarEventos();
