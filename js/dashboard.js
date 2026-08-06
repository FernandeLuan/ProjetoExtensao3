import { auth, db } from "./firebase-init.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { collection, addDoc, getDocs, deleteDoc, doc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// =============================
// SEGURANÇA
// =============================
onAuthStateChanged(auth, (user) => {
    if (!user) window.location.href = "login.html";
    else carregarAtendimentos();
});

document.getElementById("logoutBtn")?.addEventListener("click", async () => {
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

const menuToggle = document.getElementById("menuToggle");
const sidebarMenu = document.getElementById("sidebarMenu");
menuToggle?.addEventListener("click", () => sidebarMenu.classList.toggle("active"));

sidebarMenu.querySelectorAll("a").forEach(link => {
    link.addEventListener("click", e => {
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
        sidebarMenu.classList.remove("active");
    });
});

// =============================
// SELETORES, MÁSCARA E BOTÃO DINÂMICO
// =============================
let servicoSelecionado = "";
let valorTotalAutomatico = 0;
const btnRegistrar = document.getElementById("btnRegistrar");
const inputValorPersonalizado = document.getElementById("valorPersonalizado");
const checkboxValorDif = document.getElementById("temValorDiferenciado");
const labelServicos = document.getElementById("labelServicos");
const labelPagamento = document.getElementById("labelPagamento");

// Função para formatar moeda em tempo real (0,01 -> 0,10 -> 1,00)
inputValorPersonalizado.addEventListener("input", function(e) {
    let value = e.target.value.replace(/\D/g, ""); // Remove tudo que não for número
    if (value === "") {
        e.target.value = "";
        atualizarTextoBotao();
        return;
    }
    value = (parseInt(value, 10) / 100).toFixed(2) + "";
    value = value.replace(".", ",");
    value = value.replace(/(\d)(?=(\d{3})+(?!\d))/g, "$1."); // Ponto de milhar
    e.target.value = value;
    atualizarTextoBotao();
});

// Extrai o número real (float) da máscara visual
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

// Clique nos Serviços
document.querySelectorAll(".btn-servico").forEach(btn => {
    btn.addEventListener("click", () => {
        document.querySelectorAll(".btn-servico").forEach(b => b.classList.remove("selecionado"));
        btn.classList.add("selecionado");
        labelServicos.classList.remove("label-erro"); // Limpa erro se tiver
        servicoSelecionado = btn.getAttribute("data-nome");
        valorTotalAutomatico = parseFloat(btn.getAttribute("data-valor"));
        atualizarTextoBotao();
    });
});

// Clique nos Chips de Pagamento
const inputPagamento = document.getElementById("pagamento");
document.querySelectorAll(".chip-pagamento").forEach(chip => {
    chip.addEventListener("click", () => {
        document.querySelectorAll(".chip-pagamento").forEach(c => c.classList.remove("selecionado"));
        chip.classList.add("selecionado");
        labelPagamento.classList.remove("label-erro"); // Limpa erro se tiver
        inputPagamento.value = chip.getAttribute("data-valor");
    });
});

// Controle do Toggle de Valor Diferenciado
const campoValorPersonalizado = document.getElementById("campoValorPersonalizado");
checkboxValorDif.addEventListener("change", () => {
    if (checkboxValorDif.checked) {
        campoValorPersonalizado.style.display = "block";
    } else {
        campoValorPersonalizado.style.display = "none";
        inputValorPersonalizado.value = "";
    }
    atualizarTextoBotao();
});

// =============================
// VALIDAÇÃO VISUAL (Treme e Fica Vermelho)
// =============================
function dispararErroVisual(elemento) {
    if (!elemento) return;
    elemento.classList.add("label-erro", "shake");
    setTimeout(() => elemento.classList.remove("shake"), 500); 
    setTimeout(() => elemento.classList.remove("label-erro"), 3000); 
}

// Faz o input do valor tremer e ficar vermelho
function dispararErroVisualInput(elemento) {
    if (!elemento) return;
    elemento.classList.add("input-erro", "shake");
    setTimeout(() => elemento.classList.remove("shake"), 500);
    setTimeout(() => elemento.classList.remove("input-erro"), 3000);
}

// =============================
// CONTROLE DO DESFAZER INLINE (COUNTDOWN)
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
    // TEXTO ATUALIZADO AQUI
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
        
        const btnRegistrar = document.getElementById("btnRegistrar");
        btnRegistrar.textContent = "Registro Desfeito ↩";
        btnRegistrar.style.background = "#ff3b3b";
        btnRegistrar.style.color = "#fff";
        
        setTimeout(() => {
            btnRegistrar.style.background = ""; 
            btnRegistrar.style.color = "";
            atualizarTextoBotao();
        }, 2000);
        
    } catch (error) {
        console.error("Erro ao desfazer:", error);
        btnUndoInline.textContent = "Erro ao desfazer";
    }
});

