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

const originalFetch = global.fetch;

beforeEach(() => {
  vi.clearAllMocks();
  createItem.mockResolvedValue({ id: 'capture-1' });
  global.fetch = vi.fn(async () => ({
    ok: true,
    json: async () => ({ aiRunId: 'run-1' }),
  })) as unknown as typeof fetch;
});

afterEach(() => {
  cleanup();
  global.fetch = originalFetch;
});

async function openModal() {
  render(<QuickCaptureModal />);
  openQuickCapture();
  await waitFor(() => expect(screen.getByRole('dialog')).toBeTruthy());
}

describe('QuickCaptureModal — captura livre por texto', () => {
  it('não exige título, tipo, prioridade ou projeto antes de salvar', async () => {
    await openModal();

    expect(
      screen.getByPlaceholderText('Escreva livremente o que está pensando…')
    ).toBeTruthy();
    expect(screen.queryByLabelText('Título')).toBeNull();
    expect(screen.queryByLabelText('Tipo')).toBeNull();
    expect(screen.queryByLabelText('Prioridade')).toBeNull();
    expect(screen.queryByLabelText('Projeto')).toBeNull();
  });

  it('salva a captura original imediatamente e fecha enquanto a análise segue em segundo plano', async () => {
    await openModal();
    fireEvent.change(
      screen.getByPlaceholderText('Escreva livremente o que está pensando…'),
      {
        target: {
          value:
            'Comprar leite, marcar dentista e revisar o site da Almeida.',
        },
      }
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Enviar para análise' })
    );

    await waitFor(() =>
      expect(createItem).toHaveBeenCalledWith(
        {
          content:
            'Comprar leite, marcar dentista e revisar o site da Almeida.',
          type: 'note',
          priority: 'normal',
          source: 'quick_capture',
        },
        'ws-1'
      )
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(
      screen.getByText(
        'Captura salva. A análise continua em segundo plano.'
      )
    ).toBeTruthy();
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/ai/triage-capture',
      expect.objectContaining({
        method: 'POST',
        keepalive: true,
      })
    );
    const request = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(JSON.parse(request.body)).toEqual({
      itemId: 'capture-1',
      idempotencyKey: 'capture-1',
    });
  });

  it('mantém o modal aberto e mostra erro quando a persistência falha', async () => {
    createItem.mockRejectedValue(new Error('Falha de conexão'));
    await openModal();
    fireEvent.change(
      screen.getByPlaceholderText('Escreva livremente o que está pensando…'),
      { target: { value: 'Uma captura importante' } }
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Enviar para análise' })
    );

    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toContain(
        'Falha de conexão'
      )
    );
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
