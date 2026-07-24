'use client';

import { useEffect, useRef, useState } from 'react';
import { Mic, Square, Pause, Play, Trash2, Send, AlertCircle } from 'lucide-react';
import {
  MAX_RECORDING_SECONDS,
  getSupportedAudioMimeType,
  isAudioRecordingSupported,
  formatRecordingDuration,
} from '@/lib/audio-recording';

type RecorderPhase =
  | 'idle'
  | 'requesting-permission'
  | 'recording'
  | 'paused'
  | 'recorded'
  | 'error';

interface RecorderErrorState {
  message: string;
  /** Blob preservado quando o erro acontece DEPOIS de gravar (ex.: envio falhou) — permite tentar de novo sem regravar. */
  blob?: Blob;
}

/**
 * Controle de gravação de áudio da Captura Rápida. Responsabilidade única:
 * pedir permissão, gravar, pausar/retomar, permitir ouvir antes de enviar,
 * cancelar/regravar, e entregar o Blob final via onSend. Os estados
 * posteriores (enviando/transcrevendo/analisando/revisando) pertencem ao
 * componente pai — este cuida só do microfone.
 */
export function AudioRecorder({
  onSend,
  disabled = false,
}: {
  onSend: (blob: Blob, seconds: number) => void;
  disabled?: boolean;
}) {
  const [phase, setPhase] = useState<RecorderPhase>('idle');
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<RecorderErrorState | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recordedBlobRef = useRef<Blob | null>(null);
  const mimeTypeRef = useRef<string>('audio/webm');
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      stopTimer();
      streamRef.current?.getTracks().forEach((t) => t.stop());
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function stopTimer() {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }

  function startTimer() {
    stopTimer();
    timerRef.current = setInterval(() => {
      setSeconds((s) => {
        const next = s + 1;
        if (next >= MAX_RECORDING_SECONDS) {
          // Limite atingido: encerra automaticamente.
          stopRecordingInternal();
        }
        return next;
      });
    }, 1000);
  }

  async function handleStart() {
    setError(null);
    if (!isAudioRecordingSupported()) {
      setError({ message: 'Este navegador não tem suporte a gravação de áudio.' });
      setPhase('error');
      return;
    }

    setPhase('requesting-permission');
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setError({ message: 'Permissão do microfone negada. Autorize o acesso e tente novamente.' });
      setPhase('error');
      return;
    }

    streamRef.current = stream;
    const mimeType = getSupportedAudioMimeType() ?? '';
    mimeTypeRef.current = mimeType || 'audio/webm';
    chunksRef.current = [];

    let recorder: MediaRecorder;
    try {
      recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
    } catch {
      stream.getTracks().forEach((t) => t.stop());
      setError({ message: 'Não foi possível iniciar a gravação neste dispositivo.' });
      setPhase('error');
      return;
    }

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: mimeTypeRef.current });
      recordedBlobRef.current = blob;
      const url = URL.createObjectURL(blob);
      setPreviewUrl(url);
      setPhase('recorded');
    };

    mediaRecorderRef.current = recorder;
    setSeconds(0);
    recorder.start();
    startTimer();
    setPhase('recording');
  }

  function stopRecordingInternal() {
    stopTimer();
    mediaRecorderRef.current?.stop();
    streamRef.current?.getTracks().forEach((t) => t.stop());
  }

  function handlePause() {
    if (mediaRecorderRef.current?.state !== 'recording') return;
    mediaRecorderRef.current.pause();
    stopTimer();
    setPhase('paused');
  }

  function handleResume() {
    if (mediaRecorderRef.current?.state !== 'paused') return;
    mediaRecorderRef.current.resume();
    startTimer();
    setPhase('recording');
  }

  function handleStop() {
    stopRecordingInternal();
  }

  function handleCancel() {
    stopTimer();
    mediaRecorderRef.current?.stop();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    chunksRef.current = [];
    recordedBlobRef.current = null;
    setPreviewUrl(null);
    setSeconds(0);
    setError(null);
    setPhase('idle');
  }

  function handleSend() {
    if (!recordedBlobRef.current) return;
    onSend(recordedBlobRef.current, seconds);
  }

  return (
    <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-4">
      {phase === 'idle' && (
        <button
          type="button"
          onClick={handleStart}
          disabled={disabled}
          className="flex w-full items-center justify-center gap-2 rounded-md bg-red-50 py-3 text-sm font-medium text-red-700 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Mic size={18} /> Gravar áudio
        </button>
      )}

      {phase === 'requesting-permission' && (
        <p className="text-center text-sm text-gray-600" role="status">
          Solicitando permissão do microfone…
        </p>
      )}

      {(phase === 'recording' || phase === 'paused') && (
        <div className="flex flex-col items-center gap-3">
          <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
            {phase === 'recording' && (
              <span
                className="h-2.5 w-2.5 animate-pulse rounded-full bg-red-600"
                aria-hidden="true"
                data-testid="recording-indicator"
              />
            )}
            <span>{phase === 'recording' ? 'Gravando' : 'Pausado'}</span>
            <span className="tabular-nums text-gray-500">{formatRecordingDuration(seconds)}</span>
            <span className="text-xs text-gray-400">/ {formatRecordingDuration(MAX_RECORDING_SECONDS)}</span>
          </div>
          <div className="flex gap-2">
            {phase === 'recording' ? (
              <button
                type="button"
                onClick={handlePause}
                className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
              >
                <Pause size={14} /> Pausar
              </button>
            ) : (
              <button
                type="button"
                onClick={handleResume}
                className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
              >
                <Play size={14} /> Continuar
              </button>
            )}
            <button
              type="button"
              onClick={handleStop}
              className="inline-flex items-center gap-1.5 rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700"
            >
              <Square size={14} /> Encerrar
            </button>
            <button
              type="button"
              onClick={handleCancel}
              className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-gray-500 hover:bg-gray-100"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {phase === 'recorded' && previewUrl && (
        <div className="flex flex-col items-center gap-3">
          <p className="text-sm font-medium text-gray-700">
            Gravação de {formatRecordingDuration(seconds)}
          </p>
          <audio src={previewUrl} controls className="w-full" aria-label="Ouvir gravação antes de enviar" />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleCancel}
              className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
            >
              <Trash2 size={14} /> Excluir e regravar
            </button>
            <button
              type="button"
              onClick={handleSend}
              disabled={disabled}
              className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Send size={14} /> Enviar para transcrição
            </button>
          </div>
        </div>
      )}

      {phase === 'error' && error && (
        <div className="flex flex-col items-center gap-3">
          <p role="alert" className="flex items-center gap-2 text-sm text-red-700">
            <AlertCircle size={16} /> {error.message}
          </p>
          <button
            type="button"
            onClick={handleStart}
            className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
          >
            Tentar novamente
          </button>
        </div>
      )}
    </div>
  );
}
