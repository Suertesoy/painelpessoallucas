'use client';

import { useState, useEffect, useRef, useSyncExternalStore } from 'react';
import { useRepositories } from '@/providers/repository.provider';

/**
 * Executa uma query assíncrona e reexecuta automaticamente quando qualquer
 * repositório notificar mudança (persistência local observável).
 *
 * Nota de arquitetura: como as queries são assíncronas (Promise), este hook
 * usa o padrão effect + subscribe em vez de useSyncExternalStore (que exige
 * snapshots síncronos). Na migração para Supabase, este hook é o único ponto
 * da UI que precisa aprender sobre loading/erro de rede.
 */
export function useReactiveQuery<T>(
  queryFn: () => Promise<T>,
  deps: React.DependencyList,
  initialData?: T
): { data: T | undefined; isLoading: boolean } {
  const { itemRepository, projectRepository, dailyPlanRepository } = useRepositories();
  const [data, setData] = useState<T | undefined>(initialData);
  const [isLoading, setIsLoading] = useState(true);

  const queryFnRef = useRef(queryFn);
  useEffect(() => {
    queryFnRef.current = queryFn;
  }, [queryFn]);

  useEffect(() => {
    let mounted = true;

    const runFetch = async () => {
      try {
        const result = await queryFnRef.current();
        if (mounted) setData(result);
      } catch (e) {
        console.error('Erro na query reativa', e);
      } finally {
        if (mounted) setIsLoading(false);
      }
    };

    runFetch();

    const unsub1 = itemRepository.subscribe(runFetch);
    const unsub2 = projectRepository.subscribe(runFetch);
    const unsub3 = dailyPlanRepository.subscribe(runFetch);

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

/**
 * Retorna true somente após a montagem no cliente.
 * Usado para conteúdos que dependem da data/hora atual e que causariam
 * mismatch de hidratação com o HTML pré-renderizado no build.
 */
const emptySubscribe = () => () => {};

export function useMounted(): boolean {
  // useSyncExternalStore com snapshots distintos servidor/cliente é a forma
  // recomendada (sem setState em effect) de detectar a hidratação concluída.
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  );
}
