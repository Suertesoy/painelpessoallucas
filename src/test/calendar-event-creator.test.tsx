// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { CalendarEventCreator } from '@/components/calendar-event-creator';

/**
 * Testes diretos do formulário de evento reaproveitado em TODOS os pontos de
 * entrada (áudio, texto, manual). Cobre especificamente o que motivou a
 * extração: `aiRunId` é opcional — quando ausente (criação manual, sem
 * proposta de IA por trás), o payload enviado ao servidor NÃO inclui
 * `aiRunId`, e quando presente (fluxo de áudio) o payload inclui.
 */

const notifyChanged = vi.fn();
vi.mock('@/providers/repository.provider', () => ({
  useRepositories: () => ({ calendarEventLinkRepository: { notifyChanged } }),
}));

const originalFetch = global.fetch;

function successResponse(overrides: Record<string, unknown> = {}) {
  return {
    ok: true,
    json: async () => ({
      status: 'created',
      googleEventId: 'evt-1',
      googleCalendarId: 'cal-1',
      htmlLink: 'https://calendar.google.com/event?eid=abc',
      title: 'Consulta médica',
      startAt: '2026-08-05T13:00:00.000Z',
      endAt: '2026-08-05T14:00:00.000Z',
      timeZone: 'America/Sao_Paulo',
      location: null,
      meetingLink: null,
      modality: 'undetermined',
      reminders: [1440, 60],
      ...overrides,
    }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
  global.fetch = originalFetch;
});

describe('CalendarEventCreator — criação manual (sem aiRunId)', () => {
  it('não envia aiRunId no payload quando a prop não é fornecida', async () => {
    global.fetch = vi.fn().mockResolvedValue(successResponse());
    render(<CalendarEventCreator itemId="item-1" initialTitle="Consulta médica" />);

    fireEvent.change(screen.getByLabelText('Início'), { target: { value: '2026-08-05T10:00' } });
    fireEvent.click(screen.getByRole('button', { name: /Criar evento no Calendar/ }));

    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith('/api/audio/confirm-calendar-event', expect.any(Object)));
    const [, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const sentBody = JSON.parse(init.body);
    expect(sentBody.itemId).toBe('item-1');
    expect(sentBody).not.toHaveProperty('aiRunId');

    await waitFor(() => expect(screen.getByText(/Evento criado no calendário/)).toBeTruthy());
    expect(notifyChanged).toHaveBeenCalledTimes(1);
  });

  it('envia aiRunId no payload quando fornecido (fluxo de áudio/IA)', async () => {
    global.fetch = vi.fn().mockResolvedValue(successResponse());
    render(<CalendarEventCreator itemId="item-1" aiRunId="run-1" initialTitle="Reunião" />);

    fireEvent.change(screen.getByLabelText('Início'), { target: { value: '2026-08-05T10:00' } });
    fireEvent.click(screen.getByRole('button', { name: /Criar evento no Calendar/ }));

    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    const [, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const sentBody = JSON.parse(init.body);
    expect(sentBody.aiRunId).toBe('run-1');
  });

  it('exige um título antes de permitir a criação (criação manual não tem título vindo de proposta)', () => {
    render(<CalendarEventCreator itemId="item-1" />);
    fireEvent.change(screen.getByLabelText('Início'), { target: { value: '2026-08-05T10:00' } });
    expect(screen.getByRole('button', { name: /Criar evento no Calendar/ })).toHaveProperty('disabled', true);

    fireEvent.change(screen.getByLabelText('Título do evento'), { target: { value: 'Buscar exame' } });
    expect(screen.getByRole('button', { name: /Criar evento no Calendar/ })).toHaveProperty('disabled', false);
  });

  it('preenchendo local presencial com uma sugestão selecionada, envia location/placeId/coordenadas', async () => {
    global.fetch = vi.fn((url: string) => {
      if (url.includes('/api/integrations/places/search')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ suggestions: [{ placeId: 'place-9', text: 'Clínica São Lucas, Av. Brasil 500' }] }),
        });
      }
      if (url.includes('/api/integrations/places/details')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            placeId: 'place-9',
            name: 'Clínica São Lucas',
            formattedAddress: 'Av. Brasil, 500 - São Paulo',
            lat: -23.5,
            lng: -46.6,
          }),
        });
      }
      if (url.includes('/api/audio/confirm-calendar-event')) {
        return Promise.resolve(successResponse({ modality: 'in_person', location: 'Av. Brasil, 500 - São Paulo' }));
      }
      return Promise.resolve({ ok: false, json: async () => ({}) });
    }) as unknown as typeof fetch;

    render(<CalendarEventCreator itemId="item-1" initialTitle="Consulta" />);

    fireEvent.click(screen.getByRole('button', { name: 'Presencial' }));
    fireEvent.change(screen.getByLabelText('Local do evento'), { target: { value: 'Clínica São Lucas' } });
    await waitFor(() => expect(screen.getByText('Clínica São Lucas, Av. Brasil 500')).toBeTruthy());
    fireEvent.click(screen.getByText('Clínica São Lucas, Av. Brasil 500'));
    await waitFor(() => expect(screen.getByText(/Local selecionado/)).toBeTruthy());

    fireEvent.change(screen.getByLabelText('Início'), { target: { value: '2026-08-05T10:00' } });
    fireEvent.click(screen.getByRole('button', { name: /Criar evento no Calendar/ }));

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith('/api/audio/confirm-calendar-event', expect.any(Object))
    );
    const call = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.find((c) =>
      String(c[0]).includes('/api/audio/confirm-calendar-event')
    )!;
    const sentBody = JSON.parse(call[1].body);
    expect(sentBody.location).toBe('Av. Brasil, 500 - São Paulo');
    expect(sentBody.locationPlaceId).toBe('place-9');
    expect(sentBody.locationLat).toBe(-23.5);
    expect(sentBody.locationLng).toBe(-46.6);
  });

  it('término anterior ao início bloqueia a criação com a mensagem exigida', () => {
    render(<CalendarEventCreator itemId="item-1" initialTitle="Evento" />);
    fireEvent.change(screen.getByLabelText('Início'), { target: { value: '2026-08-05T10:00' } });
    fireEvent.change(screen.getByLabelText('Fim'), { target: { value: '2026-08-05T09:00' } });
    expect(screen.getByText('Não dá para terminar antes de começar.')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Criar evento no Calendar/ })).toHaveProperty('disabled', true);
  });
});
