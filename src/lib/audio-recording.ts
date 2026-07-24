/**
 * Helpers puros de gravação de áudio (sem estado React) — testáveis sem DOM
 * real. A UI (audio-recorder.tsx) monta o MediaRecorder de verdade sobre
 * estes helpers.
 */

/** Limite de gravação, em segundos. Único ponto para alterar o valor padrão. */
export const MAX_RECORDING_SECONDS = 300;

/**
 * Formatos candidatos, do mais preferível ao menos preferível. Não presume
 * que todo navegador produz o mesmo tipo de arquivo — Chrome/Edge/Android
 * favorecem webm/opus; Safari/iOS só suportam mp4/aac via MediaRecorder.
 */
const CANDIDATE_MIME_TYPES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4',
  'audio/aac',
  'audio/ogg;codecs=opus',
];

/**
 * Detecta o primeiro formato realmente suportado pelo MediaRecorder deste
 * navegador. Retorna undefined quando nenhum candidato é suportado (o
 * MediaRecorder ainda pode funcionar com o tipo padrão do navegador nesse
 * caso — quem chama decide se aceita gravar sem MIME explícito ou trata
 * como "sem suporte").
 */
export function getSupportedAudioMimeType(
  isTypeSupported: (type: string) => boolean = (type) =>
    typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(type)
): string | undefined {
  return CANDIDATE_MIME_TYPES.find((type) => {
    try {
      return isTypeSupported(type);
    } catch {
      return false;
    }
  });
}

/** true quando o navegador tem os dois pré-requisitos para gravar áudio. */
export function isAudioRecordingSupported(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    typeof navigator.mediaDevices?.getUserMedia === 'function' &&
    typeof MediaRecorder !== 'undefined'
  );
}

/** Extensão de arquivo plausível a partir do MIME type gravado. */
export function fileExtensionForMimeType(mimeType: string): string {
  if (mimeType.includes('webm')) return 'webm';
  if (mimeType.includes('mp4')) return 'm4a';
  if (mimeType.includes('aac')) return 'aac';
  if (mimeType.includes('ogg')) return 'ogg';
  return 'bin';
}

export function formatRecordingDuration(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}
