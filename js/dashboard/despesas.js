import { Timestamp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { criarDespesa, editarDespesa, excluirDespesa, listarDespesasPorPeriodo } from "./data/despesas-repository.js?v=8.25";
import { usuarioEhAdmin } from "./permissoes.js?v=8.25";
import { state } from "./state.js?v=8.25";
import { converterParaNumero, aplicarMascaraMoedaInput, formatarMoeda } from "./utils/money.js?v=8.25";
import { chaveData, dataDeInput, inicioDoDia, paraDate } from "./utils/date.js?v=8.25";
import { abrirSeletorData } from "./utils/dom.js?v=8.25";
import { mostrarErro, mostrarSucesso } from "./services/feedback-service.js?v=8.25";

let inicializado=false;
let mesSelecionado=new Date(new Date().getFullYear(),new Date().getMonth(),1);
let despesasMes=[];
let despesaEmEdicao=null;
let despesaParaExcluir=null;

const btnMesAnterior=document.getElementById("btnDespesaMesAnterior"),btnMesProximo=document.getElementById("btnDespesaMesProximo"),mesLabel=document.getElementById("despesasMesLabel"),totalEl=document.getElementById("despesasTotal"),quantidadeEl=document.getElementById("despesasQuantidade"),listaEl=document.getElementById("despesasLista"),btnNova=document.getElementById("btnNovaDespesa");
const modal=document.getElementById("modalDespesa"),tituloModal=document.getElementById("tituloModalDespesa"),btnFecharModal=document.getElementById("btnFecharModalDespesa"),form=document.getElementById("formDespesa"),inputData=document.getElementById("despesaData"),inputCategoria=document.getElementById("despesaCategoria"),inputDescricao=document.getElementById("despesaDescricao"),inputValor=document.getElementById("despesaValor"),tipoField=document.getElementById("despesaTipoField"),inputTipo=document.getElementById("despesaTipo"),statusEl=document.getElementById("despesaStatus"),btnSalvar=document.getElementById("btnSalvarDespesa"),btnCalendario=document.getElementById("btnCalendarioDespesa");
const labels={data:document.getElementById("labelDespesaData"),categoria:document.getElementById("labelDespesaCategoria"),descricao:document.getElementById("labelDespesaDescricao"),valor:document.getElementById("labelDespesaValor")};
const modalExcluir=document.getElementById("modalConfirmDespesa"),descricaoExcluir=document.getElementById("modalDescricaoDespesa"),btnCancelarExcluir=document.getElementById("btnCancelarDespesa"),btnConfirmarExcluir=document.getElementById("btnConfirmarDespesa");

function obterPeriodoMes(data=mesSelecionado){return {inicio:new Date(data.getFullYear(),data.getMonth(),1),fim:new Date(data.getFullYear(),data.getMonth()+1,0)};}
function formatarMes(data){const t=data.toLocaleDateString("pt-BR",{month:"long",year:"numeric"});return t.charAt(0).toUpperCase()+t.slice(1);}
function moeda(v){return `R$ ${formatarMoeda(Number(v||0))}`;}
function atualizarNavegacaoMes(){if(mesLabel)mesLabel.textContent=formatarMes(mesSelecionado);if(btnMesProximo){const h=new Date(),atual=new Date(h.getFullYear(),h.getMonth(),1),bloq=mesSelecionado>=atual;btnMesProximo.disabled=bloq;btnMesProximo.setAttribute("aria-disabled",String(bloq));}}
function erroLabel(el){el?.classList.add("label-erro","shake");setTimeout(()=>el?.classList.remove("shake"),500);setTimeout(()=>el?.classList.remove("label-erro"),3000);}
function erroInput(el){el?.classList.add("input-erro","shake");setTimeout(()=>el?.classList.remove("shake"),500);setTimeout(()=>el?.classList.remove("input-erro"),3000);}
function limparErro(el,label){el?.classList.remove("input-erro");label?.classList.remove("label-erro");}
function setStatus(texto="",erro=false){if(!statusEl)return;statusEl.textContent=texto;statusEl.hidden=!texto;statusEl.classList.toggle("error",erro);}

function dataHoraExibicao(despesa){
 const data=paraDate(despesa.dataDespesa)||paraDate(despesa.data);
 const registro=paraDate(despesa.createdAt)||data;
 const dia=data?data.toLocaleDateString("pt-BR",{day:"2-digit",month:"short"}).replace(".",""):"—";
 const hora=registro?registro.toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"}):"—";
 return `${dia} • ${hora}`;
}

function criarCardDespesa(d){
 const card=document.createElement("article");card.className="despesa-item";
 const badge=d.tipo==="barbearia"&&usuarioEhAdmin()?'<span class="despesa-tipo-badge">Barbearia</span>':"";
 card.innerHTML=`<div class="despesa-item-main"><div class="despesa-item-copy"><div class="despesa-item-title-row"><strong>${String(d.descricao||d.categoria||"Despesa").replaceAll("<","&lt;")}</strong>${badge}</div><span>${dataHoraExibicao(d)} • ${String(d.categoria||"Outros")}</span></div><strong class="despesa-item-valor">${moeda(d.valor)}</strong></div><div class="despesa-item-acoes"><button type="button" class="despesa-editar"><i class="fas fa-pen"></i><span>Editar</span></button><button type="button" class="despesa-item-excluir"><i class="fas fa-trash"></i><span>Excluir</span></button></div>`;
 card.querySelector(".despesa-editar")?.addEventListener("click",()=>abrirModalDespesa(d));
 card.querySelector(".despesa-item-excluir")?.addEventListener("click",()=>abrirExclusaoDespesa(d));
 return card;
}

function renderizarDespesas(){
 if(!listaEl)return;listaEl.innerHTML="";const total=despesasMes.reduce((s,i)=>s+Number(i.valor||0),0);if(totalEl)totalEl.textContent=moeda(total);if(quantidadeEl)quantidadeEl.textContent=despesasMes.length===1?"1 lançamento":`${despesasMes.length} lançamentos`;
 if(!despesasMes.length){listaEl.innerHTML='<div class="despesas-vazio"><i class="fas fa-receipt"></i><strong>Nenhuma despesa neste mês</strong><span>Lance materiais e outros custos profissionais deste período.</span></div>';return;}
 despesasMes.forEach(d=>listaEl.appendChild(criarCardDespesa(d)));
}

export async function carregarDespesasMes(){
 atualizarNavegacaoMes();listaEl?.classList.add("carregando");
 try{const {inicio,fim}=obterPeriodoMes();despesasMes=await listarDespesasPorPeriodo(inicio,fim,{incluirBarbearia:usuarioEhAdmin()});if(usuarioEhAdmin())despesasMes=despesasMes.filter(i=>i.tipo==="barbearia"||i.profissionalUid===state.user?.uid);renderizarDespesas();return despesasMes;}
 catch(error){console.error(error);despesasMes=[];renderizarDespesas();mostrarErro("Não foi possível carregar as despesas.");return [];}
 finally{listaEl?.classList.remove("carregando");}
}
export async function abrirDespesasAtual(){await carregarDespesasMes();}

function limitesMesParaModal(){
 const {inicio,fim}=obterPeriodoMes();const hoje=inicioDoDia(new Date());const max=fim>hoje?hoje:fim;return {min:chaveData(inicio),max:chaveData(max),inicio,fim:max};
}
function dataPadraoNovoLancamento(){const {inicio,fim}=limitesMesParaModal();const hoje=inicioDoDia(new Date());return hoje>=inicio&&hoje<=fim?hoje:fim;}
function combinarDataComHora(data, horaReferencia=new Date()){const r=new Date(data);r.setHours(horaReferencia.getHours(),horaReferencia.getMinutes(),horaReferencia.getSeconds(),0);return r;}

function abrirModalDespesa(despesa=null){
 despesaEmEdicao=despesa;form?.reset();setStatus();const admin=usuarioEhAdmin();if(tipoField)tipoField.hidden=!admin;if(inputTipo)inputTipo.disabled=!admin;
 const limites=limitesMesParaModal();if(inputData){inputData.min=limites.min;inputData.max=limites.max;}
 if(despesa){
   if(tituloModal)tituloModal.textContent="Editar despesa";const data=paraDate(despesa.dataDespesa)||paraDate(despesa.data)||dataPadraoNovoLancamento();if(inputData)inputData.value=chaveData(data);if(inputCategoria)inputCategoria.value=despesa.categoria||"Outros";if(inputDescricao)inputDescricao.value=despesa.descricao||"";if(inputValor)inputValor.value=formatarMoeda(Number(despesa.valor||0));if(inputTipo)inputTipo.value=admin&&despesa.tipo==="barbearia"?"barbearia":"profissional";if(btnSalvar)btnSalvar.textContent="Salvar alterações";
 } else {
   if(tituloModal)tituloModal.textContent="Nova despesa";if(inputData)inputData.value=chaveData(dataPadraoNovoLancamento());if(inputCategoria)inputCategoria.value="Material";if(inputTipo)inputTipo.value="profissional";if(btnSalvar)btnSalvar.textContent="Registrar despesa";
 }
 if(modal)modal.hidden=false;document.body.classList.add("modal-equipe-aberto");setTimeout(()=>inputDescricao?.focus(),0);
}
function fecharModalDespesa({forcar=false}={}){if(btnSalvar?.disabled&&!forcar)return;if(modal)modal.hidden=true;document.body.classList.remove("modal-equipe-aberto");despesaEmEdicao=null;setStatus();}

async function salvarDespesa(event){
 event.preventDefault();setStatus();const dataBase=dataDeInput(inputData?.value),valor=converterParaNumero(inputValor?.value),descricao=String(inputDescricao?.value||"").trim(),categoria=String(inputCategoria?.value||""),tipo=usuarioEhAdmin()?(inputTipo?.value||"profissional"):"profissional";let erro=false;
 const limites=limitesMesParaModal();
 if(!dataBase||dataBase<inicioDoDia(limites.inicio)||dataBase>inicioDoDia(limites.fim)){erroLabel(labels.data);erroInput(inputData);erro=true;}
 if(!categoria){erroLabel(labels.categoria);erroInput(inputCategoria);erro=true;}
 if(!descricao){erroLabel(labels.descricao);erroInput(inputDescricao);erro=true;}
 if(!Number.isFinite(valor)||valor<=0){erroLabel(labels.valor);erroInput(inputValor);erro=true;}
 if(erro)return;
 const originalData=despesaEmEdicao?(paraDate(despesaEmEdicao.dataDespesa)||paraDate(despesaEmEdicao.data)):null;
 const data=combinarDataComHora(dataBase,originalData||new Date());
 btnSalvar.disabled=true;btnSalvar.textContent=despesaEmEdicao?"Salvando...":"Registrando...";
 try{
   if(despesaEmEdicao){
     const tipoFinal=usuarioEhAdmin()?tipo:"profissional";const alt={data:data.toISOString(),dataDespesa:Timestamp.fromDate(data),categoria,descricao:descricao.slice(0,120),valor:Number(valor.toFixed(2)),tipo:tipoFinal};
     if(usuarioEhAdmin()&&tipoFinal==="barbearia"){alt.profissionalUid=null;alt.profissionalNome="Barbearia";}else if(tipoFinal==="profissional"&&!despesaEmEdicao.profissionalUid){alt.profissionalUid=state.user?.uid||null;alt.profissionalNome=String(state.perfilUsuario?.nome||state.membroAtual?.nome||state.user?.email||"Administrador");}
     await editarDespesa(despesaEmEdicao.id,alt,despesaEmEdicao);mostrarSucesso("Despesa atualizada.");
   }else{await criarDespesa({data,categoria,descricao,valor,tipo});mostrarSucesso("Despesa registrada.");}
   fecharModalDespesa({forcar:true});await carregarDespesasMes();
 }catch(error){console.error(error);mostrarErro("Não foi possível salvar a despesa.");}
 finally{btnSalvar.disabled=false;btnSalvar.textContent=despesaEmEdicao?"Salvar alterações":"Registrar despesa";}
}

function abrirExclusaoDespesa(d){despesaParaExcluir=d;if(descricaoExcluir)descricaoExcluir.textContent=`Excluir “${d.descricao||d.categoria||"Despesa"}” no valor de ${moeda(d.valor)}?`;modalExcluir?.classList.add("active");modalExcluir?.setAttribute("aria-hidden","false");}
function fecharExclusaoDespesa(){despesaParaExcluir=null;modalExcluir?.classList.remove("active");modalExcluir?.setAttribute("aria-hidden","true");}
async function confirmarExclusaoDespesa(){if(!despesaParaExcluir?.id)return;const id=despesaParaExcluir.id;btnConfirmarExcluir.disabled=true;btnConfirmarExcluir.textContent="Excluindo...";try{await excluirDespesa(id,despesaParaExcluir);despesasMes=despesasMes.filter(i=>i.id!==id);renderizarDespesas();mostrarSucesso("Despesa excluída.");fecharExclusaoDespesa();}catch(error){console.error(error);mostrarErro("Não foi possível excluir a despesa.");}finally{btnConfirmarExcluir.disabled=false;btnConfirmarExcluir.textContent="Excluir";}}

export function initDespesas(){
 if(inicializado)return;inicializado=true;
 inputValor?.addEventListener("input",()=>{aplicarMascaraMoedaInput(inputValor,9);limparErro(inputValor,labels.valor);});inputDescricao?.addEventListener("input",()=>limparErro(inputDescricao,labels.descricao));inputCategoria?.addEventListener("change",()=>limparErro(inputCategoria,labels.categoria));inputData?.addEventListener("change",()=>limparErro(inputData,labels.data));
 btnCalendario?.addEventListener("click",(event)=>{event.preventDefault();event.stopPropagation();abrirSeletorData(inputData);});
 btnMesAnterior?.addEventListener("click",async()=>{mesSelecionado=new Date(mesSelecionado.getFullYear(),mesSelecionado.getMonth()-1,1);await carregarDespesasMes();});
 btnMesProximo?.addEventListener("click",async()=>{const p=new Date(mesSelecionado.getFullYear(),mesSelecionado.getMonth()+1,1),h=new Date(),a=new Date(h.getFullYear(),h.getMonth(),1);if(p>a)return;mesSelecionado=p;await carregarDespesasMes();});
 btnNova?.addEventListener("click",()=>abrirModalDespesa());btnFecharModal?.addEventListener("click",()=>fecharModalDespesa());form?.addEventListener("submit",salvarDespesa);modal?.addEventListener("click",e=>{if(e.target===modal)fecharModalDespesa();});
 btnCancelarExcluir?.addEventListener("click",fecharExclusaoDespesa);btnConfirmarExcluir?.addEventListener("click",confirmarExclusaoDespesa);modalExcluir?.addEventListener("click",e=>{if(e.target===modalExcluir)fecharExclusaoDespesa();});
 atualizarNavegacaoMes();
}
