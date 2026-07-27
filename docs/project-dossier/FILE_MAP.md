# Mapa de Arquivos — Painel Pessoal Lucas

> Auditoria read-only, 2026-07-24/25. Nenhum arquivo de código foi alterado. Caminhos relativos à raiz do repositório. Classificação: **Crítico** (núcleo de domínio/infra usado em produção) · **Normal** (feature de produção, não núcleo) · **Temporário** (marcado no próprio código-fonte para remoção) · **Legado** (existe, mas não é usado no caminho de produção atual).

## 1. Raiz e configuração

| Arquivo | Responsabilidade | Estado |
|---|---|---|
| `AGENTS.md` | Regras do projeto (escopo, armadilhas Next 16, datas, arquitetura, validação, segurança) | Normal — **parcialmente desatualizado**: cita `WORKSPACE_ID` em `constants.ts`, que foi renomeado para `LEGACY_LOCAL_WORKSPACE_ID` e não é mais usado; `workspaceId` real vem da sessão (`useWorkspace`) |
| `CLAUDE.md` | Aponta para `AGENTS.md` via `@AGENTS.md` | Normal |
| `README.md` | Visão geral do produto e stack para humanos | Normal |
| `next.config.ts` | Configuração Next.js — objeto vazio `{}` | Normal |
| `vercel.json` | `framework: "nextjs"` (fix histórico de deploy, ver `docs/AUDIT.md`) + cron `0 * * * *` | Crítico |
| `tsconfig.json` | TypeScript estrito | Crítico |
| `eslint.config.mjs` | Config ESLint flat (`eslint-config-next`) | Normal |
| `postcss.config.mjs` | Só o plugin `@tailwindcss/postcss` | Normal |
| `vitest.config.ts` | Config do runner de testes (environment happy-dom/node) | Normal |
| `package.json` | Scripts (`dev/build/start/lint/typecheck/test`) e dependências | Crítico |
| `.env.example` | Nomes de variáveis (valores vazios) | Crítico |
| `src/proxy.ts` | Sucessor do middleware no Next 16: renova sessão Supabase e protege rotas | Crítico |

## 2. `src/app` — rotas de página

| Arquivo | Rota | Estado | Teste direto? |
|---|---|---|---|
| `src/app/layout.tsx` | layout raiz (`lang="pt-BR"`, fonte Inter, `<title>`/`<meta description>`) | Crítico | Não |
| `src/app/page.tsx` | `/` → `redirect('/hoje')` | Crítico | Não |
| `src/app/login/page.tsx` | `/login` | Crítico | Não |
| `src/app/auth/callback/route.ts` | callback do login (`exchangeCodeForSession`) | Crítico | Não |
| `src/app/hoje/page.tsx` | `/hoje` — cockpit do dia | Crítico | Não direto |
| `src/app/entrada/page.tsx` | `/entrada` — inbox | Crítico | Não direto |
| `src/app/projetos/page.tsx` | `/projetos` — lista | Crítico | Sim (filtros) |
| `src/app/projetos/[projectId]/page.tsx` | detalhe de projeto (`params` é `Promise`, `React.use`) | Crítico | Não direto |
| `src/app/ideias/page.tsx` | `/ideias` | Crítico | Não direto |
| `src/app/agenda/page.tsx` | `/agenda` | Crítico | Não direto |
| `src/app/planos/page.tsx` | `/planos` — lista | Crítico | Não direto |
| `src/app/planos/novo/page.tsx` | importar documento | Crítico | Não direto |
| `src/app/planos/processar/[documentId]/page.tsx` | dispara `/api/planos/processar` | Crítico | Não direto |
| `src/app/planos/[planId]/page.tsx` | detalhe de plano | Crítico | Não direto |
| `src/app/planos/[planId]/revisar/page.tsx` | revisão da proposta de IA — tela mais longa do app (534 linhas) | Crítico | Não direto |
| `src/app/revisao/page.tsx` | `/revisao` | Crítico | Não direto |
| `src/app/configuracoes/page.tsx` | `/configuracoes` (envolvida em `<Suspense>` por `useSearchParams`) | Crítico | Não direto |
| `src/app/migracao/page.tsx` | `/migracao` — transitório por natureza, mas necessário enquanto houver usuários com dados de Fase 1 | Normal | Indireto |

## 3. `src/app/api` — route handlers

