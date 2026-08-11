import { state, onStateChange, definirConfiguracoes } from "./state.js?v=9.4";
import { podeAdministrarNaVisaoAtual, visaoEhProfissional } from "./permissoes.js?v=9.4";
import { formatarMoeda, converterParaNumero, aplicarMascaraMoedaInput, formatarValorInput } from "./utils/money.js?v=9.4";
import { paraDate, chaveData } from "./utils/date.js?v=9.4";
import { mostrarErro, mostrarSucesso } from "./services/feedback-service.js?v=9.4";
import {
    iniciarAcaoBotao,
    concluirAcaoBotao,
    restaurarAcaoBotao,
    iniciarLoadingTela,
    finalizarLoadingTela
} from "./services/ui-loading-service.js?v=9.4";
import { garantirZXing } from "./services/external-assets.js?v=9.4";
import {
    CATEGORIAS_ESTOQUE,
    UNIDADES_ESTOQUE,
    FORMAS_PAGAMENTO_VENDA,
    calcularVendaProduto,
    formatarQuantidadeEstoque,
    normalizarCodigoBarras,
    statusEstoque
} from "./services/estoque-service.js?v=9.4";
import {
    atualizarProdutoEstoque,
    criarProdutoEstoque,
    definirStatusProduto,
    invalidarCacheEstoque,
    listarMovimentacoesRecentes,
    listarProdutosEstoque,
    listarProfissionaisParaVenda,
    listarVendasRecentes,
    localizarProdutoPorCodigo,
    movimentarEstoque,
    registrarVendaProduto
} from "./data/estoque-repository.js?v=9.4";
import { criarDespesa, criarDespesaParcelada } from "./data/despesas-repository.js?v=9.4";
import { carregarConfiguracoesDoBanco } from "./data/configuracoes-repository.js?v=9.4";

let inicializado = false;
let produtos = [];
let vendas = [];
let movimentacoes = [];
let produtoEmEdicao = null;
let produtoMovimentacao = null;
let produtoVenda = null;
let filtroStatus = "todos";
let abaAdmin = "produtos";
let scannerControls = null;
let scannerDestino = null;
let scannerAtivo = false;

const $ = (id) => document.getElementById(id);

function moeda(valor) {
    return `R$ ${formatarMoeda(Number(valor || 0))}`;
}

