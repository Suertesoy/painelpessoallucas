'use client';

import { centsToBRL } from '@/modules/finance/domain/money';

/**
 * Rosca em SVG próprio (sem biblioteca).
 *  - Responsiva: escala com a largura do contêiner (viewBox).
 *  - Toque: tocar numa fatia seleciona a categoria.
 *  - Teclado/leitor de tela: a lista de categorias logo abaixo (botões com
 *    nome, valor e porcentagem) é o controle acessível; a rosca é um
 *    resumo visual com descrição textual (role="img").
 *  - Não depende só de cor: a seleção engrossa a fatia e a lista traz
 *    nomes e valores por extenso.
 */

const PALETTE = [
  'hsl(210 70% 60%)', 'hsl(160 55% 48%)', 'hsl(35 85% 58%)', 'hsl(280 50% 66%)', 'hsl(0 65% 62%)',
  'hsl(190 60% 50%)', 'hsl(85 50% 52%)', 'hsl(320 55% 62%)', 'hsl(50 80% 55%)', 'hsl(240 50% 70%)', 'hsl(20 70% 58%)',
];
export const NONE_COLOR = 'hsl(220 8% 55%)';

export interface DonutSlice {
  id: string;
  label: string;
  cents: number;
}

export function sliceColor(slice: DonutSlice, index: number): string {
  return slice.id === 'none' ? NONE_COLOR : PALETTE[index % PALETTE.length];
}

const R = 70;
const CIRC = 2 * Math.PI * R;

export function DonutChart({
  slices, selectedId, onSelect, totalLabel,
}: { slices: DonutSlice[]; selectedId: string | null; onSelect: (id: string) => void; totalLabel: string }) {
  const positive = slices.filter((s) => s.cents > 0);
  const total = positive.reduce((s, x) => s + x.cents, 0);
  let acc = 0;
  const description = positive.length === 0
    ? 'Sem gastos neste período.'
    : `Distribuição de ${centsToBRL(total)}: ${positive.map((s) => `${s.label} ${Math.round((s.cents / total) * 100)}%`).join(', ')}.`;

  return (
    <svg viewBox="0 0 200 200" role="img" aria-label={description} className="mx-auto block h-auto w-full max-w-[16rem]">
      <circle cx="100" cy="100" r={R} fill="none" stroke="var(--line)" strokeWidth="26" />
      {total > 0 && positive.map((s) => {
        const len = (s.cents / total) * CIRC;
        const offset = -acc;
        acc += len;
        const selected = s.id === selectedId;
        const index = slices.indexOf(s);
        return (
          <circle
            key={s.id}
            cx="100"
            cy="100"
            r={R}
            fill="none"
            stroke={sliceColor(s, index)}
            strokeWidth={selected ? 34 : 26}
            strokeDasharray={`${Math.max(len - 1, 0)} ${CIRC - Math.max(len - 1, 0)}`}
            strokeDashoffset={offset}
            transform="rotate(-90 100 100)"
            style={{ cursor: 'pointer', opacity: selectedId && !selected ? 0.55 : 1 }}
            onClick={() => onSelect(s.id)}
          />
        );
      })}
      <text x="100" y="96" textAnchor="middle" fontSize="11" fill="var(--text-muted)">{totalLabel}</text>
      <text x="100" y="116" textAnchor="middle" fontSize="16" fontWeight="600" fill="var(--foreground)">{centsToBRL(total)}</text>
    </svg>
  );
}
