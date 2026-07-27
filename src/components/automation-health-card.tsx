'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { format, parseISO, isToday, isYesterday } from 'date-fns';
import { ptBR } from 'date-fns/locale/pt-BR';
import { CheckCircle, AlertTriangle, XCircle, MinusCircle, HelpCircle } from 'lucide-react';
import { useRepositories } from '@/providers/repository.provider';
import { DataErrorNotice } from './data-error-notice';
import type {
  AutomationHealth,
  AutomationHealthStatus,
  AutomationStepHealth,
  AutomationStepStatus,
} from '@/platform/automation/automation-health';

/**
 * Card permanente de saúde das automações, em Configurações. Somente
 * leitura — nunca dispara o cron nem qualquer automação. Toda tradução de
 * erro técnico acontece em `automation-health.ts`; este componente só
 * exibe o que já vem traduzido.
 */

function formatWhen(iso: string | null): string {
  if (!iso) return 'nunca';
  const d = parseISO(iso);
  if (isToday(d)) return `hoje, ${format(d, 'HH:mm')}`;
  if (isYesterday(d)) return `ontem, ${format(d, 'HH:mm')}`;
  return format(d, "d 'de' MMM, HH:mm", { locale: ptBR });
}

const OVERALL_TONE: Record<AutomationHealthStatus, 'good' | 'warn' | 'bad' | 'neutral'> = {
  healthy: 'good',
  attention: 'warn',
  problem: 'bad',
  no_data: 'neutral',
};

const OVERALL_ICON: Record<AutomationHealthStatus, typeof CheckCircle> = {
  healthy: CheckCircle,
  attention: AlertTriangle,
  problem: AlertTriangle,
  no_data: HelpCircle,
};

const OVERALL_LABEL: Record<AutomationHealthStatus, string> = {
  healthy: 'Saudável',
  attention: 'Atenção',
  problem: 'Problema',
  no_data: 'Sem dados',
};

const STEP_TONE: Record<AutomationStepStatus, 'good' | 'warn' | 'bad' | 'neutral'> = {
  ok: 'good',
  attention: 'warn',
  failing: 'bad',
  not_connected: 'warn',
  disabled: 'neutral',
  never_run: 'neutral',
};

const STEP_ICON: Record<AutomationStepStatus, typeof CheckCircle> = {
  ok: CheckCircle,
  attention: AlertTriangle,
  failing: XCircle,
  not_connected: AlertTriangle,
  disabled: MinusCircle,
  never_run: MinusCircle,
};

const STEP_STATUS_LABEL: Record<AutomationStepStatus, string> = {
  ok: 'funcionando',
  attention: 'atenção',
  failing: 'falhando',
  not_connected: 'desconectado',
  disabled: 'desativado',
  never_run: 'sem execução ainda',
};

const TONE_TEXT: Record<'good' | 'warn' | 'bad' | 'neutral', string> = {
  good: 'text-green-700',
  warn: 'text-amber-700',
  bad: 'text-red-700',
  neutral: 'text-gray-500',
};

