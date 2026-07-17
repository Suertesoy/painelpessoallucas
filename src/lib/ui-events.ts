'use client';

/**
 * Eventos de UI globais (captura rápida e busca global).
 * Permitem que qualquer botão da interface abra os modais sem acoplamento
 * direto entre componentes — os modais escutam estes eventos.
 */

export const QUICK_CAPTURE_EVENT = 'ppl:open-quick-capture';
export const GLOBAL_SEARCH_EVENT = 'ppl:open-global-search';

export function openQuickCapture(): void {
  window.dispatchEvent(new CustomEvent(QUICK_CAPTURE_EVENT));
}

export function openGlobalSearch(): void {
  window.dispatchEvent(new CustomEvent(GLOBAL_SEARCH_EVENT));
}
