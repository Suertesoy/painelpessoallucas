'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ChevronRight, ListChecks } from 'lucide-react';
import { useReactiveQuery } from '@/lib/hooks';
import { useCommands, useQueries } from '@/providers/repository.provider';
import { useWorkspace } from '@/providers/auth.provider';
import { DataErrorNotice } from '@/components/data-error-notice';
import { buildImportPlan, planKey, summarizePlan, type PlanOverride } from '@/modules/workouts/import/import-plan';
import { SHEET_NAME } from '@/modules/workouts/import/sheet-seed';

/** Treinos: quem vai treinar? Depois, qual treino. */
export default function TreinosPage() {
  const { workspaceId } = useWorkspace();
  const { workout: cmds } = useCommands();
  const { workout: queries } = useQueries();
  const [initError, setInitError] = useState<string | null>(null);
  const initialized = useRef(false);

  const { data: routine, isLoading, error, isOffline, refetch } = useReactiveQuery(() => queries.getRoutine(), []);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    cmds
      .ensureBase(workspaceId)
      .then(() => refetch())
      .catch((e) => setInitError(e instanceof Error ? e.message : 'Não foi possível preparar os Treinos.'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId]);

  if (error) {
    return (
      <div className="mx-auto max-w-2xl p-4">
        <DataErrorNotice isOffline={isOffline} onRetry={refetch} />
      </div>
    );
  }
  if (initError && !routine?.athletes.length) {
    return (
      <div className="mx-auto max-w-2xl p-4">
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{initError}</p>
      </div>
    );
  }
  if (isLoading && !routine) return <div className="p-4 text-sm text-gray-500 md:p-8">Carregando Treinos…</div>;

  const exerciseCount = routine?.days.reduce((n, d) => n + d.exercises.length + d.hidden.length, 0) ?? 0;

  return (
    <div className="mx-auto max-w-2xl p-4 md:p-8">
      <h1 className="text-3xl font-bold text-gray-900">Treinos</h1>
      <p className="mt-1 text-sm text-gray-500">Quem vai treinar?</p>

      <div className="mt-6 grid gap-3" role="group" aria-label="Escolha a pessoa">
        {(routine?.athletes ?? []).map((a) => (
          <Link
            key={a.id}
            href={`/treinos/${a.id}`}
            className="flex min-h-24 items-center justify-between rounded-3xl border border-gray-200 bg-white p-5 text-2xl font-semibold text-gray-900 shadow-[0_12px_28px_-16px_rgba(0,0,0,0.7)] transition hover:bg-gray-50 active:scale-[0.99]"
          >
            {a.name}
            <ChevronRight className="text-gray-400" />
          </Link>
        ))}
      </div>

      {routine && exerciseCount === 0 && <ImportCard workspaceId={workspaceId} />}

      <Link
        href="/treinos/rotina"
        className="mt-8 flex min-h-14 items-center justify-between rounded-2xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-800 hover:bg-gray-50"
      >
        <span className="flex items-center gap-2">
          <ListChecks size={18} aria-hidden="true" /> Editar rotina (exercícios, séries e referências)
        </span>
        <ChevronRight size={18} className="text-gray-400" />
      </Link>
    </div>
  );
}

type FieldState = { rest?: string; mat?: string; lu?: string };

