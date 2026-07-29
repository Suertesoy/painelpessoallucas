// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { InstallAppCard } from '@/components/pwa/install-app-card';

const usePwaInstall = vi.fn();

vi.mock('@/lib/use-pwa-install', () => ({
  usePwaInstall: () => usePwaInstall(),
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('InstallAppCard', () => {
  it('já instalado: mostra confirmação e não oferece instalação de novo', () => {
    usePwaInstall.mockReturnValue({
      isStandalone: true,
      isIOS: false,
      canPromptInstall: false,
      promptInstall: vi.fn(),
    });

    render(<InstallAppCard />);

    expect(screen.getByText(/já está instalado/i)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /instalar aplicativo/i })).toBeNull();
  });

  it('prompt nativo disponível: mostra o botão e dispara promptInstall ao clicar', async () => {
    const promptInstall = vi.fn().mockResolvedValue('accepted');
    usePwaInstall.mockReturnValue({
      isStandalone: false,
      isIOS: false,
      canPromptInstall: true,
      promptInstall,
    });

    render(<InstallAppCard />);

    const button = screen.getByRole('button', { name: /instalar aplicativo/i });
    fireEvent.click(button);

    expect(promptInstall).toHaveBeenCalledTimes(1);
  });

  it('iOS sem prompt nativo: mostra a instrução de Compartilhar / Adicionar à Tela de Início', () => {
    usePwaInstall.mockReturnValue({
      isStandalone: false,
      isIOS: true,
      canPromptInstall: false,
      promptInstall: vi.fn(),
    });

    render(<InstallAppCard />);

    expect(screen.getByText(/adicionar à tela de início/i)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /instalar aplicativo/i })).toBeNull();
  });

  it('sem suporte nenhum: não renderiza nada (sem botão sem função)', () => {
    usePwaInstall.mockReturnValue({
      isStandalone: false,
      isIOS: false,
      canPromptInstall: false,
      promptInstall: vi.fn(),
    });

    const { container } = render(<InstallAppCard />);

    expect(container.innerHTML).toBe('');
  });
});