// =============================
// REGISTRAR ATENDIMENTO
// =============================
document.getElementById("atendimentoForm").addEventListener("submit", async e => {
    e.preventDefault();

    let temErro = false;

    if (!servicoSelecionado) {
        dispararErroVisual(labelServicos);
        temErro = true;
    }

    const pagamento = inputPagamento.value;
    if (!pagamento) {
        dispararErroVisual(labelPagamento);
        temErro = true;
    }

    // AQUI ESTÁ A LÓGICA QUE FALTAVA PARA TREMER O INPUT ZERADO
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

    if (temErro) return; // Trava o envio aqui se faltou clicar em algo ou valor zerado

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
// HISTÓRICO E TABELAS
// =============================
const historicoBody = document.getElementById("historicoBody");
function atualizarHistorico() {
    historicoBody.innerHTML = "";
    const hoje = new Date();
    const lista = atendimentos.filter(a => {
        const data = new Date(a.data);
        return data.getDate() === hoje.getDate() && data.getMonth() === hoje.getMonth() && data.getFullYear() === hoje.getFullYear();
    });

    lista.sort((a, b) => new Date(b.data) - new Date(a.data)).forEach(a => {
        let descricaoServico = a.servico + (a.temExtra && a.produtoExtra !== "Nenhum" ? ` + ${a.produtoExtra}` : "");
        let bruto = a.valorBrutoTotal || a.valorBruto || 0;
        let liquido = a.valorLiquido || 0;
        let tr = document.createElement("tr");
        tr.innerHTML = `
            <td>${descricaoServico}</td>
            <td>R$ ${bruto.toFixed(2)} <br><small style="color:#00e676;">(Líq: R$ ${liquido.toFixed(2)})</small></td>
            <td>${a.pagamento}</td>
            <td>${new Date(a.data).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</td>
            <td><button onclick="excluirAtendimento('${a.id}')" style="background:none; border:none; cursor:pointer; color:red; font-size:1.2rem;">🗑</button></td>
        `;
        historicoBody.appendChild(tr);
    });
}

// =============================
// EXCLUIR DA NUVEM
// =============================
let idParaExcluir = null;
window.excluirAtendimento = function(id) {
    idParaExcluir = id;
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
// CARDS FINANCEIROS E FILTROS
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

    const cardFat = document.querySelector("#faturamentoHoje p");
    if(cardFat) cardFat.innerHTML = `
        <div style="font-size: 0.85rem; color: #a0a0a0; margin-bottom: 2px;">Seu Lucro Limpo</div>
        <div style="font-size: 1.9rem; color: #00f0ff; font-weight: 700; margin-bottom: 12px; line-height: 1.1;">R$ ${lucroBarbeiro.toFixed(2)}</div>
        <div style="display: flex; justify-content: space-between; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 10px; font-size: 0.85rem;">
            <div style="text-align: left;"><span style="color: #a0a0a0; display: block; font-size: 0.7rem;">Bruto</span><span style="color: #ffffff; font-weight: 600;">R$ ${faturamentoBruto.toFixed(2)}</span></div>
            <div style="text-align: right;"><span style="color: #a0a0a0; display: block; font-size: 0.7rem;">Repasse (35%)</span><span style="color: #ffcc00; font-weight: 600;">R$ ${totalRepasse.toFixed(2)}</span></div>
        </div>
        <div style="font-size: 0.7rem; color: #00e676; margin-top: 10px; font-weight: 600;">Líquido na Conta: R$ ${faturamentoLiquido.toFixed(2)}</div>
    `;
    
    let ticketMedio = totalClientes > 0 ? (faturamentoBruto / totalClientes) : 0;
    const cardTicket = document.querySelector("#ticketMedio p");
    if(cardTicket) cardTicket.innerHTML = `<span style="font-size: 1.5rem; font-weight: 700;">R$ ${ticketMedio.toFixed(2)}</span>`;

    let maisVendido = "—";
    if (Object.keys(servicoCount).length) maisVendido = Object.keys(servicoCount).reduce((a, b) => servicoCount[a] > servicoCount[b] ? a : b);
    const cardMaisVendido = document.querySelector("#servicoMaisVendido p");
    if(cardMaisVendido) cardMaisVendido.innerText = maisVendido;

    const cardCli = document.querySelector("#clientesAtendidos p");
    if(cardCli) cardCli.innerText = totalClientes;
}

// =============================
// GRÁFICO (Últimos 7 Dias)
// =============================
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