function toNumber(v?: string): number | undefined {
  const t = (v ?? '').trim().replace(',', '.');
  if (!t) return undefined;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

function ImportCard({ workspaceId }: { workspaceId: string }) {
  const { workout: cmds } = useCommands();
  const plan = buildImportPlan();
  const summary = summarizePlan(plan);
  const flagged = plan.filter((p) => p.needsReview);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, FieldState>>({});

  const setField = (key: string, patch: FieldState) => setFields((f) => ({ ...f, [key]: { ...f[key], ...patch } }));

  const run = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const overrides: Record<string, PlanOverride> = {};
      for (const [key, f] of Object.entries(fields)) {
        overrides[key] = { restSeconds: toNumber(f.rest), matheusKg: toNumber(f.mat), lucasKg: toNumber(f.lu) };
      }
      const r = await cmds.importSheetRoutine(workspaceId, overrides);
      setMessage(`${r.created} exercícios importados, ${r.needsReview} ainda marcados “a confirmar”.`);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Não foi possível importar.');
    } finally {
      setBusy(false);
    }
  };

  const input = 'mt-1 block min-h-11 w-24 rounded-xl border border-gray-300 px-2 text-sm';

  return (
    <section className="mt-8 rounded-3xl border border-dashed border-gray-300 bg-white p-5">
      <h2 className="text-lg font-semibold text-gray-900">Importar a planilha</h2>
      <p className="mt-1 text-sm text-gray-600">
        “{SHEET_NAME}”: treinos A–E com {summary.total} exercícios, séries, repetições, descanso e as cargas de Lucas
        e Matheus. Os dados válidos entram normalmente; o que é ambíguo você corrige abaixo ou deixa “a confirmar” (
        {summary.needsReview} exercícios). O marcador “X” da planilha é ignorado.
      </p>
      <ul className="mt-3 max-h-96 space-y-3 overflow-auto text-xs text-gray-600">
        {flagged.map((p) => {
          const key = planKey(p);
          const f = fields[key] ?? {};
          return (
            <li key={key} className="rounded-xl bg-gray-50 p-2">
              <strong className="text-gray-800">
                {p.dayCode} · {p.name}
              </strong>
              : {p.flags.join('; ')}
              <div className="mt-2 flex flex-wrap items-end gap-2">
                {p.editable.rest && (
                  <label className="block">
                    Descanso (s)
                    <input
                      inputMode="numeric"
                      className={input}
                      value={f.rest ?? ''}
                      onChange={(e) => setField(key, { rest: e.target.value })}
                      aria-label={`Descanso em segundos de ${p.name}`}
                    />
                  </label>
                )}
                {p.editable.loads && (
                  <>
                    <label className="block">
                      Matheus (kg)
                      <input
                        inputMode="decimal"
                        className={input}
                        value={f.mat ?? ''}
                        placeholder={p.suggestedLoads?.matheus?.loadKg != null ? String(p.suggestedLoads.matheus.loadKg) : ''}
                        onChange={(e) => setField(key, { mat: e.target.value })}
                        aria-label={`Carga de Matheus em ${p.name}`}
                      />
                    </label>
                    <label className="block">
                      Lucas (kg)
                      <input
                        inputMode="decimal"
                        className={input}
                        value={f.lu ?? ''}
                        placeholder={p.suggestedLoads?.lucas?.loadKg != null ? String(p.suggestedLoads.lucas.loadKg) : ''}
                        onChange={(e) => setField(key, { lu: e.target.value })}
                        aria-label={`Carga de Lucas em ${p.name}`}
                      />
                    </label>
                    {p.suggestedLoads && (
                      <button
                        type="button"
                        className="min-h-11 rounded-xl border border-gray-300 bg-white px-3 text-gray-700"
                        onClick={() =>
                          setField(key, {
                            mat: p.suggestedLoads?.matheus?.loadKg != null ? String(p.suggestedLoads.matheus.loadKg) : '',
                            lu: p.suggestedLoads?.lucas?.loadKg != null ? String(p.suggestedLoads.lucas.loadKg) : '',
                          })
                        }
                      >
                        Confirmar: 1ª coluna = Matheus, 2ª = Lucas
                      </button>
                    )}
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      <button
        type="button"
        disabled={busy}
        onClick={() => void run()}
        className="mt-4 min-h-12 w-full rounded-2xl bg-blue-600 font-semibold text-white disabled:opacity-60"
      >
        {busy ? 'Importando…' : 'Importar exercícios'}
      </button>
      {message && <p role="status" className="mt-3 text-sm text-gray-700">{message}</p>}
    </section>
  );
}
