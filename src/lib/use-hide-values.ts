'use client';

import { useCallback, useSyncExternalStore } from 'react';

/**
 * Preferência VISUAL de ocultar valores financeiros, guardada só neste
 * aparelho. Não toca em dados financeiros e não é segurança bancária.
 */
const KEY = 'nossa-casa:ocultar-valores';
const listeners = new Set<() => void>();

function read(): boolean {
  try {
    return window.localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener('storage', listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', listener);
  };
}

export function useHideValuesPreference(): [boolean, () => void] {
  const hidden = useSyncExternalStore(subscribe, read, () => false);
  const toggle = useCallback(() => {
    try {
      window.localStorage.setItem(KEY, read() ? '0' : '1');
    } catch {
      /* armazenamento indisponível: a preferência só não persiste */
    }
    listeners.forEach((l) => l());
  }, []);
  return [hidden, toggle];
}
