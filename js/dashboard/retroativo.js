import { state, onStateChange } from "./state.js?v=7.4";
import { criarAtendimento, excluirAtendimento } from "./data/atendimentos-repository.js?v=7.4";
import { listarMembrosEquipe } from "./data/equipe-repository.js?v=8.4";
import { invalidarCacheAtendimentos } from "./data/sync.js?v=7.4";
import { criarPayloadAtendimento } from "./services/atendimento-model.js?v=8.4";
import { obterServicos, obterServicoPorId, resolverPrecoServico, pagamentoEstaAtivo } from "./services/catalogo-service.js?v=7.4";
import { chaveData, dataRetroativaSemHora, inicioDoDia } from "./utils/date.js?v=7.4";
import { aplicarMascaraMoedaInput, converterParaNumero } from "./utils/money.js?v=7.4";
import { abrirSeletorData } from "./utils/dom.js?v=7.4";
import { mostrarErro } from "./services/feedback-service.js?v=7.4";

let inicializado=false, ultimoId=null, undoInterval=null, undoTimeout=null;
const form=document.getElementById("formAtendimentoRetroativo");
const inputData=document.getElementById("retroData");
const selectProfissional=document.getElementById("retroProfissional");
const selectServico=document.getElementById("retroServico");
const selectPagamento=document.getElementById("retroPagamento");
const checkValor=document.getElementById("retroValorDiferenciado");
const campoValor=document.getElementById("retroCampoValor");
const inputValor=document.getElementById("retroValor");
const checkObservacao=document.getElementById("retroTemObservacao");
const campoObservacao=document.getElementById("retroCampoObservacao");
const inputObservacao=document.getElementById("retroObservacao");
const btnSalvar=document.getElementById("btnSalvarRetroativo");
const status=document.getElementById("retroStatus");
const btnCalendario=document.getElementById("btnCalendarioRetro");
const undoContainer=document.getElementById("retroUndoContainer");
const btnUndo=document.getElementById("btnUndoRetroativo");
const labels={profissional:document.getElementById("labelRetroProfissional"),data:document.getElementById("labelRetroData"),servico:document.getElementById("labelRetroServico"),pagamento:document.getElementById("labelRetroPagamento"),valor:document.getElementById("labelRetroValor"),observacao:document.getElementById("labelRetroObservacao")};

function nomeAtual(){return String(state.perfilUsuario?.nome||state.membroAtual?.nome||state.user?.displayName||state.user?.email||"Administrador").trim();}
function erroLabel(el){el?.classList.add("label-erro","shake");setTimeout(()=>el?.classList.remove("shake"),500);setTimeout(()=>el?.classList.remove("label-erro"),3000);}
function erroInput(el){el?.classList.add("input-erro","shake");setTimeout(()=>el?.classList.remove("shake"),500);setTimeout(()=>el?.classList.remove("input-erro"),3000);}
function limparErro(el,label){el?.classList.remove("input-erro");label?.classList.remove("label-erro");}
function atualizarLimiteData(){if(inputData){inputData.max=chaveData(inicioDoDia(new Date()));}}
function membroSelecionado(){
 const uid=selectProfissional?.value||state.user?.uid;
 const membro=(state.equipe||[]).find(i=>(i.uid||i.id)===uid)||state.membroAtual;
 if(!membro)return null;
 const ambienteTeste=String(state.workspaceId||"").startsWith("teste-");
 const dono=membro?.dono===true||(ambienteTeste&&uid===state.user?.uid&&state.membroAtual?.papel==="admin");
 return {...membro,uid:membro.uid||membro.id||uid,dono,repassePct:dono?0:Number(membro?.repassePct??state.configSistema?.repasseDonoPct??35)};
}
function mostrarStatus(texto="",erro=false){if(!status)return;status.textContent=texto;status.hidden=!texto;status.classList.toggle("error",erro);}

