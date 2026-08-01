# Eventos

O sistema utiliza arquitetura orientada a eventos para notificar mudanças de estado, possibilitando integrações reativas e assíncronas.

## Eventos Atuais (Fase 1)
- `item.created`
- `item.updated`
- `item.completed`
- `item.archived`
- `item.scheduled` (inclui histórico: `previousScheduledAt` e `newScheduledAt`)
- `project.created`
- `project.updated`
- `project.archived`
- `daily_plan.focus_updated`

## Formato dos Eventos
Todo evento respeita uma estrutura mínima:
```typescript
{
  id: string; // UUID do evento
  type: string; // ex: 'item.created'
  entityId: string;
  workspaceId: string;
  source: string; // 'quick_capture', 'manual', etc.
  payload: any; // Dados específicos do evento
  createdAt: string; // ISO 8601
  processedAt?: string; // Preenchido após o processamento assíncrono
}
```

## Eventos adicionados na Fase 2
- `source_document.created`
- `execution_plan.draft_created` (source: `ai`)
- `execution_plan.approved` · `execution_plan.activated` · `execution_plan.status_changed`
- `migration.completed`
- `digest.daily_sent` · `digest.weekly_sent` · `digest.critical_sent` · `digest.automation_failure_sent`

## Eventos do módulo Aprendizado (Learning Engine)
- `learning.course.initialized` (emitido apenas na primeira inicialização do
  curso por workspace; chamadas seguintes são idempotentes e não reemitem)
- `learning.preferences.updated` (meta diária geral)
- `learning.course_preferences.updated` (romaji/furigana/tradução/reprodução
  automática — específicas de curso)
- `learning.session.started`
- `learning.session.completed` (payload inclui `durationMinutes` e `goalMet`)
- `learning.session.cancelled`
- `learning.lesson.viewed` (emitido apenas na primeira visualização da
  lição por workspace; chamadas seguintes são idempotentes e não reemitem.
  Nunca implica conclusão)
- `learning.lesson.exercise_answered` (payload: `blockId`, `outcome`,
  `attemptCount`; emitido em toda tentativa real — inclusive retentativas
  após erro, já que o exercício continua respondível até ser resolvido)
- `learning.lesson.exercise_resolved` (payload: `blockId`, `attemptCount`;
  emitido uma única vez, na tentativa em que o exercício é acertado pela
  primeira vez)
- `learning.lesson.completed` (payload inclui `totalExercises`,
  `answeredCount` e `resolvedCount`; emitido só pela ação explícita
  "Concluir lição" — nunca por visualização nem por todos os exercícios
  resolvidos. Idempotente: concluir de novo não reemite)

## Eventos da Lista de Compras
- `shopping_list.initialized` (emitido apenas quando `ShoppingCommands.
  ensureDefaultLists` efetivamente cria Mercado/Internet pela primeira vez
  no workspace; chamadas seguintes são idempotentes e não reemitem — mesmo
  padrão de `learning.course.initialized`)

Itens de compra (adicionar, editar, marcar/desmarcar, mover entre listas,
excluir) reaproveitam os eventos já existentes de `items`
(`item.created`/`item.updated`/`item.completed`/`item.archived`) — nenhum
evento novo foi criado para o conteúdo do item, só para o ciclo de vida das
listas.

## Eventos de Web Push (Fase 2.2)
- `reminder.created` (lembrete push de tarefa criado)
- `reminder.rescheduled` (payload: `previousRemindAt`, `newRemindAt` — no
  máximo um lembrete push pendente por item, então uma segunda chamada
  reagenda em vez de criar outro)
- `reminder.cancelled`

## Eventos do módulo Finanças
- `finance.setup_initialized` (emitido só quando `FinanceSetupCommands.
  ensureDefaults` efetivamente cria categorias, origens ou a configuração
  pela primeira vez no workspace; chamadas seguintes são idempotentes e não
  reemitem — payload: contagens criadas, nunca os dados em si)
- `finance.import_created`
- `finance.import_confirmed` (emitido só na confirmação real; retentativas
  idempotentes da mesma importação não reemitem — payload: `importId` e
  contagem de transações criadas)
- `finance.transaction_updated` (emitido a cada edição salva na revisão de
  uma linha de importação — payload: só os nomes dos campos alterados,
  nunca a descrição/valor em si)
- `finance.classification_rule_created` (emitido só quando o usuário
  confirma explicitamente "Aplicar esta classificação a lançamentos
  semelhantes"; nunca automático)
- `finance.monthly_values_updated` (renda/disponível/guardado do mês —
  payload: só o mês, nunca os valores)

Nenhum evento do módulo carrega arquivo bruto, descrição completa de
transação, valor monetário, saldo ou dado bancário — só ids, contagens e
metadados mínimos (seção 12 do módulo, ver `docs/ARCHITECTURE.md` §
Finanças).

## Persistência (Fase 2)
Os eventos vivem na tabela `domain_events` do Supabase (append-only, RLS por
workspace, imutáveis para o cliente). O `LocalStorageEventRepository` permanece
apenas para os dados antigos da Fase 1 e para a migração.

## Outbox Transacional (pendente)
Entidade e evento ainda são gravados em duas operações (o PostgREST não expõe
transações client-side). O evento é auditoria, não fonte de verdade; a falha na
gravação do evento não desfaz o command. A outbox transacional via RPC
permanece como evolução futura.

## Idempotência, Filas e Novas Tentativas
Serviços assíncronos que consumirem esses eventos (via Vercel Workflows, filas, ou webhooks) devem garantir que o processamento seja idempotente. Caso haja falhas, a fila deve possuir mecanismos de repetição (retries) com base no registro da Outbox.
