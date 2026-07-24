import { describe, it, expect } from 'vitest';
import { SupabaseAudioProvenanceRepository } from '@/platform/ai/supabase-audio-provenance.repository';

/**
 * Repositório de proveniência de captura por áudio (ai_runs + calendar_event_links)
 * usado pelo detalhe do item (Etapa 7) e pela tela de revisão (registro de
 * ações aprovadas/rejeitadas). Sem Supabase real — cliente mockado.
 */

/** Chain genérica: aceita qualquer sequência de .eq()/.order()/.limit() antes de .maybeSingle(). */
function selectChain(data: unknown, error: unknown = null) {
  const obj: Record<string, unknown> = {};
  for (const m of ['eq', 'order', 'limit']) obj[m] = () => obj;
  obj.maybeSingle = async () => ({ data, error });
  return obj;
}

function fakeSupabase(opts: {
  aiRunRow?: Record<string, unknown> | null;
  calendarLinkRow?: Record<string, unknown> | null;
  onUpdate?: (values: Record<string, unknown>) => void;
}) {
  return {
    from: (table: string) => {
      if (table === 'ai_runs') {
        return {
          select: () => selectChain(opts.aiRunRow ?? null),
          update: (values: Record<string, unknown>) => ({
            eq: async () => {
              opts.onUpdate?.(values);
              return { error: null };
            },
          }),
        };
      }
      if (table === 'calendar_event_links') {
        return { select: () => selectChain(opts.calendarLinkRow ?? null) };
      }
      throw new Error(`tabela inesperada: ${table}`);
    },
  };
}

describe('SupabaseAudioProvenanceRepository.findLatestTriageRun', () => {
  it('retorna null quando não há execução de IA para o item', async () => {
    const repo = new SupabaseAudioProvenanceRepository(fakeSupabase({ aiRunRow: null }) as never, 'ws-1');
    const result = await repo.findLatestTriageRun('item-1');
    expect(result).toBeNull();
  });

  it('separa os campos da proposta (schema) dos campos de outcome (auditoria de aprovação)', async () => {
    const row = {
      id: 'run-1',
      model: 'gpt-4.1-mini',
      status: 'completed',
      created_at: '2026-07-24T10:00:00.000Z',
      completed_at: '2026-07-24T10:00:05.000Z',
      error_message: null,
      response_metadata: {
        intent: 'task',
        suggestedTitle: 'Ligar para o cliente',
        summary: 'resumo',
        projectCandidates: [],
        proposedActions: [],
        calendarProposal: null,
        missingInformation: [],
        overallConfidence: 0.9,
        actionsOutcome: [{ index: 0, status: 'done' }],
        calendarOutcome: 'error',
      },
    };
    const repo = new SupabaseAudioProvenanceRepository(fakeSupabase({ aiRunRow: row }) as never, 'ws-1');
    const result = await repo.findLatestTriageRun('item-1');

    expect(result?.proposal?.suggestedTitle).toBe('Ligar para o cliente');
    expect(result?.actionsOutcome).toEqual([{ index: 0, status: 'done' }]);
    expect(result?.calendarOutcome).toBe('error');
  });

  it('proposal fica null quando response_metadata não bate com o schema (execução antiga/corrompida)', async () => {
    const row = {
      id: 'run-1',
      model: 'gpt-4.1-mini',
      status: 'failed',
      created_at: '2026-07-24T10:00:00.000Z',
      completed_at: null,
      error_message: 'timeout',
      response_metadata: null,
    };
    const repo = new SupabaseAudioProvenanceRepository(fakeSupabase({ aiRunRow: row }) as never, 'ws-1');
    const result = await repo.findLatestTriageRun('item-1');

    expect(result?.proposal).toBeNull();
    expect(result?.errorMessage).toBe('timeout');
  });
});

describe('SupabaseAudioProvenanceRepository.findCalendarEventLink', () => {
  it('retorna null quando a captura não tem evento vinculado', async () => {
    const repo = new SupabaseAudioProvenanceRepository(fakeSupabase({ calendarLinkRow: null }) as never, 'ws-1');
    expect(await repo.findCalendarEventLink('item-1')).toBeNull();
  });

  it('retorna o vínculo quando existe', async () => {
    const repo = new SupabaseAudioProvenanceRepository(
      fakeSupabase({
        calendarLinkRow: { google_calendar_id: 'cal-1', google_event_id: 'evt-1', sync_status: 'synced' },
      }) as never,
      'ws-1'
    );
    const link = await repo.findCalendarEventLink('item-1');
    expect(link).toEqual({ googleCalendarId: 'cal-1', googleEventId: 'evt-1', syncStatus: 'synced' });
  });
});

describe('SupabaseAudioProvenanceRepository — registro de resultado (auditoria best-effort)', () => {
  it('recordActionOutcome faz merge no response_metadata sem apagar a proposta original', async () => {
    const updates: Record<string, unknown>[] = [];
    const supabase = fakeSupabase({
      aiRunRow: { response_metadata: { suggestedTitle: 'x', actionsOutcome: [{ index: 1, status: 'done' }] } },
      onUpdate: (v) => updates.push(v),
    });
    const repo = new SupabaseAudioProvenanceRepository(supabase as never, 'ws-1');

    await repo.recordActionOutcome('run-1', 0, 'error');

    expect(updates).toHaveLength(1);
    const metadata = updates[0].response_metadata as Record<string, unknown>;
    expect(metadata.suggestedTitle).toBe('x');
    expect(metadata.actionsOutcome).toEqual(
      expect.arrayContaining([
        { index: 1, status: 'done' },
        { index: 0, status: 'error' },
      ])
    );
  });

  it('recordActionOutcome substitui um outcome já existente para o mesmo índice', async () => {
    const updates: Record<string, unknown>[] = [];
    const supabase = fakeSupabase({
      aiRunRow: { response_metadata: { actionsOutcome: [{ index: 0, status: 'error' }] } },
      onUpdate: (v) => updates.push(v),
    });
    const repo = new SupabaseAudioProvenanceRepository(supabase as never, 'ws-1');

    await repo.recordActionOutcome('run-1', 0, 'done');

    const metadata = updates[0].response_metadata as Record<string, unknown>;
    expect(metadata.actionsOutcome).toEqual([{ index: 0, status: 'done' }]);
  });

  it('nunca lança quando a atualização falha — é auditoria, não pode derrubar o fluxo principal', async () => {
    const supabase = {
      from: () => ({
        select: () => {
          throw new Error('conexão perdida');
        },
      }),
    };
    const repo = new SupabaseAudioProvenanceRepository(supabase as never, 'ws-1');
    await expect(repo.recordActionOutcome('run-1', 0, 'done')).resolves.toBeUndefined();
  });
});
