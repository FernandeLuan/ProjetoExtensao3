import { state, onStateChange } from "./state.js?v=11.0";
import { podeAdministrarNaVisaoAtual } from "./permissoes.js?v=11.0";
import { formatarMoeda, converterParaNumero, aplicarMascaraMoedaInput, formatarValorInput } from "./utils/money.js?v=11.0";
import { paraDate, chaveData } from "./utils/date.js?v=11.0";
import { mostrarErro, mostrarSucesso } from "./services/feedback-service.js?v=11.0";
import {
    iniciarAcaoBotao,
    concluirAcaoBotao,
    restaurarAcaoBotao,
    iniciarLoadingTela,
    finalizarLoadingTela
} from "./services/ui-loading-service.js?v=11.0";
import { garantirZXing } from "./services/external-assets.js?v=11.0";
import {
    CATEGORIAS_ESTOQUE,
    FORMAS_PAGAMENTO_VENDA,
    calcularVendaProduto,
    formatarQuantidadeEstoque,
    normalizarCodigoBarras,
    statusEstoque
} from "./services/estoque-service.js?v=11.0";
import {
    atualizarProdutoEstoque,
    cancelarVendaProduto,
    criarProdutoEstoque,
    definirStatusProduto,
    editarVendaProduto,
    listarMovimentacoesRecentes,
    listarProdutosEstoque,
    listarProfissionaisParaVenda,
    listarVendasPorPeriodo,
    localizarProdutoPorCodigo,
    movimentarEstoque,
    registrarVendaProduto
} from "./data/estoque-repository.js?v=11.0";
import { criarDespesa, criarDespesaParcelada } from "./data/despesas-repository.js?v=11.0";

let inicializado = false;
let produtos = [];
let vendasAdmin = [];
let vendasProfissional = [];
let movimentacoes = [];
let produtoEmEdicao = null;
let produtoMovimentacao = null;
let produtoVenda = null;
let vendaEmEdicao = null;
let vendaParaCancelar = null;
let filtroStatus = "todos";
let scannerControls = null;
let scannerDestino = null;
let scannerAtivo = false;
let mesVendas = inicioDoMes(new Date());
let abaEstoqueAdmin = "produtos";
let abaEstoqueProfissional = "vender";

const $ = (id) => document.getElementById(id);
const moeda = (valor) => `R$ ${formatarMoeda(Number(valor || 0))}`;

