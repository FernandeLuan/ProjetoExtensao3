const PREFIXO = "srnk:v1:";

function storageDisponivel() {
    try {
        return typeof window !== "undefined" && Boolean(window.localStorage);
    } catch (_) {
        return false;
    }
}

function chaveCompleta(chave) {
    return `${PREFIXO}${String(chave || "")}`;
}

export function lerCacheLocal(chave, ttlMs, origem = chave) {
    if (!storageDisponivel()) {
        return null;
    }

    try {
        const bruto = window.localStorage.getItem(chaveCompleta(chave));
        if (!bruto) {
            return null;
        }

        const envelope = JSON.parse(bruto);
        const salvoEm = Number(envelope?.salvoEm || 0);
        const ttl = Number(ttlMs || 0);

        if (!salvoEm || !Object.prototype.hasOwnProperty.call(envelope || {}, "valor")) {
            window.localStorage.removeItem(chaveCompleta(chave));
            return null;
        }

        if (ttl > 0 && Date.now() - salvoEm >= ttl) {
            window.localStorage.removeItem(chaveCompleta(chave));
            return null;
        }
        return envelope.valor;
    } catch (error) {
        console.warn("[SR NK • Cache] Não foi possível ler o cache local.", error);
        return null;
    }
}

export function salvarCacheLocal(chave, valor) {
    if (!storageDisponivel()) return false;

    try {
        window.localStorage.setItem(
            chaveCompleta(chave),
            JSON.stringify({
                salvoEm: Date.now(),
                valor
            })
        );
        return true;
    } catch (error) {
        console.warn("[SR NK • Cache] Não foi possível salvar o cache local.", error);
        return false;
    }
}

export function removerCacheLocal(chave) {
    if (!storageDisponivel()) return;
    try {
        window.localStorage.removeItem(chaveCompleta(chave));
    } catch (_) {
        // Cache é otimização. Uma falha aqui não pode bloquear o app.
    }
}

export function removerCachesPorPrefixo(prefixo) {
    if (!storageDisponivel()) return;

    try {
        const prefixoCompleto = chaveCompleta(prefixo);
        const chaves = [];

        for (let i = 0; i < window.localStorage.length; i += 1) {
            const chave = window.localStorage.key(i);
            if (chave?.startsWith(prefixoCompleto)) chaves.push(chave);
        }

        chaves.forEach((chave) => window.localStorage.removeItem(chave));
    } catch (_) {
        // Cache é otimização. Uma falha aqui não pode bloquear o app.
    }
}
