'use client';

export interface ChartPoint {
  label: string; // ex.: "12/10"
  value: number;
}

/**
 * Gráfico de linha simples em SVG (sem biblioteca). Descrito também por
 * texto em `aria-label` — não depende só de cor.
 */
export function LineChart({ points, unit, title }: { points: ChartPoint[]; unit: string; title: string }) {
  if (points.length === 0) return <p className="text-sm text-gray-500">Sem registros ainda.</p>;

  const W = 320;
  const H = 120;
  const PAD = { l: 8, r: 8, t: 12, b: 20 };
  const values = points.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const x = (i: number) => (points.length === 1 ? W / 2 : PAD.l + (i * (W - PAD.l - PAD.r)) / (points.length - 1));
  const y = (v: number) => PAD.t + (1 - (v - min) / span) * (H - PAD.t - PAD.b);
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
  const first = points[0];
  const last = points[points.length - 1];

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={`${title}: de ${first.value} ${unit} em ${first.label} para ${last.value} ${unit} em ${last.label}, ${points.length} registros`}
      className="h-32 w-full"
    >
      <path d={path} fill="none" stroke="var(--accent)" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
      {points.map((p, i) => (
        <circle key={i} cx={x(i)} cy={y(p.value)} r={3.5} fill="var(--accent)" />
      ))}
      <text x={PAD.l} y={H - 4} fontSize={10} fill="var(--text-muted)">
        {first.label}
      </text>
      <text x={W - PAD.r} y={H - 4} fontSize={10} fill="var(--text-muted)" textAnchor="end">
        {last.label}
      </text>
      <text x={PAD.l} y={9} fontSize={10} fill="var(--text-muted)">
        {max} {unit}
      </text>
    </svg>
  );
}
