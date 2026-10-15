// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import Home from '@/app/page';
import { EndMonthField } from '@/components/finance-cash/ui';
import { DonutChart } from '@/components/finance-cash/donut-chart';

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: React.ComponentProps<'a'>) => <a href={href as string} {...rest}>{children}</a>,
}));

afterEach(cleanup);

describe('Home "Nossa casa"', () => {
  it('é uma porta de entrada: Compras, Finanças e Notas, com acesso discreto ao Japonês e sem indicadores', () => {
    render(<Home />);
    expect(screen.getByRole('heading', { name: 'Nossa casa' })).toBeTruthy();
    const links = [...screen.getByRole('navigation', { name: /áreas da casa/i }).querySelectorAll('a')];
    expect(links.map((a) => a.getAttribute('href'))).toEqual(['/compras', '/financas', '/notas']);
    expect(screen.getByRole('link', { name: /Aprender japonês/i }).getAttribute('href')).toBe('/aprendizado');
    expect(document.querySelector('svg[role="img"], canvas, table')).toBeNull();
    expect(document.body.textContent).not.toMatch(/R\$/);
  });

  it('cartões com área de toque ampla', () => {
    render(<Home />);
    for (const a of screen.getByRole('navigation', { name: /áreas da casa/i }).querySelectorAll('a')) {
      expect(a.className).toContain('min-h-28');
    }
  });
});

describe('Término opcional (EndMonthField)', () => {
  it('sem data de término: nenhum mês é pedido', () => {
    render(<EndMonthField value={null} onChange={() => {}} />);
    expect((screen.getByLabelText('Sem data de término') as HTMLInputElement).checked).toBe(true);
    expect(screen.queryByLabelText('Último mês')).toBeNull();
  });

  it('escolher "Definir último mês" pede o mês; voltar para "Sem data" descarta o mês (null)', () => {
    const onChange = vi.fn();
    const { rerender } = render(<EndMonthField value={null} onChange={onChange} />);
    fireEvent.click(screen.getByLabelText('Definir último mês'));
    expect(onChange).toHaveBeenLastCalledWith('');

    rerender(<EndMonthField value="2027-03" onChange={onChange} />);
    expect((screen.getByLabelText('Último mês') as HTMLInputElement).value).toBe('2027-03');
    fireEvent.click(screen.getByLabelText('Sem data de término'));
    expect(onChange).toHaveBeenLastCalledWith(null);
  });
});

describe('Rosca de gastos', () => {
  const slices = [
    { id: 'groceries', label: 'Mercado', cents: 30000 },
    { id: 'online', label: 'Compras online', cents: 10000 },
    { id: 'none', label: 'Sem categoria', cents: 10000 },
  ];

  it('descreve a distribuição por texto (não depende só de cor)', () => {
    render(<DonutChart slices={slices} selectedId={null} onSelect={() => {}} totalLabel="Total do mês" />);
    const label = screen.getByRole('img').getAttribute('aria-label') ?? '';
    expect(label).toContain('Mercado 60%');
    expect(label).toContain('Compras online 20%');
    expect(label).toContain('Sem categoria 20%');
  });

  it('tocar numa fatia seleciona a categoria', () => {
    const onSelect = vi.fn();
    const { container } = render(<DonutChart slices={slices} selectedId={null} onSelect={onSelect} totalLabel="Total" />);
    const circles = container.querySelectorAll('circle[stroke-dasharray]');
    expect(circles.length).toBe(3);
    fireEvent.click(circles[1]);
    expect(onSelect).toHaveBeenCalledWith('online');
  });

  it('sem gastos não desenha fatias', () => {
    const { container } = render(<DonutChart slices={[]} selectedId={null} onSelect={() => {}} totalLabel="Total" />);
    expect(container.querySelectorAll('circle[stroke-dasharray]').length).toBe(0);
    expect(screen.getByRole('img').getAttribute('aria-label')).toMatch(/Sem gastos/);
  });
});

describe('Zoom involuntário no iOS', () => {
  const css = readFileSync(join(process.cwd(), 'src/app/globals.css'), 'utf8');
  const layout = readFileSync(join(process.cwd(), 'src/app/layout.tsx'), 'utf8');

  it('campos de formulário têm fonte mínima de 16px', () => {
    expect(css).toMatch(/input:not\(\[type="checkbox"\]\)[^{]*,\s*select,\s*textarea\s*\{[^}]*font-size:\s*16px/);
  });

  it('o viewport não bloqueia o zoom de acessibilidade', () => {
    expect(layout).not.toMatch(/maximumScale|userScalable|maximum-scale|user-scalable/);
  });
});
