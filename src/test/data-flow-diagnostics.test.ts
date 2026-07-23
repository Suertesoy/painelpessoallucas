import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Testes do diagnóstico temporário de fluxo (Configurações → Fluxo Projetos /
 * Fluxo Hoje). Sem chamadas reais ao Supabase — cliente do navegador mockado.
 */

vi.mock('@/platform/supabase/browser-client', () => ({
  getSupabaseBrowserClient: vi.fn(),
}));

const OFFSET_DATE = '2026-07-17T00:40:37.484+00:00';

function projectRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: crypto.randomUUID(),
    workspace_id: 'ws-1',
    name: 'Projeto',
    description: null,
    objective: null,
    status: 'active',
    attention_level: 'normal',
    next_milestone: null,
    due_at: null,
    created_at: OFFSET_DATE,
    updated_at: OFFSET_DATE,
    archived_at: null,
    ...overrides,
  };
}

function chainableSelect(result: { data?: unknown; error?: unknown }) {
  const obj: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'is', 'order', 'limit']) {
    obj[m] = () => obj;
  }
  obj.maybeSingle = async () => ({ data: result.data ?? null, error: result.error ?? null });
  obj.then = (resolve: (v: unknown) => void) =>
    Promise.resolve({ data: result.data ?? [], error: result.error ?? null }).then(resolve);
  return obj;
}

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fetchProjectsFlowDiagnostics', () => {
  it('diferencia rawRowCount de mappedProjectCount quando uma linha falha no schema', async () => {
    const { getSupabaseBrowserClient } = await import('@/platform/supabase/browser-client');
    const rows = [projectRow(), projectRow({ name: undefined })]; // segunda linha sem nome obrigatório
    vi.mocked(getSupabaseBrowserClient).mockReturnValue({
      from: () => chainableSelect({ data: rows }),
    } as never);

    const { fetchProjectsFlowDiagnostics } = await import('@/components/data-flow-diagnostics-card');
    const result = await fetchProjectsFlowDiagnostics('ws-1', 'active');

    expect(result.rawRowCount).toBe(2);
    expect(result.mappedProjectCount).toBe(1);
    expect(result.schemaFailureCount).toBe(1);
    expect(result.repositoryStatus).toBe('error');
    expect(result.safeErrorCategory).toBe('schema_error');
  });

  it('sete linhas reais (com offset e campos NULL) mapeiam sem falha', async () => {
    const { getSupabaseBrowserClient } = await import('@/platform/supabase/browser-client');
    const rows = Array.from({ length: 7 }, () => projectRow());
    vi.mocked(getSupabaseBrowserClient).mockReturnValue({
      from: () => chainableSelect({ data: rows }),
    } as never);

    const { fetchProjectsFlowDiagnostics } = await import('@/components/data-flow-diagnostics-card');
    const result = await fetchProjectsFlowDiagnostics('ws-1', 'active');

    expect(result.rawRowCount).toBe(7);
    expect(result.mappedProjectCount).toBe(7);
    expect(result.schemaFailureCount).toBe(0);
    expect(result.filteredProjectCount).toBe(7);
    expect(result.repositoryStatus).toBe('ok');
    expect(result.safeErrorCategory).toBe('none');
  });

  it('classifica permission denied sem vazar a mensagem bruta do Postgres', async () => {
    const { getSupabaseBrowserClient } = await import('@/platform/supabase/browser-client');
    vi.mocked(getSupabaseBrowserClient).mockReturnValue({
      from: () => chainableSelect({ error: { code: '42501', message: 'permission denied for table projects' } }),
    } as never);

    const { fetchProjectsFlowDiagnostics } = await import('@/components/data-flow-diagnostics-card');
    const result = await fetchProjectsFlowDiagnostics('ws-1');

    expect(result.safeErrorCategory).toBe('permission_denied');
    expect(JSON.stringify(result)).not.toContain('permission denied for table projects');
  });
});
