import 'server-only';

import OpenAI from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';
import { PlanProposalSchema } from '@/modules/plans/domain/plan-proposal.schema';
import {
  PlanStructurer,
  StructurePlanInput,
  StructurePlanResult,
  buildPrompt,
  parsePlanProposal,
} from './plan-structurer';

/**
 * Implementação OpenAI (Responses API + structured outputs).
 * EXCLUSIVAMENTE servidor: OPENAI_API_KEY nunca chega ao navegador.
 */

const DEFAULT_MODEL = 'gpt-4.1-mini';
const TIMEOUT_MS = 120_000;
const MAX_RETRIES = 1;

export function getOpenAIModel(): string {
  return process.env.OPENAI_MODEL || DEFAULT_MODEL;
}

/** Preços aproximados por 1M tokens (USD) para estimativa de custo. */
const PRICES_PER_MTOKEN: Record<string, { input: number; output: number }> = {
  'gpt-4.1': { input: 2.0, output: 8.0 },
  'gpt-4.1-mini': { input: 0.4, output: 1.6 },
  'gpt-4.1-nano': { input: 0.1, output: 0.4 },
};

export function estimateCostUsd(
  model: string,
  inputTokens?: number,
  outputTokens?: number
): number | null {
  const price = PRICES_PER_MTOKEN[model];
  if (!price || inputTokens == null || outputTokens == null) return null;
  return (inputTokens * price.input + outputTokens * price.output) / 1_000_000;
}

export class OpenAIPlanStructurer implements PlanStructurer {
  private client: OpenAI;
  private model: string;

  constructor() {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY não configurada no servidor.');
    }
    this.client = new OpenAI({
      apiKey,
      timeout: TIMEOUT_MS,
      maxRetries: MAX_RETRIES,
    });
    this.model = getOpenAIModel();
  }

  async structure(input: StructurePlanInput): Promise<StructurePlanResult> {
    const { system, user } = buildPrompt(input);

    const response = await this.client.responses.create({
      model: this.model,
      input: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      text: {
        format: zodTextFormat(PlanProposalSchema, 'plan_proposal'),
      },
    });

    const raw = response.output_text;
    if (!raw) {
      throw new Error('A IA não retornou conteúdo estruturado.');
    }

    // Validação Zod própria (não confiar apenas no modo estrito do provider).
    const proposal = parsePlanProposal(raw);

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
