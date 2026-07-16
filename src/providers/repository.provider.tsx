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

interface RepositoryContextType {
  itemRepository: ItemRepository;
  projectRepository: ProjectRepository;
  dailyPlanRepository: DailyPlanRepository;
  eventRepository: EventRepository;
}

const RepositoryContext = createContext<RepositoryContextType | null>(null);

// Singleton instances
const itemRepo = new LocalStorageItemRepository();
const projectRepo = new LocalStorageProjectRepository();
const dailyPlanRepo = new LocalStorageDailyPlanRepository();
const eventRepo = new LocalStorageEventRepository();

export function RepositoryProvider({ children }: { children: ReactNode }) {
  return (
    <RepositoryContext.Provider
      value={{
        itemRepository: itemRepo,
        projectRepository: projectRepo,
        dailyPlanRepository: dailyPlanRepo,
        eventRepository: eventRepo,
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
