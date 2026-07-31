// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { AudioCaptureReview } from '@/components/audio-capture-review';
import type { AudioTriageProposal } from '@/platform/ai/audio-triage.schema';

/**
 * Cobre a revisão e aprovação individual de cada ação proposta pela IA, e o
 * formulário completo de evento de calendário: validação de intervalo
 * (nunca chama a rota com dados inválidos), duração padrão/editável,
 * modalidade (presencial/online/indefinido), busca de local, link de
 * reunião, lembretes, e os três desfechos possíveis da criação (sucesso,
 * sucesso parcial — Google criou mas o vínculo interno falhou —, erro).
 */

const recordActionOutcome = vi.fn();
const recordCalendarOutcome = vi.fn();
const notifyChanged = vi.fn();
const ensureDefaultLists = vi.fn().mockResolvedValue([]);

vi.mock('@/providers/repository.provider', () => ({
  useRepositories: () => ({
    audioProvenanceRepository: { recordActionOutcome, recordCalendarOutcome },
    calendarEventLinkRepository: { notifyChanged },
  }),
  useCommands: () => ({
    shopping: { ensureDefaultLists },
  }),
}));

const originalFetch = global.fetch;

const MULTI_ACTION_PROPOSAL: AudioTriageProposal = {
  intent: 'multiple',
  suggestedTitle: 'Marcar reunião com a Priscila e preparar a nova proposta',
  summary: 'Reunião com a Priscila e tarefa de preparo da proposta.',
  projectCandidates: [],
  proposedActions: [
    {
      actionType: 'create_item',
      title: 'Preparar a nova proposta',
      description: null,
      itemType: 'task',
      priority: 'normal',
      projectId: null,
      nextAction: null,
      dueAt: null,
      scheduledAt: null,
      estimatedMinutes: null,
      confidence: 0.8,
    },
  ],
  calendarProposal: {
    title: 'Reunião com a Priscila',
    description: null,
    startAt: null,
    endAt: null,
    timezone: 'America/Sao_Paulo',
    location: null,
    attendees: ['Priscila'],
    confidence: 0.5,
  },
  missingInformation: ['Horário da reunião não foi informado'],
  overallConfidence: 0.7,
};

function successResponse(overrides: Record<string, unknown> = {}) {
  return {
    ok: true,
    json: async () => ({
      status: 'created',
      googleEventId: 'evt-1',
      googleCalendarId: 'cal-1',
      htmlLink: 'https://calendar.google.com/event?eid=abc',
      title: 'Reunião com a Priscila',
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

describe('AudioCaptureReview — ações propostas', () => {
  it('cada ação proposta exige aprovação individual antes de ser aplicada — via rota de servidor', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'created', itemId: 'novo-item' }),
    });
    render(
      <AudioCaptureReview
        itemId="item-1"
        aiRunId="run-1"
        proposal={MULTI_ACTION_PROPOSAL}
        availableProjects={[]}
        onClose={vi.fn()}
      />
    );

    const confirmBtn = screen.getByRole('button', { name: 'Confirmar ações selecionadas' });
    expect(confirmBtn).toHaveProperty('disabled', true);

    fireEvent.click(screen.getByLabelText(/Aprovar ação: Preparar a nova proposta/));
    expect(confirmBtn).toHaveProperty('disabled', false);

    fireEvent.click(confirmBtn);
    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith('/api/ai/confirm-triage-action', expect.any(Object))
    );
    const [, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const sentBody = JSON.parse(init.body);
    expect(sentBody).toMatchObject({
      itemId: 'item-1',
      aiRunId: 'run-1',
      actionType: 'create_item',
      action: expect.objectContaining({ title: 'Preparar a nova proposta' }),
    });
    await waitFor(() => expect(recordActionOutcome).toHaveBeenCalledWith('run-1', 0, 'done'));
    await waitFor(() => expect(screen.getByText('Aplicado')).toBeTruthy());
  });

  it('o servidor rejeitando por proposta desatualizada bloqueia a confirmação e mostra o aviso', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({
        error: 'A transcrição mudou depois desta análise. Analise novamente antes de confirmar as ações.',
        errorCategory: 'stale_analysis',
      }),
    });
    render(
      <AudioCaptureReview
        itemId="item-1"
        aiRunId="run-1"
        proposal={MULTI_ACTION_PROPOSAL}
        availableProjects={[]}
        onClose={vi.fn()}
      />
    );

    fireEvent.click(screen.getByLabelText(/Aprovar ação: Preparar a nova proposta/));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar ações selecionadas' }));

    await waitFor(() =>
      expect(
        screen.getByText('A transcrição mudou depois desta análise. Analise novamente antes de confirmar as ações.')
      ).toBeTruthy()
    );
    expect(recordActionOutcome).toHaveBeenCalledWith('run-1', 0, 'error');
    expect(screen.queryByText('Aplicado')).toBeNull();
  });

  it('"Manter só como captura / Fechar" fecha sem aplicar nenhuma ação pendente', () => {
    const onClose = vi.fn();
    global.fetch = vi.fn();
    render(
      <AudioCaptureReview
        itemId="item-1"
        aiRunId="run-1"
        proposal={MULTI_ACTION_PROPOSAL}
        availableProjects={[]}
        onClose={onClose}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /Manter só como captura/ }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('participantes mencionados aparecem só como sugestão — nenhum convite é enviado', () => {
    render(
      <AudioCaptureReview
        itemId="item-1"
        aiRunId="run-1"
        proposal={MULTI_ACTION_PROPOSAL}
        availableProjects={[]}
        onClose={vi.fn()}
      />
    );
    const attendeesNotice = screen.getByText(/nenhum convite será enviado/);
    expect(attendeesNotice.textContent).toContain('Priscila');
  });
});