| Arquivo | Rota | Classificação | Teste direto? |
|---|---|---|---|
| `src/app/api/health/route.ts` | `GET /api/health` | Health-check (pública) | Não |
| `src/app/api/cron/automation-tick/route.ts` | `GET/POST /api/cron/automation-tick` | Cron (produto crítico, auth via `CRON_SECRET`) | Sim (runner) |
| `src/app/api/debug/sync-status/route.ts` | `GET /api/debug/sync-status` | **Temporário** — comentário no código pede remoção | Sim |
| `src/app/api/ai/triage-capture/route.ts` | `POST /api/ai/triage-capture` | Produto (IA) | Sim |
| `src/app/api/audio/transcribe/route.ts` | `POST /api/audio/transcribe` | Produto (IA) | Sim |
| `src/app/api/audio/confirm-calendar-event/route.ts` | `POST /api/audio/confirm-calendar-event` | Produto (Calendar) | Sim |
| `src/app/api/integrations/calendar/sync-item/route.ts` | `POST /api/integrations/calendar/sync-item` | Produto — **sem chamador de UI identificado** | Não |
| `src/app/api/integrations/calendar/sync-plan/route.ts` | `POST /api/integrations/calendar/sync-plan` | Produto — **sem chamador de UI identificado** | Não |
| `src/app/api/integrations/calendar/today/route.ts` | `GET /api/integrations/calendar/today` | Produto (Calendar), usado por `TodayCalendarCard` | Não direto |
| `src/app/api/integrations/gmail/send-digest/route.ts` | `POST /api/integrations/gmail/send-digest` | Produto (Gmail), teste manual | Não direto |
| `src/app/api/integrations/google/callback/route.ts` | `GET` callback OAuth Google | Produto | Não |
| `src/app/api/integrations/google/connect/route.ts` | `GET` início OAuth Google | Produto | Não |
| `src/app/api/integrations/google/disconnect/route.ts` | `POST` desconectar serviço | Produto | Não |
| `src/app/api/integrations/google/status/route.ts` | `GET` status da conexão | Produto | Não |
| `src/app/api/planos/processar/route.ts` | `POST` estruturação de plano via IA | Produto (IA) | Indireto |
| `src/app/api/settings/digest/route.ts` | `GET/PUT` CRUD `workspace_settings` | Produto | Não |

## 4. `src/modules` — domínio por módulo

| Módulo | Camadas presentes | Estado |
|---|---|---|
| `items/{domain,application,infrastructure}` | completas | Crítico — módulo mais completo do sistema |
| `projects/{domain,application,infrastructure}` | completas | Crítico |
| `planning/{domain,application,infrastructure}` | completas (+ `ui/` vazio) | Crítico |
| `plans/{domain,application,infrastructure}` | completas — **sem adaptador localStorage** (só Supabase desde sempre) | Crítico |
| `global/application` | só `global.queries.ts` (busca global) | Normal |
| `migration/local-data-migration.ts` | módulo utilitário único, fora do padrão de camadas | Normal (transitório) |
| `review/{application,ui}` | **diretórios vazios**, sem nenhum arquivo | Legado/scaffold — a lógica real está em `items/application/item.queries.ts::getReviewOverview` |

