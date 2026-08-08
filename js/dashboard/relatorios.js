import { chaveData, inicioDoDia, somarDias } from "./utils/date.js?v=4.0";

let inicializado = false;

export function prepararRelatoriosHoje() {
    const hoje = new Date();
    const dataStr = chaveData(hoje);
    const inicio = document.getElementById("dataInicioRelatorio");
    const fim = document.getElementById("dataFimRelatorio");
    if (inicio) inicio.value = dataStr;
    if (fim) fim.value = dataStr;
    document.querySelectorAll("#relatorios .btn-filtro").forEach((btn) => btn.classList.remove("active"));
    document.getElementById("btnRelHoje")?.classList.add("active");
}

function setDatasRelatorio(tipo) {
    document.querySelectorAll("#relatorios .btn-filtro").forEach((btn) => btn.classList.remove("active"));
    const hoje = inicioDoDia(new Date());
    let inicio = hoje;

    if (tipo === "semana") inicio = somarDias(hoje, -6);
    if (tipo === "mes") inicio = new Date(hoje.getFullYear(), hoje.getMonth(), 1);

    document.getElementById(`btnRel${tipo === "hoje" ? "Hoje" : tipo === "semana" ? "Semana" : "Mes"}`)?.classList.add("active");
    const inputInicio = document.getElementById("dataInicioRelatorio");
    const inputFim = document.getElementById("dataFimRelatorio");
    if (inputInicio) inputInicio.value = chaveData(inicio);
    if (inputFim) inputFim.value = chaveData(hoje);
}

export function initRelatorios() {
    if (inicializado) return;
    inicializado = true;
    document.getElementById("btnRelHoje")?.addEventListener("click", () => setDatasRelatorio("hoje"));
    document.getElementById("btnRelSemana")?.addEventListener("click", () => setDatasRelatorio("semana"));
    document.getElementById("btnRelMes")?.addEventListener("click", () => setDatasRelatorio("mes"));
}
