'use client';

import React, { createContext, useContext, ReactNode } from 'react';
import { ItemRepository } from '@/modules/items/application/item.repository';
import { ProjectRepository } from '@/modules/projects/application/project.repository';
import { DailyPlanRepository } from '@/modules/planning/application/daily-plan.repository';
import { EventRepository } from '@/platform/events/event.repository';
import { LocalStorageItemRepository } from '@/modules/items/infrastructure/local-storage-item.repository';
import { LocalStorageProjectRepository } from '@/modules/projects/infrastructure/local-storage-project.repository';
import { LocalStorageDailyPlanRepository } from '@/modules/planning/infrastructure/local-storage-daily-plan.repository';
import { LocalStorageEventRepository } from '@/platform/events/local-storage-event.repository';
import { ItemCommands } from '@/modules/items/application/item.commands';
import { ProjectCommands } from '@/modules/projects/application/project.commands';
import { DailyPlanCommands } from '@/modules/planning/application/daily-plan.commands';
import { ItemQueries } from '@/modules/items/application/item.queries';
import { ProjectQueries } from '@/modules/projects/application/project.queries';
import { DailyPlanQueries } from '@/modules/planning/application/daily-plan.queries';
import { GlobalQueries } from '@/modules/global/application/global.queries';

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
}

const RepositoryContext = createContext<RepositoryContextType | null>(null);

// Singleton instances
const itemRepo = new LocalStorageItemRepository();
const projectRepo = new LocalStorageProjectRepository();
const dailyPlanRepo = new LocalStorageDailyPlanRepository();
const eventRepo = new LocalStorageEventRepository();

const itemCommands = new ItemCommands(itemRepo, eventRepo);
const projectCommands = new ProjectCommands(projectRepo, eventRepo);
const dailyPlanCommands = new DailyPlanCommands(dailyPlanRepo, eventRepo);

const itemQueries = new ItemQueries(itemRepo);
const projectQueries = new ProjectQueries(projectRepo);
const dailyPlanQueries = new DailyPlanQueries(dailyPlanRepo);
const globalQueries = new GlobalQueries(itemQueries, projectQueries);

export function RepositoryProvider({ children }: { children: ReactNode }) {
  return (
    <RepositoryContext.Provider
      value={{
        itemRepository: itemRepo,
        projectRepository: projectRepo,
        dailyPlanRepository: dailyPlanRepo,
        eventRepository: eventRepo,
        itemCommands,
        projectCommands,
        dailyPlanCommands,
        itemQueries,
        projectQueries,
        dailyPlanQueries,
        globalQueries,
      }}
    >
      {children}
    </RepositoryContext.Provider>
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
    dailyPlan: context.dailyPlanCommands
  };
}

export function useQueries() {
  const context = useContext(RepositoryContext);
  if (!context) throw new Error('useQueries must be used within a RepositoryProvider');
  return {
    item: context.itemQueries,
    project: context.projectQueries,
    dailyPlan: context.dailyPlanQueries,
    global: context.globalQueries
  };
}