| Arquivo | Responsabilidade | Estado | Teste? |
|---|---|---|---|
| `src/modules/items/domain/item.schema.ts` | Fonte única de verdade do domínio Item (7 tipos, 7 status, 4 prioridades, 8 fontes) | Crítico | Sim |
| `src/modules/items/application/item.commands.ts` | createItem/updateItem/scheduleItem/completeItem/archiveItem/reopenItem/unarchiveItem | Crítico | Sim |
| `src/modules/items/application/item.queries.ts` | listItems/getItemById/listInboxItems/searchItems/listScheduledItems/getTodayOverview/getReviewOverview | Crítico | Sim |
| `src/modules/items/infrastructure/supabase-item.repository.ts` | Persistência real (produção); `rowToItem`/`itemToRow` | Crítico | Sim |
| `src/modules/items/infrastructure/local-storage-item.repository.ts` | Persistência localStorage | **Legado — só testes** | Sim |
| `src/modules/projects/domain/project.schema.ts` | Domínio de projetos (status, nível de atenção) | Crítico | Sim |
| `src/modules/projects/infrastructure/supabase-project.repository.ts` | Persistência real | Crítico | Sim |
| `src/modules/projects/infrastructure/local-storage-project.repository.ts` | Persistência localStorage | **Legado — só testes** | Não |
| `src/modules/planning/domain/daily-plan.schema.ts` | Foco diário (máx. 3, `.max(3)` no Zod) | Crítico | Indireto |
| `src/modules/planning/infrastructure/supabase-daily-plan.repository.ts` | Persiste em 2 tabelas (`daily_plans`+`daily_plan_items`) | Crítico | Não direto |
| `src/modules/planning/infrastructure/local-storage-daily-plan.repository.ts` | Persistência localStorage | **Legado — só testes** | Não |
| `src/modules/plans/domain/plan.schema.ts` | SourceDocument/ExecutionPlan/PlanPhase/RecurrenceRule/PlanAction/Notification | Crítico | Indireto |
| `src/modules/plans/domain/plan-proposal.schema.ts` | Schema da proposta de IA (`.nullable()` por exigência do modo estrito) | Crítico | Sim |
| `src/modules/plans/domain/recurrence-engine.ts` | Motor puro/determinístico de recorrências | Crítico | Sim |
| `src/modules/plans/application/plan.commands.ts` | createSourceDocument/updatePlan/savePhases/saveActions/saveRecurrenceRules/approvePlan/activatePlan/setPlanStatus | Crítico | Não direto |
| `src/modules/plans/application/recurrence-materializer.ts` | Materialização idempotente (chave única `recurrence_rule_id+occurrence_at`) | Crítico | Indireto |
| `src/modules/plans/infrastructure/supabase-plan.repository.ts` | Única infraestrutura de persistência de planos | Crítico | Não direto |
| `src/modules/global/application/global.queries.ts` | Busca global (compõe items+projects) | Normal | Não |
| `src/modules/migration/local-data-migration.ts` | Assistente de migração local→nuvem (readLocalData, migrateLocalData, clearLocalData) | Normal (transitório) | Sim |

## 5. `src/platform` — infraestrutura compartilhada

| Arquivo | Responsabilidade | Estado | Teste? |
|---|---|---|---|
| `src/platform/storage/local-storage-adapter.ts` | Base observável (subscribe/notify, guarda de SSR) para repositórios localStorage | **Legado — só testes** | Indireto |
| `src/platform/events/event.schema.ts` | Schema `DomainEvent` | Crítico | Indireto |
| `src/platform/events/event.repository.ts` | Interface do repositório de eventos | Crítico | Indireto |
| `src/platform/events/supabase-event.repository.ts` | Persistência real (auditoria); falha de gravação só loga, não desfaz a operação | Crítico | Não direto |
| `src/platform/events/local-storage-event.repository.ts` | Persistência localStorage | **Legado — só testes** | Não |
| `src/platform/ai/ai.provider.ts` | Contrato genérico de IA "demonstrativo" | **Legado/stub — nunca implementado nem usado pelas 3 operações reais** | Não |
| `src/platform/ai/audio-transcriber.ts` + `openai-audio-transcriber.ts` | Contrato + implementação real de transcrição (Whisper) | Crítico | Sim / indireto |
| `src/platform/ai/audio-triage-structurer.ts` + `openai-audio-triage-structurer.ts` | Contrato+prompt + implementação real da triagem de áudio | Crítico | Sim / indireto |
| `src/platform/ai/audio-triage.schema.ts` | Schema Zod da proposta de triagem de áudio | Crítico | Sim |
| `src/platform/ai/plan-structurer.ts` + `openai-plan-structurer.ts` | Contrato+prompt + implementação real de estruturação de plano; também hospeda `estimateCostUsd`/`PRICES_PER_MTOKEN`, reaproveitado por uma rota de áudio (acoplamento cruzado) | Crítico | Sim / indireto |
| `src/platform/ai/audio-provenance.repository.ts` + `supabase-audio-provenance.repository.ts` | Proveniência de captura por áudio (painel de detalhe do item) | Crítico | Sim |
| `src/platform/ai/rate-limit.ts` | Rate limit em memória por instância (não distribuído) | Normal | Indireto |
| `src/platform/integrations/integration.adapter.ts` | Contrato genérico de webhook (GitHub etc.) | **Legado/stub — nunca implementado** | Não |
| `src/platform/integrations/google-client.ts` | OAuth Google, rotação/revogação de token | Crítico | Sim |
| `src/platform/integrations/google-calendar.ts` | Chamadas à API do Calendar (freebusy, eventos) | Crítico | Indireto |
| `src/platform/integrations/calendar-sync.ts` | Sincronização item↔Calendar, anti-loop | Crítico | Indireto |
| `src/platform/integrations/token-crypto.ts` | AES-256-GCM para tokens OAuth | Crítico | Sim |
| `src/platform/integrations/gmail-sender.ts` | Envio via Gmail API (`messages.send`) | Crítico | Indireto |
| `src/platform/integrations/email-sender.ts` | Contrato injetável de envio (permite mock em teste) | Crítico | Sim |
| `src/platform/integrations/digest.ts` | Templates de resumo (puro, sem I/O) | Crítico | Sim |
| `src/platform/integrations/digest-dispatch.ts` | Decide e despacha envio (respeita opt-in) | Crítico | Indireto |
| `src/platform/mcp/mcp.registry.ts` | Contrato MCP | **Legado/stub — nunca implementado** | Não |
| `src/platform/automation/automation-runner.ts` | `runIdempotentJob` — idempotência via `automation_runs` | Crítico | Sim |
| `src/platform/supabase/browser-client.ts` | Cliente Supabase singleton (browser) | Crítico | Indireto |
| `src/platform/supabase/server-client.ts` | Cliente Supabase (Server Components/Route Handlers) | Crítico | Não |
| `src/platform/supabase/admin-client.ts` | Cliente admin (`server-only`, bypassa RLS) | Crítico | Indireto |
| `src/platform/supabase/session.ts` | Resolve sessão+workspace no servidor | Crítico | Indireto |
| `src/platform/supabase/change-notifier.ts` | Pub/sub de mudanças (reatividade sem realtime) | Crítico | Não direto |
| `src/platform/outbox/`, `src/platform/workflows/` | **Diretórios vazios** — outbox transacional é "evolução futura" no ROADMAP, sem nenhum arquivo ainda | Legado/scaffold | N/A |

