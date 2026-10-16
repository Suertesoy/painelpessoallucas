'use client';

import React, { createContext, useContext, useEffect, useId, useState } from 'react';
import { X } from 'lucide-react';
import { centsToBRL } from '@/modules/finance/domain/money';
import { centsToInput, parseMoneyInput } from '@/lib/money-input';

/** Peças visuais compartilhadas da área de Finanças (tema escuro em camadas). */

export function Card({
  children, className = '', as: Tag = 'section', ...rest
}: { children: React.ReactNode; className?: string; as?: 'section' | 'div' } & React.HTMLAttributes<HTMLElement>) {
  return (
    <Tag
      className={`rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4 shadow-[0_8px_24px_-12px_rgba(0,0,0,0.6)] md:p-5 ${className}`}
      {...rest}
    >
      {children}
    </Tag>
  );
}

export function Eyebrow({ children }: { children: React.ReactNode }) {
  return <p className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">{children}</p>;
}

/**
 * Privacidade visual: quando ativa, os valores viram "••••". Não altera dado
 * algum e não é segurança — só evita mostrar números na tela. Fora do
 * provedor (outras páginas) os valores aparecem normalmente.
 */
export const HideValuesContext = createContext(false);
export const useHideValues = () => useContext(HideValuesContext);

export function Money({
  cents, tone = 'default', size = 'md', className = '',
}: { cents: number; tone?: 'default' | 'positive' | 'negative' | 'warning' | 'muted'; size?: 'sm' | 'md' | 'lg' | 'xl'; className?: string }) {
  const color = {
    default: 'text-[var(--foreground)]',
    positive: 'text-[var(--money-positive)]',
    negative: 'text-[var(--money-negative)]',
    warning: 'text-[var(--money-warning)]',
    muted: 'text-[var(--text-muted)]',
  }[tone];
  const sizeClass = { sm: 'text-sm', md: 'text-base font-semibold', lg: 'text-2xl font-semibold', xl: 'text-4xl font-bold tracking-tight' }[size];
  const hidden = useHideValues();
  if (hidden) {
    return (
      <span className={`tabular ${color} ${sizeClass} ${className}`} aria-label="valor oculto">
        R$ ••••
      </span>
    );
  }
  return <span className={`tabular ${color} ${sizeClass} ${className}`}>{centsToBRL(cents)}</span>;
}

