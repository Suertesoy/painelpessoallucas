'use client';

import React, { createContext, useContext, useMemo, ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { ItemRepository } from '@/modules/items/application/item.repository';
import { ProjectRepository } from '@/modules/projects/application/project.repository';
import { DailyPlanRepository } from '@/modules/planning/application/daily-plan.repository';
import { EventRepository } from '@/platform/events/event.repository';
import { SupabaseItemRepository } from '@/modules/items/infrastructure/supabase-item.repository';
import { SupabaseProjectRepository } from '@/modules/projects/infrastructure/supabase-project.repository';
import { SupabaseDailyPlanRepository } from '@/modules/planning/infrastructure/supabase-daily-plan.repository';
import { SupabaseEventRepository } from '@/platform/events/supabase-event.repository';
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
import {
  SourceDocumentRepository,
  ExecutionPlanRepository,
} from '@/modules/plans/application/plan.repository';
import { useAuth } from './auth.provider';

interface RepositoryContextType {
  itemRepository: ItemRepository;
  projectRepository: ProjectRepository;
  dailyPlanRepository: DailyPlanRepository;
  eventRepository: EventRepository;
  itemCommands: ItemCommands;
  projectCommands: ProjectCommands;
  dailyPlanCommands: DailyPlanCommands;
  itemQueries: ItemQueries;
  projectQueries: ProjectQueries;
  dailyPlanQueries: DailyPlanQueries;
  globalQueries: GlobalQueries;
  sourceDocumentRepository: SourceDocumentRepository;
  executionPlanRepository: ExecutionPlanRepository;
  planCommands: PlanCommands;
  planQueries: PlanQueries;
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
    const notifier = new ChangeNotifier();

    const itemRepo = new SupabaseItemRepository(supabase, workspaceId, notifier);
    const projectRepo = new SupabaseProjectRepository(supabase, workspaceId, notifier);
    const dailyPlanRepo = new SupabaseDailyPlanRepository(supabase, workspaceId, notifier);
    const eventRepo = new SupabaseEventRepository(supabase, workspaceId);

    const itemQueries = new ItemQueries(itemRepo);
    const projectQueries = new ProjectQueries(projectRepo);
    const docRepo = new SupabaseSourceDocumentRepository(supabase, workspaceId, notifier);
    const planRepo = new SupabaseExecutionPlanRepository(supabase, workspaceId, notifier);

    return {
      itemRepository: itemRepo,
      projectRepository: projectRepo,
      dailyPlanRepository: dailyPlanRepo,
      eventRepository: eventRepo,
      itemCommands: new ItemCommands(itemRepo, eventRepo),
      projectCommands: new ProjectCommands(projectRepo, eventRepo),
      dailyPlanCommands: new DailyPlanCommands(dailyPlanRepo, eventRepo),
      itemQueries,
      projectQueries,
      dailyPlanQueries: new DailyPlanQueries(dailyPlanRepo),
      globalQueries: new GlobalQueries(itemQueries, projectQueries),
      sourceDocumentRepository: docRepo,
      executionPlanRepository: planRepo,
      planCommands: new PlanCommands(docRepo, planRepo, eventRepo),
      planQueries: new PlanQueries(docRepo, planRepo),
    };
  }, [status, workspaceId]);

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
    plan: context.planCommands
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
    plan: context.planQueries
  };
}
