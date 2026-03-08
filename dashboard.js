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

if(typeof atualizarGrafico === "function"){
atualizarGrafico();
}

}

if(href==="#historico"){
atualizarHistorico();
atualizarExtrasHoje();
}

sidebarMenu.classList.remove("active");

});

});


// =============================
// ATENDIMENTOS
// =============================
let atendimentos=JSON.parse(localStorage.getItem("atendimentos")||"[]");

const historicoBody=document.getElementById("historicoBody");
const extrasBody=document.getElementById("extrasBody");

function salvar(){
localStorage.setItem("atendimentos",JSON.stringify(atendimentos));
}


// =============================
// HISTÓRICO (SERVIÇOS)
// =============================
function atualizarHistorico(){

historicoBody.innerHTML="";

const hoje=new Date();

const lista=atendimentos.filter(a=>{

const data=new Date(a.data);

return(
a.tipo==="servico" &&
data.getDate()===hoje.getDate() &&
data.getMonth()===hoje.getMonth() &&
data.getFullYear()===hoje.getFullYear()
);

});

lista
.sort((a,b)=>new Date(b.data)-new Date(a.data))
.forEach((a)=>{

let indexReal=atendimentos.indexOf(a);

let tr=document.createElement("tr");

tr.innerHTML=`
<td>${a.cliente}</td>
<td>${a.servico}</td>
<td>R$ ${a.valor.toFixed(2)}</td>
<td>${a.pagamento}</td>
<td>${new Date(a.data).toLocaleTimeString()}</td>
<td>
<button onclick="excluirAtendimento(${indexReal})">🗑</button>
</td>
`;

historicoBody.appendChild(tr);

});

atualizarCards();

}


// =============================
// EXTRAS (PRODUTOS)
// =============================
function atualizarExtrasHoje(){

extrasBody.innerHTML="";

const hoje=new Date();

const lista=atendimentos.filter(a=>{

const data=new Date(a.data);

return(
a.tipo==="produto" &&
data.getDate()===hoje.getDate() &&
data.getMonth()===hoje.getMonth() &&
data.getFullYear()===hoje.getFullYear()
);

});

lista
.sort((a,b)=>new Date(b.data)-new Date(a.data))
.forEach((a)=>{

let indexReal=atendimentos.indexOf(a);

let tr=document.createElement("tr");

tr.innerHTML=`
<td>${a.cliente}</td>
<td>${a.servico}</td>
<td>R$ ${a.valor.toFixed(2)}</td>
<td>${a.pagamento}</td>
<td>${new Date(a.data).toLocaleTimeString()}</td>
<td>
<button onclick="excluirAtendimento(${indexReal})">🗑</button>
</td>
`;

extrasBody.appendChild(tr);

});

}


// =============================
// EXCLUIR
// =============================
let indexParaExcluir=null;

function excluirAtendimento(index){

indexParaExcluir=index;

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

const temExtra=document.getElementById("temExtra").value;
const produtoExtra=document.getElementById("produtoExtra").value;
const valorExtra=parseFloat(document.getElementById("valorExtra").value);

if(!cliente||!servico||isNaN(valor)||valor<=0||!pagamento){
alert("Preencha corretamente");
return;
}

const data=new Date().toISOString();


// SERVIÇO
atendimentos.push({
cliente,
servico,
valor,
pagamento,
data,
tipo:"servico"
});


// PRODUTO EXTRA
if(temExtra==="sim" && produtoExtra && valorExtra){

atendimentos.push({
cliente,
servico:produtoExtra,
valor:valorExtra,
pagamento,
data,
tipo:"produto"
});

}

salvar();

document.getElementById("atendimentoForm").reset();

atualizarHistorico();
atualizarExtrasHoje();

btnRegistrar.classList.add("success");
btnRegistrar.textContent="Registrado ✓";

setTimeout(()=>{
btnRegistrar.classList.remove("success");
btnRegistrar.textContent="Registrar";
},2500);

});


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
a.tipo==="servico" &&
data.getDate()===hoje.getDate() &&
data.getMonth()===hoje.getMonth() &&
data.getFullYear()===hoje.getFullYear()
){

faturamentoHoje+=a.valor;
clientesHoje.add(a.cliente);

servicoCount[a.servico]=(servicoCount[a.servico]||0)+1;

}

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
// EXTRAS FORM
// =============================
const selectExtra = document.getElementById("temExtra");
const extraCampos = document.getElementById("extraCampos");

selectExtra.addEventListener("change",()=>{

if(selectExtra.value==="sim"){
extraCampos.style.display="block";
}else{
extraCampos.style.display="none";
}

});


// =============================
// MODAL EXCLUIR
// =============================
const modal=document.getElementById("modalConfirm");
const btnCancelar=document.getElementById("btnCancelar");
const btnConfirmar=document.getElementById("btnConfirmar");

btnCancelar.addEventListener("click",()=>{
modal.classList.remove("active");
indexParaExcluir=null;
});

btnConfirmar.addEventListener("click",()=>{

if(indexParaExcluir!==null){

atendimentos.splice(indexParaExcluir,1);

salvar();

atualizarHistorico();
atualizarExtrasHoje();

}

modal.classList.remove("active");
indexParaExcluir=null;

});


// =============================
atualizarHistorico();
atualizarExtrasHoje();