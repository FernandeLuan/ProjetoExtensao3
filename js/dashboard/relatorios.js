import { state } from "./state.js?v=6.1";
import { listarAtendimentosPorPeriodo } from "./data/atendimentos-repository.js?v=6.1";
import { listarDespesasPorPeriodo } from "./data/despesas-repository.js?v=6.1";
import { listarMembrosEquipe } from "./data/equipe-repository.js?v=6.1";
import { usuarioEhAdmin } from "./permissoes.js?v=6.1";
import {
    obterBrutoAtendimento,
    obterTaxaCartaoValor,
    obterRepasseAtendimento,
    obterLiquidoBarbeiro
} from "./services/financeiro-service.js?v=6.1";
import { chaveData, dataDeInput, inicioDoDia, somarDias, obterDataAtendimento } from "./utils/date.js?v=6.1";
import { formatarMoeda } from "./utils/money.js?v=6.1";
import { escaparHtml } from "./utils/dom.js?v=6.1";

let inicializado = false;
let periodoAtual = "hoje";
let relatorioAtual = null;
let charts = {};

const el = (id) => document.getElementById(id);
const inicioInput = el("dataInicioRelatorio");
const fimInput = el("dataFimRelatorio");
const periodoCustom = el("relatorioPeriodoCustom");
const profissionalField = el("relatorioProfissionalField");
const profissionalSelect = el("relatorioProfissionalSelect");
const loading = el("relatorioLoading");
const status = el("relatorioStatus");
const fluxoCard = el("relatorioFluxoCard");

function moeda(valor) {
    return `R$ ${formatarMoeda(Number(valor || 0))}`;
}

function moedaSinal(valor) {
    const numero = Number(valor || 0);
    const sinal = numero > 0 ? "+ " : numero < 0 ? "- " : "";
    return `${sinal}R$ ${formatarMoeda(Math.abs(numero))}`;
}

function setTexto(id, texto) {
    const elemento = el(id);
    if (elemento) elemento.textContent = texto;
}

function setStatus(texto = "", erro = false) {
    if (!status) return;
    status.textContent = texto;
    status.classList.toggle("error", Boolean(erro));
}

function inicioFimPeriodo(tipo) {
    const hoje = inicioDoDia(new Date());
    if (tipo === "semana") return { inicio: somarDias(hoje, -6), fim: hoje };
    if (tipo === "mes") return { inicio: new Date(hoje.getFullYear(), hoje.getMonth(), 1), fim: hoje };
    return { inicio: hoje, fim: hoje };
}

function formatarPeriodo(inicio, fim) {
    if (chaveData(inicio) === chaveData(fim)) {
        return inicio.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
    }
    return `${inicio.toLocaleDateString("pt-BR")} a ${fim.toLocaleDateString("pt-BR")}`;
}

function atualizarBotoesPeriodo(tipo) {
    document.querySelectorAll("#relatorios .btn-filtro").forEach((btn) => btn.classList.remove("active"));
    const mapa = { hoje: "btnRelHoje", semana: "btnRelSemana", mes: "btnRelMes", periodo: "btnRelPeriodo" };
    el(mapa[tipo])?.classList.add("active");
}

function definirDatas(tipo) {
    periodoAtual = tipo;
    atualizarBotoesPeriodo(tipo);
    const { inicio, fim } = inicioFimPeriodo(tipo);
    if (inicioInput) inicioInput.value = chaveData(inicio);
    if (fimInput) fimInput.value = chaveData(fim);
    if (periodoCustom) periodoCustom.hidden = tipo !== "periodo";
    return { inicio, fim };
}

function obterDatasSelecionadas() {
    const inicio = dataDeInput(inicioInput?.value);
    const fim = dataDeInput(fimInput?.value);
    if (!inicio || !fim) throw new Error("Selecione um período válido.");
    if (inicio > fim) throw new Error("A data inicial não pode ser maior que a final.");
    if (fim > inicioDoDia(new Date())) throw new Error("O relatório não pode usar uma data futura.");
    return { inicio, fim };
}

