'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale/pt-BR';
import { X, CheckCircle, RotateCcw, Archive, ArchiveRestore, Loader2, Mic, ExternalLink, Sparkles, AlertCircle, Calendar, Plus, Bell, BellOff } from 'lucide-react';
import { useCommands, useQueries, useRepositories } from '@/providers/repository.provider';
import { ITEM_DETAIL_EVENT } from '@/lib/ui-events';
import { datetimeLocalToISO, isoToDatetimeLocalInput } from '@/lib/dates';
import { resolveItemOrigin } from '@/lib/item-origin';
import { formatRecordingDuration } from '@/lib/audio-recording';
import { AudioCaptureReview } from '@/components/audio-capture-review';
import { CalendarEventCreator } from '@/components/calendar-event-creator';
import { isAnalyzableCapture } from '@/platform/ai/capture-processing';
import type { Item, ItemType, ItemPriority } from '@/modules/items/domain/item.schema';
import type { Project } from '@/modules/projects/domain/project.schema';
import type { AudioTriageRunSummary, CalendarEventLinkSummary } from '@/platform/ai/audio-provenance.repository';
import type { AudioTriageProposal } from '@/platform/ai/audio-triage.schema';
import type { DomainEvent } from '@/platform/events/event.schema';
import type { Reminder } from '@/modules/reminders/domain/reminder.schema';

/**
 * Uma análise fica desatualizada quando a transcrição (item.content) muda
 * depois que a última triagem por IA foi concluída — usamos o histórico de
 * eventos (item.updated) para detectar isso na interface. A validação que
 * realmente importa (bloquear a confirmação) é feita no servidor
 * (checkTriageFreshness); isto aqui é só um aviso antecipado ao usuário.
 */
function computeTriageStale(events: DomainEvent[], triageRun: AudioTriageRunSummary | null): boolean {
  if (!triageRun || triageRun.status !== 'completed' || !triageRun.completedAt) return false;
  return events.some((ev) => {
    if (ev.type !== 'item.updated' || ev.createdAt <= triageRun.completedAt!) return false;
    const payload = ev.payload as { previous?: { content?: string }; new?: { content?: string } } | undefined;
    return payload?.previous?.content !== payload?.new?.content;
  });
}

const TYPE_LABEL: Record<ItemType, string> = {
  note: 'Nota livre',
  task: 'Tarefa',
  shopping_item: 'Item de compra',
  idea: 'Ideia',
  insight: 'Insight',
  decision: 'Decisão',
  reference: 'Referência',
  reminder: 'Lembrete',
};

const STATUS_LABEL: Record<Item['status'], string> = {
  inbox: 'Inbox',
  organized: 'Organizado',
  planned: 'Planejado',
  in_progress: 'Em andamento',
  blocked: 'Bloqueado',
  completed: 'Concluído',
  archived: 'Arquivado',
};

const PRIORITY_LABEL: Record<ItemPriority, string> = {
  low: 'Baixa',
  normal: 'Normal',
  high: 'Alta',
  critical: 'Crítica',
};

function formatDateTime(iso: string): string {
  return format(parseISO(iso), "d 'de' MMM 'de' yyyy, HH:mm", { locale: ptBR });
}

/**
 * Detalhe/edição de item — aberto de qualquer tela via openItemDetail(id)
 * (Hoje, Entrada, Agenda, Notas, detalhe de projeto, busca global).
 * Toda alteração passa pelos Commands/Repositories existentes; nada é
 * gravado diretamente no Supabase pela UI.
 */
