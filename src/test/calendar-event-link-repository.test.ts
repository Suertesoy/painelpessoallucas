import { describe, it, expect, vi } from 'vitest';
import { SupabaseCalendarEventLinkRepository } from '@/platform/integrations/supabase-calendar-event-link.repository';
import { ChangeNotifier } from '@/platform/supabase/change-notifier';

/**
 * Repositório que a agenda interna (/agenda) e o Hoje consultam para exibir
 * eventos criados pelo painel — sem chamar o Google a cada carregamento.
 * Cobre a causa raiz do bug confirmado: sem este repositório e sem esta
 * query, não existia NENHUM caminho de leitura para calendar_event_links.
 */

function fakeSupabaseForRange(rows: Record<string, unknown>[], error: { message: string } | null = null) {
  const calls: Record<string, unknown[][]> = {};
  const record = (method: string, args: unknown[]) => {
    (calls[method] ??= []).push(args);
  };
  const chain: Record<string, unknown> = {};
  for (const method of ['select', 'eq', 'neq', 'not', 'lt', 'gt']) {
    chain[method] = (...args: unknown[]) => {
      record(method, args);
      return chain;
    };
  }
  chain.order = async (...args: unknown[]) => {
    record('order', args);
    return { data: error ? null : rows, error };
  };
  return {
    supabase: { from: (table: string) => (record('from', [table]), chain) },
    calls,
  };
}

const ROW = {
  id: 'link-1',
  item_id: 'item-1',
  google_calendar_id: 'cal-1',
  google_event_id: 'evt-1',
  title: 'Reunião com a Priscila',
  start_at: '2026-08-05T13:00:00.000Z',
  end_at: '2026-08-05T14:00:00.000Z',
  time_zone: 'America/Sao_Paulo',
  location: null,
  meeting_link: null,
  modality: 'undetermined',
  html_link: 'https://calendar.google.com/event?eid=abc',
  google_status: 'confirmed',
  sync_status: 'synced',
  created_by_panel: true,
};

describe('SupabaseCalendarEventLinkRepository.listInRange', () => {
  it('filtra por workspace, exclui vínculos deletados e retorna a representação normalizada', async () => {
    const { supabase, calls } = fakeSupabaseForRange([ROW]);
    const repo = new SupabaseCalendarEventLinkRepository(supabase as never, 'ws-1', new ChangeNotifier());

    const result = await repo.listInRange('2026-08-05T00:00:00.000Z', '2026-08-06T00:00:00.000Z');

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: 'link-1',
      itemId: 'item-1',
      googleCalendarId: 'cal-1',
      googleEventId: 'evt-1',
      startAt: '2026-08-05T13:00:00.000Z',
      modality: 'undetermined',
      htmlLink: 'https://calendar.google.com/event?eid=abc',
      createdByPanel: true,
    });

    expect(calls.from).toEqual([['calendar_event_links']]);
    expect(calls.eq).toContainEqual(['workspace_id', 'ws-1']);
    expect(calls.neq).toContainEqual(['sync_status', 'deleted']);
    expect(calls.lt).toContainEqual(['start_at', '2026-08-06T00:00:00.000Z']);
    expect(calls.gt).toContainEqual(['end_at', '2026-08-05T00:00:00.000Z']);
  });

  it('erro do Supabase nunca vira lista vazia silenciosa', async () => {
    const { supabase } = fakeSupabaseForRange([], { message: 'permission denied' });
    const repo = new SupabaseCalendarEventLinkRepository(supabase as never, 'ws-1', new ChangeNotifier());

    await expect(repo.listInRange('2026-08-05T00:00:00.000Z', '2026-08-06T00:00:00.000Z')).rejects.toThrow(
      /permission denied/
    );
  });
});

describe('SupabaseCalendarEventLinkRepository — reatividade', () => {
  it('notifyChanged() dispara os listeners inscritos (usado após a criação via rota de servidor)', () => {
    const notifier = new ChangeNotifier();
    const repo = new SupabaseCalendarEventLinkRepository({} as never, 'ws-1', notifier);
    const listener = vi.fn();
    repo.subscribe(listener);

    repo.notifyChanged();

    expect(listener).toHaveBeenCalledTimes(1);
  });
});