function escapar(texto) {
    return String(texto ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;");
}

function nomeAtual() {
    return String(state.membroAtual?.nome || state.perfilUsuario?.nome || state.user?.email || "Profissional");
}

function dataHora(valor) {
    const data = paraDate(valor);
    if (!data) return "—";
    return data.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
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

function atualizarResumoAdmin() {
    const ativos = produtos.filter((p) => p.ativo !== false);
    const baixo = ativos.filter((p) => statusEstoque(p) === "baixo").length;
    const zerado = ativos.filter((p) => statusEstoque(p) === "zerado").length;
    const valor = ativos.reduce((s, p) => s + Number(p.quantidadeAtual || 0) * Number(p.custoUnitario || 0), 0);
    if ($("estoqueResumoItens")) $("estoqueResumoItens").textContent = String(ativos.length);
    if ($("estoqueResumoBaixo")) $("estoqueResumoBaixo").textContent = String(baixo);
    if ($("estoqueResumoZerado")) $("estoqueResumoZerado").textContent = String(zerado);
    if ($("estoqueResumoValor")) $("estoqueResumoValor").textContent = moeda(valor);
}

function listaProdutosFiltrados({ venda = false } = {}) {
    const busca = String((venda ? $("estoqueVendaBusca") : $("estoqueBusca"))?.value || "").trim().toLowerCase();
    return produtos.filter((produto) => {
        if (produto.ativo === false) return !venda && filtroStatus === "todos";
        if (venda && (produto.vendavel !== true || Number(produto.quantidadeAtual || 0) <= 0)) return false;
        if (!venda && filtroStatus !== "todos" && statusEstoque(produto) !== filtroStatus) return false;
        if (!busca) return true;
        const alvo = `${produto.nome || ""} ${produto.categoria || ""} ${produto.codigoBarras || ""}`.toLowerCase();
        return alvo.includes(busca);
    });
}

function badgeStatus(produto) {
    if (produto.ativo === false) return '<span class="estoque-badge is-inativo">Inativo</span>';
    const status = statusEstoque(produto);
    if (status === "zerado") return '<span class="estoque-badge is-danger">Sem estoque</span>';
    if (status === "baixo") return '<span class="estoque-badge is-warning">Estoque baixo</span>';
    return '<span class="estoque-badge is-ok">Em estoque</span>';
}

function renderizarProdutosAdmin() {
    const container = $("estoqueProdutosLista");
    if (!container) return;
    const lista = listaProdutosFiltrados();
    if (!lista.length) {
        container.innerHTML = '<div class="estoque-vazio"><i class="fas fa-box-open"></i><strong>Nenhum produto encontrado</strong><span>Cadastre um item ou ajuste os filtros.</span></div>';
        return;
    }

    container.innerHTML = lista.map((produto) => `
        <article class="estoque-produto-card" data-produto-id="${escapar(produto.id)}">
            <div class="estoque-produto-top">
                <div class="estoque-produto-copy">
                    <div class="estoque-produto-title-row"><strong>${escapar(produto.nome)}</strong>${badgeStatus(produto)}</div>
                    <span>${escapar(produto.categoria || "Outros")} • ${escapar(produto.unidade || "un")}${produto.codigoBarras ? ` • ${escapar(produto.codigoBarras)}` : ""}</span>
                </div>
                <strong class="estoque-produto-qtd">${escapar(formatarQuantidadeEstoque(produto.quantidadeAtual, produto.unidade))}</strong>
            </div>
            <div class="estoque-produto-metas">
                <span>Mínimo <b>${escapar(formatarQuantidadeEstoque(produto.estoqueMinimo, produto.unidade))}</b></span>
                <span>Custo <b>${moeda(produto.custoUnitario)}</b></span>
                <span>${produto.vendavel === true ? `Venda <b>${moeda(produto.precoVenda)}</b>` : "Uso interno"}</span>
            </div>
            <div class="estoque-produto-acoes">
                ${produto.vendavel === true && produto.ativo !== false ? '<button type="button" data-acao="vender"><i class="fas fa-cart-shopping"></i> Vender</button>' : ""}
                <button type="button" data-acao="movimentar"><i class="fas fa-arrow-right-arrow-left"></i> Movimentar</button>
                <button type="button" data-acao="editar"><i class="fas fa-pen"></i> Editar</button>
                <button type="button" data-acao="status" class="${produto.ativo === false ? "is-success" : "is-danger"}">${produto.ativo === false ? "Ativar" : "Desativar"}</button>
            </div>
        </article>
    `).join("");
}

function renderizarProdutosVenda() {
    const container = $("estoqueVendaProdutos");
    if (!container) return;
    const lista = listaProdutosFiltrados({ venda: true });
    if (!lista.length) {
        container.innerHTML = '<div class="estoque-vazio"><i class="fas fa-magnifying-glass"></i><strong>Nenhum produto disponível</strong><span>Busque pelo nome ou use o leitor de código de barras.</span></div>';
        return;
    }
    container.innerHTML = lista.map((produto) => `
        <button type="button" class="estoque-venda-produto" data-produto-id="${escapar(produto.id)}">
            <span><strong>${escapar(produto.nome)}</strong><small>${escapar(produto.categoria || "Outros")} • ${escapar(formatarQuantidadeEstoque(produto.quantidadeAtual, produto.unidade))} disponível</small></span>
            <span><strong>${moeda(produto.precoVenda)}</strong><i class="fas fa-chevron-right"></i></span>
        </button>
    `).join("");
}

function renderizarVendas() {
    const container = $("estoqueVendasLista");
    if (container) {
        container.innerHTML = vendas.length ? vendas.map((venda) => `
            <article class="estoque-log-item">
                <div><strong>${escapar(venda.produtoNomeSnapshot || "Produto")}</strong><span>${dataHora(venda.dataVenda)} • ${escapar(venda.formaPagamento || "—")}${venda.profissionalNomeSnapshot ? ` • ${escapar(venda.profissionalNomeSnapshot)}` : ""}</span></div>
                <div><strong>${moeda(venda.valorBruto)}</strong>${venda.gerarComissao ? `<span>Comissão ${moeda(venda.comissaoValor)}</span>` : '<span>Sem comissão</span>'}</div>
            </article>
        `).join("") : '<div class="estoque-vazio compact"><strong>Nenhuma venda registrada.</strong></div>';
    }

    const hoje = new Date();
    const chaveHoje = chaveData(hoje);
    const vendasHoje = vendas.filter((v) => chaveData(v.dataVenda) === chaveHoje);
    const minhas = vendasHoje.filter((v) => v.profissionalUid === state.user?.uid);
    if ($("estoqueVendaHoje")) $("estoqueVendaHoje").textContent = moeda(minhas.reduce((s, v) => s + Number(v.valorBruto || 0), 0));
    if ($("estoqueComissaoHoje")) $("estoqueComissaoHoje").textContent = moeda(minhas.reduce((s, v) => s + Number(v.comissaoValor || 0), 0));
}

function renderizarMovimentacoes() {
    const container = $("estoqueMovimentacoesLista");
    if (!container) return;
    container.innerHTML = movimentacoes.length ? movimentacoes.map((mov) => {
        const sinal = ["entrada", "entrada_inicial"].includes(mov.tipo) ? "+" : mov.tipo === "saida" || mov.tipo === "saida_venda" ? "-" : "";
        return `
            <article class="estoque-log-item">
                <div><strong>${escapar(mov.produtoNomeSnapshot || "Produto")}</strong><span>${dataHora(mov.dataMovimentacao)} • ${escapar(mov.motivo || mov.tipo || "Movimentação")}</span></div>
                <div><strong>${sinal}${Number(mov.quantidade || 0).toLocaleString("pt-BR", { maximumFractionDigits: 3 })}</strong><span>Saldo ${Number(mov.saldoPosterior || 0).toLocaleString("pt-BR", { maximumFractionDigits: 3 })}</span></div>
            </article>
        `;
    }).join("") : '<div class="estoque-vazio compact"><strong>Nenhuma movimentação registrada.</strong></div>';
}

function selecionarAbaAdmin(aba) {
    abaAdmin = ["produtos", "vendas", "movimentacoes"].includes(aba) ? aba : "produtos";
    document.querySelectorAll("[data-estoque-tab]").forEach((btn) => {
        const ativo = btn.dataset.estoqueTab === abaAdmin;
        btn.classList.toggle("active", ativo);
        btn.setAttribute("aria-selected", String(ativo));
    });
    ["produtos", "vendas", "movimentacoes"].forEach((nome) => {
        const painel = $(`estoquePainel${nome[0].toUpperCase()}${nome.slice(1)}`);
        if (painel) painel.hidden = nome !== abaAdmin;
    });
}

async function carregarDados({ forcar = false } = {}) {
    const admin = podeAdministrarNaVisaoAtual();

    // As três listas não dependem uma da outra. Em paralelo, a tela espera apenas
    // a consulta mais lenta, em vez de somar o tempo de produtos + vendas + movimentos.
    const [produtosCarregados, vendasCarregadas, movimentacoesCarregadas] = await Promise.all([
        listarProdutosEstoque({ forcar, somenteAtivos: !admin }),
        listarVendasRecentes({ max: 60, forcar }),
        admin ? listarMovimentacoesRecentes({ max: 60, forcar }) : Promise.resolve([])
    ]);

    produtos = produtosCarregados;
    vendas = vendasCarregadas;
    movimentacoes = movimentacoesCarregadas;
    atualizarResumoAdmin();
    renderizarProdutosAdmin();
    renderizarProdutosVenda();
    renderizarVendas();
    renderizarMovimentacoes();
}

function configurarVisao() {
    const admin = podeAdministrarNaVisaoAtual();
    const adminView = $("estoqueAdminView");
    const vendaView = $("estoqueVendaView");
    if (adminView) adminView.hidden = !admin;
    if (vendaView) vendaView.hidden = admin;
    if ($("estoqueTitulo")) $("estoqueTitulo").textContent = admin ? "Estoque" : "Vender produto";
    if ($("estoqueDescricao")) $("estoqueDescricao").textContent = admin
        ? "Controle produtos, movimentações e vendas da barbearia."
        : "Registre uma venda e acompanhe sua comissão.";
    if (admin) selecionarAbaAdmin(abaAdmin);
}

export async function abrirEstoque() {
    configurarVisao();
    try {
        await carregarDados({ forcar: false });
    } catch (error) {
        console.error(error);
        mostrarErro(error?.message || "Não foi possível carregar o estoque.");
    }
}

function limparProdutoForm() {
    produtoEmEdicao = null;
    const form = $("formProdutoEstoque");
    form?.reset();
    preencherSelect($("estoqueProdutoCategoria"), CATEGORIAS_ESTOQUE, "Uso profissional");
    preencherSelect($("estoqueProdutoUnidade"), UNIDADES_ESTOQUE, "un");
    $("estoqueProdutoQuantidadeInicial").value = "0";
    $("estoqueProdutoEstoqueMinimo").value = "0";
    $("estoqueProdutoVendavel").checked = false;
    $("estoqueProdutoPrecoVenda").value = "";
    $("estoqueProdutoCusto").value = "";
    $("estoqueProdutoAtivo").checked = true;
    $("estoqueProdutoQuantidadeField").hidden = false;
    $("estoqueProdutoPrecoField").hidden = true;
    $("tituloModalProdutoEstoque").textContent = "Novo produto";
}

function abrirProdutoForm(produto = null) {
    if (!podeAdministrarNaVisaoAtual()) return;
    limparProdutoForm();
    if (produto) {
        produtoEmEdicao = produto;
        $("tituloModalProdutoEstoque").textContent = "Editar produto";
        $("estoqueProdutoNome").value = produto.nome || "";
        $("estoqueProdutoCategoria").value = produto.categoria || "Outros";
        $("estoqueProdutoCodigo").value = produto.codigoBarras || "";
        $("estoqueProdutoUnidade").value = produto.unidade || "un";
        $("estoqueProdutoEstoqueMinimo").value = Number(produto.estoqueMinimo || 0);
        $("estoqueProdutoCusto").value = formatarValorInput(produto.custoUnitario || 0);
        $("estoqueProdutoVendavel").checked = produto.vendavel === true;
        $("estoqueProdutoPrecoVenda").value = produto.precoVenda > 0 ? formatarValorInput(produto.precoVenda) : "";
        $("estoqueProdutoAtivo").checked = produto.ativo !== false;
        $("estoqueProdutoQuantidadeField").hidden = true;
        $("estoqueProdutoPrecoField").hidden = produto.vendavel !== true;
    }
    setModal("modalProdutoEstoque", true);
}

async function salvarProduto(event) {
    event.preventDefault();
    const btn = $("btnSalvarProdutoEstoque");
    const dados = {
        nome: $("estoqueProdutoNome").value,
        categoria: $("estoqueProdutoCategoria").value,
        codigoBarras: $("estoqueProdutoCodigo").value,
        unidade: $("estoqueProdutoUnidade").value,
        quantidadeAtual: produtoEmEdicao ? produtoEmEdicao.quantidadeAtual : Number($("estoqueProdutoQuantidadeInicial").value || 0),
        estoqueMinimo: Number($("estoqueProdutoEstoqueMinimo").value || 0),
        custoUnitario: converterParaNumero($("estoqueProdutoCusto").value) || 0,
        precoVenda: converterParaNumero($("estoqueProdutoPrecoVenda").value) || 0,
        vendavel: $("estoqueProdutoVendavel").checked,
        ativo: $("estoqueProdutoAtivo").checked
    };

    const editando = Boolean(produtoEmEdicao);
    iniciarAcaoBotao(btn, editando ? "Salvando..." : "Cadastrando...");

    try {
        if (editando) {
            await atualizarProdutoEstoque(produtoEmEdicao.id, dados);
        } else {
            await criarProdutoEstoque(dados);
        }

        await concluirAcaoBotao(btn, editando ? "Produto atualizado ✓" : "Produto cadastrado ✓", 460);
        setModal("modalProdutoEstoque", false);
        mostrarSucesso(editando ? "Produto atualizado." : "Produto cadastrado.");

        const loading = iniciarLoadingTela("Atualizando estoque...", { delay: 320 });
        try {
            await carregarDados({ forcar: true });
        } finally {
            finalizarLoadingTela(loading);
        }
    } catch (error) {
        console.error(error);
        restaurarAcaoBotao(btn);
        mostrarErro(error?.message || "Não foi possível salvar o produto.");
    } finally {
        restaurarAcaoBotao(btn);
    }
}

function abrirMovimentacao(produto) {
    produtoMovimentacao = produto;
    $("movEstoqueProdutoNome").textContent = produto.nome || "Produto";
    $("movEstoqueSaldoAtual").textContent = formatarQuantidadeEstoque(produto.quantidadeAtual, produto.unidade);
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

    if (tipo !== "ajuste" && quantidade <= 0) {
        mostrarErro("Informe a quantidade da movimentação.");
        return;
    }
    if (gerarDespesa && totalCompra <= 0) {
        mostrarErro("Informe o custo unitário para gerar a despesa da compra.");
        return;
    }

    iniciarAcaoBotao(btn, gerarDespesa ? "Salvando e lançando despesa..." : "Atualizando estoque...");
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
            try {
                const descricao = `Compra de estoque • ${produtoMovimentacao.nome}`;
                if (parcelada) {
                    await criarDespesaParcelada({
                        parcelas: gerarParcelas(totalCompra, parcelasQtd, new Date()),
                        categoria: "Produtos",
                        descricao,
                        valorTotal: totalCompra,
                        tipo: "barbearia"
                    });
                } else {
                    await criarDespesa({
                        data: new Date(),
                        categoria: "Produtos",
                        descricao,
                        valor: totalCompra,
                        tipo: "barbearia"
                    });
                }
            } catch (errorDespesa) {
                console.error(errorDespesa);
                mostrarErro("Estoque atualizado, mas não foi possível gerar a despesa. Lance-a manualmente em Despesas.");
                setModal("modalMovimentarEstoque", false);
                await carregarDados({ forcar: true });
                return;
            }
        }

        await concluirAcaoBotao(btn, gerarDespesa ? "Tudo atualizado ✓" : "Estoque atualizado ✓", 460);
        mostrarSucesso(gerarDespesa ? "Estoque e despesa atualizados." : "Estoque atualizado.");
        setModal("modalMovimentarEstoque", false);

        const loading = iniciarLoadingTela("Atualizando estoque...", { delay: 320 });
        try {
            await carregarDados({ forcar: true });
        } finally {
            finalizarLoadingTela(loading);
        }
    } catch (error) {
        console.error(error);
        restaurarAcaoBotao(btn);
        mostrarErro(error?.message || "Não foi possível movimentar o estoque.");
    } finally {
        restaurarAcaoBotao(btn);
    }
}

