import { auth, db } from "./firebase-init.js";
import { onAuthStateChanged, signOut, updatePassword, EmailAuthProvider, reauthenticateWithCredential } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { collection, addDoc, getDocs, deleteDoc, doc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// =============================
// SEGURANÇA E NAVEGAÇÃO BÁSICA
// =============================
onAuthStateChanged(auth, (user) => {
    if (!user) window.location.href = "login.html";
    else carregarAtendimentos();
});

document.getElementById("logoutBtnSide")?.addEventListener("click", async (e) => {
    e.preventDefault();
    await signOut(auth);
    window.location.href = "login.html";
});

// =============================
// BANCO DE DADOS
// =============================
let atendimentos = [];

async function carregarAtendimentos() {
    try {
        const querySnapshot = await getDocs(collection(db, "atendimentos"));
        atendimentos = [];
        querySnapshot.forEach(doc => atendimentos.push({ id: doc.id, ...doc.data() }));
        atualizarHistorico();
        atualizarCards(); 
    } catch (error) {
        console.error("Erro ao carregar dados:", error);
    }
}

// =============================
// PARTICULAS E MENU
// =============================
const canvas = document.getElementById("particles");
const ctx = canvas.getContext("2d");
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;
let particles = [];
for (let i = 0; i < 60; i++) {
    particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        r: Math.random() * 2,
        dx: (Math.random() - 0.5) * 0.5,
        dy: (Math.random() - 0.5) * 0.5
    });
}
function animate() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    particles.forEach(p => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(0,240,255,0.5)";
        ctx.fill();
        p.x += p.dx;
        p.y += p.dy;
        if (p.x < 0 || p.x > canvas.width) p.dx *= -1;
        if (p.y < 0 || p.y > canvas.height) p.dy *= -1;
    });
    requestAnimationFrame(animate);
}
animate();

// Lógica de fechamento inteligente do Overlay (Menu)
const menuToggle = document.getElementById("menuToggle");
const sidebarMenu = document.getElementById("sidebarMenu");
const sidebarOverlay = document.getElementById("sidebarOverlay");

menuToggle?.addEventListener("click", () => {
    sidebarMenu.classList.toggle("active");
    sidebarOverlay.classList.toggle("active");
});

sidebarOverlay?.addEventListener("click", () => {
    sidebarMenu.classList.remove("active");
    sidebarOverlay.classList.remove("active");
});

// Logo Home Click
document.getElementById("logoHome")?.addEventListener("click", () => {
    document.querySelectorAll("main section").forEach(s => s.style.display = "none");
    document.getElementById("registrar").style.display = "block";
});

sidebarMenu.querySelectorAll("a").forEach(link => {
    link.addEventListener("click", e => {
        if(link.id === "logoutBtnSide") return; // Sair tem logica propria
        e.preventDefault();
        const href = link.getAttribute("href");
        document.querySelectorAll("main section").forEach(s => s.style.display = "none");
        const target = document.querySelector(href);
        if (target) target.style.display = "block";

        if (href === "#painelFinanceiro") {
            atualizarCards();
            if (typeof atualizarGrafico === "function") atualizarGrafico();
        }
        if (href === "#historico") atualizarHistorico();
        
        // Fecha menu e overlay após clicar
        sidebarMenu.classList.remove("active");
        sidebarOverlay.classList.remove("active");
    });
});

// =============================
// SELETORES E FORMULÁRIO DE REGISTRO
// =============================
let servicoSelecionado = "";
let valorTotalAutomatico = 0;
const btnRegistrar = document.getElementById("btnRegistrar");
const inputValorPersonalizado = document.getElementById("valorPersonalizado");
const checkboxValorDif = document.getElementById("temValorDiferenciado");
const labelServicos = document.getElementById("labelServicos");
const labelPagamento = document.getElementById("labelPagamento");
const inputPagamento = document.getElementById("pagamento");
const campoValorPersonalizado = document.getElementById("campoValorPersonalizado");

inputValorPersonalizado.addEventListener("input", function(e) {
    let value = e.target.value.replace(/\D/g, ""); 
    if (value === "") {
        e.target.value = "";
        atualizarTextoBotao();
        return;
    }
    value = (parseInt(value, 10) / 100).toFixed(2) + "";
    value = value.replace(".", ",");
    value = value.replace(/(\d)(?=(\d{3})+(?!\d))/g, "$1.");
    e.target.value = value;
    atualizarTextoBotao();
});

function getValorCustomizado() {
    if (!inputValorPersonalizado.value) return 0;
    let valStr = inputValorPersonalizado.value.replace(/\./g, "").replace(",", ".");
    return parseFloat(valStr) || 0;
}

