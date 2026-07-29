import type { Item } from '@/modules/items/domain/item.schema';
import type { AudioTriageRunSummary } from './audio-provenance.repository';

export type CaptureProcessingState =
  | 'received'
  | 'analyzing'
  | 'ready_for_review'
  | 'partially_organized'
  | 'completed'
  | 'failed';

export const CAPTURE_PROCESSING_LABEL: Record<CaptureProcessingState, string> = {
  received: 'Recebida',
  analyzing: 'Em análise',
  ready_for_review: 'Pronta para revisão',
  partially_organized: 'Parcialmente organizada',
  completed: 'Concluída',
  failed: 'Falha na análise',
};

export function isAnalyzableCapture(item: Item): boolean {
  return item.source === 'quick_capture' || item.source === 'audio_capture';
}

export function deriveCaptureProcessingState(
  item: Item,
  run: AudioTriageRunSummary | null
): CaptureProcessingState {
  if (item.status !== 'inbox') return 'completed';
  if (!run) return 'received';
  if (run.status === 'queued' || run.status === 'running') return 'analyzing';
  if (run.status === 'failed') return 'failed';
  if (!run.proposal) return 'failed';

  const actionCount = run.proposal.proposedActions.filter(
    (action) => action.actionType !== 'create_calendar_event'
  ).length;
  const totalSuggestions =
    actionCount + (run.proposal.calendarProposal ? 1 : 0);
  const resolvedActions = run.actionsOutcome.filter(
    (outcome) => outcome.status === 'done' || outcome.status === 'dismissed'
  ).length;
  const resolvedCalendar =
    run.calendarOutcome === 'done' || run.calendarOutcome === 'dismissed' ? 1 : 0;
  const resolvedSuggestions = resolvedActions + resolvedCalendar;

  if (totalSuggestions > 0 && resolvedSuggestions >= totalSuggestions) {
    return 'completed';
  }
  if (resolvedSuggestions > 0) return 'partially_organized';
  return 'ready_for_review';
}
