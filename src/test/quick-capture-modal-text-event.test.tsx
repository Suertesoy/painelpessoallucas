// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { QuickCaptureModal } from '@/components/quick-capture-modal';
import { openQuickCapture } from '@/lib/ui-events';

/**
 * Problema confirmado em produção: não existia NENHUM caminho para adicionar
 * localidade/evento a uma captura por TEXTO — só o fluxo de áudio tinha o
 * formulário de calendário. Depois de salvar via texto, o modal agora
 * oferece (opcional, sem fechar automaticamente) o mesmo CalendarEventCreator
 * usado nos outros fluxos, incluindo busca de local.
 */

const createItem = vi.fn();
const listProjects = vi.fn();
const notifyChanged = vi.fn();

vi.mock('@/providers/repository.provider', () => ({
  useCommands: () => ({ item: { createItem } }),
  useQueries: () => ({ project: { listProjects } }),
  useRepositories: () => ({ calendarEventLinkRepository: { notifyChanged } }),
}));
vi.mock('@/providers/auth.provider', () => ({
  useWorkspace: () => ({ workspaceId: 'ws-1' }),
}));

const originalFetch = global.fetch;

beforeEach(() => {
  vi.clearAllMocks();
  listProjects.mockResolvedValue([]);
});

afterEach(() => {
  cleanup();
  global.fetch = originalFetch;
});

async function captureByText(content: string) {
  render(<QuickCaptureModal />);
  openQuickCapture();
  await waitFor(() => expect(screen.getByRole('dialog')).toBeTruthy());
  fireEvent.change(screen.getByPlaceholderText('O que está em sua mente?'), { target: { value: content } });
  fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
  await waitFor(() => expect(screen.getByText('Item capturado com sucesso!')).toBeTruthy());
}

describe('QuickCaptureModal — captura por texto oferece evento de calendário', () => {
  it('depois de salvar por texto, mostra o formulário de evento (não fecha sozinho)', async () => {
    createItem.mockResolvedValue({ id: 'item-texto-1' });
    await captureByText('Buscar exame às 9h');

    expect(screen.getByText('Adicionar ao Calendário (opcional)')).toBeTruthy();
    expect(screen.getByLabelText('Título do evento')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Fechar captura' })).toBeTruthy();
  });

  it('permite escolher local presencial e cria o evento sem aiRunId (não é fluxo de IA)', async () => {
    createItem.mockResolvedValue({ id: 'item-texto-2' });
    global.fetch = vi.fn((url: string) => {
      if (url.includes('/api/integrations/places/search')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ suggestions: [{ placeId: 'place-1', text: 'Laboratório Central, Rua X 10' }] }),
        });
      }
      if (url.includes('/api/integrations/places/details')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            placeId: 'place-1',
            name: 'Laboratório Central',
            formattedAddress: 'Rua X, 10 - São Paulo',
            lat: -23.55,
            lng: -46.63,
          }),
        });
      }
      if (url.includes('/api/audio/confirm-calendar-event')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            status: 'created',
            googleEventId: 'evt-txt-1',
            googleCalendarId: 'cal-1',
            htmlLink: 'https://calendar.google.com/event?eid=x',
            title: 'Buscar exame às 9h',
            startAt: '2026-08-05T12:00:00.000Z',
            endAt: '2026-08-05T13:00:00.000Z',
            timeZone: 'America/Sao_Paulo',
            location: 'Rua X, 10 - São Paulo',
            meetingLink: null,
            modality: 'in_person',
            reminders: [1440, 60],
          }),
        });
      }
      return Promise.resolve({ ok: false, json: async () => ({}) });
    }) as unknown as typeof fetch;

    await captureByText('Buscar exame às 9h');

    fireEvent.click(screen.getByRole('button', { name: 'Presencial' }));
    fireEvent.change(screen.getByLabelText('Local do evento'), { target: { value: 'Laboratório Central' } });
    await waitFor(() => expect(screen.getByText('Laboratório Central, Rua X 10')).toBeTruthy());
    fireEvent.click(screen.getByText('Laboratório Central, Rua X 10'));
    await waitFor(() => expect(screen.getByText(/Local selecionado/)).toBeTruthy());

    fireEvent.change(screen.getByLabelText('Início'), { target: { value: '2026-08-05T09:00' } });
    fireEvent.click(screen.getByRole('button', { name: /Criar evento no Calendar/ }));

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith('/api/audio/confirm-calendar-event', expect.any(Object))
    );
    const call = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.find((c) =>
      String(c[0]).includes('/api/audio/confirm-calendar-event')
    )!;
    const sentBody = JSON.parse(call[1].body);
    expect(sentBody.itemId).toBe('item-texto-2');
    expect(sentBody).not.toHaveProperty('aiRunId');
    expect(sentBody.modality).toBe('in_person');
    expect(sentBody.location).toBe('Rua X, 10 - São Paulo');
    expect(sentBody.locationPlaceId).toBe('place-1');

    await waitFor(() => expect(screen.getByText(/Evento criado no calendário/)).toBeTruthy());
    expect(notifyChanged).toHaveBeenCalledTimes(1);
  });

  it('"Fechar" descarta a captura sem criar evento', async () => {
    createItem.mockResolvedValue({ id: 'item-texto-3' });
    await captureByText('Só uma nota rápida');

    fireEvent.click(screen.getByRole('button', { name: 'Fechar captura' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
});
