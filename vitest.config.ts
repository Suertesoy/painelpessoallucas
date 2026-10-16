import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'node', // Não é jsdom por padrão para evitar acesso não intencional ao window. Testaremos a resiliência SSR.
    globals: true,
    // Testes que importam páginas inteiras dinamicamente estouram 5s quando o
    // Windows está sob carga (suíte cheia em paralelo); isso não é falha lógica.
    testTimeout: 20000,
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  }
});
