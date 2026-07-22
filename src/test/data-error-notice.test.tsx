// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DataErrorNotice } from '@/components/data-error-notice';

describe('DataErrorNotice', () => {
  it('exibe uma mensagem segura de erro (sem detalhes internos) e o botão de retomar', () => {
    const onRetry = vi.fn();
    render(<DataErrorNotice onRetry={onRetry} />);

    expect(screen.getByRole('alert').textContent).toContain('Não foi possível carregar seus dados.');
    expect(screen.getByRole('button', { name: 'Tentar novamente' })).toBeTruthy();
  });

  it('o botão "Tentar novamente" aciona o callback de nova consulta', () => {
    const onRetry = vi.fn();
    render(<DataErrorNotice onRetry={onRetry} />);

    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));

    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('diferencia "sem conexão" de uma falha genérica', () => {
    const onRetry = vi.fn();
    render(<DataErrorNotice isOffline onRetry={onRetry} />);

    expect(screen.getByRole('alert').textContent).toContain('Sem conexão com a internet.');
  });
});
