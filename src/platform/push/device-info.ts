/**
 * Identificação de dispositivo/navegador genérica e não invasiva — só o
 * suficiente para o usuário reconhecer o dispositivo numa lista
 * ("iPhone/iPad", "Android", "Computador"), nunca um fingerprint detalhado
 * (sem versão exata de SO/navegador, resolução, plugins, etc.).
 */
export type DevicePlatform = 'ios' | 'android' | 'desktop' | 'other';

export function guessPlatform(): DevicePlatform {
  if (typeof navigator === 'undefined') return 'other';
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua)) return 'ios';
  if (/Android/.test(ua)) return 'android';
  if (/Windows|Macintosh|Linux/.test(ua)) return 'desktop';
  return 'other';
}

const PLATFORM_LABEL: Record<DevicePlatform, string> = {
  ios: 'iPhone/iPad',
  android: 'Android',
  desktop: 'Computador',
  other: 'Este dispositivo',
};

export function guessDeviceName(): string {
  return PLATFORM_LABEL[guessPlatform()];
}
