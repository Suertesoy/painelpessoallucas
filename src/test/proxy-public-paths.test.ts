import { describe, it, expect } from 'vitest';
import { isPublicPath, PUBLIC_PATHS } from '@/proxy';

describe('Proxy — rotas públicas e recursos PWA', () => {
  it('inclui explicitamente os ativos estáticos essenciais da PWA', () => {
    expect(PUBLIC_PATHS).toContain('/sw.js');
    expect(PUBLIC_PATHS).toContain('/manifest.webmanifest');
    expect(PUBLIC_PATHS).toContain('/manifest.json');
    expect(PUBLIC_PATHS).toContain('/offline.html');
  });

  it('permite acesso sem autenticação aos recursos da PWA', () => {
    expect(isPublicPath('/sw.js')).toBe(true);
    expect(isPublicPath('/manifest.webmanifest')).toBe(true);
    expect(isPublicPath('/manifest.json')).toBe(true);
    expect(isPublicPath('/offline.html')).toBe(true);
  });

  it('permite rotas de autenticação, cron, health e callback assinado do QStash', () => {
    expect(isPublicPath('/login')).toBe(true);
    expect(isPublicPath('/auth/callback')).toBe(true);
    expect(isPublicPath('/api/cron/tick')).toBe(true);
    expect(isPublicPath('/api/health')).toBe(true);
    expect(isPublicPath('/api/workouts/rest-callback')).toBe(true);
  });

  it('bloqueia e exige autenticação em rotas privadas de páginas e APIs sensíveis', () => {
    expect(isPublicPath('/')).toBe(false);
    expect(isPublicPath('/configuracoes')).toBe(false);
    expect(isPublicPath('/financas')).toBe(false);
    expect(isPublicPath('/treinos')).toBe(false);
    expect(isPublicPath('/api/workouts/rest-schedule')).toBe(false);
    expect(isPublicPath('/api/push/test')).toBe(false);
    expect(isPublicPath('/api/push/subscribe')).toBe(false);
    expect(isPublicPath('/api/push/preferences')).toBe(false);
    expect(isPublicPath('/api/push/devices')).toBe(false);
  });
});