function renderizarOpcoes(){
 if(selectServico){const atual=selectServico.value;selectServico.innerHTML='<option value="">Selecione</option>';obterServicos({somenteAtivos:true}).forEach(s=>{const o=document.createElement("option");o.value=s.id;o.textContent=s.nome;selectServico.appendChild(o);});if(obterServicoPorId(atual))selectServico.value=atual;}
 if(selectPagamento){const atual=selectPagamento.value;selectPagamento.innerHTML='<option value="">Selecione</option>';["Pix","Dinheiro","Débito","Crédito"].forEach(p=>{if(!pagamentoEstaAtivo(p))return;const o=document.createElement("option");o.value=p;o.textContent=p;selectPagamento.appendChild(o);});if(pagamentoEstaAtivo(atual))selectPagamento.value=atual;}
}

async function prepararProfissionais({ carregarSeVazio = false } = {}){
 if(!selectProfissional)return;
 const selecionadoAntes=selectProfissional.value;
 let membros = Array.isArray(state.equipe) ? state.equipe : [];

 // Atendimento retroativo pertence ao profissional escolhido, não ao papel do
 // usuário que está registrando. Em acesso administrativo carregamos a equipe
 // real e exibimos somente membros ativos que atuam como profissionais.
 if(carregarSeVazio || !membros.length){
   membros = await listarMembrosEquipe();
 }

 const atual=state.membroAtual;
 const uidAtual=state.user?.uid;
 const candidatos=[...membros];
 if(atual && uidAtual && !candidatos.some(m=>(m.uid||m.id)===uidAtual)){
   candidatos.unshift({...atual,uid:atual.uid||atual.id||uidAtual});
 }

 selectProfissional.innerHTML="";
 const vistos=new Set();
 candidatos
   .filter(m=>m?.ativo!==false && m?.atuaComoProfissional!==false)
   .forEach(m=>{
     const uid=m.uid||m.id;
     if(!uid||vistos.has(uid))return;
     vistos.add(uid);
     const o=document.createElement("option");
     o.value=uid;
     const nomeExibicao = uid === uidAtual
       ? (state.perfilUsuario?.nome || m.nome || state.user?.displayName || m.email)
       : (m.nome || m.email);
     o.textContent=String(nomeExibicao||"Profissional").trim();
     selectProfissional.appendChild(o);
   });

 const existeAnterior=[...selectProfissional.options].some(o=>o.value===selecionadoAntes);
 const existeAtual=[...selectProfissional.options].some(o=>o.value===uidAtual);
 selectProfissional.value=existeAnterior
   ? selecionadoAntes
   : (existeAtual ? uidAtual : (selectProfissional.options[0]?.value||""));
}

function aplicarPagamentoPadrao(){if(!selectPagamento||selectPagamento.value)return;const p=state.configSistema.pagamentoPadrao;if(pagamentoEstaAtivo(p))selectPagamento.value=p;}
function limparFormulario(){form?.reset();campoValor&&(campoValor.hidden=true);campoObservacao&&(campoObservacao.hidden=true);if(selectProfissional)selectProfissional.value=state.user?.uid||selectProfissional.options[0]?.value||"";renderizarOpcoes();aplicarPagamentoPadrao();atualizarLimiteData();mostrarStatus();}

function dispararUndo(id){
 ultimoId=id;if(undoContainer)undoContainer.hidden=false;let s=10;if(btnUndo)btnUndo.textContent=`Desfazer Registro (${s}s)`;clearInterval(undoInterval);clearTimeout(undoTimeout);
 undoInterval=setInterval(()=>{s--;if(s>0&&btnUndo)btnUndo.textContent=`Desfazer Registro (${s}s)`;else clearInterval(undoInterval);},1000);
 undoTimeout=setTimeout(()=>{if(undoContainer)undoContainer.hidden=true;ultimoId=null;clearInterval(undoInterval);},10000);
}

