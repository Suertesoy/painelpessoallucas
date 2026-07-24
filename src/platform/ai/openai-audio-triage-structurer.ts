import 'server-only';

import OpenAI from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';
import { AudioTriageProposalSchema } from './audio-triage.schema';
import {
  AudioTriageStructurer,
  TriageCaptureInput,
  TriageCaptureResult,
  buildTriagePrompt,
  parseAudioTriageProposal,
} from './audio-triage-structurer';

/**
 * Implementação OpenAI (Responses API + structured outputs). EXCLUSIVAMENTE
 * servidor: OPENAI_API_KEY nunca chega ao navegador. Mesmo padrão de
 * openai-plan-structurer.ts.
 */

const DEFAULT_MODEL = 'gpt-4.1-mini';
const TIMEOUT_MS = 60_000;
const MAX_RETRIES = 1;

export function getTriageModel(): string {
  return process.env.OPENAI_MODEL || DEFAULT_MODEL;
}

export class OpenAIAudioTriageStructurer implements AudioTriageStructurer {
  private client: OpenAI;
  private model: string;

  constructor() {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY não configurada no servidor.');
    }
    this.client = new OpenAI({ apiKey, timeout: TIMEOUT_MS, maxRetries: MAX_RETRIES });
    this.model = getTriageModel();
  }

  async triage(input: TriageCaptureInput): Promise<TriageCaptureResult> {
    const { system, user } = buildTriagePrompt(input);

    const response = await this.client.responses.create({
      model: this.model,
      input: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      text: {
        format: zodTextFormat(AudioTriageProposalSchema, 'audio_triage_proposal'),
      },
    });

    const raw = response.output_text;
    if (!raw) {
      throw new Error('A IA não retornou conteúdo estruturado.');
    }

    const proposal = parseAudioTriageProposal(raw);

    return {
      proposal,
      usage: {
        model: this.model,
        inputTokens: response.usage?.input_tokens,
        outputTokens: response.usage?.output_tokens,
      },
    };
  }
}
