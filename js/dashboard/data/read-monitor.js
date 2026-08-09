const metricas = {
    consultas: 0,
    documentosRetornados: 0,
    porOrigem: {},
    cacheLocal: {
        acertos: 0,
        misses: 0,
        expirados: 0,
        outros: 0,
        porOrigem: {}
    },
    janela60s: {
        consultas: 0,
        documentosRetornados: 0,
        status: "normal"
    }
};

const eventosRecentes = [];
let ultimoAlertaEm = 0;

function limparJanela() {
    const limite = Date.now() - 60_000;
    while (eventosRecentes.length && eventosRecentes[0].em < limite) {
        eventosRecentes.shift();
    }
}

function atualizarJanela() {
    limparJanela();

    const consultas = eventosRecentes.length;
    const documentosRetornados = eventosRecentes.reduce(
        (soma, evento) => soma + evento.qtd,
        0
    );

    let status = "normal";
    if (consultas >= 30 || documentosRetornados >= 250) status = "atencao";
    if (consultas >= 60 || documentosRetornados >= 700) status = "critico";

    metricas.janela60s = {
        consultas,
        documentosRetornados,
        status
    };

    if (status !== "normal" && Date.now() - ultimoAlertaEm > 30_000) {
        ultimoAlertaEm = Date.now();

        const porOrigem = {};
        eventosRecentes.forEach((evento) => {
            if (!porOrigem[evento.origem]) porOrigem[evento.origem] = { consultas: 0, documentos: 0 };
            porOrigem[evento.origem].consultas += 1;
            porOrigem[evento.origem].documentos += evento.qtd;
        });

        const principal = Object.entries(porOrigem)
            .sort((a, b) => b[1].documentos - a[1].documentos || b[1].consultas - a[1].consultas)[0];

        console.warn(
            `[SR NK • Firestore] Possível excesso de leituras: ${consultas} consulta(s), ${documentosRetornados} doc(s) nos últimos 60s.`,
            principal ? `Origem principal: ${principal[0]}` : ""
        );
    }
}

export function registrarConsultaFirestore(origem, quantidade = 0, detalhe = "") {
    const qtd = Number(quantidade || 0);
    metricas.consultas += 1;
    metricas.documentosRetornados += qtd;

    if (!metricas.porOrigem[origem]) {
        metricas.porOrigem[origem] = { consultas: 0, documentosRetornados: 0 };
    }

    metricas.porOrigem[origem].consultas += 1;
    metricas.porOrigem[origem].documentosRetornados += qtd;

    eventosRecentes.push({
        em: Date.now(),
        origem,
        qtd
    });
    atualizarJanela();

    // Diagnóstico local: não representa exatamente a cobrança oficial do Firebase,
    // mas mostra imediatamente o que ESTE navegador está disparando.
    console.info(
        `[SR NK • Firestore] ${origem}: ${qtd} doc(s)`,
        detalhe || "",
        `| sessão: ${metricas.consultas} consulta(s), ${metricas.documentosRetornados} doc(s)`,
        `| 60s: ${metricas.janela60s.consultas} consulta(s), ${metricas.janela60s.documentosRetornados} doc(s)`
    );
}

export function registrarCacheLocal(origem, status) {
    const chave = String(origem || "cache");
    const tipo = String(status || "outro");

    if (!metricas.cacheLocal.porOrigem[chave]) {
        metricas.cacheLocal.porOrigem[chave] = {
            acertos: 0,
            misses: 0,
            expirados: 0,
            outros: 0
        };
    }

    const item = metricas.cacheLocal.porOrigem[chave];

    if (tipo === "hit") {
        metricas.cacheLocal.acertos += 1;
        item.acertos += 1;
        return;
    }

    if (tipo === "miss") {
        metricas.cacheLocal.misses += 1;
        item.misses += 1;
        return;
    }

    if (tipo === "expirado") {
        metricas.cacheLocal.expirados += 1;
        item.expirados += 1;
        return;
    }

    metricas.cacheLocal.outros += 1;
    item.outros += 1;
}

export function obterDiagnosticoLeituras() {
    atualizarJanela();
    return JSON.parse(JSON.stringify(metricas));
}

if (typeof window !== "undefined") {
    // Mantém compatibilidade com os comandos já usados no Console.
    window.__SRNK_LEITURAS__ = metricas;
    window.__SRNK_DIAGNOSTICO__ = obterDiagnosticoLeituras;
}
