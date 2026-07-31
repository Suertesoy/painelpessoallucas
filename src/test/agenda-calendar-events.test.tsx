// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import type { CalendarEventLink } from '@/platform/integrations/calendar-event-link.repository';
import AgendaPage from '@/app/agenda/page';

/**
 * Cobre diretamente o bug confirmado: um evento criado pelo painel (Google
 * Calendar + calendar_event_links) precisa aparecer em /agenda — não só no
 * Google. A página consulta calendarEventQueries.listInRange e renderiza o
 * evento junto dos itens agendados, com o selo "Criado pelo painel" e os
 * atalhos (Google Agenda / Maps / Reunião) quando aplicável.
 */

const fakeRepo = { subscribe: () => () => {} };
const listItems = vi.fn().mockResolvedValue([]);
const listProjects = vi.fn().mockResolvedValue([]);
const listInRange = vi.fn();
const completeItem = vi.fn();

vi.mock('@/providers/repository.provider', () => ({
  useRepositories: () => ({
    itemRepository: fakeRepo,
    projectRepository: fakeRepo,
    dailyPlanRepository: fakeRepo,
    calendarEventLinkRepository: fakeRepo,
    learningContentRepository: fakeRepo,
    studySessionRepository: fakeRepo,
    lessonProgressRepository: fakeRepo,
    shoppingListRepository: fakeRepo,
  }),
  useQueries: () => ({
    item: { listItems },
    project: { listProjects },
    calendarEvent: { listInRange },
  }),
  useCommands: () => ({
    item: { completeItem },
  }),
}));

const TODAY_EVENT: CalendarEventLink = {
  id: 'link-1',
  itemId: 'item-1',
  googleCalendarId: 'cal-1',
  googleEventId: 'evt-1',
  title: 'Reunião com a Priscila',
  startAt: new Date().toISOString(),
  endAt: new Date(Date.now() + 3600000).toISOString(),
  timeZone: 'America/Sao_Paulo',
  location: 'Av. Paulista, 1000 - São Paulo',
  meetingLink: null,
  modality: 'in_person',
  htmlLink: 'https://calendar.google.com/event?eid=abc',
  status: 'confirmed',
  syncStatus: 'synced',
  createdByPanel: true,
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('AgendaPage — eventos de calendário criados pelo painel', () => {
  it('renderiza um evento do calendar_event_links junto dos itens agendados', async () => {
    listItems.mockResolvedValue([]);
    listProjects.mockResolvedValue([]);
    listInRange.mockResolvedValue([TODAY_EVENT]);

    render(<AgendaPage />);

    await waitFor(() => expect(screen.getByText('Reunião com a Priscila')).toBeTruthy());
    expect(screen.getByText('Criado pelo painel')).toBeTruthy();
    expect(screen.getByText('Google Agenda')).toBeTruthy();
    expect(screen.getByText('Maps')).toBeTruthy();
  });

  it('evento online mostra o atalho "Reunião" em vez de "Maps"', async () => {
    listItems.mockResolvedValue([]);
    listProjects.mockResolvedValue([]);
    listInRange.mockResolvedValue([
      { ...TODAY_EVENT, id: 'link-2', modality: 'online', location: null, meetingLink: 'https://meet.google.com/abc' },
    ]);

    render(<AgendaPage />);

    await waitFor(() => expect(screen.getByText('Reunião')).toBeTruthy());
    expect(screen.queryByText('Maps')).toBeNull();
  });

  it('sem eventos nem itens: mostra o estado vazio, não um erro', async () => {
    listItems.mockResolvedValue([]);
    listProjects.mockResolvedValue([]);
    listInRange.mockResolvedValue([]);

    render(<AgendaPage />);

    await waitFor(() => expect(screen.getByText('Nenhum compromisso.')).toBeTruthy());
  });

  it('falha ao carregar eventos de calendário não derruba a página nem os itens', async () => {
    listItems.mockResolvedValue([]);
    listProjects.mockResolvedValue([]);
    listInRange.mockRejectedValue(new Error('rede indisponível'));

    render(<AgendaPage />);

    await waitFor(() => expect(screen.getByText(/Não foi possível carregar os eventos de calendário/)).toBeTruthy());
    // O resto da página (cabeçalho, navegação) continua funcional.
    expect(screen.getByText('Agenda')).toBeTruthy();
  });
});
