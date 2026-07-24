'use client';

import { useState } from 'react';
import { AlertCircle, Calendar, Check, Loader2, X } from 'lucide-react';
import { useCommands, useRepositories } from '@/providers/repository.provider';
import { datetimeLocalToISO, isoToDatetimeLocalInput } from '@/lib/dates';
import type { ItemType, ItemPriority } from '@/modules/items/domain/item.schema';
import type { AudioTriageProposal, ProposedAction } from '@/platform/ai/audio-triage.schema';

const TYPE_LABEL: Record<ItemType, string> = {
  note: 'Nota livre',
  task: 'Tarefa',
  idea: 'Ideia',
  insight: 'Insight',
  decision: 'Decisão',
  reference: 'Referência',
  reminder: 'Lembrete',
};

const PRIORITY_LABEL: Record<ItemPriority, string> = {
  low: 'Baixa',
  normal: 'Normal',
  high: 'Alta',
  critical: 'Crítica',
};

interface ActionDraft {
  approved: boolean;
  title: string;
  description: string;
  itemType: ItemType;
  priority: ItemPriority;
  projectId: string;
  nextAction: string;
  dueAt: string; // datetime-local
  scheduledAt: string; // datetime-local
  estimatedMinutes: string;
  status: 'idle' | 'saving' | 'done' | 'error';
  error: string | null;
}

function draftFromAction(action: ProposedAction): ActionDraft {
  return {
    approved: false,
    title: action.title,
    description: action.description ?? '',
    itemType: action.itemType ?? 'task',
    priority: action.priority ?? 'normal',
    projectId: action.projectId ?? '',
    nextAction: action.nextAction ?? '',
    dueAt: action.dueAt ? isoToDatetimeLocalInput(action.dueAt) : '',
    scheduledAt: action.scheduledAt ? isoToDatetimeLocalInput(action.scheduledAt) : '',
    estimatedMinutes: action.estimatedMinutes ? String(action.estimatedMinutes) : '',
    status: 'idle',
    error: null,
  };
}

interface AvailableProject {
  id: string;
  name: string;
}

/**
 * Revisão da triagem por IA de uma captura de áudio. A IA só propõe — cada
 * ação (item novo, atualização da captura, evento de calendário) exige
 * aprovação explícita e individual antes de qualquer gravação real.
 */
