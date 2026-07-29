import { describe, expect, it } from 'vitest';
import manifest from '@/app/manifest';

describe('manifest da PWA', () => {
  const result = manifest();

  it('define nome, descrição e idioma coerentes com o painel', () => {
    expect(result.name).toBe('Painel Lucas');
    expect(result.short_name).toBe('Painel Lucas');
    expect(result.description).toMatch(/pessoal/i);
    expect(result.lang).toBe('pt-BR');
  });

  it('usa modo standalone com start_url e scope na raiz', () => {
    expect(result.display).toBe('standalone');
    expect(result.start_url).toBe('/');
    expect(result.scope).toBe('/');
  });

  it('usa as cores da identidade visual atual (azul de ação e cinza de fundo)', () => {
    expect(result.theme_color).toBe('#2563eb');
    expect(result.background_color).toBe('#f9fafb');
  });

  it('inclui ícones any (192/512) e maskable (192/512)', () => {
    const icons = result.icons ?? [];
    const bySize = (size: string, purpose: string) =>
      icons.find((icon) => icon.sizes === size && icon.purpose === purpose);

    expect(bySize('192x192', 'any')).toBeDefined();
    expect(bySize('512x512', 'any')).toBeDefined();
    expect(bySize('192x192', 'maskable')).toBeDefined();
    expect(bySize('512x512', 'maskable')).toBeDefined();
    icons.forEach((icon) => expect(icon.type).toBe('image/png'));
  });
});
