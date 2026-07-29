import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';

const OFFLINE_HTML = fs.readFileSync(
  path.resolve(__dirname, '../../public/offline.html'),
  'utf-8'
);

describe('página offline estática (public/offline.html)', () => {
  it('explica que é preciso conexão para sincronizar e oferece "tentar novamente"', () => {
    expect(OFFLINE_HTML).toMatch(/sem conexão/i);
    expect(OFFLINE_HTML).toMatch(/sincronizar/i);
    expect(OFFLINE_HTML).toMatch(/tentar novamente/i);
  });

  it('segue a identidade visual do painel (azul de ação, sem tema genérico)', () => {
    expect(OFFLINE_HTML).toMatch(/#2563eb/);
    expect(OFFLINE_HTML).toMatch(/Painel Lucas/);
  });

  it('não referencia nenhuma API, token ou dado pessoal — é puramente estática', () => {
    expect(OFFLINE_HTML).not.toMatch(/supabase|openai|googleapis|token|authorization/i);
  });
});
