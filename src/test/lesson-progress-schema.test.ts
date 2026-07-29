import { describe, it, expect } from 'vitest';
import { LessonProgressSchema, hasPendingExercises } from '@/modules/learning/domain/lesson-progress.schema';

const WORKSPACE_ID = '22222222-2222-4222-8222-222222222222';
const COURSE_ID = '44444444-4444-4444-8444-444444444444';
const MODULE_ID = '33333333-3333-4333-8333-333333333333';
const LESSON_ID = '11111111-1111-4111-8111-111111111111';

function baseProgress(overrides: Record<string, unknown> = {}) {
  return {
    id: '55555555-5555-4555-8555-555555555555',
    workspaceId: WORKSPACE_ID,
    courseId: COURSE_ID,
    moduleId: MODULE_ID,
    lessonId: LESSON_ID,
    totalExercises: 2,
    answeredCount: 1,
    resolvedCount: 0,
    attempts: { mc: { firstOutcome: 'incorrect', latestOutcome: 'incorrect', attemptCount: 1 } },
    status: 'in_progress',
    startedAt: '2026-07-29T10:00:00.000Z',
    lastActivityAt: '2026-07-29T10:00:00.000Z',
    createdAt: '2026-07-29T10:00:00.000Z',
    updatedAt: '2026-07-29T10:00:00.000Z',
    ...overrides,
  };
}

describe('hasPendingExercises — só decide o aviso de confirmação, nunca bloqueia completeLesson', () => {
  it('lição sem exercícios não tem pendências', () => {
    expect(hasPendingExercises(0, 0)).toBe(false);
  });

  it('exercícios ainda não resolvidos são pendências', () => {
    expect(hasPendingExercises(3, 1)).toBe(true);
  });

  it('todos os exercícios resolvidos: sem pendências', () => {
    expect(hasPendingExercises(3, 3)).toBe(false);
  });
});

describe('LessonProgressSchema — consistência entre attempts e contadores', () => {
  it('aceita um progresso consistente', () => {
    expect(() => LessonProgressSchema.parse(baseProgress())).not.toThrow();
  });

  it('rejeita answeredCount que não bate com o tamanho de attempts', () => {
    expect(() => LessonProgressSchema.parse(baseProgress({ answeredCount: 5 }))).toThrow(/answeredCount/);
  });

  it('rejeita resolvedCount que não bate com os resolvidos em attempts', () => {
    expect(() => LessonProgressSchema.parse(baseProgress({ resolvedCount: 1 }))).toThrow(/resolvedCount/);
  });

  it('rejeita answeredCount maior que totalExercises', () => {
    expect(() =>
      LessonProgressSchema.parse(
        baseProgress({
          totalExercises: 1,
          answeredCount: 2,
          resolvedCount: 0,
          attempts: {
            a: { firstOutcome: 'incorrect', latestOutcome: 'incorrect', attemptCount: 1 },
            b: { firstOutcome: 'incorrect', latestOutcome: 'incorrect', attemptCount: 1 },
          },
        })
      )
    ).toThrow(/não pode exceder/);
  });

  it('rejeita resolvedCount maior que answeredCount', () => {
    expect(() => LessonProgressSchema.parse(baseProgress({ resolvedCount: 2, answeredCount: 1 }))).toThrow();
  });

  it('rejeita completedAt presente quando status não é completed', () => {
    expect(() =>
      LessonProgressSchema.parse(baseProgress({ completedAt: '2026-07-29T10:05:00.000Z', status: 'in_progress' }))
    ).toThrow(/completedAt/);
  });

  it('aceita um exercício resolvido (firstOutcome incorreto, latestOutcome correto)', () => {
    const progress = baseProgress({
      resolvedCount: 1,
      attempts: {
        mc: { firstOutcome: 'incorrect', latestOutcome: 'correct', attemptCount: 2, resolvedAt: '2026-07-29T10:01:00.000Z' },
      },
    });
    expect(() => LessonProgressSchema.parse(progress)).not.toThrow();
    const parsed = LessonProgressSchema.parse(progress);
    // firstOutcome preservado mesmo depois de resolvido numa tentativa posterior.
    expect(parsed.attempts.mc.firstOutcome).toBe('incorrect');
    expect(parsed.attempts.mc.latestOutcome).toBe('correct');
  });
});
