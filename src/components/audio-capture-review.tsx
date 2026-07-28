'use client';

import { useState } from 'react';
import { AlertCircle, Calendar, Check, X } from 'lucide-react';
import { useRepositories } from '@/providers/repository.provider';
import { datetimeLocalToISO, isoToDatetimeLocalInput } from '@/lib/dates';
import { CalendarEventCreator } from '@/components/calendar-event-creator';
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
 * aprovação explícita e individual antes de qualquer gravação real. O
 * formulário de evento em si (validação, modalidade, local, link, lembretes)
 * vive em CalendarEventCreator — o mesmo componente usado na captura por
 * texto e na criação/edição manual, para que a criação de evento nunca
 * fique restrita ao fluxo de áudio.
 */
export function AudioCaptureReview({
  itemId,
  aiRunId,
  proposal,
  availableProjects,
  onClose,
  onApplied,
}: {
  itemId: string;
  /**
   * ai_runs.id da execução de triagem que gerou esta proposta. Usado tanto
   * para registrar em auditoria quais ações foram aprovadas/rejeitadas
   * quanto para o servidor validar, a cada confirmação, que a proposta
   * ainda corresponde ao texto atual da captura (ver checkTriageFreshness).
   */
  aiRunId: string;
  proposal: AudioTriageProposal;
  availableProjects: AvailableProject[];
  onClose: () => void;
  onApplied?: () => void;
}) {
  const { audioProvenanceRepository } = useRepositories();

  const [drafts, setDrafts] = useState<ActionDraft[]>(() => proposal.proposedActions.map(draftFromAction));

  const updateDraft = (index: number, patch: Partial<ActionDraft>) => {
    setDrafts((prev) => prev.map((d, i) => (i === index ? { ...d, ...patch } : d)));
  };

  const applyAction = async (index: number) => {
    const draft = drafts[index];
    const action = proposal.proposedActions[index];
    updateDraft(index, { status: 'saving', error: null });
    try {
      // Rota de servidor (não itemCmds direto): garante que uma proposta
      // desatualizada — transcrição editada depois desta análise — nunca é
      // confirmada, mesmo que o cliente tente. Ver checkTriageFreshness.
      const res = await fetch('/api/ai/confirm-triage-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          itemId,
          aiRunId,
          actionType: action.actionType,
          action: {
            title: draft.title.trim() || undefined,
            description: draft.description.trim() || undefined,
            itemType: draft.itemType,
            priority: draft.priority,
            projectId: draft.projectId || undefined,
            nextAction: draft.nextAction.trim() || undefined,
            dueAt: datetimeLocalToISO(draft.dueAt),
            scheduledAt: datetimeLocalToISO(draft.scheduledAt),
            estimatedMinutes: draft.estimatedMinutes ? Number(draft.estimatedMinutes) : undefined,
          },
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body.error ?? 'Não foi possível aplicar esta ação.');
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
          {(!proposal.calendarProposal.startAt || !proposal.calendarProposal.endAt) && (
            <p className="mt-1 text-xs text-amber-700">
              Data/horário não identificados com clareza na fala — preencha antes de criar o evento.
            </p>
          )}
          <div className="mt-2">
            <CalendarEventCreator
              itemId={itemId}
              aiRunId={aiRunId}
              initialTitle={proposal.calendarProposal.title}
              initialStartAt={proposal.calendarProposal.startAt}
              initialEndAt={proposal.calendarProposal.endAt}
              initialLocation={proposal.calendarProposal.location}
              attendees={proposal.calendarProposal.attendees}
              onCreated={() => onApplied?.()}
              onOutcome={(status) => void audioProvenanceRepository.recordCalendarOutcome(aiRunId, status)}
            />
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
