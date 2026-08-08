import { state, onStateChange } from "./state.js?v=6.1";
import { criarAtendimento } from "./data/atendimentos-repository.js?v=6.1";
import { listarMembrosEquipe } from "./data/equipe-repository.js?v=6.1";
import { invalidarCacheAtendimentos, recarregarAtendimentosDoDia } from "./data/sync.js?v=6.1";
import { criarPayloadAtendimento } from "./services/atendimento-model.js?v=6.1";
import { obterServicos, obterServicoPorId, resolverPrecoServico, pagamentoEstaAtivo } from "./services/catalogo-service.js?v=6.1";
import { chaveData, dataRetroativaSemHora, inicioDoDia } from "./utils/date.js?v=6.1";
import { aplicarMascaraMoedaInput, converterParaNumero } from "./utils/money.js?v=6.1";

let inicializado = false;

const form = document.getElementById("formAtendimentoRetroativo");
const inputData = document.getElementById("retroData");
const selectProfissional = document.getElementById("retroProfissional");
const selectServico = document.getElementById("retroServico");
const selectPagamento = document.getElementById("retroPagamento");
const checkValor = document.getElementById("retroValorDiferenciado");
const campoValor = document.getElementById("retroCampoValor");
const inputValor = document.getElementById("retroValor");
const checkObservacao = document.getElementById("retroTemObservacao");
const campoObservacao = document.getElementById("retroCampoObservacao");
const inputObservacao = document.getElementById("retroObservacao");
const btnSalvar = document.getElementById("btnSalvarRetroativo");
const status = document.getElementById("retroStatus");

function atualizarLimiteData() {
    if (inputData) inputData.max = chaveData(inicioDoDia(new Date()));
}

function membroSelecionado() {
    const uid = selectProfissional?.value || state.user?.uid;
    return (state.equipe || []).find((item) => (item.uid || item.id) === uid) || state.membroAtual;
}

function renderizarOpcoes() {
    if (selectServico) {
        const atual = selectServico.value;
        selectServico.innerHTML = '<option value="">Selecione</option>';
        obterServicos({ somenteAtivos: true }).forEach((servico) => {
            const option = document.createElement("option");
            option.value = servico.id;
            option.textContent = servico.nome;
            selectServico.appendChild(option);
        });
        if (obterServicoPorId(atual)) selectServico.value = atual;
    }

    if (selectPagamento) {
        const atual = selectPagamento.value;
        selectPagamento.innerHTML = '<option value="">Selecione</option>';
        ["Pix", "Dinheiro", "Débito", "Crédito"].forEach((pagamento) => {
            if (!pagamentoEstaAtivo(pagamento)) return;
            const option = document.createElement("option");
            option.value = pagamento;
            option.textContent = pagamento;
            selectPagamento.appendChild(option);
        });
        if (pagamentoEstaAtivo(atual)) selectPagamento.value = atual;
    }
}

async function prepararProfissionais() {
    if (!selectProfissional) return;
    const membros = await listarMembrosEquipe();
    selectProfissional.innerHTML = "";
    membros.filter((membro) => membro.ativo === true).forEach((membro) => {
        const option = document.createElement("option");
        option.value = membro.uid || membro.id;
        option.textContent = membro.uid === state.user?.uid ? `Eu • ${membro.nome || membro.email}` : (membro.nome || membro.email);
        selectProfissional.appendChild(option);
    });
    selectProfissional.value = state.user?.uid || "";
}

function aplicarPagamentoPadrao() {
    if (!selectPagamento || selectPagamento.value) return;
    const padrao = state.configSistema.pagamentoPadrao;
    if (pagamentoEstaAtivo(padrao)) selectPagamento.value = padrao;
}

function limparFormulario() {
    form?.reset();
    if (campoValor) campoValor.hidden = true;
    if (campoObservacao) campoObservacao.hidden = true;
    if (selectProfissional) selectProfissional.value = state.user?.uid || selectProfissional.options[0]?.value || "";
    renderizarOpcoes();
    aplicarPagamentoPadrao();
    atualizarLimiteData();
}

function mostrarStatus(texto, erro = false) {
    if (!status) return;
    status.textContent = texto;
    status.classList.toggle("error", erro);
}

export async function initRetroativo() {
    if (inicializado) return;
    inicializado = true;

    atualizarLimiteData();
    await prepararProfissionais();
    renderizarOpcoes();
    aplicarPagamentoPadrao();

    checkValor?.addEventListener("change", () => {
        if (campoValor) campoValor.hidden = !checkValor.checked;
        if (!checkValor.checked && inputValor) inputValor.value = "";
        if (checkValor.checked) setTimeout(() => inputValor?.focus(), 0);
    });

    checkObservacao?.addEventListener("change", () => {
        if (campoObservacao) campoObservacao.hidden = !checkObservacao.checked;
        if (!checkObservacao.checked && inputObservacao) inputObservacao.value = "";
        if (checkObservacao.checked) setTimeout(() => inputObservacao?.focus(), 0);
    });

    inputValor?.addEventListener("input", () => aplicarMascaraMoedaInput(inputValor));

    form?.addEventListener("submit", async (event) => {
        event.preventDefault();
        mostrarStatus("");

        const data = dataRetroativaSemHora(inputData?.value);
        const servico = obterServicoPorId(selectServico?.value || "");
        const pagamento = selectPagamento?.value || "";
        const profissional = membroSelecionado();
        const hoje = inicioDoDia(new Date());

        if (!data || inicioDoDia(data) > hoje) {
            mostrarStatus("Escolha uma data válida, sem usar dias futuros.", true);
            return;
        }
        if (!servico || !pagamento || !profissional) {
            mostrarStatus("Selecione profissional, serviço e forma de pagamento.", true);
            return;
        }

        const preco = resolverPrecoServico(servico, profissional);
        const valor = checkValor?.checked ? (converterParaNumero(inputValor?.value) || 0) : preco.preco;
        if (valor <= 0) {
            mostrarStatus("Informe um valor válido para o atendimento.", true);
            return;
        }

        const observacao = checkObservacao?.checked
            ? String(inputObservacao?.value || "").trim().slice(0, 160)
            : "";

        const payload = criarPayloadAtendimento({
            servico: servico.nome,
            servicoId: servico.id,
            servicoNome: servico.nome,
            precoBase: preco.precoBase,
            precoProfissional: preco.precoProfissional,
            origemPreco: preco.origem,
            pagamento,
            valorBruto: valor,
            observacao,
            valorDiferenciado: Boolean(checkValor?.checked),
            dataAtendimento: data,
            retroativo: true,
            horaInformada: false,
            profissional
        }, state.configSistema);

        if (btnSalvar) {
            btnSalvar.disabled = true;
            btnSalvar.textContent = "Salvando...";
        }

        try {
            await criarAtendimento(payload);
            invalidarCacheAtendimentos();
            await recarregarAtendimentosDoDia(data);
            limparFormulario();
            mostrarStatus("Atendimento retroativo salvo ✓");
            setTimeout(() => {
                if (status?.textContent === "Atendimento retroativo salvo ✓") mostrarStatus("");
            }, 3000);
        } catch (error) {
            console.error("Erro ao registrar atendimento retroativo:", error);
            mostrarStatus("Não foi possível salvar o atendimento.", true);
        } finally {
            if (btnSalvar) {
                btnSalvar.disabled = false;
                btnSalvar.textContent = "Salvar Atendimento";
            }
        }
    });

    onStateChange("configSistema", () => {
        renderizarOpcoes();
        aplicarPagamentoPadrao();
    });
}
