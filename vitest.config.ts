import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'node', // Não é jsdom por padrão para evitar acesso não intencional ao window. Testaremos a resiliência SSR.
    globals: true,
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  }
});
