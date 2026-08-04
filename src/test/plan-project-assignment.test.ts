import { describe, it, expect } from 'vitest';
import { PlanActionSchema } from '@/modules/plans/domain/plan.schema';
import {
  resolveActionProjectId,
  describeActionProjectAssignment,
} from '@/modules/plans/domain/project-assignment';

/**
 * Modelagem "projeto do plano" vs. "projeto da ação": um projectId nullable
 * sozinho seria ambíguo entre "herda do plano" e "não tem projeto" — por
 * isso PlanAction.projectAssignment é um vocabulário explícito
 * (inherit | specific | none), e projectId só existe quando specific.
 */

const NOW = new Date().toISOString();
const WORKSPACE_ID = '33333333-3333-4333-8333-333333333333';
const PLAN_ID = '44444444-4444-4444-8444-444444444444';

function baseAction(overrides: Record<string, unknown> = {}) {
  return {
    id: '55555555-5555-4555-8555-555555555555',
    workspaceId: WORKSPACE_ID,
    executionPlanId: PLAN_ID,
    title: 'Ação',
    actionType: 'task',
    priority: 'normal',
    dependencyActionIds: [],
    requiresConfirmation: false,
    position: 0,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

describe('PlanActionSchema — invariante projectAssignment/projectId', () => {
  it('assume "inherit" por padrão quando projectAssignment não é informado (linhas legadas)', () => {
    const parsed = PlanActionSchema.parse(baseAction());
    expect(parsed.projectAssignment).toBe('inherit');
    expect(parsed.projectId).toBeUndefined();
  });

  it('aceita "specific" com projectId', () => {
    const projectId = '66666666-6666-4666-8666-666666666666';
    const parsed = PlanActionSchema.parse(
      baseAction({ projectAssignment: 'specific', projectId })
    );
    expect(parsed.projectAssignment).toBe('specific');
    expect(parsed.projectId).toBe(projectId);
  });

  it('rejeita "specific" sem projectId (estado ambíguo nunca persistido)', () => {
    expect(() => PlanActionSchema.parse(baseAction({ projectAssignment: 'specific' }))).toThrow(
      /projectId/
    );
  });

  it('rejeita projectId presente quando projectAssignment é "none"', () => {
    const projectId = '66666666-6666-4666-8666-666666666666';
    expect(() =>
      PlanActionSchema.parse(baseAction({ projectAssignment: 'none', projectId }))
    ).toThrow(/projectId/);
  });

  it('rejeita projectId presente quando projectAssignment é "inherit"', () => {
    const projectId = '66666666-6666-4666-8666-666666666666';
    expect(() =>
      PlanActionSchema.parse(baseAction({ projectAssignment: 'inherit', projectId }))
    ).toThrow(/projectId/);
  });

  it('aceita "none" sem projectId', () => {
    const parsed = PlanActionSchema.parse(baseAction({ projectAssignment: 'none' }));
    expect(parsed.projectAssignment).toBe('none');
    expect(parsed.projectId).toBeUndefined();
  });
});

describe('resolveActionProjectId', () => {
  const PLAN_PROJECT = 'plan-project-id';

  it('inherit usa o project_id do plano', () => {
    expect(resolveActionProjectId({ projectAssignment: 'inherit' }, PLAN_PROJECT)).toBe(PLAN_PROJECT);
  });

  it('inherit com plano sem projeto resolve para null', () => {
    expect(resolveActionProjectId({ projectAssignment: 'inherit' }, null)).toBeNull();
  });

  it('specific usa o project_id da própria ação, nunca o do plano', () => {
    expect(
      resolveActionProjectId({ projectAssignment: 'specific', projectId: 'action-project-id' }, PLAN_PROJECT)
    ).toBe('action-project-id');
  });

  it('none sempre resolve para null, mesmo com plano tendo projeto', () => {
    expect(resolveActionProjectId({ projectAssignment: 'none' }, PLAN_PROJECT)).toBeNull();
  });

  it('assignment ausente (linha legada) se comporta como inherit', () => {
    expect(resolveActionProjectId({}, PLAN_PROJECT)).toBe(PLAN_PROJECT);
  });
});

describe('describeActionProjectAssignment', () => {
  const resolveName = (id: string) => (id === 'proj-1' ? 'Carreira' : undefined);

  it('inherit: mostra o projeto do plano, tom neutro (sem exigir confirmação)', () => {
    const label = describeActionProjectAssignment({ projectAssignment: 'inherit' }, 'Almeida Ambiental', resolveName);
    expect(label.text).toBe('Projeto: Almeida Ambiental');
    expect(label.tone).toBe('muted');
  });

  it('inherit sem projeto no plano: "sem projeto", ainda neutro', () => {
    const label = describeActionProjectAssignment({ projectAssignment: 'inherit' }, null, resolveName);
    expect(label.text).toBe('Projeto: sem projeto');
    expect(label.tone).toBe('muted');
  });

  it('none: destaca "sem projeto" para confirmação (diverge do padrão)', () => {
    const label = describeActionProjectAssignment({ projectAssignment: 'none' }, 'Almeida Ambiental', resolveName);
    expect(label.text).toBe('Projeto: sem projeto');
    expect(label.tone).toBe('highlight');
  });

  it('specific resolvido: mostra o nome do projeto, destacado para confirmação', () => {
    const label = describeActionProjectAssignment(
      { projectAssignment: 'specific', projectId: 'proj-1' },
      'Almeida Ambiental',
      resolveName
    );
    expect(label.text).toBe('Projeto: Carreira');
    expect(label.tone).toBe('highlight');
  });

  it('specific sem correspondência (sugestão da IA sem projeto existente): alerta forte', () => {
    const label = describeActionProjectAssignment(
      { projectAssignment: 'specific', suggestedProjectName: 'Carreira' },
      'Almeida Ambiental',
      resolveName
    );
    expect(label.text).toContain('Carreira');
    expect(label.text).toContain('ainda não existe');
    expect(label.tone).toBe('alert');
  });
});
