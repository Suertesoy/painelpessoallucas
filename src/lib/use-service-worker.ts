'use client';

import { useEffect, useSyncExternalStore } from 'react';
import { getServiceWorkerController } from '@/platform/pwa/service-worker.controller';

/** Hook fino sobre `ServiceWorkerController` — registro + estado de atualização. */
export function useServiceWorker() {
  const controller = getServiceWorkerController();

  useEffect(() => {
    controller.register();
  }, [controller]);

  const snapshot = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getServerSnapshot
  );

  return {
    ...snapshot,
    applyUpdate: controller.applyUpdate,
  };
}
