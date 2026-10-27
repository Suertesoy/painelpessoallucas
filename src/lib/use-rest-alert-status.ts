'use client';

import { useEffect, useState } from 'react';

export interface RestAlertStatus {
  /** QStash + VAPID configurados no servidor. */
  ready: boolean;
  /** Para quem vão os avisos deste atleta. */
  athlete: 'mine' | 'other' | 'unlinked';
}

/**
 * Estado server-side dos avisos de descanso para um atleta (infraestrutura,
 * mesmo padrão de `usePushNotifications`: o componente não chama a rota).
 * Null enquanto carrega ou se a verificação falhar — nunca bloqueia o treino.
 */
export function useRestAlertStatus(athleteId: string | undefined): RestAlertStatus | null {
  const [status, setStatus] = useState<{ athleteId: string; value: RestAlertStatus } | null>(null);

  useEffect(() => {
    if (!athleteId) return;
    let cancelled = false;
    fetch(`/api/workouts/rest-schedule?athleteId=${encodeURIComponent(athleteId)}`)
      .then((res) => (res.ok ? (res.json() as Promise<RestAlertStatus>) : null))
      .then((value) => {
        if (!cancelled && value) setStatus({ athleteId, value });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [athleteId]);

  return status && status.athleteId === athleteId ? status.value : null;
}
