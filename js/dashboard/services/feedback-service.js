let timer = null;

function obterToast() {
    let toast = document.getElementById("appToast");
    if (toast) return toast;

    toast = document.createElement("div");
    toast.id = "appToast";
    toast.className = "app-toast";
    toast.setAttribute("role", "status");
    toast.setAttribute("aria-live", "polite");
    document.body.appendChild(toast);
    return toast;
}

export function mostrarMensagem(texto, tipo = "info", duracao = 2800) {
    const toast = obterToast();
    clearTimeout(timer);
    toast.className = `app-toast ${tipo}`;
    toast.textContent = texto;
    requestAnimationFrame(() => toast.classList.add("show"));

    timer = setTimeout(() => {
        toast.classList.remove("show");
    }, duracao);
}

export function mostrarErro(texto = "Não foi possível concluir a operação.") {
    mostrarMensagem(texto, "error", 3400);
}

export function mostrarSucesso(texto) {
    mostrarMensagem(texto, "success", 2200);
}