async function abrirVenda(produto) {
    const loading = iniciarLoadingTela("Preparando venda...", { delay: 300 });

    try {
        // Atualiza comissão global antes de mostrar o preview; a gravação ainda
        // valida a configuração novamente dentro da transação.
        try {
            definirConfiguracoes(await carregarConfiguracoesDoBanco({ forcar: true }));
        } catch (error) {
            console.warn("Não foi possível atualizar a comissão antes da venda:", error);
        }

        produtoVenda = produto;
    $("vendaProdutoNome").textContent = produto.nome || "Produto";
    $("vendaProdutoPreco").textContent = moeda(produto.precoVenda);
    $("vendaProdutoEstoque").textContent = `${formatarQuantidadeEstoque(produto.quantidadeAtual, produto.unidade)} disponível`;
    $("vendaProdutoQuantidade").value = "1";
    preencherSelect($("vendaProdutoPagamento"), FORMAS_PAGAMENTO_VENDA, "Pix");

    const admin = podeAdministrarNaVisaoAtual();
    $("vendaComissaoAdminField").hidden = !admin;
    $("vendaProfissionalField").hidden = !admin;
    $("vendaGerarComissao").checked = admin ? true : true;

    if (admin) {
        const membros = await listarProfissionaisParaVenda();
        const select = $("vendaProfissional");
        select.innerHTML = membros.map((membro) => `<option value="${escapar(membro.uid || membro.id)}">${escapar(membro.nome || membro.email || "Profissional")}</option>`).join("");
        if ([...select.options].some((op) => op.value === state.user?.uid)) select.value = state.user.uid;
    } else {
        $("vendaProfissional").innerHTML = `<option value="${escapar(state.user?.uid || "")}">${escapar(nomeAtual())}</option>`;
    }

        await atualizarPreviewVenda();
        setModal("modalVendaProduto", true);
    } finally {
        finalizarLoadingTela(loading);
    }
}

