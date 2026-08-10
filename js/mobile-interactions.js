(() => {
    const coarsePointer = window.matchMedia?.("(pointer: coarse)")?.matches ?? false;
    if (!coarsePointer) return;

    const viewport = document.querySelector('meta[name="viewport"]');
    const viewportOriginal = viewport?.getAttribute("content") || "width=device-width, initial-scale=1.0";
    let viewportTimer = null;

    function viewportSemAutoZoom() {
        if (!viewport) return;
        clearTimeout(viewportTimer);
        const partes = viewportOriginal
            .split(",")
            .map((parte) => parte.trim())
            .filter((parte) => parte && !/^maximum-scale=/i.test(parte) && !/^user-scalable=/i.test(parte));
        viewport.setAttribute("content", `${partes.join(", ")}, maximum-scale=1`);
        viewportTimer = setTimeout(() => {
            viewport.setAttribute("content", viewportOriginal);
        }, 550);
    }

    let inicioToque = null;
    let ultimoToque = null;
    let multitoque = false;

    document.addEventListener("touchstart", (event) => {
        if (event.touches.length > 1) {
            multitoque = true;
            inicioToque = null;
            ultimoToque = null;
            return;
        }

        multitoque = false;
        const toque = event.touches[0];
        inicioToque = toque ? { x: toque.clientX, y: toque.clientY } : null;

        const campo = event.target.closest?.("input, select, textarea");
        if (campo) viewportSemAutoZoom();
    }, { passive: true });

    document.addEventListener("touchend", (event) => {
        if (multitoque || !inicioToque || event.changedTouches.length !== 1) {
            multitoque = false;
            inicioToque = null;
            ultimoToque = null;
            return;
        }

        const toque = event.changedTouches[0];
        const deslocamento = Math.hypot(toque.clientX - inicioToque.x, toque.clientY - inicioToque.y);
        inicioToque = null;

        // Scroll/arraste não é tratado como toque duplo.
        if (deslocamento > 12) {
            ultimoToque = null;
            return;
        }

        const agora = Date.now();
        const alvo = event.target.closest?.("button, a, input, select, textarea, label, [role='button']") || event.target;
        const repetido = ultimoToque
            && agora - ultimoToque.quando <= 320
            && alvo === ultimoToque.alvo
            && Math.hypot(toque.clientX - ultimoToque.x, toque.clientY - ultimoToque.y) <= 24;

        if (repetido) {
            // Cancela apenas o segundo toque rápido. O primeiro clique já ocorreu.
            event.preventDefault();
            ultimoToque = null;
            return;
        }

        ultimoToque = { quando: agora, alvo, x: toque.clientX, y: toque.clientY };
    }, { passive: false });

    document.addEventListener("touchcancel", () => {
        inicioToque = null;
        ultimoToque = null;
        multitoque = false;
    }, { passive: true });

    // Fallback para navegadores que transformam o gesto em dblclick.
    document.addEventListener("dblclick", (event) => {
        event.preventDefault();
    }, { passive: false });
})();
