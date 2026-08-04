'use client';

import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
  ReactNode,
} from 'react';
import { usePathname } from 'next/navigation';
import { ItemRepository } from '@/modules/items/application/item.repository';
import { ProjectRepository } from '@/modules/projects/application/project.repository';
import { DailyPlanRepository } from '@/modules/planning/application/daily-plan.repository';
import { EventRepository } from '@/platform/events/event.repository';
import { AudioProvenanceRepository } from '@/platform/ai/audio-provenance.repository';
import { AutomationHealthRepository } from '@/platform/automation/automation-health.repository';
import { CalendarEventLinkRepository } from '@/platform/integrations/calendar-event-link.repository';
import { SupabaseCalendarEventLinkRepository } from '@/platform/integrations/supabase-calendar-event-link.repository';
import { CalendarEventQueries } from '@/platform/integrations/calendar-event.queries';
import { SupabaseItemRepository } from '@/modules/items/infrastructure/supabase-item.repository';
import { SupabaseProjectRepository } from '@/modules/projects/infrastructure/supabase-project.repository';
import { SupabaseDailyPlanRepository } from '@/modules/planning/infrastructure/supabase-daily-plan.repository';
import { SupabaseEventRepository } from '@/platform/events/supabase-event.repository';
import { SupabaseAudioProvenanceRepository } from '@/platform/ai/supabase-audio-provenance.repository';
import { SupabaseAutomationHealthRepository } from '@/platform/automation/supabase-automation-health.repository';
import { ChangeNotifier } from '@/platform/supabase/change-notifier';
import { getSupabaseBrowserClient } from '@/platform/supabase/browser-client';
import { ItemCommands } from '@/modules/items/application/item.commands';
import { ProjectCommands } from '@/modules/projects/application/project.commands';
import { DailyPlanCommands } from '@/modules/planning/application/daily-plan.commands';
import { ItemQueries } from '@/modules/items/application/item.queries';
import { ProjectQueries } from '@/modules/projects/application/project.queries';
import { DailyPlanQueries } from '@/modules/planning/application/daily-plan.queries';
import { GlobalQueries } from '@/modules/global/application/global.queries';
import {
  SupabaseSourceDocumentRepository,
  SupabaseExecutionPlanRepository,
} from '@/modules/plans/infrastructure/supabase-plan.repository';
import { PlanCommands } from '@/modules/plans/application/plan.commands';
import { PlanQueries } from '@/modules/plans/application/plan.queries';
import { activateAndMaterializePlanRules } from '@/modules/plans/application/recurrence-materializer';
import { materializeOneOffActions } from '@/modules/plans/application/plan-action-materializer';
import {
  SourceDocumentRepository,
  ExecutionPlanRepository,
} from '@/modules/plans/application/plan.repository';
import { SupabaseLearningContentRepository } from '@/modules/learning/infrastructure/supabase-learning-content.repository';
import { SupabaseStudySessionRepository } from '@/modules/learning/infrastructure/supabase-study-session.repository';
import { SupabaseLessonProgressRepository } from '@/modules/learning/infrastructure/supabase-lesson-progress.repository';
import { LearningContentRepository } from '@/modules/learning/application/learning-content.repository';
import { StudySessionRepository } from '@/modules/learning/application/study-session.repository';
import { LessonProgressRepository } from '@/modules/learning/application/lesson-progress.repository';
import { LearningCommands } from '@/modules/learning/application/learning.commands';
import { LearningQueries } from '@/modules/learning/application/learning.queries';
import { SupabaseReminderRepository } from '@/modules/reminders/infrastructure/supabase-reminder.repository';
import { ReminderRepository } from '@/modules/reminders/application/reminder.repository';
import { ReminderCommands } from '@/modules/reminders/application/reminder.commands';
import { ReminderQueries } from '@/modules/reminders/application/reminder.queries';
import { SupabaseShoppingListRepository } from '@/modules/shopping/infrastructure/supabase-shopping-list.repository';
import { ShoppingListRepository } from '@/modules/shopping/application/shopping-list.repository';
import { ShoppingCommands } from '@/modules/shopping/application/shopping.commands';
import { ShoppingQueries } from '@/modules/shopping/application/shopping.queries';
import { SupabaseFinanceRepository } from '@/modules/finance/infrastructure/supabase-finance.repository';
import { FinanceRepository } from '@/modules/finance/application/finance.repository';
import { FinanceSetupCommands } from '@/modules/finance/application/finance-setup.commands';
import { FinanceImportCommands } from '@/modules/finance/application/finance-import.commands';
import { FinanceMonthlyCommands } from '@/modules/finance/application/finance-monthly.commands';
import { FinanceQueries } from '@/modules/finance/application/finance.queries';
import { FinanceAnalyticsQueries } from '@/modules/finance/application/finance-analytics.queries';
import { useAuth } from './auth.provider';

