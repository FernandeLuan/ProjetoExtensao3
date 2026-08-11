# Sr NK — Checklist de regressão v3.4

## Autenticação
- Profissional abre pelo login próprio e aceita somente membro ativo com atuação profissional.
- Admin abre pelo login próprio e aceita somente `admin`/`owner`.
- Duas abas podem manter usuários diferentes.
- Logout de uma área não encerra a outra aba.

## Registrar atendimento
- Selecionar serviço e pagamento.
- Pix/Dinheiro: sem taxa de cartão.
- Débito/Crédito: aplicar a taxa configurada do profissional.
- Repasse da barbearia = **valor bruto do serviço × repasse %**.
- Líquido do profissional = bruto − taxa de cartão − repasse.
- Exemplo: serviço R$ 100, taxa 3%, repasse 35% → taxa R$ 3, repasse R$ 35, líquido profissional R$ 62.
- Dono (`dono=true`) continua com repasse 0.
- Editar e excluir atendimento atualiza resumos.

## Profissional
- Registrar.
- Painel.
- Histórico.
- Relatório.
- Venda de produto.
- Despesas.
- Minha conta.

## Admin
- Visão Geral.
- Histórico.
- Equipe.
- Relatório.
- Estoque e vendas.
- Despesas.
- Configurações.
- Minha conta.

## Financeiro
- Conferir bruto, taxas, repasse, líquido do profissional e lucro da barbearia.
- No primeiro acesso administrativo após esta versão, o sistema migra uma única vez os snapshots antigos para a regra de repasse sobre o bruto e corrige os resumos derivados.

## PWA
- Instalar Profissional e Admin na tela inicial.
- O ícone deve ser a logo Sr NK, nunca foto de pessoa.
- Se uma instalação antiga mantiver o ícone anterior, remover o atalho/app e instalar novamente.
