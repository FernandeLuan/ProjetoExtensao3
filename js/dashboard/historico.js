import { db } from "../firebase-init.js";
import {
    collection,
    getDocs,
    deleteDoc,
    doc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

import { state } from "./state.js";
import { atualizarCards } from "./financeiro.js";

const historicoContainer = document.getElementById("historicoContainer");
const btnCarregarMais = document.getElementById("btnCarregarMais");
const modalConfirm = document.getElementById("modalConfirm");
const modalDescricao = document.getElementById("modalDescricao");
const btnConfirmar = document.getElementById("btnConfirmar");

let limiteExibicao = 10;
let idParaExcluir = null;

// =============================
// BANCO DE DADOS
// =============================
export async function carregarAtendimentos() {
    try {
        const querySnapshot = await getDocs(collection(db, "atendimentos"));
        state.atendimentos = [];
        querySnapshot.forEach((d) => state.atendimentos.push({ id: d.id, ...d.data() }));
        atualizarHistorico();
        atualizarCards();
    } catch (error) {
        console.error("Erro ao carregar dados:", error);
    }
}

// =============================
// HISTÓRICO
// =============================
export function atualizarHistorico() {
    if (!historicoContainer) return;
    historicoContainer.innerHTML = "";

    const hoje = new Date();
    const listaHoje = state.atendimentos.filter((a) => {
        const data = new Date(a.data);
        return (
            data.getDate() === hoje.getDate() &&
            data.getMonth() === hoje.getMonth() &&
            data.getFullYear() === hoje.getFullYear()
        );
    });

    const titulo = document.getElementById("tituloHistorico");
    if (titulo) {
        const dataFormatada = hoje.toLocaleDateString("pt-BR", {
            day: "2-digit",
            month: "long"
        });
        titulo.textContent = `Histórico • ${dataFormatada}`;
    }

    if (listaHoje.length === 0) {
        historicoContainer.innerHTML = `
            <div style="text-align:center; padding: 40px 20px; color: var(--text-secondary); font-size: 0.95rem;">
                Nenhum atendimento registrado hoje.
            </div>`;
        if (btnCarregarMais) btnCarregarMais.style.display = "none";
        return;
    }

    listaHoje.sort((a, b) => new Date(b.data) - new Date(a.data));
    const listaVisivel = listaHoje.slice(0, limiteExibicao);

    listaVisivel.forEach((a) => {
        const bruto = a.valorBrutoTotal || a.valorBruto || 0;
        const liquido = a.valorLiquido || 0;
        const hora = new Date(a.data).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
        const pagamento = a.pagamento || "—";

        let classePag = "dinheiro";
        if (pagamento === "Crédito") classePag = "credito";
        else if (pagamento === "Débito") classePag = "debito";
        else if (pagamento === "Pix") classePag = "pix";

        let iconePag = "fa-money-bill-wave";
        if (pagamento === "Crédito" || pagamento === "Débito") iconePag = "fa-credit-card";
        else if (pagamento === "Pix") iconePag = "fa-qrcode";

        const card = document.createElement("div");
        card.className = "historico-card";
        card.innerHTML = `
            <div class="hist-left">
                <div class="hist-servico">${a.servico}</div>
                <div class="hist-meta">
                    <span>${hora}</span>
                    <span class="hist-pagamento ${classePag}">
                        <i class="fas ${iconePag}"></i> ${pagamento}
                    </span>
                </div>
            </div>
            <div class="hist-right">
                <div class="hist-valores">
                    <span class="hist-bruto">R$ ${bruto.toFixed(2).replace(".", ",")}</span>
                    <span class="hist-liquido">Líq: R$ ${liquido.toFixed(2).replace(".", ",")}</span>
                </div>
                <button type="button" class="btn-delete-hist" aria-label="Excluir atendimento">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        `;

        card.querySelector(".btn-delete-hist")?.addEventListener("click", () => {
            abrirModalExclusao(a.id, a.servico, bruto);
        });

        historicoContainer.appendChild(card);
    });

    if (btnCarregarMais) {
        btnCarregarMais.style.display = listaHoje.length > limiteExibicao ? "block" : "none";
    }
}

btnCarregarMais?.addEventListener("click", () => {
    limiteExibicao += 10;
    atualizarHistorico();
});

// =============================
// MODAL DE EXCLUSÃO
// =============================
function abrirModalExclusao(id, servico, valor) {
    idParaExcluir = id;

    if (modalDescricao) {
        modalDescricao.innerHTML = `Excluir o atendimento de <b>${servico} (R$ ${valor.toFixed(2).replace(".", ",")})</b>?`;
    }

    modalConfirm?.classList.add("active");
}

document.getElementById("btnCancelar")?.addEventListener("click", () => {
    modalConfirm?.classList.remove("active");
    idParaExcluir = null;
});

btnConfirmar?.addEventListener("click", async () => {
    if (idParaExcluir) {
        btnConfirmar.textContent = "Excluindo...";

        try {
            await deleteDoc(doc(db, "atendimentos", idParaExcluir));
            await carregarAtendimentos();
        } catch (error) {
            console.error(error);
        }

        btnConfirmar.textContent = "Sim, excluir";
    }

    modalConfirm?.classList.remove("active");
    idParaExcluir = null;
});
