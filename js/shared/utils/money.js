export function formatarMoeda(valor) {
    return Number(valor || 0).toLocaleString("pt-BR", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}

export function converterParaNumero(valor) {
    if (valor === null || valor === undefined || String(valor).trim() === "") return null;
    const limpo = String(valor).trim().replace(/\./g, "").replace(",", ".");
    const numero = Number.parseFloat(limpo);
    return Number.isFinite(numero) ? numero : null;
}

export function formatarValorInput(valor) {
    return Number(valor || 0)
        .toFixed(2)
        .replace(".", ",")
        .replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

export function aplicarMascaraMoedaInput(input, maxDigitos = null) {
    if (!input) return;
    let value = String(input.value || "").replace(/\D/g, "");
    if (maxDigitos && value.length > maxDigitos) value = value.slice(0, maxDigitos);
    if (!value) {
        input.value = "";
        return;
    }
    value = (Number.parseInt(value, 10) / 100).toFixed(2).replace(".", ",");
    input.value = value.replace(/(\d)(?=(\d{3})+(?!\d))/g, "$1.");
}
