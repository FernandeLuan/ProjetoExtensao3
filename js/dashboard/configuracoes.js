import { db } from "../firebase-init.js";
import {
    doc,
    getDoc,
    setDoc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

import { state } from "./state.js";
import { formatarMoeda, converterParaNumero } from "./utils.js";

// =============================
// CONFIGURAÇÕES
// =============================
export async function carregarConfiguracoes() {
    try {
        const docRef = doc(db, "configuracoes", "geral");
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            state.configSistema = { ...state.configSistema, ...docSnap.data() };
        } else {
            await setDoc(docRef, state.configSistema);
        }
        aplicarConfiguracoesNaTela();
    } catch (error) {
        console.error("Erro ao carregar configs:", error);
        aplicarConfiguracoesNaTela();
    }
}

function aplicarConfiguracoesNaTela() {
    if (!state.configSistema.precos) {
        state.configSistema.precos = {
            "Cabelo + Barba + Sobrancelha": 110,
            "Cabelo + Barba": 105,
            "Cabelo + Sobrancelha": 75,
            "Cabelo": 60,
            "Barba": 50
        };
    }

    const setText = (id, texto) => {
        const el = document.getElementById(id);
        if (el) el.textContent = texto;
    };

    setText("lblAtualDebito", `Atual: ${Number(state.configSistema.taxaDebito || 1.5).toFixed(2).replace(".", ",")}%`);
    setText("lblAtualCredito", `Atual: ${Number(state.configSistema.taxaCredito || 3.51).toFixed(2).replace(".", ",")}%`);
    setText("lblAtualRepasse", `Atual: ${Number(state.configSistema.repasseDonoPct || 35)}%`);

    setText("labelAtualCombo3", `Atual: R$ ${formatarMoeda(state.configSistema.precos["Cabelo + Barba + Sobrancelha"] || 110)}`);
    setText("labelAtualCombo2", `Atual: R$ ${formatarMoeda(state.configSistema.precos["Cabelo + Barba"] || 105)}`);
    setText("labelAtualCabSob", `Atual: R$ ${formatarMoeda(state.configSistema.precos["Cabelo + Sobrancelha"] || 75)}`);
    setText("labelAtualCabelo", `Atual: R$ ${formatarMoeda(state.configSistema.precos["Cabelo"] || 60)}`);
    setText("labelAtualBarba", `Atual: R$ ${formatarMoeda(state.configSistema.precos["Barba"] || 50)}`);

    // Atualiza botões da tela Registrar
    document.querySelectorAll(".btn-servico").forEach(btn => {
        const nome = btn.getAttribute("data-nome");
        if (state.configSistema.precos[nome] !== undefined) {
            const novoValor = state.configSistema.precos[nome];
            btn.setAttribute("data-valor", novoValor);
            const spanValor = btn.querySelector(".valor-servico-btn");
            if (spanValor) spanValor.textContent = `R$ ${formatarMoeda(novoValor)}`;
        }
    });
}

// =============================
// CONFIGURAÇÕES - EDIÇÃO INLINE + SALVAR GLOBAL
// =============================
const btnSalvarConfigs = document.getElementById("btnSalvarConfigs");
let camposAlterados = {}; // guarda o que o usuário mudou

function atualizarEstadoBotaoSalvar() {
    if (!btnSalvarConfigs) return;
    const temAlteracao = Object.keys(camposAlterados).length > 0;
    btnSalvarConfigs.disabled = !temAlteracao;
}

// Máscara de porcentagem limitada (máx 11,11)
function mascaraPorcentagem(input, maxDigitosInteiros) {
    input.addEventListener("input", (e) => {
        // Pega somente os números
        let value = e.target.value.replace(/\D/g, "");

        // Remove zeros que pertencem à formatação anterior.
        // Ex.: "0,014" vira "14"
        value = value.replace(/^0+/, "");

        // Se apagou tudo, deixa o campo vazio
        if (value === "") {
            e.target.value = "";
            return;
        }

        // Débito/Crédito: máximo 3 dígitos → 9,99
        // Repasse: máximo 4 dígitos → 99,99
        const maxDigitos = maxDigitosInteiros + 2;

        // Se ultrapassou o limite, mantém o valor já permitido
        if (value.length > maxDigitos) {
            value = value.slice(0, maxDigitos);
        }

        const numero = parseInt(value, 10) / 100;

        e.target.value = numero
            .toFixed(2)
            .replace(".", ",");
    });
}

