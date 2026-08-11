# Sr NK v3.4 — arquitetura para regressão

## URLs no GitHub Pages
- Site público: `/ProjetoExtensao3/`
- Área profissional: `/ProjetoExtensao3/profissional/`
- Login profissional: `/ProjetoExtensao3/profissional/login.html`
- Gestão administrativa: `/ProjetoExtensao3/admin/`
- Login administrativo: `/ProjetoExtensao3/admin/login.html`

## Estrutura
- `profissional/`: HTML e manifest da área do barbeiro.
- `admin/`: HTML e manifest da gestão.
- `js/profissional/`: bootstrap e navegação exclusivos do profissional.
- `js/admin/`: bootstrap e navegação exclusivos do admin.
- `js/shared/`: regras, estado, repositórios Firebase, serviços e módulos funcionais compartilhados.
- `css/profissional.css` e `css/admin.css`: estilos compilados por área.

## Autenticação
- Cada área possui login próprio.
- Firebase Auth usa `browserSessionPersistence`.
- Cada aba guarda a área autenticada em `sessionStorage` (`srnk:auth-area`).
- Trocar Profissional ↔ Admin passa pelo login da área de destino.
- Admin exige membro ativo com papel `admin` ou `owner`.

## Regra financeira v3.4
- O repasse da barbearia é calculado sobre o **valor bruto do serviço**.
- Taxas de Débito/Crédito são descontadas separadamente do profissional.
- Líquido do profissional = bruto − taxa do cartão − repasse.
- Dono (`dono=true`) possui repasse zero.
- No primeiro acesso administrativo após a atualização, uma migração idempotente corrige atendimentos e resumos antigos para a nova base de cálculo.

## PWA
- Site, Profissional e Admin usam `icons/icon-192.png` e `icons/icon-512.png` derivados de `Fotos/Sr.NK.jpg`.
- Nenhuma foto de pessoa é usada como ícone do aplicativo.

## Produção/regressão
- Instrumentações temporárias de performance e diagnóstico foram removidas.
- `dashboard.html` permanece apenas como redirecionamento de compatibilidade para a Área Profissional.
