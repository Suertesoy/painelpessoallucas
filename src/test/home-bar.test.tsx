// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { HomeBar } from '@/components/home-bar';
import { areaOf } from '@/components/app-shell';

vi.mock('@/components/active-timer-chip', () => ({ ActiveTimerChips: () => <span data-testid="chips" /> }));
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: React.ComponentProps<'a'>) => (
    <a href={href as string} {...rest}>
      {children}
    </a>
  ),
}));

afterEach(cleanup);

describe('navegação sem barra global', () => {
  it('cada ambiente mostra só o caminho de volta para Nossa casa', () => {
    render(<HomeBar areaLabel="Treinos" />);
    const links = [...document.querySelectorAll('a')];
    expect(links).toHaveLength(1);
    expect(links[0].getAttribute('href')).toBe('/');
    expect(screen.getByLabelText('Voltar para Nossa casa').className).toContain('min-h-12');
    expect(document.querySelector('nav')).toBeNull();
    expect(document.body.textContent).toContain('Treinos');
    expect(screen.getByTestId('chips')).toBeTruthy();
  });

  it('mapeia rotas para ambientes e mantém as rotas antigas', () => {
    expect(areaOf('/aprendizado/praticar').id).toBe('estudos');
    expect(areaOf('/treinos/abc/sessao/x').id).toBe('treinos');
    expect(areaOf('/ideias').id).toBe('notas');
    expect(areaOf('/financas/fatura').id).toBe('financas');
    expect(areaOf('/compras').id).toBe('compras');
    expect(areaOf('/projetos').id).toBe('outros');
  });
});
