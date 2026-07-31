// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, within, fireEvent } from '@testing-library/react';
import { SidebarNav } from '@/components/sidebar-nav';

/**
 * Navegação para /compras — desktop (aside sempre presente no DOM, escondida
 * por CSS em telas pequenas) e mobile (drawer). Cobre item 6 da auditoria:
 * a rota precisa estar acessível pela navegação principal nos dois layouts.
 */

let pathname = '/hoje';
vi.mock('next/navigation', () => ({
  usePathname: () => pathname,
}));
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: React.ComponentProps<'a'>) => (
    <a href={href as string} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock('@/providers/auth.provider', () => ({
  useAuth: () => ({ user: { email: 'lucas@example.com' }, signOut: vi.fn() }),
}));

afterEach(() => {
  cleanup();
  pathname = '/hoje';
});

describe('SidebarNav — Compras', () => {
  it('aparece no menu desktop com link para /compras', () => {
    render(<SidebarNav />);
    const desktopNav = document.querySelector('aside nav') as HTMLElement;
    const link = within(desktopNav).getByText('Compras').closest('a');
    expect(link?.getAttribute('href')).toBe('/compras');
  });

  it('aparece no menu mobile (drawer) com link para /compras', () => {
    render(<SidebarNav />);
    const toggle = screen.getByRole('button', { name: /abrir menu/i });
    fireEvent.click(toggle);
    const drawer = screen.getByRole('dialog', { name: /menu/i });
    const link = within(drawer).getByText('Compras').closest('a');
    expect(link?.getAttribute('href')).toBe('/compras');
  });

  it('marca /compras como ativo (aria-current) quando a rota atual é /compras', () => {
    pathname = '/compras';
    render(<SidebarNav />);
    const desktopNav = document.querySelector('aside nav') as HTMLElement;
    const link = within(desktopNav).getByText('Compras').closest('a');
    expect(link?.getAttribute('aria-current')).toBe('page');

    const hojeLink = within(desktopNav).getByText('Hoje').closest('a');
    expect(hojeLink?.getAttribute('aria-current')).toBeNull();
  });

  it('não quebra a presença nem a rotulagem das rotas existentes', () => {
    render(<SidebarNav />);
    const desktopNav = document.querySelector('aside nav') as HTMLElement;
    for (const label of ['Hoje', 'Caixa de Entrada', 'Projetos', 'Notas', 'Agenda', 'Planos', 'Aprendizado', 'Revisão', 'Configurações']) {
      expect(within(desktopNav).getByText(label)).toBeTruthy();
    }
  });
});
