import { describe, it, expect } from 'vitest';
import { resolveItemOrigin } from '@/lib/item-origin';
import type { Item } from '@/modules/items/domain/item.schema';

/**
 * resolveItemOrigin traduz a proveniência técnica de um item para a
 * linguagem exibida na seção "Origem" do detalhe do item. Cobre exatamente
 * o caso investigado ("baile da brum"): um item com source=quick_capture
 * criado antes do evento migration.completed do workspace é "Migrado da
 * versão local do painel (Fase 1)", não "Capturado manualmente".
 */

function baseItem(overrides: Partial<Item> = {}): Item {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    workspaceId: 'ws-1',
    title: 'Item de teste',
    type: 'task',
    status: 'organized',
    priority: 'normal',
    source: 'quick_capture',
    createdAt: '2026-07-17T00:44:32.379Z',
    updatedAt: '2026-07-17T00:44:32.379Z',
    ...overrides,
  };
}

describe('resolveItemOrigin', () => {
  it('classifica como migrado da Fase 1 quando criado antes do migration.completed', () => {
    const item = baseItem({ createdAt: '2026-07-17T00:44:32.379Z' });
    const origin = resolveItemOrigin(item, '2026-07-22T20:18:23.602Z');
    expect(origin.kind).toBe('migrated');
    expect(origin.label).toContain('Fase 1');
  });

  it('classifica como manual quando não há migração ou o item é posterior a ela', () => {
    const item = baseItem({ createdAt: '2026-07-23T09:00:00.000Z', source: 'manual' });
    const origin = resolveItemOrigin(item, '2026-07-22T20:18:23.602Z');
    expect(origin.kind).toBe('manual');
  });

  it('classifica como manual quando o workspace nunca migrou (migrationCompletedAt null)', () => {
    const item = baseItem({ source: 'quick_capture' });
    const origin = resolveItemOrigin(item, null);
    expect(origin.kind).toBe('manual');
  });

  it('prioriza recorrência sobre qualquer outra origem', () => {
    const item = baseItem({ recurrenceRuleId: 'rule-1', source: 'automation' });
    const origin = resolveItemOrigin(item, null);
    expect(origin.kind).toBe('recurrence');
  });

  it('classifica como gerado por plano quando há executionPlanId', () => {
    const item = baseItem({ executionPlanId: 'plan-1' });
    const origin = resolveItemOrigin(item, null);
    expect(origin.kind).toBe('plan');
    expect(origin.planHref).toBe('/planos/plan-1');
  });

  it('classifica origem de integração e automação pelo source', () => {
    expect(resolveItemOrigin(baseItem({ source: 'integration' }), null).kind).toBe('integration');
    expect(resolveItemOrigin(baseItem({ source: 'automation' }), null).kind).toBe('automation');
    expect(resolveItemOrigin(baseItem({ source: 'ai' }), null).kind).toBe('ai');
  });

  it('classifica captura por áudio pelo source, mesmo anterior à migração', () => {
    const item = baseItem({ source: 'audio_capture', createdAt: '2026-07-01T00:00:00.000Z' });
    const origin = resolveItemOrigin(item, '2026-07-22T20:18:23.602Z');
    expect(origin.kind).toBe('audio_capture');
    expect(origin.label).toBe('Captura por áudio');
  });

  it('inclui link para o projeto quando o item tem projectId', () => {
    const item = baseItem({ projectId: 'proj-1' });
    const origin = resolveItemOrigin(item, null);
    expect(origin.projectHref).toBe('/projetos/proj-1');
  });

  it('nunca inclui identificadores técnicos no rótulo exibido ao usuário', () => {
    const item = baseItem({ projectId: 'proj-1', executionPlanId: 'plan-1' });
    const origin = resolveItemOrigin(item, null);
    expect(origin.label).not.toMatch(/[0-9a-f-]{8,}/i);
  });
});