## 6. `src/providers`, `src/lib`, `src/types`

| Arquivo | Responsabilidade | Estado |
|---|---|---|
| `src/providers/auth.provider.tsx` | Sessão Supabase + workspace (`useAuth`, `useWorkspace`); diagnóstico não sensível em `sessionStorage` | Crítico |
| `src/providers/repository.provider.tsx` | Composition root — **sempre** instancia repositórios Supabase (localStorage nunca é escolhido em runtime) | Crítico |
| `src/lib/dates.ts` | `todayDateStr`, `dateInputToISO`, `isoToDateInput`, `datetimeLocalToISO`, `isoToDatetimeLocalInput` (fuso local, regra do AGENTS.md) | Crítico |
| `src/lib/hooks.ts` | `useReactiveQuery` (effect+subscribe), `useOnlineStatus`, `useMounted` (estes dois via `useSyncExternalStore`) | Crítico |
| `src/lib/constants.ts` | Só `LEGACY_LOCAL_WORKSPACE_ID` — **não importada por nenhum arquivo de produção** | Legado |
| `src/lib/capacity.ts` | Cálculo de capacidade do dia (`DAY_CAPACITY_MINUTES=480`), `itemSourceLabel` | Normal |
| `src/lib/item-filters.ts` | `selectActiveTasks` (regra Hoje→Próximas Ações) | Crítico |
| `src/lib/item-origin.ts` | `resolveItemOrigin` — rótulo de proveniência em português | Crítico |
| `src/lib/ui-events.ts` | Bus de eventos DOM para abrir modais globais | Normal |
| `src/lib/zod-datetime.ts` | `isoDateTimeSchema` compatível com timestamps do Postgres | Crítico |
| `src/lib/audio-recording.ts` | Helpers puros de gravação (`MAX_RECORDING_SECONDS=300`, MIME types, formatação) | Normal |
| `src/types/` | **Diretório vazio** — nenhum arquivo `.ts` | Legado/scaffold |

## 7. `src/components` — componentes client reutilizáveis

| Arquivo | Responsabilidade | Estado |
|---|---|---|
| `src/components/app-shell.tsx` | Casca: sidebar + banner de migração + 3 modais globais | Crítico |
| `src/components/sidebar-nav.tsx` | Navegação (sidebar desktop / barra+drawer mobile / FAB) | Crítico |
| `src/components/quick-capture-modal.tsx` | Captura rápida (texto + áudio, 2 abas) | Crítico |
| `src/components/audio-recorder.tsx` | Gravação de áudio (MediaRecorder) | Crítico |
| `src/components/audio-capture-review.tsx` | Revisão/aprovação por ação da triagem de IA | Crítico |
| `src/components/item-detail-modal.tsx` | Detalhe/edição de item + proveniência (áudio incluído) | Crítico |
| `src/components/global-search-modal.tsx` | Busca global (Ctrl/Cmd+K) | Normal |
| `src/components/item-complete-button.tsx` | Botão de concluir (44×44px, já corrigido) | Normal |
| `src/components/data-error-notice.tsx` | Aviso padrão de erro/offline | Normal |
| `src/components/migration-banner.tsx` | Aviso de dados locais não migrados | Normal |
| `src/components/today-calendar-card.tsx` | Capacidade do dia + Google Calendar em Hoje | Normal |
| `src/components/google-integration-card.tsx` | Conectar/verificar/desconectar Calendar ou Gmail | Normal |
| `src/components/digest-settings-card.tsx` | Preferências e teste de envio de digest | Normal |
| `src/components/sync-diagnostics-card.tsx` | **Temporário** — diagnóstico de sessão servidor vs. navegador | Temporário |
| `src/components/data-flow-diagnostics-card.tsx` | **Temporário** — diagnóstico de fluxo de dados | Temporário |

