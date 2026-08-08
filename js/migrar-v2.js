import { auth, db } from "./firebase-init.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  Timestamp,
  writeBatch
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const select = document.getElementById("profissional");
const btnAnalisar = document.getElementById("btnAnalisar");
const btnMigrar = document.getElementById("btnMigrar");
const status = document.getElementById("status");

let workspaceId = null;
let pendentes = [];
let membros = [];

function setStatus(texto) { status.textContent = texto; }
function nomeMembro(m) { return m.nome || m.email || m.uid || m.id; }

async function carregarContexto(user) {
  const perfilSnap = await getDoc(doc(db, "usuarios", user.uid));
  if (!perfilSnap.exists()) throw new Error("Perfil do usuário não encontrado.");
  workspaceId = perfilSnap.data().barbeariaId || user.uid;

  const membroSnap = await getDoc(doc(db, "barbearias", workspaceId, "membros", user.uid));
  if (!membroSnap.exists()) throw new Error("Membro atual não encontrado.");
  const papel = membroSnap.data().papel;
  if (!["admin", "owner"].includes(papel)) throw new Error("Somente Administrador pode executar esta migração.");

  const membrosSnap = await getDocs(collection(db, "barbearias", workspaceId, "membros"));
  membros = membrosSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(m => m.ativo === true);
  select.innerHTML = "";
  membros.forEach(m => {
    const opt = document.createElement("option");
    opt.value = m.uid || m.id;
    opt.textContent = `${nomeMembro(m)} — ${m.papel === "barber" ? "Barbeiro" : "Administrador"}`;
    select.appendChild(opt);
  });

  setStatus(`Ambiente: ${workspaceId}\n${membros.length} membro(s) ativo(s). Clique em “Analisar registros”.`);
}

async function analisar() {
  btnAnalisar.disabled = true;
  btnMigrar.disabled = true;
  try {
    const snap = await getDocs(collection(db, "barbearias", workspaceId, "atendimentos"));
    pendentes = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(a => !a.profissionalUid || !a.dataAtendimento);

    setStatus(`${snap.size} atendimento(s) analisado(s).\n${pendentes.length} registro(s) precisam de complemento para a v2.0.`);
    btnMigrar.disabled = pendentes.length === 0;
  } catch (error) {
    console.error(error);
    setStatus(`Erro ao analisar: ${error.message}`);
  } finally {
    btnAnalisar.disabled = false;
  }
}

function dataLegada(atendimento) {
  if (atendimento.dataAtendimento) return atendimento.dataAtendimento;
  if (!atendimento.data) return null;
  const data = new Date(atendimento.data);
  return Number.isNaN(data.getTime()) ? null : Timestamp.fromDate(data);
}

async function migrar() {
  const uid = select.value;
  const membro = membros.find(m => (m.uid || m.id) === uid);
  if (!membro || !pendentes.length) return;

  const confirmar = window.confirm(`Atribuir ${pendentes.length} registro(s) antigos a ${nomeMembro(membro)}? Os valores financeiros existentes serão preservados.`);
  if (!confirmar) return;

  btnMigrar.disabled = true;
  btnAnalisar.disabled = true;
  try {
    let processados = 0;
    for (let inicio = 0; inicio < pendentes.length; inicio += 400) {
      const lote = pendentes.slice(inicio, inicio + 400);
      const batch = writeBatch(db);

      lote.forEach(a => {
        const atualizacao = {
          schemaVersion: 3,
          migradoV2: true,
          migradoV2Em: serverTimestamp()
        };
        if (!a.profissionalUid) {
          atualizacao.profissionalUid = uid;
          atualizacao.profissionalNome = nomeMembro(membro);
        }
        if (!a.registradoPorUid) {
          atualizacao.registradoPorUid = uid;
          atualizacao.registradoPorNome = nomeMembro(membro);
        }
        if (!a.dataAtendimento) {
          const data = dataLegada(a);
          if (data) atualizacao.dataAtendimento = data;
        }

        batch.update(doc(db, "barbearias", workspaceId, "atendimentos", a.id), atualizacao);
      });

      await batch.commit();
      processados += lote.length;
      setStatus(`Migrando... ${processados}/${pendentes.length}`);
    }

    setStatus(`Concluído. ${processados} registro(s) complementado(s). Nenhum valor financeiro foi recalculado.`);
    pendentes = [];
  } catch (error) {
    console.error(error);
    setStatus(`Erro durante a migração: ${error.message}`);
    btnMigrar.disabled = false;
  } finally {
    btnAnalisar.disabled = false;
  }
}

btnAnalisar.addEventListener("click", analisar);
btnMigrar.addEventListener("click", migrar);

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    setStatus("Faça login no aplicativo e abra esta página novamente.");
    return;
  }
  try {
    await carregarContexto(user);
  } catch (error) {
    console.error(error);
    setStatus(`Acesso bloqueado: ${error.message}`);
  }
});
