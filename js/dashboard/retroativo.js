import { state, onStateChange } from "./state.js?v=4.0";
import { criarAtendimento } from "./data/atendimentos-repository.js?v=4.0";
import { recarregarAtendimentos } from "./data/sync.js?v=4.0";
import { criarPayloadAtendimento } from "./services/atendimento-model.js?v=4.0";
import { chaveData, dataRetroativaSemHora, inicioDoDia } from "./utils/date.js?v=4.0";
import { aplicarMascaraMoedaInput, converterParaNumero } from "./utils/money.js?v=4.0";

let inicializado = false;

const form = document.getElementById("formAtendimentoRetroativo");
const inputData = document.getElementById("retroData");
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

function aplicarPagamentoPadrao() {
    if (!selectPagamento || selectPagamento.value) return;
    const padrao = state.configSistema.pagamentoPadrao;
    if (["Pix", "Dinheiro", "Débito", "Crédito"].includes(padrao)) selectPagamento.value = padrao;
}

function limparFormulario() {
    form?.reset();
    if (campoValor) campoValor.hidden = true;
    if (campoObservacao) campoObservacao.hidden = true;
    aplicarPagamentoPadrao();
    atualizarLimiteData();
}

function mostrarStatus(texto, erro = false) {
    if (!status) return;
    status.textContent = texto;
    status.classList.toggle("error", erro);
}

export function initRetroativo() {
    if (inicializado) return;
    inicializado = true;

    atualizarLimiteData();
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
        const servico = selectServico?.value || "";
        const pagamento = selectPagamento?.value || "";
        const hoje = inicioDoDia(new Date());

        if (!data || inicioDoDia(data) > hoje) {
            mostrarStatus("Escolha uma data válida, sem usar dias futuros.", true);
            return;
        }
        if (!servico || !pagamento) {
            mostrarStatus("Selecione o serviço e a forma de pagamento.", true);
            return;
        }

        const valorPadrao = Number(state.configSistema.precos?.[servico] ?? 0);
        const valor = checkValor?.checked ? (converterParaNumero(inputValor?.value) || 0) : valorPadrao;
        if (valor <= 0) {
            mostrarStatus("Informe um valor válido para o atendimento.", true);
            return;
        }

        const observacao = checkObservacao?.checked
            ? String(inputObservacao?.value || "").trim().slice(0, 160)
            : "";

        const payload = criarPayloadAtendimento({
            servico,
            pagamento,
            valorBruto: valor,
            observacao,
            valorDiferenciado: Boolean(checkValor?.checked),
            dataAtendimento: data,
            retroativo: true,
            horaInformada: false
        }, state.configSistema);

        if (btnSalvar) {
            btnSalvar.disabled = true;
            btnSalvar.textContent = "Salvando...";
        }

        try {
            await criarAtendimento(payload);
            await recarregarAtendimentos();
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

    onStateChange("configSistema", aplicarPagamentoPadrao);
}
