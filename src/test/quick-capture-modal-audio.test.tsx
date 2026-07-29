// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { QuickCaptureModal } from '@/components/quick-capture-modal';
import { openQuickCapture } from '@/lib/ui-events';

const createItem = vi.fn();

vi.mock('@/providers/repository.provider', () => ({
  useCommands: () => ({ item: { createItem } }),
}));
vi.mock('@/providers/auth.provider', () => ({
  useWorkspace: () => ({ workspaceId: 'ws-1' }),
}));
vi.mock('@/components/audio-recorder', () => ({
  AudioRecorder: ({
    onSend,
  }: {
    onSend: (blob: Blob, seconds: number) => void;
  }) => (
    <button
      type="button"
      onClick={() =>
        onSend(new Blob(['audio'], { type: 'audio/webm' }), 12)
      }
    >
      gravar e enviar
    </button>
  ),
}));

const originalFetch = global.fetch;

beforeEach(() => {
  vi.clearAllMocks();
  createItem.mockResolvedValue({ id: 'capture-audio-1' });
});

afterEach(() => {
  cleanup();
  global.fetch = originalFetch;
});

async function openAudioCapture() {
  render(<QuickCaptureModal />);
  openQuickCapture();
  await waitFor(() => expect(screen.getByRole('dialog')).toBeTruthy());
  fireEvent.click(
    screen.getByRole('button', { name: 'Gravar captura por áudio' })
  );
  await waitFor(() => expect(screen.getByText('gravar e enviar')).toBeTruthy());
}

describe('QuickCaptureModal — captura livre por áudio', () => {
  it('transcreve, salva somente o texto e dispara a análise em segundo plano', async () => {
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/audio/transcribe')) {
        return {
          ok: true,
          json: async () => ({
            transcript: 'Ligar para o cliente amanhã.',
          }),
        } as Response;
      }
      if (url.includes('/api/ai/triage-capture')) {
        return {
          ok: true,
          json: async () => ({ aiRunId: 'run-audio-1' }),
        } as Response;
      }
      throw new Error(`URL inesperada: ${url}`);
    }) as unknown as typeof fetch;

    await openAudioCapture();
    fireEvent.click(screen.getByText('gravar e enviar'));

    await waitFor(() =>
      expect(createItem).toHaveBeenCalledWith(
        {
          content: 'Ligar para o cliente amanhã.',
          type: 'note',
          priority: 'normal',
          source: 'audio_capture',
          audioDurationSeconds: 12,
        },
        'ws-1'
      )
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(
      screen.getByText(
        'Áudio transcrito e captura salva. A análise continua em segundo plano.'
      )
    ).toBeTruthy();
    expect(
      (global.fetch as ReturnType<typeof vi.fn>).mock.calls.some(([url]) =>
        String(url).includes('/api/ai/triage-capture')
      )
    ).toBe(true);
  });

  it('informa que o arquivo de áudio é descartado após a transcrição', async () => {
    global.fetch = vi.fn();
    await openAudioCapture();

    expect(
      screen.getByText(/O áudio é enviado à OpenAI somente para transcrição/)
    ).toBeTruthy();
    expect(
      screen.getByText(/O arquivo é descartado e apenas o texto fica salvo/)
    ).toBeTruthy();
  });

  it('preserva o Blob em memória para repetir uma transcrição que falhou', async () => {
    let transcriptionCalls = 0;
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/audio/transcribe')) {
        transcriptionCalls += 1;
        if (transcriptionCalls === 1) {
          return {
            ok: false,
            json: async () => ({ error: 'Falha ao transcrever' }),
          } as Response;
        }
        return {
          ok: true,
          json: async () => ({ transcript: 'Texto recuperado' }),
        } as Response;
      }
      return {
        ok: true,
        json: async () => ({ aiRunId: 'run-2' }),
      } as Response;
    }) as unknown as typeof fetch;

    await openAudioCapture();
    fireEvent.click(screen.getByText('gravar e enviar'));
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toContain(
        'Falha ao transcrever'
      )
    );

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Tentar novamente sem regravar',
      })
    );
    await waitFor(() => expect(createItem).toHaveBeenCalledTimes(1));
    expect(transcriptionCalls).toBe(2);
  });
});
