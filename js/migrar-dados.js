import { auth, db } from "./firebase-init.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
    collection,
    doc,
    getDoc,
    getDocs,
    serverTimestamp,
    setDoc,
    writeBatch
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const emailEl = document.getElementById("migEmail");
const uidEl = document.getElementById("migUid");
const qtdEl = document.getElementById("migQtd");
const configEl = document.getElementById("migConfig");
const statusEl = document.getElementById("migStatus");
const btnConferir = document.getElementById("btnConferirMigracao");
const confirmarInput = document.getElementById("confirmacaoMigracao");
const btnMigrar = document.getElementById("btnExecutarMigracao");

let userAtual = null;
let docsOrigem = [];
let configOrigem = null;
let auditado = false;

function status(texto, tipo = "") {
    statusEl.textContent = texto;
    statusEl.className = `status ${tipo}`.trim();
}

async function auditar() {
    if (!userAtual) return;
    status("Lendo o banco antigo...");
    btnConferir.disabled = true;

    try {
        const atendimentosSnap = await getDocs(collection(db, "atendimentos"));
        const configSnap = await getDoc(doc(db, "configuracoes", "geral"));
        docsOrigem = atendimentosSnap.docs;
        configOrigem = configSnap.exists() ? configSnap.data() : null;

        qtdEl.textContent = `${docsOrigem.length} registro(s)`;
        configEl.textContent = configOrigem ? "Encontrada" : "Não encontrada";
        auditado = true;
        confirmarInput.disabled = false;
        status("Confira e-mail, UID e quantidade. Se estiver correto, digite MIGRAR.", "ok");
    } catch (error) {
        console.error(error);
        status("Não foi possível ler o banco antigo. Não publique as regras finais antes da migração.", "erro");
    } finally {
        btnConferir.disabled = false;
    }
}

confirmarInput.addEventListener("input", () => {
    btnMigrar.disabled = !(auditado && confirmarInput.value.trim().toUpperCase() === "MIGRAR");
});

btnConferir.addEventListener("click", auditar);

btnMigrar.addEventListener("click", async () => {
    if (!userAtual || !auditado || confirmarInput.value.trim().toUpperCase() !== "MIGRAR") return;

    const uid = userAtual.uid;
    btnMigrar.disabled = true;
    btnConferir.disabled = true;
    confirmarInput.disabled = true;
    status("Preparando o novo ambiente...");

    try {
        await setDoc(doc(db, "usuarios", uid), {
            email: userAtual.email || "",
            barbeariaId: uid,
            schemaVersion: 2,
            atualizadoEm: serverTimestamp()
        }, { merge: true });

        await setDoc(doc(db, "barbearias", uid), {
            nome: "Marlon Barber",
            ownerUid: uid,
            schemaVersion: 2,
            atualizadoEm: serverTimestamp()
        }, { merge: true });

        await setDoc(doc(db, "barbearias", uid, "membros", uid), {
            uid,
            email: userAtual.email || "",
            papel: "owner",
            ativo: true,
            atualizadoEm: serverTimestamp()
        }, { merge: true });

        if (configOrigem) {
            await setDoc(doc(db, "barbearias", uid, "configuracoes", "geral"), {
                ...configOrigem,
                schemaVersion: 2,
                migradoEm: serverTimestamp()
            }, { merge: true });
        }

        const tamanhoLote = 400;
        for (let inicio = 0; inicio < docsOrigem.length; inicio += tamanhoLote) {
            const lote = writeBatch(db);
            const grupo = docsOrigem.slice(inicio, inicio + tamanhoLote);

            grupo.forEach((origem) => {
                const dados = { ...origem.data() };
                if (!dados.dataAtendimento && dados.data) {
                    const data = new Date(dados.data);
                    if (!Number.isNaN(data.getTime())) dados.dataAtendimento = data;
                }
                dados.schemaVersion = dados.schemaVersion || 1;
                dados.migradoEm = serverTimestamp();
                lote.set(doc(db, "barbearias", uid, "atendimentos", origem.id), dados, { merge: true });
            });

            await lote.commit();
            status(`Copiando atendimentos... ${Math.min(inicio + grupo.length, docsOrigem.length)}/${docsOrigem.length}`);
        }

        const destinoSnap = await getDocs(collection(db, "barbearias", uid, "atendimentos"));
        const idsDestino = new Set(destinoSnap.docs.map((item) => item.id));
        const faltando = docsOrigem.filter((item) => !idsDestino.has(item.id));

        if (faltando.length) {
            throw new Error(`Verificação encontrou ${faltando.length} registro(s) ausente(s).`);
        }

        status(`Migração concluída e verificada: ${docsOrigem.length} atendimento(s) copiado(s). O banco antigo continua intacto.`, "ok");
        btnMigrar.textContent = "Migração concluída ✓";
    } catch (error) {
        console.error(error);
        status(`Migração interrompida: ${error.message || "erro desconhecido"}. Nada foi apagado do banco antigo; você pode conferir e executar novamente.`, "erro");
        btnMigrar.disabled = false;
        btnConferir.disabled = false;
        confirmarInput.disabled = false;
    }
});

onAuthStateChanged(auth, (user) => {
    if (!user) {
        status("Faça login no dashboard com a conta de produção e depois abra esta página.", "erro");
        emailEl.textContent = "Não autenticado";
        return;
    }

    userAtual = user;
    emailEl.textContent = user.email || "Sem e-mail";
    uidEl.textContent = user.uid;
    status("Conta identificada. Clique em Conferir dados antes de qualquer migração.");
});
