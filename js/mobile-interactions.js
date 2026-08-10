(() => {
    const coarsePointer = window.matchMedia?.("(pointer: coarse)")?.matches ?? false;
    if (!coarsePointer) return;

    const viewport = document.querySelector('meta[name="viewport"]');
    const viewportOriginal = viewport?.getAttribute("content") || "width=device-width, initial-scale=1.0";
    let restoreTimer = null;
    let travaAtiva = false;

    function conteudoViewportTravado() {
        const partes = viewportOriginal
            .split(",")
            .map((parte) => parte.trim())
            .filter((parte) => parte && !/^maximum-scale=/i.test(parte) && !/^user-scalable=/i.test(parte));
        return `${partes.join(", ")}, maximum-scale=1`;
    }

    function travarAutoZoom({ temporario = false } = {}) {
        if (!viewport) return;
        clearTimeout(restoreTimer);
        travaAtiva = true;
        viewport.setAttribute("content", conteudoViewportTravado());
        if (temporario) {
            restoreTimer = setTimeout(() => {
                const campoAtivo = document.activeElement?.matches?.("input, select, textarea");
                if (!campoAtivo) restaurarViewport();
            }, 1200);
        }
    }

    function restaurarViewport() {
        if (!viewport) return;
        clearTimeout(restoreTimer);
        travaAtiva = false;
        viewport.setAttribute("content", viewportOriginal);
    }

    // Exposto apenas para editores que criam/focam inputs de forma programática.
    window.srnkPrepararFocoSemZoom = () => travarAutoZoom({ temporario: true });

    let inicioToque = null;
    let ultimoToque = null;
    let multitoque = false;
    let bloquearToqueAtual = false;

    document.addEventListener("touchstart", (event) => {
        if (event.touches.length > 1) {
            // Pinça continua disponível: remove imediatamente a trava de escala.
            multitoque = true;
            inicioToque = null;
            ultimoToque = null;
            restaurarViewport();
            return;
        }

        multitoque = false;
        bloquearToqueAtual = false;
        const toque = event.touches[0];
        inicioToque = toque ? { x: toque.clientX, y: toque.clientY } : null;

        // No iOS o zoom pode começar antes do segundo touchend. Interceptamos
        // o início do segundo toque rápido, sem afetar toque único ou scroll.
        const alvoAtual = event.target.closest?.("button, a, input, select, textarea, label, [role='button'], .config-item, .equipe-card") || event.target;
        const agora = Date.now();
        const segundoToque = toque && ultimoToque
            && agora - ultimoToque.quando <= 330
            && alvoAtual === ultimoToque.alvo
            && Math.hypot(toque.clientX - ultimoToque.x, toque.clientY - ultimoToque.y) <= 26;
        if (segundoToque) {
            event.preventDefault();
            bloquearToqueAtual = true;
            ultimoToque = null;
            return;
        }

        const campo = event.target.closest?.("input, select, textarea");
        const gatilhoEditor = event.target.closest?.(".btn-alterar, [data-acao-editar], .config-service-actions button");
        if (campo) travarAutoZoom();
        else if (gatilhoEditor) travarAutoZoom({ temporario: true });
    }, { passive: false });

    document.addEventListener("focusin", (event) => {
        if (event.target.matches?.("input, select, textarea")) travarAutoZoom();
    }, true);

    document.addEventListener("focusout", (event) => {
        if (!event.target.matches?.("input, select, textarea")) return;
        clearTimeout(restoreTimer);
        restoreTimer = setTimeout(() => {
            const campoAtivo = document.activeElement?.matches?.("input, select, textarea");
            if (!campoAtivo) restaurarViewport();
        }, 180);
    }, true);

    document.addEventListener("touchend", (event) => {
        if (bloquearToqueAtual) {
            event.preventDefault();
            bloquearToqueAtual = false;
            inicioToque = null;
            return;
        }
        if (multitoque || !inicioToque || event.changedTouches.length !== 1) {
            multitoque = false;
            inicioToque = null;
            ultimoToque = null;
            return;
        }

        const toque = event.changedTouches[0];
        const deslocamento = Math.hypot(toque.clientX - inicioToque.x, toque.clientY - inicioToque.y);
        inicioToque = null;

        // Scroll/arraste permanece totalmente normal.
        if (deslocamento > 12) {
            ultimoToque = null;
            return;
        }

        const agora = Date.now();
        const alvo = event.target.closest?.("button, a, input, select, textarea, label, [role='button'], .config-item, .equipe-card") || event.target;
        const repetido = ultimoToque
            && agora - ultimoToque.quando <= 330
            && alvo === ultimoToque.alvo
            && Math.hypot(toque.clientX - ultimoToque.x, toque.clientY - ultimoToque.y) <= 26;

        if (repetido) {
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
        bloquearToqueAtual = false;
        if (!document.activeElement?.matches?.("input, select, textarea")) restaurarViewport();
    }, { passive: true });

    document.addEventListener("dblclick", (event) => {
        event.preventDefault();
    }, { passive: false });
})();
