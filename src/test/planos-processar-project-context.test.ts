// @vitest-environment node
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createFakeSupabase } from './helpers/fake-supabase';
import { setPlanStructurerFactory, type PlanStructurer, type StructurePlanResult } from '@/platform/ai/plan-structurer';
import type { PlanProposal } from '@/modules/plans/domain/plan-proposal.schema';

/**
 * O contexto de projetos enviado à IA estruturadora (`existingProjectNames`)
 * já era filtrado corretamente no código real (POST /api/planos/processar
 * já usa `.eq('status','active').is('deleted_at', null)`) — este é um teste
 * de REGRESSÃO, não uma correção. Garante que um projeto archived/paused/
 * completed/soft-deleted nunca vira candidato a `projectAssignment: 'specific'`
 * — a IA nunca "ressuscita" um projeto de teste arquivado (ex.: "Teste nuvem")
 * só porque a linha ainda existe no banco.
 */

vi.mock('server-only', () => ({}));

let fakeSupabase: ReturnType<typeof createFakeSupabase>;
vi.mock('@/platform/supabase/server-client', () => ({
  getSupabaseServerClient: async () => fakeSupabase,
}));

const DOC_ID = '11111111-1111-4111-8111-111111111111';
const WORKSPACE_ID = '33333333-3333-4333-8333-333333333333';

function jsonRequest(body: unknown): Request {
  return new Request('http://x/api/planos/processar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function sourceDocRow(overrides: Record<string, unknown> = {}) {
  return {
    id: DOC_ID,
    workspace_id: WORKSPACE_ID,
    project_id: null,
    title: 'Plano de teste',
    document_type: 'project_plan',
    original_content: 'conteúdo',
    content_hash: 'hash-1',
    processing_status: 'pending',
    updated_at: new Date().toISOString(),
    deleted_at: null,
    ...overrides,
  };
}

function minimalProposal(): PlanProposal {
  return {
    projectSuggestion: null,
    planName: 'Plano de teste',
    objective: null,
    assumptions: [],
    confirmedFacts: [],
    openQuestions: [],
    decisions: [],
    phases: [],
    actions: [],
    milestones: [],
    risks: [],
    dependencies: [],
    waitingItems: [],
    dailyRoutines: [],
    weeklyRoutines: [],
    suggestedReminders: [],
    confidence: 0.9,
    warnings: [],
  };
}

afterEach(() => {
  setPlanStructurerFactory(null as unknown as () => PlanStructurer);
});

describe('POST /api/planos/processar — contexto de projetos enviado à IA', () => {
  it('nunca inclui projetos archived, paused, completed ou soft-deleted em existingProjectNames', async () => {
    fakeSupabase = createFakeSupabase({
      source_documents: [sourceDocRow()],
      projects: [
        { id: 'p-active', workspace_id: WORKSPACE_ID, name: 'Projeto Ativo', status: 'active', deleted_at: null },
        { id: 'p-archived', workspace_id: WORKSPACE_ID, name: 'Teste nuvem', status: 'archived', deleted_at: null },
        { id: 'p-paused', workspace_id: WORKSPACE_ID, name: 'Projeto Pausado', status: 'paused', deleted_at: null },
        { id: 'p-completed', workspace_id: WORKSPACE_ID, name: 'Projeto Concluído', status: 'completed', deleted_at: null },
        {
          id: 'p-deleted',
          workspace_id: WORKSPACE_ID,
          name: 'Projeto Excluído',
          status: 'active',
          deleted_at: '2026-01-01T00:00:00.000Z',
        },
      ],
    });
    fakeSupabase.auth.getUser = async () => ({ data: { user: { id: 'user-1' } } });

    let capturedExistingProjectNames: string[] | undefined;
    setPlanStructurerFactory(
      () =>
        ({
          structure: async (input: { existingProjectNames?: string[] }): Promise<StructurePlanResult> => {
            capturedExistingProjectNames = input.existingProjectNames;
            return { proposal: minimalProposal(), usage: { model: 'mock', inputTokens: 1, outputTokens: 1 } };
          },
        }) as unknown as PlanStructurer
    );

    const { POST } = await import('@/app/api/planos/processar/route');
    const res = await POST(jsonRequest({ documentId: DOC_ID }));

    expect(res.status).toBe(200);
    expect(capturedExistingProjectNames).toEqual(['Projeto Ativo']);
    expect(capturedExistingProjectNames).not.toContain('Teste nuvem');
    expect(capturedExistingProjectNames).not.toContain('Projeto Pausado');
    expect(capturedExistingProjectNames).not.toContain('Projeto Concluído');
    expect(capturedExistingProjectNames).not.toContain('Projeto Excluído');
  });
});