interface RepositoryContextType {
  itemRepository: ItemRepository;
  projectRepository: ProjectRepository;
  dailyPlanRepository: DailyPlanRepository;
  eventRepository: EventRepository;
  audioProvenanceRepository: AudioProvenanceRepository;
  automationHealthRepository: AutomationHealthRepository;
  calendarEventLinkRepository: CalendarEventLinkRepository;
  itemCommands: ItemCommands;
  projectCommands: ProjectCommands;
  dailyPlanCommands: DailyPlanCommands;
  itemQueries: ItemQueries;
  projectQueries: ProjectQueries;
  dailyPlanQueries: DailyPlanQueries;
  globalQueries: GlobalQueries;
  calendarEventQueries: CalendarEventQueries;
  sourceDocumentRepository: SourceDocumentRepository;
  executionPlanRepository: ExecutionPlanRepository;
  planCommands: PlanCommands;
  planQueries: PlanQueries;
  learningContentRepository: LearningContentRepository;
  studySessionRepository: StudySessionRepository;
  lessonProgressRepository: LessonProgressRepository;
  learningCommands: LearningCommands;
  learningQueries: LearningQueries;
  reminderRepository: ReminderRepository;
  reminderCommands: ReminderCommands;
  reminderQueries: ReminderQueries;
  shoppingListRepository: ShoppingListRepository;
  shoppingCommands: ShoppingCommands;
  shoppingQueries: ShoppingQueries;
  financeRepository: FinanceRepository;
  financeSetupCommands: FinanceSetupCommands;
  financeImportCommands: FinanceImportCommands;
  financeMonthlyCommands: FinanceMonthlyCommands;
  financeQueries: FinanceQueries;
  financeAnalyticsQueries: FinanceAnalyticsQueries;
  changeNotifier: ChangeNotifier;
}

const RepositoryContext = createContext<RepositoryContextType | null>(null);

/** Rotas que renderizam sem repositórios (sem sessão). */
const PUBLIC_PREFIXES = ['/login', '/auth'];

