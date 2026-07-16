'use client';

import { useSyncExternalStore, useCallback } from 'react';
import { useRepositories } from '@/providers/repository.provider';
import { Item } from '@/modules/items/domain/item.schema';
import { Project } from '@/modules/projects/domain/project.schema';
import { DailyPlan } from '@/modules/planning/domain/daily-plan.schema';
import { LocalStorageItemRepository } from '@/modules/items/infrastructure/local-storage-item.repository';
import { LocalStorageProjectRepository } from '@/modules/projects/infrastructure/local-storage-project.repository';
import { LocalStorageDailyPlanRepository } from '@/modules/planning/infrastructure/local-storage-daily-plan.repository';

// Note: To avoid hydration mismatch, we must provide a safe initial state on the server.
const emptyItems: Item[] = [];
const emptyProjects: Project[] = [];

export function useItems(): Item[] {
  const { itemRepository } = useRepositories();
  const repo = itemRepository as LocalStorageItemRepository;

  const subscribe = useCallback((onStoreChange: () => void) => {
    return repo.subscribe(onStoreChange);
  }, [repo]);

  const getSnapshot = useCallback(() => {
    return repo.getItems();
  }, [repo]);

  const getServerSnapshot = useCallback(() => {
    return emptyItems;
  }, []);

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export function useProjects(): Project[] {
  const { projectRepository } = useRepositories();
  const repo = projectRepository as LocalStorageProjectRepository;

  const subscribe = useCallback((onStoreChange: () => void) => {
    return repo.subscribe(onStoreChange);
  }, [repo]);

  const getSnapshot = useCallback(() => {
    return repo.getItems();
  }, [repo]);

  const getServerSnapshot = useCallback(() => {
    return emptyProjects;
  }, []);

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export function useDailyPlan(date: string): DailyPlan | null {
  const { dailyPlanRepository } = useRepositories();
  const repo = dailyPlanRepository as LocalStorageDailyPlanRepository;

  const subscribe = useCallback((onStoreChange: () => void) => {
    return repo.subscribe(onStoreChange);
  }, [repo]);

  const getSnapshot = useCallback(() => {
    const plans = repo.getItems();
    return plans.find(p => p.date === date) || null;
  }, [repo, date]);

  const getServerSnapshot = useCallback(() => {
    return null;
  }, []);

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
