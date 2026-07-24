import type { AudioTriageProposal } from './audio-triage.schema';

export type TriageActionOutcomeStatus = 'done' | 'error';

export interface TriageActionOutcome {
  index: number;
  status: TriageActionOutcomeStatus;
}

export interface AudioTriageRunSummary {
  id: string;
  model: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  createdAt: string;
  completedAt: string | null;
  errorMessage: string | null;
  /** null quando response_metadata não bate com o schema atual (execução antiga/incompleta). */
  proposal: AudioTriageProposal | null;
  actionsOutcome: TriageActionOutcome[];
  calendarOutcome: TriageActionOutcomeStatus | null;
}

export interface CalendarEventLinkSummary {
  googleCalendarId: string;
  googleEventId: string;
  syncStatus: string;
}

/**
 * Leitura/registro de proveniência de uma captura por áudio: resultado da
 * triagem por IA (ai_runs) e vínculo com o evento do Google Calendar
 * (calendar_event_links), quando existirem. Puramente auditoria — nunca
 * decide nada, só relata o que já aconteceu.
 */
export interface AudioProvenanceRepository {
  findLatestTriageRun(itemId: string): Promise<AudioTriageRunSummary | null>;
  findCalendarEventLink(itemId: string): Promise<CalendarEventLinkSummary | null>;
  recordActionOutcome(aiRunId: string, index: number, status: TriageActionOutcomeStatus): Promise<void>;
  recordCalendarOutcome(aiRunId: string, status: TriageActionOutcomeStatus): Promise<void>;
}
