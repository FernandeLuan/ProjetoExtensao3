const metricas = {
    consultas: 0,
    documentosRetornados: 0,
    porOrigem: {}
};

export function registrarConsultaFirestore(origem, quantidade = 0, detalhe = "") {
    const qtd = Number(quantidade || 0);
    metricas.consultas += 1;
    metricas.documentosRetornados += qtd;

    if (!metricas.porOrigem[origem]) {
        metricas.porOrigem[origem] = { consultas: 0, documentosRetornados: 0 };
    }

    metricas.porOrigem[origem].consultas += 1;
    metricas.porOrigem[origem].documentosRetornados += qtd;

    // Diagnóstico local: não representa exatamente a cobrança do Firebase,
    // mas deixa visível quantas consultas o app disparou e quantos docs voltaram.
    console.info(
        `[SR NK • Firestore] ${origem}: ${qtd} doc(s)`,
        detalhe || "",
        `| sessão: ${metricas.consultas} consulta(s), ${metricas.documentosRetornados} doc(s)`
    );
}

if (typeof window !== "undefined") {
    window.__SRNK_LEITURAS__ = metricas;
}
