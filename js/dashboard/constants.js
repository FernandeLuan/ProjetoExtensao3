export const APP_VERSION = "1.2.0";
export const SCHEMA_VERSION = 2;

export const SERVICOS = [
    "Cabelo + Barba + Sobrancelha",
    "Cabelo + Barba",
    "Cabelo + Sobrancelha",
    "Cabelo",
    "Barba"
];

export const PAGAMENTOS = ["Crédito", "Débito", "Pix", "Dinheiro"];

export const DEFAULT_CONFIG = Object.freeze({
    taxaDebito: 1.5,
    taxaCredito: 3.51,
    repasseDonoPct: 35,
    pagamentoPadrao: "nenhum",
    precos: Object.freeze({
        "Cabelo + Barba + Sobrancelha": 110,
        "Cabelo + Barba": 105,
        "Cabelo + Sobrancelha": 75,
        "Cabelo": 60,
        "Barba": 50
    })
});

export function criarConfigPadrao() {
    return {
        taxaDebito: DEFAULT_CONFIG.taxaDebito,
        taxaCredito: DEFAULT_CONFIG.taxaCredito,
        repasseDonoPct: DEFAULT_CONFIG.repasseDonoPct,
        pagamentoPadrao: DEFAULT_CONFIG.pagamentoPadrao,
        precos: { ...DEFAULT_CONFIG.precos }
    };
}
