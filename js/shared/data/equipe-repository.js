import { db } from "../../firebase-init.js?v=13.0";
import {
    collection,
    doc,
    getDoc,
    getDocs,
    query,
    where,
    updateDoc,
    writeBatch,
    serverTimestamp,
    deleteField
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

import { SCHEMA_VERSION } from "../constants.js?v=13.0";
import { state, definirEquipe, definirMembroAtual } from "../state.js?v=13.0";
import { usuarioEhAdmin, papelEhAdmin } from "../permissoes.js?v=13.0";
import { obterUidAtual, obterWorkspaceId } from "./context.js?v=13.0";
import {
    lerCacheLocal,
    salvarCacheLocal,
    removerCacheLocal
} from "./cache-local.js?v=13.0";

const CACHE_EQUIPE_MS = 5 * 60 * 1000;
let cacheEquipe = null;
let cacheEquipeEm = 0;
let consultaEquipeEmAndamento = null;

function chaveCacheEquipe() {
    return `equipe:${obterWorkspaceId()}`;
}

function aplicarEquipeNoEstado(membros, { atualizarMembroAtual = false } = {}) {
    definirEquipe(membros);

    if (!atualizarMembroAtual && state.membroAtual) return;

    const atual = membros.find(
        (membro) => (membro.uid || membro.id) === state.user?.uid
    );
    if (atual) definirMembroAtual(atual);
}

export function invalidarCacheEquipe() {
    cacheEquipe = null;
    cacheEquipeEm = 0;

    try {
        removerCacheLocal(chaveCacheEquipe());
    } catch (_) {
        // Contexto ainda pode não estar inicializado durante algum teardown.
    }
}

export async function obterMembroAtual() {
    const workspaceId = obterWorkspaceId();
    const uid = obterUidAtual();
    const snap = await getDoc(doc(db, "barbearias", workspaceId, "membros", uid));
    if (!snap.exists()) return null;
    const membro = { id: snap.id, ...snap.data() };
    definirMembroAtual(membro);
    return membro;
}

export async function obterMembroPorUid(uid) {
    if (!uid) return null;

    const emEstado = (state.equipe || []).find(
        (membro) => (membro.uid || membro.id) === uid
    );
    if (emEstado) return emEstado;

    const snap = await getDoc(doc(db, "barbearias", obterWorkspaceId(), "membros", uid));
    return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function listarMembrosEquipe({ forcar = false } = {}) {
    const cacheValido =
        !forcar &&
        Array.isArray(cacheEquipe) &&
        (Date.now() - cacheEquipeEm) < CACHE_EQUIPE_MS;

    if (cacheValido) return cacheEquipe;

    if (!forcar) {
        const persistido = lerCacheLocal(
            chaveCacheEquipe(),
            CACHE_EQUIPE_MS,
            "equipe"
        );

        if (Array.isArray(persistido)) {
            cacheEquipe = persistido;
            cacheEquipeEm = Date.now();

            // Não substitui state.membroAtual por uma versão persistida. O membro
            // atual foi confirmado ao vivo na inicialização para preservar repasse,
            // preços, papel e status corretos.
            aplicarEquipeNoEstado(persistido, { atualizarMembroAtual: false });
            return persistido;
        }
    }

    if (consultaEquipeEmAndamento) return consultaEquipeEmAndamento;

    consultaEquipeEmAndamento = (async () => {
        const snapshot = await getDocs(
            collection(db, "barbearias", obterWorkspaceId(), "membros")
        );

        const membros = snapshot.docs.map((documento) => ({
            id: documento.id,
            ...documento.data()
        }));

        // Preenche os caches ANTES de emitir o estado. Assim um listener de "equipe"
        // nunca dispara outra consulta recursiva ao Firestore.
        cacheEquipe = membros;
        cacheEquipeEm = Date.now();
        salvarCacheLocal(chaveCacheEquipe(), membros);

        aplicarEquipeNoEstado(membros, { atualizarMembroAtual: true });
        return membros;
    })();

    try {
        return await consultaEquipeEmAndamento;
    } finally {
        consultaEquipeEmAndamento = null;
    }
}


export async function localizarUsuarioDaBarbeariaPorEmail(email) {
    if (!usuarioEhAdmin()) throw new Error("Somente o administrador pode consultar acessos da equipe.");

    const workspaceId = obterWorkspaceId();
    const emailLimpo = String(email || "").trim().toLowerCase();
    if (!emailLimpo) return null;

    const referencia = query(
        collection(db, "usuarios"),
        where("barbeariaId", "==", workspaceId)
    );
    const snapshot = await getDocs(referencia);

    const documento = snapshot.docs.find((item) =>
        String(item.data()?.email || "").trim().toLowerCase() === emailLimpo
    );
    return documento ? { id: documento.id, uid: documento.id, ...documento.data() } : null;
}

export async function restaurarMembroOrfao({
    usuario,
    nome,
    email,
    taxaDebitoPct = null,
    taxaCreditoPct = null,
    repassePct
}) {
    if (!usuarioEhAdmin()) throw new Error("Somente o administrador pode restaurar acessos.");
    if (!usuario?.uid && !usuario?.id) throw new Error("Usuário antigo não localizado.");

    const uid = usuario.uid || usuario.id;
    const workspaceId = obterWorkspaceId();
    const repasse = Number(repassePct);
    if (!Number.isFinite(repasse) || repasse < 0 || repasse > 99.99) {
        throw new Error("Informe um percentual de repasse entre 0,00% e 99,99%.");
    }

    const debito = validarTaxaProfissionalOpcional(taxaDebitoPct, "débito");
    const credito = validarTaxaProfissionalOpcional(taxaCreditoPct, "crédito");
    const agora = serverTimestamp();

    const membro = {
        uid,
        nome: String(nome || "").trim().slice(0, 60),
        email: String(email || usuario.email || "").trim().toLowerCase(),
        papel: "barber",
        ativo: true,
        dono: false,
        atuaComoProfissional: true,
        repassePct: Number(repasse.toFixed(2)),
        precosPersonalizados: {},
        primeiroAcessoPendente: usuario.trocarSenha === true,
        restauradoDeCadastroAntigo: true,
        atualizadoEm: agora
    };
    if (debito !== null) membro.taxaDebitoPct = debito;
    if (credito !== null) membro.taxaCreditoPct = credito;

    const batch = writeBatch(db);
    batch.set(doc(db, "barbearias", workspaceId, "membros", uid), membro, { merge: true });
    batch.update(doc(db, "usuarios", uid), {
        nome: membro.nome,
        atualizadoEm: agora
    });
    await batch.commit();

    invalidarCacheEquipe();
    return { uid, primeiroAcessoPendente: membro.primeiroAcessoPendente };
}

export async function criarAcessoBarbeiroNoBanco({
    uid,
    nome,
    email,
    taxaDebitoPct = null,
    taxaCreditoPct = null,
    repassePct
}) {
    if (!usuarioEhAdmin()) {
        throw new Error("Somente o administrador pode adicionar barbeiros.");
    }

    const workspaceId = obterWorkspaceId();
    const uidAtual = obterUidAtual();
    const agora = serverTimestamp();
    const debito = validarTaxaProfissionalOpcional(taxaDebitoPct, "débito");
    const credito = validarTaxaProfissionalOpcional(taxaCreditoPct, "crédito");
    const repasse = Number(repassePct);

    if (!Number.isFinite(repasse) || repasse < 0 || repasse > 99.99) {
        throw new Error("Informe um percentual de repasse entre 0,00% e 99,99%.");
    }

    const batch = writeBatch(db);

    batch.set(doc(db, "usuarios", uid), {
        nome,
        email,
        barbeariaId: workspaceId,
        trocarSenha: true,
        schemaVersion: SCHEMA_VERSION,
        criadoEm: agora,
        atualizadoEm: agora
    });

    const membro = {
        uid,
        nome,
        email,
        papel: "barber",
        ativo: true,
        dono: false,
        atuaComoProfissional: true,
        repassePct: Number(repasse.toFixed(2)),
        precosPersonalizados: {},
        primeiroAcessoPendente: true,
        criadoPorUid: uidAtual,
        criadoEm: agora,
        atualizadoEm: agora
    };

    if (debito !== null) membro.taxaDebitoPct = debito;
    if (credito !== null) membro.taxaCreditoPct = credito;

    batch.set(doc(db, "barbearias", workspaceId, "membros", uid), membro);

    await batch.commit();
    invalidarCacheEquipe();
}

export async function alterarStatusMembro(uid, ativo) {
    if (!usuarioEhAdmin()) throw new Error("Somente o administrador pode alterar acessos.");
    if (!uid) throw new Error("Membro inválido.");
    if (uid === obterUidAtual()) throw new Error("Você não pode desativar o próprio acesso.");

    const conhecido = (state.equipe || []).find((item) => (item.uid || item.id) === uid)
        || (cacheEquipe || []).find((item) => (item.uid || item.id) === uid);
    if (conhecido && papelEhAdmin(conhecido.papel)) {
        throw new Error("Outro administrador não pode ser desativado por esta ação.");
    }

    const membroRef = doc(db, "barbearias", obterWorkspaceId(), "membros", uid);

    // Atualização otimista: o card responde imediatamente. A confirmação do
    // Firestore continua acontecendo em segundo plano; em caso de falha, o
    // estado local é revertido.
    const base = Array.isArray(state.equipe) && state.equipe.length
        ? state.equipe
        : (Array.isArray(cacheEquipe) ? cacheEquipe : []);
    const anterior = base.map((item) => ({ ...item }));
    const atualizada = base.map((item) => (item.uid || item.id) === uid
        ? { ...item, ativo: Boolean(ativo), atualizadoEm: new Date() }
        : item);

    const aplicarLocal = (lista) => {
        if (!lista.length) return;
        cacheEquipe = lista;
        cacheEquipeEm = Date.now();
        aplicarEquipeNoEstado(lista, { atualizarMembroAtual: false });
        salvarCacheLocal(chaveCacheEquipe(), lista);
    };

    if (atualizada.length) aplicarLocal(atualizada);

    try {
        await updateDoc(membroRef, {
            ativo: Boolean(ativo),
            atualizadoEm: serverTimestamp()
        });
    } catch (error) {
        if (anterior.length) aplicarLocal(anterior);
        else invalidarCacheEquipe();
        throw error;
    }
}

export async function excluirMembroInativo(uid) {
    if (!usuarioEhAdmin()) throw new Error("Somente o administrador pode excluir membros da equipe.");
    if (!uid) throw new Error("Membro inválido.");
    if (uid === obterUidAtual()) throw new Error("Você não pode excluir o próprio acesso.");

    const membroRef = doc(db, "barbearias", obterWorkspaceId(), "membros", uid);
    const snap = await getDoc(membroRef);
    if (!snap.exists()) throw new Error("Membro não encontrado.");

    const membro = snap.data();
    if (papelEhAdmin(membro.papel)) throw new Error("Um administrador não pode ser excluído por esta ação.");
    if (membro.ativo === true) throw new Error("Desative o membro antes de excluí-lo.");

    await updateDoc(membroRef, {
        ativo: false,
        removido: true,
        atualizadoEm: serverTimestamp()
    });
    invalidarCacheEquipe();
}

export async function restaurarMembroRemovido({
    uid,
    nome,
    taxaDebitoPct = null,
    taxaCreditoPct = null,
    repassePct
}) {
    if (!usuarioEhAdmin()) throw new Error("Somente o administrador pode restaurar membros da equipe.");
    if (!uid) throw new Error("Membro inválido.");

    const workspaceId = obterWorkspaceId();
    const membroRef = doc(db, "barbearias", workspaceId, "membros", uid);
    const membroSnap = await getDoc(membroRef);

    if (!membroSnap.exists()) throw new Error("Cadastro removido não encontrado.");

    const membro = membroSnap.data();
    if (papelEhAdmin(membro.papel)) throw new Error("Um administrador não pode ser restaurado por esta ação.");
    if (membro.removido !== true) throw new Error("Este cadastro não está removido.");

    const repasse = Number(repassePct);
    if (!Number.isFinite(repasse) || repasse < 0 || repasse > 99.99) {
        throw new Error("Informe um percentual de repasse entre 0,00% e 99,99%.");
    }

    const debito = validarTaxaProfissionalOpcional(taxaDebitoPct, "débito");
    const credito = validarTaxaProfissionalOpcional(taxaCreditoPct, "crédito");
    const nomeLimpo = String(nome || "").trim().replace(/\s+/g, " ").slice(0, 60);

    if (nomeLimpo.length < 2) {
        const error = new Error("Informe o nome do profissional.");
        error.campo = "nome";
        throw error;
    }

    const atualizacaoMembro = {
        nome: nomeLimpo,
        ativo: true,
        removido: false,
        repassePct: Number(repasse.toFixed(2)),
        precosPersonalizados: {},
        atualizadoEm: serverTimestamp(),
        taxaDebitoPct: debito === null ? deleteField() : debito,
        taxaCreditoPct: credito === null ? deleteField() : credito
    };

    const batch = writeBatch(db);
    batch.update(membroRef, atualizacaoMembro);

    // O documento em usuarios continua existindo enquanto a conta permanece no Auth.
    // Atualizamos apenas o nome, permitido pelas regras administrativas atuais.
    batch.update(doc(db, "usuarios", uid), {
        nome: nomeLimpo,
        atualizadoEm: serverTimestamp()
    });

    await batch.commit();
    invalidarCacheEquipe();

    return {
        uid,
        primeiroAcessoPendente: membro.primeiroAcessoPendente === true
    };
}

function validarTaxaProfissional(valor, rotulo) {
    const numero = Number(valor);
    if (!Number.isFinite(numero) || numero < 0 || numero >= 10) {
        throw new Error(`Informe uma taxa de ${rotulo} entre 0,00% e 9,99%.`);
    }
    return Number(numero.toFixed(2));
}

function validarTaxaProfissionalOpcional(valor, rotulo) {
    if (valor === null || valor === undefined || String(valor).trim() === "") return null;
    return validarTaxaProfissional(valor, rotulo);
}

export async function atualizarTaxasProprias({ taxaDebitoPct, taxaCreditoPct }) {
    const uid = obterUidAtual();
    if (!uid) throw new Error("Usuário inválido.");
    if (state.membroAtual?.ativo !== true) throw new Error("Seu acesso não está ativo.");

    const debito = validarTaxaProfissional(taxaDebitoPct, "débito");
    const credito = validarTaxaProfissional(taxaCreditoPct, "crédito");

    await updateDoc(doc(db, "barbearias", obterWorkspaceId(), "membros", uid), {
        taxaDebitoPct: debito,
        taxaCreditoPct: credito,
        atualizadoEm: serverTimestamp()
    });

    definirMembroAtual({
        ...state.membroAtual,
        taxaDebitoPct: debito,
        taxaCreditoPct: credito
    });
    invalidarCacheEquipe();

    return { taxaDebitoPct: debito, taxaCreditoPct: credito };
}

function normalizarNomeEquipe(valor) {
    return String(valor || "")
        .trim()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLocaleLowerCase("pt-BR")
        .replace(/\s+/g, " ");
}

async function validarNomeUnicoEquipe(uid, nome) {
    const nomeNormalizado = normalizarNomeEquipe(nome);
    const membros = await listarMembrosEquipe({ forcar: true });
    const duplicado = membros.find((membro) =>
        (membro.uid || membro.id) !== uid
        && membro?.removido !== true
        && normalizarNomeEquipe(membro?.nome) === nomeNormalizado
    );

    if (duplicado) {
        const error = new Error("Já existe um profissional com este nome.");
        error.code = "equipe/nome-duplicado";
        error.campo = "nome";
        throw error;
    }
}

export async function atualizarFinanceiroMembro(uid, {
    nome = null,
    repassePct,
    precosPersonalizados,
    taxaDebitoPct = null,
    taxaCreditoPct = null
}) {
    if (!usuarioEhAdmin()) throw new Error("Somente o administrador pode alterar os dados do profissional.");
    if (!uid) throw new Error("Membro inválido.");

    const repasse = Number(repassePct);
    if (!Number.isFinite(repasse) || repasse < 0 || repasse > 99.99) {
        throw new Error("Informe um percentual de repasse entre 0,00% e 99,99%.");
    }

    const debito = validarTaxaProfissionalOpcional(taxaDebitoPct, "débito");
    const credito = validarTaxaProfissionalOpcional(taxaCreditoPct, "crédito");

    const membroRef = doc(db, "barbearias", obterWorkspaceId(), "membros", uid);
    const membroSnap = await getDoc(membroRef);
    if (!membroSnap.exists()) throw new Error("Membro não encontrado.");

    const membroAtual = membroSnap.data();
    const nomeAtual = String(membroAtual?.nome || "").trim();
    const nomeLimpo = nome === null ? nomeAtual : String(nome || "").trim().replace(/\s+/g, " ").slice(0, 60);
    const nomeMudou = nome !== null && nomeLimpo !== nomeAtual;

    if (nomeMudou) {
        if (membroAtual?.papel !== "barber") {
            throw new Error("O nome do administrador não é alterado por esta tela.");
        }
        if (nomeLimpo.length < 2) {
            const error = new Error("Informe o nome do profissional.");
            error.campo = "nome";
            throw error;
        }
        await validarNomeUnicoEquipe(uid, nomeLimpo);
    }

    const precos = {};
    Object.entries(precosPersonalizados || {}).forEach(([servicoId, valor]) => {
        const numero = Number(valor);
        if (Number.isFinite(numero) && numero > 0) {
            precos[servicoId] = Number(numero.toFixed(2));
        }
    });

    const atualizacaoMembro = {
        repassePct: Number(repasse.toFixed(2)),
        precosPersonalizados: precos,
        atualizadoEm: serverTimestamp()
    };

    if (nomeMudou) atualizacaoMembro.nome = nomeLimpo;

    // Taxas são opcionais no admin. Campo vazio significa "não alterar/não cadastrar".
    if (debito !== null) atualizacaoMembro.taxaDebitoPct = debito;
    if (credito !== null) atualizacaoMembro.taxaCreditoPct = credito;

    if (nomeMudou) {
        const usuarioRef = doc(db, "usuarios", uid);
        const batch = writeBatch(db);
        batch.update(membroRef, atualizacaoMembro);
        batch.update(usuarioRef, {
            nome: nomeLimpo,
            atualizadoEm: serverTimestamp()
        });
        await batch.commit();
    } else {
        await updateDoc(membroRef, atualizacaoMembro);
    }

    invalidarCacheEquipe();
    return { nome: nomeMudou ? nomeLimpo : nomeAtual };
}

