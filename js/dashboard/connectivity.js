let inicializado = false;
let timer = null;

function mostrar(tipo, texto, temporario = false) {
    const status = document.getElementById("connectionStatus");
    if (!status) return;

    clearTimeout(timer);
    const icone = status.querySelector("i");
    const textoEl = status.querySelector("span");

    status.classList.remove("offline", "online");
    status.classList.add(tipo);
    status.hidden = false;

    if (icone) {
        icone.className = tipo === "offline"
            ? "fas fa-triangle-exclamation"
            : "fas fa-circle-check";
    }
    if (textoEl) textoEl.textContent = texto;

    requestAnimationFrame(() => status.classList.add("show"));

    if (temporario) {
        timer = setTimeout(() => {
            status.classList.remove("show");
            setTimeout(() => {
                if (!status.classList.contains("show")) status.hidden = true;
            }, 190);
        }, 2200);
    }
}

export function initConnectivity() {
    if (inicializado) return;
    inicializado = true;

    if (!navigator.onLine) mostrar("offline", "Sem conexão com a internet");
    window.addEventListener("offline", () => mostrar("offline", "Sem conexão com a internet"));
    window.addEventListener("online", () => mostrar("online", "Conexão restaurada", true));
}
