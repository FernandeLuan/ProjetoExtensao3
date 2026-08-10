import { state } from "./state.js?v=8.30";
import { listarMembrosEquipe } from "./data/equipe-repository.js?v=8.30";
import {
    listarResumosBarbeariaPorPeriodo,
    listarResumosProfissionalPorPeriodo
} from "./data/resumos-repository.js?v=8.30";
import {
    chaveData,
    dataDeInput,
    formatarTituloData,
    inicioDoDia,
    mesmoDia,
    somarDias
} from "./utils/date.js?v=8.30";
import { abrirCalendarioPopover } from "./services/calendario-popover.js?v=8.30";

let dataSelecionada = inicioDoDia(new Date());
let carregamentoEmAndamento = null;
let eventosConfigurados = false;

const ORDEM_CARDS_PADRAO = ["resumo", "indicadores", "despesas", "servico"];

function normalizarOrdemCards(ordem = state.configSistema?.ordemCardsVisaoGeral) {
    const validos = Array.isArray(ordem)
        ? ordem.filter((chave, indice, lista) => ORDEM_CARDS_PADRAO.includes(chave) && lista.indexOf(chave) === indice)
        : [];
    ORDEM_CARDS_PADRAO.forEach((chave) => { if (!validos.includes(chave)) validos.push(chave); });
    return validos;
}

function aplicarOrdemCardsVisaoGeral() {
    const container = document.getElementById("barbeariaHomeCardsOrdenaveis");
    if (!container) return;
    const elementos = new Map(
        [...container.querySelectorAll(":scope > [data-visao-card]")].map((item) => [item.dataset.visaoCard, item])
    );
    normalizarOrdemCards().forEach((chave) => {
        const item = elementos.get(chave);
        if (item) container.appendChild(item);
    });
}


function el(id) {
    return document.getElementById(id);
}

function moeda(valor) {
    return Number(valor || 0).toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL"
    });
}

function centavosParaReais(valor) {
    return Number(valor || 0) / 100;
}

function nomeMembro(membro, resumos = []) {
    const uid = String(membro?.uid || membro?.id || "").trim();
    const nomePerfilAtual = uid === state.user?.uid
        ? String(state.perfilUsuario?.nome || state.user?.displayName || "").trim()
        : "";
    const nomeMembroSalvo = String(membro?.nome || "").trim();
    const nomeResumo = String(
        (resumos || []).find((item) => String(item?.profissionalNome || "").trim())?.profissionalNome || ""
    ).trim();

    return (
        nomePerfilAtual ||
        nomeMembroSalvo ||
        nomeResumo ||
        String(membro?.email || uid || "Profissional").trim()
    );
}

function membroEhDono(membro) {
    return membro?.dono === true;
}

function membrosAtivos(membros) {
    const mapa = new Map();

    (membros || [])
        .filter((membro) => membro?.ativo !== false)
        .forEach((membro) => {
            const uid = String(membro?.uid || membro?.id || "").trim();
            if (uid) mapa.set(uid, membro);
        });

    const atual = state.membroAtual;
    const uidAtual = String(atual?.uid || atual?.id || state.user?.uid || "").trim();
    if (uidAtual && atual?.ativo !== false && !mapa.has(uidAtual)) {
        mapa.set(uidAtual, { id: uidAtual, uid: uidAtual, ...atual });
    }

    return [...mapa.values()];
}

function consolidarProfissional(membro, resumos) {
    const acumulado = {
        uid: String(membro?.uid || membro?.id || "").trim(),
        nome: nomeMembro(membro, resumos),
        dono: membroEhDono(membro),
        atendimentos: 0,
        faturamento: 0,
        taxas: 0,
        repasseBarbearia: 0,
        servicos: new Map()
    };

    (resumos || []).forEach((resumo) => {
        acumulado.atendimentos += Math.max(0, Number(resumo?.atendimentos || 0));
        acumulado.faturamento += centavosParaReais(resumo?.faturamentoBrutoCentavos);
        acumulado.taxas += centavosParaReais(resumo?.taxasCartaoCentavos);
        acumulado.repasseBarbearia += centavosParaReais(resumo?.repasseCentavos);

        const quantidades = resumo?.servicosQtd || {};
        const nomes = resumo?.servicosNomes || {};

        Object.entries(quantidades).forEach(([chave, quantidade]) => {
            const qtd = Number(quantidade || 0);
            if (qtd <= 0) return;
            const nome = String(nomes[chave] || chave || "Serviço").trim() || "Serviço";
            acumulado.servicos.set(nome, (acumulado.servicos.get(nome) || 0) + qtd);
        });
    });

    return acumulado;
}