function escapar(texto) {
    return String(texto ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;");
}

function inicioDoMes(data) {
    const d = paraDate(data) || new Date(data);
    return new Date(d.getFullYear(), d.getMonth(), 1);
}

function fimDoMes(data) {
    const d = inicioDoMes(data);
    return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
}

function somarMeses(data, quantidade) {
    const d = inicioDoMes(data);
    return new Date(d.getFullYear(), d.getMonth() + quantidade, 1);
}

function nomeMes(data) {
    const texto = data.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
    return texto.charAt(0).toUpperCase() + texto.slice(1);
}

function dataHora(valor) {
    const data = paraDate(valor);
    if (!data) return "—";
    return data.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function hora(valor) {
    const data = paraDate(valor);
    return data ? data.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "—";
}

function setModal(id, aberto) {
    const modal = $(id);
    if (!modal) return;
    modal.hidden = !aberto;
    modal.classList.toggle("active", aberto);
    modal.setAttribute("aria-hidden", String(!aberto));
}

function preencherSelect(select, itens, valorAtual = "") {
    if (!select) return;
    select.innerHTML = itens.map((item) => {
        const valor = typeof item === "string" ? item : item.valor;
        const label = typeof item === "string" ? item : item.label;
        return `<option value="${escapar(valor)}">${escapar(label)}</option>`;
    }).join("");
    if ([...select.options].some((op) => op.value === valorAtual)) select.value = valorAtual;
}

function configurarVisao() {
    const admin = podeAdministrarNaVisaoAtual();
    if ($("estoqueAdminView")) $("estoqueAdminView").hidden = !admin;
    if ($("estoqueVendaView")) $("estoqueVendaView").hidden = admin;
    if ($("estoqueTitulo")) $("estoqueTitulo").textContent = admin ? "Estoque" : "Vender produto";
    if ($("estoqueDescricao")) $("estoqueDescricao").textContent = admin
        ? "Produtos, vendas da equipe e movimentações."
        : "Venda produtos da equipe e acompanhe seu histórico.";
    selecionarAbaEstoque(admin ? abaEstoqueAdmin : abaEstoqueProfissional, { admin });
}

function selecionarAbaEstoque(aba, { admin = podeAdministrarNaVisaoAtual() } = {}) {
    if (admin) {
        abaEstoqueAdmin = ["produtos", "vendas", "movimentacoes"].includes(aba) ? aba : "produtos";
        document.querySelectorAll("[data-estoque-admin-tab]").forEach((botao) => {
            const ativo = botao.dataset.estoqueAdminTab === abaEstoqueAdmin;
            botao.classList.toggle("active", ativo);
            botao.setAttribute("aria-selected", String(ativo));
        });
        ["produtos", "vendas", "movimentacoes"].forEach((nome) => {
            const painel = $(`estoqueAdminPainel${nome[0].toUpperCase()}${nome.slice(1)}`);
            if (painel) painel.hidden = nome !== abaEstoqueAdmin;
        });
        return;
    }

    abaEstoqueProfissional = ["vender", "minhas"].includes(aba) ? aba : "vender";
    document.querySelectorAll("[data-estoque-pro-tab]").forEach((botao) => {
        const ativo = botao.dataset.estoqueProTab === abaEstoqueProfissional;
        botao.classList.toggle("active", ativo);
        botao.setAttribute("aria-selected", String(ativo));
    });
    if ($("estoqueProPainelVender")) $("estoqueProPainelVender").hidden = abaEstoqueProfissional !== "vender";
    if ($("estoqueProPainelMinhas")) $("estoqueProPainelMinhas").hidden = abaEstoqueProfissional !== "minhas";
}

function badgeStatus(produto) {
    const status = statusEstoque(produto);
    if (status === "arquivado") return '<span class="estoque-badge is-inativo">Arquivado</span>';
    if (status === "zerado") return '<span class="estoque-badge is-danger">Sem estoque</span>';
    return '<span class="estoque-badge is-ok">Disponível</span>';
}

function listaProdutosFiltrados({ venda = false } = {}) {
    const busca = String((venda ? $("estoqueVendaBusca") : $("estoqueBusca"))?.value || "").trim().toLowerCase();
    return produtos.filter((produto) => {
        const ativo = produto.ativo !== false;
        const qtd = Number(produto.quantidadeAtual || 0);
        if (venda && (!ativo || qtd <= 0)) return false;
        if (venda && !podeAdministrarNaVisaoAtual() && produto.comissaoHabilitada === false) return false;
        if (!venda) {
            if (filtroStatus === "ativos" && !ativo) return false;
            if (filtroStatus === "zerado" && (!ativo || qtd > 0)) return false;
            if (filtroStatus === "arquivados" && ativo) return false;
        }
        if (!busca) return true;
        const alvo = `${produto.nome || ""} ${produto.categoria || ""} ${produto.codigoBarras || ""}`.toLowerCase();
        return alvo.includes(busca);
    });
}

function atualizarResumoAdmin() {
    const ativos = produtos.filter((p) => p.ativo !== false);
    const zerado = ativos.filter((p) => Number(p.quantidadeAtual || 0) <= 0).length;
    const valor = ativos.reduce((s, p) => s + Number(p.quantidadeAtual || 0) * Number(p.custoUnitario || 0), 0);
    if ($("estoqueResumoItens")) $("estoqueResumoItens").textContent = String(ativos.length);
    if ($("estoqueResumoZerado")) $("estoqueResumoZerado").textContent = String(zerado);
    if ($("estoqueResumoValor")) $("estoqueResumoValor").textContent = moeda(valor);

    const vendasAtivas = vendasAdmin.filter((v) => v.cancelada !== true);
    const vendasBrutas = vendasAtivas.reduce((s, v) => s + Number(v.valorBruto || 0), 0);
    const resultado = vendasAtivas.reduce((s, v) => s + Number(v.resultadoBarbearia || 0), 0);
    const comissoes = vendasAtivas.reduce((s, v) => s + Number(v.comissaoValor || 0), 0);
    if ($("estoqueAdminVendasBruto")) $("estoqueAdminVendasBruto").textContent = moeda(vendasBrutas);
    if ($("estoqueAdminVendasResultado")) $("estoqueAdminVendasResultado").textContent = moeda(resultado);
    if ($("estoqueAdminVendasComissoes")) $("estoqueAdminVendasComissoes").textContent = moeda(comissoes);
}

function renderizarProdutosAdmin() {
    const container = $("estoqueProdutosLista");
    if (!container) return;
    const lista = listaProdutosFiltrados();
    if (!lista.length) {
        container.innerHTML = '<div class="estoque-vazio"><i class="fas fa-box-open"></i><strong>Nenhum produto encontrado</strong><span>Cadastre um produto ou ajuste o filtro.</span></div>';
        return;
    }

    container.innerHTML = lista.map((produto) => {
        const ativo = produto.ativo !== false;
        const qtd = Number(produto.quantidadeAtual || 0);
        return `
        <details class="estoque-produto-compacto${ativo ? "" : " is-arquivado"}" data-produto-id="${escapar(produto.id)}">
            <summary>
                <span class="estoque-produto-resumo-main"><strong>${escapar(produto.nome)}</strong><small>${escapar(produto.categoria || "Outros")}</small></span>
                <span class="estoque-produto-resumo-side"><strong>${escapar(formatarQuantidadeEstoque(qtd))}</strong><small>${moeda(produto.precoVenda)}</small></span>
                <i class="fas fa-chevron-down"></i>
            </summary>
            <div class="estoque-produto-detalhes">
                <div class="estoque-produto-status-row">${badgeStatus(produto)}<span class="estoque-equipe-badge ${produto.comissaoHabilitada === false ? "is-off" : ""}"><i class="fas fa-users"></i> ${produto.comissaoHabilitada === false ? "Só Admin" : "Equipe"}</span>${produto.codigoBarras ? `<span><i class="fas fa-barcode"></i> ${escapar(produto.codigoBarras)}</span>` : ""}</div>
                <div class="estoque-produto-valores"><span>Custo <b>${moeda(produto.custoUnitario)}</b></span><span>Venda <b>${moeda(produto.precoVenda)}</b></span><span>Quantidade <b>${escapar(formatarQuantidadeEstoque(qtd))}</b></span></div>
                <div class="estoque-produto-acoes">
                    ${ativo && qtd > 0 ? '<button type="button" data-acao="vender"><i class="fas fa-cart-shopping"></i> Vender</button>' : ""}
                    <button type="button" data-acao="editar"><i class="fas fa-pen"></i> Editar</button>
                    ${ativo ? '<button type="button" data-acao="movimentar"><i class="fas fa-arrow-right-arrow-left"></i> Movimentar</button>' : ""}
                    <button type="button" data-acao="status" class="${ativo ? "is-danger" : "is-success"}">${ativo ? "Arquivar" : "Reativar"}</button>
                </div>
            </div>
        </details>`;
    }).join("");
}

function renderizarProdutosVenda() {
    const container = $("estoqueVendaProdutos");
    if (!container) return;
    const lista = listaProdutosFiltrados({ venda: true });
    if (!lista.length) {
        container.innerHTML = '<div class="estoque-vazio"><i class="fas fa-magnifying-glass"></i><strong>Nenhum produto disponível</strong><span>Busque outro produto ou peça ao administrador para conferir o estoque.</span></div>';
        return;
    }
    container.innerHTML = lista.map((produto) => `
        <button type="button" class="estoque-venda-produto" data-produto-id="${escapar(produto.id)}">
            <span><strong>${escapar(produto.nome)}</strong><small>${escapar(formatarQuantidadeEstoque(produto.quantidadeAtual))} disponíveis</small></span>
            <span><strong>${moeda(produto.precoVenda)}</strong><i class="fas fa-chevron-right"></i></span>
        </button>
    `).join("");
}

function vendaCanceladaBadge(venda) {
    return venda.cancelada === true ? '<span class="estoque-venda-cancelada-badge">Cancelada</span>' : "";
}

function renderizarVendasAdmin() {
    const container = $("estoqueVendasLista");
    if (!container) return;
    if (!vendasAdmin.length) {
        container.innerHTML = '<div class="estoque-vazio compact"><strong>Nenhuma venda registrada.</strong></div>';
        return;
    }
    container.innerHTML = vendasAdmin.map((venda) => `
        <article class="estoque-venda-admin-item${venda.cancelada === true ? " is-cancelada" : ""}" data-venda-id="${escapar(venda.id)}">
            <div class="estoque-venda-admin-main">
                <div><strong>${escapar(venda.produtoNomeSnapshot || "Produto")}</strong>${vendaCanceladaBadge(venda)}<span>${dataHora(venda.dataVenda)} • ${Number(venda.quantidade || 0)} un • ${escapar(venda.formaPagamento || "—")}</span></div>
                <div><strong>${moeda(venda.valorBruto)}</strong><span>${venda.gerarComissao ? `Comissão ${moeda(venda.comissaoValor)}` : "Sem comissão"}</span></div>
            </div>
            ${venda.profissionalNomeSnapshot ? `<small class="estoque-venda-profissional"><i class="fas fa-user"></i> ${escapar(venda.profissionalNomeSnapshot)}</small>` : ""}
            ${venda.cancelada === true ? "" : '<div class="estoque-venda-admin-acoes"><button type="button" data-venda-acao="editar"><i class="fas fa-pen"></i> Editar</button><button class="is-danger" type="button" data-venda-acao="cancelar"><i class="fas fa-trash"></i> Excluir</button></div>'}
        </article>
    `).join("");
}

function renderizarMovimentacoes() {
    const container = $("estoqueMovimentacoesLista");
    if (!container) return;
    container.innerHTML = movimentacoes.length ? movimentacoes.map((mov) => {
        const anterior = Number(mov.saldoAnterior || 0);
        const posterior = Number(mov.saldoPosterior || 0);
        const sinal = posterior > anterior ? "+" : posterior < anterior ? "-" : "";
        return `<article class="estoque-log-item"><div><strong>${escapar(mov.produtoNomeSnapshot || "Produto")}</strong><span>${dataHora(mov.dataMovimentacao)} • ${escapar(mov.motivo || "Movimentação")}</span></div><div><strong>${sinal}${formatarQuantidadeEstoque(Math.abs(posterior - anterior) || mov.quantidade || 0)}</strong><span>Saldo ${formatarQuantidadeEstoque(posterior)}</span></div></article>`;
    }).join("") : '<div class="estoque-vazio compact"><strong>Nenhuma movimentação registrada.</strong></div>';
}

function atualizarNavegadorMesVendas() {
    if ($("labelVendasMes")) $("labelVendasMes").textContent = nomeMes(mesVendas);
    const atual = inicioDoMes(new Date());
    if ($("btnVendasMesProximo")) {
        const bloqueado = mesVendas >= atual;
        $("btnVendasMesProximo").disabled = bloqueado;
        $("btnVendasMesProximo").setAttribute("aria-disabled", String(bloqueado));
    }
}

function renderizarMinhasVendas() {
    const container = $("estoqueMinhasVendasLista");
    const ativas = vendasProfissional.filter((v) => v.cancelada !== true);
    const bruto = ativas.reduce((s, v) => s + Number(v.valorBruto || 0), 0);
    const comissao = ativas.reduce((s, v) => s + Number(v.comissaoValor || 0), 0);
    if ($("estoqueVendaMes")) $("estoqueVendaMes").textContent = moeda(bruto);
    if ($("estoqueComissaoMes")) $("estoqueComissaoMes").textContent = moeda(comissao);
    if (!container) return;
    if (!ativas.length) {
        container.innerHTML = '<div class="estoque-vazio compact"><strong>Nenhuma venda neste mês.</strong><span>Suas vendas aparecerão aqui.</span></div>';
        return;
    }

    const porDia = new Map();
    ativas.forEach((venda) => {
        const data = paraDate(venda.dataVenda);
        if (!data) return;
        const chave = chaveData(data);
        if (!porDia.has(chave)) porDia.set(chave, { data, itens: [] });
        porDia.get(chave).itens.push(venda);
    });

    container.innerHTML = [...porDia.values()].sort((a, b) => b.data - a.data).map(({ data, itens }) => {
        const total = itens.reduce((s, v) => s + Number(v.valorBruto || 0), 0);
        const com = itens.reduce((s, v) => s + Number(v.comissaoValor || 0), 0);
        const titulo = data.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" }).replace(".", "");
        return `<details class="estoque-vendas-dia">
            <summary><div><strong>${escapar(titulo)}</strong><span>${itens.length} venda${itens.length === 1 ? "" : "s"}</span></div><div><strong>${moeda(total)}</strong><span>Comissão ${moeda(com)}</span></div><i class="fas fa-chevron-down"></i></summary>
            <div class="estoque-vendas-dia-lista">${itens.map((v) => `<div class="estoque-venda-dia-item"><div><strong>${escapar(v.produtoNomeSnapshot || "Produto")}</strong><span>${hora(v.dataVenda)} • ${Number(v.quantidade || 0)} un • ${escapar(v.formaPagamento || "—")}</span></div><div><strong>${moeda(v.valorBruto)}</strong><span>+ ${moeda(v.comissaoValor)} comissão</span></div></div>`).join("")}</div>
        </details>`;
    }).join("");
}

async function carregarProdutos({ forcar = false } = {}) {
    produtos = await listarProdutosEstoque({ forcar, somenteAtivos: !podeAdministrarNaVisaoAtual() });
    atualizarResumoAdmin();
    renderizarProdutosAdmin();
    renderizarProdutosVenda();
}

async function carregarAdmin({ forcar = false } = {}) {
    const hoje = new Date();
    [vendasAdmin, movimentacoes] = await Promise.all([
        listarVendasPorPeriodo(inicioDoMes(hoje), hoje, { forcar, incluirCanceladas: true }),
        listarMovimentacoesRecentes({ max: 100, forcar })
    ]);
    atualizarResumoAdmin();
    renderizarVendasAdmin();
    renderizarMovimentacoes();
}

async function carregarVendasProfissional({ forcar = false } = {}) {
    atualizarNavegadorMesVendas();
    vendasProfissional = await listarVendasPorPeriodo(
        mesVendas,
        fimDoMes(mesVendas),
        { profissionalUid: state.user?.uid || null, forcar, incluirCanceladas: false }
    );
    renderizarMinhasVendas();
}

async function carregarDados({ forcar = false } = {}) {
    const tarefas = [carregarProdutos({ forcar })];
    if (podeAdministrarNaVisaoAtual()) tarefas.push(carregarAdmin({ forcar }));
    else tarefas.push(carregarVendasProfissional({ forcar }));
    await Promise.all(tarefas);
}

export async function abrirEstoque() {
    configurarVisao();
    try {
        await carregarDados({ forcar: false });
    } catch (error) {
        console.error(error);
        mostrarErro(error?.message || "Não foi possível carregar estoque e vendas.");
    }
}

function limparProdutoForm() {
    produtoEmEdicao = null;
    $("formProdutoEstoque")?.reset();
    preencherSelect($("estoqueProdutoCategoria"), CATEGORIAS_ESTOQUE, "Uso profissional");
    if ($("estoqueProdutoQuantidadeInicial")) $("estoqueProdutoQuantidadeInicial").value = "0";
    if ($("estoqueProdutoCusto")) $("estoqueProdutoCusto").value = "";
    if ($("estoqueProdutoPrecoVenda")) $("estoqueProdutoPrecoVenda").value = "";
    if ($("estoqueProdutoComissao")) $("estoqueProdutoComissao").checked = true;
    if ($("tituloModalProdutoEstoque")) $("tituloModalProdutoEstoque").textContent = "Novo produto";
}

function abrirProdutoForm(produto = null) {
    if (!podeAdministrarNaVisaoAtual()) return;
    limparProdutoForm();
    if (produto) {
        produtoEmEdicao = produto;
        $("tituloModalProdutoEstoque").textContent = "Editar produto";
        $("estoqueProdutoNome").value = produto.nome || "";
        $("estoqueProdutoCategoria").value = CATEGORIAS_ESTOQUE.includes(produto.categoria) ? produto.categoria : "Outros";
        $("estoqueProdutoCodigo").value = produto.codigoBarras || "";
        $("estoqueProdutoQuantidadeInicial").value = Number(produto.quantidadeAtual || 0);
        $("estoqueProdutoCusto").value = formatarValorInput(produto.custoUnitario || 0);
        $("estoqueProdutoPrecoVenda").value = formatarValorInput(produto.precoVenda || 0);
        if ($("estoqueProdutoComissao")) $("estoqueProdutoComissao").checked = produto.comissaoHabilitada !== false;
    }
    setModal("modalProdutoEstoque", true);
}

async function salvarProduto(event) {
    event.preventDefault();
    const btn = $("btnSalvarProdutoEstoque");
    const dados = {
        nome: $("estoqueProdutoNome")?.value,
        categoria: $("estoqueProdutoCategoria")?.value,
        codigoBarras: $("estoqueProdutoCodigo")?.value,
        quantidadeAtual: Number($("estoqueProdutoQuantidadeInicial")?.value || 0),
        custoUnitario: converterParaNumero($("estoqueProdutoCusto")?.value) || 0,
        precoVenda: converterParaNumero($("estoqueProdutoPrecoVenda")?.value) || 0,
        comissaoHabilitada: $("estoqueProdutoComissao")?.checked !== false
    };
    const editando = Boolean(produtoEmEdicao);
    iniciarAcaoBotao(btn, editando ? "Salvando..." : "Cadastrando...");
    try {
        if (editando) await atualizarProdutoEstoque(produtoEmEdicao.id, dados);
        else await criarProdutoEstoque(dados);
        await concluirAcaoBotao(btn, editando ? "Atualizado ✓" : "Cadastrado ✓", 360);
        setModal("modalProdutoEstoque", false);
        mostrarSucesso(editando ? "Produto atualizado." : "Produto cadastrado.");
        void carregarDados({ forcar: true }).catch((error) => console.warn("Atualização após salvar produto:", error));
    } catch (error) {
        console.error(error);
        mostrarErro(error?.message || "Não foi possível salvar o produto.");
    } finally {
        restaurarAcaoBotao(btn);
    }
}

function abrirMovimentacao(produto) {
    produtoMovimentacao = produto;
    $("movEstoqueProdutoNome").textContent = produto.nome || "Produto";
    $("movEstoqueSaldoAtual").textContent = formatarQuantidadeEstoque(produto.quantidadeAtual);
    $("movEstoqueTipo").value = "entrada";
    $("movEstoqueQuantidade").value = "1";
    $("movEstoqueNovoSaldo").value = Number(produto.quantidadeAtual || 0);
    $("movEstoqueMotivo").value = "Compra";
    $("movEstoqueCusto").value = formatarValorInput(produto.custoUnitario || 0);
    $("movEstoqueGerarDespesa").checked = false;
    $("movEstoqueDespesaOpcoes").hidden = true;
    $("movEstoqueParcelada").checked = false;
    $("movEstoqueParcelasField").hidden = true;
    atualizarCamposMovimentacao();
    setModal("modalMovimentarEstoque", true);
}

function atualizarCamposMovimentacao() {
    const tipo = $("movEstoqueTipo")?.value || "entrada";
    $("movEstoqueQuantidadeField").hidden = tipo === "ajuste";
    $("movEstoqueNovoSaldoField").hidden = tipo !== "ajuste";
    $("movEstoqueCustoField").hidden = tipo !== "entrada";
    $("movEstoqueGerarDespesaField").hidden = tipo !== "entrada";
    if (tipo !== "entrada") $("movEstoqueDespesaOpcoes").hidden = true;
}

function gerarParcelas(valorTotal, quantidade, dataInicial = new Date()) {
    const total = Math.round(Number(valorTotal || 0) * 100);
    const qtd = Math.max(2, Math.min(36, Number(quantidade || 2)));
    const base = Math.floor(total / qtd);
    const resto = total - base * qtd;
    const dia = dataInicial.getDate();
    return Array.from({ length: qtd }, (_, indice) => {
        const alvo = new Date(dataInicial.getFullYear(), dataInicial.getMonth() + indice, 1);
        const ultimo = new Date(alvo.getFullYear(), alvo.getMonth() + 1, 0).getDate();
        alvo.setDate(Math.min(dia, ultimo));
        return { data: alvo, valor: (base + (indice === qtd - 1 ? resto : 0)) / 100 };
    });
}

async function salvarMovimentacao(event) {
    event.preventDefault();
    if (!produtoMovimentacao) return;
    const btn = $("btnSalvarMovimentacaoEstoque");
    const tipo = $("movEstoqueTipo").value;
    const quantidade = Number($("movEstoqueQuantidade").value || 0);
    const novoSaldo = Number($("movEstoqueNovoSaldo").value || 0);
    const custo = converterParaNumero($("movEstoqueCusto").value);
    const gerarDespesa = tipo === "entrada" && $("movEstoqueGerarDespesa").checked;
    const parcelada = gerarDespesa && $("movEstoqueParcelada").checked;
    const parcelasQtd = Math.max(2, Math.min(36, Number($("movEstoqueParcelas").value || 2)));
    const totalCompra = Number((quantidade * Number(custo || 0)).toFixed(2));
    if (tipo !== "ajuste" && quantidade <= 0) return mostrarErro("Informe a quantidade da movimentação.");
    if (gerarDespesa && totalCompra <= 0) return mostrarErro("Informe o custo por produto para gerar a despesa.");

    iniciarAcaoBotao(btn, gerarDespesa ? "Atualizando e lançando despesa..." : "Atualizando...");
    try {
        await movimentarEstoque({
            produtoId: produtoMovimentacao.id,
            tipo,
            quantidade,
            novoSaldo,
            motivo: $("movEstoqueMotivo").value,
            custoUnitario: tipo === "entrada" ? custo : null
        });
        if (gerarDespesa) {
            const descricao = `Compra de estoque • ${produtoMovimentacao.nome}`;
            if (parcelada) {
                await criarDespesaParcelada({ parcelas: gerarParcelas(totalCompra, parcelasQtd), categoria: "Produtos", descricao, valorTotal: totalCompra, tipo: "barbearia" });
            } else {
                await criarDespesa({ data: new Date(), categoria: "Produtos", descricao, valor: totalCompra, tipo: "barbearia" });
            }
        }
        await concluirAcaoBotao(btn, "Atualizado ✓", 360);
        setModal("modalMovimentarEstoque", false);
        mostrarSucesso(gerarDespesa ? "Estoque e despesa atualizados." : "Estoque atualizado.");
        void carregarDados({ forcar: true }).catch((error) => console.warn("Atualização após movimentação:", error));
    } catch (error) {
        console.error(error);
        mostrarErro(error?.message || "Não foi possível atualizar o estoque.");
    } finally {
        restaurarAcaoBotao(btn);
    }
}

function pagamentoAtual() {
    return $("vendaProdutoPagamento")?.value || "Pix";
}

function selecionarPagamentoVenda(valor) {
    if (!FORMAS_PAGAMENTO_VENDA.includes(valor)) valor = "Pix";
    if ($("vendaProdutoPagamento")) $("vendaProdutoPagamento").value = valor;
    $("vendaProdutoPagamentos")?.querySelectorAll("button[data-pagamento]").forEach((btn) => {
        const ativo = btn.dataset.pagamento === valor;
        btn.classList.toggle("active", ativo);
        btn.setAttribute("aria-pressed", String(ativo));
    });
    atualizarPreviewVenda();
}

function renderizarPagamentosVenda(valorAtual = "Pix") {
    const container = $("vendaProdutoPagamentos");
    if (!container) return;
    const icones = { Pix: "fa-qrcode", Dinheiro: "fa-money-bill-wave", "Débito": "fa-credit-card", "Crédito": "fa-credit-card" };
    container.innerHTML = FORMAS_PAGAMENTO_VENDA.map((nome) => `<button type="button" data-pagamento="${escapar(nome)}"><i class="fas ${icones[nome] || "fa-wallet"}"></i>${escapar(nome)}</button>`).join("");
    selecionarPagamentoVenda(valorAtual);
}

async function preencherProfissionaisVenda(valorAtual = null, semComissao = false) {
    const select = $("vendaProfissional");
    if (!select) return;
    const admin = podeAdministrarNaVisaoAtual();
    if (!admin) {
        select.innerHTML = `<option value="${escapar(state.user?.uid || "")}">${escapar(state.membroAtual?.nome || state.perfilUsuario?.nome || "Meu perfil")}</option>`;
        select.value = state.user?.uid || "";
        $("vendaProfissionalField").hidden = true;
        return;
    }
    const disponivelEquipe = produtoVenda?.comissaoHabilitada !== false;
    const membros = disponivelEquipe ? await listarProfissionaisParaVenda() : [];
    select.innerHTML = '<option value="__sem_comissao__">Sem comissão</option>' + membros.map((m) => `<option value="${escapar(m.uid || m.id)}">${escapar(m.nome || m.email || "Profissional")}</option>`).join("");
    $("vendaProfissionalField").hidden = !disponivelEquipe;
    const desejado = (!disponivelEquipe || semComissao) ? "__sem_comissao__" : (valorAtual || state.user?.uid || "__sem_comissao__");
    select.value = [...select.options].some((op) => op.value === desejado) ? desejado : "__sem_comissao__";
}

function qtdVendaMaxima() {
    if (!produtoVenda) return 1;
    const atual = Number(produtoVenda.quantidadeAtual || 0);
    return vendaEmEdicao ? atual + Number(vendaEmEdicao.quantidade || 0) : atual;
}

function ajustarQtdVenda(delta) {
    const input = $("vendaProdutoQuantidade");
    if (!input) return;
    const max = Math.max(1, Math.floor(qtdVendaMaxima()));
    const atual = Math.max(1, Number(input.value || 1));
    input.value = String(Math.min(max, Math.max(1, atual + delta)));
    atualizarPreviewVenda();
}

function calcularPreviewVenda() {
    if (!produtoVenda) return null;
    const admin = podeAdministrarNaVisaoAtual();
    const valorSelect = $("vendaProfissional")?.value;
    const disponivelEquipe = produtoVenda.comissaoHabilitada !== false;
    const gerarComissao = disponivelEquipe && (admin ? valorSelect !== "__sem_comissao__" : true);
    return calcularVendaProduto({
        produto: { ...produtoVenda, precoVenda: Number(vendaEmEdicao?.precoUnitarioSnapshot ?? produtoVenda.precoVenda) },
        quantidade: Math.max(1, Number($("vendaProdutoQuantidade")?.value || 1)),
        formaPagamento: pagamentoAtual(),
        gerarComissao,
        comissaoPct: Number(state.configSistema?.comissaoProdutosPct ?? 20),
        configVenda: state.configSistema
    });
}

function atualizarPreviewVenda() {
    const calculo = calcularPreviewVenda();
    if (!calculo) return;
    $("vendaProdutoTotal").textContent = moeda(calculo.valorBruto);
    const temTaxa = Number(calculo.taxaPagamentoValor || 0) > 0;
    $("vendaTaxaResumo").hidden = !temTaxa;
    $("vendaTaxaPct").textContent = `${Number(calculo.taxaPagamentoPct || 0).toFixed(2).replace(".", ",")}%`;
    $("vendaTaxaValor").textContent = `- ${moeda(calculo.taxaPagamentoValor)}`;
    const temComissao = Number(calculo.comissaoValor || 0) > 0;
    $("vendaComissaoResumo").hidden = !temComissao;
    $("vendaComissaoPct").textContent = `${Number(calculo.comissaoPct || 0).toFixed(2).replace(".", ",")}%`;
    $("vendaComissaoValor").textContent = moeda(calculo.comissaoValor);
}

async function abrirVenda(produto, venda = null) {
    if (!podeAdministrarNaVisaoAtual() && produto?.comissaoHabilitada === false) {
        mostrarErro("Este produto está disponível somente para venda administrativa.");
        return;
    }
    produtoVenda = produto;
    vendaEmEdicao = venda;
    $("tituloVendaProduto").textContent = venda ? "Editar venda" : "Registrar venda";
    $("subtituloVendaProduto").textContent = venda
        ? "Ajuste quantidade, pagamento ou comissão."
        : (produto.comissaoHabilitada === false ? "Venda administrativa sem comissão." : "Confirme quantidade e pagamento.");
    $("btnRegistrarVendaProduto").textContent = venda ? "Salvar alterações" : "Registrar venda";
    $("vendaProdutoNome").textContent = produto.nome || venda?.produtoNomeSnapshot || "Produto";
    $("vendaProdutoPreco").textContent = moeda(venda?.precoUnitarioSnapshot ?? produto.precoVenda);
    $("vendaProdutoEstoque").textContent = `${formatarQuantidadeEstoque(qtdVendaMaxima())} disponíveis`;
    $("vendaProdutoQuantidade").value = String(Math.max(1, Number(venda?.quantidade || 1)));
    await preencherProfissionaisVenda(venda?.profissionalUid || null, venda ? venda.gerarComissao !== true : false);
    renderizarPagamentosVenda(venda?.formaPagamento || "Pix");
    atualizarPreviewVenda();
    setModal("modalVendaProduto", true);
}

async function salvarVenda(event) {
    event.preventDefault();
    if (!produtoVenda) return;
    const admin = podeAdministrarNaVisaoAtual();
    const selecionado = $("vendaProfissional")?.value;
    const disponivelEquipe = produtoVenda.comissaoHabilitada !== false;
    const gerarComissao = disponivelEquipe && (admin ? selecionado !== "__sem_comissao__" : true);
    const profissionalUid = gerarComissao ? (admin ? selecionado : state.user?.uid) : null;
    const quantidade = Math.max(1, Number($("vendaProdutoQuantidade")?.value || 1));
    if (quantidade > qtdVendaMaxima()) return mostrarErro("Quantidade maior que o estoque disponível.");
    const btn = $("btnRegistrarVendaProduto");
    iniciarAcaoBotao(btn, vendaEmEdicao ? "Salvando..." : "Registrando venda...");
    try {
        if (vendaEmEdicao) {
            await editarVendaProduto(vendaEmEdicao.id, { quantidade, formaPagamento: pagamentoAtual(), gerarComissao, profissionalUid });
            await concluirAcaoBotao(btn, "Venda atualizada ✓", 360);
            mostrarSucesso("Venda atualizada.");
        } else {
            const venda = await registrarVendaProduto({ produtoId: produtoVenda.id, quantidade, formaPagamento: pagamentoAtual(), gerarComissao, profissionalUid });
            await concluirAcaoBotao(btn, "Venda registrada ✓", 360);
            mostrarSucesso(venda.gerarComissao ? `Venda registrada • comissão ${moeda(venda.comissaoValor)}.` : "Venda registrada.");
        }
        setModal("modalVendaProduto", false);
        void carregarDados({ forcar: true }).catch((error) => console.warn("Atualização de estoque após venda:", error));
    } catch (error) {
        console.error(error);
        mostrarErro(error?.message || "Não foi possível salvar a venda.");
    } finally {
        restaurarAcaoBotao(btn);
        vendaEmEdicao = null;
    }
}

function abrirConfirmacaoCancelarVenda(venda) {
    vendaParaCancelar = venda;
    if ($("cancelarVendaDescricao")) $("cancelarVendaDescricao").textContent = `Excluir a venda de ${venda.produtoNomeSnapshot || "produto"} no valor de ${moeda(venda.valorBruto)}? A quantidade voltará para o estoque.`;
    $("modalCancelarVenda")?.classList.add("active");
    $("modalCancelarVenda")?.setAttribute("aria-hidden", "false");
}

function fecharConfirmacaoCancelarVenda() {
    vendaParaCancelar = null;
    $("modalCancelarVenda")?.classList.remove("active");
    $("modalCancelarVenda")?.setAttribute("aria-hidden", "true");
}

async function confirmarCancelarVenda() {
    if (!vendaParaCancelar) return;
    const btn = $("btnConfirmarExclusaoVenda");
    iniciarAcaoBotao(btn, "Excluindo...");
    try {
        await cancelarVendaProduto(vendaParaCancelar.id);
        await concluirAcaoBotao(btn, "Venda excluída ✓", 360);
        fecharConfirmacaoCancelarVenda();
        mostrarSucesso("Venda excluída e quantidade devolvida ao estoque.");
        void carregarDados({ forcar: true }).catch((error) => console.warn("Atualização após exclusão de venda:", error));
    } catch (error) {
        console.error(error);
        mostrarErro(error?.message || "Não foi possível excluir a venda.");
    } finally {
        restaurarAcaoBotao(btn);
    }
}

async function procurarCodigoVenda(codigo) {
    const produto = await localizarProdutoPorCodigo(codigo);
    if (!produto || produto.ativo === false) return mostrarErro("Produto não encontrado ou arquivado.");
    if (!podeAdministrarNaVisaoAtual() && produto.comissaoHabilitada === false) return mostrarErro("Este produto está disponível somente para venda administrativa.");
    if (Number(produto.quantidadeAtual || 0) <= 0) return mostrarErro("Este produto está sem estoque.");
    await abrirVenda(produto);
}

async function iniciarScanner(destino) {
    scannerDestino = destino;
    setModal("modalScannerEstoque", true);
    const status = $("scannerEstoqueStatus");
    const video = $("scannerEstoqueVideo");
    if (status) status.textContent = "Solicitando acesso à câmera...";
    try {
        await garantirZXing();
        if (!window.ZXingBrowser?.BrowserMultiFormatReader) throw new Error("Leitor indisponível. Digite ou busque manualmente.");
        scannerAtivo = true;
        const reader = new window.ZXingBrowser.BrowserMultiFormatReader();
        scannerControls = await reader.decodeFromConstraints({ video: { facingMode: { ideal: "environment" } }, audio: false }, video, async (resultado) => {
            if (!scannerAtivo || !resultado) return;
            const codigo = normalizarCodigoBarras(resultado.getText?.() || resultado.text || "");
            if (!codigo) return;
            fecharScanner();
            if (scannerDestino === "produto") {
                $("estoqueProdutoCodigo").value = codigo;
                mostrarSucesso("Código de barras lido.");
            } else await procurarCodigoVenda(codigo);
        });
        if (status) status.textContent = "Aponte a câmera para o código de barras.";
    } catch (error) {
        console.error(error);
        if (status) status.textContent = error?.message || "Não foi possível abrir a câmera.";
    }
}

function fecharScanner() {
    scannerAtivo = false;
    try { scannerControls?.stop?.(); } catch (_) {}
    scannerControls = null;
    const video = $("scannerEstoqueVideo");
    if (video?.srcObject) {
        video.srcObject.getTracks?.().forEach((track) => track.stop());
        video.srcObject = null;
    }
    setModal("modalScannerEstoque", false);
}

async function mudarMesVendas(delta) {
    const alvo = somarMeses(mesVendas, delta);
    if (alvo > inicioDoMes(new Date())) return;
    mesVendas = alvo;
    const loading = iniciarLoadingTela("Carregando vendas...", { delay: 420 });
    try { await carregarVendasProfissional({ forcar: false }); }
    catch (error) { mostrarErro(error?.message || "Não foi possível carregar as vendas do mês."); }
    finally { finalizarLoadingTela(loading); }
}

function vincularEventos() {
    $("btnNovoProdutoEstoque")?.addEventListener("click", () => abrirProdutoForm());
    $("btnFecharProdutoEstoque")?.addEventListener("click", () => setModal("modalProdutoEstoque", false));
    $("btnCancelarProdutoEstoque")?.addEventListener("click", () => setModal("modalProdutoEstoque", false));
    $("formProdutoEstoque")?.addEventListener("submit", salvarProduto);
    [$("estoqueProdutoCusto"), $("estoqueProdutoPrecoVenda"), $("movEstoqueCusto")].forEach((input) => input?.addEventListener("input", () => aplicarMascaraMoedaInput(input, 9)));
    $("btnScanCodigoProduto")?.addEventListener("click", () => iniciarScanner("produto"));
    $("btnScanVendaProduto")?.addEventListener("click", () => iniciarScanner("venda"));
    $("btnScanVendaProdutoAdmin")?.addEventListener("click", () => iniciarScanner("venda"));
    $("btnFecharScannerEstoque")?.addEventListener("click", fecharScanner);

    document.querySelectorAll("[data-estoque-admin-tab]").forEach((btn) => btn.addEventListener("click", () => selecionarAbaEstoque(btn.dataset.estoqueAdminTab, { admin: true })));
    document.querySelectorAll("[data-estoque-pro-tab]").forEach((btn) => btn.addEventListener("click", () => selecionarAbaEstoque(btn.dataset.estoqueProTab, { admin: false })));

    $("estoqueBusca")?.addEventListener("input", renderizarProdutosAdmin);
    $("estoqueVendaBusca")?.addEventListener("input", renderizarProdutosVenda);
    document.querySelectorAll("[data-estoque-filtro]").forEach((btn) => btn.addEventListener("click", () => {
        filtroStatus = btn.dataset.estoqueFiltro || "todos";
        document.querySelectorAll("[data-estoque-filtro]").forEach((item) => item.classList.toggle("active", item === btn));
        renderizarProdutosAdmin();
    }));

    $("estoqueProdutosLista")?.addEventListener("click", async (event) => {
        const card = event.target.closest("[data-produto-id]");
        const acao = event.target.closest("[data-acao]")?.dataset.acao;
        if (!card || !acao) return;
        event.preventDefault();
        const produto = produtos.find((item) => item.id === card.dataset.produtoId);
        if (!produto) return;
        if (acao === "editar") abrirProdutoForm(produto);
        if (acao === "movimentar") abrirMovimentacao(produto);
        if (acao === "vender") await abrirVenda(produto);
        if (acao === "status") {
            const loading = iniciarLoadingTela(produto.ativo === false ? "Reativando produto..." : "Arquivando produto...", { delay: 420 });
            try {
                await definirStatusProduto(produto.id, produto.ativo === false);
                mostrarSucesso(produto.ativo === false ? "Produto reativado." : "Produto arquivado.");
                void carregarDados({ forcar: true }).catch((error) => console.warn("Atualização após status do produto:", error));
            } catch (error) { mostrarErro(error?.message || "Não foi possível alterar o produto."); }
            finally { finalizarLoadingTela(loading); }
        }
    });

    $("estoqueVendaProdutos")?.addEventListener("click", async (event) => {
        const item = event.target.closest("[data-produto-id]");
        if (!item) return;
        const produto = produtos.find((p) => p.id === item.dataset.produtoId);
        if (produto) await abrirVenda(produto);
    });

    $("estoqueVendasLista")?.addEventListener("click", async (event) => {
        const item = event.target.closest("[data-venda-id]");
        const acao = event.target.closest("[data-venda-acao]")?.dataset.vendaAcao;
        if (!item || !acao) return;
        const venda = vendasAdmin.find((v) => v.id === item.dataset.vendaId);
        if (!venda || venda.cancelada === true) return;
        if (acao === "cancelar") return abrirConfirmacaoCancelarVenda(venda);
        if (acao === "editar") {
            let produto = produtos.find((p) => p.id === venda.produtoId);
            if (!produto) produto = { id: venda.produtoId, nome: venda.produtoNomeSnapshot, precoVenda: venda.precoUnitarioSnapshot, quantidadeAtual: 0, ativo: true };
            await abrirVenda(produto, venda);
        }
    });

    $("btnCancelarExclusaoVenda")?.addEventListener("click", fecharConfirmacaoCancelarVenda);
    $("btnConfirmarExclusaoVenda")?.addEventListener("click", confirmarCancelarVenda);
    $("modalCancelarVenda")?.addEventListener("click", (event) => { if (event.target === $("modalCancelarVenda")) fecharConfirmacaoCancelarVenda(); });

    $("formMovimentarEstoque")?.addEventListener("submit", salvarMovimentacao);
    $("btnFecharMovEstoque")?.addEventListener("click", () => setModal("modalMovimentarEstoque", false));
    $("btnCancelarMovEstoque")?.addEventListener("click", () => setModal("modalMovimentarEstoque", false));
    $("movEstoqueTipo")?.addEventListener("change", atualizarCamposMovimentacao);
    $("movEstoqueGerarDespesa")?.addEventListener("change", () => { $("movEstoqueDespesaOpcoes").hidden = !$("movEstoqueGerarDespesa").checked; });
    $("movEstoqueParcelada")?.addEventListener("change", () => { $("movEstoqueParcelasField").hidden = !$("movEstoqueParcelada").checked; });

    $("formVendaProduto")?.addEventListener("submit", salvarVenda);
    $("btnFecharVendaProduto")?.addEventListener("click", () => setModal("modalVendaProduto", false));
    $("btnCancelarVendaProduto")?.addEventListener("click", () => setModal("modalVendaProduto", false));
    $("btnVendaQtdMenos")?.addEventListener("click", () => ajustarQtdVenda(-1));
    $("btnVendaQtdMais")?.addEventListener("click", () => ajustarQtdVenda(1));
    $("vendaProdutoQuantidade")?.addEventListener("input", atualizarPreviewVenda);
    $("vendaProfissional")?.addEventListener("change", atualizarPreviewVenda);
    $("vendaProdutoPagamentos")?.addEventListener("click", (event) => {
        const btn = event.target.closest("button[data-pagamento]");
        if (btn) selecionarPagamentoVenda(btn.dataset.pagamento);
    });

    $("btnVendasMesAnterior")?.addEventListener("click", () => mudarMesVendas(-1));
    $("btnVendasMesProximo")?.addEventListener("click", () => mudarMesVendas(1));
}

export function initEstoque() {
    if (inicializado) return;
    inicializado = true;
    configurarVisao();
    preencherSelect($("estoqueProdutoCategoria"), CATEGORIAS_ESTOQUE, "Uso profissional");
    renderizarPagamentosVenda("Pix");
    atualizarNavegadorMesVendas();
    vincularEventos();
    onStateChange("configSistema", () => {
        if (!$("modalVendaProduto")?.hidden) atualizarPreviewVenda();
    });
}
