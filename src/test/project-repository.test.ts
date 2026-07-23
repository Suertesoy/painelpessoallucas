import { describe, it, expect } from 'vitest';
import { SupabaseProjectRepository, rowToProject } from '@/modules/projects/infrastructure/supabase-project.repository';
import { ChangeNotifier } from '@/platform/supabase/change-notifier';

/**
 * Testes do repositório real de projetos contra o FORMATO REAL de linha que
 * o Postgres/PostgREST devolve — a causa raiz comprovada da falha em
 * produção era `z.string().datetime()` (estrito, exige literal "Z") rejeitando
 * timestamps com offset numérico (`+00:00`), que é como o Postgres sempre
 * serializa `timestamptz` em JSON (row_to_json/to_json — o mesmo mecanismo
 * usado pelo PostgREST). Os testes abaixo reproduzem exatamente essas linhas
 * (confirmadas via `to_json(created_at)` no banco remoto), incluindo os
 * campos NULL legítimos (description, objective, next_milestone, due_at,
 * archived_at) observados nos 7 projetos reais.
 */

const OFFSET_NOW = '2026-07-22T20:18:22.947221+00:00';
const OFFSET_CREATED = '2026-07-17T00:40:37.484+00:00';

function realRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: crypto.randomUUID(),
    workspace_id: crypto.randomUUID(),
    name: 'Projeto real',
    description: null,
    objective: null,
    status: 'active',
    attention_level: 'normal',
    next_milestone: null,
    due_at: null,
    created_at: OFFSET_CREATED,
    updated_at: OFFSET_NOW,
    archived_at: null,
    ...overrides,
  };
}

function makeMockSupabase(rows: unknown[]) {
  return {
    from: () => {
      const builder = {
        select: () => builder,
        eq: () => builder,
        is: () => builder,
        order: () => builder,
        then: (resolve: (v: { data: unknown; error: unknown }) => void) =>
          Promise.resolve({ data: rows, error: null }).then(resolve),
      };
      return builder;
    },
  };
}

describe('rowToProject (mapper real)', () => {
  it('converte snake_case para camelCase e preserva a data ISO com offset', () => {
    const project = rowToProject(realRow() as never);
    expect(project.workspaceId).toBeDefined();
    expect(project.attentionLevel).toBe('normal');
    expect(project.createdAt).toBe(OFFSET_CREATED);
    expect(project.updatedAt).toBe(OFFSET_NOW);
  });

  it('normaliza description null para undefined', () => {
    const project = rowToProject(realRow({ description: null }) as never);
    expect(project.description).toBeUndefined();
  });

  it('normaliza objective null para undefined', () => {
    const project = rowToProject(realRow({ objective: null }) as never);
    expect(project.objective).toBeUndefined();
  });

  it('normaliza next_milestone null para undefined', () => {
    const project = rowToProject(realRow({ next_milestone: null }) as never);
    expect(project.nextMilestone).toBeUndefined();
  });

  it('normaliza archived_at null para undefined', () => {
    const project = rowToProject(realRow({ archived_at: null }) as never);
    expect(project.archivedAt).toBeUndefined();
  });

  it('aceita attention_level no valor padrão real (normal)', () => {
    const project = rowToProject(realRow({ attention_level: 'normal' }) as never);
    expect(project.attentionLevel).toBe('normal');
  });

  it('rejeita formato de data que não seja ISO 8601 válido (proteção real do schema)', () => {
    expect(() => rowToProject(realRow({ created_at: 'não é uma data' }) as never)).toThrow();
  });
});

describe('SupabaseProjectRepository.findAll()', () => {
  it('mapeia sete projetos reais (com campos NULL legítimos) com sucesso', async () => {
    const rows = Array.from({ length: 7 }, (_, i) => realRow({ name: `Projeto ${i + 1}` }));
    const repo = new SupabaseProjectRepository(makeMockSupabase(rows) as never, 'ws-1', new ChangeNotifier());

    const projects = await repo.findAll();

    expect(projects).toHaveLength(7);
    expect(projects.every((p) => typeof p.createdAt === 'string')).toBe(true);
  });

  it('uma única linha incompatível derruba a coleção inteira — o erro não é engolido', async () => {
    const rows = [realRow(), { ...realRow(), name: undefined }]; // segunda linha sem nome obrigatório
    const repo = new SupabaseProjectRepository(makeMockSupabase(rows) as never, 'ws-1', new ChangeNotifier());

    await expect(repo.findAll()).rejects.toThrow();
  });
});
