// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * "Projeto principal" e "Frente secundária" são papéis reutilizáveis da
 * rotina — qual projeto os ocupa é configurável (workspace_settings,
 * /api/settings/routine), nunca fixo no código. Hoje o projeto principal é
 * o Grupo Almeida, mas isso não pode ficar hardcoded: varre os arquivos da
 * própria feature de rotina atrás do nome, para não reintroduzir esse
 * acoplamento no futuro.
 */

const FORBIDDEN_TERMS = ['almeida'];
const ROOTS = [
  'src/modules/routine',
  'src/components/routine-settings-card.tsx',
  'src/app/api/settings/routine',
];
const SKIP_DIRS = new Set(['node_modules', '.next', '.git']);

function collectFiles(path: string): string[] {
  const stat = statSync(path);
  if (!stat.isDirectory()) return [path];
  const out: string[] = [];
  for (const entry of readdirSync(path)) {
    if (SKIP_DIRS.has(entry)) continue;
    out.push(...collectFiles(join(path, entry)));
  }
  return out;
}

describe('Papéis da rotina nunca referenciam um projeto fixo no código', () => {
  it('nenhum arquivo da feature de rotina menciona "Almeida" (deve vir só de configuração)', () => {
    const projectRoot = join(__dirname, '..', '..');
    const offenders: string[] = [];

    for (const root of ROOTS) {
      const files = collectFiles(join(projectRoot, root));
      for (const file of files) {
        const content = readFileSync(file, 'utf8').toLowerCase();
        if (FORBIDDEN_TERMS.some((term) => content.includes(term))) {
          offenders.push(file);
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});
