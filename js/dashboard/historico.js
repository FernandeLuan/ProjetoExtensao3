import { state, onStateChange } from "./state.js?v=8.28";
import { excluirAtendimento, editarAtendimento } from "./data/atendimentos-repository.js?v=8.28";
import { garantirAtendimentosPeriodo, invalidarCacheAtendimentos } from "./data/sync.js?v=8.28";
import { listarMembrosEquipe } from "./data/equipe-repository.js?v=8.28";
import { criarAtualizacaoFinanceiraAtendimento } from "./services/atendimento-model.js?v=8.28";
import { obterServicoPorId, obterServicoPorNome, obterServicos, resolverPrecoServico, pagamentoEstaAtivo } from "./services/catalogo-service.js?v=8.28";
import { podeAdministrarNaVisaoAtual } from "./permissoes.js?v=8.28";
import { inicioDoDia, somarDias, chaveData, mesmoDia, formatarTituloData, dataDeInput, obterDataAtendimento, formatarDataHora } from "./utils/date.js?v=8.28";
import { formatarMoeda, converterParaNumero, aplicarMascaraMoedaInput } from "./utils/money.js?v=8.28";
import { escaparHtml } from "./utils/dom.js?v=8.28";
import { mostrarErro } from "./services/feedback-service.js?v=8.28";
import { abrirCalendarioPopover } from "./services/calendario-popover.js?v=8.28";

const historicoContainer = document.getElementById("historicoContainer");
const btnHistoricoAnterior = document.getElementById("btnHistoricoAnterior");
const btnHistoricoProxima = document.getElementById("btnHistoricoProxima");
const labelDataHistorico = document.getElementById("labelDataHistorico");
const btnCalendarioHistorico = document.getElementById("btnCalendarioHistorico");
const inputDataHistorico = document.getElementById("inputDataHistorico");
const historicoBusca = document.getElementById("historicoBusca");
const btnAbrirFiltrosHistorico = document.getElementById("btnAbrirFiltrosHistorico");
const historicoFiltroBadge = document.getElementById("historicoFiltroBadge");
const modalFiltrosHistorico = document.getElementById("modalFiltrosHistorico");
const btnFecharFiltrosHistorico = document.getElementById("btnFecharFiltrosHistorico");
const btnLimparFiltrosHistorico = document.getElementById("btnLimparFiltrosHistorico");
const btnAplicarFiltrosHistorico = document.getElementById("btnAplicarFiltrosHistorico");
const filtroServicoSelect = document.getElementById("filtroHistoricoServicoSelect");
const filtroPagamentoSelect = document.getElementById("filtroHistoricoPagamentoSelect");
const filtroProfissionalSelect = document.getElementById("filtroHistoricoProfissionalSelect");
const filtroProfissionalField = document.getElementById("filtroHistoricoProfissionalField");
const filtroHistoricoEditados = document.getElementById("filtroHistoricoEditados");
const filtroHistoricoAjustados = document.getElementById("filtroHistoricoAjustados");

const historicoDetalheOverlay = document.getElementById("historicoDetalheOverlay");
const historicoDetalheConteudo = document.getElementById("historicoDetalheConteudo");
const btnFecharDetalheHistorico = document.getElementById("btnFecharDetalheHistorico");

const modalConfirm = document.getElementById("modalConfirm");
const modalDescricao = document.getElementById("modalDescricao");
const btnConfirmar = document.getElementById("btnConfirmar");

const modalEditarHistorico = document.getElementById("modalEditarHistorico");
const btnFecharEdicaoHistorico = document.getElementById("btnFecharEdicaoHistorico");
const btnCancelarEdicaoHistorico = document.getElementById("btnCancelarEdicaoHistorico");
const btnSalvarEdicaoHistorico = document.getElementById("btnSalvarEdicaoHistorico");
const editServicoHistorico = document.getElementById("editServicoHistorico");
const editValorHistorico = document.getElementById("editValorHistorico");
const editPagamentoHistorico = document.getElementById("editPagamentoHistorico");
const editObservacaoHistorico = document.getElementById("editObservacaoHistorico");

