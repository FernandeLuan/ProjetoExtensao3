# Sr NK 3.2 — arquitetura separada

## URLs no GitHub Pages
- Site público: `/SrNK/`
- Área profissional: `/SrNK/profissional/`
- Gestão administrativa: `/SrNK/admin/`
- Login compartilhado: `/SrNK/login.html`

## Estrutura
- `profissional/`: HTML e manifest da área do barbeiro.
- `admin/`: HTML e manifest da gestão.
- `js/profissional/`: bootstrap e navegação exclusivos do profissional.
- `js/admin/`: bootstrap e navegação exclusivos do admin.
- `js/shared/`: regras, estado, repositórios Firebase, serviços e módulos funcionais compartilhados.
- `css/profissional.css` e `css/admin.css`: cada app importa apenas os estilos de que precisa.

## Segurança
A separação de interface não substitui as Firestore Rules. O app profissional valida acesso profissional; o admin exige papel `admin`/`owner` ativo e acesso à visão da barbearia.

## Compatibilidade
`dashboard.html` permanece como redirecionamento para `/profissional/` para não quebrar favoritos antigos.

## v3.3 — Autenticação por área

- `/profissional/login.html` autentica exclusivamente a Área Profissional.
- `/admin/login.html` autentica exclusivamente a Gestão da Barbearia.
- Firebase Auth usa `browserSessionPersistence`: a sessão pertence à aba/sessão do navegador, não ao navegador inteiro.
- A sessão recebe um marcador `sessionStorage` (`srnk:auth-area`) e cada aplicação rejeita sessões autenticadas para outra área.
- Trocar Profissional ↔ Admin sempre passa pelo login da área de destino.
- Conta sem papel `admin`/`owner` não é redirecionada para Profissional: retorna ao login administrativo com mensagem de acesso negado.
- O backend continua sendo o mesmo Firebase/Firestore.
