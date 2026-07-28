import { format, addDays, parseISO } from 'date-fns';
import { dateInputToISO, isoToDateInput } from '@/lib/dates';
import { LearningContentRepository } from './learning-content.repository';
import { StudySessionRepository } from './study-session.repository';
import {
  Course,
  LearningModule,
  Lesson,
  LearningPreferences,
  CoursePreferences,
  StudySession,
  LearningDashboard,
  computeStudiedMinutes,
  isDailyGoalMet,
} from '../domain/learning.schema';

const RECENT_SESSIONS_LIMIT = 10;
const DEFAULT_GOAL_MINUTES_FALLBACK = 15;

/** Limites [início, fim) do dia local (America/Sao_Paulo) em ISO 8601. */
function localDayRangeISO(today: string): { startISO: string; endISO: string } {
  const startISO = dateInputToISO(today)!;
  const nextDay = format(addDays(parseISO(`${today}T00:00:00`), 1), 'yyyy-MM-dd');
  const endISO = dateInputToISO(nextDay)!;
  return { startISO, endISO };
}

export class LearningQueries {
  constructor(
    private contentRepo: LearningContentRepository,
    private sessionRepo: StudySessionRepository
  ) {}

  listCourses(): Promise<Course[]> {
    return this.contentRepo.listCourses();
  }

  getCourseById(id: string): Promise<Course | null> {
    return this.contentRepo.findCourseById(id);
  }

  getModuleById(moduleId: string): Promise<LearningModule | null> {
    return this.contentRepo.findModuleById(moduleId);
  }

  listModulesByCourse(courseId: string): Promise<LearningModule[]> {
    return this.contentRepo.listModulesByCourse(courseId);
  }

  listLessonsByModule(moduleId: string): Promise<Lesson[]> {
    return this.contentRepo.listLessonsByModule(moduleId);
  }

  getLearningPreferences(): Promise<LearningPreferences | null> {
    return this.contentRepo.findPreferences();
  }

  getCoursePreferences(courseId: string): Promise<CoursePreferences | null> {
    return this.contentRepo.findCoursePreferences(courseId);
  }

  getActiveStudySession(): Promise<StudySession | null> {
    return this.sessionRepo.findActive();
  }

  listRecentStudySessions(limit = RECENT_SESSIONS_LIMIT): Promise<StudySession[]> {
    return this.sessionRepo.listRecent(limit);
  }

  async getTodayStudySummary(
    today: string,
    goalMinutes: number
  ): Promise<{ minutesStudied: number; goalMinutes: number; goalMet: boolean }> {
    const { startISO, endISO } = localDayRangeISO(today);
    const sessions = await this.sessionRepo.findByDateRange(startISO, endISO);
    const minutesStudied = computeStudiedMinutes(sessions, today, isoToDateInput);
    return { minutesStudied, goalMinutes, goalMet: isDailyGoalMet(minutesStudied, goalMinutes) };
  }

  /** Composição para o dashboard de `/aprendizado`. */
  async getLearningDashboard(today: string): Promise<LearningDashboard> {
    const [courses, preferencesRaw, activeSession, recentSessions] = await Promise.all([
      this.contentRepo.listCourses(),
      this.contentRepo.findPreferences(),
      this.sessionRepo.findActive(),
      this.sessionRepo.listRecent(RECENT_SESSIONS_LIMIT),
    ]);

    const preferences: LearningPreferences =
      preferencesRaw ?? {
        workspaceId: courses[0]?.workspaceId ?? '',
        defaultDailyGoalMinutes: DEFAULT_GOAL_MINUTES_FALLBACK,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

    const modulesByCourse: Record<string, LearningModule[]> = {};
    await Promise.all(
      courses.map(async (course) => {
        modulesByCourse[course.id] = await this.contentRepo.listModulesByCourse(course.id);
      })
    );

    const { startISO, endISO } = localDayRangeISO(today);
    const todaySessions = await this.sessionRepo.findByDateRange(startISO, endISO);
    const minutesStudied = computeStudiedMinutes(todaySessions, today, isoToDateInput);

    return {
      courses,
      modulesByCourse,
      preferences,
      today: {
        minutesStudied,
        goalMinutes: preferences.defaultDailyGoalMinutes,
        goalMet: isDailyGoalMet(minutesStudied, preferences.defaultDailyGoalMinutes),
      },
      activeSession,
      recentSessions,
    };
  }
}
