'use client';

import { useState } from 'react';
import { Target } from 'lucide-react';
import { useCommands } from '@/providers/repository.provider';
import type { MonthView } from '@/modules/finance/cash/domain/month-view';
import type { CardGoal } from '@/modules/finance/cash/domain/card-goals';
import { monthLabel } from '@/modules/finance/cash/domain/month';
import { Card, Chip, Dialog, ErrorText, Money, MoneyField, buttonGhost, buttonPrimary, buttonSecondary, centsToInput, parseMoneyInput, useAction } from './ui';
import { titleMonth } from './month-parts';

/**
 * Meta mensal CONJUNTA dos cartões: um valor que Lucas e Matheus escolhem juntos
 * para os dois cartões somados. Não é o limite sustentável calculado pelo app e
 * nunca altera faturas, saldos nem lançamentos.
 *
 * A barra mostra só o que está LANÇADO nas faturas do mês (valor real). Estimativa
 * pela média aparece à parte, em texto, nunca dentro da barra. Parcelas importadas
 * já estão dentro das faturas e não são somadas de novo.
 */

function GoalDialog({ view, goals, onClose }: { view: MonthView; goals: CardGoal[]; onClose: () => void }) {
  const { financeCash } = useCommands();
  const resolved = view.goal.resolved;
  const [amount, setAmount] = useState(resolved ? centsToInput(resolved.amountCents) : '');
  const [scope, setScope] = useState<'default' | 'month'>(resolved?.source === 'month' ? 'month' : 'default');
  const { pending, error, run } = useAction();
  const cents = parseMoneyInput(amount);
  const hasException = goals.some((g) => g.scope === 'month' && g.month === view.month);
  const startsHere = goals.some((g) => g.scope === 'default' && g.month === view.month);

  return (
    <Dialog open title={resolved ? 'Editar nossa meta' : 'Definir nossa meta mensal'} onClose={onClose}>
      <div className="space-y-4">
        <p className="text-sm text-[var(--text-muted)]">
          Um valor só para os dois cartões somados, escolhido por vocês dois. Não altera faturas, saldos nem lançamentos.
        </p>
        <MoneyField label="Meta dos cartões (por mês)" value={amount} onChange={setAmount} hint="Exemplo: 5.000,00" />
        <fieldset className="space-y-2 text-sm">
          <legend className="font-medium">Quando vale</legend>
          <label className="flex min-h-11 items-start gap-2 rounded-xl border border-[var(--line)] p-3">
            <input type="radio" name="goal-scope" className="mt-1" checked={scope === 'default'} onChange={() => setScope('default')} />
            <span>
              De {monthLabel(view.month)} em diante
              <span className="block text-xs text-[var(--text-muted)]">Vira a meta padrão dos próximos meses, até vocês mudarem. Meses anteriores não mudam.</span>
            </span>
          </label>
          <label className="flex min-h-11 items-start gap-2 rounded-xl border border-[var(--line)] p-3">
            <input type="radio" name="goal-scope" className="mt-1" checked={scope === 'month'} onChange={() => setScope('month')} />
            <span>
              Só {monthLabel(view.month)}
              <span className="block text-xs text-[var(--text-muted)]">Uma exceção: os outros meses seguem a meta padrão.</span>
            </span>
          </label>
        </fieldset>
        <ErrorText message={error} />
        <div className="flex flex-wrap justify-between gap-2">
          <div className="flex flex-wrap gap-2">
            {hasException && (
              <button type="button" className={buttonSecondary} disabled={pending} onClick={async () => { if (await run(() => financeCash.clearCardGoal('month', view.month))) onClose(); }}>
                Remover exceção deste mês
              </button>
            )}
            {startsHere && (
              <button type="button" className={buttonSecondary} disabled={pending} onClick={async () => { if (await run(() => financeCash.clearCardGoal('default', view.month))) onClose(); }}>
                Remover meta padrão daqui
              </button>
            )}
          </div>
          <div className="ml-auto flex gap-2">
            <button type="button" className={buttonSecondary} onClick={onClose}>Cancelar</button>
            <button
              type="button"
              className={buttonPrimary}
              disabled={pending || cents === null || cents <= 0}
              onClick={async () => { if (cents && await run(() => financeCash.setCardGoal({ scope, month: view.month, amountCents: cents }))) onClose(); }}
            >
              {pending ? 'Salvando…' : 'Salvar meta'}
            </button>
          </div>
        </div>
      </div>
    </Dialog>
  );
}

const BASIS_TEXT = {
  complete: { text: 'Faturas fechadas ou pagas', tone: 'positive' as const },
  partial: { text: 'Parcial · há fatura aberta ou sem lançamento, o valor ainda pode subir', tone: 'warning' as const },
  none: { text: 'Nenhuma fatura lançada neste mês', tone: 'neutral' as const },
};

