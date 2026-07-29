'use client';

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  Course,
  CourseSchema,
  LearningModule,
  LearningModuleSchema,
  Lesson,
  LessonSchema,
  LearningPreferences,
  LearningPreferencesSchema,
  CoursePreferences,
  CoursePreferencesSchema,
} from '../domain/learning.schema';
import { LearningContentRepository } from '../application/learning-content.repository';
import { ChangeNotifier } from '@/platform/supabase/change-notifier';

type Row = Record<string, unknown>;

function courseRowToDomain(row: Row): Course {
  return CourseSchema.parse({
    id: row.id,
    workspaceId: row.workspace_id,
    slug: row.slug,
    title: row.title,
    description: row.description ?? undefined,
    status: row.status,
    dailyGoalMinutes: row.daily_goal_minutes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

function moduleRowToDomain(row: Row): LearningModule {
  return LearningModuleSchema.parse({
    id: row.id,
    workspaceId: row.workspace_id,
    courseId: row.course_id,
    title: row.title,
    description: row.description ?? undefined,
    position: row.position,
    status: row.status,
    lessonsCount: row.lessons_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

function lessonRowToDomain(row: Row): Lesson {
  return LessonSchema.parse({
    id: row.id,
    workspaceId: row.workspace_id,
    moduleId: row.module_id,
    contentKey: row.content_key,
    title: row.title,
    description: row.description ?? undefined,
    position: row.position,
    content: row.content,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

function preferencesRowToDomain(row: Row): LearningPreferences {
  return LearningPreferencesSchema.parse({
    workspaceId: row.workspace_id,
    defaultDailyGoalMinutes: row.default_daily_goal_minutes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

function coursePreferencesRowToDomain(row: Row): CoursePreferences {
  return CoursePreferencesSchema.parse({
    workspaceId: row.workspace_id,
    courseId: row.course_id,
    showRomaji: row.show_romaji,
    showFurigana: row.show_furigana,
    showTranslation: row.show_translation,
    autoPlayAudio: row.auto_play_audio,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

export class SupabaseLearningContentRepository implements LearningContentRepository {
  constructor(
    private supabase: SupabaseClient,
    private workspaceId: string,
    private notifier: ChangeNotifier
  ) {}

  async findCourseBySlug(slug: string): Promise<Course | null> {
    const { data, error } = await this.supabase
      .from('learning_courses')
      .select('*')
      .eq('workspace_id', this.workspaceId)
      .eq('slug', slug)
      .maybeSingle();
    if (error) throw new Error(`Não foi possível carregar o curso: ${error.message}`);
    return data ? courseRowToDomain(data) : null;
  }

  async findCourseById(id: string): Promise<Course | null> {
    const { data, error } = await this.supabase
      .from('learning_courses')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) throw new Error(`Não foi possível carregar o curso: ${error.message}`);
    return data ? courseRowToDomain(data) : null;
  }

  async listCourses(): Promise<Course[]> {
    const { data, error } = await this.supabase
      .from('learning_courses')
      .select('*')
      .eq('workspace_id', this.workspaceId)
      .order('created_at', { ascending: true });
    if (error) throw new Error(`Não foi possível carregar os cursos: ${error.message}`);
    return (data ?? []).map(courseRowToDomain);
  }

  async saveCourse(course: Course): Promise<void> {
    const { error } = await this.supabase.from('learning_courses').upsert(
      {
        id: course.id,
        workspace_id: course.workspaceId,
        slug: course.slug,
        title: course.title,
        description: course.description ?? null,
        status: course.status,
        daily_goal_minutes: course.dailyGoalMinutes,
        created_at: course.createdAt,
      },
      { onConflict: 'id' }
    );
    if (error) throw new Error(`Não foi possível salvar o curso: ${error.message}`);
    this.notifier.notify();
  }

  async findModuleById(id: string): Promise<LearningModule | null> {
    const { data, error } = await this.supabase
      .from('learning_modules')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) throw new Error(`Não foi possível carregar o módulo: ${error.message}`);
    return data ? moduleRowToDomain(data) : null;
  }

  async listModulesByCourse(courseId: string): Promise<LearningModule[]> {
    const { data, error } = await this.supabase
      .from('learning_modules')
      .select('*')
      .eq('course_id', courseId)
      .order('position', { ascending: true });
    if (error) throw new Error(`Não foi possível carregar os módulos: ${error.message}`);
    return (data ?? []).map(moduleRowToDomain);
  }

  async saveModules(modules: LearningModule[]): Promise<void> {
    if (modules.length === 0) return;
    const { error } = await this.supabase.from('learning_modules').upsert(
      modules.map((m) => ({
        id: m.id,
        workspace_id: m.workspaceId,
        course_id: m.courseId,
        title: m.title,
        description: m.description ?? null,
        position: m.position,
        status: m.status,
        lessons_count: m.lessonsCount,
        created_at: m.createdAt,
      })),
      { onConflict: 'id' }
    );
    if (error) throw new Error(`Não foi possível salvar os módulos: ${error.message}`);
    this.notifier.notify();
  }

  async findLessonById(id: string): Promise<Lesson | null> {
    const { data, error } = await this.supabase
      .from('learning_lessons')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) throw new Error(`Não foi possível carregar a lição: ${error.message}`);
    return data ? lessonRowToDomain(data) : null;
  }

  async listLessonsByModule(moduleId: string): Promise<Lesson[]> {
    const { data, error } = await this.supabase
      .from('learning_lessons')
      .select('*')
      .eq('module_id', moduleId)
      .order('position', { ascending: true });
    if (error) throw new Error(`Não foi possível carregar as lições: ${error.message}`);
    return (data ?? []).map(lessonRowToDomain);
  }

  async saveLessons(lessons: Lesson[]): Promise<void> {
    if (lessons.length === 0) return;
    const { error } = await this.supabase.from('learning_lessons').upsert(
      lessons.map((l) => ({
        id: l.id,
        workspace_id: l.workspaceId,
        module_id: l.moduleId,
        content_key: l.contentKey,
        title: l.title,
        description: l.description ?? null,
        position: l.position,
        content: l.content,
        created_at: l.createdAt,
      })),
      { onConflict: 'id' }
    );
    if (error) throw new Error(`Não foi possível salvar as lições: ${error.message}`);
    this.notifier.notify();
  }

  async findPreferences(): Promise<LearningPreferences | null> {
    const { data, error } = await this.supabase
      .from('learning_preferences')
      .select('*')
      .eq('workspace_id', this.workspaceId)
      .maybeSingle();
    if (error) throw new Error(`Não foi possível carregar as preferências: ${error.message}`);
    return data ? preferencesRowToDomain(data) : null;
  }

  async savePreferences(preferences: LearningPreferences): Promise<void> {
    const { error } = await this.supabase.from('learning_preferences').upsert(
      {
        workspace_id: preferences.workspaceId,
        default_daily_goal_minutes: preferences.defaultDailyGoalMinutes,
        created_at: preferences.createdAt,
      },
      { onConflict: 'workspace_id' }
    );
    if (error) throw new Error(`Não foi possível salvar as preferências: ${error.message}`);
    this.notifier.notify();
  }

  async findCoursePreferences(courseId: string): Promise<CoursePreferences | null> {
    const { data, error } = await this.supabase
      .from('learning_course_preferences')
      .select('*')
      .eq('workspace_id', this.workspaceId)
      .eq('course_id', courseId)
      .maybeSingle();
    if (error) throw new Error(`Não foi possível carregar as preferências do curso: ${error.message}`);
    return data ? coursePreferencesRowToDomain(data) : null;
  }

  async saveCoursePreferences(preferences: CoursePreferences): Promise<void> {
    const { error } = await this.supabase.from('learning_course_preferences').upsert(
      {
        workspace_id: preferences.workspaceId,
        course_id: preferences.courseId,
        show_romaji: preferences.showRomaji,
        show_furigana: preferences.showFurigana,
        show_translation: preferences.showTranslation,
        auto_play_audio: preferences.autoPlayAudio,
        created_at: preferences.createdAt,
      },
      { onConflict: 'workspace_id,course_id' }
    );
    if (error) throw new Error(`Não foi possível salvar as preferências do curso: ${error.message}`);
    this.notifier.notify();
  }

  subscribe(listener: () => void): () => void {
    return this.notifier.subscribe(listener);
  }
}