function consolidarBarbearia(profissionais, resumosBarbearia) {
    const total = {
        atendimentos: 0,
        faturamento: 0,
        receitaBarbearia: 0,
        despesasBarbearia: 0,
        lucroLiquido: 0,
        ticket: 0,
        servicoMaisVendido: "—",
        servicoMaisVendidoQtd: 0
    };

    const servicos = new Map();

    profissionais.forEach((profissional) => {
        total.atendimentos += profissional.atendimentos;
        total.faturamento += profissional.faturamento;

        // Regra financeira da barbearia:
        // - dono: fica com todo o líquido após a taxa do cartão;
        // - barbeiro: a barbearia recebe somente o repasse calculado sobre o líquido.
        total.receitaBarbearia += profissional.dono
            ? Math.max(0, profissional.faturamento - profissional.taxas)
            : profissional.repasseBarbearia;

        profissional.servicos.forEach((qtd, nome) => {
            servicos.set(nome, (servicos.get(nome) || 0) + Number(qtd || 0));
        });
    });

    total.despesasBarbearia = (resumosBarbearia || []).reduce(
        (soma, resumo) =>
            soma + centavosParaReais(resumo?.despesasBarbeariaCentavos),
        0
    );

    total.lucroLiquido = total.receitaBarbearia - total.despesasBarbearia;

    total.ticket = total.atendimentos
        ? total.faturamento / total.atendimentos
        : 0;

    [...servicos.entries()].forEach(([nome, qtd]) => {
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

    const comMovimento = profissionais
        .filter((item) => item.atendimentos > 0 || item.faturamento > 0)
        .sort((a, b) => b.faturamento - a.faturamento);

    if (totalEl) {
        const qtd = comMovimento.length;
        totalEl.textContent = `${qtd} profissional${qtd === 1 ? "" : "is"}`;
    }

    if (!comMovimento.length) {
        lista.innerHTML =
            '<div class="barbearia-home-vazio">Nenhum atendimento registrado neste dia.</div>';
        return;
    }

    lista.innerHTML = comMovimento.map((item) => `
        <div class="relatorio-equipe-item barbearia-home-equipe-item">
            <div>
                <strong>${escapeHtml(item.nome)}</strong>
                <span>${item.atendimentos} atendimento${item.atendimentos === 1 ? "" : "s"}</span>
            </div>
            <div>
                <strong>${moeda(item.faturamento)}</strong>
                <span>Bruto</span>
            </div>
        </div>
    `).join("");
}

function escapeHtml(valor) {
    return String(valor ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function renderResumo(total, profissionais) {
    aplicarOrdemCardsVisaoGeral();
    if (el("barbeariaHomeLucro")) {
        el("barbeariaHomeLucro").textContent = moeda(total.lucroLiquido);
    }
    if (el("barbeariaHomeFaturamento")) {
        el("barbeariaHomeFaturamento").textContent = moeda(total.faturamento);
    }
    if (el("barbeariaHomeFaturamentoSub")) {
        el("barbeariaHomeFaturamentoSub").textContent = "Bruto do dia";
    }
    if (el("barbeariaHomeAtendimentos")) {
        el("barbeariaHomeAtendimentos").textContent = String(total.atendimentos);
    }
    if (el("barbeariaHomeTicket")) {
        el("barbeariaHomeTicket").textContent = moeda(total.ticket);
    }
    if (el("barbeariaHomeDespesas")) {
        el("barbeariaHomeDespesas").textContent = moeda(total.despesasBarbearia);
    }
    if (el("barbeariaHomeServico")) {
        el("barbeariaHomeServico").textContent = total.servicoMaisVendido;
    }
    if (el("barbeariaHomeServicoSub")) {
        el("barbeariaHomeServicoSub").textContent = total.servicoMaisVendidoQtd
            ? `${total.servicoMaisVendidoQtd} venda${total.servicoMaisVendidoQtd === 1 ? "" : "s"}`
            : "Nenhuma venda";
    }

    renderEquipe(profissionais);
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

    if (input) {
        input.max = chaveData(hoje);
        input.value = chaveData(dataSelecionada);
    }

    if (proxima) {
        const estaHoje = mesmoDia(dataSelecionada, hoje);
        proxima.disabled = estaHoje;
        proxima.setAttribute("aria-disabled", String(estaHoje));
    }
}

async function carregarDados({ forcar = false } = {}) {
    const membros = membrosAtivos(
        (state.equipe || []).length
            ? state.equipe
            : await listarMembrosEquipe()
    );

    const inicio = inicioDoDia(dataSelecionada);
    const fim = inicioDoDia(dataSelecionada);

    const [resumosEquipe, resumosBarbearia] = await Promise.all([
        Promise.all(
            membros.map(async (membro) => {
                const uid = String(membro?.uid || membro?.id || "").trim();
                const resumos = uid
                    ? await listarResumosProfissionalPorPeriodo(
                        uid,
                        inicio,
                        fim,
                        { forcar }
                    )
                    : [];

                return consolidarProfissional(membro, resumos);
            })
        ),
        listarResumosBarbeariaPorPeriodo(inicio, fim, { forcar })
    ]);

    const total = consolidarBarbearia(resumosEquipe, resumosBarbearia);
    renderResumo(total, resumosEquipe);
    setStatus();
}

export async function abrirVisaoGeralBarbearia({ forcar = false } = {}) {
    if (carregamentoEmAndamento && !forcar) {
        return carregamentoEmAndamento;
    }

    atualizarNavegadorData();

    const promessa = (async () => {
        try {
            await carregarDados({ forcar });
        } catch (error) {
            console.error("Erro ao carregar visão geral da barbearia:", error);
            setStatus(
                "Não foi possível carregar a visão geral agora. Tente atualizar.",
                "erro"
            );
        }
    })();

    carregamentoEmAndamento = promessa;

    try {
        return await promessa;
    } finally {
        if (carregamentoEmAndamento === promessa) {
            carregamentoEmAndamento = null;
        }
    }
}

async function selecionarData(novaData) {
    const hoje = inicioDoDia(new Date());
    const normalizada = inicioDoDia(novaData);

    dataSelecionada =
        normalizada.getTime() > hoje.getTime()
            ? hoje
            : normalizada;

    atualizarNavegadorData();
    await abrirVisaoGeralBarbearia();
}

function configurarEventos() {
    if (eventosConfigurados) return;
    eventosConfigurados = true;

    el("btnBarbeariaDataAnterior")?.addEventListener("click", () => {
        void selecionarData(somarDias(dataSelecionada, -1));
    });

    el("btnBarbeariaDataProxima")?.addEventListener("click", () => {
        if (mesmoDia(dataSelecionada, new Date())) return;
        void selecionarData(somarDias(dataSelecionada, 1));
    });

    const input = el("inputDataBarbeariaHome");
    const calendario = el("btnCalendarioBarbeariaHome");

    calendario?.addEventListener("click", () => {
        abrirCalendarioPopover({
            ancora: calendario,
            data: dataSelecionada,
            max: new Date(),
            titulo: "Visão Geral",
            onSelect: (data) => void selecionarData(data)
        });
    });

    // Mantido como fallback sem depender do seletor nativo.
    input?.addEventListener("change", () => {
        const escolhida = dataDeInput(input.value);
        if (escolhida) void selecionarData(escolhida);
    });

}

configurarEventos();