describe('AudioCaptureReview — validação de intervalo do evento', () => {
  it('nunca cria o evento sozinha: exige data/hora preenchidas e clique explícito', () => {
    render(
      <AudioCaptureReview
        itemId="item-1"
        aiRunId="run-1"
        proposal={MULTI_ACTION_PROPOSAL}
        availableProjects={[]}
        onClose={vi.fn()}
      />
    );

    const createEventBtn = screen.getByRole('button', { name: /Criar evento no Calendar/ });
    expect(createEventBtn).toHaveProperty('disabled', true);
    expect(screen.getByText(/Data\/horário não identificados com clareza/)).toBeTruthy();

    global.fetch = vi.fn();
    // Preenche início — fim é auto-sugerido (+60min): duração padrão, nunca
    // aplicada silenciosamente sem aparecer editável no formulário.
    fireEvent.change(screen.getByLabelText('Início'), { target: { value: '2026-08-05T10:00' } });
    expect(createEventBtn).toHaveProperty('disabled', false);
    expect((screen.getByLabelText('Duração em minutos') as HTMLInputElement).value).toBe('60');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('término anterior ao início: mostra "Não dá para terminar antes de começar." e nunca chama a rota', () => {
    render(
      <AudioCaptureReview
        itemId="item-1"
        aiRunId="run-1"
        proposal={MULTI_ACTION_PROPOSAL}
        availableProjects={[]}
        onClose={vi.fn()}
      />
    );
    global.fetch = vi.fn();

    fireEvent.change(screen.getByLabelText('Início'), { target: { value: '2026-08-05T10:00' } });
    fireEvent.change(screen.getByLabelText('Fim'), { target: { value: '2026-08-05T09:00' } });

    expect(screen.getByText('Não dá para terminar antes de começar.')).toBeTruthy();
    const createEventBtn = screen.getByRole('button', { name: /Criar evento no Calendar/ });
    expect(createEventBtn).toHaveProperty('disabled', true);

    fireEvent.click(createEventBtn);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('término igual ao início também é inválido', () => {
    render(
      <AudioCaptureReview
        itemId="item-1"
        aiRunId="run-1"
        proposal={MULTI_ACTION_PROPOSAL}
        availableProjects={[]}
        onClose={vi.fn()}
      />
    );
    fireEvent.change(screen.getByLabelText('Início'), { target: { value: '2026-08-05T10:00' } });
    fireEvent.change(screen.getByLabelText('Fim'), { target: { value: '2026-08-05T10:00' } });
    expect(screen.getByText('Não dá para terminar antes de começar.')).toBeTruthy();
  });

  it('alterar o início preserva uma duração manual válida já definida', () => {
    render(
      <AudioCaptureReview
        itemId="item-1"
        aiRunId="run-1"
        proposal={MULTI_ACTION_PROPOSAL}
        availableProjects={[]}
        onClose={vi.fn()}
      />
    );
    fireEvent.change(screen.getByLabelText('Início'), { target: { value: '2026-08-05T10:00' } });
    // Usuário define manualmente 90min de duração.
    fireEvent.change(screen.getByLabelText('Fim'), { target: { value: '2026-08-05T11:30' } });
    expect((screen.getByLabelText('Duração em minutos') as HTMLInputElement).value).toBe('90');

    fireEvent.change(screen.getByLabelText('Início'), { target: { value: '2026-08-05T14:00' } });
    expect((screen.getByLabelText('Fim') as HTMLInputElement).value).toBe('2026-08-05T15:30');
    expect((screen.getByLabelText('Duração em minutos') as HTMLInputElement).value).toBe('90');
  });

  it('evento com duração explícita na proposta da IA preserva a duração (não força 60min)', () => {
    const proposalWithDuration: AudioTriageProposal = {
      ...MULTI_ACTION_PROPOSAL,
      calendarProposal: {
        ...MULTI_ACTION_PROPOSAL.calendarProposal!,
        startAt: '2026-08-05T14:00:00-03:00',
        endAt: '2026-08-05T16:00:00-03:00',
      },
    };
    render(
      <AudioCaptureReview
        itemId="item-1"
        aiRunId="run-1"
        proposal={proposalWithDuration}
        availableProjects={[]}
        onClose={vi.fn()}
      />
    );
    expect((screen.getByLabelText('Duração em minutos') as HTMLInputElement).value).toBe('120');
  });
});

describe('AudioCaptureReview — modalidade, local e link', () => {
  it('permite alternar entre presencial, online e local ainda não definido', () => {
    render(
      <AudioCaptureReview
        itemId="item-1"
        aiRunId="run-1"
        proposal={MULTI_ACTION_PROPOSAL}
        availableProjects={[]}
        onClose={vi.fn()}
      />
    );

    expect(screen.queryByLabelText('Local do evento')).toBeNull();
    expect(screen.queryByLabelText('Link da reunião')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Presencial' }));
    expect(screen.getByLabelText('Local do evento')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Online' }));
    expect(screen.queryByLabelText('Local do evento')).toBeNull();
    expect(screen.getByLabelText('Link da reunião')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Local ainda não definido' }));
    expect(screen.queryByLabelText('Local do evento')).toBeNull();
    expect(screen.queryByLabelText('Link da reunião')).toBeNull();
  });

  it('presencial: busca sugestões reais e preserva nome/endereço/identificador ao selecionar', async () => {
    global.fetch = vi.fn((url: string) => {
      if (url.includes('/api/integrations/places/search')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ suggestions: [{ placeId: 'place-123', text: 'Escritório, Av. Paulista 1000' }] }),
        });
      }
      if (url.includes('/api/integrations/places/details')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            placeId: 'place-123',
            name: 'Escritório',
            formattedAddress: 'Av. Paulista, 1000 - São Paulo',
            lat: -23.56,
            lng: -46.65,
          }),
        });
      }
      if (url.includes('/api/audio/confirm-calendar-event')) {
        return Promise.resolve(
          successResponse({ modality: 'in_person', location: 'Av. Paulista, 1000 - São Paulo' })
        );
      }
      return Promise.resolve({ ok: false, json: async () => ({}) });
    }) as unknown as typeof fetch;

    render(
      <AudioCaptureReview
        itemId="item-1"
        aiRunId="run-1"
        proposal={MULTI_ACTION_PROPOSAL}
        availableProjects={[]}
        onClose={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Presencial' }));
    fireEvent.change(screen.getByLabelText('Local do evento'), { target: { value: 'Escritório' } });

    await waitFor(() => expect(screen.getByText('Escritório, Av. Paulista 1000')).toBeTruthy());
    fireEvent.click(screen.getByText('Escritório, Av. Paulista 1000'));

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
    expect(sentBody.modality).toBe('in_person');
    expect(sentBody.location).toBe('Av. Paulista, 1000 - São Paulo');
    expect(sentBody.locationPlaceId).toBe('place-123');
    expect(sentBody.locationLat).toBe(-23.56);
    expect(sentBody.locationLng).toBe(-46.65);
  });

  it('texto digitado sem selecionar sugestão é sinalizado como não validado', () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ suggestions: [] }) });
    render(
      <AudioCaptureReview
        itemId="item-1"
        aiRunId="run-1"
        proposal={MULTI_ACTION_PROPOSAL}
        availableProjects={[]}
        onClose={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Presencial' }));
    fireEvent.change(screen.getByLabelText('Local do evento'), { target: { value: 'Rua sem confirmar, 123' } });
    expect(screen.getByText(/Texto digitado sem selecionar uma sugestão/)).toBeTruthy();
  });

  it('online: aceita link https válido e envia no payload', async () => {
    global.fetch = vi.fn((url: string) => {
      if (url.includes('/api/audio/confirm-calendar-event')) {
        return Promise.resolve(
          successResponse({ modality: 'online', meetingLink: 'https://meet.google.com/abc-defg-hij' })
        );
      }
      return Promise.resolve({ ok: false, json: async () => ({}) });
    }) as unknown as typeof fetch;

    render(
      <AudioCaptureReview
        itemId="item-1"
        aiRunId="run-1"
        proposal={MULTI_ACTION_PROPOSAL}
        availableProjects={[]}
        onClose={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Online' }));
    fireEvent.change(screen.getByLabelText('Início'), { target: { value: '2026-08-05T10:00' } });
    fireEvent.change(screen.getByLabelText('Link da reunião'), { target: { value: 'https://meet.google.com/abc-defg-hij' } });
    fireEvent.click(screen.getByRole('button', { name: /Criar evento no Calendar/ }));

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith('/api/audio/confirm-calendar-event', expect.any(Object))
    );
    const call = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.find((c) =>
      String(c[0]).includes('/api/audio/confirm-calendar-event')
    )!;
    const sentBody = JSON.parse(call[1].body);
    expect(sentBody.meetingLink).toBe('https://meet.google.com/abc-defg-hij');

    await waitFor(() => expect(screen.getByText('Abrir reunião')).toBeTruthy());
  });

  it('online: link inválido é rejeitado antes da criação — botão desabilitado, rota nunca chamada', () => {
    global.fetch = vi.fn();
    render(
      <AudioCaptureReview
        itemId="item-1"
        aiRunId="run-1"
        proposal={MULTI_ACTION_PROPOSAL}
        availableProjects={[]}
        onClose={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Online' }));
    fireEvent.change(screen.getByLabelText('Início'), { target: { value: '2026-08-05T10:00' } });
    fireEvent.change(screen.getByLabelText('Link da reunião'), { target: { value: 'não é um link' } });

    expect(screen.getByText(/precisa ser um endereço https/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /Criar evento no Calendar/ })).toHaveProperty('disabled', true);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

describe('AudioCaptureReview — lembretes', () => {
  it('lembretes padrão (1 dia e 1 hora) vêm marcados e visíveis antes da confirmação', () => {
    render(
      <AudioCaptureReview
        itemId="item-1"
        aiRunId="run-1"
        proposal={MULTI_ACTION_PROPOSAL}
        availableProjects={[]}
        onClose={vi.fn()}
      />
    );
    expect((screen.getByLabelText('1 dia antes') as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText('1 hora antes') as HTMLInputElement).checked).toBe(true);
  });

  it('evento em menos de 24h: avisa que o lembrete de 1 dia já passou e preserva o de 1h', () => {
    render(
      <AudioCaptureReview
        itemId="item-1"
        aiRunId="run-1"
        proposal={MULTI_ACTION_PROPOSAL}
        availableProjects={[]}
        onClose={vi.fn()}
      />
    );
    const in90min = new Date(Date.now() + 90 * 60000);
    const local = new Date(in90min.getTime() - in90min.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    fireEvent.change(screen.getByLabelText('Início'), { target: { value: local } });

    expect(
      screen.getByText('O horário do primeiro aviso já passou. O aviso de uma hora continua ativo.')
    ).toBeTruthy();
  });
});

describe('AudioCaptureReview — criação e resultado', () => {
  it('cria o evento só após clique explícito, envia o aiRunId e mostra as ações de sucesso', async () => {
    global.fetch = vi.fn().mockResolvedValue(successResponse());
    render(
      <AudioCaptureReview
        itemId="item-1"
        aiRunId="run-1"
        proposal={MULTI_ACTION_PROPOSAL}
        availableProjects={[]}
        onClose={vi.fn()}
      />
    );

    fireEvent.change(screen.getByLabelText('Início'), { target: { value: '2026-08-05T10:00' } });
    fireEvent.click(screen.getByRole('button', { name: /Criar evento no Calendar/ }));

    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith('/api/audio/confirm-calendar-event', expect.any(Object)));
    const [, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const sentBody = JSON.parse(init.body);
    expect(sentBody.itemId).toBe('item-1');
    expect(sentBody.aiRunId).toBe('run-1');
    expect(sentBody.reminderMinutes).toEqual([1440, 60]);
    expect(sentBody).not.toHaveProperty('attendees');

    await waitFor(() => expect(screen.getByText(/Evento criado no calendário/)).toBeTruthy());
    expect(recordCalendarOutcome).toHaveBeenCalledWith('run-1', 'done');
    expect(notifyChanged).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Abrir no Google Agenda')).toBeTruthy();
  });

  it('sucesso parcial (Google criou, vínculo interno falhou): não trata como falha da criação e oferece retry', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: 'created_link_pending',
          message: 'O evento foi criado no Google Agenda, mas não foi possível atualizar a agenda do painel agora.',
          googleEventId: 'evt-1',
          googleCalendarId: 'cal-1',
          htmlLink: null,
          title: 'Reunião com a Priscila',
          startAt: '2026-08-05T13:00:00.000Z',
          endAt: '2026-08-05T14:00:00.000Z',
          timeZone: 'America/Sao_Paulo',
          location: null,
          meetingLink: null,
          modality: 'undetermined',
          reminders: [1440, 60],
        }),
      })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ status: 'linked' }) });

    render(
      <AudioCaptureReview
        itemId="item-1"
        aiRunId="run-1"
        proposal={MULTI_ACTION_PROPOSAL}
        availableProjects={[]}
        onClose={vi.fn()}
      />
    );

    fireEvent.change(screen.getByLabelText('Início'), { target: { value: '2026-08-05T10:00' } });
    fireEvent.click(screen.getByRole('button', { name: /Criar evento no Calendar/ }));

    await waitFor(() =>
      expect(
        screen.getByText('O evento foi criado no Google Agenda, mas não foi possível atualizar a agenda do painel agora.')
      ).toBeTruthy()
    );
    expect(screen.queryByText(/falhou ao criar/i)).toBeNull();
    expect(notifyChanged).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /Tentar atualizar a agenda/ }));

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith('/api/audio/link-calendar-event', expect.any(Object))
    );
    const [, retryInit] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[1];
    const retryBody = JSON.parse(retryInit.body);
    expect(retryBody.googleEventId).toBe('evt-1');

    await waitFor(() => expect(screen.getByText(/Evento criado no calendário/)).toBeTruthy());
    expect(notifyChanged).toHaveBeenCalledTimes(1);
    // O retry nunca chama a rota de criação de novo — nunca duplica o evento externo.
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('erro do servidor não vaza mensagem técnica (sem "HTTP", sem status numérico bruto)', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({
        error: 'Não foi possível criar o evento agora. Sua captura continua salva — tente novamente.',
        errorCategory: 'calendar_error',
      }),
    });
    render(
      <AudioCaptureReview
        itemId="item-1"
        aiRunId="run-1"
        proposal={MULTI_ACTION_PROPOSAL}
        availableProjects={[]}
        onClose={vi.fn()}
      />
    );

    fireEvent.change(screen.getByLabelText('Início'), { target: { value: '2026-08-05T10:00' } });
    fireEvent.click(screen.getByRole('button', { name: /Criar evento no Calendar/ }));

    await waitFor(() =>
      expect(screen.getByText('Não foi possível criar o evento agora. Sua captura continua salva — tente novamente.')).toBeTruthy()
    );
    expect(screen.queryByText(/HTTP/)).toBeNull();
    expect(recordCalendarOutcome).toHaveBeenCalledWith('run-1', 'error');
  });
});