export function Chip({ children, tone = 'neutral' }: { children: React.ReactNode; tone?: 'neutral' | 'info' | 'warning' | 'positive' | 'negative' }) {
  const tones = {
    neutral: 'bg-[var(--surface-raised)] text-[var(--text-muted)] border-[var(--line)]',
    info: 'bg-blue-50 text-blue-800 border-blue-200',
    warning: 'bg-amber-50 text-amber-800 border-amber-200',
    positive: 'bg-green-50 text-green-800 border-green-200',
    negative: 'bg-red-50 text-red-800 border-red-200',
  }[tone];
  return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${tones}`}>{children}</span>;
}

export const buttonPrimary =
  'inline-flex items-center justify-center gap-1.5 rounded-xl bg-blue-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed';
export const buttonSecondary =
  'inline-flex items-center justify-center gap-1.5 rounded-xl border border-[var(--line-strong)] bg-[var(--surface-raised)] px-3.5 py-2 text-sm font-medium text-[var(--foreground)] hover:border-[var(--text-muted)] disabled:opacity-50 disabled:cursor-not-allowed';
export const buttonGhost =
  'inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-[var(--accent)] hover:bg-[var(--surface-raised)]';
export const inputClass =
  'w-full rounded-xl border border-[var(--line-strong)] bg-[var(--surface-inset)] px-3 py-2 text-sm text-[var(--foreground)] placeholder:text-[var(--text-muted)]';

export function Field({ label, hint, children }: { label: string; hint?: string; children: (id: string) => React.ReactNode }) {
  const id = useId();
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-xs font-medium text-[var(--text-muted)]">{label}</label>
      {children(id)}
      {hint && <p className="text-xs text-[var(--text-muted)]">{hint}</p>}
    </div>
  );
}

/**
 * "Quando termina?" — escolha explícita entre sem data final e último mês.
 * Valor controlado: `null` = sem data de término; `''` = escolheu definir mas
 * ainda não informou o mês (o formulário deve bloquear o envio); `YYYY-MM` =
 * último mês. Voltar para "sem data" descarta o mês escolhido.
 */
export function EndMonthField({
  value, onChange, min, legend = 'Quando termina?',
}: { value: string | null; onChange: (v: string | null) => void; min?: string; legend?: string }) {
  const id = useId();
  const defined = value !== null;
  return (
    <fieldset className="space-y-2">
      <legend className="text-xs font-medium text-[var(--text-muted)]">{legend}</legend>
      <label className="flex min-h-11 items-center gap-2 text-sm">
        <input type="radio" name={`${id}-end`} checked={!defined} onChange={() => onChange(null)} />
        Sem data de término
      </label>
      <label className="flex min-h-11 items-center gap-2 text-sm">
        <input type="radio" name={`${id}-end`} checked={defined} onChange={() => onChange(value ?? '')} />
        Definir último mês
      </label>
      {defined && (
        <div className="space-y-1">
          <input
            type="month"
            aria-label="Último mês"
            className={inputClass}
            value={value ?? ''}
            min={min}
            onChange={(e) => onChange(e.target.value)}
          />
          <p className="text-xs text-[var(--text-muted)]">Inclusivo: ainda conta neste mês.</p>
        </div>
      )}
    </fieldset>
  );
}

/** Campo de dinheiro: texto livre em reais, convertido a centavos no envio. */
export function MoneyField({
  label, value, onChange, hint, allowNegative = false,
}: { label: string; value: string; onChange: (v: string) => void; hint?: string; allowNegative?: boolean }) {
  const parsed = parseMoneyInput(value);
  const invalid = value.trim() !== '' && (parsed === null || (!allowNegative && parsed < 0));
  return (
    <Field label={label} hint={invalid ? 'Valor inválido. Exemplo: 1.234,56' : hint}>
      {(id) => (
        <input
          id={id}
          inputMode="decimal"
          autoComplete="off"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="0,00"
          aria-invalid={invalid}
          className={`${inputClass} tabular ${invalid ? 'border-red-500' : ''}`}
        />
      )}
    </Field>
  );
}

export { centsToInput, parseMoneyInput };

/** Folha modal (bottom sheet no celular). Fecha com Esc e clique fora. */
export function Dialog({
  open, title, onClose, children,
}: { open: boolean; title: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center md:items-center" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-black/60" onClick={onClose} aria-hidden="true" />
      <div className="relative max-h-[90dvh] w-full overflow-y-auto rounded-t-3xl border border-[var(--line)] bg-[var(--surface-raised)] p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-2xl md:max-w-md md:rounded-3xl">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Fechar" className="rounded-lg p-1.5 text-[var(--text-muted)] hover:bg-[var(--surface)]">
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Estado de uma ação assíncrona com erro visível (nunca engolido). */
export function useAction() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function run(fn: () => Promise<void>): Promise<boolean> {
    if (pending) return false;
    setPending(true);
    setError(null);
    try {
      await fn();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Algo deu errado. Tente novamente.');
      return false;
    } finally {
      setPending(false);
    }
  }
  return { pending, error, run, clearError: () => setError(null) };
}

export function ErrorText({ message }: { message: string | null }) {
  if (!message) return null;
  return <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{message}</p>;
}

export function formatDateBR(date: string): string {
  const [y, m, d] = date.split('-');
  return `${d}/${m}/${y}`;
}

export function formatDateTimeBR(iso: string | null): string {
  if (!iso) return 'nunca';
  const d = new Date(iso);
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(d);
}