export function AutomationHealthCard() {
  const { automationHealthRepository } = useRepositories();
  const [health, setHealth] = useState<AutomationHealth | null>(null);
  const [hasError, setHasError] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedStep, setExpandedStep] = useState<string | null>(null);

  const load = useCallback(() => {
    setIsLoading(true);
    setHasError(false);
    automationHealthRepository
      .getHealth()
      .then((h) => setHealth(h))
      .catch((e: unknown) => {
        console.error('Falha ao carregar a saúde das automações', e);
        setHasError(true);
      })
      .finally(() => setIsLoading(false));
  }, [automationHealthRepository]);

  useEffect(() => {
    // Adiado para fora do corpo síncrono do efeito — evita disparar setState
    // (dentro de load()) sincronamente durante a fase de efeitos do React.
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  const OverallIcon = health ? OVERALL_ICON[health.status] : null;
  const overallTone = health ? OVERALL_TONE[health.status] : 'neutral';

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-6" aria-labelledby="automation-health-heading">
      <h2 id="automation-health-heading" className="text-lg font-semibold">
        Automações
      </h2>

      {isLoading && (
        <p className="mt-3 text-sm text-gray-500" aria-live="polite" aria-busy="true">
          Carregando estado das automações…
        </p>
      )}

      {!isLoading && hasError && <DataErrorNotice onRetry={load} className="mt-3" />}

      {!isLoading && !hasError && health && (
        <div className="mt-3" aria-live="polite">
          <div className="flex items-start gap-2">
            {OverallIcon && (
              <OverallIcon size={18} className={`mt-0.5 shrink-0 ${TONE_TEXT[overallTone]}`} aria-hidden="true" />
            )}
            <div>
              <p className={`text-sm font-medium ${TONE_TEXT[overallTone]}`}>
                {OVERALL_LABEL[health.status]} — {health.summaryMessage}
              </p>
              {health.lastFailureMessage && (
                <p className="mt-1 text-xs text-gray-600">Última falha: {health.lastFailureMessage}</p>
              )}
            </div>
          </div>

          <dl className="mt-4 grid grid-cols-2 gap-3 text-xs text-gray-600 sm:grid-cols-3">
            <div>
              <dt className="text-gray-400">Última execução</dt>
              <dd className="font-medium text-gray-800">{formatWhen(health.lastRunAt)}</dd>
            </div>
            <div>
              <dt className="text-gray-400">Últimas 24 horas</dt>
              <dd className="font-medium text-gray-800">{health.runsLast24Hours} execuções</dd>
            </div>
            <div>
              <dt className="text-gray-400">Falhas (24h)</dt>
              <dd className="font-medium text-gray-800">{health.failedRunsLast24Hours}</dd>
            </div>
          </dl>

          {health.lastFailureAction && (
            <StepAction action={health.lastFailureAction} />
          )}

          <ul className="mt-4 divide-y divide-gray-100 border-t border-gray-100">
            {health.steps.map((step) => (
              <StepRow
                key={step.type}
                step={step}
                expanded={expandedStep === step.type}
                onToggle={() => setExpandedStep((cur) => (cur === step.type ? null : step.type))}
              />
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function StepAction({ action }: { action: NonNullable<AutomationStepHealth['suggestedAction']> }) {
  if (action === 'reconnect_calendar' || action === 'reconnect_gmail') {
    return (
      <Link
        href="/configuracoes#integracoes"
        className="mt-2 inline-flex min-h-[44px] items-center text-xs font-medium text-blue-600 hover:underline"
      >
        Reconectar Google
      </Link>
    );
  }
  return null;
}

function StepRow({
  step,
  expanded,
  onToggle,
}: {
  step: AutomationStepHealth;
  expanded: boolean;
  onToggle: () => void;
}) {
  const tone = STEP_TONE[step.status];
  const Icon = STEP_ICON[step.status];
  const hasDetails = step.status !== 'ok' && step.status !== 'never_run' && !!step.userMessage;

  return (
    <li className="py-2">
      <div className="flex items-center justify-between gap-2 text-sm">
        <span className="flex items-center gap-1.5 text-gray-700">
          <Icon size={14} className={TONE_TEXT[tone]} aria-hidden="true" />
          {step.label}
        </span>
        <span className={`text-xs font-medium ${TONE_TEXT[tone]}`}>{STEP_STATUS_LABEL[step.status]}</span>
      </div>

      {hasDetails && (
        <div>
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={expanded}
            className="inline-flex min-h-[44px] items-center text-xs font-medium text-blue-600 hover:underline"
          >
            {expanded ? 'Ocultar detalhes' : 'Ver detalhes'}
          </button>
          {expanded && (
            <div className="mb-1 rounded-md bg-gray-50 p-2 text-xs text-gray-600">
              <p>{step.userMessage}</p>
              {step.suggestedAction && <StepAction action={step.suggestedAction} />}
            </div>
          )}
        </div>
      )}
    </li>
  );
}
