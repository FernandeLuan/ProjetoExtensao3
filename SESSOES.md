# Sr NK v3.4 — Sessões independentes

## URLs
- Profissional: `/ProjetoExtensao3/profissional/login.html`
- Admin: `/ProjetoExtensao3/admin/login.html`

## Comportamento
1. Cada login usa `browserSessionPersistence` do Firebase Auth.
2. Cada aba guarda `srnk:auth-area` em `sessionStorage`.
3. `/profissional/` só aceita sessão marcada como `profissional` e membro com atuação profissional.
4. `/admin/` só aceita sessão marcada como `admin` e membro ativo com papel `admin` ou `owner`.
5. Trocar de área passa pelo login da área de destino e desconecta somente a sessão daquela aba.
6. `login.html` da raiz permanece apenas como redirecionador de compatibilidade.