function agrupar(lista, chaveFn, valorFn = () => 1) {
    const mapa = new Map();
    lista.forEach((item) => {
        const chave = chaveFn(item) || "Outros";
        mapa.set(chave, (mapa.get(chave) || 0) + Number(valorFn(item) || 0));
    });
    return [...mapa.entries()].sort((a, b) => b[1] - a[1]);
}

function nomeMembro(membro) {
    return String(membro?.nome || membro?.email || "Profissional").trim();
}

async function prepararSeletorProfissional() {
    if (!profissionalSelect || !profissionalField) return;

    if (!usuarioEhAdmin()) {
        profissionalField.hidden = true;
        profissionalSelect.innerHTML = "";
        return;
    }

    profissionalField.hidden = false;
    const valorAnterior = profissionalSelect.value || "barbearia";
    const membros = await listarMembrosEquipe();
    const ativos = membros
        .filter((membro) => membro.ativo === true)
        .sort((a, b) => nomeMembro(a).localeCompare(nomeMembro(b), "pt-BR"));

    profissionalSelect.innerHTML = '<option value="barbearia">Barbearia</option>';
    ativos.forEach((membro) => {
        const option = document.createElement("option");
        option.value = membro.uid || membro.id;
        option.textContent = nomeMembro(membro);
        profissionalSelect.appendChild(option);
    });

    const existe = [...profissionalSelect.options].some((option) => option.value === valorAnterior);
    profissionalSelect.value = existe ? valorAnterior : "barbearia";
}

function coresGrafico() {
    const estilo = getComputedStyle(document.documentElement);
    const principal = estilo.getPropertyValue("--primary").trim() || "#2563eb";
    const sucesso = estilo.getPropertyValue("--success").trim() || "#22c55e";
    const aviso = estilo.getPropertyValue("--warning").trim() || "#fbbf24";
    const texto = estilo.getPropertyValue("--text-secondary").trim() || "#8a8a8a";
    const borda = estilo.getPropertyValue("--border").trim() || "rgba(128,128,128,.25)";
    return {
        principal,
        sucesso,
        aviso,
        texto,
        borda,
        paleta: [principal, sucesso, aviso, "#8b5cf6", "#06b6d4", "#f97316", "#ec4899", "#64748b"]
    };
}

function destruirGrafico(nome) {
    if (charts[nome]) {
        charts[nome].destroy();
        charts[nome] = null;
    }
}

function graficoLinhaDiaria(atendimentos, inicio, fim) {
    destruirGrafico("faturamento");
    const canvas = el("graficoRelatorioFaturamento");
    if (!canvas || typeof Chart === "undefined") return;

    const porDia = new Map();
    atendimentos.forEach((a) => {
        const data = obterDataAtendimento(a);
        if (!data) return;
        const chave = chaveData(data);
        porDia.set(chave, (porDia.get(chave) || 0) + obterBrutoAtendimento(a));
    });

    const labels = [];
    const dados = [];
    let cursor = inicioDoDia(inicio);
    while (cursor <= fim) {
        const chave = chaveData(cursor);
        labels.push(cursor.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }));
        dados.push(Number((porDia.get(chave) || 0).toFixed(2)));
        cursor = somarDias(cursor, 1);
    }

    const c = coresGrafico();
    charts.faturamento = new Chart(canvas, {
        type: "line",
        data: {
            labels,
            datasets: [{
                label: "Faturamento",
                data: dados,
                borderColor: c.principal,
                backgroundColor: `${c.principal}22`,
                fill: true,
                tension: 0.32,
                pointRadius: 3,
                pointHoverRadius: 5
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: { callbacks: { label: (ctx) => moeda(ctx.raw) } }
            },
            scales: {
                x: { ticks: { color: c.texto, maxTicksLimit: 7 }, grid: { display: false } },
                y: { beginAtZero: true, ticks: { color: c.texto, callback: (v) => `R$ ${Number(v).toLocaleString("pt-BR")}` }, grid: { color: c.borda } }
            }
        }
    });
}

