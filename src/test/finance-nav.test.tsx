// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, within, fireEvent } from '@testing-library/react';
import { SidebarNav } from '@/components/sidebar-nav';

/** Navegação para /financas — desktop e mobile (mesmo padrão de sidebar-nav.test.tsx para /compras). */

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

describe('SidebarNav — Finanças', () => {
  it('aparece no menu desktop com link para /financas', () => {
    render(<SidebarNav />);
    const desktopNav = document.querySelector('aside nav') as HTMLElement;
    const link = within(desktopNav).getByText('Finanças').closest('a');
    expect(link?.getAttribute('href')).toBe('/financas');
  });

  it('aparece no menu mobile (drawer) com link para /financas', () => {
    render(<SidebarNav />);
    const toggle = screen.getByRole('button', { name: /abrir menu/i });
    fireEvent.click(toggle);
    const drawer = screen.getByRole('dialog', { name: /menu/i });
    const link = within(drawer).getByText('Finanças').closest('a');
    expect(link?.getAttribute('href')).toBe('/financas');
  });

  it('marca /financas como ativo (aria-current) quando a rota atual é /financas', () => {
    pathname = '/financas';
    render(<SidebarNav />);
    const desktopNav = document.querySelector('aside nav') as HTMLElement;
    const link = within(desktopNav).getByText('Finanças').closest('a');
    expect(link?.getAttribute('aria-current')).toBe('page');

    const hojeLink = within(desktopNav).getByText('Hoje').closest('a');
    expect(hojeLink?.getAttribute('aria-current')).toBeNull();
  });
});