async function salvar(event){
 event.preventDefault();mostrarStatus();let temErro=false;
 const data=dataRetroativaSemHora(inputData?.value), servico=obterServicoPorId(selectServico?.value||""), pagamento=selectPagamento?.value||"", profissional=membroSelecionado(), hoje=inicioDoDia(new Date());
 if(!profissional){erroLabel(labels.profissional);erroInput(selectProfissional);temErro=true;}
 if(!data||inicioDoDia(data)>hoje){erroLabel(labels.data);erroInput(inputData);temErro=true;}
 if(!servico){erroLabel(labels.servico);erroInput(selectServico);temErro=true;}
 if(!pagamento||!pagamentoEstaAtivo(pagamento)){erroLabel(labels.pagamento);erroInput(selectPagamento);temErro=true;}
 const preco=servico&&profissional?resolverPrecoServico(servico,profissional):null;
 const valor=checkValor?.checked?(converterParaNumero(inputValor?.value)||0):Number(preco?.preco||0);
 if(checkValor?.checked&&valor<=0){erroLabel(labels.valor);erroInput(inputValor);temErro=true;}
 const obs=checkObservacao?.checked?String(inputObservacao?.value||"").trim():"";
 if(checkObservacao?.checked&&!obs){erroLabel(labels.observacao);erroInput(inputObservacao);temErro=true;}
 if(temErro||!servico||!profissional||valor<=0)return;
 const payload=criarPayloadAtendimento({servico:servico.nome,servicoId:servico.id,servicoNome:servico.nome,precoBase:preco.precoBase,precoProfissional:preco.precoProfissional,origemPreco:preco.origem,pagamento,valorBruto:valor,observacao:obs.slice(0,160),valorDiferenciado:Boolean(checkValor?.checked),dataAtendimento:data,retroativo:true,horaInformada:false,profissional},state.configSistema);
 btnSalvar.disabled=true;btnSalvar.textContent="Salvando...";
 try{const id=await criarAtendimento(payload);dispararUndo(id);invalidarCacheAtendimentos();limparFormulario();mostrarStatus("Atendimento retroativo salvo ✓");setTimeout(()=>{if(status?.textContent.includes("salvo"))mostrarStatus();},2200);}
 catch(error){console.error(error);mostrarErro("Não foi possível salvar o atendimento retroativo.");}
 finally{btnSalvar.disabled=false;btnSalvar.textContent="Salvar Atendimento";}
}

export async function initRetroativo(){
 if(inicializado)return;inicializado=true;atualizarLimiteData();await prepararProfissionais({ carregarSeVazio: true });renderizarOpcoes();aplicarPagamentoPadrao();
 btnCalendario?.addEventListener("click",(event)=>{event.preventDefault();event.stopPropagation();abrirSeletorData(inputData);});
 checkValor?.addEventListener("change",()=>{if(campoValor)campoValor.hidden=!checkValor.checked;if(!checkValor.checked&&inputValor)inputValor.value="";if(checkValor.checked)setTimeout(()=>inputValor?.focus(),0);});
 checkObservacao?.addEventListener("change",()=>{if(campoObservacao)campoObservacao.hidden=!checkObservacao.checked;if(!checkObservacao.checked&&inputObservacao)inputObservacao.value="";if(checkObservacao.checked)setTimeout(()=>inputObservacao?.focus(),0);});
 inputValor?.addEventListener("input",()=>{aplicarMascaraMoedaInput(inputValor);limparErro(inputValor,labels.valor);});
 inputObservacao?.addEventListener("input",()=>limparErro(inputObservacao,labels.observacao));
 inputData?.addEventListener("change",()=>limparErro(inputData,labels.data)); selectServico?.addEventListener("change",()=>limparErro(selectServico,labels.servico)); selectPagamento?.addEventListener("change",()=>limparErro(selectPagamento,labels.pagamento)); selectProfissional?.addEventListener("change",()=>limparErro(selectProfissional,labels.profissional));
 form?.addEventListener("submit",salvar);
 btnUndo?.addEventListener("click",async()=>{if(!ultimoId)return;clearInterval(undoInterval);clearTimeout(undoTimeout);btnUndo.disabled=true;btnUndo.textContent="Desfazendo...";try{await excluirAtendimento(ultimoId);invalidarCacheAtendimentos();if(undoContainer)undoContainer.hidden=true;ultimoId=null;mostrarStatus("Registro desfeito ↩");setTimeout(()=>mostrarStatus(),1800);}catch(error){console.error(error);mostrarErro("Não foi possível desfazer o registro.");}finally{btnUndo.disabled=false;}});
 onStateChange("configSistema",()=>{renderizarOpcoes();aplicarPagamentoPadrao();});
 onStateChange("equipe",()=>{ void prepararProfissionais(); });
}

export async function prepararRetroativoParaUso(){
 if(!inicializado) return;
 await prepararProfissionais({ carregarSeVazio: true });
 renderizarOpcoes();
 aplicarPagamentoPadrao();
 atualizarLimiteData();
}
