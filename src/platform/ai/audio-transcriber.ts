/**
 * Contrato do transcritor de áudio (independente de provider, para testes
 * com mock — mesmo padrão de plan-structurer.ts).
 */

export interface TranscribeAudioInput {
  file: File | Blob;
  /** Código de idioma ISO-639-1 para guiar a transcrição (ex.: 'pt'). */
  language?: string;
}

export interface TranscribeAudioResult {
  text: string;
  model: string;
}

export interface AudioTranscriber {
  transcribe(input: TranscribeAudioInput): Promise<TranscribeAudioResult>;
}

let transcriberFactory: (() => AudioTranscriber) | null = null;

export function setAudioTranscriberFactory(factory: (() => AudioTranscriber) | null): void {
  transcriberFactory = factory;
}

export function resolveAudioTranscriber(defaultFactory: () => AudioTranscriber): AudioTranscriber {
  return (transcriberFactory ?? defaultFactory)();
}
