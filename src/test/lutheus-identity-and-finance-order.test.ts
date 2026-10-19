import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import manifest from '@/app/manifest';
import { BRAND } from '@/branding/brand';

const root = process.cwd();
const read = (p: string) => readFileSync(join(root, p), 'utf8');

/** Lê largura/altura do cabeçalho IHDR de um PNG. */
function pngSize(path: string): { w: number; h: number } {
  const buf = readFileSync(join(root, path));
  expect(buf.subarray(1, 4).toString('ascii')).toBe('PNG');
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

describe('identidade Lutheus', () => {
  it('nome do app, manifesto e metadados', () => {
    expect(BRAND.appName).toBe('Lutheus');
    expect(manifest().name).toBe('Lutheus');
    expect(manifest().short_name).toBe('Lutheus');
    const layout = read('src/app/layout.tsx');
    expect(layout).toContain('BRAND.appName');
    expect(layout).toContain('openGraph');
    expect(layout).toContain('summary_large_image');
    expect(layout).not.toMatch(/Painel Lucas/);
  });

  it('ícones e imagem de compartilhamento existem com as dimensões certas', () => {
    expect(pngSize('public/icons/icon-192.png')).toEqual({ w: 192, h: 192 });
    expect(pngSize('public/icons/icon-512.png')).toEqual({ w: 512, h: 512 });
    expect(pngSize('public/icons/icon-maskable-192.png')).toEqual({ w: 192, h: 192 });
    expect(pngSize('public/icons/icon-maskable-512.png')).toEqual({ w: 512, h: 512 });
    expect(pngSize('public/icons/apple-touch-icon.png')).toEqual({ w: 180, h: 180 });
    expect(pngSize('public/og/share.png')).toEqual({ w: BRAND.shareImage.width, h: BRAND.shareImage.height });
    expect(existsSync(join(root, 'src/app/favicon.ico'))).toBe(true);
  });

  it('o tema é um SVG trocável: casinha vermelha com estrela amarela', () => {
    const svg = read(`branding/themes/${BRAND.themeId}.svg`);
    expect(svg).toMatch(/#E5383B|#D62B34|#F0444A/i); // vermelho dominante
    expect(svg).toMatch(/#FFD23F/i); // estrela amarela
    expect(svg).toContain('<polygon');
    expect(read('scripts/build-brand-assets.mjs')).toContain('branding/themes');
  });

  it('nenhum texto visível do app instalado ainda diz "Painel Lucas"', () => {
    for (const f of ['public/offline.html', 'src/platform/push/push-content.ts', 'src/components/pwa/install-app-card.tsx', 'src/app/login/page.tsx']) {
      expect(read(f)).not.toMatch(/Painel Lucas/);
    }
  });
});

describe('Home e topo (safe area)', () => {
  it('Home sem título e subtítulo visíveis', () => {
    const home = read('src/app/page.tsx');
    expect(home).not.toMatch(/Para onde vamos agora/);
    expect(home).toContain('sr-only');
  });

  it('o conteúdo respeita a safe area do topo (Home, barra interna e faixa sólida sob o relógio)', () => {
    expect(read('src/app/page.tsx')).toMatch(/env\(safe-area-inset-top\)/);
    expect(read('src/components/home-bar.tsx')).toMatch(/env\(safe-area-inset-top\)/);
    expect(read('src/components/app-shell.tsx')).toMatch(/env\(safe-area-inset-top\)/);
    expect(read('src/app/layout.tsx')).toContain("viewportFit: 'cover'");
  });
});

describe('hierarquia de Finanças', () => {
  const page = read('src/app/financas/page.tsx');
  const at = (needle: string) => {
    const i = page.indexOf(needle);
    expect(i, needle).toBeGreaterThan(-1);
    return i;
  };

  it('não tem a pergunta "Para onde vai nosso dinheiro?"', () => {
    expect(page).not.toMatch(/Para onde vai/i);
  });

  it('ordem: Mês e setas → Resumo → Saldo/Reserva de hoje → Registrar → Meta → Compromissos → Entradas → Faturas e parcelas → Sustentabilidade → Análises', () => {
    const order = [
      at('<MonthNavigator'),
      at('<MonthSummaryCard'),
      at('<AvailableBalanceCard'),
      at('<ReserveCard'),
      at('<RegisterMovementButton'),
      at('<CardGoalCard'),
      at('<CommitmentsSection'),
      at('<ReceivablesSection'),
      at('<CardsSection'),
      at('<SustainabilityCard'),
      at('aria-label="Análises de gastos"'),
    ];
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it('abre no mês atual e todas as seções leem a mesma visão do mês escolhido', () => {
    expect(page).toMatch(/useState<MonthKey>\(currentMonth\)/);
    expect(page).toContain('buildMonthView(data, month)');
    for (const section of ['<CardGoalCard view={view}', '<CommitmentsSection commitments={data.commitments} view={view}', 'view={view}\n              fixedIncomes', '<CardsSection invoices={data.invoices} view={view}', '<SustainabilityCard view={view}']) {
      expect(page, section).toContain(section);
    }
  });

  it('o cadastro de novas movimentações fica só no ponto central', () => {
    expect(page).toContain('showAdd={false}');
  });
});