let dataHistoricoSelecionada = inicioDoDia(new Date());
let filtroServico = "todos";
let filtroPagamento = "todos";
let filtroProfissional = null;
let profissionalEscolhidoExplicitamente = false;
let filtroEditados = false;
let filtroAjustados = false;
let rascunho = {};
let idParaExcluir = null;
let atendimentoEmEdicao = null;
let atendimentoDetalheAtual = null;

function normalizarTexto(valor) {
    return String(valor || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function nomeAtual() {
    return String(state.perfilUsuario?.nome || state.membroAtual?.nome || state.user?.displayName || state.user?.email || "Meu perfil").trim();
}

function nomeProfissional(atendimento) {
    const uid = atendimento?.profissionalUid;
    const membro = (state.equipe || []).find((item) => (item.uid || item.id) === uid);

    // UID é a identidade estável. Se o administrador corrigir o nome do profissional,
    // o Histórico passa a exibir o nome atual sem alterar snapshots financeiros antigos.
    if (membro?.nome) return String(membro.nome);
    if (uid === state.user?.uid) return nomeAtual();
    if (atendimento?.profissionalNome) return String(atendimento.profissionalNome);
    return "Profissional não identificado";
}

function nomeRegistrador(atendimento) {
    const uid = atendimento?.registradoPorUid;
    const membro = (state.equipe || []).find((item) => (item.uid || item.id) === uid);

    if (membro?.nome) return String(membro.nome);
    if (uid === state.user?.uid) return nomeAtual();
    if (atendimento?.registradoPorNome) return String(atendimento.registradoPorNome);
    return "Não identificado";
}

function obterBruto(a) {
    return Number(a?.valorBrutoTotal ?? a?.valorBruto ?? a?.valorServicoBruto ?? 0);
}

function atendimentoTemValorAjustado(a, bruto = obterBruto(a)) {
    if (a?.valorDiferenciado === true) return true;
    if (a?.valorDiferenciado === false) return false;
    const esperado = Number(a?.precoProfissional ?? a?.precoBase ?? state.configSistema.precos?.[a?.servico]);
    return Number.isFinite(esperado) && esperado > 0 ? Math.abs(bruto - esperado) > .009 : false;
}

function rotuloDataHora(a) {
    const data = obterDataAtendimento(a);
    if (!data) return "—";
    const dia = data.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }).replace(".", "");
    if (a?.retroativo === true && a?.horaInformada === false) return `${dia} • Retroativo`;
    return `${dia} • ${data.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
}

function rotuloHoraCard(a) {
    const data = obterDataAtendimento(a);
    if (!data) return "—";
    if (a?.retroativo === true && a?.horaInformada === false) return "Retroativo";
    return data.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function iconePagamento(pagamento) {
    if (pagamento === "Pix") return "fa-qrcode";
    if (pagamento === "Dinheiro") return "fa-money-bill-wave";
    if (pagamento === "Débito" || pagamento === "Crédito") return "fa-credit-card";
    return "fa-wallet";
}

function classePagamento(pagamento) {
    if (pagamento === "Pix") return "pix";
    if (pagamento === "Dinheiro") return "dinheiro";
    if (pagamento === "Débito") return "debito";
    if (pagamento === "Crédito") return "credito";
    return "outro";
}

function registroLegadoSemProfissional(a) {
    return !a?.profissionalUid;
}

function atualizarNavegadorHistorico() {
    const hoje = inicioDoDia(new Date());
    if (inputDataHistorico) {
        inputDataHistorico.max = chaveData(hoje);
        inputDataHistorico.value = chaveData(dataHistoricoSelecionada);
    }
    if (labelDataHistorico) labelDataHistorico.textContent = formatarTituloData(dataHistoricoSelecionada);
    if (btnHistoricoProxima) {
        const hojeSelecionado = mesmoDia(dataHistoricoSelecionada, hoje);
        btnHistoricoProxima.disabled = hojeSelecionado;
        btnHistoricoProxima.setAttribute("aria-disabled", String(hojeSelecionado));
    }
}

async function selecionarDataHistorico(data) {
    const hoje = inicioDoDia(new Date());
    const nova = inicioDoDia(data);
    dataHistoricoSelecionada = nova > hoje ? hoje : nova;
    fecharDetalheHistorico(true);
    try {
        await garantirAtendimentosPeriodo(
            dataHistoricoSelecionada,
            dataHistoricoSelecionada,
            podeAdministrarNaVisaoAtual()
                ? {}
                : { profissionalUid: state.user?.uid || null }
        );
    } catch (error) {
        console.error(error);
        mostrarErro("Não foi possível carregar este dia.");
    }
    atualizarHistorico();
}

export async function abrirHistoricoHoje() {
    dataHistoricoSelecionada = inicioDoDia(new Date());
    definirFiltroPadraoProfissional();
    if (historicoBusca) {
        historicoBusca.placeholder = podeAdministrarNaVisaoAtual()
            ? "Buscar barbeiro, serviço ou pagamento"
            : "Buscar serviço ou pagamento";
    }
    try {
        if (podeAdministrarNaVisaoAtual() && !(state.equipe || []).length) {
            await listarMembrosEquipe();
        }
        await garantirAtendimentosPeriodo(
            dataHistoricoSelecionada,
            dataHistoricoSelecionada,
            podeAdministrarNaVisaoAtual()
                ? {}
                : { profissionalUid: state.user?.uid || null }
        );
    } catch (error) { console.error(error); }
    prepararFiltrosDinamicos();
    atualizarHistorico();
}

function definirFiltroPadraoProfissional() {
    filtroProfissional = podeAdministrarNaVisaoAtual() ? "todos" : (state.user?.uid || "todos");
    profissionalEscolhidoExplicitamente = false;
}

function prepararFiltrosDinamicos() {
    if (filtroServicoSelect) {
        const atual = filtroServicoSelect.value || filtroServico;
        filtroServicoSelect.innerHTML = '<option value="todos">Todos os serviços</option>';
        obterServicos({ somenteAtivos: false }).forEach((servico) => {
            const opt = document.createElement("option");
            opt.value = servico.id || servico.nome;
            opt.textContent = servico.nome;
            filtroServicoSelect.appendChild(opt);
        });
        filtroServicoSelect.value = [...filtroServicoSelect.options].some(o => o.value === atual) ? atual : "todos";
    }

    if (filtroProfissionalField) filtroProfissionalField.hidden = !podeAdministrarNaVisaoAtual();
    if (filtroProfissionalSelect && podeAdministrarNaVisaoAtual()) {
        const atual = filtroProfissional || filtroProfissionalSelect.value || "todos";
        filtroProfissionalSelect.innerHTML = '<option value="todos">Todos os profissionais</option>';
        const vistos = new Set();
        const membros = [
            { uid: state.user?.uid, nome: nomeAtual(), ativo: true },
            ...(state.equipe || [])
        ];
        membros.filter(m => m?.ativo !== false).forEach((membro) => {
            const uid = membro.uid || membro.id;
            if (!uid || vistos.has(uid)) return;
            vistos.add(uid);
            const opt = document.createElement("option");
            opt.value = uid;
            opt.textContent = membro.nome || (uid === state.user?.uid ? nomeAtual() : membro.email || "Profissional");
            filtroProfissionalSelect.appendChild(opt);
        });

        const existemLegados = (state.atendimentos || []).some((atendimento) => !atendimento?.profissionalUid);
        if (existemLegados) {
            const optLegado = document.createElement("option");
            optLegado.value = "__sem_profissional__";
            optLegado.textContent = "Sem profissional (registro antigo)";
            filtroProfissionalSelect.appendChild(optLegado);
        }

        filtroProfissionalSelect.value = [...filtroProfissionalSelect.options].some(o => o.value === atual) ? atual : "todos";
    }
}

function filtrosAtivosCount() {
    let n = 0;
    if (filtroServico !== "todos") n++;
    if (filtroPagamento !== "todos") n++;
    if (podeAdministrarNaVisaoAtual() && filtroProfissional !== "todos") n++;
    if (filtroEditados) n++;
    if (filtroAjustados) n++;
    return n;
}

function atualizarBadgeFiltros() {
    const n = filtrosAtivosCount();
    if (historicoFiltroBadge) {
        historicoFiltroBadge.hidden = n === 0;
        historicoFiltroBadge.textContent = String(n);
    }
    btnAbrirFiltrosHistorico?.classList.toggle("active", n > 0);
}

function abrirFiltrosHistorico() {
    prepararFiltrosDinamicos();
    rascunho = { servico: filtroServico, pagamento: filtroPagamento, profissional: filtroProfissional, editados: filtroEditados, ajustados: filtroAjustados };
    if (filtroServicoSelect) filtroServicoSelect.value = rascunho.servico;
    if (filtroPagamentoSelect) filtroPagamentoSelect.value = rascunho.pagamento;
    if (filtroProfissionalSelect && podeAdministrarNaVisaoAtual()) filtroProfissionalSelect.value = rascunho.profissional || "todos";
    if (filtroHistoricoEditados) filtroHistoricoEditados.checked = rascunho.editados;
    if (filtroHistoricoAjustados) filtroHistoricoAjustados.checked = rascunho.ajustados;
    modalFiltrosHistorico?.classList.add("active");
    modalFiltrosHistorico?.setAttribute("aria-hidden", "false");
}

function fecharFiltrosHistorico() {
    modalFiltrosHistorico?.classList.remove("active");
    modalFiltrosHistorico?.setAttribute("aria-hidden", "true");
}

function atendimentoPassaFiltros(a) {
    const busca = normalizarTexto(historicoBusca?.value);
    const prof = nomeProfissional(a);
    const textoBusca = normalizarTexto(`${prof} ${a.servicoNome || a.servico || ""} ${a.pagamento || ""}`);
    if (busca && !textoBusca.includes(busca)) return false;

    // A busca sempre respeita o profissional selecionado.
    // Na visão Barbearia o admin abre em "Todos os profissionais"; na visão Profissional permanece no próprio histórico.
    if (filtroProfissional && filtroProfissional !== "todos") {
        if (filtroProfissional === "__sem_profissional__") {
            if (a.profissionalUid) return false;
        } else if (a.profissionalUid !== filtroProfissional) {
            return false;
        }
    }

    if (filtroServico !== "todos") {
        const id = a.servicoId || obterServicoPorNome(a.servicoNome || a.servico)?.id || a.servico;
        if (id !== filtroServico && a.servico !== filtroServico) return false;
    }
    if (filtroPagamento !== "todos" && a.pagamento !== filtroPagamento) return false;
    if (filtroEditados && a.editado !== true) return false;
    if (filtroAjustados && !atendimentoTemValorAjustado(a)) return false;
    return true;
}

function atendimentoTemDetalheEspecial(a) {
    const outroProfissional = Boolean(a.profissionalUid && a.profissionalUid !== state.user?.uid);
    const outroRegistrador = Boolean(a.registradoPorUid && a.profissionalUid && a.registradoPorUid !== a.profissionalUid);
    const legado = registroLegadoSemProfissional(a);

    return Boolean(
        String(a.observacao || "").trim() ||
        a.editado ||
        atendimentoTemValorAjustado(a) ||
        a.retroativo ||
        outroProfissional ||
        outroRegistrador ||
        legado
    );
}

export function atualizarHistorico() {
    if (!historicoContainer) return;
    atualizarNavegadorHistorico();
    atualizarBadgeFiltros();
    historicoContainer.innerHTML = "";
    const chave = chaveData(dataHistoricoSelecionada);
    const lista = (state.atendimentos || [])
        .filter(a => { const d = obterDataAtendimento(a); return d && chaveData(d) === chave; })
        .sort((a,b) => obterDataAtendimento(b) - obterDataAtendimento(a))
        .filter(atendimentoPassaFiltros);

    if (!lista.length) {
        historicoContainer.innerHTML = `<div class="historico-vazio">${historicoBusca?.value || filtrosAtivosCount() ? "Nenhum atendimento encontrado com os filtros atuais." : "Nenhum atendimento registrado neste dia."}</div>`;
        return;
    }

    lista.forEach((a) => {
        const especial = atendimentoTemDetalheEspecial(a);
        const pagamento = a.pagamento || "—";
        const bruto = obterBruto(a);
        const liquido = Number(a.valorLiquido ?? bruto);
        const podeExcluir = podeAdministrarNaVisaoAtual();
        const card = document.createElement("article");

        card.className = "historico-card";

        card.innerHTML = `
            <div class="hist-left">
                <div class="hist-servico-row">
                    <div class="hist-servico">${escaparHtml(a.servicoNome || a.servico || "Atendimento")}</div>
                </div>

                <div class="hist-meta">
                    <span class="hist-hora">${escaparHtml(rotuloHoraCard(a))}</span>
                    <span class="hist-pagamento ${classePagamento(pagamento)}">
                        <i class="fas ${iconePagamento(pagamento)}" aria-hidden="true"></i>
                        ${escaparHtml(pagamento)}
                    </span>
                    ${especial ? `
                        <button
                            type="button"
                            class="btn-info-hist"
                            aria-label="Ver informações deste atendimento"
                            title="Ver informações"
                        >
                            <i class="fas fa-circle-info" aria-hidden="true"></i>
                        </button>
                    ` : ""}
                </div>
            </div>

            <div class="hist-right">
                <div class="hist-valores">
                    <span class="hist-bruto">R$ ${formatarMoeda(bruto)}</span>
                    <span class="hist-liquido">Líq. R$ ${formatarMoeda(liquido)}</span>
                </div>

                <div class="hist-actions">
                    <button
                        type="button"
                        class="btn-edit-hist"
                        aria-label="Editar atendimento"
                        title="Editar atendimento"
                    >
                        <i class="fas fa-pen" aria-hidden="true"></i>
                    </button>

                    ${podeExcluir ? `
                        <button
                            type="button"
                            class="btn-delete-hist"
                            aria-label="Excluir atendimento"
                            title="Excluir atendimento"
                        >
                            <i class="fas fa-trash" aria-hidden="true"></i>
                        </button>
                    ` : ""}
                </div>
            </div>
        `;

        card.querySelector(".btn-info-hist")
            ?.addEventListener("click", () => abrirDetalheHistorico(a));

        card.querySelector(".btn-edit-hist")
            ?.addEventListener("click", () => abrirModalEdicao(a, bruto));

        card.querySelector(".btn-delete-hist")
            ?.addEventListener("click", () => abrirModalExclusao(
                a.id,
                a.servicoNome || a.servico || "Atendimento",
                bruto
            ));

        historicoContainer.appendChild(card);
    });
}

function abrirDetalheHistorico(a) {
    if (!historicoDetalheConteudo || !historicoDetalheOverlay) return;
    atendimentoDetalheAtual = a;
    const bruto = obterBruto(a);
    const obs = String(a.observacao || "").trim();
    const ajustado = atendimentoTemValorAjustado(a, bruto);
    const outroRegistrador = Boolean(a.registradoPorUid && a.profissionalUid && a.registradoPorUid !== a.profissionalUid);
    const outroProfissional = Boolean(a.profissionalUid && a.profissionalUid !== state.user?.uid);
    const legado = registroLegadoSemProfissional(a);
    const mostrarProfissional = podeAdministrarNaVisaoAtual() && (outroProfissional || filtroProfissional === "todos" || legado);
    const registradorConhecido = Boolean(a.registradoPorUid || a.registradoPorNome);

    historicoDetalheConteudo.innerHTML = `
      <div class="historico-detalhe-title"><span>Atendimento</span><h3 id="historicoDetalheTitulo">${escaparHtml(a.servicoNome || a.servico || "Atendimento")}</h3><strong class="historico-detalhe-value">R$ ${formatarMoeda(bruto)}</strong></div>
      <div class="historico-detalhe-meta">
        <span><i class="fas fa-calendar-day"></i> ${escaparHtml(rotuloDataHora(a))}</span>
        <span><i class="fas fa-wallet"></i> ${escaparHtml(a.pagamento || "—")}</span>
        ${mostrarProfissional && !legado ? `<span><i class="fas fa-user"></i> ${escaparHtml(nomeProfissional(a))}</span>` : ""}
      </div>
      ${(ajustado || a.editado || a.retroativo || legado) ? `<div class="historico-detalhe-flags">${ajustado ? '<span class="hist-valor-ajustado"><i class="fas fa-tag"></i> Valor ajustado</span>' : ""}${a.editado ? '<span class="hist-editado"><i class="fas fa-pen"></i> Editado</span>' : ""}${a.retroativo ? '<span class="hist-retroativo"><i class="fas fa-clock-rotate-left"></i> Retroativo</span>' : ""}${legado ? '<span class="hist-legado"><i class="fas fa-box-archive"></i> Registro antigo</span>' : ""}</div>` : ""}
      ${obs ? `<div class="historico-detalhe-block"><span>Observação</span><p>${escaparHtml(obs)}</p></div>` : ""}
      ${legado ? `<div class="historico-detalhe-block"><span>Profissional</span><p>Registro antigo sem profissional atribuído. O Administrador pode corrigir esses registros pela ferramenta de migração.</p></div>` : ""}
      ${(a.retroativo || outroRegistrador) && registradorConhecido ? `<div class="historico-detalhe-block"><span>Registrado por</span><p>${escaparHtml(nomeRegistrador(a))}${a.retroativo ? " • atendimento retroativo" : ""}</p></div>` : ""}
      ${a.editado ? `<div class="historico-detalhe-block"><span>Última edição</span><p>${escaparHtml(formatarDataHora(a.editadoEm))}</p></div>` : ""}`;
    historicoDetalheOverlay.classList.add("active");
    historicoDetalheOverlay.setAttribute("aria-hidden", "false");
}

function fecharDetalheHistorico(forcar = false) {
    if (atendimentoEmEdicao && !forcar) return;
    historicoDetalheOverlay?.classList.remove("active");
    historicoDetalheOverlay?.setAttribute("aria-hidden", "true");
    atendimentoDetalheAtual = null;
}

function membroDoAtendimento(a) {
    const uid = a?.profissionalUid;
    if (!uid || uid === state.user?.uid) return state.membroAtual;
    return (state.equipe || []).find(item => (item.uid || item.id) === uid) || null;
}

function preencherSelectsEdicao(a) {
    if (editServicoHistorico) {
        const atual = a.servicoNome || a.servico || "";
        editServicoHistorico.innerHTML = "";
        obterServicos({ somenteAtivos:true }).forEach(servico => {
            const o=document.createElement("option"); o.value=servico.nome; o.dataset.servicoId=servico.id; o.textContent=servico.nome; editServicoHistorico.appendChild(o);
        });
        if (atual && ![...editServicoHistorico.options].some(o=>o.value===atual)) { const o=document.createElement("option"); o.value=atual; o.dataset.servicoId=a.servicoId||""; o.textContent=`${atual} (histórico)`; editServicoHistorico.appendChild(o); }
        editServicoHistorico.value=atual;
    }
    if (editPagamentoHistorico) {
        const atual=a.pagamento||"Dinheiro"; editPagamentoHistorico.innerHTML="";
        ["Pix","Dinheiro","Débito","Crédito"].forEach(p=>{ if(!pagamentoEstaAtivo(p)&&p!==atual)return; const o=document.createElement("option");o.value=p;o.textContent=pagamentoEstaAtivo(p)?p:`${p} (desativado)`;editPagamentoHistorico.appendChild(o); });
        editPagamentoHistorico.value=atual;
    }
}

function servicoSelecionadoEdicao() {
    const o=editServicoHistorico?.selectedOptions?.[0]; const id=o?.dataset?.servicoId||null;
    return id ? obterServicoPorId(id) : obterServicoPorNome(editServicoHistorico?.value);
}

function marcarErroEdicao(elemento) {
    elemento?.classList.add("input-erro","shake");
    setTimeout(()=>elemento?.classList.remove("shake"),500);
    setTimeout(()=>elemento?.classList.remove("input-erro"),3000);
}

function abrirModalEdicao(a, bruto) {
    fecharDetalheHistorico(true);
    atendimentoEmEdicao = a;
    preencherSelectsEdicao(a);

    if (editValorHistorico) editValorHistorico.value = formatarMoeda(bruto);
    if (editObservacaoHistorico) editObservacaoHistorico.value = String(a.observacao || "").slice(0, 160);

    modalEditarHistorico?.classList.add("active");
    modalEditarHistorico?.setAttribute("aria-hidden", "false");

    setTimeout(() => editServicoHistorico?.focus(), 0);
}

function fecharModalEdicao() {
    modalEditarHistorico?.classList.remove("active");
    modalEditarHistorico?.setAttribute("aria-hidden", "true");
    atendimentoEmEdicao = null;
}

editServicoHistorico?.addEventListener("change",()=>{ if(!atendimentoEmEdicao)return; const s=servicoSelecionadoEdicao(); const r=s?resolverPrecoServico(s,membroDoAtendimento(atendimentoEmEdicao)):null; if(editValorHistorico&&Number(r?.preco)>0) editValorHistorico.value=formatarMoeda(r.preco); });
editValorHistorico?.addEventListener("input",()=>{ aplicarMascaraMoedaInput(editValorHistorico); editValorHistorico.classList.remove("input-erro"); });
btnFecharEdicaoHistorico?.addEventListener("click",fecharModalEdicao);
btnCancelarEdicaoHistorico?.addEventListener("click",fecharModalEdicao);

btnSalvarEdicaoHistorico?.addEventListener("click",async()=>{
    if(!atendimentoEmEdicao?.id)return;
    const original=atendimentoEmEdicao, brutoOriginal=obterBruto(original);
    const servicoNome=editServicoHistorico?.value||"", pagamento=editPagamentoHistorico?.value||"", valorBruto=converterParaNumero(editValorHistorico?.value)||0;
    const observacao=String(editObservacaoHistorico?.value||"").trim().slice(0,160);
    let erro=false;
    if(!servicoNome){marcarErroEdicao(editServicoHistorico);erro=true;}
    if(!pagamento){marcarErroEdicao(editPagamentoHistorico);erro=true;}
    if(valorBruto<=0){marcarErroEdicao(editValorHistorico);erro=true;}
    if(erro)return;
    const nomeOriginal=original.servicoNome||original.servico;
    const alterouFinanceiro=servicoNome!==nomeOriginal||pagamento!==original.pagamento||Math.abs(valorBruto-brutoOriginal)>.009;
    const alterouObservacao=observacao!==String(original.observacao||"").trim();
    if(!alterouFinanceiro&&!alterouObservacao){fecharModalEdicao();return;}
    let atualizacao={observacao};
    if(alterouFinanceiro){
      const servico=servicoSelecionadoEdicao();
      const preco=servico?resolverPrecoServico(servico,membroDoAtendimento(original)):{preco:Number(original.precoProfissional??original.precoBase??valorBruto),precoBase:Number(original.precoBase??valorBruto),precoProfissional:original.precoProfissional??null,origem:original.origemPreco||"padrao"};
      const esperado=Number(preco.preco||0), valorDiferenciado=esperado>0?Math.abs(valorBruto-esperado)>.009:true;
      atualizacao=criarAtualizacaoFinanceiraAtendimento({servico:servicoNome,servicoId:servico?.id||original.servicoId||null,precoBase:preco.precoBase,precoProfissional:preco.precoProfissional,origemPreco:preco.origem,pagamento,valorBruto,observacao,valorDiferenciado},state.configSistema,original);
    }
    const texto=btnSalvarEdicaoHistorico.textContent; btnSalvarEdicaoHistorico.textContent="Salvando...";btnSalvarEdicaoHistorico.disabled=true;
    try{await editarAtendimento(original.id,atualizacao);fecharModalEdicao();fecharDetalheHistorico(true);invalidarCacheAtendimentos();atualizarHistorico();}
    catch(error){console.error(error);mostrarErro("Não foi possível salvar a alteração.");}
    finally{btnSalvarEdicaoHistorico.textContent=texto;btnSalvarEdicaoHistorico.disabled=false;}
});

function fecharModalExclusao() {
    modalConfirm?.classList.remove("active");
    modalConfirm?.setAttribute("aria-hidden", "true");
    idParaExcluir = null;
}

function abrirModalExclusao(id, servico, valor) {
    fecharDetalheHistorico(true);
    idParaExcluir = id;

    if (modalDescricao) {
        modalDescricao.innerHTML = `Excluir o atendimento de <b>${escaparHtml(servico)} (R$ ${formatarMoeda(valor)})</b>?`;
    }

    modalConfirm?.classList.add("active");
    modalConfirm?.setAttribute("aria-hidden", "false");
}

document.getElementById("btnCancelar")?.addEventListener("click", fecharModalExclusao);

btnConfirmar?.addEventListener("click", async () => {
    if (!idParaExcluir) return;

    btnConfirmar.disabled = true;
    btnConfirmar.textContent = "Excluindo...";

    try {
        await excluirAtendimento(idParaExcluir);
        invalidarCacheAtendimentos();
        atualizarHistorico();
        fecharDetalheHistorico(true);
    } catch (error) {
        console.error(error);
        mostrarErro("Não foi possível excluir o atendimento.");
    } finally {
        btnConfirmar.disabled = false;
        btnConfirmar.textContent = "Excluir";
        fecharModalExclusao();
    }
});

btnHistoricoAnterior?.addEventListener("click",()=>selecionarDataHistorico(somarDias(dataHistoricoSelecionada,-1)));
btnHistoricoProxima?.addEventListener("click",()=>{if(!mesmoDia(dataHistoricoSelecionada,inicioDoDia(new Date())))selecionarDataHistorico(somarDias(dataHistoricoSelecionada,1));});
btnCalendarioHistorico?.addEventListener("click", () => {
    abrirCalendarioPopover({
        ancora: btnCalendarioHistorico,
        data: dataHistoricoSelecionada,
        max: new Date(),
        titulo: "Histórico",
        onSelect: (data) => void selecionarDataHistorico(data)
    });
});
inputDataHistorico?.addEventListener("change",()=>{const d=dataDeInput(inputDataHistorico?.value);if(d)selecionarDataHistorico(d);});
historicoBusca?.addEventListener("input",atualizarHistorico);
btnAbrirFiltrosHistorico?.addEventListener("click",abrirFiltrosHistorico);
btnFecharFiltrosHistorico?.addEventListener("click",fecharFiltrosHistorico);
modalFiltrosHistorico?.addEventListener("click",e=>{if(e.target===modalFiltrosHistorico)fecharFiltrosHistorico();});
btnAplicarFiltrosHistorico?.addEventListener("click",()=>{
    filtroServico=filtroServicoSelect?.value||"todos"; filtroPagamento=filtroPagamentoSelect?.value||"todos";
    if(podeAdministrarNaVisaoAtual()){filtroProfissional=filtroProfissionalSelect?.value||"todos";profissionalEscolhidoExplicitamente=true;} else filtroProfissional=state.user?.uid||"todos";
    filtroEditados=Boolean(filtroHistoricoEditados?.checked);filtroAjustados=Boolean(filtroHistoricoAjustados?.checked);fecharFiltrosHistorico();atualizarHistorico();
});
btnLimparFiltrosHistorico?.addEventListener("click",()=>{filtroServico="todos";filtroPagamento="todos";filtroEditados=false;filtroAjustados=false;definirFiltroPadraoProfissional();if(historicoBusca)historicoBusca.value="";fecharFiltrosHistorico();atualizarHistorico();});
btnFecharDetalheHistorico?.addEventListener("click",()=>fecharDetalheHistorico());
historicoDetalheOverlay?.addEventListener("click",e=>{if(e.target===historicoDetalheOverlay)fecharDetalheHistorico();});
modalEditarHistorico?.addEventListener("click", (event) => {
    if (event.target === modalEditarHistorico) fecharModalEdicao();
});
modalConfirm?.addEventListener("click", (event) => {
    if (event.target === modalConfirm) fecharModalExclusao();
});
document.addEventListener("keydown",e=>{
    if(e.key!=="Escape")return;
    if(modalEditarHistorico?.classList.contains("active")){fecharModalEdicao();return;}
    if(modalConfirm?.classList.contains("active")){fecharModalExclusao();return;}
    if(modalFiltrosHistorico?.classList.contains("active")){fecharFiltrosHistorico();return;}
    if(historicoDetalheOverlay?.classList.contains("active"))fecharDetalheHistorico();
});

if (!filtroProfissional) definirFiltroPadraoProfissional();
prepararFiltrosDinamicos();
atualizarBadgeFiltros();
function historicoEstaVisivel(){
    const secao=document.getElementById("historico");
    return Boolean(secao && getComputedStyle(secao).display !== "none");
}

onStateChange("atendimentos",()=>{if(historicoEstaVisivel())atualizarHistorico();});
onStateChange("configSistema",()=>{if(!historicoEstaVisivel())return;prepararFiltrosDinamicos();atualizarHistorico();});
onStateChange("equipe",()=>{if(!historicoEstaVisivel())return;prepararFiltrosDinamicos();atualizarHistorico();});
onStateChange("perfilUsuario",()=>{if(!historicoEstaVisivel())return;prepararFiltrosDinamicos();atualizarHistorico();});
onStateChange("user",()=>{if(!historicoEstaVisivel())return;if(!profissionalEscolhidoExplicitamente)definirFiltroPadraoProfissional();prepararFiltrosDinamicos();atualizarHistorico();});
