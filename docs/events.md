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

## Persistência Local (Temporária)
Na primeira fase, os eventos são persistidos em um `LocalStorageEventRepository` puramente para registro e depuração. 

## Futura Outbox Transacional
Quando o banco de dados definitivo (Supabase) for introduzido, a criação da entidade e a criação do evento devem ocorrer dentro da mesma transação no banco.

## Idempotência, Filas e Novas Tentativas
Serviços assíncronos que consumirem esses eventos (via Vercel Workflows, filas, ou webhooks) devem garantir que o processamento seja idempotente. Caso haja falhas, a fila deve possuir mecanismos de repetição (retries) com base no registro da Outbox.
