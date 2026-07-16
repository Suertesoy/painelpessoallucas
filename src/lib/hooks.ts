'use client';

import { useState, useEffect, useRef } from 'react';
import { useRepositories } from '@/providers/repository.provider';

export function useReactiveQuery<T>(
  queryFn: () => Promise<T>,
  deps: React.DependencyList,
  initialData?: T
): { data: T | undefined, isLoading: boolean } {
  const { itemRepository, projectRepository, dailyPlanRepository } = useRepositories();
  const [data, setData] = useState<T | undefined>(initialData);
  const [isLoading, setIsLoading] = useState(true);
  
  const queryFnRef = useRef(queryFn);
  queryFnRef.current = queryFn;

  useEffect(() => {
    let mounted = true;
    
    const runFetch = async () => {
      try {
        const result = await queryFnRef.current();
        if (mounted) setData(result);
      } catch (e) {
        console.error("Erro na query reativa", e);
      } finally {
        if (mounted) setIsLoading(false);
      }
    };

    runFetch();

    const unsub1 = (itemRepository as { subscribe: (fn: () => void) => () => void }).subscribe(runFetch);
    const unsub2 = (projectRepository as { subscribe: (fn: () => void) => () => void }).subscribe(runFetch);
    const unsub3 = (dailyPlanRepository as { subscribe: (fn: () => void) => () => void }).subscribe(runFetch);

    return () => {
      mounted = false;
      unsub1();
      unsub2();
      unsub3();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { data, isLoading };
}
