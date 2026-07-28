# Homologação de sincronização computador ↔ celular

Data: 2026-07-28
Branch: `main` (commit base: `996a83d`)

## Diagnóstico do fluxo (antes das alterações)

- **Notificação local**: `RepositoryProvider` cria uma única instância de
  `ChangeNotifier` por sessão autenticada, compartilhada entre os
  repositórios Supabase de itens, projetos, plano do dia, documentos-fonte e
  planos de execução (`src/providers/repository.provider.tsx`). Toda
  mutação (`save`/`delete`) chama `notifier.notify()` após a escrita,
  disparando todos os `useReactiveQuery` inscritos **na mesma aba**.
- **Sem Realtime**: não há Supabase Realtime (decisão de roadmap). O outro
  dispositivo só busca dados novos quando a própria `useReactiveQuery`
  reexecuta a consulta — no mount inicial, no `refetch` manual ("Tentar
  novamente"), ou quando o `ChangeNotifier` local dispara `notify()` por
  evento de janela.
- **Gatilhos de revalidação**: `ChangeNotifier.bindWindowEvents()`
  (`src/platform/supabase/change-notifier.ts`) escuta `window.focus` e
  `document.visibilitychange` (apenas para `'visible'`), sem debounce. **Não
  há listener para `pageshow` nem para `online`.** `useOnlineStatus`
  (`src/lib/hooks.ts`) monitora `online`/`offline` só para exibir o estado
  "sem conexão" — não decorre em refetch automático.
- **Sessão e workspace**: `AuthProvider` valida o usuário via
  `supabase.auth.getUser()` (valida token no servidor) e reage a
  `onAuthStateChange`; ao autenticar, resolve o workspace pela RPC
  idempotente `ensure_personal_workspace`. `RepositoryProvider` só monta os
  repositórios com `status === 'authenticated' && workspaceId` presentes;
  nos demais estados mostra loading/erro/redirecionamento — não há "lista
  vazia" enquanto isso carrega.
- **Diagnósticos temporários visíveis**: `SyncDiagnosticsCard` e
  `DataFlowDiagnosticsCard` em `/configuracoes`, e a rota
  `/api/debug/sync-status` — expunham termos técnicos como
  `permission_denied`, `workspace_id`, categorias de erro etc.

## Ambiente de execução desta tarefa

Este ambiente de execução (sessão não interativa) não tem nenhuma ferramenta
de automação de navegador (Playwright, Chrome DevTools etc.) nem acesso a
dispositivo físico. Por isso, a homologação da seção 4 do escopo e a captura
de screenshots foram feitas **manualmente pelo usuário**, em produção, com a
conta real, em computador e celular físico — não por automação deste agente.

## Resultado da homologação

Confirmado pelo usuário: a homologação manual foi concluída em computador e
celular físico real, em produção, e nenhum problema de sincronização foi
reportado. Os screenshots do baseline (`docs/project-dossier/screenshots/internal/`)
foram capturados nessa mesma sessão de teste.

O detalhamento item a item (PASSOU/FALHOU para texto celular→computador,
edição computador→celular, texto computador→celular, áudio celular→computador
e retorno de segundo plano) foi solicitado ao usuário para registro granular
neste documento; se fornecido posteriormente, esta seção deve ser atualizada
com o detalhamento completo.

**Nenhum problema foi reproduzido.** Por isso, nenhuma correção de código foi
aplicada ao fluxo de sincronização (seção 7 do escopo) — apenas a remoção dos
diagnósticos temporários, já planejada independentemente do resultado.

## Riscos que permanecem como hipótese (não corrigidos, por falta de reprodução)

- Ausência de listener em `pageshow`/`online` no `ChangeNotifier` pode, em
  tese, causar dados desatualizados ao restaurar uma aba mobile do bfcache
  (ex.: Safari iOS) sem passar por `focus`/`visibilitychange`. Não foi
  reproduzido nesta homologação; nenhuma correção foi aplicada.