function graficoRosca(nome, canvasId, entradas, labelFn) {
    destruirGrafico(nome);
    const canvas = el(canvasId);
    if (!canvas || typeof Chart === "undefined") return;

    const dados = entradas.length ? entradas : [["Sem dados", 1]];
    const c = coresGrafico();
    const semDados = !entradas.length;

    charts[nome] = new Chart(canvas, {
        type: "doughnut",
        data: {
            labels: dados.map(([rotulo]) => rotulo),
            datasets: [{
                data: dados.map(([, valor]) => valor),
                backgroundColor: semDados ? [c.borda] : dados.map((_, i) => c.paleta[i % c.paleta.length]),
                borderWidth: 0,
                hoverOffset: semDados ? 0 : 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: "68%",
            plugins: {
                legend: { display: false },
                tooltip: {
                    enabled: !semDados,
                    callbacks: { label: (ctx) => labelFn ? labelFn(ctx) : String(ctx.raw) }
                }
            }
        }
    });
}

function graficoBarrasDespesas(entradas) {
    destruirGrafico("despesas");
    const canvas = el("graficoRelatorioDespesas");
    if (!canvas || typeof Chart === "undefined") return;
    const c = coresGrafico();
    const dados = entradas.length ? entradas : [["Sem despesas", 0]];

    charts.despesas = new Chart(canvas, {
        type: "bar",
        data: {
            labels: dados.map(([nome]) => nome),
            datasets: [{ data: dados.map(([, valor]) => valor), backgroundColor: c.principal, borderRadius: 7 }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false }, tooltip: { callbacks: { label: (ctx) => moeda(ctx.raw) } } },
            scales: {
                x: { ticks: { color: c.texto }, grid: { display: false } },
                y: { beginAtZero: true, ticks: { color: c.texto, callback: (v) => `R$ ${Number(v).toLocaleString("pt-BR")}` }, grid: { color: c.borda } }
            }
        }
    });
}

function renderRanking(containerId, entradas, { totalBase = 0, valorMonetario = false, subtituloFn = null } = {}) {
    const container = el(containerId);
    if (!container) return;
    container.innerHTML = "";

    if (!entradas.length) {
        container.innerHTML = '<div class="relatorio-ranking-vazio">Sem dados no período.</div>';
        return;
    }

    entradas.forEach(([nome, valor], indice) => {
        const item = document.createElement("div");
        item.className = "relatorio-ranking-item";
        const percentual = totalBase > 0 ? (Number(valor) / totalBase) * 100 : 0;
        const valorTexto = valorMonetario ? moeda(valor) : `${Number(valor)} atendimento${Number(valor) === 1 ? "" : "s"}`;
        const sub = subtituloFn ? subtituloFn(nome, valor) : `${percentual.toFixed(1).replace(".", ",")}%`;
        item.innerHTML = `
            <span class="relatorio-ranking-pos">${indice + 1}</span>
            <div class="relatorio-ranking-copy"><strong>${escaparHtml(nome)}</strong><small>${escaparHtml(sub)}</small></div>
            <strong class="relatorio-ranking-value">${escaparHtml(valorTexto)}</strong>`;
        container.appendChild(item);
    });
}

function calcularResumo(atendimentos, despesas, visaoBarbearia) {
    const faturamento = atendimentos.reduce((s, a) => s + obterBrutoAtendimento(a), 0);
    const taxas = atendimentos.reduce((s, a) => s + obterTaxaCartaoValor(a), 0);
    const repasse = atendimentos.reduce((s, a) => s + obterRepasseAtendimento(a), 0);
    const liquidoBarbeiro = atendimentos.reduce((s, a) => s + obterLiquidoBarbeiro(a), 0);

    const despesasConsideradas = despesas.filter((d) => visaoBarbearia ? d.tipo === "barbearia" : d.tipo !== "barbearia");
    const totalDespesas = despesasConsideradas.reduce((s, d) => s + Number(d.valor || 0), 0);

    const debito = atendimentos
        .filter((a) => a.pagamento === "Débito")
        .reduce((s, a) => s + obterTaxaCartaoValor(a), 0);
    const credito = atendimentos
        .filter((a) => a.pagamento === "Crédito")
        .reduce((s, a) => s + obterTaxaCartaoValor(a), 0);

    const ticket = atendimentos.length ? faturamento / atendimentos.length : 0;
    const resultado = visaoBarbearia ? repasse : liquidoBarbeiro - totalDespesas;

    return {
        faturamento,
        taxas,
        repasse,
        liquidoBarbeiro,
        totalDespesas,
        despesasConsideradas,
        debito,
        credito,
        ticket,
        resultado
    };
}

function calcularAjustes(atendimentos) {
    let quantidade = 0;
    let diferenca = 0;

    atendimentos.forEach((a) => {
        const esperado = Number(a.precoProfissional ?? a.precoBase);
        const bruto = obterBrutoAtendimento(a);
        const ajustado = a.valorDiferenciado === true || a.origemPreco === "ajustado" || (Number.isFinite(esperado) && esperado > 0 && Math.abs(bruto - esperado) > 0.009);
        if (!ajustado || !Number.isFinite(esperado) || esperado <= 0) return;
        quantidade += 1;
        diferenca += bruto - esperado;
    });

    return { quantidade, diferenca };
}

function renderEquipe(atendimentos) {
    const card = el("relatorioEquipeCard");
    const lista = el("relatorioEquipeLista");
    if (!card || !lista) return;

    const exibir = usuarioEhAdmin() && profissionalSelect?.value === "barbearia";
    card.hidden = !exibir;
    if (!exibir) return;

    lista.innerHTML = "";
    const mapa = new Map();
    atendimentos.forEach((a) => {
        const uid = a.profissionalUid || "sem-profissional";
        if (!mapa.has(uid)) mapa.set(uid, { nome: a.profissionalNome || "Sem profissional", qtd: 0, faturamento: 0, repasse: 0 });
        const item = mapa.get(uid);
        item.qtd += 1;
        item.faturamento += obterBrutoAtendimento(a);
        item.repasse += obterRepasseAtendimento(a);
    });

    const dados = [...mapa.values()].sort((a, b) => b.faturamento - a.faturamento);
    if (!dados.length) {
        lista.innerHTML = '<div class="relatorio-ranking-vazio">Sem produção no período.</div>';
        return;
    }

    dados.forEach((item) => {
        const linha = document.createElement("div");
        linha.className = "relatorio-equipe-item";
        linha.innerHTML = `<div><strong>${escaparHtml(item.nome)}</strong><span>${item.qtd} atendimento${item.qtd === 1 ? "" : "s"}</span></div><div><strong>${moeda(item.faturamento)}</strong><span>Repasse ${moeda(item.repasse)}</span></div>`;
        lista.appendChild(linha);
    });
}

function renderizar(relatorio) {
    const { atendimentos, despesas, inicio, fim, visaoBarbearia, nomeVisao } = relatorio;
    const resumo = calcularResumo(atendimentos, despesas, visaoBarbearia);
    const ajustes = calcularAjustes(atendimentos);

    setTexto("relatorioResultadoLabel", visaoBarbearia ? "Repasse previsto" : "Resultado profissional");
    setTexto("relatorioResultado", moeda(resumo.resultado));
    setTexto("relatorioPeriodoLabel", `${nomeVisao} • ${formatarPeriodo(inicio, fim)}`);
    setTexto("relatorioFaturamento", moeda(resumo.faturamento));
    setTexto("relatorioAtendimentos", String(atendimentos.length));
    setTexto("relatorioTicket", moeda(resumo.ticket));
    setTexto("relatorioDespesas", moeda(resumo.totalDespesas));
    setTexto(
        "relatorioDespesasDescricao",
        visaoBarbearia
            ? "Custos lançados como despesa da barbearia"
            : "Onde o dinheiro profissional foi usado"
    );

    if (fluxoCard) fluxoCard.hidden = visaoBarbearia;
    setTexto("fluxoFaturamento", moeda(resumo.faturamento));
    setTexto("fluxoTaxas", `- ${moeda(resumo.taxas)}`);
    setTexto("fluxoRepasse", `- ${moeda(resumo.repasse)}`);
    setTexto("fluxoDespesas", `- ${moeda(resumo.totalDespesas)}`);
    setTexto("fluxoResultado", moeda(resumo.liquidoBarbeiro - resumo.totalDespesas));

    setTexto("relatorioTaxasTotal", moeda(resumo.taxas));
    setTexto("relatorioTaxaDebito", moeda(resumo.debito));
    setTexto("relatorioTaxaCredito", moeda(resumo.credito));
    const percentualTaxas = resumo.faturamento > 0 ? (resumo.taxas / resumo.faturamento) * 100 : 0;
    setTexto("relatorioTaxasPercentual", `${percentualTaxas.toFixed(2).replace(".", ",")}% do faturamento`);

    setTexto("relatorioAjustesQtd", String(ajustes.quantidade));
    setTexto("relatorioAjustesValor", moedaSinal(ajustes.diferenca));

    const servicosQtd = agrupar(atendimentos, (a) => a.servicoNome || a.servico || "Outros");
    const servicosFaturamento = new Map(agrupar(atendimentos, (a) => a.servicoNome || a.servico || "Outros", obterBrutoAtendimento));
    const pagamentos = agrupar(atendimentos, (a) => a.pagamento || "Outros", obterBrutoAtendimento);
    const categoriasDespesa = agrupar(resumo.despesasConsideradas, (d) => d.categoria || "Outros", (d) => Number(d.valor || 0));

    graficoLinhaDiaria(atendimentos, inicio, fim);
    graficoRosca("servicos", "graficoRelatorioServicos", servicosQtd, (ctx) => `${ctx.raw} atendimento${ctx.raw === 1 ? "" : "s"}`);
    graficoRosca("pagamentos", "graficoRelatorioPagamentos", pagamentos, (ctx) => moeda(ctx.raw));
    graficoBarrasDespesas(categoriasDespesa);

    renderRanking("relatorioServicosLista", servicosQtd, {
        totalBase: atendimentos.length,
        subtituloFn: (nome, qtd) => {
            const percentual = atendimentos.length ? (qtd / atendimentos.length) * 100 : 0;
            return `${percentual.toFixed(1).replace(".", ",")}% • ${moeda(servicosFaturamento.get(nome) || 0)}`;
        }
    });
    renderRanking("relatorioPagamentosLista", pagamentos, { totalBase: resumo.faturamento, valorMonetario: true });
    renderRanking("relatorioDespesasLista", categoriasDespesa, { totalBase: resumo.totalDespesas, valorMonetario: true });
    renderEquipe(atendimentos);

    relatorio.resumo = resumo;
    relatorio.ajustes = ajustes;
}

function obterNomeVisao(uid, visaoBarbearia) {
    if (visaoBarbearia) return "Barbearia";
    if (!uid || uid === state.user?.uid) return state.perfilUsuario?.nome || state.membroAtual?.nome || "Meu desempenho";
    const membro = (state.equipe || []).find((item) => (item.uid || item.id) === uid);
    return nomeMembro(membro);
}

export async function carregarRelatorio() {
    let datas;
    try {
        datas = obterDatasSelecionadas();
    } catch (error) {
        setStatus(error.message, true);
        return;
    }

    const admin = usuarioEhAdmin();
    const selecao = admin ? (profissionalSelect?.value || "barbearia") : state.user?.uid;
    const visaoBarbearia = admin && selecao === "barbearia";
    const profissionalUid = visaoBarbearia ? null : selecao;

    if (loading) loading.hidden = false;
    setStatus();

    try {
        const [atendimentos, despesas] = await Promise.all([
            listarAtendimentosPorPeriodo(datas.inicio, datas.fim, { profissionalUid }),
            listarDespesasPorPeriodo(datas.inicio, datas.fim, {
                profissionalUid: visaoBarbearia ? null : profissionalUid,
                incluirBarbearia: visaoBarbearia
            })
        ]);

        relatorioAtual = {
            ...datas,
            atendimentos,
            despesas,
            visaoBarbearia,
            profissionalUid,
            nomeVisao: obterNomeVisao(profissionalUid, visaoBarbearia)
        };
        renderizar(relatorioAtual);
    } catch (error) {
        console.error("Erro ao carregar relatório:", error);
        setStatus(
            String(error?.message || "").includes("index")
                ? "O Firestore pediu um índice para esta consulta. Publique os índices do pacote v2.0."
                : "Não foi possível carregar o relatório.",
            true
        );
    } finally {
        if (loading) loading.hidden = true;
    }
}

function montarResumoWhatsApp() {
    if (!relatorioAtual?.resumo) return "";
    const r = relatorioAtual;
    const s = r.resumo;
    const linhas = [
        "✂️ *Marlon Barber*",
        `*${r.visaoBarbearia ? "Fechamento geral" : `Resumo • ${r.nomeVisao}`}*`,
        formatarPeriodo(r.inicio, r.fim),
        "",
        "📊 *RESUMO*",
        `Atendimentos: ${r.atendimentos.length}`,
        `Faturamento: ${moeda(s.faturamento)}`,
        `Ticket médio: ${moeda(s.ticket)}`,
        "",
        "💳 *PAGAMENTOS*"
    ];

    const pagamentos = agrupar(r.atendimentos, (a) => a.pagamento || "Outros", obterBrutoAtendimento);
    pagamentos.forEach(([nome, valor]) => linhas.push(`${nome}: ${moeda(valor)}`));
    linhas.push(`Taxas de cartão: ${moeda(s.taxas)}`);

    if (r.visaoBarbearia) {
        linhas.push("", "💰 *REPASSES*", `Repasse previsto: ${moeda(s.repasse)}`, `Despesas da barbearia: ${moeda(s.totalDespesas)}`);

        const mapaEquipe = new Map();
        r.atendimentos.forEach((a) => {
            const uid = a.profissionalUid || "sem";
            if (!mapaEquipe.has(uid)) mapaEquipe.set(uid, { nome: a.profissionalNome || "Sem profissional", qtd: 0, bruto: 0, repasse: 0 });
            const item = mapaEquipe.get(uid);
            item.qtd += 1;
            item.bruto += obterBrutoAtendimento(a);
            item.repasse += obterRepasseAtendimento(a);
        });
        if (mapaEquipe.size) {
            linhas.push("", "👥 *PROFISSIONAIS*");
            [...mapaEquipe.values()].forEach((item) => {
                linhas.push(`${item.nome}: ${item.qtd} atend. • ${moeda(item.bruto)} • Repasse ${moeda(item.repasse)}`);
            });
        }
    } else {
        linhas.push(
            "",
            "💰 *REPASSE E RESULTADO*",
            `Base após taxas: ${moeda(s.faturamento - s.taxas)}`,
            `Repasse ao proprietário: ${moeda(s.repasse)}`,
            `Receita do barbeiro: ${moeda(s.liquidoBarbeiro)}`,
            `Despesas: ${moeda(s.totalDespesas)}`,
            `*Resultado profissional: ${moeda(s.liquidoBarbeiro - s.totalDespesas)}*`
        );
    }

    const servicos = agrupar(r.atendimentos, (a) => a.servicoNome || a.servico || "Outros");
    if (servicos.length) {
        const [maisVendido, qtd] = servicos[0];
        const pct = r.atendimentos.length ? (qtd / r.atendimentos.length) * 100 : 0;
        linhas.push("", "✂️ *SERVIÇO MAIS VENDIDO*", `${maisVendido}: ${qtd} • ${pct.toFixed(1).replace(".", ",")}%`);
    }

    return linhas.join("\n");
}

function enviarWhatsApp() {
    const mensagem = montarResumoWhatsApp();
    if (!mensagem) {
        setStatus("Carregue um relatório antes de compartilhar.", true);
        return;
    }
    const url = `https://wa.me/?text=${encodeURIComponent(mensagem)}`;
    window.open(url, "_blank", "noopener,noreferrer");
}

async function gerarPDF() {
    if (!relatorioAtual) {
        setStatus("Carregue um relatório antes de gerar o PDF.", true);
        return;
    }

    const conteudo = el("relatorioConteudo");
    const botao = el("btnExportPDF");
    if (!conteudo || typeof html2canvas === "undefined" || !window.jspdf?.jsPDF) {
        setStatus("Não foi possível carregar o gerador de PDF. Confira sua conexão.", true);
        return;
    }

    if (botao) {
        botao.disabled = true;
        botao.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i><span>Gerando PDF...</span>';
    }
    setStatus("Gerando PDF...");

    try {
        const canvas = await html2canvas(conteudo, {
            scale: 2,
            useCORS: true,
            backgroundColor: getComputedStyle(document.body).backgroundColor || "#ffffff",
            windowWidth: Math.max(document.documentElement.clientWidth, 390)
        });

        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
        const largura = 190;
        const margem = 10;
        const alturaImagem = canvas.height * largura / canvas.width;
        const alturaPagina = 277;
        const imagem = canvas.toDataURL("image/jpeg", 0.92);

        let restante = alturaImagem;
        let posY = margem;
        pdf.addImage(imagem, "JPEG", margem, posY, largura, alturaImagem);
        restante -= alturaPagina;

        while (restante > 0) {
            posY -= alturaPagina;
            pdf.addPage();
            pdf.addImage(imagem, "JPEG", margem, posY, largura, alturaImagem);
            restante -= alturaPagina;
        }

        const nome = `marlon-barber-relatorio-${chaveData(relatorioAtual.inicio)}-a-${chaveData(relatorioAtual.fim)}.pdf`;
        const blob = pdf.output("blob");
        const arquivo = new File([blob], nome, { type: "application/pdf" });

        const podeCompartilharArquivo = Boolean(
            navigator.share
            && navigator.canShare
            && navigator.canShare({ files: [arquivo] })
        );

        if (podeCompartilharArquivo) {
            try {
                await navigator.share({
                    title: "Relatório Marlon Barber",
                    text: `Relatório • ${formatarPeriodo(relatorioAtual.inicio, relatorioAtual.fim)}`,
                    files: [arquivo]
                });
                setStatus("PDF pronto para compartilhamento.");
            } catch (shareError) {
                if (shareError?.name === "AbortError") {
                    setStatus("Compartilhamento do PDF cancelado.");
                } else {
                    pdf.save(nome);
                    setStatus("PDF gerado com sucesso.");
                }
            }
        } else {
            pdf.save(nome);
            setStatus("PDF gerado com sucesso.");
        }
    } catch (error) {
        console.error("Erro ao gerar PDF:", error);
        setStatus("Não foi possível gerar o PDF.", true);
    } finally {
        if (botao) {
            botao.disabled = false;
            botao.innerHTML = '<i class="fas fa-file-pdf"></i><span>Gerar PDF</span>';
        }
    }
}

export async function prepararRelatoriosHoje() {
    definirDatas("hoje");
    await prepararSeletorProfissional();
    await carregarRelatorio();
}

export function initRelatorios() {
    if (inicializado) return;
    inicializado = true;

    const hoje = chaveData(new Date());
    if (inicioInput) inicioInput.max = hoje;
    if (fimInput) fimInput.max = hoje;

    el("btnRelHoje")?.addEventListener("click", async () => {
        definirDatas("hoje");
        await carregarRelatorio();
    });
    el("btnRelSemana")?.addEventListener("click", async () => {
        definirDatas("semana");
        await carregarRelatorio();
    });
    el("btnRelMes")?.addEventListener("click", async () => {
        definirDatas("mes");
        await carregarRelatorio();
    });
    el("btnRelPeriodo")?.addEventListener("click", () => {
        periodoAtual = "periodo";
        atualizarBotoesPeriodo("periodo");
        if (periodoCustom) periodoCustom.hidden = false;
    });
    el("btnAplicarPeriodoRelatorio")?.addEventListener("click", carregarRelatorio);
    profissionalSelect?.addEventListener("change", carregarRelatorio);
    el("btnWhatsApp")?.addEventListener("click", enviarWhatsApp);
    el("btnExportPDF")?.addEventListener("click", gerarPDF);

    definirDatas("hoje");
}