function atualizarTextoBotao() {
    let valorFinal = checkboxValorDif.checked ? getValorCustomizado() : valorTotalAutomatico;
    if (servicoSelecionado && valorFinal > 0) {
        btnRegistrar.textContent = `Registrar • R$ ${valorFinal.toFixed(2).replace(".", ",")}`;
    } else {
        btnRegistrar.textContent = "Registrar Atendimento";
    }
}

document.querySelectorAll(".btn-servico").forEach(btn => {
    btn.addEventListener("click", () => {
        document.querySelectorAll(".btn-servico").forEach(b => b.classList.remove("selecionado"));
        btn.classList.add("selecionado");
        labelServicos.classList.remove("label-erro");
        servicoSelecionado = btn.getAttribute("data-nome");
        valorTotalAutomatico = parseFloat(btn.getAttribute("data-valor"));
        atualizarTextoBotao();
    });
});

document.querySelectorAll(".chip-pagamento").forEach(chip => {
    chip.addEventListener("click", () => {
        document.querySelectorAll(".chip-pagamento").forEach(c => c.classList.remove("selecionado"));
        chip.classList.add("selecionado");
        labelPagamento.classList.remove("label-erro");
        inputPagamento.value = chip.getAttribute("data-valor");
    });
});

checkboxValorDif.addEventListener("change", () => {
    if (checkboxValorDif.checked) {
        campoValorPersonalizado.style.display = "block";
    } else {
        campoValorPersonalizado.style.display = "none";
        inputValorPersonalizado.value = "";
    }
    atualizarTextoBotao();
});

function dispararErroVisual(elemento) {
    if (!elemento) return;
    elemento.classList.add("label-erro", "shake");
    setTimeout(() => elemento.classList.remove("shake"), 500); 
    setTimeout(() => elemento.classList.remove("label-erro"), 3000); 
}

function dispararErroVisualInput(elemento) {
    if (!elemento) return;
    elemento.classList.add("input-erro", "shake");
    setTimeout(() => elemento.classList.remove("shake"), 500);
    setTimeout(() => elemento.classList.remove("input-erro"), 3000);
}

// =============================
// DESFAZER INLINE
// =============================
let ultimoIdRegistrado = null;
let undoInterval = null;
let undoTimeout = null;
const undoContainer = document.getElementById("undoContainer");
const btnUndoInline = document.getElementById("btnUndoInline");

function dispararUndoInline(idDoc) {
    ultimoIdRegistrado = idDoc;
    undoContainer.style.display = "block";
    let segundosRestantes = 10;
    btnUndoInline.textContent = `Desfazer Registro (${segundosRestantes}s)`;

    if (undoInterval) clearInterval(undoInterval);
    if (undoTimeout) clearTimeout(undoTimeout);

    undoInterval = setInterval(() => {
        segundosRestantes--;
        if (segundosRestantes > 0) {
            btnUndoInline.textContent = `Desfazer Registro (${segundosRestantes}s)`;
        } else {
            clearInterval(undoInterval);
        }
    }, 1000);

    undoTimeout = setTimeout(() => {
        undoContainer.style.display = "none";
        ultimoIdRegistrado = null;
        clearInterval(undoInterval);
    }, 10000);
}

btnUndoInline.addEventListener("click", async () => {
    if (!ultimoIdRegistrado) return;
    btnUndoInline.textContent = "Desfazendo...";
    clearInterval(undoInterval);
    clearTimeout(undoTimeout);

    try {
        await deleteDoc(doc(db, "atendimentos", ultimoIdRegistrado));
        await carregarAtendimentos();
        undoContainer.style.display = "none";
        ultimoIdRegistrado = null;
        
        btnRegistrar.textContent = "Registro Desfeito ↩";
        btnRegistrar.style.background = "#ff3b3b";
        btnRegistrar.style.color = "#fff";
        
        setTimeout(() => {
            btnRegistrar.style.background = ""; 
            btnRegistrar.style.color = "";
            atualizarTextoBotao();
        }, 2000);
    } catch (error) {
        btnUndoInline.textContent = "Erro ao desfazer";
    }
});