async function membroSelecionadoVenda() {
    if (!podeAdministrarNaVisaoAtual()) return state.membroAtual;
    const uid = $("vendaGerarComissao").checked ? $("vendaProfissional").value : state.user?.uid;
    const lista = await listarProfissionaisParaVenda();
    return lista.find((m) => (m.uid || m.id) === uid) || state.membroAtual;
}

async function atualizarPreviewVenda() {
    if (!produtoVenda) return;
    const admin = podeAdministrarNaVisaoAtual();
    const gerar = admin ? $("vendaGerarComissao").checked : true;
    $("vendaProfissionalField").hidden = admin ? !gerar : true;
    const membro = await membroSelecionadoVenda();
    const calculo = calcularVendaProduto({
        produto: produtoVenda,
        quantidade: Number($("vendaProdutoQuantidade").value || 1),
        formaPagamento: $("vendaProdutoPagamento").value,
        gerarComissao: gerar,
        comissaoPct: Number(state.configSistema?.comissaoProdutosPct ?? 20),
        membroTaxas: membro
    });
    $("vendaProdutoTotal").textContent = moeda(calculo.valorBruto);
    $("vendaComissaoResumo").hidden = !gerar;
    if (gerar) {
        $("vendaComissaoPct").textContent = `${calculo.comissaoPct.toFixed(2).replace(".", ",")}%`;
        $("vendaComissaoValor").textContent = moeda(calculo.comissaoValor);
    }
}

