# Sr NK v3.6 — Refinamento de UX para regressivo

- Loading de tela aparece apenas após 420 ms.
- Quando aparece, permanece pelo menos 220 ms para não piscar como erro.
- Fundo usa blur leve e escurecimento discreto.
- Boot mantém a tela de marca por no mínimo 700 ms e só libera quando a tela inicial está pronta.
- Se o boot ultrapassar 1,8 s, a interface otimista volta a aparecer para evitar sensação de travamento.
- Profissional pré-carrega e inicializa Registrar antes de liberar o app.
- Admin pré-carrega e inicializa Visão Geral antes de liberar o app.
- Hotfix de Histórico da v3.5 preservado.
