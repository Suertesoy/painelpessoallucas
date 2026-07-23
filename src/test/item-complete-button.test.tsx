// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ItemCompleteButton } from '@/components/item-complete-button';

describe('ItemCompleteButton', () => {
  it('tem área de toque adequada (44px) e aria-label com o título do item', () => {
    render(
      <ItemCompleteButton itemId="1" title="baile da brum" isCompleted={false} onComplete={vi.fn()} />
    );
    const button = screen.getByRole('button', { name: 'Concluir baile da brum' });
    expect(button.className).toContain('h-11');
    expect(button.className).toContain('w-11');
  });

  it('desabilita e mostra loading durante a operação', async () => {
    let resolveComplete: () => void = () => {};
    const onComplete = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveComplete = resolve;
        })
    );
    render(<ItemCompleteButton itemId="1" title="Tarefa" isCompleted={false} onComplete={onComplete} />);

    const button = screen.getByRole('button', { name: 'Concluir Tarefa' }) as HTMLButtonElement;
    fireEvent.click(button);

    await waitFor(() => expect(button.disabled).toBe(true));
    expect(onComplete).toHaveBeenCalledWith('1');

    resolveComplete();
    await waitFor(() => expect(button.disabled).toBe(false));
  });

  it('exibe erro em vez de falhar silenciosamente', async () => {
    const onComplete = vi.fn().mockRejectedValue(new Error('Falha ao concluir: permission denied'));
    render(<ItemCompleteButton itemId="1" title="Tarefa" isCompleted={false} onComplete={onComplete} />);

    fireEvent.click(screen.getByRole('button', { name: 'Concluir Tarefa' }));

    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
    const button = screen.getByRole('button', { name: 'Concluir Tarefa' }) as HTMLButtonElement;
    expect(button.disabled).toBe(false);
  });

  it('quando já concluído, mostra um indicador estático em vez de um botão clicável', () => {
    render(<ItemCompleteButton itemId="1" title="Tarefa" isCompleted onComplete={vi.fn()} />);
    expect(screen.queryByRole('button')).toBeNull();
  });
});