async function salvarVenda(event) {
    event.preventDefault();
    if (!produtoVenda) return;
    const admin = podeAdministrarNaVisaoAtual();
    const gerarComissao = admin ? $("vendaGerarComissao").checked : true;
    const profissionalUid = gerarComissao
        ? (admin ? $("vendaProfissional").value : state.user?.uid)
        : null;
    const btn = $("btnRegistrarVendaProduto");
    iniciarAcaoBotao(btn, "Registrando venda...");
    try {
        const venda = await registrarVendaProduto({
            produtoId: produtoVenda.id,
            quantidade: Number($("vendaProdutoQuantidade").value || 1),
            formaPagamento: $("vendaProdutoPagamento").value,
            gerarComissao,
            profissionalUid
        });
        await concluirAcaoBotao(btn, "Venda registrada ✓", 460);
        setModal("modalVendaProduto", false);
        mostrarSucesso(venda.gerarComissao ? `Venda registrada • comissão ${moeda(venda.comissaoValor)}.` : "Venda registrada.");

        const loading = iniciarLoadingTela("Atualizando estoque...", { delay: 320 });
        try {
            await carregarDados({ forcar: true });
        } finally {
            finalizarLoadingTela(loading);
        }
    } catch (error) {
        console.error(error);
        restaurarAcaoBotao(btn);
        mostrarErro(error?.message || "Não foi possível registrar a venda.");
    } finally {
        restaurarAcaoBotao(btn);
    }
}

