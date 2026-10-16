'use client';

import { useId, useState } from 'react';
import { Minus, Plus } from 'lucide-react';
import { formatKg } from '@/modules/workouts/domain/workout.schema';

function parseKg(text: string): number | undefined | null {
  const t = text.trim().replace(',', '.');
  if (!t) return undefined; // vazio = sem carga definida
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? n : null; // null = inválido
}

/**
 * Carga do exercício (uma só por exercício, não por série): rótulo claro,
 * número grande e botões − / + para ajustar com o polegar. `onChange` é
 * chamado a cada mudança válida (uso imediato na tela); `onCommit` quando
 * termina de editar (sair do campo, Enter ou toque em − / +) — é onde se grava.
 */
export function LoadField({
  label = 'Carga',
  initial,
  step = 1,
  disabled,
  onChange,
  onCommit,
}: {
  label?: string;
  initial: number | undefined;
  step?: number;
  disabled?: boolean;
  onChange?: (kg: number | undefined) => void;
  onCommit: (kg: number | undefined) => void;
}) {
  const inputId = useId();
  const [text, setText] = useState(initial != null ? formatKg(initial) : '');
  const parsed = parseKg(text);
  const invalid = parsed === null;

  const apply = (kg: number | undefined, commit: boolean) => {
    setText(kg != null ? formatKg(kg) : '');
    onChange?.(kg);
    if (commit) onCommit(kg);
  };

  const bump = (delta: number) => {
    const base = parsed ?? 0;
    apply(Math.max(0, Math.round((base + delta) * 100) / 100), true);
  };

  const btn =
    'flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-40';

  return (
    <div>
      <label htmlFor={inputId} className="block text-xs font-semibold uppercase tracking-wide text-gray-500">
        {label}
      </label>
      <div className="mt-1 flex items-center gap-2">
        <button type="button" disabled={disabled} className={btn} aria-label={`Diminuir ${step} kg`} onClick={() => bump(-step)}>
          <Minus size={18} />
        </button>
        <div className="relative min-w-0 flex-1">
          <input
            id={inputId}
            inputMode="decimal"
            disabled={disabled}
            value={text}
            placeholder="—"
            aria-invalid={invalid}
            onChange={(e) => {
              setText(e.target.value);
              const p = parseKg(e.target.value);
              if (p !== null) onChange?.(p);
            }}
            onBlur={() => {
              if (!invalid) onCommit(parsed ?? undefined);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            }}
            className={`min-h-12 w-full rounded-xl border px-3 pr-10 text-center text-2xl font-bold ${
              invalid ? 'border-red-400' : 'border-gray-300'
            }`}
          />
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">kg</span>
        </div>
        <button type="button" disabled={disabled} className={btn} aria-label={`Aumentar ${step} kg`} onClick={() => bump(step)}>
          <Plus size={18} />
        </button>
      </div>
    </div>
  );
}