// Máscara de moeda limitada (máx 111,11)
function mascaraMoedaLimitada(input) {
    input.addEventListener("input", (e) => {
        let value = e.target.value.replace(/\D/g, "");

        if (value === "") {
            e.target.value = "";
            return;
        }

        // Limita a 5 dígitos (11111 → 111,11)
        if (value.length > 5) value = value.slice(0, 5);

        value = (parseInt(value, 10) / 100).toFixed(2);
        value = value.replace(".", ",");

        e.target.value = value;
    });
}

// Inicializa os itens de configuração
const configItems = document.querySelectorAll(".config-item");

configItems.forEach(item => {
    const btnAlterar = item.querySelector(".btn-alterar");
    const input = item.querySelector(".input-config");
    const tipo = item.getAttribute("data-tipo");
    const campo = item.getAttribute("data-campo");

    if (!btnAlterar || !input) return;

if (tipo === "moeda") {
    mascaraMoedaLimitada(input);
} else {
    // Débito e Crédito → x,xx
    if (campo === "taxaDebito" || campo === "taxaCredito") {
        mascaraPorcentagem(input, 1);
    }

    // Repasse → xx,xx
    else if (campo === "repasseDonoPct") {
        mascaraPorcentagem(input, 2);
    }
}

    // Clica em Alterar → esconde botão e mostra input
    btnAlterar.addEventListener("click", () => {
        btnAlterar.classList.add("hidden");
        input.classList.remove("hidden");
        input.value = "";
        input.focus();
    });

input.addEventListener("input", () => {
    const valor = converterParaNumero(input.value);

    // Vazio ou zero não é considerado alteração
    if (valor === null || valor === 0) {
        delete camposAlterados[campo];
    } else {
        camposAlterados[campo] = valor;
    }

    atualizarEstadoBotaoSalvar();
});
});
// =============================
// FECHA CAMPOS VAZIOS AO CLICAR FORA
// =============================
document.addEventListener("click", (e) => {
    configItems.forEach((item) => {
        const btnAlterar = item.querySelector(".btn-alterar");
        const input = item.querySelector(".input-config");
        const campo = item.getAttribute("data-campo");

        if (!btnAlterar || !input) return;

        // Já está fechado
        if (input.classList.contains("hidden")) return;

        // Clicou dentro do próprio item
        if (item.contains(e.target)) return;

        const valor = converterParaNumero(input.value);

        // Tem valor válido → mantém aberto
        if (valor !== null && valor > 0) return;

        // Vazio ou zero → fecha e ignora alteração
        delete camposAlterados[campo];

        input.classList.add("hidden");
        btnAlterar.classList.remove("hidden");
        input.value = "";

        atualizarEstadoBotaoSalvar();
    });
});
// Botão Salvar Alterações (global)
btnSalvarConfigs?.addEventListener("click", async () => {
    if (Object.keys(camposAlterados).length === 0) return;

    btnSalvarConfigs.textContent = "Salvando...";
    btnSalvarConfigs.disabled = true;

    // Aplica as alterações
    for (const campo in camposAlterados) {
        const valor = camposAlterados[campo];

        if (campo === "taxaDebito" || campo === "taxaCredito" || campo === "repasseDonoPct") {
            state.configSistema[campo] = valor;
        } else {
            if (!state.configSistema.precos) state.configSistema.precos = {};
            state.configSistema.precos[campo] = valor;
        }
    }

    try {
        await setDoc(doc(db, "configuracoes", "geral"), state.configSistema);
        aplicarConfiguracoesNaTela();

        // Limpa estado
        camposAlterados = {};
        configItems.forEach(item => {
            const btn = item.querySelector(".btn-alterar");
            const input = item.querySelector(".input-config");
            if (btn) btn.classList.remove("hidden");
            if (input) {
                input.classList.add("hidden");
                input.value = "";
            }
        });

        // Animação de sucesso
        btnSalvarConfigs.classList.add("success");
        btnSalvarConfigs.textContent = "Salvo ✓";

        setTimeout(() => {
            btnSalvarConfigs.classList.remove("success");
            btnSalvarConfigs.textContent = "Salvar Alterações";
            atualizarEstadoBotaoSalvar(); // volta a ficar desabilitado
        }, 2000);

    } catch (error) {
        console.error(error);
        btnSalvarConfigs.textContent = "Erro ao salvar";
        setTimeout(() => {
            btnSalvarConfigs.textContent = "Salvar Alterações";
            atualizarEstadoBotaoSalvar();
        }, 2000);
    }
});
