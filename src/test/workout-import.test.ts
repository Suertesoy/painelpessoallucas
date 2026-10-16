import { describe, it, expect } from 'vitest';
import { parseLoad, parseRest, parseSetsReps } from '@/modules/workouts/import/sheet-parser';
import { buildImportPlan, summarizePlan } from '@/modules/workouts/import/import-plan';
import { SHEET_DAYS } from '@/modules/workouts/import/sheet-seed';

describe('parser da planilha — só converte o inequívoco', () => {
  it('séries × repetições', () => {
    expect(parseSetsReps('3x10-12')).toMatchObject({ sets: 3, repsMin: 10, repsMax: 12, ambiguous: false });
    expect(parseSetsReps('2x15')).toMatchObject({ sets: 2, repsMin: 15, repsMax: 15 });
    expect(parseSetsReps('3x10-12 (cada perna)')).toMatchObject({ repsNote: 'cada perna' });
    expect(parseSetsReps('3x10-15 (2s topo, 2s exc)')).toMatchObject({ sets: 3, repsMax: 15, repsNote: '2s topo, 2s exc' });
  });
  it('"10min" é tempo, não séries — ambíguo e preservado', () => {
    expect(parseSetsReps('10min')).toMatchObject({ ambiguous: true, repsNote: '10min' });
  });

  it('descanso: unidades claras viram segundos (faixa = limite superior)', () => {
    expect(parseRest('90')).toMatchObject({ seconds: 90, ambiguous: false });
    expect(parseRest('45-60')).toMatchObject({ seconds: 60, ambiguous: false });
    expect(parseRest('60-90 seg')).toMatchObject({ seconds: 90 });
    expect(parseRest('3min')).toMatchObject({ seconds: 180 });
    expect(parseRest('2-3min')).toMatchObject({ seconds: 180 });
    expect(parseRest('2 mim')).toMatchObject({ seconds: 120 });
  });
  it('descanso "2" sem unidade é ambíguo e não vira número', () => {
    const r = parseRest('2');
    expect(r).toMatchObject({ ambiguous: true, note: '2' });
    expect(r?.seconds).toBeUndefined();
  });

  it('cargas', () => {
    expect(parseLoad('43')).toEqual({ loadKg: 43, ambiguous: false });
    expect(parseLoad('')).toBeNull();
    expect(parseLoad(undefined)).toBeNull();
    expect(parseLoad('20x20')).toEqual({ note: '20x20', ambiguous: true });
  });
});

describe('plano de importação da planilha Treino Marcio Seco 2', () => {
  const plan = buildImportPlan();
  const find = (day: string, name: string) => plan.find((p) => p.dayCode === day && p.name === name)!;

  it('traz os 5 treinos com 7, 8, 7, 9 e 7 exercícios, na ordem da planilha', () => {
    const counts = ['A', 'B', 'C', 'D', 'E'].map((d) => plan.filter((p) => p.dayCode === d).length);
    expect(counts).toEqual([7, 8, 7, 9, 7]);
    expect(plan.filter((p) => p.dayCode === 'A').map((p) => p.name)[0]).toBe('Cadeira adutora');
    expect(plan.filter((p) => p.dayCode === 'A').map((p) => p.position)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it('exercício limpo vira dado definitivo, com cargas por pessoa', () => {
    const e = find('A', 'Cadeira adutora');
    expect(e).toMatchObject({ sets: 2, repsMin: 12, repsMax: 15, restSeconds: 60, needsReview: false });
    expect(e.loads.matheus).toEqual({ loadKg: 50 });
    expect(e.loads.lucas).toEqual({ loadKg: 43 });
  });

  it('carga em branco não vira zero', () => {
    const e = find('C', 'Remada baixa fechada');
    expect(e.loads.matheus).toEqual({ loadKg: 50 });
    expect(e.loads.lucas).toBeUndefined();
    expect(find('A', 'Flexão nórdica reversa').loads).toEqual({});
  });

  it('marcador X é ignorado: nunca gera alerta nem muda o exercício', () => {
    for (const [d, n] of [['B', 'Supino fechado cross'], ['C', 'Puxada supinada']]) {
      expect(find(d, n).needsReview).toBe(false);
      expect(find(d, n).flags).toEqual([]);
    }
  });

  it('dia D: cargas sem rótulo Mat/Lu NÃO são atribuídas a ninguém', () => {
    const e = find('D', 'Triceps - barra reta polia alta');
    expect(e.loads).toEqual({});
    expect(e.needsReview).toBe(true);
    expect(e.sourceNote).toMatch(/sem rótulo de pessoa/);
    expect(e.sourceNote).toMatch(/45/);
    expect(e.editable.loads).toBe(true);
    expect(e.suggestedLoads).toEqual({ matheus: { loadKg: 45 }, lucas: { loadKg: 45 } });
  });

  it('valores ambíguos: Stiff 20x20, descanso "2", Abdominal 10min', () => {
    const stiff = find('E', 'Stiff');
    expect(stiff.loads.matheus).toEqual({ loadNote: '20x20' });
    expect(stiff.needsReview).toBe(true);
    const nordica = find('E', 'Flexão nórdica');
    expect(nordica.restSeconds).toBeUndefined();
    expect(nordica.needsReview).toBe(true);
    const abs = find('B', 'Abdominal');
    expect(abs.repsNote).toBe('10min (por duração)');
    expect(abs.needsReview).toBe(false);
    expect(nordica.editable.rest).toBe(true);
  });

  it('resumo: total e a confirmar', () => {
    const s = summarizePlan(plan);
    expect(s.total).toBe(38);
    expect(s.needsReview).toBe(plan.filter((p) => p.flags.length > 0).length);
    expect(SHEET_DAYS.flatMap((d) => d.rows)).toHaveLength(38);
  });
});
