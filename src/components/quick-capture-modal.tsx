'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle, Loader2, Mic, Send, X } from 'lucide-react';
import { AudioRecorder } from '@/components/audio-recorder';
import { fileExtensionForMimeType } from '@/lib/audio-recording';
import { QUICK_CAPTURE_EVENT } from '@/lib/ui-events';
import { useCommands } from '@/providers/repository.provider';
import { useWorkspace } from '@/providers/auth.provider';

type AudioPhase = 'idle' | 'recording' | 'processing';

const SAVED_NOTICE_DURATION_MS = 4_000;

export function QuickCaptureModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [content, setContent] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [audioPhase, setAudioPhase] = useState<AudioPhase>('idle');
  const [audioError, setAudioError] = useState<string | null>(null);
  const [hasPendingAudio, setHasPendingAudio] = useState(false);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);
  const pendingAudioRef = useRef<{ blob: Blob; seconds: number } | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const noticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { item: itemCommands } = useCommands();
  const { workspaceId } = useWorkspace();

  const showSavedNotice = useCallback((message: string) => {
    setSavedNotice(message);
    if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    noticeTimerRef.current = setTimeout(() => {
      setSavedNotice(null);
      noticeTimerRef.current = null;
    }, SAVED_NOTICE_DURATION_MS);
  }, []);

  const reset = useCallback(() => {
    setContent('');
    setIsSubmitting(false);
    setError(null);
    setAudioPhase('idle');
    setAudioError(null);
    setHasPendingAudio(false);
    pendingAudioRef.current = null;
  }, []);

  const openModal = useCallback(() => {
    previousFocusRef.current = document.activeElement as HTMLElement;
    setIsOpen(true);
  }, []);

  const closeModal = useCallback(() => {
    if (isSubmitting || audioPhase === 'processing') return;
    setIsOpen(false);
    reset();
    previousFocusRef.current?.focus();
  }, [audioPhase, isSubmitting, reset]);

  useEffect(() => {
    const handleOpen = () => openModal();
    window.addEventListener(QUICK_CAPTURE_EVENT, handleOpen);
    return () => window.removeEventListener(QUICK_CAPTURE_EVENT, handleOpen);
  }, [openModal]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        (event.ctrlKey || event.metaKey) &&
        event.shiftKey &&
        event.code === 'Space'
      ) {
        const target = event.target as HTMLElement;
        const isInput =
          target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable;
        if (isInput && !isOpen) return;

        event.preventDefault();
        if (isOpen) closeModal();
        else openModal();
      }
      if (event.key === 'Escape' && isOpen) closeModal();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [closeModal, isOpen, openModal]);

  useEffect(() => {
    if (isOpen && audioPhase === 'idle') {
      const timer = setTimeout(() => inputRef.current?.focus(), 50);
      return () => clearTimeout(timer);
    }
  }, [audioPhase, isOpen]);

  useEffect(
    () => () => {
      if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    },
    []
  );

  const queueAnalysis = (itemId: string) => {
    // A captura já está persistida. A resposta não precisa manter o modal
    // aberto; ai_runs + Realtime comunicam o andamento à Caixa de Entrada.
    void fetch('/api/ai/triage-capture', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ itemId, idempotencyKey: itemId }),
      keepalive: true,
    }).catch(() => {
      // Sem erro transitório no modal: o item permanece como "Recebida" e
      // pode ser analisado novamente a partir da Caixa de Entrada.
    });
  };

  const finishCapture = (itemId: string, source: 'text' | 'audio') => {
    queueAnalysis(itemId);
    setIsOpen(false);
    reset();
    showSavedNotice(
      source === 'audio'
        ? 'Áudio transcrito e captura salva. A análise continua em segundo plano.'
        : 'Captura salva. A análise continua em segundo plano.'
    );
    previousFocusRef.current?.focus();
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = content.trim();
    if (!trimmed) {
      setError('Escreva algo ou use o microfone para gravar.');
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      const item = await itemCommands.createItem(
        {
          content: trimmed,
          type: 'note',
          priority: 'normal',
          source: 'quick_capture',
        },
        workspaceId
      );
      finishCapture(item.id, 'text');
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Não foi possível salvar a captura.'
      );
      setIsSubmitting(false);
    }
  };

  const sendForTranscription = async (blob: Blob, seconds: number) => {
    pendingAudioRef.current = { blob, seconds };
    setHasPendingAudio(true);
    setAudioPhase('processing');
    setAudioError(null);

    try {
      const formData = new FormData();
      formData.append(
        'audio',
        blob,
        `captura.${fileExtensionForMimeType(blob.type)}`
      );
      const response = await fetch('/api/audio/transcribe', {
        method: 'POST',
        body: formData,
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(body.error ?? 'Não foi possível transcrever o áudio.');
      }

      const transcript =
        typeof body.transcript === 'string' ? body.transcript.trim() : '';
      if (!transcript) {
        throw new Error('A transcrição voltou vazia. Tente gravar novamente.');
      }

      const item = await itemCommands.createItem(
        {
          content: transcript,
          type: 'note',
          priority: 'normal',
          source: 'audio_capture',
          audioDurationSeconds: seconds,
        },
        workspaceId
      );
      // O Blob nunca é persistido. Depois desta linha, só a transcrição e a
      // duração permanecem no painel.
      pendingAudioRef.current = null;
      setHasPendingAudio(false);
      finishCapture(item.id, 'audio');
    } catch (caught) {
      setAudioError(
        caught instanceof Error
          ? caught.message
          : 'Não foi possível processar o áudio.'
      );
      setAudioPhase('recording');
    }
  };

  const retryTranscription = () => {
    if (!pendingAudioRef.current) return;
    void sendForTranscription(
      pendingAudioRef.current.blob,
      pendingAudioRef.current.seconds
    );
  };

  const toggleAudio = () => {
    setError(null);
    setAudioError(null);
    setAudioPhase((current) => (current === 'idle' ? 'recording' : 'idle'));
  };

  const handleTextareaKeyDown = (
    event: React.KeyboardEvent<HTMLTextAreaElement>
  ) => {
    if (
      (event.ctrlKey || event.metaKey) &&
      (event.key === 'Enter' || event.key === 'NumpadEnter')
    ) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  };

  return (
    <>
      {savedNotice && (
        <div
          role="status"
          className="fixed bottom-24 right-4 z-[60] max-w-sm rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-900 shadow-lg md:bottom-6"
        >
          {savedNotice}
        </div>
      )}

      {isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Captura rápida"
        >
          <div className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b bg-gray-50 p-4">
              <div>
                <h2 className="font-semibold text-gray-900">Capturar</h2>
                <p className="mt-0.5 text-xs text-gray-500">
                  Registre primeiro. A organização vem depois.
                </p>
              </div>
              <button
                type="button"
                onClick={closeModal}
                disabled={isSubmitting || audioPhase === 'processing'}
                className="rounded-md p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-800 disabled:opacity-40"
                aria-label="Fechar"
              >
                <X size={20} />
              </button>
            </div>

            <form
              onSubmit={handleSubmit}
              className="space-y-4 overflow-y-auto p-4"
            >
              <div className="relative">
                <label htmlFor="quick-capture-content" className="sr-only">
                  O que você quer registrar?
                </label>
                <textarea
                  id="quick-capture-content"
                  ref={inputRef}
                  value={content}
                  onChange={(event) => setContent(event.target.value)}
                  onKeyDown={handleTextareaKeyDown}
                  disabled={audioPhase !== 'idle' || isSubmitting}
                  placeholder="Escreva livremente o que está pensando…"
                  rows={7}
                  className="w-full resize-none rounded-xl border border-gray-300 p-4 pb-14 text-base leading-relaxed outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50"
                />
                <button
                  type="button"
                  onClick={toggleAudio}
                  disabled={isSubmitting || audioPhase === 'processing'}
                  className={`absolute bottom-3 right-3 inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full border transition ${
                    audioPhase === 'recording'
                      ? 'border-red-200 bg-red-50 text-red-700'
                      : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                  } disabled:opacity-40`}
                  aria-label={
                    audioPhase === 'recording'
                      ? 'Voltar para captura por texto'
                      : 'Gravar captura por áudio'
                  }
                  aria-pressed={audioPhase === 'recording'}
                >
                  <Mic size={19} />
                </button>
              </div>

              {audioPhase === 'recording' && (
                <div className="space-y-3 rounded-xl border border-blue-100 bg-blue-50/40 p-3">
                  <AudioRecorder onSend={sendForTranscription} />
                  <p className="flex items-start gap-1.5 text-[11px] text-gray-500">
                    <AlertCircle size={13} className="mt-0.5 shrink-0" />
                    O áudio é enviado à OpenAI somente para transcrição. O
                    arquivo é descartado e apenas o texto fica salvo.
                  </p>
                  {audioError && (
                    <div className="space-y-2">
                      <p
                        role="alert"
                        className="flex items-center gap-1.5 text-sm text-red-700"
                      >
                        <AlertCircle size={15} /> {audioError}
                      </p>
                      {hasPendingAudio && (
                        <button
                          type="button"
                          onClick={retryTranscription}
                          className="min-h-[44px] rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                        >
                          Tentar novamente sem regravar
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}

              {audioPhase === 'processing' && (
                <p
                  role="status"
                  className="flex items-center justify-center gap-2 rounded-xl bg-blue-50 py-6 text-sm text-blue-800"
                >
                  <Loader2 size={16} className="animate-spin" />
                  Transcrevendo e salvando a captura…
                </p>
              )}

              {error && (
                <p
                  role="alert"
                  className="flex items-center gap-1.5 rounded-md bg-red-50 p-2 text-sm text-red-700"
                >
                  <AlertCircle size={15} /> {error}
                </p>
              )}

              <p className="text-xs text-gray-500">
                A captura aparece imediatamente na Caixa de Entrada. A IA
                sugere título, destino, projeto, prioridade e datas em segundo
                plano; nada é aplicado sem sua confirmação.
              </p>

              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={closeModal}
                  disabled={isSubmitting || audioPhase === 'processing'}
                  className="min-h-[44px] rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={
                    isSubmitting ||
                    audioPhase !== 'idle' ||
                    !content.trim()
                  }
                  className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 size={15} className="animate-spin" />
                      Salvando…
                    </>
                  ) : (
                    <>
                      <Send size={15} />
                      Enviar para análise
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