// =============================
// REGISTRO NO BANCO
// =============================
document.getElementById("atendimentoForm").addEventListener("submit", async e => {
    e.preventDefault();
    let temErro = false;

    if (!servicoSelecionado) { dispararErroVisual(labelServicos); temErro = true; }
    const pagamento = inputPagamento.value;
    if (!pagamento) { dispararErroVisual(labelPagamento); temErro = true; }

    let valorServicoBruto = 0;
    if (checkboxValorDif.checked) {
        valorServicoBruto = getValorCustomizado();
        if (valorServicoBruto <= 0) {
            dispararErroVisualInput(inputValorPersonalizado);
            temErro = true;
        }
    } else {
        valorServicoBruto = valorTotalAutomatico;
    }

    if (temErro) return;

    function processarFinanceiro(valor) {
        let liquidoConta = valor;
        if (pagamento === "Débito") liquidoConta -= (valor * 0.015);
        else if (pagamento === "Crédito") liquidoConta -= (valor * 0.0351);
        let repasseDono = liquidoConta * 0.35;
        let liquidoBarbeiro = liquidoConta - repasseDono;
        return {
            liquidoConta: parseFloat(liquidoConta.toFixed(2)),
            repasseDono: parseFloat(repasseDono.toFixed(2)),
            liquidoBarbeiro: parseFloat(liquidoBarbeiro.toFixed(2))
        };
    }

    let finTotal = processarFinanceiro(valorServicoBruto);
    const data = new Date().toISOString();

    btnRegistrar.textContent = "Salvando...";
    btnRegistrar.style.opacity = "0.7";

    try {
        const docRef = await addDoc(collection(db, "atendimentos"), {
            cliente: "Avulso",
            servico: servicoSelecionado,
            valorServicoBruto: parseFloat(valorServicoBruto.toFixed(2)),
            valorBrutoTotal: parseFloat(valorServicoBruto.toFixed(2)),
            valorLiquido: finTotal.liquidoConta,
            repasseDono: finTotal.repasseDono,
            liquidoBarbeiro: finTotal.liquidoBarbeiro,
            pagamento,
            data
        });

        dispararUndoInline(docRef.id);
        document.getElementById("atendimentoForm").reset();
        document.querySelectorAll(".btn-servico, .chip-pagamento").forEach(b => b.classList.remove("selecionado"));
        servicoSelecionado = "";
        valorTotalAutomatico = 0;
        inputPagamento.value = "";
        campoValorPersonalizado.style.display = "none";
        checkboxValorDif.checked = false;
        atualizarTextoBotao();
        await carregarAtendimentos();

        btnRegistrar.style.opacity = "1";
        btnRegistrar.classList.add("success");
        btnRegistrar.textContent = "Registrado ✓";
        setTimeout(() => {
            btnRegistrar.classList.remove("success");
            atualizarTextoBotao();
        }, 2000);
    } catch (error) {
        btnRegistrar.style.opacity = "1";
        atualizarTextoBotao();
    }
});

// =============================
// HISTÓRICO DO DIA + PAGINAÇÃO (LOAD MORE)
// =============================
const historicoContainer = document.getElementById("historicoContainer");
const btnCarregarMais = document.getElementById("btnCarregarMais");
let limiteExibicao = 10;

function atualizarHistorico() {
    historicoContainer.innerHTML = "";
    
    // Filtra estritamente para o dia de hoje
    const hoje = new Date();
    const listaHoje = atendimentos.filter(a => {
        const data = new Date(a.data);
        return data.getDate() === hoje.getDate() && 
               data.getMonth() === hoje.getMonth() && 
               data.getFullYear() === hoje.getFullYear();
    });

    if (listaHoje.length === 0) {
        historicoContainer.innerHTML = `<div style="text-align:center; padding: 30px; color: #a0a0a0; font-size: 0.9rem;">Nenhum atendimento registrado hoje.</div>`;
        btnCarregarMais.style.display = "none";
        return;
    }

    // Ordena do mais recente para o mais antigo
    listaHoje.sort((a, b) => new Date(b.data) - new Date(a.data));

    // Pega apenas a quantidade permitida pelo limite atual
    const listaVisivel = listaHoje.slice(0, limiteExibicao);

    listaVisivel.forEach(a => {
        let bruto = a.valorBrutoTotal || a.valorBruto || 0;
        let liquido = a.valorLiquido || 0;
        
        let card = document.createElement("div");
        card.className = "historico-card";
        card.innerHTML = `
            <div class="hist-info">
                <strong>${a.servico}</strong>
                <span>${new Date(a.data).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})} • ${a.pagamento}</span>
            </div>
            <div class="hist-valor">
                <strong>R$ ${bruto.toFixed(2).replace('.', ',')}</strong>
                <small>Líq: R$ ${liquido.toFixed(2).replace('.', ',')}</small>
            </div>
            <button onclick="excluirAtendimento('${a.id}', '${a.servico}', ${bruto})" class="btn-delete-hist"><i class="fas fa-trash"></i></button>
        `;
        historicoContainer.appendChild(card);
    });

    // Mostra ou esconde o botão "Carregar mais"
    if (listaHoje.length > limiteExibicao) {
        btnCarregarMais.style.display = "block";
    } else {
        btnCarregarMais.style.display = "none";
    }
}

