// =============================
// LOGIN
// =============================
if(!localStorage.getItem("barberLogado")){
    window.location.href="login.html";
}

document.getElementById("logoutBtn")?.addEventListener("click",()=>{
    localStorage.removeItem("barberLogado");
    window.location.href="login.html";
});


// =============================
// PARTICULAS
// =============================
const canvas=document.getElementById("particles");
const ctx=canvas.getContext("2d");

canvas.width=window.innerWidth;
canvas.height=window.innerHeight;

let particles=[];

for(let i=0;i<60;i++){
    particles.push({
        x:Math.random()*canvas.width,
        y:Math.random()*canvas.height,
        r:Math.random()*2,
        dx:(Math.random()-0.5)*0.5,
        dy:(Math.random()-0.5)*0.5
    });
}

function animate(){

    ctx.clearRect(0,0,canvas.width,canvas.height);

    particles.forEach(p=>{

        ctx.beginPath();
        ctx.arc(p.x,p.y,p.r,0,Math.PI*2);
        ctx.fillStyle="rgba(0,240,255,0.5)";
        ctx.fill();

        p.x+=p.dx;
        p.y+=p.dy;

        if(p.x<0||p.x>canvas.width)p.dx*=-1;
        if(p.y<0||p.y>canvas.height)p.dy*=-1;

    });

    requestAnimationFrame(animate);

}

animate();


// =============================
// MENU
// =============================
const menuToggle=document.getElementById("menuToggle");
const sidebarMenu=document.getElementById("sidebarMenu");

menuToggle?.addEventListener("click",()=>{
    sidebarMenu.classList.toggle("active");
});


// =============================
// SEÇÕES
// =============================
const sidebarLinks=sidebarMenu.querySelectorAll("a");

sidebarLinks.forEach(link=>{

link.addEventListener("click",e=>{

e.preventDefault();

const href=link.getAttribute("href");

document.querySelectorAll("main section").forEach(s=>{
s.style.display="none";
});

const target=document.querySelector(href);

if(target) target.style.display="block";

if(href==="#painelFinanceiro"){
atualizarCards();
atualizarGrafico();
}

sidebarMenu.classList.remove("active");

});

});


// =============================
// ATENDIMENTOS
// =============================
let atendimentos=JSON.parse(localStorage.getItem("atendimentos")||"[]");

const historicoBody=document.getElementById("historicoBody");

function salvar(){
localStorage.setItem("atendimentos",JSON.stringify(atendimentos));
}


// =============================
// HISTÓRICO
// =============================
function atualizarHistorico(lista=atendimentos){

historicoBody.innerHTML="";

lista
.sort((a,b)=>new Date(b.data)-new Date(a.data))
.forEach((a)=>{

let indexReal = atendimentos.indexOf(a);

let tr=document.createElement("tr");

tr.innerHTML=`
<td>${a.cliente}</td>
<td>${a.servico}</td>
<td>R$ ${a.valor.toFixed(2)}</td>
<td>${a.pagamento}</td>
<td>${new Date(a.data).toLocaleString()}</td>
<td>
<button onclick="excluirAtendimento(${indexReal})">🗑</button>
</td>
`;

historicoBody.appendChild(tr);

});

atualizarCards();

}


// =============================
// EXCLUIR
// =============================
let indexParaExcluir = null;

function excluirAtendimento(index){

indexParaExcluir = index;

document.getElementById("modalConfirm").classList.add("active");

}


// =============================
// REGISTRAR
// =============================
const btnRegistrar=document.getElementById("btnRegistrar");

document
.getElementById("atendimentoForm")
.addEventListener("submit",e=>{

e.preventDefault();

const cliente=document.getElementById("cliente").value.trim();
const servico=document.getElementById("servico").value;
const valor=parseFloat(document.getElementById("valor").value);
const pagamento=document.getElementById("pagamento").value;

if(!cliente||!servico||isNaN(valor)||valor<=0||!pagamento){
alert("Preencha corretamente");
return;
}

const data=new Date().toISOString();

atendimentos.push({
cliente,
servico,
valor,
pagamento,
data
});

salvar();

document.getElementById("atendimentoForm").reset();

atualizarHistorico();

btnRegistrar.classList.add("success");
btnRegistrar.textContent="Registrado ✓";

setTimeout(()=>{
btnRegistrar.classList.remove("success");
btnRegistrar.textContent="Registrar";
},2500);

});


