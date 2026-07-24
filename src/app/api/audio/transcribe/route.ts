import { NextResponse } from 'next/server';
import { getSessionContext } from '@/platform/supabase/session';
import { resolveAudioTranscriber } from '@/platform/ai/audio-transcriber';
import { OpenAIAudioTranscriber } from '@/platform/ai/openai-audio-transcriber';
import { checkRateLimit } from '@/platform/ai/rate-limit';

/**
 * POST /api/audio/transcribe
 * Recebe multipart/form-data com o campo `audio` (Blob/File) e retorna a
 * transcrição em português. Não persiste o áudio — é descartado assim que a
 * função termina (nunca gravado em disco/tabela). Nenhum trecho do áudio ou
 * da transcrição completa vai para o console.
 */

export const maxDuration = 60;

const MAX_FILE_BYTES = 25 * 1024 * 1024; // limite da própria API de transcrição da OpenAI
const RATE_LIMIT_MAX_PER_HOUR = 30;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;

type ErrorCategory =
  | 'unauthenticated'
  | 'invalid_request'
  | 'empty_file'
  | 'file_too_large'
  | 'invalid_format'
  | 'rate_limited'
  | 'transcription_failed';

function errorResponse(status: number, errorCategory: ErrorCategory, message: string) {
  return NextResponse.json({ error: message, errorCategory }, { status });
}

export async function POST(request: Request) {
  const session = await getSessionContext();
  if (!session) {
    return errorResponse(401, 'unauthenticated', 'Sessão expirada. Faça login novamente.');
  }

  if (!checkRateLimit(`audio-transcribe:${session.user.id}`, RATE_LIMIT_MAX_PER_HOUR, RATE_LIMIT_WINDOW_MS)) {
    return errorResponse(429, 'rate_limited', 'Muitas transcrições em pouco tempo. Tente novamente em instantes.');
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return errorResponse(400, 'invalid_request', 'Corpo da requisição inválido.');
  }

  const file = formData.get('audio');
  if (!(file instanceof File)) {
    return errorResponse(400, 'invalid_request', 'Arquivo de áudio ausente.');
  }
  if (file.size === 0) {
    return errorResponse(400, 'empty_file', 'A gravação está vazia. Grave novamente.');
  }
  if (file.size > MAX_FILE_BYTES) {
    return errorResponse(413, 'file_too_large', 'Arquivo de áudio muito grande (limite de 25 MB).');
  }
  if (file.type && !file.type.startsWith('audio/') && !file.type.startsWith('video/webm')) {
    // video/webm: alguns navegadores rotulam gravações de áudio puro via MediaRecorder assim.
    return errorResponse(415, 'invalid_format', 'Formato de áudio não suportado.');
  }

  try {
    const transcriber = resolveAudioTranscriber(() => new OpenAIAudioTranscriber());
    const result = await transcriber.transcribe({ file, language: 'pt' });
    return NextResponse.json({ transcript: result.text });
  } catch (e) {
    // Nunca logar o áudio nem a transcrição — só a mensagem de erro técnica.
    console.error('Falha na transcrição de áudio:', e instanceof Error ? e.message : 'erro desconhecido');
    return errorResponse(502, 'transcription_failed', 'Não foi possível transcrever o áudio agora. Tente novamente.');
  }
}
