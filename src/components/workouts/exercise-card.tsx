'use client';

import { useCallback, useId, useState } from 'react';
import { Check, ChevronDown, Pencil } from 'lucide-react';
import { progressLabel, type ExerciseProgress } from '@/modules/workouts/domain/workout-progress';

/**
 * Card expansível de um exercício.
 *
 * Recolhido mostra só o essencial: nome, progresso das séries ("2/3 séries · Em andamento")
 * e o ícone de expansão. O progresso vem dos registros reais da sessão (props), nunca de
 * um contador próprio. O estado nunca depende só de cor: há texto e ícone (✓ concluído).
 * Expandido mostra o conteúdo do exercício (`children`) e a edição discreta do nome —
 * o nome é da ficha COMPARTILHADA (muda para Lucas e Matheus).
 */

const STATE_STYLE: Record<ExerciseProgress['state'], string> = {
  not_started: 'border-gray-200 bg-white',
  in_progress: 'border-blue-400 bg-blue-50/40',
  done: 'border-emerald-300 bg-white',
};

function SetDots({ progress }: { progress: ExerciseProgress }) {
  return (
    <span aria-hidden="true" className="mt-1.5 flex gap-1">
      {Array.from({ length: Math.min(progress.total, 12) }, (_, i) => (
        <span key={i} className={`h-1.5 w-5 rounded-full ${i < progress.done ? (progress.state === 'done' ? 'bg-emerald-500' : 'bg-blue-500') : 'bg-gray-200'}`} />
      ))}
    </span>
  );
}

function RenameRow({ name, onRename }: { name: string; onRename: (name: string) => Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputId = useId();
  const empty = value.trim().length === 0;

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => { setValue(name); setError(null); setEditing(true); }}
        aria-label={`Editar nome de ${name}`}
        className="inline-flex min-h-10 items-center gap-1 text-xs text-gray-500 hover:text-gray-800"
      >
        <Pencil size={13} aria-hidden="true" /> Editar nome
      </button>
    );
  }
  return (
    <form
      className="space-y-2"
      onSubmit={async (e) => {
        e.preventDefault();
        if (empty) return;
        setBusy(true);
        setError(null);
        try {
          await onRename(value.trim());
          setEditing(false);
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Não foi possível renomear.');
        } finally {
          setBusy(false);
        }
      }}
    >
      <label htmlFor={inputId} className="block text-xs font-medium text-gray-600">Nome do exercício (vale para Lucas e Matheus)</label>
      <input
        id={inputId}
        value={value}
        maxLength={120}
        autoFocus
        onChange={(e) => setValue(e.target.value)}
        className="min-h-12 w-full rounded-xl border border-gray-300 px-3 text-base"
      />
      {empty && <p role="alert" className="text-xs text-red-700">O nome não pode ficar vazio.</p>}
      {error && <p role="alert" className="text-xs text-red-700">{error}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={busy || empty} className="min-h-11 rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white disabled:opacity-50">
          {busy ? 'Salvando…' : 'Salvar'}
        </button>
        <button type="button" disabled={busy} onClick={() => setEditing(false)} className="min-h-11 rounded-xl border border-gray-300 px-4 text-sm text-gray-700">
          Cancelar
        </button>
      </div>
    </form>
  );
}

export function ExerciseCard({ name, progress, summary, open, onToggle, onRename, canRename = true, children }: {
  name: string;
  /** null = sem progresso próprio (vendo a ficha de outra pessoa): mostra `summary`. */
  progress: ExerciseProgress | null;
  summary: string;
  open: boolean;
  onToggle: () => void;
  onRename: (name: string) => Promise<void>;
  canRename?: boolean;
  children: React.ReactNode;
}) {
  const regionId = useId();
  const state = progress?.state ?? 'not_started';
  return (
    <li className={`rounded-3xl border ${progress ? STATE_STYLE[state] : 'border-gray-200 bg-white'}`} data-state={progress?.state ?? 'n/a'}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={regionId}
        className="flex min-h-16 w-full items-center gap-3 rounded-3xl p-4 text-left"
      >
        {progress && (
          <span
            aria-hidden="true"
            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-bold ${state === 'done' ? 'border-emerald-500 bg-emerald-500 text-white' : state === 'in_progress' ? 'border-blue-500 text-blue-700' : 'border-gray-300 text-gray-400'}`}
          >
            {state === 'done' ? <Check size={16} /> : state === 'in_progress' ? '…' : ''}
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-base font-semibold text-gray-900">{name}</span>
          <span className="block text-sm text-gray-600">{progress ? progressLabel(progress) : summary}</span>
          {progress && <SetDots progress={progress} />}
        </span>
        <ChevronDown size={20} aria-hidden="true" className={`shrink-0 text-gray-500 transition-transform motion-reduce:transition-none ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div id={regionId} role="region" aria-label={`Detalhes de ${name}`} className="border-t border-gray-100 px-4 pb-4 pt-3">
          {canRename && <div className="mb-2"><RenameRow name={name} onRename={onRename} /></div>}
          {children}
        </div>
      )}
    </li>
  );
}

/**
 * Qual exercício está aberto, por treino em foco. Sobrevive a navegar para outra ficha/seção
 * e a recarregar a página (sessionStorage da aba; nunca guarda dado de treino, só a escolha de
 * qual card ficou aberto). `undefined` = o usuário ainda não escolheu (vale o padrão: o exercício
 * em andamento); `null` = tudo recolhido por escolha.
 */
export function useOpenExercise(sessionId: string, dayId: string) {
  const key = `lutheus:treino:aberto:${sessionId}`;
  // Leitura preguiçosa: a página só desenha os cards depois de carregar os dados (no cliente),
  // então não há diferença de hidratação — e não é preciso setState dentro de efeito.
  const [map, setMap] = useState<Record<string, string | null>>(() => {
    try {
      const raw = typeof window === 'undefined' ? null : window.sessionStorage.getItem(key);
      return raw ? (JSON.parse(raw) as Record<string, string | null>) : {};
    } catch {
      return {};
    }
  });

  const setOpen = useCallback((id: string | null) => {
    setMap((prev) => {
      const next = { ...prev, [dayId]: id };
      try {
        window.sessionStorage.setItem(key, JSON.stringify(next));
      } catch {
        /* sem armazenamento: continua em memória */
      }
      return next;
    });
  }, [dayId, key]);

  return [map[dayId], setOpen] as const;
}
