// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { QuickCaptureModal } from '@/components/quick-capture-modal';
import { openQuickCapture } from '@/lib/ui-events';

/**
 * Fluxo de áudio da Captura Rápida (Etapa 2): a transcrição é salva na Caixa
 * de Entrada IMEDIATAMENTE após transcrever — antes de qualquer análise por
 * IA — para que uma falha da IA nunca possa perder a captura. AudioRecorder
 * e AudioCaptureReview (já testados isoladamente) são substituídos por
 * stubs simples para isolar o comportamento do próprio modal.
 */

const createItem = vi.fn();
const listProjects = vi.fn();

vi.mock('@/providers/repository.provider', () => ({
  useCommands: () => ({ item: { createItem } }),
  useQueries: () => ({ project: { listProjects } }),
}));
vi.mock('@/providers/auth.provider', () => ({
  useWorkspace: () => ({ workspaceId: 'ws-1' }),
}));

vi.mock('@/components/audio-recorder', () => ({
  AudioRecorder: ({ onSend }: { onSend: (blob: Blob, seconds: number) => void }) => (
    <button type="button" onClick={() => onSend(new Blob(['a'], { type: 'audio/webm' }), 12)}>
      stub-gravar-e-enviar
    </button>
  ),
}));

vi.mock('@/components/audio-capture-review', () => ({
  AudioCaptureReview: (props: { itemId: string; aiRunId: string }) => (
    <div data-testid="review-stub">
      revisão para item {props.itemId} / run {props.aiRunId}
    </div>
  ),
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

function mockFetchSequence(handlers: Record<string, () => { ok: boolean; json: () => Promise<unknown> }>) {
  global.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : (input as Request).url ?? String(input);
    const path = Object.keys(handlers).find((p) => url.includes(p));
    if (!path) throw new Error(`URL inesperada no mock de fetch: ${url}`);
    const result = handlers[path]();
    return { ok: result.ok, json: result.json } as Response;
  });
}

async function openAudioTab() {
  render(<QuickCaptureModal />);
  openQuickCapture();
  await waitFor(() => expect(screen.getByRole('dialog')).toBeTruthy());
  fireEvent.click(screen.getByRole('button', { name: /Áudio/ }));
  await waitFor(() => expect(screen.getByText('stub-gravar-e-enviar')).toBeTruthy());
}

describe('QuickCaptureModal — captura por áudio', () => {
  it('transcreve e salva a captura no Inbox ANTES de qualquer análise por IA', async () => {
    mockFetchSequence({
      '/api/audio/transcribe': () => ({ ok: true, json: async () => ({ transcript: 'Ligar para o cliente amanhã.' }) }),
    });
    createItem.mockResolvedValue({ id: 'item-novo' });

    await openAudioTab();
    fireEvent.click(screen.getByText('stub-gravar-e-enviar'));

    await waitFor(() => expect(createItem).toHaveBeenCalledTimes(1));
    expect(createItem.mock.calls[0][0]).toMatchObject({
      content: 'Ligar para o cliente amanhã.',
      source: 'audio_capture',
      audioDurationSeconds: 12,
    });
    await waitFor(() => expect(screen.getByText(/Captura salva na Caixa de Entrada/)).toBeTruthy());
    expect(screen.getByText('Ligar para o cliente amanhã.')).toBeTruthy();
  });

  it('falha na transcrição preserva o áudio gravado — "Tentar novamente" não exige regravar', async () => {
    let calls = 0;
    global.fetch = vi.fn(async () => {
      calls += 1;
      if (calls === 1) return { ok: false, json: async () => ({ error: 'Falha ao transcrever' }) } as Response;
      return { ok: true, json: async () => ({ transcript: 'texto recuperado' }) } as Response;
    });
    createItem.mockResolvedValue({ id: 'item-novo' });

    await openAudioTab();
    fireEvent.click(screen.getByText('stub-gravar-e-enviar'));

    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
    const retryBtn = screen.getByRole('button', { name: /Tentar novamente \(sem regravar\)/ });

    fireEvent.click(retryBtn);
    await waitFor(() => expect(createItem).toHaveBeenCalledTimes(1));
    expect(calls).toBe(2);
    expect(screen.getByText('texto recuperado')).toBeTruthy();
  });

  it('falha na análise por IA não apaga nem esconde a captura já salva', async () => {
    mockFetchSequence({
      '/api/audio/transcribe': () => ({ ok: true, json: async () => ({ transcript: 'transcrição salva' }) }),
      '/api/ai/triage-capture': () => ({ ok: false, json: async () => ({ error: 'A IA falhou' }) }),
    });
    createItem.mockResolvedValue({ id: 'item-novo' });

    await openAudioTab();
    fireEvent.click(screen.getByText('stub-gravar-e-enviar'));
    await waitFor(() => expect(screen.getByText(/Captura salva na Caixa de Entrada/)).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: /Analisar com IA/ }));

    await waitFor(() => expect(screen.getByText(/A IA falhou/)).toBeTruthy());
    // A captura continua visível e salva — a falha da IA não a esconde nem a desfaz.
    expect(screen.getByText('transcrição salva')).toBeTruthy();
    expect(createItem).toHaveBeenCalledTimes(1);
  });

  it('análise com sucesso abre a tela de revisão com o item e o aiRunId corretos', async () => {
    mockFetchSequence({
      '/api/audio/transcribe': () => ({ ok: true, json: async () => ({ transcript: 'agendar reunião' }) }),
      '/api/ai/triage-capture': () => ({
        ok: true,
        json: async () => ({ aiRunId: 'run-42', proposal: { proposedActions: [] }, model: 'gpt-4.1-mini' }),
      }),
    });
    createItem.mockResolvedValue({ id: 'item-77' });

    await openAudioTab();
    fireEvent.click(screen.getByText('stub-gravar-e-enviar'));
    await waitFor(() => expect(screen.getByText(/Captura salva na Caixa de Entrada/)).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: /Analisar com IA/ }));

    await waitFor(() => expect(screen.getByTestId('review-stub')).toBeTruthy());
    expect(screen.getByText(/revisão para item item-77 \/ run run-42/)).toBeTruthy();
  });

  it('"Concluir sem IA" fecha o modal sem chamar a rota de triagem', async () => {
    mockFetchSequence({
      '/api/audio/transcribe': () => ({ ok: true, json: async () => ({ transcript: 'nota rápida' }) }),
    });
    createItem.mockResolvedValue({ id: 'item-novo' });

    await openAudioTab();
    fireEvent.click(screen.getByText('stub-gravar-e-enviar'));
    await waitFor(() => expect(screen.getByText(/Captura salva na Caixa de Entrada/)).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: 'Concluir sem IA' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(global.fetch).toHaveBeenCalledTimes(1); // só a transcrição, nunca a triagem
  });

  it('avisa visivelmente que o áudio é enviado a um serviço de IA e não é armazenado', async () => {
    await openAudioTab();
    expect(screen.getByText(/enviado a um serviço de IA \(OpenAI\)/)).toBeTruthy();
    expect(screen.getByText(/Não é\s*armazenado/)).toBeTruthy();
  });
});