export function ItemDetailModal() {
  const { item: itemQueries, project: projectQueries, reminder: reminderQueries } = useQueries();
  const { item: itemCmds, reminder: reminderCmds } = useCommands();
  const { eventRepository, audioProvenanceRepository } = useRepositories();

  const [itemId, setItemId] = useState<string | null>(null);
  const [item, setItem] = useState<Item | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [migrationCompletedAt, setMigrationCompletedAt] = useState<string | null>(null);
  const [originalTranscript, setOriginalTranscript] = useState<string | null>(null);
  const [triageRun, setTriageRun] = useState<AudioTriageRunSummary | null>(null);
  const [calendarLink, setCalendarLink] = useState<CalendarEventLinkSummary | null>(null);
  const [reminder, setReminder] = useState<Reminder | null>(null);
  const [reminderInput, setReminderInput] = useState('');
  const [reminderSaving, setReminderSaving] = useState(false);
  const [reminderError, setReminderError] = useState<string | null>(null);
  const [isTriageStale, setIsTriageStale] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);
  const [triageProposal, setTriageProposal] = useState<AudioTriageProposal | null>(null);
  const [triageAiRunId, setTriageAiRunId] = useState<string | null>(null);
  const [showCalendarCreator, setShowCalendarCreator] = useState(false);
  // Estado "carregado para" (em vez de um booleano isLoading setado no efeito):
  // carregando é derivado comparando o item aberto com o último id resolvido.
  const [loadedItemId, setLoadedItemId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const isLoading = itemId !== null && loadedItemId !== itemId;
  const previousFocusRef = useRef<HTMLElement | null>(null);

  // Campos editáveis (form controlado, inicializado quando o item carrega).
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [type, setType] = useState<ItemType>('note');
  const [priority, setPriority] = useState<ItemPriority>('normal');
  const [projectId, setProjectId] = useState('');
  const [nextAction, setNextAction] = useState('');
  const [dueAt, setDueAt] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [estimatedMinutes, setEstimatedMinutes] = useState('');

  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);
  const [isActionPending, setIsActionPending] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Mensagem "Salvo." some sozinha após 2s (timer é um efeito legítimo:
  // assina/cancela um relógio externo, sem setState síncrono no corpo).
  useEffect(() => {
    if (!justSaved) return;
    const timer = setTimeout(() => setJustSaved(false), 2000);
    return () => clearTimeout(timer);
  }, [justSaved]);

  const seedForm = (loaded: Item) => {
    setTitle(loaded.title ?? '');
    setContent(loaded.content ?? '');
    setType(loaded.type);
    setPriority(loaded.priority);
    setProjectId(loaded.projectId ?? '');
    setNextAction(loaded.nextAction ?? '');
    setDueAt(isoToDatetimeLocalInput(loaded.dueAt));
    setScheduledAt(isoToDatetimeLocalInput(loaded.scheduledAt));
    setEstimatedMinutes(loaded.estimatedMinutes ? String(loaded.estimatedMinutes) : '');
  };

  const closeModal = useCallback(() => {
    setItemId(null);
    setItem(null);
    setLoadedItemId(null);
    setLoadError(null);
    setSaveError(null);
    setActionError(null);
    setJustSaved(false);
    setOriginalTranscript(null);
    setTriageRun(null);
    setCalendarLink(null);
    setIsTriageStale(false);
    setAnalyzeError(null);
    setTriageProposal(null);
    setTriageAiRunId(null);
    setShowCalendarCreator(false);
    setReminder(null);
    setReminderInput('');
    setReminderError(null);
    if (previousFocusRef.current) previousFocusRef.current.focus();
  }, []);

  // Recarrega proveniência (histórico + última triagem + vínculo de
  // calendário) após aplicar uma ação ou rodar uma nova análise — mantém o
  // painel somente-leitura sempre refletindo o estado mais recente.
  const refreshCaptureProvenance = useCallback(
    async (id: string) => {
      try {
        const [events, run, link] = await Promise.all([
          eventRepository.findByEntityId(id),
          audioProvenanceRepository.findLatestTriageRun(id),
          audioProvenanceRepository.findCalendarEventLink(id),
        ]);
        setTriageRun(run);
        setCalendarLink(link);
        setIsTriageStale(computeTriageStale(events, run));
      } catch (e) {
        console.error('Falha ao atualizar a proveniência da captura', e);
      }
    },
    [eventRepository, audioProvenanceRepository]
  );

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ itemId: string }>).detail;
      if (!detail?.itemId) return;
      previousFocusRef.current = document.activeElement as HTMLElement;
      setItemId(detail.itemId);
    };
    window.addEventListener(ITEM_DETAIL_EVENT, handler);
    return () => window.removeEventListener(ITEM_DETAIL_EVENT, handler);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && itemId) closeModal();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [itemId, closeModal]);

  useEffect(() => {
    if (!itemId) return;
    let cancelled = false;

    Promise.all([
      itemQueries.getItemById(itemId),
      projectQueries.listProjects(),
      eventRepository.findMigrationCompletedAt(),
    ])
      .then(([loadedItem, loadedProjects, migAt]) => {
        if (cancelled) return;
        if (!loadedItem) {
          setLoadError('Item não encontrado.');
          setLoadedItemId(itemId);
          return;
        }
        setItem(loadedItem);
        seedForm(loadedItem);
        setProjects(loadedProjects);
        setMigrationCompletedAt(migAt);
        setLoadError(null);
        setLoadedItemId(itemId);

        // Vínculo de calendário: QUALQUER item pode ter um evento criado pelo
        // painel (não é mais exclusivo de captura por áudio) — uma falha
        // aqui nunca deve impedir a exibição/edição do item.
        audioProvenanceRepository
          .findCalendarEventLink(itemId)
          .then((link) => {
            if (!cancelled) setCalendarLink(link);
          })
          .catch((e: unknown) => {
            console.error('Falha ao carregar o vínculo de calendário', e);
          });

        // Lembrete push pendente (se houver) — falha aqui também nunca
        // impede a exibição/edição do item.
        reminderQueries
          .getPendingPushReminderForItem(itemId)
          .then((pending) => {
            if (!cancelled) setReminder(pending);
          })
          .catch((e: unknown) => {
            console.error('Falha ao carregar o lembrete', e);
          });

        setOriginalTranscript(null);
        setTriageRun(null);
        setIsTriageStale(false);
        setTriageProposal(null);
        setTriageAiRunId(null);

        // A análise é complementar: uma falha aqui nunca deve impedir a
        // exibição/edição da captura original.
        if (isAnalyzableCapture(loadedItem)) {
          Promise.all([
            eventRepository.findByEntityId(itemId),
            audioProvenanceRepository.findLatestTriageRun(itemId),
          ])
            .then(([events, run]) => {
              if (cancelled) return;
              const createdEvent = events.find((ev) => ev.type === 'item.created');
              const createdPayload = createdEvent?.payload as { content?: string } | undefined;
              if (loadedItem.source === 'audio_capture') {
                setOriginalTranscript(createdPayload?.content ?? null);
              }
              const stale = computeTriageStale(events, run);
              setTriageRun(run);
              setIsTriageStale(stale);
              if (
                run?.status === 'completed' &&
                run.proposal &&
                !stale
              ) {
                setTriageProposal(run.proposal);
                setTriageAiRunId(run.id);
              }
            })
            .catch((e: unknown) => {
              console.error('Falha ao carregar a análise da captura', e);
            });
        }
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setLoadError(e instanceof Error ? e.message : 'Erro ao carregar o item.');
        setLoadedItemId(itemId);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemId]);

  if (!itemId) return null;

  const handleSave = async () => {
    if (!title.trim() && !content.trim()) {
      setSaveError('Informe um título ou um conteúdo.');
      return;
    }
    setIsSaving(true);
    setSaveError(null);
    const contentChanged =
      !!item && isAnalyzableCapture(item) && content.trim() !== (item.content ?? '');
    try {
      const updated = await itemCmds.updateItem(itemId, {
        title: title.trim() || undefined,
        content: content.trim() || undefined,
        type,
        priority,
        projectId: projectId || undefined,
        nextAction: nextAction.trim() || undefined,
        dueAt: datetimeLocalToISO(dueAt),
        scheduledAt: datetimeLocalToISO(scheduledAt),
        estimatedMinutes: estimatedMinutes ? Number(estimatedMinutes) : undefined,
      });
      setItem(updated);
      seedForm(updated);
      setJustSaved(true);
      // A transcrição analisada mudou: a proposta em ai_runs não corresponde
      // mais ao texto atual. O servidor sempre revalida antes de confirmar
      // (checkTriageFreshness) — isto só antecipa o aviso na interface.
      if (contentChanged && triageRun?.status === 'completed') {
        setIsTriageStale(true);
      }
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Não foi possível salvar as alterações.');
    } finally {
      setIsSaving(false);
    }
  };

  // Analisa (ou reanalisa) a captura livre com IA a partir do detalhe.
  const handleAnalyzeWithAI = async () => {
    if (!itemId) return;
    setIsAnalyzing(true);
    setAnalyzeError(null);
    try {
      const res = await fetch('/api/ai/triage-capture', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          itemId,
          idempotencyKey: crypto.randomUUID(),
        }),
      });
      if (!res.ok) {
        setAnalyzeError('A captura foi salva, mas a análise não foi concluída. Tente novamente.');
        return;
      }
      const body = await res.json().catch(() => ({}));
      setTriageProposal(body.proposal as AudioTriageProposal);
      setTriageAiRunId(body.aiRunId as string);
      setIsTriageStale(false);
    } catch {
      setAnalyzeError('A captura foi salva, mas a análise não foi concluída. Tente novamente.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const closeTriageReview = () => {
    setTriageProposal(null);
    setTriageAiRunId(null);
    if (itemId) void refreshCaptureProvenance(itemId);
  };

  const runAction = async (fn: () => Promise<Item>) => {
    setIsActionPending(true);
    setActionError(null);
    try {
      const updated = await fn();
      setItem(updated);
      seedForm(updated);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Não foi possível concluir a ação.');
    } finally {
      setIsActionPending(false);
    }
  };

  const clearDate = async (field: 'dueAt' | 'scheduledAt') => {
    setIsSaving(true);
    setSaveError(null);
    try {
      const updated = await itemCmds.updateItem(itemId, { [field]: undefined });
      setItem(updated);
      seedForm(updated);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Não foi possível remover a data.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSetReminder = async () => {
    if (!itemId || !item || !reminderInput) return;
    setReminderSaving(true);
    setReminderError(null);
    try {
      const iso = datetimeLocalToISO(reminderInput);
      if (!iso) throw new Error('Informe uma data e horário para o lembrete.');
      const saved = await reminderCmds.setTaskReminder(itemId, item.workspaceId, iso);
      setReminder(saved);
      setReminderInput('');
    } catch (e) {
      setReminderError(e instanceof Error ? e.message : 'Não foi possível definir o lembrete.');
    } finally {
      setReminderSaving(false);
    }
  };

  const handleCancelReminder = async () => {
    if (!reminder) return;
    setReminderSaving(true);
    setReminderError(null);
    try {
      const cancelled = await reminderCmds.cancelReminder(reminder.id);
      setReminder(cancelled.status === 'cancelled' ? null : cancelled);
    } catch (e) {
      setReminderError(e instanceof Error ? e.message : 'Não foi possível cancelar o lembrete.');
    } finally {
      setReminderSaving(false);
    }
  };

  const origin = item ? resolveItemOrigin(item, migrationCompletedAt) : null;
  const reminderCoveredByCalendar =
    calendarLink?.syncStatus === 'synced' && calendarLink.remindersMinutes.length > 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Detalhe do item"
    >
      <div className="flex h-dvh w-full flex-col overflow-hidden bg-white shadow-xl sm:h-auto sm:max-h-[90vh] sm:w-full sm:max-w-lg sm:rounded-lg">
        <div className="flex items-center justify-between border-b bg-gray-50 p-4">
          <h2 className="font-semibold text-gray-800">Detalhe do item</h2>
          <button onClick={closeModal} className="text-gray-500 hover:text-gray-800" aria-label="Fechar">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {isLoading && <p className="text-sm text-gray-500">Carregando…</p>}

          {!isLoading && loadError && (
            <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-700">
              {loadError}
            </p>
          )}

          {!isLoading && item && item.id === itemId && (
            <div className="space-y-5">
              {/* Ações de status */}
              <div className="flex flex-wrap gap-2">
                {item.status === 'completed' ? (
                  <ActionButton
                    icon={<RotateCcw size={14} />}
                    label="Reabrir"
                    pending={isActionPending}
                    onClick={() => runAction(() => itemCmds.reopenItem(itemId))}
                  />
                ) : item.status !== 'archived' ? (
                  <ActionButton
                    icon={<CheckCircle size={14} />}
                    label="Concluir"
                    pending={isActionPending}
                    onClick={() => runAction(() => itemCmds.completeItem(itemId))}
                  />
                ) : null}

                {item.status === 'archived' ? (
                  <ActionButton
                    icon={<ArchiveRestore size={14} />}
                    label="Desarquivar"
                    pending={isActionPending}
                    onClick={() => runAction(() => itemCmds.unarchiveItem(itemId))}
                  />
                ) : (
                  <ActionButton
                    icon={<Archive size={14} />}
                    label="Arquivar"
                    pending={isActionPending}
                    onClick={() => runAction(() => itemCmds.archiveItem(itemId))}
                  />
                )}

                <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600">
                  Status: {STATUS_LABEL[item.status]}
                </span>
              </div>

              {actionError && (
                <p role="alert" className="rounded-md bg-red-50 p-2 text-xs text-red-700">
                  {actionError}
                </p>
              )}

              {/* Campos editáveis */}
              <div>
                <label htmlFor="item-title" className="mb-1 block text-xs font-medium text-gray-600">
                  Título
                </label>
                <input
                  id="item-title"
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full rounded-md border p-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label htmlFor="item-content" className="mb-1 block text-xs font-medium text-gray-600">
                  Descrição
                </label>
                <textarea
                  id="item-content"
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  rows={4}
                  className="w-full resize-none rounded-md border p-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="item-type" className="mb-1 block text-xs font-medium text-gray-600">
                    Tipo
                  </label>
                  <select
                    id="item-type"
                    value={type}
                    onChange={(e) => setType(e.target.value as ItemType)}
                    className="w-full rounded-md border p-2 text-sm outline-none focus:border-blue-500"
                  >
                    {Object.entries(TYPE_LABEL).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="item-priority" className="mb-1 block text-xs font-medium text-gray-600">
                    Prioridade
                  </label>
                  <select
                    id="item-priority"
                    value={priority}
                    onChange={(e) => setPriority(e.target.value as ItemPriority)}
                    className="w-full rounded-md border p-2 text-sm outline-none focus:border-blue-500"
                  >
                    {Object.entries(PRIORITY_LABEL).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label htmlFor="item-project" className="mb-1 block text-xs font-medium text-gray-600">
                  Projeto
                </label>
                <select
                  id="item-project"
                  value={projectId}
                  onChange={(e) => setProjectId(e.target.value)}
                  className="w-full rounded-md border p-2 text-sm outline-none focus:border-blue-500"
                >
                  <option value="">Sem projeto</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="item-next-action" className="mb-1 block text-xs font-medium text-gray-600">
                  Próxima ação
                </label>
                <input
                  id="item-next-action"
                  type="text"
                  value={nextAction}
                  onChange={(e) => setNextAction(e.target.value)}
                  placeholder="Ex.: Ligar para confirmar horário"
                  className="w-full rounded-md border p-2 text-sm outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label htmlFor="item-estimated" className="mb-1 block text-xs font-medium text-gray-600">
                  Estimativa (minutos)
                </label>
                <input
                  id="item-estimated"
                  type="number"
                  min={1}
                  value={estimatedMinutes}
                  onChange={(e) => setEstimatedMinutes(e.target.value)}
                  className="w-full rounded-md border p-2 text-sm outline-none focus:border-blue-500"
                />
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <div className="mb-1 flex items-center justify-between">
                    <label htmlFor="item-due" className="text-xs font-medium text-gray-600">
                      Prazo
                    </label>
                    {item.dueAt && (
                      <button
                        type="button"
                        onClick={() => clearDate('dueAt')}
                        disabled={isSaving}
                        className="text-xs text-blue-600 hover:underline disabled:opacity-50"
                      >
                        Remover prazo
                      </button>
                    )}
                  </div>
                  <input
                    id="item-due"
                    type="datetime-local"
                    value={dueAt}
                    onChange={(e) => setDueAt(e.target.value)}
                    className="w-full rounded-md border p-2 text-sm outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <div className="mb-1 flex items-center justify-between">
                    <label htmlFor="item-scheduled" className="text-xs font-medium text-gray-600">
                      Agendamento
                    </label>
                    {item.scheduledAt && (
                      <button
                        type="button"
                        onClick={() => clearDate('scheduledAt')}
                        disabled={isSaving}
                        className="text-xs text-blue-600 hover:underline disabled:opacity-50"
                      >
                        Remover agendamento
                      </button>
                    )}
                  </div>
                  <input
                    id="item-scheduled"
                    type="datetime-local"
                    value={scheduledAt}
                    onChange={(e) => setScheduledAt(e.target.value)}
                    className="w-full rounded-md border p-2 text-sm outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              {saveError && (
                <p role="alert" className="rounded-md bg-red-50 p-2 text-xs text-red-700">
                  {saveError}
                </p>
              )}

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={isSaving}
                  className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSaving && <Loader2 size={14} className="animate-spin" aria-hidden="true" />}
                  {isSaving ? 'Salvando…' : 'Salvar alterações'}
                </button>
                {!isSaving && justSaved && (
                  <span className="text-xs text-green-700" role="status">
                    Salvo.
                  </span>
                )}
              </div>

              {/* Origem */}
              {origin && (
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Origem</h3>
                  <p className="mt-1 text-sm text-gray-700">{origin.label}</p>
                  <div className="mt-2 flex flex-wrap gap-3 text-xs">
                    {origin.projectHref && (
                      <Link href={origin.projectHref} className="text-blue-600 hover:underline" onClick={closeModal}>
                        Ver projeto
                      </Link>
                    )}
                    {origin.planHref && (
                      <Link href={origin.planHref} className="text-blue-600 hover:underline" onClick={closeModal}>
                        Ver plano
                      </Link>
                    )}
                  </div>
                </div>
              )}

              {/* Histórico da captura e da análise */}
              {isAnalyzableCapture(item) && (
                <CaptureProvenancePanel
                  source={item.source}
                  createdAt={item.createdAt}
                  durationSeconds={item.audioDurationSeconds}
                  originalTranscript={originalTranscript}
                  currentContent={item.content}
                  triageRun={triageRun}
                />
              )}

              {/* Calendário: qualquer item pode ter (ou ganhar) um evento no
                  Google Calendar — não fica restrito a captura por áudio. */}
              <div className="rounded-lg border border-gray-200 bg-white p-3">
                <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
                  <Calendar size={14} className="text-blue-500" /> Calendário
                </h3>
                {calendarLink ? (
                  <div className="mt-2 text-xs">
                    <a
                      href={googleCalendarEventUrl(calendarLink.googleCalendarId, calendarLink.googleEventId)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-blue-600 hover:underline"
                    >
                      <ExternalLink size={12} /> Ver evento no Google Calendar
                    </a>
                    <span className="ml-2 text-gray-400">({calendarLink.syncStatus})</span>
                  </div>
                ) : showCalendarCreator ? (
                  <div className="mt-2">
                    <CalendarEventCreator
                      itemId={item.id}
                      initialTitle={item.title}
                      onCreated={() => void refreshCaptureProvenance(item.id)}
                    />
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowCalendarCreator(true)}
                    className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                  >
                    <Plus size={12} /> Adicionar evento no Calendar
                  </button>
                )}
              </div>

              {/* Lembrete push — diferente de prazo, agendamento e do
                  lembrete nativo do Google Calendar (ver docs/ARCHITECTURE.md
                  § Web Push). No máximo um lembrete pendente por item. */}
              <div className="rounded-lg border border-gray-200 bg-white p-3">
                <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
                  <Bell size={14} className="text-blue-500" /> Lembrete
                </h3>

                {reminderCoveredByCalendar && (
                  <p className="mt-2 text-xs text-gray-500">
                    Este agendamento já possui lembretes pelo Google Calendar.
                  </p>
                )}

                {reminder ? (
                  <div className="mt-2 space-y-2">
                    <p className="text-xs text-gray-700">
                      Será enviado em {formatDateTime(reminder.remindAt)}.
                    </p>
                    {reminderError && (
                      <p role="alert" className="text-xs text-red-600">
                        {reminderError}
                      </p>
                    )}
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        type="datetime-local"
                        value={reminderInput || isoToDatetimeLocalInput(reminder.remindAt)}
                        onChange={(e) => setReminderInput(e.target.value)}
                        className="rounded-md border p-1.5 text-xs outline-none focus:border-blue-500"
                        aria-label="Novo horário do lembrete"
                      />
                      <button
                        type="button"
                        onClick={() => void handleSetReminder()}
                        disabled={reminderSaving || !reminderInput}
                        className="rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleCancelReminder()}
                        disabled={reminderSaving}
                        className="inline-flex items-center gap-1 rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                      >
                        <BellOff size={12} /> Cancelar
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-2 space-y-2">
                    {reminderError && (
                      <p role="alert" className="text-xs text-red-600">
                        {reminderError}
                      </p>
                    )}
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        type="datetime-local"
                        value={reminderInput}
                        min={isoToDatetimeLocalInput(new Date().toISOString())}
                        onChange={(e) => setReminderInput(e.target.value)}
                        className="rounded-md border p-1.5 text-xs outline-none focus:border-blue-500"
                        aria-label="Data e horário do lembrete"
                      />
                      <button
                        type="button"
                        onClick={() => void handleSetReminder()}
                        disabled={reminderSaving || !reminderInput}
                        className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <Bell size={12} /> Definir lembrete
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Analisar ou retomar a revisão da captura. */}
              {isAnalyzableCapture(item) && !triageProposal && (
                <div className="space-y-2">
                  {isTriageStale && (
                    <p role="alert" className="rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900">
                      A transcrição mudou depois desta análise. Analise novamente antes de confirmar as ações.
                    </p>
                  )}
                  {analyzeError && (
                    <p role="alert" className="flex items-center gap-1 rounded-md bg-red-50 p-2 text-xs text-red-700">
                      <AlertCircle size={12} /> {analyzeError}
                    </p>
                  )}
                  {(!triageRun || isTriageStale || triageRun.status === 'failed') && (
                    <button
                      type="button"
                      onClick={handleAnalyzeWithAI}
                      disabled={isAnalyzing}
                      className="inline-flex min-h-[44px] items-center gap-1.5 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isAnalyzing ? (
                        <>
                          <Loader2 size={14} className="animate-spin" /> Analisando com IA…
                        </>
                      ) : (
                        <>
                          <Sparkles size={14} /> {triageRun ? 'Analisar novamente' : 'Analisar com IA'}
                        </>
                      )}
                    </button>
                  )}
                  {!isTriageStale &&
                    triageRun?.status === 'completed' &&
                    triageRun.proposal && (
                      <button
                        type="button"
                        onClick={() => {
                          setTriageProposal(triageRun.proposal);
                          setTriageAiRunId(triageRun.id);
                        }}
                        className="inline-flex min-h-[44px] items-center gap-1.5 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                      >
                        <Sparkles size={14} /> Revisar sugestões
                      </button>
                    )}
                </div>
              )}

              {isAnalyzableCapture(item) && triageProposal && triageAiRunId && (
                <AudioCaptureReview
                  itemId={item.id}
                  aiRunId={triageAiRunId}
                  proposal={triageProposal}
                  availableProjects={projects.map((p) => ({ id: p.id, name: p.name }))}
                  initialActionOutcomes={triageRun?.actionsOutcome}
                  initialCalendarOutcome={triageRun?.calendarOutcome}
                  onClose={closeTriageReview}
                  onApplied={() => void refreshCaptureProvenance(item.id)}
                />
              )}

              {/* Metadados */}
              <div className="border-t pt-3 text-xs text-gray-500">
                <p>Criado em {formatDateTime(item.createdAt)}</p>
                <p>Atualizado em {formatDateTime(item.updatedAt)}</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ActionButton({
  icon,
  label,
  pending,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  pending: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      className="inline-flex items-center gap-1.5 rounded-full border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {icon} {label}
    </button>
  );
}

const TRIAGE_STATUS_LABEL: Record<AudioTriageRunSummary['status'], string> = {
  queued: 'na fila',
  running: 'em execução',
  completed: 'concluída',
  failed: 'falhou',
};

/**
 * Link direto para o evento no Google Calendar. Formato eid=base64("<eventId> <calendarId>")
 * não é uma API pública documentada, mas é o mesmo padrão que o próprio Google
 * gera em "Copiar link" — mantido best-effort (a tela nunca depende dele).
 */
function googleCalendarEventUrl(calendarId: string, eventId: string): string {
  const base64 = btoa(`${eventId} ${calendarId}`);
  return `https://calendar.google.com/calendar/event?eid=${encodeURIComponent(base64)}`;
}

function CaptureProvenancePanel({
  source,
  createdAt,
  durationSeconds,
  originalTranscript,
  currentContent,
  triageRun,
}: {
  source: Item['source'];
  createdAt: string;
  durationSeconds?: number;
  originalTranscript: string | null;
  currentContent?: string;
  triageRun: AudioTriageRunSummary | null;
}) {
  const wasEdited =
    originalTranscript !== null && currentContent !== undefined && currentContent !== originalTranscript;

  return (
    <div className="space-y-3 rounded-lg border border-blue-200 bg-blue-50/50 p-3">
      <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-blue-700">
        {source === 'audio_capture' ? (
          <>
            <Mic size={12} /> Captura por áudio
          </>
        ) : (
          <>
            <Sparkles size={12} /> Captura livre
          </>
        )}
      </h3>

      <p className="text-xs text-gray-600">
        {source === 'audio_capture' ? 'Gravado' : 'Registrado'} em {formatDateTime(createdAt)}
        {durationSeconds ? ` · ${formatRecordingDuration(durationSeconds)}` : ''}
      </p>

      {originalTranscript && (
        <div>
          <p className="text-[11px] font-medium text-gray-500">Transcrição original</p>
          <p className="mt-0.5 whitespace-pre-wrap rounded-md border bg-white p-2 text-xs text-gray-700">
            {originalTranscript}
          </p>
        </div>
      )}

      {wasEdited && (
        <div>
          <p className="text-[11px] font-medium text-gray-500">Transcrição editada (conteúdo atual)</p>
          <p className="mt-0.5 whitespace-pre-wrap rounded-md border bg-white p-2 text-xs text-gray-700">
            {currentContent}
          </p>
        </div>
      )}

      {triageRun && (
        <div className="space-y-2 border-t border-blue-100 pt-2">
          <p className="text-[11px] font-medium text-gray-500">
            Análise por IA — {TRIAGE_STATUS_LABEL[triageRun.status]}
            {triageRun.model ? ` · modelo ${triageRun.model}` : ''}
          </p>
          {triageRun.proposal ? (
            <>
              <p className="text-xs text-gray-700">
                Confiança geral: {Math.round(triageRun.proposal.overallConfidence * 100)}%.{' '}
                {triageRun.proposal.summary}
              </p>
              {triageRun.proposal.proposedActions.length > 0 && (
                <ul className="space-y-1">
                  {triageRun.proposal.proposedActions.map((action, i) => {
                    const outcome = triageRun.actionsOutcome.find((o) => o.index === i);
                    return (
                      <li
                        key={i}
                        className="flex items-center justify-between gap-2 rounded border bg-white px-2 py-1 text-xs text-gray-700"
                      >
                        <span>{action.title}</span>
                        <span
                          className={
                            outcome?.status === 'done'
                              ? 'text-green-700'
                              : outcome?.status === 'dismissed'
                                ? 'text-gray-500'
                              : outcome?.status === 'error'
                                ? 'text-red-600'
                                : 'text-gray-400'
                          }
                        >
                          {outcome?.status === 'done'
                            ? 'Aprovada e aplicada'
                            : outcome?.status === 'dismissed'
                              ? 'Ignorada'
                            : outcome?.status === 'error'
                              ? 'Aprovada — falhou ao aplicar'
                              : 'Não aprovada'}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
              {triageRun.proposal.calendarProposal && (
                <p className="text-xs text-gray-700">
                  Evento sugerido: {triageRun.proposal.calendarProposal.title} —{' '}
                  {triageRun.calendarOutcome === 'done'
                    ? 'aprovado e criado'
                    : triageRun.calendarOutcome === 'dismissed'
                      ? 'ignorado'
                    : triageRun.calendarOutcome === 'error'
                      ? 'aprovado — falhou ao criar'
                      : 'não aprovado'}
                </p>
              )}
            </>
          ) : (
            triageRun.errorMessage && <p className="text-xs text-red-600">{triageRun.errorMessage}</p>
          )}
        </div>
      )}
    </div>
  );
}
