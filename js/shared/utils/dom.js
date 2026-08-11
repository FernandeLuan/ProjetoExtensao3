export function escaparHtml(valor) {
    return String(valor ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

export function setTexto(id, texto) {
    const elemento = document.getElementById(id);
    if (elemento) elemento.textContent = texto;
}

export function abrirSeletorData(input) {
    if (!input) return;
    try {
        if (typeof input.showPicker === "function") input.showPicker();
        else input.click();
    } catch {
        input.click();
    }
}