## 8. `supabase/migrations` — em ordem cronológica

| Arquivo | Conteúdo |
|---|---|
| `20260716120000_core_schema.sql` | profiles, workspaces, workspace_members, projects, items, daily_plans, daily_plan_items, item_relations, domain_events + funções (`set_updated_at`, `is_workspace_member`, `handle_new_user`) + RLS completa |
| `20260717090000_plans_schema.sql` | source_documents, execution_plans, plan_phases, recurrence_rules, plan_actions, reminders, notifications + proveniência em `items` + índice único de recorrência |
| `20260717100000_ai_runs.sql` | `ai_runs` (auditoria de IA) |
| `20260717110000_integrations.sql` | integration_accounts, integration_tokens (sem policy de cliente), calendar_event_links, `calendar_sync`/`calendar_sync_scope` |
| `20260717120000_digest_settings.sql` | `workspace_settings` |
| `20260717130000_automation_runs.sql` | `automation_runs` (idempotência do cron) |
| `20260722140000_api_role_grants.sql` | GRANTs de privilégio de tabela (corrige "permission denied" pré-RLS) |
| `20260722150000_workspace_function_grants.sql` | Corrige `EXECUTE` de `ensure_personal_workspace` ainda concedido a `PUBLIC`/`anon` |
| `20260723150000_audio_capture.sql` | `items.source` ganha `'audio_capture'`, `items.audio_duration_seconds`, `ai_runs.item_id` |

## 9. `src/test` — 31 arquivos de teste (216 testes)

Nenhum teste está colocalizado em `src/modules/*` ou `src/components/*` — todos vivem em `src/test/`. Ver categorização completa em `TECHNICAL_ARCHITECTURE_AND_DATA_FLOWS.md` e `RISKS_DEBT_AND_OPEN_QUESTIONS.md`.

## 10. `docs/` — documentação pré-existente do repositório

| Arquivo | Estado observado nesta auditoria |
|---|---|
| `docs/ARCHITECTURE.md` | Mais atualizado e preciso; documenta corretamente que localStorage é só Fase 1 histórica |
| `docs/ROADMAP.md` | Atual; Fase 2 marcada concluída; a captura por áudio já implementada está listada só na Fase 7 (planejamento desatualizado em relação ao código) |
| `docs/AUDIT.md` | Histórico (2026-07-16), pré-Fase 2 |
| `docs/PRODUCT_DIRECTION.md` | Visão de produto, majoritariamente ainda válida |
| `docs/RELATORIO-FASE-2.md` | Relatório de entrega da Fase 2 (2026-07-17) — **anterior à captura por áudio**, não reflete os últimos 7 commits |
| `docs/events.md` | Lista de eventos — não reflete todos os pontos de gravação direta (bypass de `EventRepository`) encontrados nesta auditoria |
| `docs/integrations.md` | Descreve Calendar/Gmail corretamente; não menciona a rota de confirmação de evento por áudio |
| `docs/mcp.md` | 100% aspiracional — confirma o achado de que MCP é só contrato, nunca implementado |

## 11. Saída deste dossiê

`docs/project-dossier/` (este pacote, 10 arquivos + JSON) e `docs/project-dossier/screenshots/` (2 capturas da tela de login pública em produção — ver `MASTER_PROJECT_DOSSIER.md` para a limitação de acesso a telas autenticadas). O subdiretório `docs/project-dossier/strategic-audit/` já existia no repositório antes desta auditoria (presente no `git status` inicial) e não foi criado, alterado ou lido em detalhe por esta tarefa — pertence a um ciclo de auditoria estratégica separado e fora do escopo aqui pedido (que é somente levantamento factual, sem recomendações de redesign).
