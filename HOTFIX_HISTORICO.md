# Sr NK v3.5 — Hotfix Histórico

- Histórico de hoje abre imediatamente com dados já presentes em `state.atendimentos`.
- Sincronização com Firestore ocorre em segundo plano e não bloqueia a navegação.
- Registrar atendimento não limpa mais todo o cache logo após uma criação bem-sucedida.
- Histórico é pré-aquecido em idle após a tela inicial para reduzir o custo do primeiro acesso no celular.
- Não há dependência de estoque/vendas na abertura do Histórico.
