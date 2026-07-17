# Relatório — Fase 2: Cloud Sync, IA e Automações

Branch: `feat/cloud-sync-ai-automations` · Data: 2026-07-17
Base: `main` em `c2dc6dc` (intocada — nenhum merge, nenhum deploy de produção alterado)

## 1. Estado inicial

Fase 1 validada em produção: monólito modular Next.js 16 (App Router),
Commands/Queries/Repositories com localStorage, eventos de domínio, 14 testes,
lint/typecheck/build limpos. Problema: dados presos ao navegador.

## 2. Arquitetura final

- Interfaces de repositório da Fase 1 preservadas; novas implementações
  `Supabase*Repository` (items, projects, daily plans, events, documentos,
  planos). UI continua consumindo somente Commands/Queries via Context.
- `useReactiveQuery` ganhou estados reais: `isLoading`, `error`, `isOffline`
  (loading/success/empty/error/offline nas telas).
- Sessão: Supabase Auth com Google (somente `openid email profile`), SSR por
  cookies (`@supabase/ssr`), renovação no `src/proxy.ts` (Next 16 renomeou
  middleware → proxy). Rotas protegidas; `/login`, `/auth/*`, `/api/cron/*` e
  `/api/health` públicas.
- Clientes separados: `browser-client`, `server-client` (Server Components e
  Route Handlers), `admin-client` (`server-only`; nunca no bundle).
- `workspaceId` deixou de ser constante: vem da sessão (`useWorkspace`), com
  bootstrap por trigger (`handle_new_user`) + RPC idempotente
  (`ensure_personal_workspace`).
- Novos módulos: `modules/plans` (domínio/aplicação/infra), `modules/migration`,
  `platform/ai`, `platform/integrations`, `platform/automation`.

## 3. Migrations (supabase/migrations/)

1. `20260716120000_core_schema.sql` — profiles, workspaces, workspace_members,
   projects, items, daily_plans, daily_plan_items, item_relations,
   domain_events; `set_updated_at`; bootstrap de workspace; RLS completa.
2. `20260717090000_plans_schema.sql` — source_documents, execution_plans,
   plan_phases, plan_actions, recurrence_rules, reminders, notifications;
   proveniência em items + índice único (recurrence_rule_id, occurrence_at).
3. `20260717100000_ai_runs.sql` — auditoria de execuções de IA.
4. `20260717110000_integrations.sql` — integration_accounts,
   integration_tokens (sem policy de cliente), calendar_event_links,
   calendar_sync por item, calendar_sync_scope por plano.
5. `20260717120000_digest_settings.sql` — workspace_settings (digests opt-in).
6. `20260717130000_automation_runs.sql` — automation_runs com unique
   (workspace, tipo, idempotency_key).

Convenções: timestamptz para instantes, date para datas; todas as tabelas com
id/workspace_id/created_at/updated_at (+ created_by/archived_at/deleted_at
quando aplicável); timezone padrão America/Sao_Paulo.

## 4. Policies RLS

- RLS ativa em TODAS as tabelas da aplicação; sem policies permissivas.
- Padrão: `public.is_workspace_member(workspace_id)` (SECURITY DEFINER, evita
  recursão) em select/insert/update/delete.
- profiles: apenas o próprio usuário. workspaces: membros (update só owner).
- domain_events: sem update/delete (append-only). integration_tokens: nenhuma
  policy para `authenticated` → só o servidor (secret key) acessa.
  automation_runs: cliente apenas lê.

## 5. Migração local (/migracao)

Detecção automática (banner), backup JSON completo para download, validação
Zod com separação de registros inválidos, prévia de contagens,
`migration_batch_id`, upsert pelos UUIDs originais (reexecução não duplica),
remapeamento `ws-1` → workspace real, projectId órfão → null, conferência
local × nuvem, conclusão registrada (evento + estado local), remoção dos dados
locais SOMENTE com confirmação explícita.

## 6. Fluxo de planos (/planos)

