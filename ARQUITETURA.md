# Sr NK 3.1 — arquitetura separada

## URLs no GitHub Pages
- Site público: `/ProjetoExtensao3/`
- Área profissional: `/ProjetoExtensao3/profissional/`
- Gestão administrativa: `/ProjetoExtensao3/admin/`
- Login compartilhado: `/ProjetoExtensao3/login.html`

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
