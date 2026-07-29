'use client';

import { useEffect, useRef, useState, type ComponentType } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { useCommands } from '@/providers/repository.provider';
import type { Lesson } from '@/modules/learning/domain/learning.schema';
import { EXERCISE_BLOCK_TYPES, type ExerciseResult } from '@/modules/learning/domain/lesson-content.schema';
import { hasPendingExercises, type ExerciseAttempt, type LessonProgress } from '@/modules/learning/domain/lesson-progress.schema';
import { LESSON_BLOCK_COMPONENTS, type LessonBlockViewProps } from './blocks';

function nextAttempt(prior: ExerciseAttempt | undefined, outcome: ExerciseResult['outcome']): ExerciseAttempt {
  const now = new Date().toISOString();
  if (!prior) {
    return { firstOutcome: outcome, latestOutcome: outcome, attemptCount: 1, resolvedAt: outcome === 'correct' ? now : undefined };
  }
  return {
    firstOutcome: prior.firstOutcome,
    latestOutcome: outcome,
    attemptCount: prior.attemptCount + 1,
    resolvedAt: outcome === 'correct' ? now : undefined,
  };
}

/**
 * Renderer único do Learning Content Engine: recebe uma `Lesson` e renderiza
 * `lesson.content.blocks` em sequência, delegando cada bloco ao componente
 * registrado em `LESSON_BLOCK_COMPONENTS` para `block.type`. Nunca conhece
 * uma lição específica — um curso novo é só um novo arquivo de conteúdo em
 * `modules/learning/content/`, nunca um novo componente React.
 *
 * Também é o único ponto que fala com `LearningCommands` para progresso:
 * registra a visualização ao montar (nunca conclui sozinho — só
 * not_started→in_progress), persiste cada tentativa de exercício, e expõe
 * a ação explícita "Concluir lição" — mesmo papel que `StudySessionCard`
 * cumpre para sessões de estudo.
 */