novo → selecionar/criar projeto → colar texto ou importar .md/.txt (máx. 500KB
de arquivo; 120k chars) → data inicial → documento salvo com hash
(`source_documents`, nunca se perde) → processar → revisar → aprovar → ativar
→ ocorrências geradas. Rotas: `/planos`, `/planos/novo`,
`/planos/processar/[documentId]`, `/planos/[planId]`,
`/planos/[planId]/revisar`. A revisão diferencia visualmente: fato informado
(verde), hipótese (âmbar), sugestão da IA (azul, editável), decisão registrada
(esmeralda), pergunta aberta (roxo); mostra riscos, aguardando, confiança e
avisos. O plano aprovado é a definição; tarefas são ocorrências materiais.

## 7. Fluxo OpenAI

- SDK oficial no servidor; `OPENAI_API_KEY` jamais no cliente.
- Responses API + structured outputs estritos (`zodTextFormat`); resposta
  revalidada com Zod no servidor (`parsePlanProposal`).
- Prompt versionado `plan-import-v1`; documento tratado como DADO (instruções
  embutidas são ignoradas — testado); somente o contexto necessário é enviado.
- `ai_runs`: provider, model, operation, prompt_version, input_hash,
  started/completed_at, status, tokens, custo estimado, latency_ms, erros,
  response_metadata (proposta validada). Sem segredos em prompts/registros.
- Timeout 120s, 1 retry controlado, limite de tamanho, mensagens de erro
  úteis; falha marca doc como `failed` e PRESERVA o original.
- Modelo padrão `gpt-4.1-mini`, sobrescrevível por `OPENAI_MODEL` (env).
- A IA nunca cria/conclui/arquiva/reagenda: gera propostas; os Commands
  executam apenas o que for aprovado.

## 8. Recorrências

Motor puro e determinístico (`recurrence-engine.ts`): daily/weekly/monthly/
once + relativas (âncora resolvida na ativação, incluindo offset de fase);
interval, days_of_week, day_of_month (clamp em meses curtos), local_time,
timezone via Intl (America/Sao_Paulo), end_at, max_occurrences,
next/last_occurrence_at, is_active. Materializador idempotente: ocorrências →
items com proveniência (plano/fase/ação/regra) e chave única
(recurrence_rule_id, occurrence_at) com upsert ignoreDuplicates — nunca gera a
mesma ocorrência duas vezes. Horizonte de 7 dias na ativação e no cron.

## 9. Calendar

Scopes mínimos (`calendar.app.created` + `calendar.freebusy`); calendário
secundário "Painel Lucas" criado/reutilizado; nada é enviado automaticamente —
por item (`none|sync|sync_reminder`) ou por plano
(`milestones|timed|all|manual`); `calendar_event_links` (etag, status, erro);
anti-loop via extendedProperties (`painelItemId`); rotas sync-item, sync-plan
e today (freebusy + eventos da app). Limitação de scope: eventos da agenda
principal aparecem como blocos ocupados, sem título.

## 10. Gmail

Somente envio (`gmail.send`); leitura documentada como fase posterior.
Resumo diário, semanal, prazos críticos e falhas de automação — templates
simples em português; nada é enviado sem ativação explícita
(workspace_settings: daily/weekly enabled+time+day, critical_alerts_enabled,
digest_recipient). Envio de teste manual em Configurações.

## 11. Cron

`/api/cron/automation-tick` (GET/POST) exige `Authorization: Bearer
CRON_SECRET`; vercel.json agenda `0 * * * *`. Cada execução: regras vencidas →
ocorrências idempotentes → reminders → notificações → ressincronização de
Calendar pendente → resumos no horário configurado → alertas críticos →
retries (máx. 3) → tudo registrado em `automation_runs` (claim por insert na
constraint única; `running` obsoleto >15min é retomado; nunca depende da
memória da função).

## 12. Segurança

- Sem segredos no código; `.env.example` só com nomes vazios; `.env*` reais
  ignorados (exceção explícita `!.env.example`).
