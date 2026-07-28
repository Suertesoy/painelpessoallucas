import { describe, it, expect } from 'vitest';
import {
  computeStudiedMinutes,
  isDailyGoalMet,
  computeCourseProgress,
  CourseSchema,
  LearningModule,
  StudySession,
} from '@/modules/learning/domain/learning.schema';

const WORKSPACE_ID = 'c5be4f82-e8c9-403f-a495-59e2d5838d50';
const COURSE_ID = 'a00df540-da81-4195-af8e-9b0e1115bc03';

function session(overrides: Partial<StudySession> = {}): StudySession {
  return {
    id: '74ca335a-3d5e-4297-81fe-c4bba627b51b',
    workspaceId: WORKSPACE_ID,
    courseId: COURSE_ID,
    startedAt: '2026-07-28T11:00:00.000Z',
    status: 'completed',
    source: 'session_flow',
    dailyGoalMinutesSnapshot: 15,
    durationMinutes: 10,
    createdAt: '2026-07-28T11:00:00.000Z',
    updatedAt: '2026-07-28T11:00:00.000Z',
    ...overrides,
  };
}

const localDayOf = (iso: string) => iso.slice(0, 10); // determinístico para o teste puro

describe('computeStudiedMinutes', () => {
  it('soma apenas sessões concluídas do dia informado', () => {
    const sessions = [
      session({ durationMinutes: 10 }),
      session({ durationMinutes: 5, status: 'in_progress' }),
      session({ durationMinutes: 20, startedAt: '2026-07-27T11:00:00.000Z' }),
    ];
    expect(computeStudiedMinutes(sessions, '2026-07-28', localDayOf)).toBe(10);
  });

  it('retorna 0 quando não há sessões no dia', () => {
    expect(computeStudiedMinutes([], '2026-07-28', localDayOf)).toBe(0);
  });
});

describe('isDailyGoalMet', () => {
  it('meta é considerada concluída ao atingir exatamente o valor da meta', () => {
    expect(isDailyGoalMet(15, 15)).toBe(true);
  });
  it('meta não é concluída abaixo do valor', () => {
    expect(isDailyGoalMet(14, 15)).toBe(false);
  });
  it('meta permanece concluída acima do valor (sessões adicionais)', () => {
    expect(isDailyGoalMet(25, 15)).toBe(true);
  });
});

describe('computeCourseProgress', () => {
  const mod = (status: LearningModule['status']): LearningModule => ({
    id: crypto.randomUUID(),
    workspaceId: WORKSPACE_ID,
    courseId: COURSE_ID,
    title: 'Módulo',
    position: 0,
    status,
    lessonsCount: 0,
    createdAt: '2026-07-28T11:00:00.000Z',
    updatedAt: '2026-07-28T11:00:00.000Z',
  });

  it('retorna 0% sem módulos concluídos (progresso estrutural honesto)', () => {
    expect(computeCourseProgress([mod('available'), mod('locked')])).toBe(0);
  });

  it('nunca deriva progresso de tempo estudado — apenas de módulos concluídos', () => {
    expect(computeCourseProgress([mod('completed'), mod('locked'), mod('locked'), mod('locked')])).toBe(25);
  });

  it('retorna 0 quando não há módulos', () => {
    expect(computeCourseProgress([])).toBe(0);
  });
});

describe('CourseSchema — validação da meta diária', () => {
  const base = {
    id: crypto.randomUUID(),
    workspaceId: WORKSPACE_ID,
    slug: 'japones',
    title: 'Japonês',
    status: 'active' as const,
    createdAt: '2026-07-28T11:00:00.000Z',
    updatedAt: '2026-07-28T11:00:00.000Z',
  };

  it('rejeita meta abaixo de 5 minutos', () => {
    expect(() => CourseSchema.parse({ ...base, dailyGoalMinutes: 4 })).toThrow();
  });

  it('rejeita meta acima de 180 minutos', () => {
    expect(() => CourseSchema.parse({ ...base, dailyGoalMinutes: 181 })).toThrow();
  });

  it('aceita metas dentro do intervalo permitido', () => {
    expect(() => CourseSchema.parse({ ...base, dailyGoalMinutes: 5 })).not.toThrow();
    expect(() => CourseSchema.parse({ ...base, dailyGoalMinutes: 180 })).not.toThrow();
    expect(() => CourseSchema.parse({ ...base, dailyGoalMinutes: 15 })).not.toThrow();
  });
});
