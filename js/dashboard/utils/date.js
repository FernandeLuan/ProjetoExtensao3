export function paraDate(valor) {
    if (!valor) return null;
    if (valor instanceof Date) return Number.isNaN(valor.getTime()) ? null : valor;
    if (typeof valor?.toDate === "function") {
        const data = valor.toDate();
        return Number.isNaN(data.getTime()) ? null : data;
    }
    const data = new Date(valor);
    return Number.isNaN(data.getTime()) ? null : data;
}

export function inicioDoDia(data = new Date()) {
    const resultado = new Date(data);
    resultado.setHours(0, 0, 0, 0);
    return resultado;
}

export function somarDias(data, quantidade) {
    const resultado = inicioDoDia(data);
    resultado.setDate(resultado.getDate() + quantidade);
    return resultado;
}

export function chaveData(data) {
    const valor = paraDate(data);
    if (!valor) return "";
    const ano = valor.getFullYear();
    const mes = String(valor.getMonth() + 1).padStart(2, "0");
    const dia = String(valor.getDate()).padStart(2, "0");
    return `${ano}-${mes}-${dia}`;
}

export function mesmoDia(dataA, dataB) {
    return Boolean(chaveData(dataA)) && chaveData(dataA) === chaveData(dataB);
}

export function formatarTituloData(data) {
    const valor = paraDate(data) || new Date();
    const hoje = inicioDoDia(new Date());
    const dia = String(valor.getDate()).padStart(2, "0");
    const mes = valor.toLocaleDateString("pt-BR", { month: "long" });

    if (mesmoDia(valor, hoje)) {
        return `Hoje • ${dia} de ${mes}`;
    }

    return `${dia} de ${mes} de ${valor.getFullYear()}`;
}

export function dataDeInput(valor) {
    if (!valor) return null;
    const [ano, mes, dia] = String(valor).split("-").map(Number);
    if (!ano || !mes || !dia) return null;
    const data = new Date(ano, mes - 1, dia);
    return Number.isNaN(data.getTime()) ? null : data;
}

export function dataRetroativaSemHora(valor) {
    const data = dataDeInput(valor);
    if (!data) return null;
    // Meio-dia evita mudança de data por timezone sem inventar um horário de atendimento.
    data.setHours(12, 0, 0, 0);
    return data;
}

export function obterDataAtendimento(atendimento) {
    return paraDate(atendimento?.dataAtendimento) || paraDate(atendimento?.data);
}

export function formatarDataHora(valor) {
    const data = paraDate(valor);
    if (!data) return "Data indisponível";
    const dia = data.toLocaleDateString("pt-BR");
    const hora = data.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    return `${dia} às ${hora}`;
}
