import type { MetadataRoute } from 'next';

/**
 * Cores derivadas da identidade visual atual (ver globals.css e
 * docs/project-dossier/DESIGN_SYSTEM_AND_VISUAL_AUDIT.md): azul (blue-600)
 * como cor de ação primária e o cinza de fundo (--background) do tema claro.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Nossa Casa',
    short_name: 'Nossa Casa',
    description: 'Compras, finanças, notas e aprendizado da nossa casa, em um só lugar.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#0f141b',
    theme_color: '#0f141b',
    lang: 'pt-BR',
    icons: [
      {
        src: '/icons/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/icon-maskable-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: '/icons/icon-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
