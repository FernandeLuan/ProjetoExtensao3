# Sr NK v3.3 — Sessões independentes

## URLs

- Profissional: `/profissional/login.html`
- Admin: `/admin/login.html`

## Comportamento

1. Cada login usa `browserSessionPersistence` do Firebase Auth.
2. Cada aba guarda `srnk:auth-area` em `sessionStorage`.
3. `/profissional/` só aceita sessão marcada como `profissional`.
4. `/admin/` só aceita sessão marcada como `admin` e, após carregar o membro, exige papel `admin` ou `owner`.
5. Trocar de área passa pelo login da área de destino e desconecta somente a sessão daquela aba.
6. O `login.html` da raiz continua apenas como redirecionador de compatibilidade.

## Teste recomendado

- Aba A: abrir `/profissional/login.html` e entrar com o barbeiro.
- Aba B: abrir `/admin/login.html` e entrar com o administrador.
- Registrar atendimento na Aba A e manter a Aba B aberta.
- Confirmar que uma aba não muda a conta da outra.
