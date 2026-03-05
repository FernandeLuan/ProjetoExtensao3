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
            <td>${a.data}</td>
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

// FORM REGISTRAR
document.getElementById("atendimentoForm").addEventListener("submit", (e)=>{
    e.preventDefault();
    const cliente = document.getElementById("cliente").value;
    const servico = document.getElementById("servico").value;
    const valor = parseFloat(document.getElementById("valor").value);
    const pagamento = document.getElementById("pagamento").value;
    const data = new Date().toLocaleString();
    atendimentos.push({cliente,servico,valor,pagamento,data});
    localStorage.setItem("atendimentos",JSON.stringify(atendimentos));
    document.getElementById("atendimentoForm").reset();
    atualizarHistorico();
});

// CARDS DE RESUMO
function atualizarCards(){
    const hoje = new Date().toLocaleDateString();
    let faturamento = 0, clientesSet = 0, servicoCount={};
    atendimentos.forEach(a=>{
        faturamento+=a.valor;
        if(a.data.split(' ')[0]===hoje) clientesSet++;
        servicoCount[a.servico] = (servicoCount[a.servico] || 0)+1;
    });
    document.getElementById("faturamentoHoje").querySelector("p").innerText=`R$ ${faturamento.toFixed(2)}`;
    document.getElementById("clientesHoje").querySelector("p").innerText=clientesSet;
    let maisVendido = Object.keys(servicoCount).reduce((a,b)=>servicoCount[a]>servicoCount[b]?a:b, "—");
    document.getElementById("servicoMaisVendido").querySelector("p").innerText=maisVendido;
}

atualizarHistorico();