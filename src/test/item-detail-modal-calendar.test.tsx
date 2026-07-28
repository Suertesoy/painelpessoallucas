// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { ItemDetailModal } from '@/components/item-detail-modal';
import { openItemDetail } from '@/lib/ui-events';
import type { Item } from '@/modules/items/domain/item.schema';
import type { Project } from '@/modules/projects/domain/project.schema';

/**
 * Problema confirmado em produção: só itens com source === 'audio_capture'
 * tinham qualquer caminho de UI para criar/ver um evento de calendário. Um
 * item comum (captura por texto, criação manual) não tinha "Adicionar evento
 * no Calendar" em lugar nenhum. Este teste cobre o item comum (não-áudio).
 */

const TEXT_ITEM: Item = {
  id: 'item-texto-1',
  workspaceId: 'ws-1',
  title: 'Levar carro na revisão',
  content: undefined,
  type: 'task',
  status: 'organized',
  priority: 'normal',
  source: 'quick_capture',
  createdAt: '2026-07-20T10:00:00.000Z',
  updatedAt: '2026-07-20T10:00:00.000Z',
};

const PROJECTS: Project[] = [];

const getItemById = vi.fn();
const listProjects = vi.fn();
const findMigrationCompletedAt = vi.fn();
const findByEntityId = vi.fn();
const findLatestTriageRun = vi.fn();
const findCalendarEventLink = vi.fn();
const notifyChanged = vi.fn();

const fakeRepo = { subscribe: () => () => {} };

vi.mock('@/providers/repository.provider', () => ({
  useRepositories: () => ({
    itemRepository: fakeRepo,
    projectRepository: fakeRepo,
    dailyPlanRepository: fakeRepo,
    eventRepository: { findMigrationCompletedAt, findByEntityId },
    audioProvenanceRepository: { findLatestTriageRun, findCalendarEventLink },
    calendarEventLinkRepository: { notifyChanged },
  }),
  useQueries: () => ({
    item: { getItemById },
    project: { listProjects },
  }),
  useCommands: () => ({
    item: { updateItem: vi.fn(), completeItem: vi.fn(), archiveItem: vi.fn(), reopenItem: vi.fn(), unarchiveItem: vi.fn() },
  }),
}));

const originalFetch = global.fetch;

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  global.fetch = originalFetch;
});

async function openModal() {
  getItemById.mockResolvedValue(TEXT_ITEM);
  listProjects.mockResolvedValue(PROJECTS);
  findMigrationCompletedAt.mockResolvedValue(null);
  findCalendarEventLink.mockResolvedValue(null);

  render(<ItemDetailModal />);
  openItemDetail(TEXT_ITEM.id);
  await waitFor(() => expect(screen.getByLabelText('Título')).toBeTruthy());
}

describe('ItemDetailModal — evento de calendário para item comum (não-áudio)', () => {
  it('mostra "Adicionar evento no Calendar" para um item de captura por texto', async () => {
    await openModal();
    expect(screen.getByText('Calendário')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Adicionar evento no Calendar/ })).toBeTruthy();
    // Painel de proveniência de áudio não aparece para item de texto.
    expect(screen.queryByText('Captura por áudio')).toBeNull();
  });

  it('cria o evento a partir de um item comum sem aiRunId e sem passar pelo fluxo de áudio', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        status: 'created',
        googleEventId: 'evt-manual-1',
        googleCalendarId: 'cal-1',
        htmlLink: 'https://calendar.google.com/event?eid=y',
        title: 'Levar carro na revisão',
        startAt: '2026-08-06T13:00:00.000Z',
        endAt: '2026-08-06T14:00:00.000Z',
        timeZone: 'America/Sao_Paulo',
        location: null,
        meetingLink: null,
        modality: 'undetermined',
        reminders: [1440, 60],
      }),
    });

    await openModal();
    fireEvent.click(screen.getByRole('button', { name: /Adicionar evento no Calendar/ }));

    expect(screen.getByLabelText('Título do evento')).toHaveProperty('value', 'Levar carro na revisão');
    fireEvent.change(screen.getByLabelText('Início'), { target: { value: '2026-08-06T10:00' } });
    fireEvent.click(screen.getByRole('button', { name: /Criar evento no Calendar/ }));

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith('/api/audio/confirm-calendar-event', expect.any(Object))
    );
    const [, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const sentBody = JSON.parse(init.body);
    expect(sentBody.itemId).toBe(TEXT_ITEM.id);
    expect(sentBody).not.toHaveProperty('aiRunId');

    await waitFor(() => expect(screen.getByText(/Evento criado no calendário/)).toBeTruthy());
    expect(notifyChanged).toHaveBeenCalledTimes(1);
  });

  it('quando já existe um vínculo, mostra o link do Google direto (sem oferecer criar de novo)', async () => {
    findCalendarEventLink.mockResolvedValue({
      googleCalendarId: 'cal-1',
      googleEventId: 'evt-existente',
      syncStatus: 'synced',
    });
    getItemById.mockResolvedValue(TEXT_ITEM);
    listProjects.mockResolvedValue(PROJECTS);
    findMigrationCompletedAt.mockResolvedValue(null);

    render(<ItemDetailModal />);
    openItemDetail(TEXT_ITEM.id);
    await waitFor(() => expect(screen.getByText('Ver evento no Google Calendar')).toBeTruthy());

    expect(screen.queryByRole('button', { name: /Adicionar evento no Calendar/ })).toBeNull();
  });
});
