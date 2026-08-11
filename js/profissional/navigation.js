import { auth } from "../firebase-init.js?v=9.2";
import { signOut } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { usuarioEhAdmin, podeUsarVisaoBarbearia } from "../shared/permissoes.js?v=9.2";
import { mostrarErro } from "../shared/services/feedback-service.js?v=9.2";
import { iniciarLoadingTela, finalizarLoadingTela } from "../shared/services/ui-loading-service.js?v=9.2";
import { iniciarMedicao, finalizarMedicao } from "../shared/services/perf-service.js?v=9.2";

let inicializado = false;
const modulos = new Map();
const carregamentos = new Map();
const execucoesSecao = new Map();
const menuToggle = document.getElementById("menuToggle");
const sidebarMenu = document.getElementById("sidebarMenu");
const sidebarOverlay = document.getElementById("sidebarOverlay");

const MENSAGENS = {
  registrar: "Preparando registro...",
  painelFinanceiro: "Carregando painel...",
  historico: "Buscando histórico...",
  relatorios: "Montando relatório...",
  estoque: "Carregando produtos...",
  despesas: "Carregando despesas...",
  conta: "Carregando sua conta..."
};

function itensBottomNav(){ return [...document.querySelectorAll('.bottom-nav-item[data-nav-target]')]; }
function abrirMenu(){ sidebarMenu?.classList.add('active'); sidebarOverlay?.classList.add('active'); menuToggle?.classList.add('menu-open'); menuToggle?.setAttribute('aria-expanded','true'); }
export function fecharMenu(){ sidebarMenu?.classList.remove('active'); sidebarOverlay?.classList.remove('active'); menuToggle?.classList.remove('menu-open'); menuToggle?.setAttribute('aria-expanded','false'); }

export function configurarNavegacao(){
  const lista = sidebarMenu?.querySelector('ul');
  if (!lista) return;
  const linkAdmin = usuarioEhAdmin() && podeUsarVisaoBarbearia()
    ? `<li><a class="menu-area-switch" href="../admin/"><i class="fas fa-store"></i><span>Gestão da barbearia</span></a></li>` : '';
  lista.innerHTML = `
    <li><a href="#estoque"><i class="fas fa-cart-shopping"></i><span>Vender produto</span></a></li>
    <li><a href="#despesas"><i class="fas fa-receipt"></i><span>Despesas</span></a></li>
    <li><a href="#conta"><i class="fas fa-user-lock"></i><span>Minha conta</span></a></li>
    ${linkAdmin}
    <li aria-hidden="true" class="menu-divider"></li>
    <li><a class="menu-logout" href="#" id="logoutBtnSide"><i class="fas fa-sign-out-alt"></i><span>Sair do sistema</span></a></li>`;
}

