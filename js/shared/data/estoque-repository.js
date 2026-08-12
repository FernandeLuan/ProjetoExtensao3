import { db } from "../../firebase-init.js?v=9.7";
import {
    collection,
    doc,
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

import { SCHEMA_VERSION } from "../constants.js?v=9.7";
import { state } from "../state.js?v=9.7";
import { obterUidAtual, obterWorkspaceId } from "./context.js?v=9.7";
import { listarMembrosEquipe, obterMembroPorUid } from "./equipe-repository.js?v=9.7";
import { usuarioEhAdmin, podeAdministrarNaVisaoAtual } from "../permissoes.js?v=9.7";
import { calcularVendaProduto, normalizarCodigoBarras, validarProduto } from "../services/estoque-service.js?v=9.7";
import { marcarDadosPendentes } from "../services/refresh-service.js?v=9.7";

const CACHE_ESTOQUE_MS = 60 * 1000;
const CACHE_VENDAS_MS = 2 * 60 * 1000;
const CACHE_MOVIMENTACOES_MS = 60 * 1000;
let cacheProdutos = null;
let cacheProdutosEm = 0;
const cacheVendas = new Map();
const vendasEmAndamento = new Map();
const cacheMovimentacoes = new Map();
const movimentacoesEmAndamento = new Map();

function col(nome) {
    return collection(db, "barbearias", obterWorkspaceId(), nome);
}

function ref(nome, id) {
    return doc(db, "barbearias", obterWorkspaceId(), nome, id);
}

function nomeUsuarioAtual() {
    return String(state.membroAtual?.nome || state.perfilUsuario?.nome || state.user?.email || "Usuário");
}

export function invalidarCacheEstoque() {
    cacheProdutos = null;
    cacheProdutosEm = 0;
    cacheVendas.clear();
    vendasEmAndamento.clear();
    cacheMovimentacoes.clear();
    movimentacoesEmAndamento.clear();
}

function cacheLeituraValido(item, ttl) {
    return item && (Date.now() - item.salvoEm) < ttl;
}

function chaveVendaPeriodo(dataInicio, fimExclusivo, uidFiltro, max, incluirCanceladas) {
    return [
        obterWorkspaceId(),
        dataInicio.toISOString().slice(0, 10),
        fimExclusivo.toISOString().slice(0, 10),
        uidFiltro || "todos",
        max || "sem-limite",
        incluirCanceladas ? "com-canceladas" : "ativas"
    ].join(":");
}

export async function listarProdutosEstoque({ forcar = false, somenteAtivos = false } = {}) {
    if (!forcar && Array.isArray(cacheProdutos) && Date.now() - cacheProdutosEm < CACHE_ESTOQUE_MS) {
        return filtrarProdutos(cacheProdutos, { somenteAtivos });
    }

    const snapshot = await getDocs(query(col("estoque"), orderBy("nome", "asc")));
    cacheProdutos = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
    cacheProdutosEm = Date.now();
    return filtrarProdutos(cacheProdutos, { somenteAtivos });
}

function filtrarProdutos(lista, { somenteAtivos }) {
    return (lista || []).filter((produto) => !somenteAtivos || produto.ativo !== false);
}

export async function localizarProdutoPorCodigo(codigo) {
    const normalizado = normalizarCodigoBarras(codigo);
    if (!normalizado) return null;

    const emCache = (cacheProdutos || []).find((item) => item.codigoBarras === normalizado);
    if (emCache) return emCache;

    const snapshot = await getDocs(query(col("estoque"), where("codigoBarras", "==", normalizado), limit(1)));
    if (snapshot.empty) return null;
    return { id: snapshot.docs[0].id, ...snapshot.docs[0].data() };
}

async function garantirCodigoUnico(codigo, ignorarId = null) {
    const normalizado = normalizarCodigoBarras(codigo);
    if (!normalizado) return;
    const snapshot = await getDocs(query(col("estoque"), where("codigoBarras", "==", normalizado), limit(2)));
    const conflito = snapshot.docs.some((item) => item.id !== ignorarId);
    if (conflito) throw new Error("Este código de barras já está vinculado a outro produto.");
}

export async function criarProdutoEstoque(dados) {
    if (!usuarioEhAdmin()) throw new Error("Somente o administrador pode cadastrar produtos.");
    const produto = validarProduto({ ...dados, unidade: "un", estoqueMinimo: 0, vendavel: true, ativo: true });
    await garantirCodigoUnico(produto.codigoBarras);

    const produtoRef = doc(col("estoque"));
    const movimentoRef = doc(col("estoqueMovimentacoes"));
    const batch = writeBatch(db);
    const uid = obterUidAtual();
    const nome = nomeUsuarioAtual();

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
            motivo: "Quantidade inicial",
            registradoPorUid: uid,
            registradoPorNome: nome,
            dataMovimentacao: Timestamp.fromDate(new Date()),
            schemaVersion: SCHEMA_VERSION,
            criadoEm: serverTimestamp()
        });
    }

    await batch.commit();
    invalidarCacheEstoque();
    marcarDadosPendentes("estoque");
    return produtoRef.id;
}

