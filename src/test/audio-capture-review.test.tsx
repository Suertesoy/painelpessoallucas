// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { AudioCaptureReview } from '@/components/audio-capture-review';
import type { AudioTriageProposal } from '@/platform/ai/audio-triage.schema';

/**
 * Cobre a Etapa 4/5: revisão e aprovação individual de cada ação proposta
 * pela IA. Nenhuma ação é executada sem clique explícito; uma única
 * gravação pode gerar múltiplas ações (reunião + tarefa), cada uma aprovada
 * separadamente (exemplo do enunciado: "Marcar reunião com a Priscila e
 * preparar a nova proposta").
 */

const createItem = vi.fn();
const updateItem = vi.fn();
const recordActionOutcome = vi.fn();
const recordCalendarOutcome = vi.fn();

vi.mock('@/providers/repository.provider', () => ({
  useCommands: () => ({ item: { createItem, updateItem } }),
  useRepositories: () => ({
    audioProvenanceRepository: { recordActionOutcome, recordCalendarOutcome },
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

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
  global.fetch = originalFetch;
});

describe('AudioCaptureReview', () => {
  it('cada ação proposta exige aprovação individual antes de ser aplicada', async () => {
    createItem.mockResolvedValue({ id: 'novo-item' });
    render(
      <AudioCaptureReview
        itemId="item-1"
        workspaceId="ws-1"
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
    await waitFor(() => expect(createItem).toHaveBeenCalledTimes(1));
    expect(createItem.mock.calls[0][0]).toMatchObject({ source: 'ai', title: 'Preparar a nova proposta' });
    await waitFor(() => expect(recordActionOutcome).toHaveBeenCalledWith('run-1', 0, 'done'));
  });

  it('nunca cria o evento de calendário sozinha: exige data/hora preenchidas e clique explícito', async () => {
    render(
      <AudioCaptureReview
        itemId="item-1"
        workspaceId="ws-1"
        aiRunId="run-1"
        proposal={MULTI_ACTION_PROPOSAL}
        availableProjects={[]}
        onClose={vi.fn()}
      />
    );

    // Horário ambíguo na fala → startAt/endAt vieram nulos da IA → botão desabilitado.
    const createEventBtn = screen.getByRole('button', { name: /Criar evento no Calendar/ });
    expect(createEventBtn).toHaveProperty('disabled', true);
    expect(screen.getByText(/Data\/horário não identificados com clareza/)).toBeTruthy();

    global.fetch = vi.fn();
    // Preenche início — fim é auto-sugerido (+60min), nunca aplicado silenciosamente
    // no proposal original, só no formulário local e ainda editável.
    fireEvent.change(screen.getByLabelText('Início'), { target: { value: '2026-07-25T10:00' } });
    expect(createEventBtn).toHaveProperty('disabled', false);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('cria o evento só após clique explícito e registra o resultado em auditoria', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'created', googleEventId: 'evt-1', googleCalendarId: 'cal-1' }),
    });
    render(
      <AudioCaptureReview
        itemId="item-1"
        workspaceId="ws-1"
        aiRunId="run-1"
        proposal={MULTI_ACTION_PROPOSAL}
        availableProjects={[]}
        onClose={vi.fn()}
      />
    );

    fireEvent.change(screen.getByLabelText('Início'), { target: { value: '2026-07-25T10:00' } });
    fireEvent.click(screen.getByRole('button', { name: /Criar evento no Calendar/ }));

    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith('/api/audio/confirm-calendar-event', expect.any(Object)));
    const [, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const sentBody = JSON.parse(init.body);
    expect(sentBody.itemId).toBe('item-1');
    expect(sentBody).not.toHaveProperty('attendees');

    await waitFor(() => expect(screen.getByText(/Evento criado no calendário/)).toBeTruthy());
    expect(recordCalendarOutcome).toHaveBeenCalledWith('run-1', 'done');
  });

  it('participantes mencionados aparecem só como sugestão — nenhum convite é enviado', () => {
    render(
      <AudioCaptureReview
        itemId="item-1"
        workspaceId="ws-1"
        aiRunId="run-1"
        proposal={MULTI_ACTION_PROPOSAL}
        availableProjects={[]}
        onClose={vi.fn()}
      />
    );
    const attendeesNotice = screen.getByText(/nenhum convite será enviado/);
    expect(attendeesNotice.textContent).toContain('Priscila');
  });

  it('"Manter só como captura / Fechar" fecha sem aplicar nenhuma ação pendente', () => {
    const onClose = vi.fn();
    render(
      <AudioCaptureReview
        itemId="item-1"
        workspaceId="ws-1"
        aiRunId="run-1"
        proposal={MULTI_ACTION_PROPOSAL}
        availableProjects={[]}
        onClose={onClose}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /Manter só como captura/ }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(createItem).not.toHaveBeenCalled();
  });
});
