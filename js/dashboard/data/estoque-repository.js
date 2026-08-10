import { db } from "../../firebase-init.js?v=8.31";
import {
    collection,
    doc,
    getDoc,
    getDocs,
    limit,
    orderBy,
    query,
    runTransaction,
    serverTimestamp,
    Timestamp,
    updateDoc,
    where,
    writeBatch
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

import { SCHEMA_VERSION } from "../constants.js?v=8.31";
import { state } from "../state.js?v=8.31";
import { obterUidAtual, obterWorkspaceId } from "./context.js?v=8.31";
import { listarMembrosEquipe, obterMembroPorUid } from "./equipe-repository.js?v=8.31";
import { registrarConsultaFirestore } from "./read-monitor.js?v=8.31";
import { usuarioEhAdmin, podeAdministrarNaVisaoAtual } from "../permissoes.js?v=8.31";
import {
    calcularVendaProduto,
    normalizarCodigoBarras,
    validarProduto
} from "../services/estoque-service.js?v=8.31";

const CACHE_ESTOQUE_MS = 60 * 1000;
let cacheProdutos = null;
let cacheProdutosEm = 0;

function col(nome) {
    return collection(db, "barbearias", obterWorkspaceId(), nome);
}

function ref(nome, id) {
    return doc(db, "barbearias", obterWorkspaceId(), nome, id);
}

export function invalidarCacheEstoque() {
    cacheProdutos = null;
    cacheProdutosEm = 0;
}

export async function listarProdutosEstoque({ forcar = false, somenteAtivos = false, somenteVendaveis = false } = {}) {
    if (!forcar && Array.isArray(cacheProdutos) && Date.now() - cacheProdutosEm < CACHE_ESTOQUE_MS) {
        return filtrarProdutos(cacheProdutos, { somenteAtivos, somenteVendaveis });
    }

    const snapshot = await getDocs(query(col("estoque"), orderBy("nome", "asc")));
    registrarConsultaFirestore("estoque/produtos", snapshot.size);
    cacheProdutos = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
    cacheProdutosEm = Date.now();
    return filtrarProdutos(cacheProdutos, { somenteAtivos, somenteVendaveis });
}

function filtrarProdutos(lista, { somenteAtivos, somenteVendaveis }) {
    return (lista || []).filter((produto) => {
        if (somenteAtivos && produto.ativo === false) return false;
        if (somenteVendaveis && produto.vendavel !== true) return false;
        return true;
    });
}

export async function localizarProdutoPorCodigo(codigo) {
    const normalizado = normalizarCodigoBarras(codigo);
    if (!normalizado) return null;

    const emCache = (cacheProdutos || []).find((item) => item.codigoBarras === normalizado);
    if (emCache) return emCache;

    const snapshot = await getDocs(query(col("estoque"), where("codigoBarras", "==", normalizado), limit(1)));
    registrarConsultaFirestore("estoque/codigo-barras", snapshot.size, normalizado);
    if (snapshot.empty) return null;
    const item = { id: snapshot.docs[0].id, ...snapshot.docs[0].data() };
    return item;
}

async function garantirCodigoUnico(codigo, ignorarId = null) {
    const normalizado = normalizarCodigoBarras(codigo);
    if (!normalizado) return;
    const snapshot = await getDocs(query(col("estoque"), where("codigoBarras", "==", normalizado), limit(2)));
    registrarConsultaFirestore("estoque/codigo-unico", snapshot.size, normalizado);
    const conflito = snapshot.docs.some((item) => item.id !== ignorarId);
    if (conflito) throw new Error("Este código de barras já está vinculado a outro produto.");
}

export async function criarProdutoEstoque(dados) {
    if (!usuarioEhAdmin()) throw new Error("Somente o administrador pode cadastrar produtos.");
    const produto = validarProduto(dados);
    await garantirCodigoUnico(produto.codigoBarras);

    const produtoRef = doc(col("estoque"));
    const movimentoRef = doc(col("estoqueMovimentacoes"));
    const batch = writeBatch(db);
    const uid = obterUidAtual();
    const nome = String(state.membroAtual?.nome || state.perfilUsuario?.nome || state.user?.email || "Administrador");

    batch.set(produtoRef, {
        ...produto,
        schemaVersion: SCHEMA_VERSION,
        criadoPorUid: uid,
        criadoEm: serverTimestamp(),
        atualizadoEm: serverTimestamp()
    });

    if (produto.quantidadeAtual > 0) {
        batch.set(movimentoRef, {
            produtoId: produtoRef.id,
            produtoNomeSnapshot: produto.nome,
            tipo: "entrada_inicial",
            quantidade: produto.quantidadeAtual,
            saldoAnterior: 0,
            saldoPosterior: produto.quantidadeAtual,
            motivo: "Estoque inicial",
            registradoPorUid: uid,
            registradoPorNome: nome,
            dataMovimentacao: Timestamp.fromDate(new Date()),
            schemaVersion: SCHEMA_VERSION,
            criadoEm: serverTimestamp()
        });
    }

    await batch.commit();
    invalidarCacheEstoque();
    return produtoRef.id;
}

export async function atualizarProdutoEstoque(id, alteracoes) {
    if (!usuarioEhAdmin()) throw new Error("Somente o administrador pode alterar produtos.");
    const snap = await getDoc(ref("estoque", id));
    registrarConsultaFirestore("estoque/produto", snap.exists() ? 1 : 0, id);
    if (!snap.exists()) throw new Error("Produto não encontrado.");

    const original = { id: snap.id, ...snap.data() };
    const produto = validarProduto({ ...original, ...alteracoes, quantidadeAtual: original.quantidadeAtual });
    await garantirCodigoUnico(produto.codigoBarras, id);

    await updateDoc(ref("estoque", id), {
        nome: produto.nome,
        categoria: produto.categoria,
        codigoBarras: produto.codigoBarras,
        unidade: produto.unidade,
        estoqueMinimo: produto.estoqueMinimo,
        custoUnitario: produto.custoUnitario,
        precoVenda: produto.precoVenda,
        vendavel: produto.vendavel,
        ativo: produto.ativo,
        atualizadoEm: serverTimestamp()
    });
    invalidarCacheEstoque();
}

export async function definirStatusProduto(id, ativo) {
    if (!usuarioEhAdmin()) throw new Error("Somente o administrador pode alterar produtos.");
    await updateDoc(ref("estoque", id), {
        ativo: ativo === true,
        atualizadoEm: serverTimestamp()
    });
    invalidarCacheEstoque();
}

export async function movimentarEstoque({ produtoId, tipo, quantidade = 0, novoSaldo = null, motivo = "", custoUnitario = null }) {
    if (!podeAdministrarNaVisaoAtual()) throw new Error("Somente o administrador pode movimentar o estoque.");

    const movimentoRef = doc(col("estoqueMovimentacoes"));
    const uid = obterUidAtual();
    const nome = String(state.membroAtual?.nome || state.perfilUsuario?.nome || state.user?.email || "Administrador");

    const resultado = await runTransaction(db, async (transaction) => {
        const produtoRef = ref("estoque", produtoId);
        const produtoSnap = await transaction.get(produtoRef);
        if (!produtoSnap.exists()) throw new Error("Produto não encontrado.");
        const produto = produtoSnap.data();
        const anterior = Number(produto.quantidadeAtual || 0);
        let posterior = anterior;
        let qtdMov = Math.max(0, Number(quantidade || 0));

        if (tipo === "entrada") posterior = anterior + qtdMov;
        else if (tipo === "saida") {
            posterior = anterior - qtdMov;
            if (posterior < 0) throw new Error("A saída é maior que o estoque disponível.");
        } else if (tipo === "ajuste") {
            posterior = Math.max(0, Number(novoSaldo || 0));
            qtdMov = Math.abs(posterior - anterior);
        } else {
            throw new Error("Tipo de movimentação inválido.");
        }

        const atualizacao = {
            quantidadeAtual: Number(posterior.toFixed(3)),
            atualizadoEm: serverTimestamp()
        };
        if (tipo === "entrada" && custoUnitario !== null && Number(custoUnitario) >= 0) {
            atualizacao.custoUnitario = Number(Number(custoUnitario).toFixed(2));
        }
        transaction.update(produtoRef, atualizacao);
        transaction.set(movimentoRef, {
            produtoId,
            produtoNomeSnapshot: String(produto.nome || "Produto"),
            tipo,
            quantidade: Number(qtdMov.toFixed(3)),
            saldoAnterior: anterior,
            saldoPosterior: Number(posterior.toFixed(3)),
            motivo: String(motivo || (tipo === "entrada" ? "Entrada" : tipo === "saida" ? "Saída" : "Ajuste")).slice(0, 120),
            custoUnitarioSnapshot: tipo === "entrada" && custoUnitario !== null ? Number(Number(custoUnitario).toFixed(2)) : Number(produto.custoUnitario || 0),
            registradoPorUid: uid,
            registradoPorNome: nome,
            dataMovimentacao: Timestamp.fromDate(new Date()),
            schemaVersion: SCHEMA_VERSION,
            criadoEm: serverTimestamp()
        });
        return { produto: { id: produtoId, ...produto }, anterior, posterior: Number(posterior.toFixed(3)), quantidade: qtdMov };
    });

    invalidarCacheEstoque();
    return resultado;
}

async function resolverMembroVenda(profissionalUid) {
    if (!profissionalUid) return state.membroAtual;
    if (profissionalUid === state.user?.uid) return state.membroAtual;
    return obterMembroPorUid(profissionalUid);
}

export async function registrarVendaProduto({
    produtoId,
    quantidade = 1,
    formaPagamento = "Pix",
    gerarComissao = false,
    profissionalUid = null
}) {
    const adminNaVisao = podeAdministrarNaVisaoAtual();
    const uidAtual = obterUidAtual();

    if (!adminNaVisao) {
        gerarComissao = true;
        profissionalUid = uidAtual;
    }

    if (gerarComissao && !profissionalUid) throw new Error("Selecione o profissional da comissão.");

    const profissional = gerarComissao ? await resolverMembroVenda(profissionalUid) : state.membroAtual;
    if (gerarComissao && (!profissional || profissional.ativo !== true || profissional.atuaComoProfissional === false)) {
        throw new Error("O profissional selecionado não está disponível para vendas.");
    }

    const vendaRef = doc(col("vendas"));
    const movimentoRef = doc(col("estoqueMovimentacoes"));
    const agora = new Date();

    const resultado = await runTransaction(db, async (transaction) => {
        // Comissão e taxas são lidas ao vivo no momento da venda para que o
        // snapshot não dependa de uma configuração antiga em cache no aparelho.
        const configRef = ref("configuracoes", "geral");
        const membroTaxasRef = ref("membros", gerarComissao ? profissionalUid : uidAtual);
        const produtoRef = ref("estoque", produtoId);

        const configSnap = await transaction.get(configRef);
        const membroTaxasSnap = await transaction.get(membroTaxasRef);
        const produtoSnap = await transaction.get(produtoRef);

        if (!produtoSnap.exists()) throw new Error("Produto não encontrado.");
        if (!membroTaxasSnap.exists()) throw new Error("Não foi possível validar as taxas do responsável pela venda.");

        const configVenda = configSnap.exists() ? configSnap.data() : {};
        const comissaoPct = Math.max(0, Math.min(100, Number(configVenda.comissaoProdutosPct ?? 20)));
        const membroTaxas = { id: membroTaxasSnap.id, ...membroTaxasSnap.data() };
        const produto = { id: produtoSnap.id, ...produtoSnap.data() };
        if (produto.ativo === false || produto.vendavel !== true) throw new Error("Este produto não está disponível para venda.");
        if (gerarComissao && (membroTaxas.ativo !== true || membroTaxas.atuaComoProfissional === false)) {
            throw new Error("O profissional selecionado não está disponível para vendas.");
        }

        const qtd = Math.max(1, Number(quantidade || 1));
        const anterior = Number(produto.quantidadeAtual || 0);
        if (qtd > anterior) throw new Error("Quantidade maior que o estoque disponível.");

        const financeiro = calcularVendaProduto({
            produto,
            quantidade: qtd,
            formaPagamento,
            gerarComissao,
            comissaoPct,
            membroTaxas
        });
        const posterior = Number((anterior - qtd).toFixed(3));
        const profissionalNome = gerarComissao
            ? String(membroTaxas?.nome || membroTaxas?.email || profissional?.nome || profissional?.email || "Profissional")
            : "";
        const registradoPorNome = String(state.membroAtual?.nome || state.perfilUsuario?.nome || state.user?.email || "Usuário");

        const venda = {
            produtoId,
            produtoNomeSnapshot: String(produto.nome || "Produto"),
            categoriaSnapshot: String(produto.categoria || "Outros"),
            unidadeSnapshot: String(produto.unidade || "un"),
            quantidade: financeiro.quantidade,
            precoUnitarioSnapshot: financeiro.precoUnitario,
            valorBruto: financeiro.valorBruto,
            formaPagamento,
            taxaPagamentoPctSnapshot: financeiro.taxaPagamentoPct,
            taxaPagamentoValor: financeiro.taxaPagamentoValor,
            gerarComissao: gerarComissao === true,
            profissionalUid: gerarComissao ? profissionalUid : null,
            profissionalNomeSnapshot: gerarComissao ? profissionalNome : null,
            comissaoPctSnapshot: financeiro.comissaoPct,
            comissaoValor: financeiro.comissaoValor,
            custoUnitarioSnapshot: financeiro.custoUnitario,
            custoTotalSnapshot: financeiro.custoTotal,
            resultadoBarbearia: financeiro.resultadoBarbearia,
            registradoPorUid: uidAtual,
            registradoPorNome,
            dataVenda: Timestamp.fromDate(agora),
            schemaVersion: SCHEMA_VERSION,
            criadoEm: serverTimestamp()
        };

        transaction.set(vendaRef, venda);
        transaction.update(produtoRef, {
            quantidadeAtual: posterior,
            ultimaVendaId: vendaRef.id,
            atualizadoEm: serverTimestamp()
        });
        transaction.set(movimentoRef, {
            produtoId,
            produtoNomeSnapshot: venda.produtoNomeSnapshot,
            tipo: "saida_venda",
            quantidade: financeiro.quantidade,
            saldoAnterior: anterior,
            saldoPosterior: posterior,
            motivo: `Venda • ${formaPagamento}`,
            vendaId: vendaRef.id,
            profissionalUid: venda.profissionalUid,
            registradoPorUid: uidAtual,
            registradoPorNome,
            dataMovimentacao: Timestamp.fromDate(agora),
            schemaVersion: SCHEMA_VERSION,
            criadoEm: serverTimestamp()
        });

        return { id: vendaRef.id, ...venda };
    });

    invalidarCacheEstoque();
    return resultado;
}

export async function listarVendasPorPeriodo(inicio, fim, { profissionalUid = null, max = null } = {}) {
    const dataInicio = new Date(inicio);
    dataInicio.setHours(0, 0, 0, 0);
    const fimExclusivo = new Date(fim);
    fimExclusivo.setHours(0, 0, 0, 0);
    fimExclusivo.setDate(fimExclusivo.getDate() + 1);

    const filtros = [
        where("dataVenda", ">=", Timestamp.fromDate(dataInicio)),
        where("dataVenda", "<", Timestamp.fromDate(fimExclusivo))
    ];

    const uidFiltro = profissionalUid || (!podeAdministrarNaVisaoAtual() ? obterUidAtual() : null);
    if (uidFiltro) filtros.unshift(where("profissionalUid", "==", uidFiltro));

    let consulta = query(col("vendas"), ...filtros, orderBy("dataVenda", "desc"));
    if (max) consulta = query(col("vendas"), ...filtros, orderBy("dataVenda", "desc"), limit(max));
    const snapshot = await getDocs(consulta);
    registrarConsultaFirestore("estoque/vendas", snapshot.size);
    return snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
}

export async function listarVendasRecentes({ max = 50 } = {}) {
    if (!podeAdministrarNaVisaoAtual()) {
        const hoje = new Date();
        const inicio = new Date(hoje);
        inicio.setHours(0, 0, 0, 0);
        return listarVendasPorPeriodo(inicio, hoje, { profissionalUid: obterUidAtual(), max });
    }
    const snapshot = await getDocs(query(col("vendas"), orderBy("dataVenda", "desc"), limit(max)));
    registrarConsultaFirestore("estoque/vendas-recentes", snapshot.size);
    return snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
}

export async function listarMovimentacoesRecentes({ max = 50 } = {}) {
    if (!usuarioEhAdmin()) return [];
    const snapshot = await getDocs(query(col("estoqueMovimentacoes"), orderBy("dataMovimentacao", "desc"), limit(max)));
    registrarConsultaFirestore("estoque/movimentacoes", snapshot.size);
    return snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
}

export async function listarProfissionaisParaVenda() {
    if (!usuarioEhAdmin()) return [state.membroAtual].filter(Boolean);
    const membros = (state.equipe || []).length ? state.equipe : await listarMembrosEquipe();
    return membros
        .filter((item) => item.ativo === true && item.atuaComoProfissional !== false && item.removido !== true)
        .sort((a, b) => String(a.nome || a.email || "").localeCompare(String(b.nome || b.email || ""), "pt-BR"));
}