export function AudioCaptureReview({
  itemId,
  workspaceId,
  aiRunId,
  proposal,
  availableProjects,
  onClose,
  onApplied,
}: {
  itemId: string;
  workspaceId: string;
  /** ai_runs.id da execução de triagem que gerou esta proposta — usado só para registrar, em auditoria, quais ações foram aprovadas/rejeitadas. */
  aiRunId: string;
  proposal: AudioTriageProposal;
  availableProjects: AvailableProject[];
  onClose: () => void;
  onApplied?: () => void;
}) {
  const { item: itemCmds } = useCommands();
  const { audioProvenanceRepository } = useRepositories();

  const [drafts, setDrafts] = useState<ActionDraft[]>(() => proposal.proposedActions.map(draftFromAction));

  const [calendarApproved, setCalendarApproved] = useState(false);
  const [calendarTitle, setCalendarTitle] = useState(proposal.calendarProposal?.title ?? '');
  const [calendarDescription, setCalendarDescription] = useState(proposal.calendarProposal?.description ?? '');
  const [calendarLocation, setCalendarLocation] = useState(proposal.calendarProposal?.location ?? '');
  const [calendarStart, setCalendarStart] = useState(
    proposal.calendarProposal?.startAt ? isoToDatetimeLocalInput(proposal.calendarProposal.startAt) : ''
  );
  const [calendarEnd, setCalendarEnd] = useState(
    proposal.calendarProposal?.endAt ? isoToDatetimeLocalInput(proposal.calendarProposal.endAt) : ''
  );
  const [calendarStatus, setCalendarStatus] = useState<'idle' | 'saving' | 'done' | 'error'>('idle');
  const [calendarError, setCalendarError] = useState<string | null>(null);

  // Horário de término sugerido (+60min) quando a IA não informou — calculado
  // no próprio onChange (evento, não efeito), visível e editável, nunca
  // aplicado silenciosamente.
  const handleCalendarStartChange = (value: string) => {
    setCalendarStart(value);
    if (!calendarEnd && value) {
      const start = new Date(datetimeLocalToISO(value) ?? '');
      if (!Number.isNaN(start.getTime())) {
        const end = new Date(start.getTime() + 60 * 60000);
        setCalendarEnd(isoToDatetimeLocalInput(end.toISOString()));
      }
    }
  };

  const updateDraft = (index: number, patch: Partial<ActionDraft>) => {
    setDrafts((prev) => prev.map((d, i) => (i === index ? { ...d, ...patch } : d)));
  };

  const applyAction = async (index: number) => {
    const draft = drafts[index];
    const action = proposal.proposedActions[index];
    updateDraft(index, { status: 'saving', error: null });
    try {
      if (action.actionType === 'update_capture') {
        await itemCmds.updateItem(itemId, {
          title: draft.title.trim() || undefined,
          content: draft.description.trim() || undefined,
          type: draft.itemType,
          priority: draft.priority,
          projectId: draft.projectId || undefined,
          nextAction: draft.nextAction.trim() || undefined,
          dueAt: datetimeLocalToISO(draft.dueAt),
          scheduledAt: datetimeLocalToISO(draft.scheduledAt),
          estimatedMinutes: draft.estimatedMinutes ? Number(draft.estimatedMinutes) : undefined,
        });
      } else if (action.actionType === 'create_item') {
        await itemCmds.createItem(
          {
            title: draft.title.trim() || undefined,
            content: draft.description.trim() || undefined,
            type: draft.itemType,
            priority: draft.priority,
            projectId: draft.projectId || undefined,
            nextAction: draft.nextAction.trim() || undefined,
            dueAt: datetimeLocalToISO(draft.dueAt),
            scheduledAt: datetimeLocalToISO(draft.scheduledAt),
            estimatedMinutes: draft.estimatedMinutes ? Number(draft.estimatedMinutes) : undefined,
            source: 'ai',
          },
          workspaceId
        );
      }
      updateDraft(index, { status: 'done' });
      void audioProvenanceRepository.recordActionOutcome(aiRunId, index, 'done');
      onApplied?.();
    } catch (e) {
      updateDraft(index, { status: 'error', error: e instanceof Error ? e.message : 'Falha ao aplicar a ação.' });
      void audioProvenanceRepository.recordActionOutcome(aiRunId, index, 'error');
    }
  };

  const handleApproveSelected = async () => {
    const indexes = drafts
      .map((d, i) => ({ d, i }))
      .filter(({ d }) => d.approved && d.status !== 'done');
    for (const { i } of indexes) {
      await applyAction(i);
    }
  };

  const handleCreateCalendarEvent = async () => {
    const startIso = datetimeLocalToISO(calendarStart);
    const endIso = datetimeLocalToISO(calendarEnd);
    if (!startIso || !endIso) {
      setCalendarStatus('error');
      setCalendarError('Informe data e horário de início e fim antes de criar o evento.');
      return;
    }
    setCalendarStatus('saving');
    setCalendarError(null);
    try {
      const res = await fetch('/api/audio/confirm-calendar-event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          itemId,
          title: calendarTitle.trim(),
          description: calendarDescription.trim() || undefined,
          startAt: startIso,
          endAt: endIso,
          location: calendarLocation.trim() || undefined,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body.error ?? 'Não foi possível criar o evento.');
      }
      setCalendarStatus('done');
      void audioProvenanceRepository.recordCalendarOutcome(aiRunId, 'done');
      onApplied?.();
    } catch (e) {
      setCalendarStatus('error');
      setCalendarError(e instanceof Error ? e.message : 'Não foi possível criar o evento.');
      void audioProvenanceRepository.recordCalendarOutcome(aiRunId, 'error');
    }
  };

  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-800">
        Nível de confiança geral: {Math.round(proposal.overallConfidence * 100)}%. {proposal.summary}
      </div>

      {proposal.missingInformation.length > 0 && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <p className="font-medium">Informações que faltam para confirmar com segurança:</p>
          <ul className="mt-1 list-disc pl-5 text-xs">
            {proposal.missingInformation.map((m, i) => (
              <li key={i}>{m}</li>
            ))}
          </ul>
        </div>
      )}

      {proposal.projectCandidates.length > 0 && (
        <div className="rounded-lg border border-gray-200 bg-white p-3 text-xs text-gray-700">
          <p className="font-semibold text-gray-500">Projetos sugeridos</p>
          <ul className="mt-1 space-y-1">
            {proposal.projectCandidates.map((c) => (
              <li key={c.projectId} className="flex items-center justify-between gap-2">
                <span>{c.projectName} — {c.reason}</span>
                <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-[10px]">
                  {Math.round(c.confidence * 100)}%
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-gray-800">Ações propostas</h3>
        {proposal.proposedActions.length === 0 && (
          <p className="text-sm text-gray-500">Nenhuma ação adicional sugerida além da própria captura.</p>
        )}
        {proposal.proposedActions.map((action, i) => {
          const draft = drafts[i];
          if (action.actionType === 'create_calendar_event') return null;
          return (
            <div key={i} className="rounded-lg border border-gray-200 bg-white p-3">
              <div className="flex items-start gap-2">
                <input
                  type="checkbox"
                  checked={draft.approved}
                  disabled={draft.status === 'done'}
                  onChange={(e) => updateDraft(i, { approved: e.target.checked })}
                  aria-label={`Aprovar ação: ${draft.title}`}
                  className="mt-1"
                />
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium uppercase tracking-wide text-gray-400">
                      {action.actionType === 'update_capture' ? 'Atualizar a captura' : 'Criar novo item'}
                    </span>
                    <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] text-gray-600">
                      confiança {Math.round(action.confidence * 100)}%
                    </span>
                  </div>
                  <input
                    type="text"
                    value={draft.title}
                    onChange={(e) => updateDraft(i, { title: e.target.value })}
                    className="w-full rounded border p-1.5 text-sm outline-none focus:border-blue-500"
                    aria-label="Título da ação"
                  />
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <select
                      value={draft.itemType}
                      onChange={(e) => updateDraft(i, { itemType: e.target.value as ItemType })}
                      className="rounded border p-1.5 text-xs outline-none"
                      aria-label="Tipo"
                    >
                      {Object.entries(TYPE_LABEL).map(([v, l]) => (
                        <option key={v} value={v}>{l}</option>
                      ))}
                    </select>
                    <select
                      value={draft.priority}
                      onChange={(e) => updateDraft(i, { priority: e.target.value as ItemPriority })}
                      className="rounded border p-1.5 text-xs outline-none"
                      aria-label="Prioridade"
                    >
                      {Object.entries(PRIORITY_LABEL).map(([v, l]) => (
                        <option key={v} value={v}>{l}</option>
                      ))}
                    </select>
                    <select
                      value={draft.projectId}
                      onChange={(e) => updateDraft(i, { projectId: e.target.value })}
                      className="col-span-2 rounded border p-1.5 text-xs outline-none"
                      aria-label="Projeto"
                    >
                      <option value="">Sem projeto</option>
                      {availableProjects.map((p) => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <label className="text-[11px] text-gray-500">
                      Prazo
                      <input
                        type="datetime-local"
                        value={draft.dueAt}
                        onChange={(e) => updateDraft(i, { dueAt: e.target.value })}
                        className="mt-0.5 w-full rounded border p-1.5 text-xs outline-none"
                      />
                    </label>
                    <label className="text-[11px] text-gray-500">
                      Agendamento
                      <input
                        type="datetime-local"
                        value={draft.scheduledAt}
                        onChange={(e) => updateDraft(i, { scheduledAt: e.target.value })}
                        className="mt-0.5 w-full rounded border p-1.5 text-xs outline-none"
                      />
                    </label>
                  </div>
                  <input
                    type="text"
                    value={draft.nextAction}
                    onChange={(e) => updateDraft(i, { nextAction: e.target.value })}
                    placeholder="Próxima ação (opcional)"
                    className="w-full rounded border p-1.5 text-xs outline-none"
                  />

                  {draft.status === 'error' && draft.error && (
                    <p role="alert" className="flex items-center gap-1 text-xs text-red-600">
                      <AlertCircle size={12} /> {draft.error}
                    </p>
                  )}
                  {draft.status === 'done' && (
                    <p className="flex items-center gap-1 text-xs text-green-700">
                      <Check size={12} /> Aplicado
                    </p>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {proposal.proposedActions.some((a) => a.actionType !== 'create_calendar_event') && (
          <button
            type="button"
            onClick={handleApproveSelected}
            disabled={!drafts.some((d) => d.approved && d.status !== 'done')}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Confirmar ações selecionadas
          </button>
        )}
      </div>

      {proposal.calendarProposal && (
        <div className="rounded-lg border border-gray-200 bg-white p-3">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-800">
            <Calendar size={16} className="text-blue-500" /> Evento sugerido (calendário &quot;Painel Lucas&quot;)
          </h3>
          <div className="mt-2 space-y-2">
            <input
              type="text"
              value={calendarTitle}
              onChange={(e) => setCalendarTitle(e.target.value)}
              className="w-full rounded border p-1.5 text-sm outline-none"
              aria-label="Título do evento"
            />
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <label className="text-[11px] text-gray-500">
                Início
                <input
                  type="datetime-local"
                  value={calendarStart}
                  onChange={(e) => handleCalendarStartChange(e.target.value)}
                  className="mt-0.5 w-full rounded border p-1.5 text-xs outline-none"
                />
              </label>
              <label className="text-[11px] text-gray-500">
                Fim
                <input
                  type="datetime-local"
                  value={calendarEnd}
                  onChange={(e) => setCalendarEnd(e.target.value)}
                  className="mt-0.5 w-full rounded border p-1.5 text-xs outline-none"
                />
              </label>
            </div>
            <input
              type="text"
              value={calendarLocation}
              onChange={(e) => setCalendarLocation(e.target.value)}
              placeholder="Local (opcional)"
              className="w-full rounded border p-1.5 text-xs outline-none"
            />
            <textarea
              value={calendarDescription}
              onChange={(e) => setCalendarDescription(e.target.value)}
              placeholder="Descrição (opcional)"
              rows={2}
              className="w-full resize-none rounded border p-1.5 text-xs outline-none"
            />
            {proposal.calendarProposal.attendees.length > 0 && (
              <p className="text-xs text-gray-500">
                Participantes mencionados (sugestão — nenhum convite será enviado):{' '}
                {proposal.calendarProposal.attendees.join(', ')}
              </p>
            )}
            {(!calendarStart || !calendarEnd) && (
              <p className="text-xs text-amber-700">
                Data/horário não identificados com clareza na fala — preencha antes de criar o evento.
              </p>
            )}
            {calendarStatus === 'error' && calendarError && (
              <p role="alert" className="flex items-center gap-1 text-xs text-red-600">
                <AlertCircle size={12} /> {calendarError}
              </p>
            )}
            {calendarStatus === 'done' ? (
              <p className="flex items-center gap-1 text-xs text-green-700">
                <Check size={12} /> Evento criado no calendário &quot;Painel Lucas&quot;.
              </p>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setCalendarApproved(true);
                  void handleCreateCalendarEvent();
                }}
                disabled={calendarStatus === 'saving' || !calendarStart || !calendarEnd}
                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {calendarStatus === 'saving' && <Loader2 size={14} className="animate-spin" />}
                {calendarApproved && calendarStatus === 'saving' ? 'Criando evento…' : 'Criar evento no Calendar'}
              </button>
            )}
          </div>
        </div>
      )}

      <div className="flex justify-end border-t pt-3">
        <button
          type="button"
          onClick={onClose}
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          <X size={14} /> Manter só como captura / Fechar
        </button>
      </div>
    </div>
  );
}
