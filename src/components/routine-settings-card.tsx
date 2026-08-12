'use client';

import { useEffect, useState } from 'react';
import { CalendarClock } from 'lucide-react';
import { useReactiveQuery } from '@/lib/hooks';
import { useQueries } from '@/providers/repository.provider';

/**
 * Atribuição de projeto aos papéis reutilizáveis da rotina diária
 * ("Projeto principal" / "Frente secundária"). A rotina (horários) é fixa no
 * código; só esta atribuição é configurável, para trocar sem deploy — ver
 * src/modules/routine/domain/routine-engine.ts e /api/settings/routine.
 */
export function RoutineSettingsCard() {
  const { project: projectQueries } = useQueries();
  const { data: projects } = useReactiveQuery(() => projectQueries.listProjects(), []);
  const activeProjects = (projects ?? []).filter((p) => p.status === 'active');

  const [primaryProjectId, setPrimaryProjectId] = useState('');
  const [secondaryProjectId, setSecondaryProjectId] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const timer = setTimeout(async () => {
      try {
        const res = await fetch('/api/settings/routine');
        if (res.ok) {
          const body = (await res.json()) as { primaryProjectId: string | null; secondaryProjectId: string | null };
          setPrimaryProjectId(body.primaryProjectId ?? '');
          setSecondaryProjectId(body.secondaryProjectId ?? '');
        }
      } catch {
        setError('Não foi possível carregar a configuração.');
      } finally {
        setLoaded(true);
      }
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  const save = async () => {
    setBusy(true);
    setError(null);
    setFeedback(null);
    try {
      const res = await fetch('/api/settings/routine', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          primaryProjectId: primaryProjectId || null,
          secondaryProjectId: secondaryProjectId || null,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      setFeedback('Rotina atualizada.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao salvar.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <div className="flex items-center gap-2">
        <CalendarClock size={18} className="text-gray-600" />
        <h3 className="font-semibold">Rotina diária</h3>
      </div>
      <p className="mt-1 text-sm text-gray-500">
        Qual projeto ocupa cada papel da rotina na tela Hoje. Os horários dos blocos são fixos
        (segunda a sexta); só o projeto atribuído a cada papel pode ser trocado aqui.
      </p>

      <div className="mt-4 space-y-3">
        <div>
          <label className="text-xs text-gray-500" htmlFor="routine-primary-project">
            Projeto principal
          </label>
          <select
            id="routine-primary-project"
            value={primaryProjectId}
            onChange={(e) => setPrimaryProjectId(e.target.value)}
            disabled={!loaded}
            className="mt-1 block w-full max-w-xs rounded border border-gray-300 px-2 py-1.5 text-sm outline-none focus:border-blue-500"
          >
            <option value="">Nenhum projeto definido</option>
            {activeProjects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-xs text-gray-500" htmlFor="routine-secondary-project">
            Frente secundária
          </label>
          <select
            id="routine-secondary-project"
            value={secondaryProjectId}
            onChange={(e) => setSecondaryProjectId(e.target.value)}
            disabled={!loaded}
            className="mt-1 block w-full max-w-xs rounded border border-gray-300 px-2 py-1.5 text-sm outline-none focus:border-blue-500"
          >
            <option value="">Nenhum projeto definido</option>
            {activeProjects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
      </div>

      {error && <p role="alert" className="mt-3 text-xs text-red-600">{error}</p>}
      {feedback && <p role="status" className="mt-3 text-xs text-green-700">{feedback}</p>}

      <div className="mt-4">
        <button
          type="button"
          onClick={() => void save()}
          disabled={busy || !loaded}
          className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
        >
          Salvar rotina
        </button>
      </div>
    </div>
  );
}