function atualizarAtivo(targetId){
  let ativoNaBarra=false;
  itensBottomNav().forEach(item=>{ const ativo=item.dataset.navTarget===targetId; ativoNaBarra ||= ativo; item.classList.toggle('active',ativo); if(ativo)item.setAttribute('aria-current','page'); else item.removeAttribute('aria-current'); });
  menuToggle?.classList.toggle('active', !ativoNaBarra && ['estoque','despesas','conta'].includes(targetId));
}
function animar(section){ section.classList.remove('section-enter'); void section.offsetWidth; section.classList.add('section-enter'); setTimeout(()=>section.classList.remove('section-enter'),220); }
async function importar(chave,caminho){ if(modulos.has(chave))return modulos.get(chave); if(carregamentos.has(chave))return carregamentos.get(chave); const medicao=iniciarMedicao(`Import ${chave}`); const p=import(caminho).then(m=>{modulos.set(chave,m);carregamentos.delete(chave);finalizarMedicao(medicao);return m;}).catch(e=>{carregamentos.delete(chave);finalizarMedicao(medicao,'erro');throw e;}); carregamentos.set(chave,p); return p; }
export function preloadInicio(){ return importar('registrar','../shared/registrar.js?v=9.2'); }
async function carregar(targetId){
  switch(targetId){
    case 'registrar': { const m=await importar('registrar','../shared/registrar.js?v=9.2'); await m.initRegistrar?.(); await m.abrirRegistrar?.(); return; }
    case 'painelFinanceiro': { const m=await importar('painel','../shared/painel.js?v=9.2'); await m.abrirPainelHoje?.(); return; }
    case 'historico': { const m=await importar('historico','../shared/historico.js?v=9.2'); await m.abrirHistoricoHoje?.(); return; }
    case 'relatorios': { const m=await importar('relatorios','../shared/relatorios.js?v=9.2'); await m.initRelatorios?.(); await m.prepararRelatoriosHoje?.(); return; }
    case 'estoque': { const m=await importar('estoque','../shared/estoque.js?v=9.2'); m.initEstoque?.(); await m.abrirEstoque?.(); return; }
    case 'despesas': { const m=await importar('despesas','../shared/despesas.js?v=9.2'); m.initDespesas?.(); await m.abrirDespesasAtual?.(); return; }
    case 'conta': { const m=await importar('conta','../shared/conta.js?v=9.2'); m.initConta?.(); await m.abrirConta?.(); return; }
  }
}
function iniciarCarregamento(targetId,section){
  section?.setAttribute('aria-busy','true'); section?.classList.add('section-module-loading');
  if(execucoesSecao.has(targetId))return execucoesSecao.get(targetId);
  const token=iniciarLoadingTela(MENSAGENS[targetId]||'Carregando...',{delay:320});
  const medicao=iniciarMedicao(`Seção ${targetId}`);
  const p=carregar(targetId).catch(e=>{console.error(`[Profissional] Erro ao carregar ${targetId}:`,e);mostrarErro('Não foi possível abrir esta seção. Tente novamente.');throw e;}).finally(()=>{finalizarMedicao(medicao);finalizarLoadingTela(token);execucoesSecao.delete(targetId);section?.removeAttribute('aria-busy');section?.classList.remove('section-module-loading');});
  execucoesSecao.set(targetId,p);
  return p;
}
export async function exibirSecao(href){
  if(!href?.startsWith('#'))return; const targetId=href.slice(1); const permitidos=new Set(['registrar','painelFinanceiro','historico','relatorios','estoque','despesas','conta']); if(!permitidos.has(targetId))return exibirSecao('#registrar');
  const target=document.querySelector(href); if(!target)return; document.querySelectorAll('main > section').forEach(s=>s.style.display='none'); target.style.display='block'; animar(target); atualizarAtivo(targetId); return iniciarCarregamento(targetId,target);
}
export async function abrirInicio(){ fecharMenu(); await exibirSecao('#registrar'); }
async function logout(){ try{await signOut(auth);}finally{window.location.href='../login.html?destino=profissional';} }
export function initNavigation(){
  if(inicializado)return; inicializado=true;
  menuToggle?.addEventListener('click',()=>sidebarMenu?.classList.contains('active')?fecharMenu():abrirMenu()); sidebarOverlay?.addEventListener('click',fecharMenu); document.addEventListener('keydown',e=>{if(e.key==='Escape')fecharMenu();});
  document.querySelector('.bottom-nav')?.addEventListener('click',e=>{const item=e.target.closest('.bottom-nav-item[data-nav-target]'); if(!item)return; e.preventDefault(); fecharMenu(); void exibirSecao(`#${item.dataset.navTarget}`);});
  sidebarMenu?.addEventListener('click',e=>{const link=e.target.closest('a'); if(!link)return; if(link.classList.contains('menu-logout')){e.preventDefault();void logout();return;} const href=link.getAttribute('href'); if(href?.startsWith('#')){e.preventDefault();void exibirSecao(href);fecharMenu();}});
}
