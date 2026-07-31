// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * O número de WhatsApp inicial do Matheus (+55 48 98816-5106) nunca pode
 * ficar hardcoded em componente, constante, migration ou bundle — só existe
 * preenchido pelo usuário em Configurações (workspace_settings). Varre o
 * código-fonte (não node_modules/.next) atrás dos dígitos do número, em
 * qualquer formatação.
 */

const FORBIDDEN_DIGITS = '48988165106'; // sem código do país nem formatação
const ROOTS = ['src', 'supabase'];
// 'test': arquivos de teste legitimamente usam o número como exemplo/fixture
// (ver shopping-whatsapp-share.test.ts) — a garantia é sobre código de
// produção e migrations, nunca sobre fixtures de teste.
const SKIP_DIRS = new Set(['node_modules', '.next', '.git', 'test']);

function collectFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      out.push(...collectFiles(full));
    } else {
      out.push(full);
    }
  }
  return out;
}

describe('Número de WhatsApp para compartilhar compras nunca hardcoded', () => {
  it('nenhum arquivo de código-fonte contém os dígitos do número do Matheus', () => {
    const projectRoot = join(__dirname, '..', '..');
    const offenders: string[] = [];

    for (const root of ROOTS) {
      const files = collectFiles(join(projectRoot, root)).filter((f) => f !== __filename);
      for (const file of files) {
        // Dígitos por LINHA (não o arquivo inteiro): evita falso positivo de
        // números não relacionados que ficam adjacentes só depois de remover
        // toda formatação/quebra de linha do arquivo completo.
        const lines = readFileSync(file, 'utf8').split('\n');
        if (lines.some((line) => line.replace(/\D+/g, '').includes(FORBIDDEN_DIGITS))) {
          offenders.push(file);
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});
