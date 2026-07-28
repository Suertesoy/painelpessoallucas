'use client';

import { useEffect, useState } from 'react';
import { Play, CheckCircle2, XCircle, Clock } from 'lucide-react';
import { useCommands } from '@/providers/repository.provider';
import type { Course, StudySession } from '@/modules/learning/domain/learning.schema';

const SESSION_STRUCTURE = ['Revisão', 'Conteúdo novo', 'Exercício'];

function minutesSince(startedAt: string, now: number): number {
  return Math.max(0, Math.round((now - new Date(startedAt).getTime()) / 60000));
}

/**
 * Fluxo de sessão de estudo: iniciar → em andamento → concluir (com duração
 * confirmada) ou cancelar. Reutilizado no dashboard e na página do curso.
 */
export function StudySessionCard({
  course,
  goalMinutes,
  activeSession,
  onChanged,
}: {
  course: Course;
  /** Meta diária VIGENTE (preferência geral), não `course.dailyGoalMinutes`
   * — este último é o valor de criação do curso e não muda quando o usuário
   * ajusta a meta em Configurações. */
  goalMinutes: number;
  activeSession: StudySession | null;
  onChanged: () => void;
}) {
  const { learning: learningCmds } = useCommands();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [durationInput, setDurationInput] = useState('');
  const [confirming, setConfirming] = useState(false);

  const isThisCourseActive = activeSession?.courseId === course.id;

  useEffect(() => {
    if (!isThisCourseActive) return;
    const interval = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(interval);
  }, [isThisCourseActive]);

  const handleStart = async () => {
    setBusy(true);
    setError(null);
    try {
      await learningCmds.startStudySession(course.workspaceId, course.id);
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível iniciar a sessão.');
    } finally {
      setBusy(false);
    }
  };

  const openConfirm = () => {
    if (!activeSession) return;
    setDurationInput(String(minutesSince(activeSession.startedAt, now)));
    setConfirming(true);
    setError(null);
  };

  const handleComplete = async () => {
    if (!activeSession) return;
    const minutes = Number(durationInput);
    setBusy(true);
    setError(null);
    try {
      await learningCmds.completeStudySession(activeSession.id, { durationMinutes: minutes });
      setConfirming(false);
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível concluir a sessão.');
    } finally {
      setBusy(false);
    }
  };

  const handleCancel = async () => {
    if (!activeSession) return;
    setBusy(true);
    setError(null);
    try {
      await learningCmds.cancelStudySession(activeSession.id);
      setConfirming(false);
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível cancelar a sessão.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 md:p-6">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-gray-900">{course.title}</h3>
        <span className="text-xs text-gray-500">
          Sessão de hoje · {goalMinutes} min
        </span>
      </div>

      <ul className="mt-3 space-y-1 text-sm text-gray-600">
        {SESSION_STRUCTURE.map((step) => (
          <li key={step} className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-gray-300" aria-hidden="true" />
            {step}
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-gray-400">
        Estrutura da sessão — conteúdo interativo chega nas próximas fases.
      </p>

      {error && (
        <p role="alert" className="mt-3 text-xs text-red-600">
          {error}
        </p>
      )}

      {isThisCourseActive && activeSession ? (
        confirming ? (
          <div className="mt-4 space-y-2 rounded-lg border border-blue-200 bg-blue-50 p-3">
            <label className="block text-xs font-medium text-blue-900" htmlFor={`duration-${course.id}`}>
              Duração estudada (minutos)
            </label>
            <input
              id={`duration-${course.id}`}
              type="number"
              min={1}
              max={600}
              value={durationInput}
              onChange={(e) => setDurationInput(e.target.value)}
              className="w-24 rounded border border-gray-300 px-2 py-1 text-sm"
            />
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                disabled={busy}
                onClick={() => void handleComplete()}
                className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-60"
              >
                Confirmar conclusão
              </button>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
              >
                Voltar
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-4">
            <p className="flex items-center gap-1.5 text-xs font-medium text-blue-700">
              <Clock size={14} /> Sessão em andamento · {minutesSince(activeSession.startedAt, now)} min
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={openConfirm}
                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-60"
              >
                <CheckCircle2 size={14} /> Concluir sessão
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void handleCancel()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
              >
                <XCircle size={14} /> Cancelar
              </button>
            </div>
          </div>
        )
      ) : activeSession ? (
        <p className="mt-4 text-xs text-gray-500">
          Há uma sessão em andamento em outro curso. Conclua ou cancele antes de iniciar esta.
        </p>
      ) : (
        <button
          type="button"
          disabled={busy}
          onClick={() => void handleStart()}
          className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
        >
          <Play size={14} /> Iniciar sessão
        </button>
      )}
    </div>
  );
}