btnCarregarMais?.addEventListener("click", () => {
    limiteExibicao += 10; // Adiciona mais 10 à lista
    atualizarHistorico();
});

// =============================
// MODAL EXCLUSÃO
// =============================
let idParaExcluir = null;
window.excluirAtendimento = function(id, servico, valor) {
    idParaExcluir = id;
    document.getElementById("modalDescricao").innerHTML = `Excluir o atendimento de <b>${servico} (R$ ${valor.toFixed(2).replace('.', ',')})</b>?`;
    document.getElementById("modalConfirm").classList.add("active");
};
document.getElementById("btnCancelar").addEventListener("click", () => {
    document.getElementById("modalConfirm").classList.remove("active");
    idParaExcluir = null;
});
document.getElementById("btnConfirmar").addEventListener("click", async () => {
    if (idParaExcluir) {
        const btn = document.getElementById("btnConfirmar");
        btn.textContent = "Excluindo...";
        try {
            await deleteDoc(doc(db, "atendimentos", idParaExcluir));
            await carregarAtendimentos();
        } catch (error) {}
        btn.textContent = "Sim, excluir";
    }
    document.getElementById("modalConfirm").classList.remove("active");
    idParaExcluir = null;
});

// =============================
// MINHA CONTA (Troca Segura de Senha)
// =============================
document.getElementById("formAlterarSenha")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const senhaAtual = document.getElementById("senhaAtual").value;
    const novaSenha = document.getElementById("novaSenha").value;
    const confirmaSenha = document.getElementById("confirmaSenha").value;

    if (novaSenha !== confirmaSenha) {
        alert("A nova senha e a confirmação não batem.");
        return;
    }
    if (novaSenha.length < 6) {
        alert("A senha precisa ter pelo menos 6 caracteres.");
        return;
    }

    const user = auth.currentUser;
    if (user) {
        const btn = document.getElementById("btnSalvarSenha");
        btn.textContent = "Validando...";
        
        try {
            // Reautenticar para garantir segurança
            const credential = EmailAuthProvider.credential(user.email, senhaAtual);
            await reauthenticateWithCredential(user, credential);
            
            btn.textContent = "Atualizando...";
            await updatePassword(user, novaSenha);
            
            alert("Senha atualizada com sucesso!");
            document.getElementById("formAlterarSenha").reset();
        } catch (error) {
            console.error(error);
            if(error.code === 'auth/invalid-credential') alert("A senha atual digitada está incorreta.");
            else alert("Erro ao atualizar senha. Verifique os dados.");
        }
        btn.textContent = "Atualizar Senha";
    }
});

// =============================
// PAINEL FINANCEIRO
// =============================
let periodoSelecionado = 'hoje';
document.querySelectorAll('.btn-filtro').forEach(btn => {
    btn.addEventListener('click', (e) => {
        document.querySelectorAll('.btn-filtro').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        periodoSelecionado = e.target.getAttribute('data-periodo');
        atualizarCards();
    });
});

