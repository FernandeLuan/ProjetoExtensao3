// LOGIN CHECK
if(!localStorage.getItem("barberLogado")){
    window.location.href = "login.html";
}

// LOGOUT
document.getElementById("logoutBtn").addEventListener("click", ()=>{
    localStorage.removeItem("barberLogado");
    window.location.href="login.html";
});

// PARTICULAS
const canvas = document.getElementById("particles");
const ctx = canvas.getContext("2d");
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;
let particles = [];
for(let i=0;i<60;i++){
    particles.push({x:Math.random()*canvas.width,y:Math.random()*canvas.height,r:Math.random()*2,dx:(Math.random()-0.5)*0.5,dy:(Math.random()-0.5)*0.5});
}
function animate(){
    ctx.clearRect(0,0,canvas.width,canvas.height);
    particles.forEach(p=>{
        ctx.beginPath();
        ctx.arc(p.x,p.y,p.r,0,Math.PI*2);
        ctx.fillStyle="rgba(0,240,255,0.5)";
        ctx.fill();
        p.x+=p.dx;p.y+=p.dy;
        if(p.x<0||p.x>canvas.width)p.dx*=-1;
        if(p.y<0||p.y>canvas.height)p.dy*=-1;
    });
    requestAnimationFrame(animate);
}
animate();

// MENU SANDUÍCHE
const menuToggle = document.getElementById('menuToggle');
const sidebarMenu = document.getElementById('sidebarMenu');
const sidebarLinks = sidebarMenu.querySelectorAll('a');

menuToggle.addEventListener('click', e=>{
    e.stopPropagation();
    sidebarMenu.classList.toggle('active');
});

// Fecha menu ao clicar fora
document.addEventListener('click', e=>{
    if(!sidebarMenu.contains(e.target) && !menuToggle.contains(e.target)){
        sidebarMenu.classList.remove('active');
    }
});

// SELEÇÃO DE SESSÃO
sidebarLinks.forEach(link=>{
    link.addEventListener('click', e=>{
        e.preventDefault();
        const href = link.getAttribute('href');
        if(!href.startsWith('#')) return;

        // Oculta todas as seções
        document.querySelectorAll('main > section').forEach(s=>s.style.display='none');

        // Mostra a seção selecionada
        const target = document.querySelector(href);
        if(target) target.style.display = (href===' #painelFinanceiro' ? 'flex' : 'block');

        // Se painel financeiro, atualiza cards e gráfico
        if(href==="#painelFinanceiro"){
            atualizarCards();
            atualizarGrafico();
        }

        sidebarMenu.classList.remove('active');
    });
});

// ATENDIMENTOS
let atendimentos = JSON.parse(localStorage.getItem("atendimentos") || "[]");
const historicoBody = document.getElementById("historicoBody");

function atualizarHistorico(){
    historicoBody.innerHTML="";
    atendimentos.forEach((a,i)=>{
        let tr = document.createElement("tr");
        tr.innerHTML=`
            <td>${a.cliente}</td>
            <td>${a.servico}</td>
            <td>R$ ${a.valor.toFixed(2)}</td>
            <td>${a.pagamento}</td>
            <td>${new Date(a.data).toLocaleString()}</td>
            <td><button onclick="excluirAtendimento(${i})">Excluir</button></td>
        `;
        historicoBody.appendChild(tr);
    });
    atualizarCards();
}

function excluirAtendimento(index){
    atendimentos.splice(index,1);
    localStorage.setItem("atendimentos",JSON.stringify(atendimentos));
    atualizarHistorico();
}

// Botão registrar
const btnRegistrar = document.getElementById("btnRegistrar");

// FORM SUBMIT
document.getElementById("atendimentoForm").addEventListener("submit", e => {
    e.preventDefault();

    // Pegando valores
    const cliente   = document.getElementById("cliente").value.trim();
    const servico   = document.getElementById("servico").value;
    const valor     = parseFloat(document.getElementById("valor").value);
    const pagamento = document.getElementById("pagamento").value;

    // Validação básica
    if (!cliente || !servico || isNaN(valor) || valor <= 0 || !pagamento) {
        alert("Por favor, preencha todos os campos corretamente.");
        return;
    }

    // Salvar atendimento
    const data = new Date().toISOString();
    atendimentos.push({ cliente, servico, valor, pagamento, data });
    localStorage.setItem("atendimentos", JSON.stringify(atendimentos));

    // Limpar formulário e atualizar tela
    document.getElementById("atendimentoForm").reset();
    atualizarHistorico();

    // Aplicar o mesmo estilo de sucesso do login
    btnRegistrar.classList.add("success");
    btnRegistrar.textContent = "Registrado! ✓";

    // Volta ao normal após 3 segundos (tempo similar ao do login)
    setTimeout(() => {
        btnRegistrar.classList.remove("success");
        btnRegistrar.textContent = "Registrar";
    }, 3000);
});
// CARDS
function atualizarCards(){
    const hoje = new Date().toISOString().split('T')[0];
    let faturamento = 0;
    let clientesHojeSet = new Set();
    let servicoCount = {};

    atendimentos.forEach(a=>{
        faturamento += a.valor;
        const dataAtendimento = a.data.split('T')[0];
        if(dataAtendimento===hoje) clientesHojeSet.add(a.cliente);
        servicoCount[a.servico] = (servicoCount[a.servico]||0)+1;
    });

    document.getElementById("faturamentoHoje").querySelector("p").innerText=`R$ ${faturamento.toFixed(2)}`;
    document.getElementById("clientesHoje").querySelector("p").innerText = clientesHojeSet.size;
    let maisVendido = Object.keys(servicoCount).length? Object.keys(servicoCount).reduce((a,b)=>servicoCount[a]>servicoCount[b]?a:b) : "—";
    document.getElementById("servicoMaisVendido").querySelector("p").innerText=maisVendido;
}

// GRÁFICO 7 DIAS
let grafico;
function atualizarGrafico(){
    const labels = [];
    const dados = [];
    for(let i=6;i>=0;i--){
        const d = new Date();
        d.setDate(d.getDate()-i);
        const dia = `${d.getDate()}/${d.getMonth()+1}`;
        labels.push(dia);

        const total = atendimentos
            .filter(a=>a.data.split('T')[0]===d.toISOString().split('T')[0])
            .reduce((sum,a)=>sum+a.valor,0);
        dados.push(total.toFixed(2));
    }

    if(grafico) grafico.destroy();

    const ctxGraf = document.getElementById("graficoFaturamento").getContext("2d");
    grafico = new Chart(ctxGraf,{
        type:'bar',
        data:{
            labels: labels,
            datasets:[{
                label: 'Faturamento',
                data: dados,
                backgroundColor:'#00f0ff'
            }]
        },
        options:{
            responsive:true,
            plugins:{
                legend:{display:false},
            },
            scales:{
                y:{beginAtZero:true}
            }
        }
    });
}

atualizarHistorico();