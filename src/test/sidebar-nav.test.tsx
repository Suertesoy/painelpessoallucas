// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, within } from '@testing-library/react';
import { SidebarNav } from '@/components/sidebar-nav';

/**
 * Navegação da central doméstica: Nossa casa, Compras, Finanças, Notas e Aprender
 * (curso de Japonês), com Configurações à parte. Projetos, Planos, Rotina e Agenda
 * continuam existindo por URL, mas não aparecem na navegação.
 */

let pathname = '/';
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
  pathname = '/';
});

const desktopNav = () => document.querySelector('aside nav') as HTMLElement;
const mobileNav = () => document.querySelector('nav[aria-label="Navegação principal (celular)"]') as HTMLElement;

describe('SidebarNav simplificada', () => {
  it('mostra só as cinco áreas, na ordem, no desktop e no celular', () => {
    render(<SidebarNav />);
    for (const nav of [desktopNav(), mobileNav()]) {
      const links = [...nav.querySelectorAll('a')].map((a) => [a.textContent?.trim(), a.getAttribute('href')]);
      expect(links).toEqual([
        ['Nossa casa', '/'],
        ['Compras', '/compras'],
        ['Finanças', '/financas'],
        ['Notas', '/notas'],
        ['Aprender', '/aprendizado'],
      ]);
    }
  });

  it('não expõe Projetos, Planos, Hoje, Agenda, Rotina, Entrada nem Revisão', () => {
    render(<SidebarNav />);
    const text = document.body.textContent ?? '';
    for (const label of ['Projetos', 'Planos', 'Hoje', 'Agenda', 'Rotina', 'Caixa de Entrada', 'Revisão']) {
      expect(text).not.toContain(label);
    }
  });

  it('Configurações fica acessível fora da lista principal', () => {
    render(<SidebarNav />);
    const aside = document.querySelector('aside') as HTMLElement;
    expect(within(aside).getByText('Configurações').closest('a')?.getAttribute('href')).toBe('/configuracoes');
    expect(document.querySelector('a[aria-label="Abrir configurações"]')?.getAttribute('href')).toBe('/configuracoes');
  });

  it('marca a área ativa e trata /ideias (rota antiga) como Notas', () => {
    pathname = '/compras';
    const { unmount } = render(<SidebarNav />);
    expect(within(desktopNav()).getByText('Compras').closest('a')?.getAttribute('aria-current')).toBe('page');
    expect(within(desktopNav()).getByText('Nossa casa').closest('a')?.getAttribute('aria-current')).toBeNull();
    unmount();

    pathname = '/ideias';
    render(<SidebarNav />);
    expect(within(desktopNav()).getByText('Notas').closest('a')?.getAttribute('aria-current')).toBe('page');
  });

  it('áreas de toque amplas na barra do celular', () => {
    render(<SidebarNav />);
    for (const a of mobileNav().querySelectorAll('a')) expect(a.className).toContain('min-h-16');
  });
});
