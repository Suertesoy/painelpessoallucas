// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { AudioCaptureReview } from '@/components/audio-capture-review';
import type { AudioTriageProposal } from '@/platform/ai/audio-triage.schema';

/**
 * Cobre a revisão e aprovação individual de cada ação proposta pela IA.
 * Nenhuma ação é executada sem clique explícito; uma única gravação pode
 * gerar múltiplas ações (reunião + tarefa), cada uma aprovada separadamente
 * (exemplo do enunciado: "Marcar reunião com a Priscila e preparar a nova
 * proposta").
 *
 * A confirmação de uma ação (create_item/update_capture) passa por
 * /api/ai/confirm-triage-action — uma rota de servidor, não itemCmds direto
 * — porque só no servidor é possível garantir que a proposta ainda
 * corresponde ao texto atual da captura (ver checkTriageFreshness). O evento
 * de calendário segue o mesmo princípio em /api/audio/confirm-calendar-event.
 */

const recordActionOutcome = vi.fn();
const recordCalendarOutcome = vi.fn();

vi.mock('@/providers/repository.provider', () => ({
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

  it('nunca cria o evento de calendário sozinha: exige data/hora preenchidas e clique explícito', async () => {
    render(
      <AudioCaptureReview
        itemId="item-1"
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

  it('cria o evento só após clique explícito, envia o aiRunId e registra o resultado em auditoria', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'created', googleEventId: 'evt-1', googleCalendarId: 'cal-1' }),
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

    fireEvent.change(screen.getByLabelText('Início'), { target: { value: '2026-07-25T10:00' } });
    fireEvent.click(screen.getByRole('button', { name: /Criar evento no Calendar/ }));

    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith('/api/audio/confirm-calendar-event', expect.any(Object)));
    const [, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const sentBody = JSON.parse(init.body);
    expect(sentBody.itemId).toBe('item-1');
    expect(sentBody.aiRunId).toBe('run-1');
    expect(sentBody).not.toHaveProperty('attendees');

    await waitFor(() => expect(screen.getByText(/Evento criado no calendário/)).toBeTruthy());
    expect(recordCalendarOutcome).toHaveBeenCalledWith('run-1', 'done');
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
});