- SUPABASE_SECRET_KEY e OPENAI_API_KEY apenas no servidor (`server-only`).
- Refresh/access tokens Google criptografados (AES-256-GCM); nunca retornados
  em APIs; logs só com fingerprint.
- workspace_id nunca vem do cliente: resolvido da sessão no servidor
  (`getSessionContext`) e por RLS no banco.
- Callback OAuth com state em cookie httpOnly; redirect pós-login restrito a
  caminhos internos.

## 13. Testes (67 passando; 14 originais preservados)

migração (validação Zod, idempotência, corrupção, órfãos, limpeza explícita),
parsing estruturado com provider mock, prompt anti-injection, truncamento,
fábricas mock (IA e e-mail), aprovação de plano (via commands), recorrências
(determinismo, limites, timezone SP, chave única), criptografia/rotação/
revogação de token com fetch mock, templates de digest (fuso incluído), cron
não autorizado/autorizado, idempotência e retries do runner. Nenhuma chamada
real a OpenAI/Google/Supabase nos testes.

## 14. Variáveis necessárias (Vercel → Settings → Environment Variables e .env.local)

NEXT_PUBLIC_APP_URL, NEXT_PUBLIC_SUPABASE_URL,
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, SUPABASE_SECRET_KEY, OPENAI_API_KEY,
(opcional OPENAI_MODEL), GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET,
GOOGLE_REDIRECT_URI, GOOGLE_TOKEN_ENCRYPTION_KEY (32 bytes em base64/hex),
CRON_SECRET.

## 15. Configurações manuais pendentes (na sua mão)

1. Criar/selecionar projeto Supabase; aplicar as 6 migrations em ordem
   (SQL Editor ou `supabase db push`).
2. Supabase Auth → Providers → Google (Client ID/Secret) e adicionar as URLs
   de redirect do app.
3. Google Cloud Console: OAuth Client (Web), redirect
   `<app>/api/integrations/google/callback`; habilitar Calendar API e Gmail
   API; scopes na tela de consentimento.
4. Adicionar as variáveis acima na Vercel (Preview + Production) e no
   `.env.local`.
5. `git push -u origin feat/cloud-sync-ai-automations` (sem credenciais aqui).
6. Conectar Calendar/Gmail em Configurações → Integrações e validar a lista
   de homologação (item 20 do prompt).

## 16. Commits (10, lógicos por etapa)

e3ff5e8 supabase/auth · bd34d5c migração · 2024f61 planos · e3fabc1 openai ·
f262c00 recorrências · e206af0 google/calendar · ed9f5c1 gmail · 7d79d13 cron ·
ad0fdf9 hoje · bdcf223 docs (+ este relatório).

## 17. Branch

`feat/cloud-sync-ai-automations` — main intocada; sem merge.

## 18. URL Preview

Pendente do push (item 15.5): a integração GitHub→Vercel gera o Preview
automaticamente ao enviar a branch. Se o deploy automático não disparar,
reconectar o repositório na Vercel (histórico em docs/AUDIT.md).

## 19. Limitações

- Outbox transacional adiada (entidade+evento em 2 escritas; evento é
  auditoria). PDF e captura por áudio fora do escopo. Sem realtime (refetch em
  foco/visibilidade). Freebusy sem títulos (consequência do scope mínimo).
  Leitura de Gmail: fase posterior. Capacidade do dia fixa em 8h (constante).
  `npm run test:integration` não criado — sem chamadas reais nos unitários;
  integrações reais ficam para testes manuais controlados na homologação.
- Validação em execução real (login desktop/mobile, RLS ao vivo, OpenAI,
  Calendar, Gmail, cron em produção Preview) depende das configurações
  manuais do item 15.

## 20. Homologação e merge

1. Concluir itens do §15 → abrir o Preview.
2. Rodar a checklist de validação (20 itens do prompt) no Preview, desktop e
   celular, console limpo.
3. Ajustes finos se necessário (novos commits na branch).
4. PR `feat/cloud-sync-ai-automations` → `main`; merge somente após a
   checklist verde; o push na main publica em produção.
