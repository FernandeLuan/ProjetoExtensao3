import { auth } from "../firebase-init.js?v=9.0";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { inicializarContexto } from "../shared/data/context.js?v=9.0";
import { carregarConfiguracoesDoBanco } from "../shared/data/configuracoes-repository.js?v=9.0";
import { definirConfiguracoes } from "../shared/state.js?v=9.0";
import { initTheme } from "../shared/theme.js?v=9.0";
import { initConnectivity } from "../shared/connectivity.js?v=9.0";
import { mostrarErro } from "../shared/services/feedback-service.js?v=9.0";
import { exigirTrocaSenhaPrimeiroAcesso } from "../shared/primeiro-acesso.js?v=9.0";
import { aplicarPermissoesInterface, podeUsarVisaoProfissional, usuarioEhAdmin, podeUsarVisaoBarbearia } from "../shared/permissoes.js?v=9.0";
import { initNavigation, configurarNavegacao, abrirInicio } from "./navigation.js?v=9.0";

let appInicializado=false; const inicioBoot=performance.now(), BOOT_MINIMO_MS=180;
document.body.dataset.srnkVisao='profissional'; document.body.dataset.srnkArea='profissional';
initTheme(); initConnectivity(); initNavigation();
async function finalizarBoot(){const restante=Math.max(0,BOOT_MINIMO_MS-(performance.now()-inicioBoot));if(restante)await new Promise(r=>setTimeout(r,restante));document.body.classList.remove('dashboard-booting');document.getElementById('appBootStatus')?.setAttribute('hidden','');}
async function iniciar(user){const contexto=await inicializarContexto(user);if(contexto.perfil?.trocarSenha===true)await exigirTrocaSenhaPrimeiroAcesso(contexto);if(!podeUsarVisaoProfissional()){if(usuarioEhAdmin()&&podeUsarVisaoBarbearia()){window.location.replace('../admin/');return;}const e=new Error('Esta conta não possui acesso profissional.');e.code='SEM_ACESSO';throw e;}aplicarPermissoesInterface();definirConfiguracoes(await carregarConfiguracoesDoBanco());configurarNavegacao();await abrirInicio();appInicializado=true;await finalizarBoot();}
onAuthStateChanged(auth,async user=>{if(!user){window.location.replace('../login.html?destino=profissional');return;}if(appInicializado)return;try{await iniciar(user);}catch(error){console.error('[Profissional] Falha ao iniciar:',error);if(error?.code==='ACESSO_DESATIVADO'||error?.code==='SEM_ACESSO'){await signOut(auth);window.location.replace(`../login.html?destino=profissional&motivo=${error.code==='ACESSO_DESATIVADO'?'desativado':'sem-acesso'}`);return;}await finalizarBoot();mostrarErro('Não foi possível carregar seu ambiente. Confira sua conexão e tente novamente.');}});