// Função auxiliar global para formatar dinheiro no padrão brasileiro (R$ 1.000,00)
function formatarMoeda(valor) {
    return valor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function atualizarCards() {
    let faturamentoBruto = 0, faturamentoLiquido = 0, totalRepasse = 0, lucroBarbeiro = 0, totalClientes = 0;
    let servicoCount = {};
    const hoje = new Date();
    const inicioSemana = new Date(hoje);
    inicioSemana.setDate(hoje.getDate() - hoje.getDay());
    inicioSemana.setHours(0,0,0,0);

    atendimentos.forEach(a => {
        const data = new Date(a.data);
        let dentro = false;
        if (periodoSelecionado === 'hoje') dentro = (data.getDate() === hoje.getDate() && data.getMonth() === hoje.getMonth() && data.getFullYear() === hoje.getFullYear());
        else if (periodoSelecionado === 'semana') dentro = (data >= inicioSemana);
        else if (periodoSelecionado === 'mes') dentro = (data.getMonth() === hoje.getMonth() && data.getFullYear() === hoje.getFullYear());

        if (dentro) {
            let bruto = a.valorBrutoTotal || a.valorBruto || 0;
            let liquido = a.valorLiquido || 0;
            let repasse = a.repasseDono || 0;
            faturamentoBruto += bruto;
            faturamentoLiquido += liquido;
            totalRepasse += repasse;
            lucroBarbeiro += a.liquidoBarbeiro || (liquido - repasse) || 0;
            totalClientes++;
            if (a.servico) servicoCount[a.servico] = (servicoCount[a.servico] || 0) + 1;
        }
    });

    // CARD DE FATURAMENTO / LUCRO LIMPO (Com as novas cores e formatações)
    const cardFat = document.querySelector("#faturamentoHoje p");
    if(cardFat) cardFat.innerHTML = `
        <div style="font-size: 0.85rem; color: #a0a0a0; margin-bottom: 2px;">Seu Lucro Limpo</div>
        <div style="font-size: 1.9rem; color: #00e676; font-weight: 700; margin-bottom: 12px; line-height: 1.1;">R$ ${formatarMoeda(lucroBarbeiro)}</div>
        <div style="display: flex; justify-content: space-between; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 10px; font-size: 0.85rem;">
            <div style="text-align: left;">
                <span style="color: #a0a0a0; display: block; font-size: 0.7rem;">Bruto</span>
                <span style="color: #00f0ff; font-weight: 600;">R$ ${formatarMoeda(faturamentoBruto)}</span>
            </div>
            <div style="text-align: right;">
                <span style="color: #a0a0a0; display: block; font-size: 0.7rem;">Repasse (35%)</span>
                <span style="color: #ffcc00; font-weight: 600;">R$ ${formatarMoeda(totalRepasse)}</span>
            </div>
        </div>
        <div style="font-size: 0.7rem; color: white; margin-top: 10px; font-weight: 300;">Líquido na Conta: R$ ${formatarMoeda(faturamentoLiquido)}</div>
    `;
    
    // TICKET MÉDIO (1.1rem, sem weight pesado, com vírgula)
    let ticketMedio = totalClientes > 0 ? (faturamentoBruto / totalClientes) : 0;
    const cardTicket = document.querySelector("#ticketMedio p");
    if(cardTicket) cardTicket.innerHTML = `<span style="font-size: 1.1rem; font-weight: 400; color: #e0e7ff;">R$ ${formatarMoeda(ticketMedio)}</span>`;

    // SERVIÇO MAIS VENDIDO (1.1rem, sem weight pesado)
    let maisVendido = "—";
    if (Object.keys(servicoCount).length) maisVendido = Object.keys(servicoCount).reduce((a, b) => servicoCount[a] > servicoCount[b] ? a : b);
    const cardMaisVendido = document.querySelector("#servicoMaisVendido p");
    if(cardMaisVendido) cardMaisVendido.innerHTML = `<span style="font-size: 1.1rem; font-weight: 400; color: #e0e7ff;">${maisVendido}</span>`;

    // CLIENTES ATENDIDOS (1.1rem, sem weight pesado)
    const cardCli = document.querySelector("#clientesAtendidos p");
    if(cardCli) cardCli.innerHTML = `<span style="font-size: 1.1rem; font-weight: 400; color: #e0e7ff;">${totalClientes}</span>`;
}

let graficoInstance = null;
window.atualizarGrafico = function() {
    const ctx = document.getElementById('graficoFaturamento');
    if (!ctx) return;
    const labels = [], dataFat = [0,0,0,0,0,0,0];
    
    for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        labels.push(`${("0" + d.getDate()).slice(-2)}/${("0" + (d.getMonth() + 1)).slice(-2)}`);
    }

    atendimentos.forEach(a => {
        const dataAt = new Date(a.data), diaHoje = new Date();
        diaHoje.setHours(0,0,0,0); dataAt.setHours(0,0,0,0);
        const diffDays = Math.floor((diaHoje.getTime() - dataAt.getTime()) / 86400000);
        if (diffDays >= 0 && diffDays <= 6) dataFat[6 - diffDays] += (a.valorBrutoTotal || a.valorBruto || 0);
    });

    if (graficoInstance) graficoInstance.destroy();
    graficoInstance = new Chart(ctx, {
        type: 'bar',
        data: { labels, datasets: [{ label: 'Faturamento Bruto', data: dataFat, backgroundColor: 'rgba(0, 240, 255, 0.4)', borderColor: '#00f0ff', borderWidth: 1, borderRadius: 4 }] },
        options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#a0a0a0' } }, x: { grid: { display: false }, ticks: { color: '#a0a0a0' } } }, plugins: { legend: { display: false } } }
    });
};

// =============================
// RELATÓRIOS (Base para WhatsApp)
// =============================
document.getElementById("btnWhatsApp")?.addEventListener("click", () => {
    alert("Pronto para plugar a API do WhatsApp!");
});