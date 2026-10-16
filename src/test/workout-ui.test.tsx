// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { LoadField } from '@/components/workouts/load-field';
import { AthleteSwitch } from '@/components/workouts/athlete-switch';

afterEach(cleanup);

describe('LoadField (carga do exercício)', () => {
  it('mostra rótulo claro, unidade e valor; − e + gravam na hora', () => {
    const onCommit = vi.fn();
    const onChange = vi.fn();
    render(<LoadField initial={40} onCommit={onCommit} onChange={onChange} />);
    expect(screen.getByText('Carga')).toBeTruthy();
    expect(screen.getByText('kg')).toBeTruthy();
    expect((screen.getByLabelText('Carga') as HTMLInputElement).value).toBe('40');
    fireEvent.click(screen.getByRole('button', { name: /Aumentar 1 kg/ }));
    expect(onCommit).toHaveBeenLastCalledWith(41);
    expect(onChange).toHaveBeenLastCalledWith(41);
    fireEvent.click(screen.getByRole('button', { name: /Diminuir 1 kg/ }));
    fireEvent.click(screen.getByRole('button', { name: /Diminuir 1 kg/ }));
    expect(onCommit).toHaveBeenLastCalledWith(39);
  });

  it('digitar com vírgula grava ao sair do campo; inválido não grava; nunca fica negativa', () => {
    const onCommit = vi.fn();
    render(<LoadField initial={undefined} onCommit={onCommit} />);
    const input = screen.getByLabelText('Carga') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '22,5' } });
    fireEvent.blur(input);
    expect(onCommit).toHaveBeenLastCalledWith(22.5);
    onCommit.mockClear();
    fireEvent.change(input, { target: { value: 'abc' } });
    fireEvent.blur(input);
    expect(onCommit).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: '0' } });
    fireEvent.click(screen.getByRole('button', { name: /Diminuir 1 kg/ }));
    expect(onCommit).toHaveBeenLastCalledWith(0);
  });
});

describe('AthleteSwitch (Lucas | Matheus)', () => {
  const athletes = [
    { id: 'a', workspaceId: 'w', name: 'Lucas', position: 0, createdAt: '', updatedAt: '' },
    { id: 'b', workspaceId: 'w', name: 'Matheus', position: 1, createdAt: '', updatedAt: '' },
  ];
  it('alterna com um toque e marca de quem é o treino', () => {
    const onChange = vi.fn();
    render(<AthleteSwitch athletes={athletes} value="a" ownId="a" onChange={onChange} />);
    expect(screen.getByRole('tab', { name: /Lucas/ }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('tab', { name: /Lucas/ }).textContent).toContain('(treino)');
    fireEvent.click(screen.getByRole('tab', { name: /Matheus/ }));
    expect(onChange).toHaveBeenCalledWith('b');
    expect(screen.getByRole('tab', { name: /Matheus/ }).className).toContain('min-h-11');
  });
});