export async function atualizarProdutoEstoque(id, alteracoes) {
    if (!usuarioEhAdmin()) throw new Error("Somente o administrador pode alterar produtos.");
    await garantirCodigoUnico(alteracoes.codigoBarras, id);

    const movimentoRef = doc(col("estoqueMovimentacoes"));
    const uid = obterUidAtual();
    const nome = nomeUsuarioAtual();

    await runTransaction(db, async (transaction) => {
        const produtoRef = ref("estoque", id);
        const snap = await transaction.get(produtoRef);
        if (!snap.exists()) throw new Error("Produto não encontrado.");

        const original = { id: snap.id, ...snap.data() };
        const produto = validarProduto({
            ...original,
            ...alteracoes,
            unidade: original.unidade || "un",
            estoqueMinimo: 0,
            vendavel: true,
            ativo: original.ativo !== false
        });

        const anterior = Number(original.quantidadeAtual || 0);
        const posterior = Number(produto.quantidadeAtual || 0);

        transaction.update(produtoRef, {
            nome: produto.nome,
            categoria: produto.categoria,
            codigoBarras: produto.codigoBarras,
            unidade: produto.unidade,
            quantidadeAtual: posterior,
            estoqueMinimo: 0,
            custoUnitario: produto.custoUnitario,
            precoVenda: produto.precoVenda,
            vendavel: true,
            atualizadoEm: serverTimestamp()
        });

        if (Math.abs(posterior - anterior) > 0.0001) {
            transaction.set(movimentoRef, {
                produtoId: id,
                produtoNomeSnapshot: produto.nome,
                tipo: "ajuste",
                quantidade: Number(Math.abs(posterior - anterior).toFixed(3)),
                saldoAnterior: anterior,
                saldoPosterior: posterior,
                motivo: "Ajuste na edição do produto",
                registradoPorUid: uid,
                registradoPorNome: nome,
                dataMovimentacao: Timestamp.fromDate(new Date()),
                schemaVersion: SCHEMA_VERSION,
                criadoEm: serverTimestamp()
            });
        }
    });

    invalidarCacheEstoque();
    marcarDadosPendentes("estoque");
}

export async function definirStatusProduto(id, ativo) {
    if (!usuarioEhAdmin()) throw new Error("Somente o administrador pode alterar produtos.");
    await updateDoc(ref("estoque", id), {
        ativo: ativo === true,
        vendavel: ativo === true,
        atualizadoEm: serverTimestamp()
    });
    invalidarCacheEstoque();
    marcarDadosPendentes("estoque");
}

export async function movimentarEstoque({ produtoId, tipo, quantidade = 0, novoSaldo = null, motivo = "", custoUnitario = null }) {
    if (!podeAdministrarNaVisaoAtual()) throw new Error("Somente o administrador pode movimentar o estoque.");

    const movimentoRef = doc(col("estoqueMovimentacoes"));
    const uid = obterUidAtual();
    const nome = nomeUsuarioAtual();

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
    marcarDadosPendentes("estoque");
    return resultado;
}

async function resolverMembroVenda(profissionalUid) {
    if (!profissionalUid) return null;
    if (profissionalUid === state.user?.uid) return state.membroAtual;
    return obterMembroPorUid(profissionalUid);
}

