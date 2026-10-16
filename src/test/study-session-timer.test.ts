import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { LearningCommands } from '@/modules/learning/application/learning.commands';
import { computeStudiedSeconds, studySessionSeconds } from '@/modules/learning/domain/learning.schema';
import {
  FakeLearningContentRepository,
  FakeStudySessionRepository,
  FakeLessonProgressRepository,
  FakeEventRepository,
} from './learning-fakes';

const WS = 'c5be4f82-e8c9-403f-a495-59e2d5838d50';

describe('sessão de estudo com pausas', () => {
  let commands: LearningCommands;
  let sessions: FakeStudySessionRepository;
  let courseId: string;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-15T12:00:00.000Z'));
    const content = new FakeLearningContentRepository();
    sessions = new FakeStudySessionRepository();
    commands = new LearningCommands(content, sessions, new FakeEventRepository(), new FakeLessonProgressRepository());
    courseId = (await commands.initializeDefaultLearningContent(WS)).id;
  });
  afterEach(() => vi.useRealTimers());

  const advance = (minutes: number) => vi.setSystemTime(new Date(Date.now() + minutes * 60_000));

  it('tempo estudado exclui o período pausado', async () => {
    const s = await commands.startStudySession(WS, courseId);
    advance(10);
    await commands.pauseStudySession(s.id);
    advance(30); // pausado por 30 min
    await commands.resumeStudySession(s.id);
    advance(5);
    const done = await commands.finishStudySession(s.id);
    expect(done.status).toBe('completed');
    expect(done.activeSeconds).toBe(15 * 60);
    expect(done.durationMinutes).toBe(15);
    expect(done.pausedTotalSeconds).toBe(30 * 60);
  });

  it('encerrar estando pausado não conta o tempo parado', async () => {
    const s = await commands.startStudySession(WS, courseId);
    advance(8);
    await commands.pauseStudySession(s.id);
    advance(60);
    const done = await commands.finishStudySession(s.id);
    expect(done.activeSeconds).toBe(8 * 60);
    expect(done.pausedAt).toBeUndefined();
  });

  it('pausar e retomar são idempotentes', async () => {
    const s = await commands.startStudySession(WS, courseId);
    advance(1);
    const p1 = await commands.pauseStudySession(s.id);
    advance(1);
    const p2 = await commands.pauseStudySession(s.id);
    expect(p2.pausedAt).toBe(p1.pausedAt);
    await commands.resumeStudySession(s.id);
    const r2 = await commands.resumeStudySession(s.id);
    expect(r2.pausedAt).toBeUndefined();
    expect(r2.pausedTotalSeconds).toBe(60);
  });

  it('sessão pausada continua sendo a única ativa', async () => {
    const s = await commands.startStudySession(WS, courseId);
    await commands.pauseStudySession(s.id);
    await expect(commands.startStudySession(WS, courseId)).rejects.toThrow(/em andamento/);
  });

  it('sessão curtíssima grava 1 min nominal mas segundos reais no progresso', async () => {
    const s = await commands.startStudySession(WS, courseId);
    vi.setSystemTime(new Date(Date.now() + 20_000));
    const done = await commands.finishStudySession(s.id);
    expect(done.durationMinutes).toBe(1);
    expect(done.activeSeconds).toBe(20);
    expect(studySessionSeconds(done, Date.now())).toBe(20);
  });

  it('só sessões concluídas entram nos segundos do dia; antigas caem em minutos*60', () => {
    const base = {
      workspaceId: WS,
      courseId: '8d2facfc-27bf-4736-97c9-b30e70fecfb6',
      source: 'session_flow' as const,
      dailyGoalMinutesSnapshot: 15,
      createdAt: '2026-10-15T12:00:00.000Z',
      updatedAt: '2026-10-15T12:00:00.000Z',
      startedAt: '2026-10-15T12:00:00.000Z',
    };
    const list = [
      { ...base, id: 'a', status: 'completed' as const, durationMinutes: 10 },
      { ...base, id: 'b', status: 'completed' as const, durationMinutes: 10, activeSeconds: 125 },
      { ...base, id: 'c', status: 'cancelled' as const },
    ];
    expect(computeStudiedSeconds(list, '2026-10-15', (iso) => iso.slice(0, 10))).toBe(600 + 125);
  });
});
