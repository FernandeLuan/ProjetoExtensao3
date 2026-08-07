// =============================
// ESTADO COMPARTILHADO
// =============================
export const state = {
    atendimentos: [],
    periodoSelecionado: "hoje",

    configSistema: {
        taxaDebito: 1.5,
        taxaCredito: 3.51,
        repasseDonoPct: 35,
        precos: {
            "Cabelo + Barba + Sobrancelha": 110,
            "Cabelo + Barba": 105,
            "Cabelo + Sobrancelha": 75,
            "Cabelo": 60,
            "Barba": 50
        }
    }
};
