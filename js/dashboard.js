import { auth, db } from "./firebase-init.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { collection, addDoc, getDocs, deleteDoc, doc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// =============================
// SEGURANÇA
// =============================
onAuthStateChanged(auth, (user) => {
    if (!user) {
        window.location.href = "login.html";
    } else {
        carregarAtendimentos();
    }
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
        querySnapshot.forEach((doc) => {
            atendimentos.push({ id: doc.id, ...doc.data() });
        });
        atualizarHistorico();
        atualizarExtrasHoje();
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
menuToggle?.addEventListener("click", () => { sidebarMenu.classList.toggle("active"); });

const sidebarLinks = sidebarMenu.querySelectorAll("a");
sidebarLinks.forEach(link => {
    link.addEventListener("click", e => {
        e.preventDefault();
        const href = link.getAttribute("href");
        document.querySelectorAll("main section").forEach(s => { s.style.display = "none"; });
        const target = document.querySelector(href);
        if (target) target.style.display = "block";

        if (href === "#painelFinanceiro") {
            atualizarCards();
            if (typeof atualizarGrafico === "function") atualizarGrafico();
        }
        if (href === "#historico") {
            atualizarHistorico();
            atualizarExtrasHoje();
        }
        sidebarMenu.classList.remove("active");
    });
});

// =============================
// SELETOR DE SERVIÇOS COMPOSTOS
// =============================
let servicosSelecionados = [];
let valorTotalAutomatico = 0;

const inputServicoConsolidado = document.getElementById("servico");
const inputValorNormal = document.getElementById("valor");
const btnLimparServicos = document.getElementById("limparServicos");

document.querySelectorAll(".btn-servico").forEach(btn => {
    btn.addEventListener("click", () => {
        const nome = btn.getAttribute("data-nome");
        const valor = parseFloat(btn.getAttribute("data-valor"));

        servicosSelecionados.push(nome);
        valorTotalAutomatico += valor;

        inputServicoConsolidado.value = servicosSelecionados.join(" + ");
        inputValorNormal.value = valorTotalAutomatico.toFixed(2);
        btnLimparServicos.style.display = "inline-block";
    });
});

btnLimparServicos.addEventListener("click", () => {
    servicosSelecionados = [];
    valorTotalAutomatico = 0;
    inputServicoConsolidado.value = "";
    inputValorNormal.value = "";
    btnLimparServicos.style.display = "none";
});

// =============================
// CONTROLE DE VALOR DIFERENCIADO
// =============================
const selectValorDif = document.getElementById("temValorDiferenciado");
const campoValorNormal = document.getElementById("campoValorNormal");
const campoValorPersonalizado = document.getElementById("campoValorPersonalizado");
const inputValorPersonalizado = document.getElementById("valorPersonalizado");

selectValorDif.addEventListener("change", () => {
    if (selectValorDif.value === "sim") {
        campoValorNormal.style.display = "none";
        campoValorPersonalizado.style.display = "block";
        inputValorPersonalizado.required = true;
    } else {
        campoValorNormal.style.display = "block";
        campoValorPersonalizado.style.display = "none";
        inputValorPersonalizado.required = false;
        inputValorPersonalizado.value = "";
    }
});

// =============================
// CONTROLE DO CAMPO EXTRA
// =============================
const selectExtra = document.getElementById("temExtra");
const extraCampos = document.getElementById("extraCampos");
const inputProdutoExtra = document.getElementById("produtoExtra");
const inputValorExtra = document.getElementById("valorExtra");

selectExtra.addEventListener("change", () => {
    if (selectExtra.value === "sim") {
        extraCampos.style.display = "block";
        inputProdutoExtra.required = true;
        inputValorExtra.required = true;
    } else {
        extraCampos.style.display = "none";
        inputProdutoExtra.required = false;
        inputValorExtra.required = false;
        inputProdutoExtra.value = "";
        inputValorExtra.value = "";
    }
});

// =============================
// CONTROLE DO TOAST & UNDO (DESFAZER)
// =============================
let ultimoIdRegistrado = null;
let toastTimeout = null;
const toastUndo = document.getElementById("toastUndo");
const btnUndo = document.getElementById("btnUndo");
const toastMensagem = document.getElementById("toastMensagem");

function dispararToastUndo(idDoc, nomeCliente) {
    ultimoIdRegistrado = idDoc;
    toastMensagem.innerHTML = `Atendimento de <b>${nomeCliente}</b> registrado!`;
    toastUndo.classList.add("active");

    if (toastTimeout) clearTimeout(toastTimeout);

    // Some sozinho após 10 segundos
    toastTimeout = setTimeout(() => {
        toastUndo.classList.remove("active");
        ultimoIdRegistrado = null;
    }, 10000);
}

btnUndo.addEventListener("click", async () => {
    if (!ultimoIdRegistrado) return;

    btnUndo.textContent = "Desfazendo...";
    try {
        const docParaDesfazer = atendimentos.find(a => a.id === ultimoIdRegistrado);

        await deleteDoc(doc(db, "atendimentos", ultimoIdRegistrado));
        await carregarAtendimentos();

        if (docParaDesfazer) {
            document.getElementById("cliente").value = docParaDesfazer.cliente;
            inputServicoConsolidado.value = docParaDesfazer.servico;
            
            servicosSelecionados = docParaDesfazer.servico.split(" + ");
            valorTotalAutomatico = docParaDesfazer.valorServicoBruto;
            inputValorNormal.value = valorTotalAutomatico.toFixed(2);
            btnLimparServicos.style.display = "inline-block";

            document.getElementById("pagamento").value = docParaDesfazer.pagamento;

            if (docParaDesfazer.temExtra) {
                selectExtra.value = "sim";
                extraCampos.style.display = "block";
                inputProdutoExtra.value = docParaDesfazer.produtoExtra;
                inputValorExtra.value = docParaDesfazer.valorExtraBruto;
                inputProdutoExtra.required = true;
                inputValorExtra.required = true;
            }
        }

        toastUndo.classList.remove("active");
        ultimoIdRegistrado = null;
        btnUndo.textContent = "Desfazer";

    } catch (error) {
        console.error("Erro ao desfazer:", error);
        alert("Erro ao tentar desfazer o registro.");
        btnUndo.textContent = "Desfazer";
    }
});

// =============================
// REGISTRAR ATENDIMENTO
// =============================
const btnRegistrar = document.getElementById("btnRegistrar");

document.getElementById("atendimentoForm").addEventListener("submit", async e => {
    e.preventDefault();

    const cliente = document.getElementById("cliente").value.trim();
    const servico = inputServicoConsolidado.value.trim();
    
    let valorServicoBruto = 0;
    if (selectValorDif.value === "sim") {
        valorServicoBruto = parseFloat(inputValorPersonalizado.value);
    } else {
        valorServicoBruto = valorTotalAutomatico;
    }

    const pagamento = document.getElementById("pagamento").value;
    const temExtra = document.getElementById("temExtra").value;
    
    const produtoExtra = temExtra === "sim" ? inputProdutoExtra.value.trim() : "";
    const valorExtraBruto = temExtra === "sim" ? (parseFloat(inputValorExtra.value) || 0) : 0;

    if (!cliente || !servico || isNaN(valorServicoBruto) || valorServicoBruto <= 0 || !pagamento) {
        alert("Por favor, selecione ao menos um serviço e preencha todos os campos corretamente.");
        return;
    }

    const valorBrutoTotal = valorServicoBruto + valorExtraBruto;

    function processarFinanceiro(valor) {
        let liquidoConta = valor;
        if (pagamento === "Débito") {
            liquidoConta = valor - (valor * 0.0145);
        } else if (pagamento === "Crédito") {
            liquidoConta = valor - (valor * 0.0351);
        }
        
        let repasseDono = liquidoConta * 0.35;
        let liquidoBarbeiro = liquidoConta - repasseDono;

        return {
            liquidoConta: parseFloat(liquidoConta.toFixed(2)),
            repasseDono: parseFloat(repasseDono.toFixed(2)),
            liquidoBarbeiro: parseFloat(liquidoBarbeiro.toFixed(2))
        };
    }

    let finTotal = processarFinanceiro(valorBrutoTotal);
    const data = new Date().toISOString();

    btnRegistrar.textContent = "Salvando na nuvem...";
    btnRegistrar.style.opacity = "0.7";

    try {
        const docRef = await addDoc(collection(db, "atendimentos"), {
            cliente,
            servico,
            valorServicoBruto: parseFloat(valorServicoBruto.toFixed(2)),
            temExtra: temExtra === "sim",
            produtoExtra: produtoExtra || "Nenhum",
            valorExtraBruto: parseFloat(valorExtraBruto.toFixed(2)),
            valorBrutoTotal: parseFloat(valorBrutoTotal.toFixed(2)),
            valorLiquido: finTotal.liquidoConta,
            repasseDono: finTotal.repasseDono,
            liquidoBarbeiro: finTotal.liquidoBarbeiro,
            pagamento,
            data
        });

        dispararToastUndo(docRef.id, cliente);

        document.getElementById("atendimentoForm").reset();
        servicosSelecionados = [];
        valorTotalAutomatico = 0;
        btnLimparServicos.style.display = "none";
        extraCampos.style.display = "none";
        campoValorPersonalizado.style.display = "none";
        campoValorNormal.style.display = "block";
        inputProdutoExtra.required = false;
        inputValorExtra.required = false;
        inputValorPersonalizado.required = false;
        selectValorDif.value = "nao";

        await carregarAtendimentos();

        btnRegistrar.style.opacity = "1";
        btnRegistrar.classList.add("success");
        btnRegistrar.textContent = "Registrado com Sucesso ✓";
        setTimeout(() => {
            btnRegistrar.classList.remove("success");
            btnRegistrar.textContent = "Registrar Atendimento";
        }, 2500);

    } catch (error) {
        console.error("Erro ao registrar:", error);
        alert("Erro de conexão ao salvar atendimento.");
        btnRegistrar.textContent = "Registrar Atendimento";
        btnRegistrar.style.opacity = "1";
    }
});

// =============================
// HISTÓRICO E TABELAS
// =============================
const historicoBody = document.getElementById("historicoBody");
const extrasBody = document.getElementById("extrasBody");

function atualizarHistorico() {
    historicoBody.innerHTML = "";
    const hoje = new Date();

    const lista = atendimentos.filter(a => {
        const data = new Date(a.data);
        return (
            data.getDate() === hoje.getDate() &&
            data.getMonth() === hoje.getMonth() &&
            data.getFullYear() === hoje.getFullYear()
        );
    });

    lista.sort((a, b) => new Date(b.data) - new Date(a.data)).forEach((a) => {
        let descricaoServico = a.servico;
        if (a.temExtra && a.produtoExtra && a.produtoExtra !== "Nenhum") {
            descricaoServico += ` + ${a.produtoExtra}`;
        }

        // Fallback de segurança para registros antigos
        let valorBrutoDisplay = a.valorBrutoTotal || a.valorBruto || 0;
        let valorLiquidoDisplay = a.valorLiquido || 0;

        let tr = document.createElement("tr");
        tr.innerHTML = `
            <td>${a.cliente}</td>
            <td>${descricaoServico}</td>
            <td>R$ ${valorBrutoDisplay.toFixed(2)} <small style="color:#00e676;">(Líq: R$ ${valorLiquidoDisplay.toFixed(2)})</small></td>
            <td>${a.pagamento}</td>
            <td>${new Date(a.data).toLocaleTimeString()}</td>
            <td><button onclick="excluirAtendimento('${a.id}')" style="background:none; border:none; cursor:pointer; color:red;">🗑</button></td>
        `;
        historicoBody.appendChild(tr);
    });
}

function atualizarExtrasHoje() {
    extrasBody.innerHTML = "";
    const hoje = new Date();

    const lista = atendimentos.filter(a => {
        const data = new Date(a.data);
        return (
            a.temExtra &&
            data.getDate() === hoje.getDate() &&
            data.getMonth() === hoje.getMonth() &&
            data.getFullYear() === hoje.getFullYear()
        );
    });

    lista.sort((a, b) => new Date(b.data) - new Date(a.data)).forEach((a) => {
        let tr = document.createElement("tr");
        tr.innerHTML = `
            <td>${a.cliente}</td>
            <td>${a.produtoExtra}</td>
            <td>R$ ${(a.valorExtraBruto || 0).toFixed(2)}</td>
            <td>${a.pagamento}</td>
            <td>${new Date(a.data).toLocaleTimeString()}</td>
            <td><button onclick="excluirAtendimento('${a.id}')" style="background:none; border:none; cursor:pointer; color:red;">🗑</button></td>
        `;
        extrasBody.appendChild(tr);
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

const modal = document.getElementById("modalConfirm");
const btnCancelar = document.getElementById("btnCancelar");
const btnConfirmar = document.getElementById("btnConfirmar");

btnCancelar.addEventListener("click", () => {
    modal.classList.remove("active");
    idParaExcluir = null;
});

btnConfirmar.addEventListener("click", async () => {
    if (idParaExcluir) {
        btnConfirmar.textContent = "Excluindo...";
        try {
            await deleteDoc(doc(db, "atendimentos", idParaExcluir));
            await carregarAtendimentos();
        } catch (error) {
            console.error("Erro ao excluir:", error);
        }
        btnConfirmar.textContent = "Sim, excluir";
    }
    modal.classList.remove("active");
    idParaExcluir = null;
});

// =============================
// CARDS FINANCEIROS E FILTROS (SPRINT 2)
// =============================
let periodoSelecionado = 'hoje'; // Estado global do filtro

// Controle de clique nos botões de filtro
document.querySelectorAll('.btn-filtro').forEach(btn => {
    btn.addEventListener('click', (e) => {
        document.querySelectorAll('.btn-filtro').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        periodoSelecionado = e.target.getAttribute('data-periodo');
        
        atualizarCards();
    });
});

function atualizarCards() {
    let faturamentoBruto = 0;
    let faturamentoLiquido = 0;
    let totalRepasse = 0;
    let lucroBarbeiro = 0;
    
    // AQUI ESTÁ A MÁGICA: Mudamos de "Set" para um simples contador de atendimentos
    let totalClientesAtendidos = 0; 
    let servicoCount = {};
    
    const hoje = new Date();
    
    // Descobre o primeiro dia da semana (Domingo)
    const inicioSemana = new Date(hoje);
    inicioSemana.setDate(hoje.getDate() - hoje.getDay());
    inicioSemana.setHours(0,0,0,0);

    atendimentos.forEach(a => {
        const data = new Date(a.data);
        let dentroDoPeriodo = false;

        // Lógica do Filtro Temporal
        if (periodoSelecionado === 'hoje') {
            dentroDoPeriodo = (data.getDate() === hoje.getDate() && data.getMonth() === hoje.getMonth() && data.getFullYear() === hoje.getFullYear());
        } else if (periodoSelecionado === 'semana') {
            dentroDoPeriodo = (data >= inicioSemana);
        } else if (periodoSelecionado === 'mes') {
            dentroDoPeriodo = (data.getMonth() === hoje.getMonth() && data.getFullYear() === hoje.getFullYear());
        }

        if (dentroDoPeriodo) {
            let bruto = a.valorBrutoTotal || a.valorBruto || 0;
            let liquido = a.valorLiquido || 0;
            let repasse = a.repasseDono || 0;
            let barbeiro = a.liquidoBarbeiro || (liquido - repasse) || 0;

            faturamentoBruto += bruto;
            faturamentoLiquido += liquido;
            totalRepasse += repasse;
            lucroBarbeiro += barbeiro;
            
            // Cada registro no período soma +1 cliente atendido (cadeira ocupada)
            totalClientesAtendidos++;
            
            if (a.servico) servicoCount[a.servico] = (servicoCount[a.servico] || 0) + 1;
        }
    });

    // 1. Faturamento
    const cardFaturamento = document.querySelector("#faturamentoHoje p");
    if(cardFaturamento) {
        cardFaturamento.innerHTML = `
            <div style="font-size: 0.85rem; color: #a0a0a0; margin-bottom: 2px;">Seu Lucro Limpo</div>
            <div style="font-size: 1.9rem; color: #00f0ff; font-weight: 700; margin-bottom: 12px; line-height: 1.1;">R$ ${lucroBarbeiro.toFixed(2)}</div>
            
            <div style="display: flex; justify-content: space-between; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 10px; font-size: 0.85rem;">
                <div style="text-align: left;">
                    <span style="color: #a0a0a0; display: block; font-size: 0.7rem;">Valor Bruto</span>
                    <span style="color: #ffffff; font-weight: 600;">R$ ${faturamentoBruto.toFixed(2)}</span>
                </div>
                <div style="text-align: right;">
                    <span style="color: #a0a0a0; display: block; font-size: 0.7rem;">Repasse (35%)</span>
                    <span style="color: #ffcc00; font-weight: 600;">R$ ${totalRepasse.toFixed(2)}</span>
                </div>
            </div>
            <div style="font-size: 0.7rem; color: #00e676; margin-top: 10px; font-weight: 600;">Líquido na Conta: R$ ${faturamentoLiquido.toFixed(2)}</div>
        `;
    }
    
    // 2. Ticket Médio (Agora usando o total real de atendimentos)
    let ticketMedio = totalClientesAtendidos > 0 ? (faturamentoBruto / totalClientesAtendidos) : 0;
    const cardTicket = document.querySelector("#ticketMedio p");
    if(cardTicket) {
        cardTicket.innerHTML = `<span style="font-size: 1.5rem; font-weight: 700;">R$ ${ticketMedio.toFixed(2)}</span>`;
    }

    // 3. Serviço Mais Vendido
    let maisVendido = "—";
    if (Object.keys(servicoCount).length) {
        maisVendido = Object.keys(servicoCount).reduce((a, b) => servicoCount[a] > servicoCount[b] ? a : b);
    }
    const cardMaisVendido = document.querySelector("#servicoMaisVendido p");
    if(cardMaisVendido) cardMaisVendido.innerText = maisVendido;

    // 4. Clientes Atendidos
    const cardClientes = document.querySelector("#clientesAtendidos p");
    if(cardClientes) cardClientes.innerText = totalClientesAtendidos;
}

// =============================
// GRÁFICO COM CHART.JS (Últimos 7 Dias)
// =============================
let graficoInstance = null;

window.atualizarGrafico = function() {
    const ctx = document.getElementById('graficoFaturamento');
    if (!ctx) return;

    const labels = [];
    const dataFaturamento = [0, 0, 0, 0, 0, 0, 0];
    
    // Cria os rótulos dos últimos 7 dias (ex: "01/08")
    for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        labels.push(`${("0" + d.getDate()).slice(-2)}/${("0" + (d.getMonth() + 1)).slice(-2)}`);
    }

    // Distribui o faturamento nos dias correspondentes
    atendimentos.forEach(a => {
        const dataAtendimento = new Date(a.data);
        const diaHoje = new Date();
        
        // Zera as horas para comparar apenas os dias exatos
        diaHoje.setHours(0,0,0,0);
        dataAtendimento.setHours(0,0,0,0);
        
        const diffTime = diaHoje.getTime() - dataAtendimento.getTime();
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
        
        if (diffDays >= 0 && diffDays <= 6) {
            const index = 6 - diffDays;
            dataFaturamento[index] += (a.valorBrutoTotal || a.valorBruto || 0);
        }
    });

    // Se o gráfico já existe, destroi para desenhar o novo atualizado
    if (graficoInstance) {
        graficoInstance.destroy();
    }

    graficoInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Faturamento Bruto (R$)',
                data: dataFaturamento,
                backgroundColor: 'rgba(0, 240, 255, 0.4)',
                borderColor: '#00f0ff',
                borderWidth: 1,
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true,
                    grid: { color: 'rgba(255, 255, 255, 0.05)' },
                    ticks: { color: '#a0a0a0' }
                },
                x: {
                    grid: { display: false },
                    ticks: { color: '#a0a0a0' }
                }
            },
            plugins: {
                legend: { display: false } // Esconde a legenda para ficar mais clean
            }
        }
    });
};
// =============================
// INJEÇÃO DE DADOS FAKE (APAGAR DEPOIS DO TESTE)
// =============================
document.getElementById("btnFake")?.addEventListener("click", async () => {
    const btn = document.getElementById("btnFake");
    btn.textContent = "Injetando no Firebase...";
    btn.disabled = true;
    btn.style.opacity = "0.5";

    const clientesFake = ["Lucas", "Marcos", "João", "Pedro", "Thiago", "Rafael", "Bruno", "Carlos", "Felipe", "Diego"];
    const pagamentos = ["Pix", "Dinheiro", "Débito", "Crédito"];
    const servicosMock = [
        { nome: "Cabelo", valor: 60 },
        { nome: "Barba", valor: 50 },
        { nome: "Cabelo + Barba", valor: 110 }
    ];

    try {
        for(let i = 0; i < 40; i++) {
            // Sorteia de 0 a 30 dias atrás
            const diasAtras = Math.floor(Math.random() * 30);
            const dataFake = new Date();
            dataFake.setDate(dataFake.getDate() - diasAtras);
            // Bagunça um pouco as horas (entre 9h e 19h) para o histórico ficar realista
            dataFake.setHours(Math.floor(Math.random() * 10) + 9, Math.floor(Math.random() * 60));

            const cli = clientesFake[Math.floor(Math.random() * clientesFake.length)];
            const pag = pagamentos[Math.floor(Math.random() * pagamentos.length)];
            const svc = servicosMock[Math.floor(Math.random() * servicosMock.length)];

            // 30% de chance de ter comprado uma pomada extra
            const temExtra = Math.random() > 0.7;
            const extraValor = temExtra ? 35 : 0;
            const extraNome = temExtra ? "Pomada" : "Nenhum";

            const brutoTotal = svc.valor + extraValor;

            // Recalcula as taxas como no sistema real
            let liquidoConta = brutoTotal;
            if (pag === "Débito") liquidoConta -= (brutoTotal * 0.0145);
            else if (pag === "Crédito") liquidoConta -= (brutoTotal * 0.0351);

            const repasse = liquidoConta * 0.35;
            const barbeiro = liquidoConta - repasse;

            await addDoc(collection(db, "atendimentos"), {
                cliente: cli,
                servico: svc.nome,
                valorServicoBruto: svc.valor,
                temExtra: temExtra,
                produtoExtra: extraNome,
                valorExtraBruto: extraValor,
                valorBrutoTotal: brutoTotal,
                valorLiquido: parseFloat(liquidoConta.toFixed(2)),
                repasseDono: parseFloat(repasse.toFixed(2)),
                liquidoBarbeiro: parseFloat(barbeiro.toFixed(2)),
                pagamento: pag,
                data: dataFake.toISOString()
            });
        }

        alert("40 atendimentos injetados com sucesso! Verifique o gráfico e os filtros.");
        btn.textContent = "Concluído ✓";
        await carregarAtendimentos();

    } catch (e) {
        console.error("Erro na injeção:", e);
        alert("Erro ao gerar dados.");
        btn.textContent = "Falha";
    }
});