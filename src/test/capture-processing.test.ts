import { describe, expect, it } from 'vitest';
import {
  deriveCaptureProcessingState,
  isAnalyzableCapture,
} from '@/platform/ai/capture-processing';
import type { Item } from '@/modules/items/domain/item.schema';
import type { AudioTriageRunSummary } from '@/platform/ai/audio-provenance.repository';

const item: Item = {
  id: '11111111-1111-4111-8111-111111111111',
  workspaceId: 'ws-1',
  content: 'comprar ovos e responder a Lara',
  type: 'note',
  status: 'inbox',
  priority: 'normal',
  source: 'quick_capture',
  createdAt: '2026-07-30T10:00:00.000Z',
  updatedAt: '2026-07-30T10:00:00.000Z',
};

function run(
  overrides: Partial<AudioTriageRunSummary> = {}
): AudioTriageRunSummary {
  return {
    id: 'run-1',
    model: 'mock',
    status: 'completed',
    createdAt: '2026-07-30T10:00:01.000Z',
    completedAt: '2026-07-30T10:00:02.000Z',
    errorMessage: null,
    proposal: {
      intent: 'multiple',
      suggestedTitle: 'Compras e resposta',
      summary: 'Duas intenções',
      projectCandidates: [],
      proposedActions: [
        {
          actionType: 'create_item',
          title: 'Comprar ovos',
          description: null,
          itemType: 'shopping_item',
          priority: 'normal',
          projectId: null,
          nextAction: null,
          dueAt: null,
          scheduledAt: null,
          estimatedMinutes: null,
          confidence: 0.9,
        },
        {
          actionType: 'create_item',
          title: 'Responder a Lara',
          description: null,
          itemType: 'task',
          priority: 'normal',
          projectId: null,
          nextAction: null,
          dueAt: null,
          scheduledAt: null,
          estimatedMinutes: null,
          confidence: 0.9,
        },
      ],
      calendarProposal: null,
      missingInformation: [],
      overallConfidence: 0.9,
    },
    actionsOutcome: [],
    calendarOutcome: null,
    ...overrides,
  };
}

describe('estado operacional de uma captura', () => {
  it('reconhece somente capturas livres como analisáveis', () => {
    expect(isAnalyzableCapture(item)).toBe(true);
    expect(isAnalyzableCapture({ ...item, source: 'audio_capture' })).toBe(true);
    expect(isAnalyzableCapture({ ...item, source: 'manual' })).toBe(false);
  });

  it('deriva recebida, análise, revisão, parcial, concluída e falha', () => {
    expect(deriveCaptureProcessingState(item, null)).toBe('received');
    expect(
      deriveCaptureProcessingState(item, run({ status: 'running', proposal: null }))
    ).toBe('analyzing');
    expect(deriveCaptureProcessingState(item, run())).toBe('ready_for_review');
    expect(
      deriveCaptureProcessingState(
        item,
        run({ actionsOutcome: [{ index: 0, status: 'done' }] })
      )
    ).toBe('partially_organized');
    expect(
      deriveCaptureProcessingState(
        item,
        run({
          actionsOutcome: [
            { index: 0, status: 'done' },
            { index: 1, status: 'done' },
          ],
        })
      )
    ).toBe('completed');
    expect(
      deriveCaptureProcessingState(
        item,
        run({ status: 'failed', proposal: null, errorMessage: 'falhou' })
      )
    ).toBe('failed');
    expect(
      deriveCaptureProcessingState({ ...item, status: 'organized' }, run())
    ).toBe('completed');
  });
});
