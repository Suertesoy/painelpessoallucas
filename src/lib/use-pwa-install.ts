'use client';

import { useEffect, useSyncExternalStore } from 'react';
import { getPwaInstallController } from '@/platform/pwa/pwa-install.controller';

/**
 * Hook fino sobre `PwaInstallController` — único ponto de leitura do estado
 * de instalabilidade da PWA na UI (ver Configurações).
 */
export function usePwaInstall() {
  const controller = getPwaInstallController();

  useEffect(() => {
    controller.start();
  }, [controller]);

  const snapshot = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getServerSnapshot
  );

  return {
    ...snapshot,
    promptInstall: controller.promptInstall,
  };
}