// =============================
// FILTROS
// =============================
function aplicarFiltros(){

const busca=document.getElementById("buscaCliente").value.toLowerCase();
const dataFiltro=document.getElementById("filtroData").value;

let filtrados=atendimentos.filter(a=>{

const nome=a.cliente.toLowerCase();
const data=a.data.split("T")[0];

return(
(!busca || nome.includes(busca)) &&
(!dataFiltro || data===dataFiltro)
);

});

atualizarHistorico(filtrados);

}


// =============================
// FILTRO ONTEM
// =============================
function filtrarOntem(){

let ontem=new Date();
ontem.setDate(ontem.getDate()-1);

let dataOntem=ontem.toISOString().split("T")[0];

let filtrados=atendimentos.filter(a=>
a.data.split("T")[0]===dataOntem
);

atualizarHistorico(filtrados);

}


// =============================
// EVENTOS FILTRO
// =============================
document
.getElementById("buscaCliente")
.addEventListener("input",aplicarFiltros);

document
.getElementById("filtroData")
.addEventListener("change",aplicarFiltros);


// =============================
// CARDS
// =============================
function atualizarCards(){

let faturamentoHoje=0;
let clientesHoje=new Set();
let servicoCount={};

const hoje=new Date();

atendimentos.forEach(a=>{

const data=new Date(a.data);

if(
data.getDate()===hoje.getDate() &&
data.getMonth()===hoje.getMonth() &&
data.getFullYear()===hoje.getFullYear()
){

faturamentoHoje+=a.valor;
clientesHoje.add(a.cliente);

}

servicoCount[a.servico]=(servicoCount[a.servico]||0)+1;

});

document.querySelector("#faturamentoHoje p").innerText=`R$ ${faturamentoHoje.toFixed(2)}`;

document.querySelector("#clientesHoje p").innerText=clientesHoje.size;

let maisVendido="—";

if(Object.keys(servicoCount).length){

maisVendido=Object.keys(servicoCount)
.reduce((a,b)=>servicoCount[a]>servicoCount[b]?a:b);

}

document.querySelector("#servicoMaisVendido p").innerText=maisVendido;

}


// =============================
// GRÁFICO
// =============================
let grafico;

function atualizarGrafico(){

const labels=[];
const dados=[];

for(let i=6;i>=0;i--){

const d=new Date();
d.setDate(d.getDate()-i);

const dia=d.toISOString().split("T")[0];

labels.push(`${d.getDate()}/${d.getMonth()+1}`);

const total=atendimentos
.filter(a=>a.data.split("T")[0]===dia)
.reduce((sum,a)=>sum+a.valor,0);

dados.push(total);

}

if(grafico)grafico.destroy();

const ctxGraf=document
.getElementById("graficoFaturamento")
.getContext("2d");

grafico=new Chart(ctxGraf,{
type:"bar",
data:{
labels,
datasets:[{
data:dados,
backgroundColor:"#00f0ff"
}]
},
options:{
plugins:{legend:{display:false}},
responsive:true,
scales:{y:{beginAtZero:true}}
}
});

}


// =============================
// MODAL EXCLUIR
// =============================
const modal = document.getElementById("modalConfirm");
const btnCancelar = document.getElementById("btnCancelar");
const btnConfirmar = document.getElementById("btnConfirmar");

btnCancelar.addEventListener("click", ()=>{

modal.classList.remove("active");
indexParaExcluir = null;

});

btnConfirmar.addEventListener("click", ()=>{

if(indexParaExcluir !== null){

atendimentos.splice(indexParaExcluir,1);

salvar();

atualizarHistorico();

}

modal.classList.remove("active");
indexParaExcluir = null;

});


// =============================
atualizarHistorico();