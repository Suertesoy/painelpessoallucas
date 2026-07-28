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
