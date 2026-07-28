'use client';

import { useState } from 'react';
import { AlertCircle, Check, ExternalLink, Loader2, MapPin, Video } from 'lucide-react';
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

const MODALITY_LABEL: Record<EventModality, string> = {
  in_person: 'Presencial',
  online: 'Online',
  undetermined: 'Local ainda não definido',
};

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

export interface CreatedEventInfo {
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
 * Formulário completo de evento de calendário (título, início/fim/duração,
 * modalidade, local/link, lembretes, resumo, criação e retry idempotente).
 *
 * Um único componente reaproveitado em TODOS os pontos de entrada de evento
 * do painel — captura por áudio (AudioCaptureReview), captura por texto
 * (QuickCaptureModal) e criação/edição manual a partir de qualquer item
 * (ItemDetailModal). `aiRunId` é opcional: presente só quando o evento nasce
 * de uma proposta de IA (áudio) — nesse caso o servidor revalida que a
 * proposta ainda corresponde ao texto atual da captura antes de confirmar.
 * Sem `aiRunId`, a criação é direta (usuário decide tudo manualmente).
 */
export function CalendarEventCreator({
  itemId,
  aiRunId,
  initialTitle = '',
  initialStartAt = null,
  initialEndAt = null,
  initialLocation = null,
  attendees = [],
  submitLabel = 'Criar evento no Calendar',
  onCreated,
  onOutcome,
}: {
  itemId: string;
  aiRunId?: string;
  initialTitle?: string;
  initialStartAt?: string | null;
  initialEndAt?: string | null;
  initialLocation?: string | null;
  attendees?: string[];
  submitLabel?: string;
  onCreated?: (info: CreatedEventInfo) => void;
  onOutcome?: (status: 'done' | 'error') => void;
}) {
  const { calendarEventLinkRepository } = useRepositories();

  const [calendarApproved, setCalendarApproved] = useState(false);
  const [calendarTitle, setCalendarTitle] = useState(initialTitle);
  const [calendarDescription, setCalendarDescription] = useState('');
  const [calendarStart, setCalendarStart] = useState(initialStartAt ? isoToDatetimeLocalInput(initialStartAt) : '');
  const initialEnd = initialEndAt
    ? isoToDatetimeLocalInput(initialEndAt)
    : initialStartAt
      ? defaultEndFromStart(isoToDatetimeLocalInput(initialStartAt))
      : '';
  const [calendarEnd, setCalendarEnd] = useState(initialEnd);
  // true quando o usuário (ou o valor inicial) já fixou uma duração
  // explícita — nesse caso, alterar o início preserva a duração em vez de
  // reaplicar os 60min padrão.
  const [durationManuallySet, setDurationManuallySet] = useState(!!initialEndAt);

  const [modality, setModality] = useState<EventModality>(initialLocation ? 'in_person' : 'undetermined');
  const [locationText, setLocationText] = useState(initialLocation ?? '');
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
    !!calendarTitle.trim() &&
    !!calendarStart &&
    !!calendarEnd &&
    intervalCheck.valid &&
    !meetingLinkError &&
    calendarStatus !== 'saving';

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
          ...(aiRunId ? { aiRunId } : {}),
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
        onCreated?.(info);
      }
      onOutcome?.('done');
    } catch (e) {
      setCalendarStatus('error');
      setCalendarError(e instanceof Error ? e.message : 'Não foi possível criar o evento.');
      onOutcome?.('error');
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
          ...(aiRunId ? { aiRunId } : {}),
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
      onCreated?.(createdEvent);
    } finally {
      setIsRetryingLink(false);
    }
  };

  return (
    <div className="space-y-2">
      <input
        type="text"
        value={calendarTitle}
        onChange={(e) => setCalendarTitle(e.target.value)}
        placeholder="Título do evento"
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
        {reminderPreview?.notice && <p className="mt-1 text-[11px] text-amber-700">{reminderPreview.notice}</p>}
      </div>

      {attendees.length > 0 && (
        <p className="text-xs text-gray-500">
          Participantes mencionados (sugestão — nenhum convite será enviado): {attendees.join(', ')}
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
          {calendarApproved && calendarStatus === 'saving' ? 'Criando evento…' : submitLabel}
        </button>
      )}
    </div>
  );
}
