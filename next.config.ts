import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        // Garante que o navegador sempre revalide o service worker em vez
        // de servir uma cópia antiga do cache HTTP — é o que faz a
        // detecção de nova versão (comparação de bytes) funcionar de forma
        // confiável a cada deploy.
        source: '/sw.js',
        headers: [
          {
            key: 'Cache-Control',
            value: 'no-cache, no-store, must-revalidate',
          },
          {
            key: 'Service-Worker-Allowed',
            value: '/',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
