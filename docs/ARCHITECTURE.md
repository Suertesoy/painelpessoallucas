# Arquitetura — Painel Pessoal Lucas

> Este documento descreve a arquitetura **realmente implementada** (Fase 1), não a aspiração.

## Visão geral

Monólito modular em Next.js (App Router). A UI nunca acessa persistência diretamente: tudo passa por **Commands** (escrita) e **Queries** (leitura), que usam **Repositories** (interfaces) implementados por adaptadores de **localStorage** na Fase 1.

```
src/
  app/                    # Rotas (hoje, entrada, projetos, ideias, agenda, revisao, api/health)
  components/             # Componentes client (modais, navegação)
  lib/                    # hooks reativos, datas (fuso local), constantes, eventos de UI
  modules/
    items|projects|planning/
      domain/             # Zod schemas + tipos (fonte única de verdade)
      application/        # Commands, Queries e interfaces de Repository
      infrastructure/     # Adaptadores localStorage
    global/application/   # Busca global (composição de queries)
  platform/
    storage/              # LocalStorageAdapter<T> (observável, seguro em SSR)
    events/               # DomainEvent + repositório de eventos (append-only)
    ai/, integrations/, mcp/  # SOMENTE contratos (interfaces) para fases futuras
  providers/              # RepositoryProvider (composition root / DI via Context)
  test/                   # Vitest (domínio, queries, datas)
```

## Fluxo de dados

1. Componente chama `useCommands()` / `useQueries()` (Context).
2. Command valida o payload com Zod (`domain/*.schema.ts`), persiste via Repository e grava um `DomainEvent` no repositório de eventos.
3. O adaptador de storage notifica os inscritos (`subscribe`); `useReactiveQuery` reexecuta a query e a UI atualiza sem refresh.
4. Mudanças em outra aba chegam pelo evento `storage` do navegador.

### Reatividade — decisão registrada
Queries são assíncronas (retornam `Promise`), então a UI usa o padrão **effect + subscribe** (`useReactiveQuery`), e não `useSyncExternalStore` (que exige snapshot síncrono). `useSyncExternalStore` é usado apenas no `useMounted()` (detecção de hidratação). Documentações anteriores afirmavam o contrário; este documento reflete o código.

## Commands e Queries

- `ItemCommands`: create, update, schedule, complete, archive — todos validam com `ItemSchema.parse` e emitem eventos (`item.created`, `item.updated`, `item.scheduled` com valor anterior/novo, `item.completed`, `item.archived`).
- `ProjectCommands`: create, update, archive (+ eventos).
- `DailyPlanCommands`: `setDailyFocus` (regra de máx. 3 itens aplicada no domínio) e `removeDailyFocusItem`.
- Queries correspondentes (`ItemQueries`, `ProjectQueries`, `DailyPlanQueries`, `GlobalQueries`) são somente leitura.

## Datas e fuso horário

Regra do projeto (ver `src/lib/dates.ts`): "hoje", agendamento e prazo são conceitos do **dia local** do usuário. Proibido derivar dia de `toISOString()` e proibido `new Date('YYYY-MM-DD')` para inputs (interpretação UTC desloca o dia no Brasil). Armazenamento continua ISO 8601; a fronteira converte.

## Erros

- Commands lançam `Error` com mensagem em português; páginas capturam e exibem inline (`role="alert"`).
- Leitura de localStorage corrompido degrada para lista vazia (try/catch no adaptador) — decisão consciente para nunca travar a UI; auditoria de dados chega com a persistência remota.

## Testes

Vitest em ambiente `node` (proposital: prova que os módulos não dependem de `window`). Cobrem: limite de foco, persistência do plano, reatividade (subscribe), payload de eventos, resiliência SSR, queries de inbox/busca e utilitários de data (round-trip de fuso).

## Fase 2 — implementada

- **Supabase**: repositórios `Supabase*Repository` implementam as MESMAS
  interfaces da Fase 1; `useReactiveQuery` ganhou `error` e `isOffline`.
  Sessão via `@supabase/ssr` (cookies) renovada no `src/proxy.ts` (Next 16).
  Clientes separados: browser, server (Server Components/Route Handlers) e
  admin (`server-only`, SUPABASE_SECRET_KEY). RLS por membership de workspace
  (`is_workspace_member`). `workspaceId` vem da sessão (`useWorkspace`).
- **Migração local**: assistente em `/migracao` (backup JSON, validação Zod,
  upsert idempotente pelos IDs originais, conferência de contagens, limpeza
  somente com confirmação).
- **Planos + OpenAI**: domínio em `modules/plans` (schemas, commands com
  aprovação/ativação explícitas, queries). IA server-only
  (`platform/ai/openai-plan-structurer.ts`, Responses API + saída estruturada
  estrita) gera PROPOSTAS validadas por Zod; execuções auditadas em `ai_runs`.
  Falha da IA nunca perde o documento (`source_documents`).
- **Recorrências**: motor puro e determinístico
  (`modules/plans/domain/recurrence-engine.ts`) + materializador idempotente
  (chave única `recurrence_rule_id + occurrence_at`).
- **Google**: OAuth próprio (separado do login), tokens AES-256-GCM em
  `integration_tokens` (sem policy de cliente), rotação/revogação tratadas.
  Calendar com scopes mínimos (calendar.app.created + freebusy); Gmail apenas
  gmail.send.
- **Cron**: `/api/cron/automation-tick` (CRON_SECRET, hora em hora) com
  `automation_runs` únicos por (workspace, tipo, idempotency_key) e retries.

### Limitações registradas
- Entidade + evento de domínio são gravados em duas operações (sem transação
  client-side no PostgREST); o evento é auditoria, não fonte de verdade. A
  outbox transacional (RPC) permanece como evolução futura.
- Sem realtime (decisão do ROADMAP): mudanças de outro dispositivo chegam por
  refetch em foco/visibilidade da aba.

## Evolução planejada

- **Automações externas**: regras centrais vivem no painel (commands/endpoints); ferramentas externas (n8n etc.) apenas chamam essas portas.
- **MCP**: servidor MCP como porta de entrada que chama os mesmos Commands/Queries — nunca o banco direto. Contratos em `platform/mcp/mcp.registry.ts`.
- **Leitura de Gmail**: documentada como fase posterior (scopes e requisitos adicionais).

## Deploy

Vercel, projeto `painelpessoallucas`. `vercel.json` fixa `"framework": "nextjs"` — necessário porque o Framework Preset do projeto ficou como "Other" no primeiro deploy (causa histórica do 404 em produção; ver `docs/AUDIT.md`). Build de produção valida TypeScript e não ignora erros.
