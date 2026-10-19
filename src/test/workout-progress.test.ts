// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
  countCompletedDays, defaultOpenExerciseId, exerciseProgress, progressLabel, sessionProgress, sessionProgressLabel,
} from '@/modules/workouts/domain/workout-progress';

const logs = (...numbers: number[]) => numbers.map((setNumber) => ({ setNumber }));

describe('progresso de um exercício (vem dos registros reais)', () => {
  it('0/3, 1/3, 2/3 e 3/3 com o estado e o texto curto do card recolhido', () => {
    const ex = { sets: 3 };
    expect(progressLabel(exerciseProgress(ex, logs()))).toBe('0/3 séries · Não iniciado');
    expect(progressLabel(exerciseProgress(ex, logs(1)))).toBe('1/3 séries · Em andamento');
    expect(progressLabel(exerciseProgress(ex, logs(1, 2)))).toBe('2/3 séries · Em andamento');
    expect(progressLabel(exerciseProgress(ex, logs(1, 2, 3)))).toBe('3/3 séries · Concluído');
  });

  it('desfazer uma série volta o progresso na hora; desfazer todas volta a "não iniciado"', () => {
    const ex = { sets: 3 };
    expect(exerciseProgress(ex, logs(1, 2, 3)).state).toBe('done');
    expect(exerciseProgress(ex, logs(1, 3)).state).toBe('in_progress'); // série 2 desfeita
    expect(exerciseProgress(ex, logs()).state).toBe('not_started');
  });

  it('não conta a mesma série duas vezes e aceita série extra sem quebrar o total', () => {
    expect(exerciseProgress({ sets: 3 }, logs(1, 1, 2)).done).toBe(2);
    const extra = exerciseProgress({ sets: 3 }, logs(1, 2, 3, 4));
    expect(extra).toMatchObject({ done: 4, total: 4, state: 'done' });
  });

  it('um exercício de uma série só usa o singular', () => {
    expect(progressLabel(exerciseProgress({ sets: 1 }, logs()))).toBe('0/1 série · Não iniciado');
  });
});

describe('progresso do treino (indicador do cabeçalho)', () => {
  it('"Treino A · 4 de 7 exercícios concluídos"', () => {
    const items = [...Array(4)].map(() => exerciseProgress({ sets: 2 }, logs(1, 2))).concat([...Array(3)].map(() => exerciseProgress({ sets: 2 }, logs(1))));
    expect(sessionProgressLabel('A', sessionProgress(items))).toBe('Treino A · 4 de 7 exercícios concluídos');
    expect(sessionProgressLabel('B', { completed: 1, total: 1 })).toBe('Treino B · 1 de 1 exercício concluído');
  });
});

describe('qual card abre por padrão', () => {
  it('só o exercício em andamento; sem nenhum, tudo recolhido', () => {
    const p = (sets: number, ...n: number[]) => exerciseProgress({ sets }, logs(...n));
    expect(defaultOpenExerciseId([{ id: 'a', progress: p(3) }, { id: 'b', progress: p(3, 1) }, { id: 'c', progress: p(3, 1, 2, 3) }])).toBe('b');
    expect(defaultOpenExerciseId([{ id: 'a', progress: p(3) }, { id: 'c', progress: p(3, 1, 2, 3) }])).toBeNull();
  });
});

describe('treinos concluídos (A–E)', () => {
  const ex = (id: string, dayId: string, over: { removedAt?: string; hiddenAt?: string } = {}) => ({ id, dayId, ...over });
  const exercises = [ex('a1', 'A'), ex('a2', 'A'), ex('a3', 'A'), ex('a4', 'A'), ex('b1', 'B'), ex('b2', 'B')];
  const s = (id: string, status: 'completed' | 'cancelled' | 'in_progress', sessionDate: string) => ({ id, status, sessionDate });
  const t = (sessionId: string, ...ids: string[]) => ids.map((exerciseId) => ({ sessionId, exerciseId }));

  it('só sessões CONCLUÍDAS contam; em andamento e canceladas nunca', () => {
    const r = countCompletedDays({
      sessions: [s('1', 'completed', '2026-10-01'), s('2', 'cancelled', '2026-10-02'), s('3', 'in_progress', '2026-10-03')],
      touches: [...t('1', 'a1', 'a2'), ...t('2', 'a1', 'a2', 'a3', 'a4'), ...t('3', 'a1', 'a2', 'a3', 'a4')],
      exercises,
    });
    expect(r.get('A')).toEqual({ count: 1, lastCompletedOn: '2026-10-01' });
  });

  it('exige pelo menos metade dos exercícios do treino com séries na sessão', () => {
    const base = { sessions: [s('1', 'completed', '2026-10-01')], exercises };
    expect(countCompletedDays({ ...base, touches: t('1', 'a1') }).get('A')).toBeUndefined(); // 1 de 4
    expect(countCompletedDays({ ...base, touches: t('1', 'a1', 'a2') }).get('A')?.count).toBe(1); // 2 de 4
  });

  it('uma sessão geral passa por vários treinos: cada um conta só se foi mesmo feito', () => {
    const r = countCompletedDays({
      sessions: [s('1', 'completed', '2026-10-05')],
      touches: [...t('1', 'a1', 'a2', 'a3'), ...t('1', 'b1')], // B: 1 de 2 → 50% → conta; A: 3 de 4
      exercises,
    });
    expect([...r.keys()].sort()).toEqual(['A', 'B']);
    const partial = countCompletedDays({ sessions: [s('1', 'completed', '2026-10-05')], touches: [...t('1', 'a1', 'a2', 'a3'), ...t('1', 'a1')], exercises: [...exercises, ex('c1', 'C'), ex('c2', 'C'), ex('c3', 'C')] });
    expect(partial.get('C')).toBeUndefined();
  });

  it('a mesma sessão nunca conta duas vezes (várias séries, repetições nos dados, mesma sessão)', () => {
    const touches = [...t('1', 'a1', 'a2'), ...t('1', 'a1', 'a2'), ...t('1', 'a1')];
    const r = countCompletedDays({ sessions: [s('1', 'completed', '2026-10-01'), s('1', 'completed', '2026-10-01')], touches, exercises });
    expect(r.get('A')?.count).toBe(1);
  });

  it('sessão concluída sem séries do treino (registros antigos) não é adivinhada', () => {
    const r = countCompletedDays({ sessions: [s('1', 'completed', '2026-09-01')], touches: [], exercises });
    expect(r.size).toBe(0);
  });

  it('exercício removido ou oculto depois não distorce: o que foi feito continua valendo', () => {
    const withRemoved = [ex('a1', 'A'), ex('a2', 'A', { removedAt: 'x' }), ex('a3', 'A', { hiddenAt: 'x' }), ex('a4', 'A')];
    const r = countCompletedDays({ sessions: [s('1', 'completed', '2026-10-01')], touches: t('1', 'a1'), exercises: withRemoved });
    expect(r.get('A')?.count).toBe(1); // só 2 ativos: 1 de 2
  });

  it('acumula contagem e guarda a data da última conclusão', () => {
    const r = countCompletedDays({
      sessions: [s('1', 'completed', '2026-10-01'), s('2', 'completed', '2026-10-09'), s('3', 'completed', '2026-10-05')],
      touches: [...t('1', 'a1', 'a2'), ...t('2', 'a1', 'a2', 'a3'), ...t('3', 'a2', 'a4')],
      exercises,
    });
    expect(r.get('A')).toEqual({ count: 3, lastCompletedOn: '2026-10-09' });
  });
});
