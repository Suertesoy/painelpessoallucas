'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale/pt-BR';
import { X, CheckCircle, RotateCcw, Archive, ArchiveRestore, Loader2, Mic, ExternalLink } from 'lucide-react';
import { useCommands, useQueries, useRepositories } from '@/providers/repository.provider';
import { ITEM_DETAIL_EVENT } from '@/lib/ui-events';
import { datetimeLocalToISO, isoToDatetimeLocalInput } from '@/lib/dates';
import { resolveItemOrigin } from '@/lib/item-origin';
import { formatRecordingDuration } from '@/lib/audio-recording';
import type { Item, ItemType, ItemPriority } from '@/modules/items/domain/item.schema';
import type { Project } from '@/modules/projects/domain/project.schema';
import type { AudioTriageRunSummary, CalendarEventLinkSummary } from '@/platform/ai/audio-provenance.repository';

const TYPE_LABEL: Record<ItemType, string> = {
  note: 'Nota livre',
  task: 'Tarefa',
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
 * (Hoje, Entrada, Agenda, Ideias, detalhe de projeto, busca global).
 * Toda alteração passa pelos Commands/Repositories existentes; nada é
 * gravado diretamente no Supabase pela UI.
 */
export function ItemDetailModal() {
  const { item: itemQueries, project: projectQueries } = useQueries();
  const { item: itemCmds } = useCommands();
  const { eventRepository, audioProvenanceRepository } = useRepositories();

  const [itemId, setItemId] = useState<string | null>(null);
  const [item, setItem] = useState<Item | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [migrationCompletedAt, setMigrationCompletedAt] = useState<string | null>(null);
  const [originalTranscript, setOriginalTranscript] = useState<string | null>(null);
  const [triageRun, setTriageRun] = useState<AudioTriageRunSummary | null>(null);
  const [calendarLink, setCalendarLink] = useState<CalendarEventLinkSummary | null>(null);
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
    if (previousFocusRef.current) previousFocusRef.current.focus();
  }, []);

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

        // Proveniência de áudio é informação complementar de auditoria — uma
        // falha aqui nunca deve impedir a exibição/edição do item.
        if (loadedItem.source === 'audio_capture') {
          Promise.all([
            eventRepository.findByEntityId(itemId),
            audioProvenanceRepository.findLatestTriageRun(itemId),
            audioProvenanceRepository.findCalendarEventLink(itemId),
          ])
            .then(([events, run, link]) => {
              if (cancelled) return;
              const createdEvent = events.find((ev) => ev.type === 'item.created');
              const createdPayload = createdEvent?.payload as { content?: string } | undefined;
              setOriginalTranscript(createdPayload?.content ?? null);
              setTriageRun(run);
              setCalendarLink(link);
            })
            .catch((e: unknown) => {
              console.error('Falha ao carregar proveniência da captura por áudio', e);
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
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Não foi possível salvar as alterações.');
    } finally {
      setIsSaving(false);
    }
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

  const origin = item ? resolveItemOrigin(item, migrationCompletedAt) : null;

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

              {/* Proveniência de captura por áudio */}
              {item.source === 'audio_capture' && (
                <AudioProvenancePanel
                  createdAt={item.createdAt}
                  durationSeconds={item.audioDurationSeconds}
                  originalTranscript={originalTranscript}
                  currentContent={item.content}
                  triageRun={triageRun}
                  calendarLink={calendarLink}
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

function AudioProvenancePanel({
  createdAt,
  durationSeconds,
  originalTranscript,
  currentContent,
  triageRun,
  calendarLink,
}: {
  createdAt: string;
  durationSeconds?: number;
  originalTranscript: string | null;
  currentContent?: string;
  triageRun: AudioTriageRunSummary | null;
  calendarLink: CalendarEventLinkSummary | null;
}) {
  const wasEdited =
    originalTranscript !== null && currentContent !== undefined && currentContent !== originalTranscript;

  return (
    <div className="space-y-3 rounded-lg border border-blue-200 bg-blue-50/50 p-3">
      <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-blue-700">
        <Mic size={12} /> Captura por áudio
      </h3>

      <p className="text-xs text-gray-600">
        Gravado em {formatDateTime(createdAt)}
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
                              : outcome?.status === 'error'
                                ? 'text-red-600'
                                : 'text-gray-400'
                          }
                        >
                          {outcome?.status === 'done'
                            ? 'Aprovada e aplicada'
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

      {calendarLink && (
        <div className="border-t border-blue-100 pt-2 text-xs">
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
      )}
    </div>
  );
}