export function CardGoalCard({ view, goals, goalsAvailable }: { view: MonthView; goals: CardGoal[]; goalsAvailable: boolean }) {
  const [editing, setEditing] = useState(false);
  const g = view.goal;
  const pct = g.usagePercent ?? 0;
  const barPct = Math.min(100, Math.max(0, pct));
  const over = g.overCents > 0;
  const basis = BASIS_TEXT[g.basis];

  return (
    <Card aria-label="Meta mensal dos cartões">
      <div className="flex items-start justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-medium text-[var(--text-muted)]"><Target size={16} aria-hidden="true" /> Nossa meta dos cartões</h2>
        {g.resolved && goalsAvailable && (
          <button type="button" className={buttonGhost} onClick={() => setEditing(true)}>Editar</button>
        )}
      </div>

      {!goalsAvailable ? (
        <p className="mt-2 text-sm text-[var(--text-muted)]">A atualização do banco para a meta mensal ainda não foi aplicada. O resto das Finanças segue funcionando.</p>
      ) : !g.resolved ? (
        <div className="mt-2">
          <p className="text-sm text-[var(--text-muted)]">
            Ainda não há meta para {titleMonth(view.month)}. A meta é um valor que vocês escolhem juntos para os dois cartões.
          </p>
          {g.spentCents > 0 && (
            <p className="mt-2 text-sm">Lançado nos cartões: <Money cents={g.spentCents} size="sm" /></p>
          )}
          <button type="button" className={`${buttonPrimary} mt-3`} onClick={() => setEditing(true)}>Definir nossa meta mensal</button>
        </div>
      ) : (
        <div className="mt-2">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-sm">Meta</span>
            <Money cents={g.resolved.amountCents} size="lg" />
          </div>
          <div
            role="progressbar"
            aria-label="Uso da meta dos cartões"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={barPct}
            aria-valuetext={`${pct}% da meta usada${over ? ', acima da meta' : ''}`}
            className="relative mt-3 h-4 overflow-hidden rounded-full bg-[var(--surface-inset)] ring-1 ring-[var(--line-strong)]"
          >
            <div
              className={`h-full rounded-full ${over ? 'bg-[var(--money-warning)]' : 'bg-[var(--accent)]'}`}
              style={{ width: `${barPct}%`, ...(g.basis !== 'complete' ? { backgroundImage: 'repeating-linear-gradient(135deg, rgba(255,255,255,.28) 0 6px, transparent 6px 12px)' } : {}) }}
            />
          </div>
          <p className="mt-2 text-sm">
            <Money cents={g.spentCents} size="sm" /> lançados · <strong>{pct}%</strong> da meta {over && <span className="font-medium text-[var(--money-warning)]">· acima da meta</span>}
          </p>
          <p className="mt-0.5 text-sm">
            {over
              ? <>Excedente: <Money cents={g.overCents} size="sm" tone="warning" /></>
              : <>Restam <Money cents={g.remainingCents ?? 0} size="sm" tone="positive" /> até a meta</>}
          </p>
          <p className="mt-2 flex flex-wrap items-center gap-2 text-xs text-[var(--text-muted)]">
            <Chip tone={basis.tone}>{basis.text}</Chip>
            <span>{g.resolved.source === 'month' ? 'Exceção só para este mês' : g.resolved.since ? `Meta padrão desde ${monthLabel(g.resolved.since)}` : ''}</span>
          </p>
          {g.basis === 'partial' && (
            <p className="mt-1 text-xs text-[var(--text-muted)]">Fatura aberta é valor parcial: o que ainda vai ser lançado não está nessa barra.</p>
          )}
          {g.hypothesisCents !== null && (
            <p className="mt-2 rounded-lg border border-dashed border-[var(--line-strong)] p-2 text-xs text-[var(--text-muted)]">
              Hipótese: mantendo a média dos cartões, o mês chegaria a <Money cents={g.hypothesisCents} size="sm" tone="muted" /> — estimativa, não é gasto lançado.
            </p>
          )}
          {g.aboveSustainableLimit && (
            <p className="mt-2 text-xs text-[var(--text-muted)]">
              Aviso discreto: esta meta está acima do limite sustentável calculado para o mês (<Money cents={view.sustainability.limit.combinedCents} size="sm" tone="muted" />, com as entradas cadastradas). Vocês podem manter a meta.
            </p>
          )}
        </div>
      )}

      {editing && goalsAvailable && <GoalDialog view={view} goals={goals} onClose={() => setEditing(false)} />}
    </Card>
  );
}
