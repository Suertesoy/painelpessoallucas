// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import { TodayCalendarCard } from '@/components/today-calendar-card';

/**
 * Uma falha do Google Calendar não pode derrubar os demais blocos de Hoje.
 * TodayCalendarCard busca seus próprios dados (fetch isolado) e precisa
 * continuar renderizando a capacidade do dia mesmo quando essa chamada falha.
 */

afterEach(() => {
  vi.unstubAllGlobals();
  cleanup();
});

describe('TodayCalendarCard — isolamento de falha do Calendar', () => {
  it('falha de rede no Calendar não lança exceção e mantém a capacidade do dia visível', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));

    expect(() =>
      render(
        <TodayCalendarCard date="2026-07-22" scheduledItems={[]} focusItems={[]} />
      )
    ).not.toThrow();

    expect(screen.getByText('Capacidade do dia')).toBeTruthy();

    await waitFor(() =>
      expect(screen.getByText('Não foi possível carregar o Google Calendar.')).toBeTruthy()
    );

    // O card continua funcional (não fica em estado quebrado/infinito).
    expect(screen.getByText(/Não conectado\.|Reconectar/)).toBeTruthy();
  });

  it('quando conectado com sucesso, mostra os compromissos sem afetar a capacidade', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ connected: true, busy: [], events: [] }),
      })
    );

    render(<TodayCalendarCard date="2026-07-22" scheduledItems={[]} focusItems={[]} />);

    await waitFor(() => expect(screen.getByText('Nenhum compromisso hoje.')).toBeTruthy());
    expect(screen.getByText('Capacidade do dia')).toBeTruthy();
  });
});
