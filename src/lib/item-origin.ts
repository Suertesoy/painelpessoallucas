import type { Item } from '@/modules/items/domain/item.schema';

/**
 * Traduz a proveniência técnica de um item para linguagem compreensível.
 *
 * O domínio não tem um campo booleano "migrado" — a Fase 1 preserva o
 * `source` original do item (ex.: `quick_capture`), que também é usado por
 * capturas feitas diretamente na Fase 2. Por isso, itens migrados só são
 * identificáveis comparando `createdAt` com o evento `migration.completed`
 * mais recente do workspace: um item criado antes desse evento existia no
 * localStorage da Fase 1 e foi trazido pelo assistente de migração.
 */

export type ItemOriginKind =
  | 'recurrence'
  | 'plan'
  | 'integration'
  | 'automation'
  | 'ai'
  | 'mcp'
  | 'migrated'
  | 'manual'
  | 'unknown';

export interface ItemOrigin {
  kind: ItemOriginKind;
  label: string;
  /** Link navegável para o projeto de origem, quando existir. */
  projectHref?: string;
  /** Link navegável para o plano de origem, quando existir. */
  planHref?: string;
}

export function resolveItemOrigin(item: Item, migrationCompletedAt: string | null): ItemOrigin {
  const planHref = item.executionPlanId ? `/planos/${item.executionPlanId}` : undefined;
  const projectHref = item.projectId ? `/projetos/${item.projectId}` : undefined;

  if (item.recurrenceRuleId) {
    return { kind: 'recurrence', label: 'Criado por uma regra de recorrência', planHref, projectHref };
  }

  if (item.executionPlanId || item.planActionId || item.planPhaseId) {
    return { kind: 'plan', label: 'Gerado a partir de um plano', planHref, projectHref };
  }

  switch (item.source) {
    case 'integration':
      return { kind: 'integration', label: 'Criado por uma integração', projectHref };
    case 'automation':
      return { kind: 'automation', label: 'Criado por automação', projectHref };
    case 'ai':
      return { kind: 'ai', label: 'Gerado por IA', projectHref };
    case 'mcp':
      return { kind: 'mcp', label: 'Criado via MCP', projectHref };
  }

  if (migrationCompletedAt && item.createdAt < migrationCompletedAt) {
    return { kind: 'migrated', label: 'Migrado da versão local do painel (Fase 1)', projectHref };
  }

  if (item.source === 'manual' || item.source === 'quick_capture' || item.source === 'import') {
    return { kind: 'manual', label: 'Capturado manualmente', projectHref };
  }

  return { kind: 'unknown', label: 'Origem desconhecida', projectHref };
}
