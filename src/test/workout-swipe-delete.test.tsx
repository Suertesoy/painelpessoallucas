// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { SwipeDeleteRow } from '@/components/workouts/swipe-delete-row';

afterEach(cleanup);

const touch = (x: number, y: number) => ({ touches: [{ clientX: x, clientY: y }] });
const surface = () => screen.getByTestId('swipe-surface');
const offsetOf = () => /translateX\((-?\d+(?:\.\d+)?)px\)/.exec(surface().style.transform)?.[1];

function swipe(dx: number, dy = 0) {
  fireEvent.touchStart(surface(), touch(200, 100));
  fireEvent.touchMove(surface(), touch(200 + dx, 100 + dy));
  fireEvent.touchEnd(surface());
}

describe('deslizar para excluir (touch)', () => {
  it('deslizar para a esquerda revela "Excluir" e NÃO executa a exclusão', () => {
    const onRequestDelete = vi.fn();
    render(<SwipeDeleteRow onRequestDelete={onRequestDelete}><p>Treino A</p></SwipeDeleteRow>);
    swipe(-120);
    expect(offsetOf()).toBe('-96');
    expect(onRequestDelete).not.toHaveBeenCalled();
  });

  it('tocar em Excluir só pede a confirmação (uma chamada) e fecha a linha', () => {
    const onRequestDelete = vi.fn();
    render(<SwipeDeleteRow onRequestDelete={onRequestDelete}><p>Treino A</p></SwipeDeleteRow>);
    swipe(-120);
    fireEvent.click(screen.getByRole('button', { name: 'Excluir' }));
    expect(onRequestDelete).toHaveBeenCalledTimes(1);
    expect(offsetOf()).toBe('0');
  });

  it('gesto vertical (rolagem) não move a linha', () => {
    render(<SwipeDeleteRow onRequestDelete={vi.fn()}><p>Treino A</p></SwipeDeleteRow>);
    swipe(-10, 80);
    expect(offsetOf()).toBe('0');
  });

  it('deslize curto volta ao lugar; deslizar para a direita não abre', () => {
    render(<SwipeDeleteRow onRequestDelete={vi.fn()}><p>Treino A</p></SwipeDeleteRow>);
    swipe(-30);
    expect(offsetOf()).toBe('0');
    swipe(90);
    expect(offsetOf()).toBe('0');
  });

  it('mantém touch-action pan-y para não atrapalhar a rolagem vertical do iPhone', () => {
    render(<SwipeDeleteRow onRequestDelete={vi.fn()}><p>Treino A</p></SwipeDeleteRow>);
    expect(surface().style.touchAction).toBe('pan-y');
  });
});
