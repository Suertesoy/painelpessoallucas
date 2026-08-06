// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { ItemDetailModal } from '@/components/item-detail-modal';
import { openItemDetail } from '@/lib/ui-events';
import type { Item } from '@/modules/items/domain/item.schema';
import type { Project } from '@/modules/projects/domain/project.schema';

/**
 * Cobre a experiência completa de abrir/editar/gerenciar um item, incluindo
 * o cenário real investigado ("baile da brum": item migrado da Fase 1, sem
 * projeto, aparecendo em Próximas Ações sem forma de gerenciar). Nenhuma
 * chamada real ao Supabase — Commands/Queries/Repositories mockados.
 */

const MIGRATED_ITEM: Item = {
  id: 'item-1',
  workspaceId: 'ws-1',
  title: 'baile da brum',
  content: undefined,
  type: 'task',
  status: 'organized',
  priority: 'normal',
  source: 'quick_capture',
  createdAt: '2026-07-17T00:44:32.379Z',
  updatedAt: '2026-07-22T20:18:23.039Z',
};

const PROJECTS: Project[] = [
  {
    id: 'proj-1',
    workspaceId: 'ws-1',
    name: 'Sartec Digital',
    status: 'active',
    attentionLevel: 'normal',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
];

const getItemById = vi.fn();
const listProjects = vi.fn();
const findMigrationCompletedAt = vi.fn();
const findByEntityId = vi.fn();
const findLatestTriageRun = vi.fn();
const findCalendarEventLink = vi.fn();
const updateItem = vi.fn();
const completeItem = vi.fn();
const archiveItem = vi.fn();
const reopenItem = vi.fn();
const unarchiveItem = vi.fn();
const getPendingPushReminderForItem = vi.fn();
const setTaskReminder = vi.fn();
const cancelReminder = vi.fn();

const fakeRepo = { subscribe: () => () => {} };

// Simula o canal realtime compartilhado (ChangeNotifier): dispara em QUALQUER
// mudança de tabela, inclusive ai_runs de uma análise concluída em segundo
// plano — os testes usam `triggerRealtimeChange()` para simular isso.
let realtimeListeners: Array<() => void> = [];
const fakeChangeNotifier = {
  subscribe: (fn: () => void) => {
    realtimeListeners.push(fn);
    return () => {
      realtimeListeners = realtimeListeners.filter((l) => l !== fn);
    };
  },
};
function triggerRealtimeChange() {
  realtimeListeners.forEach((l) => l());
}

vi.mock('@/providers/repository.provider', () => ({
  useRepositories: () => ({
    itemRepository: fakeRepo,
    projectRepository: fakeRepo,
    dailyPlanRepository: fakeRepo,
    eventRepository: { findMigrationCompletedAt, findByEntityId },
    audioProvenanceRepository: { findLatestTriageRun, findCalendarEventLink },
    changeNotifier: fakeChangeNotifier,
  }),
  useQueries: () => ({
    item: { getItemById },
    project: { listProjects },
    reminder: { getPendingPushReminderForItem },
  }),
  useCommands: () => ({
    item: { updateItem, completeItem, archiveItem, reopenItem, unarchiveItem },
    reminder: { setTaskReminder, cancelReminder },
  }),
}));

// AudioCaptureReview já é testado isoladamente (audio-capture-review.test.tsx)
// — aqui só precisamos saber que o ItemDetailModal a abre com os dados certos.
vi.mock('@/components/audio-capture-review', () => ({
  AudioCaptureReview: (props: { itemId: string; aiRunId: string }) => (
    <div data-testid="review-stub">
      revisão para item {props.itemId} / run {props.aiRunId}
    </div>
  ),
}));

async function openModalWith(item: Item, migrationCompletedAt: string | null = null) {
  getItemById.mockResolvedValue(item);
  listProjects.mockResolvedValue(PROJECTS);
  findMigrationCompletedAt.mockResolvedValue(migrationCompletedAt);

  render(<ItemDetailModal />);
  openItemDetail(item.id);

  await waitFor(() => expect(screen.getByLabelText('Título')).toBeTruthy());
}

const originalFetch = global.fetch;

beforeEach(() => {
  vi.clearAllMocks();
  realtimeListeners = [];
  // Padrões de proveniência de áudio (sem histórico/triagem/evento) — testes
  // específicos de captura por áudio sobrescrevem antes de chamar openModalWith.
  findByEntityId.mockResolvedValue([]);
  findLatestTriageRun.mockResolvedValue(null);
  findCalendarEventLink.mockResolvedValue(null);
  getPendingPushReminderForItem.mockResolvedValue(null);
});

afterEach(() => {
  cleanup();
  global.fetch = originalFetch;
});

describe('ItemDetailModal', () => {
  it('abre e carrega o item ao receber o evento disparado por qualquer tela (Hoje, Entrada, Agenda, Ideias, Projeto, Busca)', async () => {
    await openModalWith(MIGRATED_ITEM);
    expect(getItemById).toHaveBeenCalledWith('item-1');
    expect(screen.getByLabelText('Título')).toHaveProperty('value', 'baile da brum');
  });

  it('exibe a origem migrada corretamente quando o item é anterior à migração', async () => {
    await openModalWith(MIGRATED_ITEM, '2026-07-22T20:18:23.602Z');
    await waitFor(() => expect(screen.getByText(/Fase 1/)).toBeTruthy());
  });

  it('exibe a origem manual corretamente para um item capturado depois da migração', async () => {
    const manualItem: Item = { ...MIGRATED_ITEM, createdAt: '2026-07-23T09:00:00.000Z', source: 'manual' };
    await openModalWith(manualItem, '2026-07-22T20:18:23.602Z');
    await waitFor(() => expect(screen.getByText('Capturado manualmente')).toBeTruthy());
  });

  it('exibe a origem de plano e recorrência corretamente', async () => {
    const planItem: Item = { ...MIGRATED_ITEM, recurrenceRuleId: 'rule-1', executionPlanId: 'plan-1' };
    await openModalWith(planItem);
    await waitFor(() => expect(screen.getByText(/recorrência/)).toBeTruthy());
  });

  it('edita título e descrição e salva usando updateItem (não grava direto no Supabase)', async () => {
    updateItem.mockResolvedValue({ ...MIGRATED_ITEM, title: 'Baile da Brum revisado', content: 'Detalhes' });
    await openModalWith(MIGRATED_ITEM);

    fireEvent.change(screen.getByLabelText('Título'), { target: { value: 'Baile da Brum revisado' } });
    fireEvent.change(screen.getByLabelText('Descrição'), { target: { value: 'Detalhes' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }));

    await waitFor(() => expect(updateItem).toHaveBeenCalledWith('item-1', expect.objectContaining({
      title: 'Baile da Brum revisado',
      content: 'Detalhes',
    })));
    await waitFor(() => expect(screen.getByText('Salvo.')).toBeTruthy());
  });

  it('associa a um projeto', async () => {
    updateItem.mockResolvedValue({ ...MIGRATED_ITEM, projectId: 'proj-1' });
    await openModalWith(MIGRATED_ITEM);

    fireEvent.change(screen.getByLabelText('Projeto'), { target: { value: 'proj-1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }));

    await waitFor(() => expect(updateItem).toHaveBeenCalledWith('item-1', expect.objectContaining({ projectId: 'proj-1' })));
  });

  it('select de projeto só oferece projetos ativos para nova atribuição, mas preserva um projeto arquivado já vinculado', async () => {
    const archivedProject: Project = {
      id: 'proj-archived',
      workspaceId: 'ws-1',
      name: 'Teste nuvem',
      status: 'archived',
      attentionLevel: 'normal',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    const itemWithArchivedProject: Item = { ...MIGRATED_ITEM, projectId: archivedProject.id };
    getItemById.mockResolvedValue(itemWithArchivedProject);
    listProjects.mockResolvedValue([...PROJECTS, archivedProject]);

    render(<ItemDetailModal />);
    openItemDetail(itemWithArchivedProject.id);
    await waitFor(() => expect(screen.getByLabelText('Título')).toBeTruthy());

    const select = screen.getByLabelText('Projeto') as HTMLSelectElement;
    expect(select.value).toBe(archivedProject.id);
    expect(screen.getByText(/Teste nuvem \(já atribuído — não ativo\)/)).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Sartec Digital' })).toBeTruthy();
  });

  it('conclui a tarefa', async () => {
    completeItem.mockResolvedValue({ ...MIGRATED_ITEM, status: 'completed', completedAt: '2026-07-23T10:00:00.000Z' });
    await openModalWith(MIGRATED_ITEM);

    fireEvent.click(screen.getByRole('button', { name: 'Concluir' }));

    await waitFor(() => expect(completeItem).toHaveBeenCalledWith('item-1'));
    await waitFor(() => expect(screen.getByText('Status: Concluído')).toBeTruthy());
  });

  it('reabre uma tarefa concluída', async () => {
    const completed: Item = { ...MIGRATED_ITEM, status: 'completed', completedAt: '2026-07-23T10:00:00.000Z' };
    reopenItem.mockResolvedValue({ ...MIGRATED_ITEM, status: 'organized', completedAt: undefined });
    await openModalWith(completed);

    fireEvent.click(screen.getByRole('button', { name: 'Reabrir' }));

    await waitFor(() => expect(reopenItem).toHaveBeenCalledWith('item-1'));
    await waitFor(() => expect(screen.getByText('Status: Organizado')).toBeTruthy());
  });

  it('arquiva a tarefa', async () => {
    archiveItem.mockResolvedValue({ ...MIGRATED_ITEM, status: 'archived', archivedAt: '2026-07-23T10:00:00.000Z' });
    await openModalWith(MIGRATED_ITEM);

    fireEvent.click(screen.getByRole('button', { name: 'Arquivar' }));

    await waitFor(() => expect(archiveItem).toHaveBeenCalledWith('item-1'));
    await waitFor(() => expect(screen.getByText('Status: Arquivado')).toBeTruthy());
  });

  it('desarquiva a tarefa', async () => {
    const archived: Item = { ...MIGRATED_ITEM, status: 'archived', archivedAt: '2026-07-23T10:00:00.000Z' };
    unarchiveItem.mockResolvedValue({ ...MIGRATED_ITEM, status: 'organized', archivedAt: undefined });
    await openModalWith(archived);

    fireEvent.click(screen.getByRole('button', { name: 'Desarquivar' }));

    await waitFor(() => expect(unarchiveItem).toHaveBeenCalledWith('item-1'));
    await waitFor(() => expect(screen.getByText('Status: Organizado')).toBeTruthy());
  });

  it('agenda e remove o agendamento', async () => {
    updateItem.mockResolvedValue({ ...MIGRATED_ITEM, scheduledAt: '2026-08-01T10:00:00.000Z' });
    await openModalWith(MIGRATED_ITEM);

    fireEvent.change(screen.getByLabelText('Agendamento'), { target: { value: '2026-08-01T10:00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }));
    await waitFor(() => expect(updateItem).toHaveBeenCalledWith('item-1', expect.objectContaining({
      scheduledAt: expect.any(String),
    })));

    updateItem.mockResolvedValue({ ...MIGRATED_ITEM, scheduledAt: undefined });
    await waitFor(() => expect(screen.getByText('Remover agendamento')).toBeTruthy());
    fireEvent.click(screen.getByText('Remover agendamento'));

    await waitFor(() => expect(updateItem).toHaveBeenCalledWith('item-1', { scheduledAt: undefined }));
  });

  it('define e remove o prazo', async () => {
    updateItem.mockResolvedValue({ ...MIGRATED_ITEM, dueAt: '2026-08-05T00:00:00.000Z' });
    await openModalWith(MIGRATED_ITEM);

    fireEvent.change(screen.getByLabelText('Prazo'), { target: { value: '2026-08-05T00:00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }));
    await waitFor(() => expect(updateItem).toHaveBeenCalledWith('item-1', expect.objectContaining({
      dueAt: expect.any(String),
    })));

    updateItem.mockResolvedValue({ ...MIGRATED_ITEM, dueAt: undefined });
    await waitFor(() => expect(screen.getByText('Remover prazo')).toBeTruthy());
    fireEvent.click(screen.getByText('Remover prazo'));

    await waitFor(() => expect(updateItem).toHaveBeenCalledWith('item-1', { dueAt: undefined }));
  });

  it('erro remoto ao salvar não é tratado como sucesso', async () => {
    updateItem.mockRejectedValue(new Error('permission denied'));
    await openModalWith(MIGRATED_ITEM);

    fireEvent.change(screen.getByLabelText('Título'), { target: { value: 'Novo título' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }));

    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
    expect(screen.queryByText('Salvo.')).toBeNull();
  });

  it('erro remoto em uma ação de status é exibido, não silenciado', async () => {
    completeItem.mockRejectedValue(new Error('network error'));
    await openModalWith(MIGRATED_ITEM);

    fireEvent.click(screen.getByRole('button', { name: 'Concluir' }));

    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
    expect(screen.getByText('Status: Organizado')).toBeTruthy();
  });

  it('estrutura responsiva: ocupa a tela cheia no celular (h-dvh) e vira um cartão no desktop (sm:rounded-lg)', async () => {
    await openModalWith(MIGRATED_ITEM);
    const dialog = screen.getByRole('dialog');
    const panel = dialog.firstElementChild as HTMLElement;
    expect(panel.className).toContain('h-dvh');
    expect(panel.className).toContain('sm:rounded-lg');
  });
});

const AUDIO_ITEM: Item = {
  id: 'item-audio-1',
  workspaceId: 'ws-1',
  title: 'Ligar para o cliente amanhã',
  content: 'Preciso ligar para o cliente amanhã de manhã.',
  type: 'note',
  status: 'inbox',
  priority: 'normal',
  source: 'audio_capture',
  audioDurationSeconds: 42,
  createdAt: '2026-07-24T09:00:00.000Z',
  updatedAt: '2026-07-24T09:00:00.000Z',
};

describe('ItemDetailModal — proveniência de captura por áudio (Etapa 7)', () => {
  it('mostra a origem "Captura por áudio" e a duração da gravação', async () => {
    findByEntityId.mockResolvedValue([]);
    await openModalWith(AUDIO_ITEM);

    await waitFor(() => expect(screen.getAllByText('Captura por áudio')).toHaveLength(2));
    expect(findLatestTriageRun).toHaveBeenCalledWith('item-audio-1');
    expect(findCalendarEventLink).toHaveBeenCalledWith('item-audio-1');
    await waitFor(() => expect(screen.getByText(/0:42/)).toBeTruthy());
  });

  it('mostra a transcrição original e, quando o conteúdo foi editado, também a versão atual', async () => {
    findByEntityId.mockResolvedValue([
      {
        id: 'ev-1',
        type: 'item.created',
        entityId: 'item-audio-1',
        workspaceId: 'ws-1',
        source: 'audio_capture',
        payload: { content: 'transcrição original bruta' },
        createdAt: '2026-07-24T09:00:00.000Z',
      },
    ]);
    const edited: Item = { ...AUDIO_ITEM, content: 'Preciso ligar para o cliente amanhã de manhã.' };
    await openModalWith(edited);

    await waitFor(() => expect(screen.getByText('transcrição original bruta')).toBeTruthy());
    expect(screen.getByText('Transcrição editada (conteúdo atual)')).toBeTruthy();
    // O texto também aparece na textarea "Descrição" (mesmo conteúdo, editável) —
    // aqui só confirmamos que o parágrafo somente-leitura da proveniência existe.
    expect(screen.getByText('Preciso ligar para o cliente amanhã de manhã.', { selector: 'p' })).toBeTruthy();
  });

  it('não mostra "transcrição editada" quando o conteúdo nunca mudou', async () => {
    findByEntityId.mockResolvedValue([
      {
        id: 'ev-1',
        type: 'item.created',
        entityId: 'item-audio-1',
        workspaceId: 'ws-1',
        source: 'audio_capture',
        payload: { content: AUDIO_ITEM.content },
        createdAt: '2026-07-24T09:00:00.000Z',
      },
    ]);
    await openModalWith(AUDIO_ITEM);

    await waitFor(() => expect(screen.getByText(AUDIO_ITEM.content!, { selector: 'p' })).toBeTruthy());
    expect(screen.queryByText('Transcrição editada (conteúdo atual)')).toBeNull();
  });

  it('mostra o resultado da triagem por IA: modelo, confiança e quais ações foram aprovadas/rejeitadas', async () => {
    findByEntityId.mockResolvedValue([]);
    findLatestTriageRun.mockResolvedValue({
      id: 'run-1',
      model: 'gpt-4.1-mini',
      status: 'completed',
      createdAt: '2026-07-24T09:00:05.000Z',
      completedAt: '2026-07-24T09:00:07.000Z',
      errorMessage: null,
      proposal: {
        intent: 'task',
        suggestedTitle: 'Ligar para o cliente',
        summary: 'Lembrete de ligação.',
        projectCandidates: [],
        proposedActions: [
          {
            actionType: 'create_item',
            title: 'Preparar pauta da ligação',
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
        calendarProposal: null,
        missingInformation: [],
        overallConfidence: 0.85,
      },
      actionsOutcome: [{ index: 0, status: 'done' }],
      calendarOutcome: null,
    });

    await openModalWith(AUDIO_ITEM);

    await waitFor(() => expect(screen.getByText(/gpt-4.1-mini/)).toBeTruthy());
    expect(screen.getByText(/85%/)).toBeTruthy();
    expect(screen.getByText('Preparar pauta da ligação')).toBeTruthy();
    expect(screen.getByText('Aprovada e aplicada')).toBeTruthy();
  });

  it('mostra o link para o evento do Google Calendar quando existe vínculo', async () => {
    findByEntityId.mockResolvedValue([]);
    findCalendarEventLink.mockResolvedValue({
      googleCalendarId: 'cal-1',
      googleEventId: 'evt-1',
      syncStatus: 'synced',
      remindersMinutes: [],
    });

    await openModalWith(AUDIO_ITEM);

    await waitFor(() => expect(screen.getByText(/Ver evento no Google Calendar/)).toBeTruthy());
    const link = screen.getByText(/Ver evento no Google Calendar/).closest('a');
    expect(link?.getAttribute('href')).toContain('calendar.google.com/calendar/event?eid=');
  });

  it('uma falha ao carregar a proveniência de áudio não impede editar/ver o item', async () => {
    findByEntityId.mockRejectedValue(new Error('falha de rede'));
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await openModalWith(AUDIO_ITEM);

    expect(screen.getByLabelText('Título')).toHaveProperty('value', AUDIO_ITEM.title);
    consoleSpy.mockRestore();
  });
});

/**
 * "Salvar sem analisar" deixa a captura pronta para ser analisada depois —
 * o detalhe do item precisa oferecer isso. E, se a transcrição for editada
 * depois de uma análise já concluída, a proposta anterior fica desatualizada
 * e precisa de reanálise antes de qualquer confirmação (P0-2, seção 6).
 */
describe('ItemDetailModal — analisar com IA a partir do detalhe', () => {
  const COMPLETED_RUN = {
    id: 'run-old',
    model: 'gpt-4.1-mini',
    status: 'completed' as const,
    createdAt: '2026-07-24T09:00:05.000Z',
    completedAt: '2026-07-24T09:00:07.000Z',
    errorMessage: null,
    proposal: null,
    actionsOutcome: [],
    calendarOutcome: null,
  };

  const STALE_MESSAGE = 'A transcrição mudou depois desta análise. Analise novamente antes de confirmar as ações.';

  function mockTriageFetch(ok: boolean, aiRunId = 'run-new') {
    global.fetch = vi.fn().mockResolvedValue({
      ok,
      json: async () => (ok ? { aiRunId, proposal: { proposedActions: [] }, model: 'gpt-4.1-mini' } : { error: 'falhou' }),
    });
  }

  it('sem análise prévia, mostra "Analisar com IA"; ao clicar, chama a rota de triagem e abre a revisão', async () => {
    mockTriageFetch(true, 'run-1');
    await openModalWith(AUDIO_ITEM);

    const btn = await screen.findByRole('button', { name: /Analisar com IA/ });
    expect(btn.className).toContain('min-h-[44px]');
    fireEvent.click(btn);

    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith('/api/ai/triage-capture', expect.any(Object)));
    const [, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(JSON.parse(init.body)).toMatchObject({ itemId: AUDIO_ITEM.id });

    await waitFor(() => expect(screen.getByTestId('review-stub')).toBeTruthy());
    expect(screen.getByText(new RegExp(`revisão para item ${AUDIO_ITEM.id} / run run-1`))).toBeTruthy();
  });

  it('falha ao analisar mostra a mensagem padrão e mantém a captura salva', async () => {
    mockTriageFetch(false);
    await openModalWith(AUDIO_ITEM);

    fireEvent.click(await screen.findByRole('button', { name: /Analisar com IA/ }));

    await waitFor(() =>
      expect(screen.getByText('A captura foi salva, mas a análise não foi concluída. Tente novamente.')).toBeTruthy()
    );
    expect(screen.queryByTestId('review-stub')).toBeNull();
    expect(screen.getByLabelText('Título')).toHaveProperty('value', AUDIO_ITEM.title);
  });

  it('editar a descrição depois de uma análise concluída marca a análise como desatualizada', async () => {
    findLatestTriageRun.mockResolvedValue(COMPLETED_RUN);
    updateItem.mockResolvedValue({ ...AUDIO_ITEM, content: 'conteúdo corrigido depois da análise' });
    await openModalWith(AUDIO_ITEM);
    // Espera a proveniência (findLatestTriageRun) já ter carregado antes de
    // editar — só assim handleSave consegue ver o triageRun 'completed'.
    await waitFor(() => expect(screen.getByText(/gpt-4.1-mini/)).toBeTruthy());

    fireEvent.change(screen.getByLabelText('Descrição'), { target: { value: 'conteúdo corrigido depois da análise' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }));

    await waitFor(() => expect(screen.getByText(STALE_MESSAGE)).toBeTruthy());
    expect(screen.getByRole('button', { name: /Analisar novamente/ })).toBeTruthy();
  });

  it('reabrir um item com edição registrada após a análise já mostra a análise como desatualizada', async () => {
    findLatestTriageRun.mockResolvedValue(COMPLETED_RUN);
    findByEntityId.mockResolvedValue([
      {
        id: 'ev-created',
        type: 'item.created',
        entityId: AUDIO_ITEM.id,
        workspaceId: 'ws-1',
        source: 'audio_capture',
        payload: { content: 'transcrição original' },
        createdAt: '2026-07-24T09:00:00.000Z',
      },
      {
        id: 'ev-updated',
        type: 'item.updated',
        entityId: AUDIO_ITEM.id,
        workspaceId: 'ws-1',
        source: 'manual',
        // Depois de completedAt (09:00:07) e content realmente mudou.
        payload: { previous: { content: 'transcrição original' }, new: { content: AUDIO_ITEM.content } },
        createdAt: '2026-07-24T09:05:00.000Z',
      },
    ]);

    await openModalWith(AUDIO_ITEM);

    await waitFor(() => expect(screen.getByText(STALE_MESSAGE)).toBeTruthy());
  });

  it('com a análise desatualizada, "Analisar novamente" gera uma revisão baseada no texto atual', async () => {
    findLatestTriageRun.mockResolvedValue(COMPLETED_RUN);
    findByEntityId.mockResolvedValue([
      {
        id: 'ev-updated',
        type: 'item.updated',
        entityId: AUDIO_ITEM.id,
        workspaceId: 'ws-1',
        source: 'manual',
        payload: { previous: { content: 'transcrição original' }, new: { content: AUDIO_ITEM.content } },
        createdAt: '2026-07-24T09:05:00.000Z',
      },
    ]);
    mockTriageFetch(true, 'run-2');
    await openModalWith(AUDIO_ITEM);

    await waitFor(() => expect(screen.getByText(STALE_MESSAGE)).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /Analisar novamente/ }));

    await waitFor(() => expect(screen.getByTestId('review-stub')).toBeTruthy());
    expect(screen.getByText(new RegExp(`run run-2`))).toBeTruthy();
    // A revisão nova substitui o aviso — a área de "Analisar novamente" não é mais exibida.
    expect(screen.queryByText(STALE_MESSAGE)).toBeNull();
  });
});

/**
 * Uma análise disparada em segundo plano (captura rápida, outra aba, outro
 * dispositivo) pode terminar enquanto o modal já está aberto na mesma
 * captura. O modal precisa refletir isso sem que o usuário precise fechar e
 * reabrir — e, ao atualizar, nunca pode sobrescrever uma edição manual em
 * andamento no formulário (título, descrição, etc.), já que a proveniência
 * (triagem/calendário) e os campos do formulário são estados independentes.
 */
describe('ItemDetailModal — análise concluída em segundo plano enquanto o modal está aberto', () => {
  const COMPLETED_RUN = {
    id: 'run-bg-1',
    model: 'gpt-4.1-mini',
    status: 'completed' as const,
    createdAt: '2026-07-24T09:00:05.000Z',
    completedAt: '2026-07-24T09:00:07.000Z',
    errorMessage: null,
    proposal: { proposedActions: [] },
    actionsOutcome: [],
    calendarOutcome: null,
  };

  it('mostra "Revisar sugestões" assim que o realtime avisa que a análise terminou, sem precisar fechar e reabrir', async () => {
    // Abre o modal enquanto a análise ainda está rodando em segundo plano
    // (nenhum run concluído encontrado ainda).
    findLatestTriageRun.mockResolvedValue(null);
    await openModalWith(AUDIO_ITEM);

    expect(screen.queryByRole('button', { name: /Revisar sugestões/ })).toBeNull();

    // A análise termina em segundo plano: a próxima consulta de proveniência
    // já encontra o run concluído; o realtime (ai_runs atualizado) avisa.
    findLatestTriageRun.mockResolvedValue(COMPLETED_RUN);
    triggerRealtimeChange();

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Revisar sugestões/ })).toBeTruthy()
    );
  });

  it('a atualização em segundo plano nunca sobrescreve uma edição manual em andamento no formulário', async () => {
    findLatestTriageRun.mockResolvedValue(null);
    await openModalWith(AUDIO_ITEM);

    fireEvent.change(screen.getByLabelText('Título'), { target: { value: 'Título editado manualmente' } });

    findLatestTriageRun.mockResolvedValue(COMPLETED_RUN);
    triggerRealtimeChange();

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Revisar sugestões/ })).toBeTruthy()
    );
    expect(screen.getByLabelText('Título')).toHaveProperty('value', 'Título editado manualmente');
  });
});
