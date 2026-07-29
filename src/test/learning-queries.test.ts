import { describe, it, expect } from 'vitest';
import { LearningCommands } from '@/modules/learning/application/learning.commands';
import { LearningQueries } from '@/modules/learning/application/learning.queries';
import { datetimeLocalToISO, todayDateStr } from '@/lib/dates';
import {
  FakeLearningContentRepository,
  FakeStudySessionRepository,
  FakeLessonProgressRepository,
  FakeEventRepository,
} from './learning-fakes';

const WORKSPACE_A = 'c5be4f82-e8c9-403f-a495-59e2d5838d50';
const COURSE_ID = 'a00df540-da81-4195-af8e-9b0e1115bc03';

function setup() {
  const contentRepo = new FakeLearningContentRepository();
  const sessionRepo = new FakeStudySessionRepository();
  const progressRepo = new FakeLessonProgressRepository();
  const eventRepo = new FakeEventRepository();
  const commands = new LearningCommands(contentRepo, sessionRepo, eventRepo, progressRepo);
  const queries = new LearningQueries(contentRepo, sessionRepo, progressRepo);
  return { commands, queries, sessionRepo, progressRepo };
}

describe('LearningQueries — dashboard', () => {
  it('compõe cursos, módulos, preferências, resumo do dia e sessão ativa', async () => {
    const { commands, queries } = setup();
    const course = await commands.initializeDefaultLearningContent(WORKSPACE_A);

    const dashboard = await queries.getLearningDashboard(todayDateStr());

    expect(dashboard.courses).toHaveLength(1);
    expect(dashboard.courses[0].id).toBe(course.id);
    expect(dashboard.modulesByCourse[course.id]).toHaveLength(5);
    expect(dashboard.preferences.defaultDailyGoalMinutes).toBe(15);
    expect(dashboard.today.minutesStudied).toBe(0);
    expect(dashboard.today.goalMet).toBe(false);
    expect(dashboard.activeSession).toBeNull();
  });

  it('reflete a sessão ativa e o total estudado no dia', async () => {
    const { commands, queries } = setup();
    const course = await commands.initializeDefaultLearningContent(WORKSPACE_A);
    const session = await commands.startStudySession(WORKSPACE_A, course.id);
    await commands.completeStudySession(session.id, { durationMinutes: 15 });

    const dashboard = await queries.getLearningDashboard(todayDateStr());

    expect(dashboard.today.minutesStudied).toBe(15);
    expect(dashboard.today.goalMet).toBe(true);
    expect(dashboard.activeSession).toBeNull();
    expect(dashboard.recentSessions.some((s) => s.id === session.id)).toBe(true);
  });
});

describe('LearningQueries — reatividade da meta diária', () => {
  it('dashboard reflete a nova meta diária imediatamente após a alteração', async () => {
    const { commands, queries } = setup();
    await commands.initializeDefaultLearningContent(WORKSPACE_A);

    let dashboard = await queries.getLearningDashboard(todayDateStr());
    expect(dashboard.today.goalMinutes).toBe(15);

    await commands.updateLearningPreferences(WORKSPACE_A, { defaultDailyGoalMinutes: 20 });

    dashboard = await queries.getLearningDashboard(todayDateStr());
    expect(dashboard.today.goalMinutes).toBe(20);
    expect(dashboard.preferences.defaultDailyGoalMinutes).toBe(20);
  });

  it('getTodayStudySummary (usado pela página do curso) reflete a meta atualizada', async () => {
    const { commands, queries } = setup();
    await commands.initializeDefaultLearningContent(WORKSPACE_A);
    await commands.updateLearningPreferences(WORKSPACE_A, { defaultDailyGoalMinutes: 20 });

    const preferences = await queries.getLearningPreferences();
    const summary = await queries.getTodayStudySummary(todayDateStr(), preferences!.defaultDailyGoalMinutes);
    expect(summary.goalMinutes).toBe(20);
  });
});

describe('LearningQueries — getTodayStudySummary (dia local)', () => {
  it('soma apenas sessões concluídas cujo dia local de início é o dia consultado', async () => {
    const { sessionRepo, queries } = setup();

    // 08:00 local de hoje — dentro do dia consultado.
    const todayMorning = datetimeLocalToISO(`${todayDateStr()}T08:00`)!;
    await sessionRepo.save({
      id: 'a6af135d-77ce-438e-88ca-b409c440cb75',
      workspaceId: WORKSPACE_A,
      courseId: COURSE_ID,
      startedAt: todayMorning,
      endedAt: todayMorning,
      durationMinutes: 20,
      status: 'completed',
      source: 'session_flow',
      dailyGoalMinutesSnapshot: 15,
      createdAt: todayMorning,
      updatedAt: todayMorning,
    });

    // 23:30 local de ONTEM — não deve contar para o dia consultado (hoje).
    const yesterday = new Date(`${todayDateStr()}T00:00:00`);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;
    const yesterdayNight = datetimeLocalToISO(`${yesterdayStr}T23:30`)!;
    await sessionRepo.save({
      id: 'ab1348c2-8b94-420e-a892-82431c9611fa',
      workspaceId: WORKSPACE_A,
      courseId: COURSE_ID,
      startedAt: yesterdayNight,
      endedAt: yesterdayNight,
      durationMinutes: 20,
      status: 'completed',
      source: 'session_flow',
      dailyGoalMinutesSnapshot: 15,
      createdAt: yesterdayNight,
      updatedAt: yesterdayNight,
    });

    // Sessão em andamento (não concluída) hoje — não deve contar.
    const todayNoon = datetimeLocalToISO(`${todayDateStr()}T12:00`)!;
    await sessionRepo.save({
      id: 'a75076b6-20eb-4076-9a28-d07b4f7ef73c',
      workspaceId: WORKSPACE_A,
      courseId: COURSE_ID,
      startedAt: todayNoon,
      status: 'in_progress',
      source: 'session_flow',
      dailyGoalMinutesSnapshot: 15,
      createdAt: todayNoon,
      updatedAt: todayNoon,
    });

    const summary = await queries.getTodayStudySummary(todayDateStr(), 15);
    expect(summary.minutesStudied).toBe(20);
    expect(summary.goalMet).toBe(true);
  });

  it('meta diária concluída assim que atingir 15 minutos, e sessões adicionais continuam somando', async () => {
    const { commands, queries } = setup();
    const course = await commands.initializeDefaultLearningContent(WORKSPACE_A);

    const s1 = await commands.startStudySession(WORKSPACE_A, course.id);
    await commands.completeStudySession(s1.id, { durationMinutes: 15 });

    let summary = await queries.getTodayStudySummary(todayDateStr(), 15);
    expect(summary.minutesStudied).toBe(15);
    expect(summary.goalMet).toBe(true);

    const s2 = await commands.startStudySession(WORKSPACE_A, course.id);
    await commands.completeStudySession(s2.id, { durationMinutes: 10 });

    summary = await queries.getTodayStudySummary(todayDateStr(), 15);
    expect(summary.minutesStudied).toBe(25);
    expect(summary.goalMet).toBe(true);
  });
});
