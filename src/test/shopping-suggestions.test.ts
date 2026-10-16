import { describe, it, expect } from 'vitest';
import {
  buildKnownItems,
  editDistance,
  normalizeItemKey,
  suggestCorrection,
  suggestRecurring,
} from '@/modules/shopping/domain/shopping-suggestions';

const day = (n: number) => new Date(Date.UTC(2026, 9, 1 + n, 12)).toISOString();
const entry = (title: string, n: number) => ({ title, createdAt: day(n) });

describe('normalização e distância', () => {
  it('ignora acentos, caixa, pontuação e espaços', () => {
    expect(normalizeItemKey('  Açúcar  Refinado! ')).toBe('acucar refinado');
  });
  it('transposição conta 1', () => {
    expect(editDistance('leite', 'liete')).toBe(1);
    expect(editDistance('arroz', 'aroz')).toBe(1);
    expect(editDistance('arroz', 'feijao')).toBeGreaterThan(2);
  });
});

describe('sugestão de correção ("acho que você quis dizer…")', () => {
  const known = buildKnownItems([entry('Leite', 0), entry('Leite', 7), entry('Arroz', 0), entry('Sabão em pó', 3)]);

  it('erro de digitação de um item conhecido vira sugestão', () => {
    expect(suggestCorrection('Leitte', known)?.label).toBe('Leite');
    expect(suggestCorrection('aroz', known)?.label).toBe('Arroz');
    expect(suggestCorrection('Sabao em po', known)).toBeNull(); // normaliza para o mesmo item: já é conhecido
    expect(suggestCorrection('sabão em pó', known)).toBeNull();
    expect(suggestCorrection('sabao em poo', known)?.label).toBe('Sabão em pó');
  });
  it('item já conhecido ou claramente diferente não gera sugestão', () => {
    expect(suggestCorrection('leite', known)).toBeNull();
    expect(suggestCorrection('Queijo', known)).toBeNull();
  });
  it('palavras curtas (≤3 letras) nunca geram sugestão', () => {
    expect(suggestCorrection('ovo', buildKnownItems([entry('Ovos', 0)]))).toBeNull();
  });
  it('em empate vence o mais frequente', () => {
    const k = buildKnownItems([entry('Pao', 0), entry('Pau', 1), entry('Pau', 2)]);
    expect(k.length).toBe(2);
    // "pai" está a 1 letra de ambos, mas tem 3 letras: sem sugestão
    expect(suggestCorrection('pai', k)).toBeNull();
    const k2 = buildKnownItems([entry('Cafe', 0), entry('Cafa', 1), entry('Cafa', 2)]);
    expect(suggestCorrection('Cafo', k2)?.label).toBe('Cafa');
  });
});

describe('itens recorrentes', () => {
  const now = new Date(day(30));

  it('mede quantas vezes e o intervalo médio entre as adições', () => {
    const [leite] = buildKnownItems([entry('Leite', 0), entry('leite', 7), entry('LEITE', 14)]);
    expect(leite.count).toBe(3);
    expect(leite.avgIntervalDays).toBeCloseTo(7, 1);
    expect(leite.label).toBe('LEITE');
  });

  it('sugere o que já passou do intervalo habitual, antes dos frequentes', () => {
    const known = buildKnownItems([
      entry('Leite', 0), entry('Leite', 7), entry('Leite', 14), // última em 14, intervalo 7 → 16 dias: atrasado
      entry('Arroz', 0), entry('Arroz', 20), entry('Arroz', 28), // intervalo 14, última há 2 dias: ainda cedo
      entry('Sal', 0), entry('Sal', 1), entry('Sal', 2), entry('Sal', 29), // frequente, recente
    ]);
    const s = suggestRecurring(known, new Set(), now);
    expect(s[0]).toMatchObject({ label: 'Leite', reason: 'due' });
    expect(s.find((x) => x.label === 'Arroz')?.reason).not.toBe('due');
    expect(s.find((x) => x.label === 'Sal')?.reason).toBe('frequent');
  });

  it('não sugere o que já está pendente nem o que só apareceu uma vez', () => {
    const known = buildKnownItems([entry('Leite', 0), entry('Leite', 7), entry('Café', 3)]);
    expect(suggestRecurring(known, new Set(['leite']), now)).toEqual([]);
  });

  it('respeita o limite', () => {
    const many = Array.from({ length: 12 }, (_, i) => [entry(`Item ${i}`, 0), entry(`Item ${i}`, 2)]).flat();
    expect(suggestRecurring(buildKnownItems(many), new Set(), now, 5)).toHaveLength(5);
  });
});
