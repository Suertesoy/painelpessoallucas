// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { QuickCaptureModal } from '@/components/quick-capture-modal';
import { openQuickCapture } from '@/lib/ui-events';

/**
 * Fluxo de áudio da Captura Rápida: a transcrição é salva na Caixa de
 * Entrada IMEDIATAMENTE após transcrever — antes de qualquer análise por IA
 * — e fica em um campo editável ("Revisar transcrição") antes da triagem. A
 * correção, quando existir, é persistida (updateItem) antes de "Analisar com
 * IA" — a rota de triagem lê o conteúdo do banco. AudioRecorder e
 * AudioCaptureReview (já testados isoladamente) são substituídos por stubs
 * simples para isolar o comportamento do próprio modal.
 */

const createItem = vi.fn();
const updateItem = vi.fn();
const listProjects = vi.fn();

vi.mock('@/providers/repository.provider', () => ({
  useCommands: () => ({ item: { createItem, updateItem } }),
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

async function recordAndTranscribe(transcript = 'Ligar para o cliente amanhã.') {
  mockFetchSequence({
    '/api/audio/transcribe': () => ({ ok: true, json: async () => ({ transcript }) }),
  });
  createItem.mockResolvedValue({ id: 'item-novo' });
  await openAudioTab();
  fireEvent.click(screen.getByText('stub-gravar-e-enviar'));
  await waitFor(() => expect(screen.getByText(/Captura salva na Caixa de Entrada/)).toBeTruthy());
}

function transcriptField(): HTMLTextAreaElement {
  return screen.getByLabelText('Revisar transcrição') as HTMLTextAreaElement;
}

describe('QuickCaptureModal — captura por áudio', () => {
  it('transcreve e salva a captura no Inbox ANTES de qualquer análise por IA', async () => {
    await recordAndTranscribe('Ligar para o cliente amanhã.');

    expect(createItem.mock.calls[0][0]).toMatchObject({
      content: 'Ligar para o cliente amanhã.',
      source: 'audio_capture',
      audioDurationSeconds: 12,
    });
    expect(transcriptField().value).toBe('Ligar para o cliente amanhã.');
  });

  it('a transcrição aparece em um campo editável, preenchida, sem exigir edição', async () => {
    await recordAndTranscribe('nota qualquer');
    const field = transcriptField();
    expect(field.tagName).toBe('TEXTAREA');
    expect(field).not.toHaveProperty('disabled', true);
    expect(screen.getByText('Corrija nomes, datas ou horários, se necessário.')).toBeTruthy();
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
    expect(transcriptField().value).toBe('texto recuperado');
  });

  it('sem edição, "Analisar com IA" usa a transcrição original tal como foi salva (não chama updateItem)', async () => {
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
    expect(updateItem).not.toHaveBeenCalled();
  });

  it('com edição, "Analisar com IA" persiste a correção (título regerado) antes de chamar a triagem, que usa a versão corrigida', async () => {
    mockFetchSequence({
      '/api/audio/transcribe': () => ({ ok: true, json: async () => ({ transcript: 'reuniao com o grupo almeida' }) }),
      '/api/ai/triage-capture': () => ({
        ok: true,
        json: async () => ({ aiRunId: 'run-9', proposal: { proposedActions: [] }, model: 'gpt-4.1-mini' }),
      }),
    });
    createItem.mockResolvedValue({ id: 'item-88' });
    updateItem.mockResolvedValue({ id: 'item-88' });

    await openAudioTab();
    fireEvent.click(screen.getByText('stub-gravar-e-enviar'));
    await waitFor(() => expect(screen.getByText(/Captura salva na Caixa de Entrada/)).toBeTruthy());

    fireEvent.change(transcriptField(), { target: { value: 'Reunião com o grupo Almeida na quinta às 14h' } });
    fireEvent.click(screen.getByRole('button', { name: /Analisar com IA/ }));

    await waitFor(() => expect(updateItem).toHaveBeenCalledTimes(1));
    expect(updateItem.mock.calls[0][0]).toBe('item-88');
    expect(updateItem.mock.calls[0][1]).toMatchObject({ content: 'Reunião com o grupo Almeida na quinta às 14h' });

    await waitFor(() => expect(screen.getByTestId('review-stub')).toBeTruthy());
    // updateItem precisa ter sido chamado ANTES da triagem (a rota lê do banco).
    const fetchCalls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0]);
    expect(fetchCalls.some((u: string) => u.includes('/api/ai/triage-capture'))).toBe(true);
  });

  it('falha ao salvar a correção impede a chamada de triagem e mantém o texto no campo', async () => {
    mockFetchSequence({
      '/api/audio/transcribe': () => ({ ok: true, json: async () => ({ transcript: 'texto original' }) }),
    });
    createItem.mockResolvedValue({ id: 'item-99' });
    updateItem.mockRejectedValue(new Error('permission denied'));

    await openAudioTab();
    fireEvent.click(screen.getByText('stub-gravar-e-enviar'));
    await waitFor(() => expect(screen.getByText(/Captura salva na Caixa de Entrada/)).toBeTruthy());

    fireEvent.change(transcriptField(), { target: { value: 'texto corrigido' } });
    fireEvent.click(screen.getByRole('button', { name: /Analisar com IA/ }));

    await waitFor(() =>
      expect(screen.getByText('Não foi possível salvar a correção. Seu texto continua aqui. Tente novamente.')).toBeTruthy()
    );
    expect(transcriptField().value).toBe('texto corrigido');
    expect(screen.queryByTestId('review-stub')).toBeNull();
    // só a transcrição — nem updateItem-triggered fetch nem a triagem chegam a rodar
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('falha na análise por IA não apaga nem esconde a captura já salva', async () => {
    mockFetchSequence({
      '/api/audio/transcribe': () => ({ ok: true, json: async () => ({ transcript: 'transcrição salva' }) }),
      '/api/ai/triage-capture': () => ({ ok: false, json: async () => ({ error: 'erro interno qualquer' }) }),
    });
    createItem.mockResolvedValue({ id: 'item-novo' });

    await openAudioTab();
    fireEvent.click(screen.getByText('stub-gravar-e-enviar'));
    await waitFor(() => expect(screen.getByText(/Captura salva na Caixa de Entrada/)).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: /Analisar com IA/ }));

    await waitFor(() =>
      expect(
        screen.getByText('A captura foi salva, mas a análise não foi concluída. Tente novamente.')
      ).toBeTruthy()
    );
    // A captura continua visível e salva — a falha da IA não a esconde nem a desfaz.
    expect(transcriptField().value).toBe('transcrição salva');
    expect(createItem).toHaveBeenCalledTimes(1);
  });

  it('"Salvar sem analisar" fecha o modal sem chamar a rota de triagem', async () => {
    await recordAndTranscribe('nota rápida');

    fireEvent.click(screen.getByRole('button', { name: 'Salvar sem analisar' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(global.fetch).toHaveBeenCalledTimes(1); // só a transcrição, nunca a triagem
  });

  it('"Salvar sem analisar" também persiste uma correção pendente antes de fechar', async () => {
    await recordAndTranscribe('nota rápida');
    updateItem.mockResolvedValue({ id: 'item-novo' });

    fireEvent.change(transcriptField(), { target: { value: 'nota rápida corrigida' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar sem analisar' }));

    await waitFor(() => expect(updateItem).toHaveBeenCalledWith('item-novo', expect.objectContaining({
      content: 'nota rápida corrigida',
    })));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    // ainda nenhuma chamada à triagem
    const fetchCalls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0]);
    expect(fetchCalls.some((u: string) => u.includes('/api/ai/triage-capture'))).toBe(false);
  });

  it('avisa visivelmente que o áudio é enviado a um serviço de IA e não é armazenado', async () => {
    await openAudioTab();
    expect(screen.getByText(/enviado a um serviço de IA \(OpenAI\)/)).toBeTruthy();
    expect(screen.getByText(/Não é\s*armazenado/)).toBeTruthy();
  });

  it('os botões "Salvar sem analisar" e "Analisar com IA" respeitam a área de toque mínima (44px) no mobile', async () => {
    await recordAndTranscribe('nota rápida');

    const saveBtn = screen.getByRole('button', { name: 'Salvar sem analisar' });
    const analyzeBtn = screen.getByRole('button', { name: /Analisar com IA/ });
    expect(saveBtn.className).toContain('min-h-[44px]');
    expect(analyzeBtn.className).toContain('min-h-[44px]');

    const field = transcriptField();
    expect(field.className).toContain('text-base'); // >= 16px evita zoom automático no iOS
  });
});