function validarProfissionalComissao(profissional) {
    return Boolean(profissional && profissional.ativo === true && profissional.atuaComoProfissional !== false);
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
    const profissional = gerarComissao ? await resolverMembroVenda(profissionalUid) : null;
    if (gerarComissao && !validarProfissionalComissao(profissional)) {
        throw new Error("O profissional selecionado não está disponível para vendas.");
    }

    const vendaRef = doc(col("vendas"));
    const movimentoRef = doc(col("estoqueMovimentacoes"));
    const agora = new Date();

    const resultado = await runTransaction(db, async (transaction) => {
        const configRef = ref("configuracoes", "geral");
        const produtoRef = ref("estoque", produtoId);
        const refs = [configRef, produtoRef];
        if (gerarComissao) refs.push(ref("membros", profissionalUid));
        const snaps = await Promise.all(refs.map((item) => transaction.get(item)));
        const configSnap = snaps[0];
        const produtoSnap = snaps[1];
        const membroSnap = gerarComissao ? snaps[2] : null;

        if (!produtoSnap.exists()) throw new Error("Produto não encontrado.");
        const configVenda = configSnap.exists() ? configSnap.data() : {};
        const comissaoPct = Math.max(0, Math.min(100, Number(configVenda.comissaoProdutosPct ?? 20)));
        const produto = { id: produtoSnap.id, ...produtoSnap.data() };
        if (produto.ativo === false) throw new Error("Este produto está arquivado.");

        const membro = membroSnap?.exists() ? { id: membroSnap.id, ...membroSnap.data() } : profissional;
        if (gerarComissao && !validarProfissionalComissao(membro)) {
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
            configVenda
        });
        const posterior = Number((anterior - qtd).toFixed(3));
        const profissionalNome = gerarComissao
            ? String(membro?.nome || membro?.email || profissional?.nome || profissional?.email || "Profissional")
            : "";
        const registradoPorNome = nomeUsuarioAtual();

        const venda = {
            produtoId,
            produtoNomeSnapshot: String(produto.nome || "Produto"),
            categoriaSnapshot: String(produto.categoria || "Outros"),
            unidadeSnapshot: "un",
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
            cancelada: false,
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
    marcarDadosPendentes(["vendas", "estoque"]);
    return resultado;
}

export async function editarVendaProduto(vendaId, { quantidade, formaPagamento, profissionalUid = null, gerarComissao = true } = {}) {
    if (!usuarioEhAdmin()) throw new Error("Somente o administrador pode editar vendas.");
    const uidAtual = obterUidAtual();
    const movimentoRef = doc(col("estoqueMovimentacoes"));

    const resultado = await runTransaction(db, async (transaction) => {
        const vendaRef = ref("vendas", vendaId);
        const vendaSnap = await transaction.get(vendaRef);
        if (!vendaSnap.exists()) throw new Error("Venda não encontrada.");
        const original = { id: vendaSnap.id, ...vendaSnap.data() };
        if (original.cancelada === true) throw new Error("Uma venda cancelada não pode ser editada.");

        const produtoRef = ref("estoque", original.produtoId);
        const configRef = ref("configuracoes", "geral");
        const refs = [produtoRef, configRef];
        if (gerarComissao && profissionalUid) refs.push(ref("membros", profissionalUid));
        const snaps = await Promise.all(refs.map((item) => transaction.get(item)));
        const produtoSnap = snaps[0];
        const configSnap = snaps[1];
        const membroSnap = gerarComissao && profissionalUid ? snaps[2] : null;
        if (!produtoSnap.exists()) throw new Error("Produto da venda não encontrado.");

        const produto = { id: produtoSnap.id, ...produtoSnap.data() };
        const configVenda = configSnap.exists() ? configSnap.data() : {};
        const comissaoPct = Math.max(0, Math.min(100, Number(configVenda.comissaoProdutosPct ?? 20)));
        const membro = membroSnap?.exists() ? { id: membroSnap.id, ...membroSnap.data() } : null;
        if (gerarComissao && (!profissionalUid || !validarProfissionalComissao(membro))) {
            throw new Error("Selecione um profissional ativo para a comissão.");
        }

        const qtdNova = Math.max(1, Number(quantidade || 1));
        const qtdAntiga = Number(original.quantidade || 0);
        const saldoAtual = Number(produto.quantidadeAtual || 0);
        const saldoRestaurado = saldoAtual + qtdAntiga;
        if (qtdNova > saldoRestaurado) throw new Error("Quantidade maior que o estoque disponível.");
        const saldoNovo = Number((saldoRestaurado - qtdNova).toFixed(3));

        const financeiro = calcularVendaProduto({
            produto: { ...produto, precoVenda: Number(original.precoUnitarioSnapshot ?? produto.precoVenda) },
            quantidade: qtdNova,
            formaPagamento,
            gerarComissao,
            comissaoPct,
            configVenda
        });
        const profissionalNome = gerarComissao ? String(membro?.nome || membro?.email || "Profissional") : null;

        transaction.update(vendaRef, {
            quantidade: financeiro.quantidade,
            valorBruto: financeiro.valorBruto,
            formaPagamento,
            taxaPagamentoPctSnapshot: financeiro.taxaPagamentoPct,
            taxaPagamentoValor: financeiro.taxaPagamentoValor,
            gerarComissao: gerarComissao === true,
            profissionalUid: gerarComissao ? profissionalUid : null,
            profissionalNomeSnapshot: gerarComissao ? profissionalNome : null,
            comissaoPctSnapshot: financeiro.comissaoPct,
            comissaoValor: financeiro.comissaoValor,
            custoTotalSnapshot: financeiro.custoTotal,
            resultadoBarbearia: financeiro.resultadoBarbearia,
            editada: true,
            editadaPorUid: uidAtual,
            editadaEm: serverTimestamp()
        });
        transaction.update(produtoRef, {
            quantidadeAtual: saldoNovo,
            atualizadoEm: serverTimestamp()
        });

        if (Math.abs(saldoNovo - saldoAtual) > 0.0001) {
            transaction.set(movimentoRef, {
                produtoId: original.produtoId,
                produtoNomeSnapshot: original.produtoNomeSnapshot || produto.nome || "Produto",
                tipo: "ajuste_venda",
                quantidade: Number(Math.abs(saldoNovo - saldoAtual).toFixed(3)),
                saldoAnterior: saldoAtual,
                saldoPosterior: saldoNovo,
                motivo: "Edição de venda",
                vendaId,
                registradoPorUid: uidAtual,
                registradoPorNome: nomeUsuarioAtual(),
                dataMovimentacao: Timestamp.fromDate(new Date()),
                schemaVersion: SCHEMA_VERSION,
                criadoEm: serverTimestamp()
            });
        }

        return { ...original, ...financeiro, id: vendaId, formaPagamento, profissionalUid, profissionalNomeSnapshot: profissionalNome };
    });

    invalidarCacheEstoque();
    marcarDadosPendentes(["vendas", "estoque"]);
    return resultado;
}

export async function cancelarVendaProduto(vendaId) {
    if (!usuarioEhAdmin()) throw new Error("Somente o administrador pode cancelar vendas.");
    const uidAtual = obterUidAtual();
    const movimentoRef = doc(col("estoqueMovimentacoes"));

    await runTransaction(db, async (transaction) => {
        const vendaRef = ref("vendas", vendaId);
        const vendaSnap = await transaction.get(vendaRef);
        if (!vendaSnap.exists()) throw new Error("Venda não encontrada.");
        const venda = { id: vendaSnap.id, ...vendaSnap.data() };
        if (venda.cancelada === true) return;

        const produtoRef = ref("estoque", venda.produtoId);
        const produtoSnap = await transaction.get(produtoRef);
        if (!produtoSnap.exists()) throw new Error("Produto da venda não encontrado.");
        const produto = produtoSnap.data();
        const anterior = Number(produto.quantidadeAtual || 0);
        const posterior = Number((anterior + Number(venda.quantidade || 0)).toFixed(3));

        transaction.update(vendaRef, {
            cancelada: true,
            canceladaPorUid: uidAtual,
            canceladaEm: serverTimestamp()
        });
        transaction.update(produtoRef, {
            quantidadeAtual: posterior,
            atualizadoEm: serverTimestamp()
        });
        transaction.set(movimentoRef, {
            produtoId: venda.produtoId,
            produtoNomeSnapshot: venda.produtoNomeSnapshot || produto.nome || "Produto",
            tipo: "estorno_venda",
            quantidade: Number(venda.quantidade || 0),
            saldoAnterior: anterior,
            saldoPosterior: posterior,
            motivo: "Venda cancelada",
            vendaId,
            registradoPorUid: uidAtual,
            registradoPorNome: nomeUsuarioAtual(),
            dataMovimentacao: Timestamp.fromDate(new Date()),
            schemaVersion: SCHEMA_VERSION,
            criadoEm: serverTimestamp()
        });
    });

    invalidarCacheEstoque();
    marcarDadosPendentes(["vendas", "estoque"]);
}

export async function listarVendasPorPeriodo(
    inicio,
    fim,
    { profissionalUid = null, max = null, forcar = false, incluirCanceladas = false } = {}
) {
    const dataInicio = new Date(inicio);
    dataInicio.setHours(0, 0, 0, 0);
    const fimExclusivo = new Date(fim);
    fimExclusivo.setHours(0, 0, 0, 0);
    fimExclusivo.setDate(fimExclusivo.getDate() + 1);

    const uidFiltro = profissionalUid || (!podeAdministrarNaVisaoAtual() ? obterUidAtual() : null);
    const chave = chaveVendaPeriodo(dataInicio, fimExclusivo, uidFiltro, max, incluirCanceladas);

    if (!forcar && cacheLeituraValido(cacheVendas.get(chave), CACHE_VENDAS_MS)) {
        return cacheVendas.get(chave).itens;
    }
    if (!forcar && vendasEmAndamento.has(chave)) return vendasEmAndamento.get(chave);

    const promessa = (async () => {
        const filtros = [
            where("dataVenda", ">=", Timestamp.fromDate(dataInicio)),
            where("dataVenda", "<", Timestamp.fromDate(fimExclusivo))
        ];
        if (uidFiltro) filtros.unshift(where("profissionalUid", "==", uidFiltro));

        let consulta = query(col("vendas"), ...filtros, orderBy("dataVenda", "desc"));
        if (max) consulta = query(col("vendas"), ...filtros, orderBy("dataVenda", "desc"), limit(max));
        const snapshot = await getDocs(consulta);
        let itens = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
        if (!incluirCanceladas) itens = itens.filter((item) => item.cancelada !== true);
        cacheVendas.set(chave, { itens, salvoEm: Date.now() });
        return itens;
    })();

    vendasEmAndamento.set(chave, promessa);
    try { return await promessa; }
    finally { vendasEmAndamento.delete(chave); }
}

export async function listarVendasRecentes({ max = 60, forcar = false, incluirCanceladas = true } = {}) {
    if (!podeAdministrarNaVisaoAtual()) {
        const hoje = new Date();
        const inicio = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
        const fim = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0);
        return listarVendasPorPeriodo(inicio, fim, {
            profissionalUid: obterUidAtual(),
            max,
            forcar,
            incluirCanceladas: false
        });
    }

    const chave = `${obterWorkspaceId()}:recentes:${max}:${incluirCanceladas ? "todas" : "ativas"}`;
    if (!forcar && cacheLeituraValido(cacheVendas.get(chave), CACHE_VENDAS_MS)) return cacheVendas.get(chave).itens;
    if (!forcar && vendasEmAndamento.has(chave)) return vendasEmAndamento.get(chave);

    const promessa = (async () => {
        const snapshot = await getDocs(query(col("vendas"), orderBy("dataVenda", "desc"), limit(max)));
        let itens = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
        if (!incluirCanceladas) itens = itens.filter((item) => item.cancelada !== true);
        cacheVendas.set(chave, { itens, salvoEm: Date.now() });
        return itens;
    })();

    vendasEmAndamento.set(chave, promessa);
    try { return await promessa; }
    finally { vendasEmAndamento.delete(chave); }
}

export async function listarMovimentacoesRecentes({ max = 60, forcar = false } = {}) {
    if (!usuarioEhAdmin()) return [];
    const chave = `${obterWorkspaceId()}:movimentacoes:${max}`;
    if (!forcar && cacheLeituraValido(cacheMovimentacoes.get(chave), CACHE_MOVIMENTACOES_MS)) return cacheMovimentacoes.get(chave).itens;
    if (!forcar && movimentacoesEmAndamento.has(chave)) return movimentacoesEmAndamento.get(chave);

    const promessa = (async () => {
        const snapshot = await getDocs(query(col("estoqueMovimentacoes"), orderBy("dataMovimentacao", "desc"), limit(max)));
        const itens = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
        cacheMovimentacoes.set(chave, { itens, salvoEm: Date.now() });
        return itens;
    })();

    movimentacoesEmAndamento.set(chave, promessa);
    try { return await promessa; }
    finally { movimentacoesEmAndamento.delete(chave); }
}

export async function listarProfissionaisParaVenda() {
    if (!usuarioEhAdmin()) return [state.membroAtual].filter(Boolean);
    const membros = (state.equipe || []).length ? state.equipe : await listarMembrosEquipe();
    return membros
        .filter((item) => item.ativo === true && item.atuaComoProfissional !== false && item.removido !== true)
        .sort((a, b) => String(a.nome || a.email || "").localeCompare(String(b.nome || b.email || ""), "pt-BR"));
}
