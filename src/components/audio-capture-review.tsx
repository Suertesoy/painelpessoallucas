'use client';

import { useState } from 'react';
import { AlertCircle, Calendar, Check, ExternalLink, Loader2, MapPin, Video, X } from 'lucide-react';
import { useRepositories } from '@/providers/repository.provider';
import { datetimeLocalToISO, isoToDatetimeLocalInput } from '@/lib/dates';
import {
  DEFAULT_EVENT_DURATION_MINUTES,
  REMINDER_LABELS,
  addMinutesIso,
  computeActiveReminders,
  diffMinutes,
  isValidMeetingLink,
  validateEventInterval,
  type EventModality,
} from '@/lib/calendar-event-shared';
import { LocationSearch, type SelectedLocation } from '@/components/location-search';
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

const MODALITY_LABEL: Record<EventModality, string> = {
  in_person: 'Presencial',
  online: 'Online',
  undetermined: 'Local ainda não definido',
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

/** Fim padrão (+60min) quando só há início — sugestão visível, sempre editável. */
function defaultEndFromStart(startLocal: string): string {
  const startIso = datetimeLocalToISO(startLocal);
  if (!startIso) return '';
  return isoToDatetimeLocalInput(addMinutesIso(startIso, DEFAULT_EVENT_DURATION_MINUTES));
}

function formatSummaryDateTime(local: string): string {
  const iso = datetimeLocalToISO(local);
  if (!iso) return '—';
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}

interface AvailableProject {
  id: string;
  name: string;
}

interface CreatedEventInfo {
  googleEventId: string;
  googleCalendarId: string;
  htmlLink: string | null;
  title: string;
  startAt: string;
  endAt: string;
  timeZone: string;
  location: string | null;
  meetingLink: string | null;
  modality: EventModality;
  reminders: number[];
}

/**
 * Revisão da triagem por IA de uma captura de áudio. A IA só propõe — cada
 * ação (item novo, atualização da captura, evento de calendário) exige
 * aprovação explícita e individual antes de qualquer gravação real.
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
  const { audioProvenanceRepository, calendarEventLinkRepository } = useRepositories();

  const [drafts, setDrafts] = useState<ActionDraft[]>(() => proposal.proposedActions.map(draftFromAction));

  const [calendarApproved, setCalendarApproved] = useState(false);
  const [calendarTitle, setCalendarTitle] = useState(proposal.calendarProposal?.title ?? '');
  const [calendarDescription, setCalendarDescription] = useState(proposal.calendarProposal?.description ?? '');
  const [calendarStart, setCalendarStart] = useState(
    proposal.calendarProposal?.startAt ? isoToDatetimeLocalInput(proposal.calendarProposal.startAt) : ''
  );
  const initialEnd = proposal.calendarProposal?.endAt
    ? isoToDatetimeLocalInput(proposal.calendarProposal.endAt)
    : proposal.calendarProposal?.startAt
      ? defaultEndFromStart(isoToDatetimeLocalInput(proposal.calendarProposal.startAt))
      : '';
  const [calendarEnd, setCalendarEnd] = useState(initialEnd);
  // true quando o usuário (ou a proposta da IA) já fixou uma duração
  // explícita — nesse caso, alterar o início preserva a duração em vez de
  // reaplicar os 60min padrão.
  const [durationManuallySet, setDurationManuallySet] = useState(!!proposal.calendarProposal?.endAt);

  const [modality, setModality] = useState<EventModality>(
    proposal.calendarProposal?.location ? 'in_person' : 'undetermined'
  );
  const [locationText, setLocationText] = useState(proposal.calendarProposal?.location ?? '');
  const [locationSelected, setLocationSelected] = useState<SelectedLocation | null>(null);
  const [meetingLink, setMeetingLink] = useState('');

  const [reminder1440, setReminder1440] = useState(true);
  const [reminder60, setReminder60] = useState(true);

  const [calendarStatus, setCalendarStatus] = useState<'idle' | 'saving' | 'done' | 'link_pending' | 'error'>('idle');
  const [calendarError, setCalendarError] = useState<string | null>(null);
  const [createdEvent, setCreatedEvent] = useState<CreatedEventInfo | null>(null);
  const [isRetryingLink, setIsRetryingLink] = useState(false);

  const startIso = datetimeLocalToISO(calendarStart);
  const endIso = datetimeLocalToISO(calendarEnd);
  const intervalCheck = validateEventInterval(startIso, endIso);
  const showIntervalError = !!calendarStart && !!calendarEnd && !intervalCheck.valid;
  const durationMinutes = startIso && endIso && intervalCheck.valid ? diffMinutes(startIso, endIso) : null;

  const requestedReminderMinutes = [reminder1440 ? 1440 : null, reminder60 ? 60 : null].filter(
    (m): m is number => m !== null
  );
  const reminderPreview = startIso ? computeActiveReminders(startIso, requestedReminderMinutes) : null;

  const meetingLinkError = modality === 'online' && meetingLink.trim() !== '' && !isValidMeetingLink(meetingLink);

  const canCreateEvent =
    !!calendarStart && !!calendarEnd && intervalCheck.valid && !meetingLinkError && calendarStatus !== 'saving';

  const handleCalendarStartChange = (value: string) => {
    const previousStartIso = datetimeLocalToISO(calendarStart);
    const previousEndIso = datetimeLocalToISO(calendarEnd);
    setCalendarStart(value);

    const newStartIso = datetimeLocalToISO(value);
    if (!newStartIso) return;

    if (durationManuallySet && previousStartIso && previousEndIso && previousEndIso > previousStartIso) {
      const currentDuration = diffMinutes(previousStartIso, previousEndIso);
      setCalendarEnd(isoToDatetimeLocalInput(addMinutesIso(newStartIso, currentDuration)));
    } else {
      setCalendarEnd(isoToDatetimeLocalInput(addMinutesIso(newStartIso, DEFAULT_EVENT_DURATION_MINUTES)));
    }
  };

  const handleCalendarEndChange = (value: string) => {
    setCalendarEnd(value);
    setDurationManuallySet(true);
  };

  const handleDurationChange = (value: string) => {
    const minutes = Number(value);
    if (!startIso || !Number.isFinite(minutes) || minutes <= 0) return;
    setCalendarEnd(isoToDatetimeLocalInput(addMinutesIso(startIso, minutes)));
    setDurationManuallySet(true);
  };

  const handleModalityChange = (next: EventModality) => {
    setModality(next);
    if (next !== 'in_person') setLocationSelected(null);
    if (next !== 'online') setMeetingLink('');
  };

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

  const handleCreateCalendarEvent = async () => {
    const validation = validateEventInterval(startIso, endIso);
    if (!validation.valid) {
      setCalendarStatus('error');
      setCalendarError(validation.message ?? 'Intervalo inválido.');
      return;
    }
    if (modality === 'online' && meetingLink.trim() && !isValidMeetingLink(meetingLink)) {
      setCalendarStatus('error');
      setCalendarError('O link da reunião precisa ser um endereço https:// válido.');
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
          aiRunId,
          title: calendarTitle.trim(),
          description: calendarDescription.trim() || undefined,
          startAt: startIso,
          endAt: endIso,
          modality,
          location: modality === 'in_person' ? locationText.trim() || undefined : undefined,
          locationPlaceId: modality === 'in_person' ? locationSelected?.placeId : undefined,
          locationLat: modality === 'in_person' ? locationSelected?.lat : undefined,
          locationLng: modality === 'in_person' ? locationSelected?.lng : undefined,
          meetingLink: modality === 'online' ? meetingLink.trim() || undefined : undefined,
          reminderMinutes: requestedReminderMinutes,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body.error ?? 'Não foi possível criar o evento.');
      }

      const info: CreatedEventInfo = {
        googleEventId: body.googleEventId,
        googleCalendarId: body.googleCalendarId,
        htmlLink: body.htmlLink ?? null,
        title: body.title,
        startAt: body.startAt,
        endAt: body.endAt,
        timeZone: body.timeZone,
        location: body.location ?? null,
        meetingLink: body.meetingLink ?? null,
        modality: body.modality,
        reminders: body.reminders ?? [],
      };
      setCreatedEvent(info);

      if (body.status === 'created_link_pending') {
        setCalendarStatus('link_pending');
        setCalendarError(null);
      } else {
        setCalendarStatus('done');
        calendarEventLinkRepository.notifyChanged();
      }
      void audioProvenanceRepository.recordCalendarOutcome(aiRunId, 'done');
      onApplied?.();
    } catch (e) {
      setCalendarStatus('error');
      setCalendarError(e instanceof Error ? e.message : 'Não foi possível criar o evento.');
      void audioProvenanceRepository.recordCalendarOutcome(aiRunId, 'error');
    }
  };

  const handleRetryLink = async () => {
    if (!createdEvent) return;
    setIsRetryingLink(true);
    try {
      const res = await fetch('/api/audio/link-calendar-event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          itemId,
          aiRunId,
          googleCalendarId: createdEvent.googleCalendarId,
          googleEventId: createdEvent.googleEventId,
          title: createdEvent.title,
          startAt: createdEvent.startAt,
          endAt: createdEvent.endAt,
          timeZone: createdEvent.timeZone,
          modality: createdEvent.modality,
          location: createdEvent.location,
          meetingLink: createdEvent.meetingLink,
          htmlLink: createdEvent.htmlLink,
          reminders: createdEvent.reminders,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setCalendarError(body.error ?? 'Ainda não foi possível atualizar a agenda do painel.');
        return;
      }
      setCalendarStatus('done');
      setCalendarError(null);
      calendarEventLinkRepository.notifyChanged();
    } finally {
      setIsRetryingLink(false);
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
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
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
                  onChange={(e) => handleCalendarEndChange(e.target.value)}
                  className="mt-0.5 w-full rounded border p-1.5 text-xs outline-none"
                />
              </label>
              <label className="text-[11px] text-gray-500">
                Duração (min)
                <input
                  type="number"
                  min={1}
                  value={durationMinutes ?? ''}
                  onChange={(e) => handleDurationChange(e.target.value)}
                  className="mt-0.5 w-full rounded border p-1.5 text-xs outline-none"
                  aria-label="Duração em minutos"
                />
              </label>
            </div>

            {showIntervalError && (
              <p role="alert" className="flex items-center gap-1 text-xs text-red-600">
                <AlertCircle size={12} /> {intervalCheck.message}
              </p>
            )}

            <div>
              <p className="text-[11px] font-medium text-gray-500">Modalidade</p>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {(Object.keys(MODALITY_LABEL) as EventModality[]).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => handleModalityChange(m)}
                    aria-pressed={modality === m}
                    className={`rounded-full border px-2.5 py-1 text-xs font-medium ${
                      modality === m
                        ? 'border-blue-600 bg-blue-600 text-white'
                        : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    {MODALITY_LABEL[m]}
                  </button>
                ))}
              </div>
            </div>

            {modality === 'in_person' && (
              <div>
                <LocationSearch value={locationText} onChange={setLocationText} onSelect={setLocationSelected} />
                {locationText && (
                  <p className="mt-1 text-[11px] text-gray-500">
                    {locationSelected ? (
                      <span className="text-green-700">Local selecionado: {locationSelected.formattedAddress}</span>
                    ) : (
                      <span className="text-amber-700">Texto digitado sem selecionar uma sugestão — será salvo como informado.</span>
                    )}
                  </p>
                )}
              </div>
            )}

            {modality === 'online' && (
              <div>
                <input
                  type="url"
                  value={meetingLink}
                  onChange={(e) => setMeetingLink(e.target.value)}
                  placeholder="Link da reunião (Meet, Teams, Zoom…)"
                  className="w-full rounded border p-1.5 text-xs outline-none"
                  aria-label="Link da reunião"
                />
                {meetingLinkError && (
                  <p role="alert" className="mt-1 text-[11px] text-red-600">
                    O link precisa ser um endereço https:// válido.
                  </p>
                )}
              </div>
            )}

            <textarea
              value={calendarDescription}
              onChange={(e) => setCalendarDescription(e.target.value)}
              placeholder="Descrição (opcional)"
              rows={2}
              className="w-full resize-none rounded border p-1.5 text-xs outline-none"
            />

            <div>
              <p className="text-[11px] font-medium text-gray-500">Lembretes</p>
              <div className="mt-1 flex flex-wrap gap-3 text-xs text-gray-700">
                <label className="flex items-center gap-1.5">
                  <input type="checkbox" checked={reminder1440} onChange={(e) => setReminder1440(e.target.checked)} />
                  {REMINDER_LABELS[1440]}
                </label>
                <label className="flex items-center gap-1.5">
                  <input type="checkbox" checked={reminder60} onChange={(e) => setReminder60(e.target.checked)} />
                  {REMINDER_LABELS[60]}
                </label>
              </div>
              {reminderPreview?.notice && (
                <p className="mt-1 text-[11px] text-amber-700">{reminderPreview.notice}</p>
              )}
            </div>

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

            {calendarStatus !== 'done' && calendarStatus !== 'link_pending' && calendarStart && calendarEnd && intervalCheck.valid && (
              <div className="rounded-md border border-gray-100 bg-gray-50 p-2 text-[11px] text-gray-600">
                <p><span className="font-medium">Título:</span> {calendarTitle || '—'}</p>
                <p><span className="font-medium">Início:</span> {formatSummaryDateTime(calendarStart)}</p>
                <p><span className="font-medium">Término:</span> {formatSummaryDateTime(calendarEnd)}</p>
                <p><span className="font-medium">Duração:</span> {durationMinutes} min</p>
                <p><span className="font-medium">Modalidade:</span> {MODALITY_LABEL[modality]}</p>
                {modality === 'in_person' && locationText && (
                  <p><span className="font-medium">Local:</span> {locationText}</p>
                )}
                {modality === 'online' && meetingLink && (
                  <p><span className="font-medium">Link:</span> {meetingLink}</p>
                )}
                <p>
                  <span className="font-medium">Lembretes:</span>{' '}
                  {reminderPreview && reminderPreview.minutes.length > 0
                    ? reminderPreview.minutes.map((m) => REMINDER_LABELS[m] ?? `${m} min antes`).join(', ')
                    : 'nenhum'}
                </p>
                <p><span className="font-medium">Calendário de destino:</span> Painel Lucas</p>
              </div>
            )}

            {calendarStatus === 'error' && calendarError && (
              <p role="alert" className="flex items-center gap-1 text-xs text-red-600">
                <AlertCircle size={12} /> {calendarError}
              </p>
            )}

            {calendarStatus === 'done' && createdEvent && (
              <div className="space-y-1.5 text-xs">
                <p className="flex items-center gap-1 text-green-700">
                  <Check size={12} /> Evento criado no calendário &quot;Painel Lucas&quot;.
                </p>
                <div className="flex flex-wrap gap-3">
                  {createdEvent.htmlLink && (
                    <a
                      href={createdEvent.htmlLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-blue-600 hover:underline"
                    >
                      <ExternalLink size={12} /> Abrir no Google Agenda
                    </a>
                  )}
                  {createdEvent.modality === 'in_person' && createdEvent.location && (
                    <a
                      href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(createdEvent.location)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-blue-600 hover:underline"
                    >
                      <MapPin size={12} /> Abrir local no Google Maps
                    </a>
                  )}
                  {createdEvent.modality === 'online' && createdEvent.meetingLink && (
                    <a
                      href={createdEvent.meetingLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-blue-600 hover:underline"
                    >
                      <Video size={12} /> Abrir reunião
                    </a>
                  )}
                </div>
              </div>
            )}

            {calendarStatus === 'link_pending' && (
              <div className="space-y-1.5 rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900">
                <p>O evento foi criado no Google Agenda, mas não foi possível atualizar a agenda do painel agora.</p>
                {calendarError && <p className="text-red-600">{calendarError}</p>}
                <button
                  type="button"
                  onClick={() => void handleRetryLink()}
                  disabled={isRetryingLink}
                  className="inline-flex items-center gap-1.5 rounded-md border border-amber-400 bg-white px-2.5 py-1 font-medium text-amber-900 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isRetryingLink && <Loader2 size={12} className="animate-spin" />} Tentar atualizar a agenda
                </button>
              </div>
            )}

            {calendarStatus !== 'done' && calendarStatus !== 'link_pending' && (
              <button
                type="button"
                onClick={() => {
                  setCalendarApproved(true);
                  void handleCreateCalendarEvent();
                }}
                disabled={!canCreateEvent}
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
