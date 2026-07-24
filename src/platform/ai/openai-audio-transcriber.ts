import 'server-only';

import OpenAI from 'openai';
import type { AudioTranscriber, TranscribeAudioInput, TranscribeAudioResult } from './audio-transcriber';

/**
 * Implementação OpenAI (Audio Transcriptions). EXCLUSIVAMENTE servidor:
 * OPENAI_API_KEY nunca chega ao navegador.
 */

const DEFAULT_MODEL = 'whisper-1';
const TIMEOUT_MS = 60_000;
const MAX_RETRIES = 1;

export function getTranscribeModel(): string {
  return process.env.OPENAI_TRANSCRIBE_MODEL || DEFAULT_MODEL;
}

export class OpenAIAudioTranscriber implements AudioTranscriber {
  private client: OpenAI;
  private model: string;

  constructor() {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY não configurada no servidor.');
    }
    this.client = new OpenAI({ apiKey, timeout: TIMEOUT_MS, maxRetries: MAX_RETRIES });
    this.model = getTranscribeModel();
  }

  async transcribe(input: TranscribeAudioInput): Promise<TranscribeAudioResult> {
    const response = await this.client.audio.transcriptions.create({
      file: input.file,
      model: this.model,
      language: input.language,
      response_format: 'json',
    });

    if (!response.text || !response.text.trim()) {
      throw new Error('A transcrição retornou vazia.');
    }

    return { text: response.text, model: this.model };
  }
}
