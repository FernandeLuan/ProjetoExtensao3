# Sr NK 3.1 — diagnóstico de performance

## O que mudou

- CSS de Profissional e Admin consolidado em um arquivo por área.
- Service Worker não pré-carrega mais Profissional e Admin juntos.
- Primeira tela é pré-carregada em paralelo ao bootstrap.
- Boot espera a primeira tela terminar de carregar antes de desaparecer.
- Visão Geral do Admin inicia consultas independentes em paralelo.
- Resumos de um único dia usam leitura direta do documento diário.
- Modo `debug=perf` mede tempos de contexto, Firestore, módulos, telas e writes.

## Como testar

Profissional:

https://fernandeluan.github.io/ProjetoExtensao3/profissional/?debug=perf

Admin:

https://fernandeluan.github.io/ProjetoExtensao3/admin/?debug=perf

Se precisar passar pelo login:

https://fernandeluan.github.io/ProjetoExtensao3/login.html?destino=profissional&debug=perf

ou

https://fernandeluan.github.io/ProjetoExtensao3/login.html?destino=admin&debug=perf

O painel `SR NK • PERF` aparece no canto inferior direito.

No Console também estão disponíveis:

```js
__SRNK_PERF__()
__SRNK_DIAGNOSTICO__()
```

O primeiro mostra duração das operações. O segundo mostra consultas e documentos do Firestore disparados por ESTE navegador.

## Teste com dois usuários

1. Abra Profissional em um navegador/dispositivo.
2. Abra Admin em outro navegador/dispositivo.
3. Use `?debug=perf` nos dois.
4. Deixe o Admin parado.
5. Registre um atendimento no Profissional.
6. Confira se no Admin surgiu algum evento `Loading solicitado`, `Loading visível` ou consulta Firestore.
7. Compare `__SRNK_PERF__()` e `__SRNK_DIAGNOSTICO__()` nos dois.