export function LessonRenderer({
  lesson,
  courseId,
  moduleId,
  progress,
  showRomaji = true,
  onCompleted,
}: {
  lesson: Lesson;
  courseId: string;
  moduleId: string;
  /** Progresso já persistido (ou `null`/`undefined` enquanto a query ainda
   * carrega) — usado para restaurar contadores e o estado de cada exercício
   * (resolvido trava; incorreto continua respondível), sem apagar progresso
   * ao atualizar a página. */
  progress: LessonProgress | null | undefined;
  /** `CoursePreferences.showRomaji` — repassado aos blocos `kana`/`example`. */
  showRomaji?: boolean;
  /** Chamado após `completeLesson` ter sucesso — usado pela página da lição
   * para oferecer a navegação para a próxima lição sem esperar um refetch. */
  onCompleted?: () => void;
}) {
  const { learning: learningCmds } = useCommands();
  // Tentativas feitas NESTA montagem — o progresso persistido (via prop,
  // pode chegar depois da primeira renderização) é mesclado por baixo a
  // cada render, nunca copiado para estado.
  const [localAttempts, setLocalAttempts] = useState<Record<string, ExerciseAttempt>>({});
  const attempts: Record<string, ExerciseAttempt> = { ...(progress?.attempts ?? {}), ...localAttempts };
  // Incrementado por blockId quando uma tentativa falha ao persistir, para
  // forçar o bloco de exercício a remontar do zero — o único jeito de
  // reverter também o estado visual interno do bloco (ex.: `selectedId` do
  // multiple_choice), que não é derivado de `attempts`.
  const [retryNonce, setRetryNonce] = useState<Record<string, number>>({});
  const [savingBlockId, setSavingBlockId] = useState<string | null>(null);
  const [exerciseError, setExerciseError] = useState<string | null>(null);

  const [confirmingIncomplete, setConfirmingIncomplete] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [justCompleted, setJustCompleted] = useState(false);
  const [completeError, setCompleteError] = useState<string | null>(null);

  // Idempotente no Command (nunca recria a linha, nunca conclui) — o ref só
  // evita uma segunda chamada supérflua na mesma montagem (ex.: StrictMode).
  const viewedRef = useRef(false);
  useEffect(() => {
    if (viewedRef.current) return;
    viewedRef.current = true;
    void learningCmds.recordLessonViewed(lesson.workspaceId, { courseId, moduleId, lessonId: lesson.id });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lesson.id]);

  const handleExerciseResult = (result: ExerciseResult) => {
    const prior = attempts[result.blockId];
    if (prior?.resolvedAt) return; // já resolvido — idempotente, nunca reabre.

    setExerciseError(null);
    setLocalAttempts((prev) => ({ ...prev, [result.blockId]: nextAttempt(prior, result.outcome) }));
    setSavingBlockId(result.blockId);
    learningCmds
      .recordExerciseResult(lesson.workspaceId, {
        courseId,
        moduleId,
        lessonId: lesson.id,
        blockId: result.blockId,
        outcome: result.outcome,
      })
      .catch(() => {
        // Falha ao persistir: reverte o otimismo local (inclusive o estado
        // visual do bloco, via retryNonce) — nunca deixa a resposta parecer
        // salva quando não foi.
        setLocalAttempts((prev) => {
          const next = { ...prev };
          if (prior) next[result.blockId] = prior;
          else delete next[result.blockId];
          return next;
        });
        setRetryNonce((prev) => ({ ...prev, [result.blockId]: (prev[result.blockId] ?? 0) + 1 }));
        setExerciseError('Não foi possível salvar sua resposta. Tente novamente.');
      })
      .finally(() => {
        setSavingBlockId((current) => (current === result.blockId ? null : current));
      });
  };

  const exerciseBlockIds = lesson.content.blocks
    .filter((b) => (EXERCISE_BLOCK_TYPES as readonly string[]).includes(b.type))
    .map((b) => b.id);
  const answeredCount = exerciseBlockIds.filter((id) => id in attempts).length;
  const resolvedCount = exerciseBlockIds.filter((id) => attempts[id]?.resolvedAt != null).length;
  const pendingCount = exerciseBlockIds.length - resolvedCount;

  const isCompleted = progress?.status === 'completed' || justCompleted;

  const handleCompleteClick = () => {
    if (hasPendingExercises(exerciseBlockIds.length, resolvedCount) && !confirmingIncomplete) {
      setConfirmingIncomplete(true);
      return;
    }
    void doComplete();
  };

  const doComplete = async () => {
    setCompleting(true);
    setCompleteError(null);
    try {
      await learningCmds.completeLesson(lesson.workspaceId, { courseId, moduleId, lessonId: lesson.id });
      setJustCompleted(true);
      onCompleted?.();
    } catch {
      setCompleteError('Não foi possível concluir a lição. Tente novamente.');
    } finally {
      setCompleting(false);
      setConfirmingIncomplete(false);
    }
  };

  const pendingLabel = pendingCount === 1 ? '1 exercício pendente' : `${pendingCount} exercícios pendentes`;

  return (
    <div className="space-y-4">
      {lesson.content.blocks.map((block) => {
        const Component = LESSON_BLOCK_COMPONENTS[block.type] as ComponentType<LessonBlockViewProps>;
        const key = `${block.id}:${retryNonce[block.id] ?? 0}`;
        return (
          <Component
            key={key}
            block={block}
            onExerciseResult={handleExerciseResult}
            attempt={attempts[block.id]}
            showRomaji={showRomaji}
          />
        );
      })}

      {exerciseBlockIds.length > 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5 text-xs text-gray-600">
          <CheckCircle2 size={14} className="text-gray-400" />
          {answeredCount} de {exerciseBlockIds.length} exercício(s) respondido(s) · {resolvedCount} resolvido(s)
          {savingBlockId && <span className="text-gray-400">· salvando…</span>}
        </div>
      )}

      {exerciseError && (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-xs text-red-700">
          {exerciseError}
        </p>
      )}

      {isCompleted ? (
        <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-2.5 text-sm font-medium text-green-700">
          <CheckCircle2 size={16} /> Lição concluída
        </div>
      ) : (
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          {confirmingIncomplete ? (
            <div>
              <p className="text-sm text-amber-700">Ainda há {pendingLabel}. Concluir mesmo assim?</p>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  disabled={completing}
                  onClick={() => void doComplete()}
                  className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-60"
                >
                  Concluir mesmo assim
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmingIncomplete(false)}
                  className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              disabled={completing}
              onClick={handleCompleteClick}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
            >
              <CheckCircle2 size={14} /> {completing ? 'Concluindo…' : 'Concluir lição'}
            </button>
          )}
          {completeError && (
            <p role="alert" className="mt-2 text-xs text-red-700">
              {completeError}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
