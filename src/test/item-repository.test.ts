import { describe, it, expect } from 'vitest';
import { rowToItem } from '@/modules/items/infrastructure/supabase-item.repository';

/**
 * Mesma causa raiz do mapper de projetos (z.string().datetime() estrito
 * rejeitando timestamps com offset numérico) afeta todo domínio com
 * created_at/updated_at — incluindo items, usados pela página Hoje.
 */

const OFFSET_DATE = '2026-07-17T00:40:37.484+00:00';

function realItemRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: crypto.randomUUID(),
    workspace_id: crypto.randomUUID(),
    project_id: null,
    title: 'Tarefa real',
    content: null,
    type: 'task',
    status: 'inbox',
    priority: 'normal',
    due_at: null,
    scheduled_at: null,
    estimated_minutes: null,
    next_action: null,
    source: 'manual',
    created_at: OFFSET_DATE,
    updated_at: OFFSET_DATE,
    completed_at: null,
    archived_at: null,
    execution_plan_id: null,
    plan_phase_id: null,
    plan_action_id: null,
    recurrence_rule_id: null,
    occurrence_at: null,
    ...overrides,
  };
}

describe('rowToItem (mapper real)', () => {
  it('aceita a data ISO com offset do Postgres (createdAt/updatedAt)', () => {
    const item = rowToItem(realItemRow() as never);
    expect(item.createdAt).toBe(OFFSET_DATE);
    expect(item.updatedAt).toBe(OFFSET_DATE);
  });

  it('normaliza project_id, content, due_at e scheduled_at null para undefined', () => {
    const item = rowToItem(realItemRow() as never);
    expect(item.projectId).toBeUndefined();
    expect(item.content).toBeUndefined();
    expect(item.dueAt).toBeUndefined();
    expect(item.scheduledAt).toBeUndefined();
  });

  it('preserva campos de proveniência da Fase 2 (plano/recorrência) como undefined quando null', () => {
    const item = rowToItem(realItemRow() as never);
    expect(item.executionPlanId).toBeUndefined();
    expect(item.recurrenceRuleId).toBeUndefined();
    expect(item.occurrenceAt).toBeUndefined();
  });
});