function isPublic(pathname: string): boolean {
  return PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export function RepositoryProvider({ children }: { children: ReactNode }) {
  const { status, workspaceId, error, retry } = useAuth();
  const pathname = usePathname();

  const value = useMemo<RepositoryContextType | null>(() => {
    if (status !== 'authenticated' || !workspaceId) return null;

    const supabase = getSupabaseBrowserClient();
    const notifier = new ChangeNotifier(supabase, workspaceId);

    const itemRepo = new SupabaseItemRepository(supabase, workspaceId, notifier);
    const projectRepo = new SupabaseProjectRepository(supabase, workspaceId, notifier);
    const dailyPlanRepo = new SupabaseDailyPlanRepository(supabase, workspaceId, notifier);
    const eventRepo = new SupabaseEventRepository(supabase, workspaceId);
    const audioProvenanceRepo = new SupabaseAudioProvenanceRepository(supabase, workspaceId);
    const automationHealthRepo = new SupabaseAutomationHealthRepository(supabase, workspaceId);
    const calendarEventLinkRepo = new SupabaseCalendarEventLinkRepository(supabase, workspaceId, notifier);

    const itemQueries = new ItemQueries(itemRepo);
    const projectQueries = new ProjectQueries(projectRepo);
    const docRepo = new SupabaseSourceDocumentRepository(supabase, workspaceId, notifier);
    const planRepo = new SupabaseExecutionPlanRepository(supabase, workspaceId, notifier);
    const learningContentRepo = new SupabaseLearningContentRepository(supabase, workspaceId, notifier);
    const studySessionRepo = new SupabaseStudySessionRepository(supabase, workspaceId, notifier);
    const lessonProgressRepo = new SupabaseLessonProgressRepository(supabase, workspaceId, notifier);
    const reminderRepo = new SupabaseReminderRepository(supabase, workspaceId);
    const shoppingListRepo = new SupabaseShoppingListRepository(supabase, workspaceId, notifier);
    const financeRepo = new SupabaseFinanceRepository(supabase, workspaceId, notifier);

    return {
      itemRepository: itemRepo,
      projectRepository: projectRepo,
      dailyPlanRepository: dailyPlanRepo,
      eventRepository: eventRepo,
      audioProvenanceRepository: audioProvenanceRepo,
      automationHealthRepository: automationHealthRepo,
      calendarEventLinkRepository: calendarEventLinkRepo,
      itemCommands: new ItemCommands(itemRepo, eventRepo),
      projectCommands: new ProjectCommands(projectRepo, eventRepo),
      dailyPlanCommands: new DailyPlanCommands(dailyPlanRepo, eventRepo),
      itemQueries,
      projectQueries,
      dailyPlanQueries: new DailyPlanQueries(dailyPlanRepo),
      globalQueries: new GlobalQueries(itemQueries, projectQueries),
      calendarEventQueries: new CalendarEventQueries(calendarEventLinkRepo),
      sourceDocumentRepository: docRepo,
      executionPlanRepository: planRepo,
      planCommands: new PlanCommands(docRepo, planRepo, eventRepo, (planId) =>
        Promise.all([
          activateAndMaterializePlanRules(supabase, planId),
          materializeOneOffActions(supabase, planId),
        ])
      ),
      planQueries: new PlanQueries(docRepo, planRepo),
      learningContentRepository: learningContentRepo,
      studySessionRepository: studySessionRepo,
      lessonProgressRepository: lessonProgressRepo,
      learningCommands: new LearningCommands(learningContentRepo, studySessionRepo, eventRepo, lessonProgressRepo),
      learningQueries: new LearningQueries(learningContentRepo, studySessionRepo, lessonProgressRepo),
      reminderRepository: reminderRepo,
      reminderCommands: new ReminderCommands(reminderRepo, eventRepo),
      reminderQueries: new ReminderQueries(reminderRepo),
      shoppingListRepository: shoppingListRepo,
      shoppingCommands: new ShoppingCommands(shoppingListRepo, eventRepo, workspaceId),
      shoppingQueries: new ShoppingQueries(shoppingListRepo, itemRepo),
      financeRepository: financeRepo,
      financeSetupCommands: new FinanceSetupCommands(financeRepo, eventRepo, workspaceId),
      financeImportCommands: new FinanceImportCommands(financeRepo, eventRepo, workspaceId),
      financeMonthlyCommands: new FinanceMonthlyCommands(financeRepo, eventRepo, workspaceId),
      financeQueries: new FinanceQueries(financeRepo),
      financeAnalyticsQueries: new FinanceAnalyticsQueries(financeRepo),
      changeNotifier: notifier,
    };
  }, [status, workspaceId]);

  useEffect(() => {
    if (!value) return;
    value.changeNotifier.startRealtime();
    return () => value.changeNotifier.dispose();
  }, [value]);

  // Rotas públicas (login/callback) não precisam de repositórios.
  if (isPublic(pathname)) {
    return <>{children}</>;
  }

  if (status === 'loading') {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-gray-50">
        <p className="text-sm text-gray-500">Carregando seu painel…</p>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-gray-50 px-4">
        <div className="max-w-sm text-center">
          <p role="alert" className="text-sm text-red-700">
            {error ?? 'Erro ao carregar o painel.'}
          </p>
          <button
            type="button"
            onClick={retry}
            className="mt-4 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Tentar novamente
          </button>
        </div>
      </div>
    );
  }

  if (status === 'unauthenticated' || !value) {
    // O proxy redireciona para /login; aqui apenas evita renderizar sem dados.
    return (
      <div className="flex min-h-dvh items-center justify-center bg-gray-50">
        <p className="text-sm text-gray-500">Redirecionando para o login…</p>
      </div>
    );
  }

  return (
    <RepositoryContext.Provider value={value}>{children}</RepositoryContext.Provider>
  );
}

export function useRepositories() {
  const context = useContext(RepositoryContext);
  if (!context) {
    throw new Error('useRepositories must be used within a RepositoryProvider');
  }
  return context;
}

export function useCommands() {
  const context = useContext(RepositoryContext);
  if (!context) throw new Error('useCommands must be used within a RepositoryProvider');
  return {
    item: context.itemCommands,
    project: context.projectCommands,
    dailyPlan: context.dailyPlanCommands,
    plan: context.planCommands,
    learning: context.learningCommands,
    reminder: context.reminderCommands,
    shopping: context.shoppingCommands,
    finance: {
      setup: context.financeSetupCommands,
      import: context.financeImportCommands,
      monthly: context.financeMonthlyCommands,
    },
  };
}

export function useQueries() {
  const context = useContext(RepositoryContext);
  if (!context) throw new Error('useQueries must be used within a RepositoryProvider');
  return {
    item: context.itemQueries,
    project: context.projectQueries,
    dailyPlan: context.dailyPlanQueries,
    global: context.globalQueries,
    plan: context.planQueries,
    calendarEvent: context.calendarEventQueries,
    learning: context.learningQueries,
    reminder: context.reminderQueries,
    shopping: context.shoppingQueries,
    finance: {
      queries: context.financeQueries,
      analytics: context.financeAnalyticsQueries,
    },
  };
}

export function useRealtimeStatus() {
  const { changeNotifier } = useRepositories();
  return useSyncExternalStore(
    changeNotifier.subscribeStatus,
    changeNotifier.getStatus,
    () => 'connecting'
  );
}
