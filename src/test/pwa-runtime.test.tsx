// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { PwaRuntime } from '@/components/pwa/pwa-runtime';

const useServiceWorker = vi.fn();

vi.mock('@/lib/use-service-worker', () => ({
  useServiceWorker: () => useServiceWorker(),
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('PwaRuntime', () => {
  it('não mostra nada quando não há atualização disponível', () => {
    useServiceWorker.mockReturnValue({ updateAvailable: false, applyUpdate: vi.fn() });

    const { container } = render(<PwaRuntime />);

    expect(container.innerHTML).toBe('');
  });

  it('mostra o aviso de nova versão e aplica a atualização ao confirmar', () => {
    const applyUpdate = vi.fn();
    useServiceWorker.mockReturnValue({ updateAvailable: true, applyUpdate });

    render(<PwaRuntime />);

    expect(screen.getByText(/nova versão disponível/i)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /atualizar agora/i }));

    expect(applyUpdate).toHaveBeenCalledTimes(1);
  });
});