async function procurarCodigoVenda(codigo) {
    const produto = await localizarProdutoPorCodigo(codigo);
    if (!produto || produto.ativo === false || produto.vendavel !== true) {
        mostrarErro("Produto não encontrado ou indisponível para venda.");
        return;
    }
    if (Number(produto.quantidadeAtual || 0) <= 0) {
        mostrarErro("Este produto está sem estoque.");
        return;
    }
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
        if (!window.ZXingBrowser?.BrowserMultiFormatReader) {
            throw new Error("Leitor de código de barras indisponível. Digite ou busque o produto manualmente.");
        }
        scannerAtivo = true;
        const reader = new window.ZXingBrowser.BrowserMultiFormatReader();
        scannerControls = await reader.decodeFromConstraints(
            { video: { facingMode: { ideal: "environment" } }, audio: false },
            video,
            async (resultado) => {
                if (!scannerAtivo || !resultado) return;
                const codigo = normalizarCodigoBarras(resultado.getText?.() || resultado.text || "");
                if (!codigo) return;
                fecharScanner();
                if (scannerDestino === "produto") {
                    $("estoqueProdutoCodigo").value = codigo;
                    mostrarSucesso("Código de barras lido.");
                } else {
                    await procurarCodigoVenda(codigo);
                }
            }
        );
        if (status) status.textContent = "Aponte a câmera para o código de barras do produto.";
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

function vincularEventos() {
    $("btnNovoProdutoEstoque")?.addEventListener("click", () => abrirProdutoForm());
    $("btnFecharProdutoEstoque")?.addEventListener("click", () => setModal("modalProdutoEstoque", false));
    $("btnCancelarProdutoEstoque")?.addEventListener("click", () => setModal("modalProdutoEstoque", false));
    $("formProdutoEstoque")?.addEventListener("submit", salvarProduto);
    $("estoqueProdutoVendavel")?.addEventListener("change", () => {
        $("estoqueProdutoPrecoField").hidden = !$("estoqueProdutoVendavel").checked;
    });
    [$("estoqueProdutoCusto"), $("estoqueProdutoPrecoVenda")].forEach((input) => input?.addEventListener("input", () => aplicarMascaraMoedaInput(input, 9)));
    $("btnScanCodigoProduto")?.addEventListener("click", () => iniciarScanner("produto"));
    $("btnScanVendaProduto")?.addEventListener("click", () => iniciarScanner("venda"));
    $("btnScanVendaProdutoAdmin")?.addEventListener("click", () => iniciarScanner("venda"));
    $("btnFecharScannerEstoque")?.addEventListener("click", fecharScanner);

    $("estoqueBusca")?.addEventListener("input", renderizarProdutosAdmin);
    $("estoqueVendaBusca")?.addEventListener("input", renderizarProdutosVenda);
    document.querySelectorAll("[data-estoque-filtro]").forEach((btn) => btn.addEventListener("click", () => {
        filtroStatus = btn.dataset.estoqueFiltro || "todos";
        document.querySelectorAll("[data-estoque-filtro]").forEach((item) => item.classList.toggle("active", item === btn));
        renderizarProdutosAdmin();
    }));
    document.querySelectorAll("[data-estoque-tab]").forEach((btn) => btn.addEventListener("click", () => selecionarAbaAdmin(btn.dataset.estoqueTab)));

    $("estoqueProdutosLista")?.addEventListener("click", async (event) => {
        const card = event.target.closest("[data-produto-id]");
        const acao = event.target.closest("[data-acao]")?.dataset.acao;
        if (!card || !acao) return;
        const produto = produtos.find((item) => item.id === card.dataset.produtoId);
        if (!produto) return;
        if (acao === "editar") abrirProdutoForm(produto);
        if (acao === "movimentar") abrirMovimentacao(produto);
        if (acao === "vender") await abrirVenda(produto);
        if (acao === "status") {
            try {
                await definirStatusProduto(produto.id, produto.ativo === false);
                mostrarSucesso(produto.ativo === false ? "Produto ativado." : "Produto desativado.");
                await carregarDados({ forcar: true });
            } catch (error) {
                mostrarErro(error?.message || "Não foi possível alterar o produto.");
            }
        }
    });

    $("estoqueVendaProdutos")?.addEventListener("click", async (event) => {
        const botao = event.target.closest("[data-produto-id]");
        if (!botao) return;
        const produto = produtos.find((item) => item.id === botao.dataset.produtoId);
        if (produto) await abrirVenda(produto);
    });

    $("btnFecharMovEstoque")?.addEventListener("click", () => setModal("modalMovimentarEstoque", false));
    $("btnCancelarMovEstoque")?.addEventListener("click", () => setModal("modalMovimentarEstoque", false));
    $("formMovimentarEstoque")?.addEventListener("submit", salvarMovimentacao);
    $("movEstoqueTipo")?.addEventListener("change", atualizarCamposMovimentacao);
    $("movEstoqueCusto")?.addEventListener("input", () => aplicarMascaraMoedaInput($("movEstoqueCusto"), 9));
    $("movEstoqueGerarDespesa")?.addEventListener("change", () => {
        $("movEstoqueDespesaOpcoes").hidden = !$("movEstoqueGerarDespesa").checked;
    });
    $("movEstoqueParcelada")?.addEventListener("change", () => {
        $("movEstoqueParcelasField").hidden = !$("movEstoqueParcelada").checked;
    });

    $("btnFecharVendaProduto")?.addEventListener("click", () => setModal("modalVendaProduto", false));
    $("btnCancelarVendaProduto")?.addEventListener("click", () => setModal("modalVendaProduto", false));
    $("formVendaProduto")?.addEventListener("submit", salvarVenda);
    [$("vendaProdutoQuantidade"), $("vendaProdutoPagamento"), $("vendaGerarComissao"), $("vendaProfissional")].forEach((input) => {
        input?.addEventListener("change", () => void atualizarPreviewVenda());
        input?.addEventListener("input", () => void atualizarPreviewVenda());
    });

    onStateChange("configSistema", () => {
        if (!$("estoque") || $("estoque").style.display === "none") return;
        renderizarProdutosVenda();
    });
}

export function initEstoque() {
    if (inicializado) return;
    inicializado = true;
    preencherSelect($("estoqueProdutoCategoria"), CATEGORIAS_ESTOQUE, "Uso profissional");
    preencherSelect($("estoqueProdutoUnidade"), UNIDADES_ESTOQUE, "un");
    preencherSelect($("vendaProdutoPagamento"), FORMAS_PAGAMENTO_VENDA, "Pix");
    vincularEventos();
}
