'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useCommands, useQueries } from '@/providers/repository.provider';
import { ItemType, ItemPriority } from '@/modules/items/domain/item.schema';
import { Project } from '@/modules/projects/domain/project.schema';
import { useWorkspace } from '@/providers/auth.provider';
import { QUICK_CAPTURE_EVENT } from '@/lib/ui-events';
import { fileExtensionForMimeType } from '@/lib/audio-recording';
import { AudioRecorder } from '@/components/audio-recorder';
import { AudioCaptureReview } from '@/components/audio-capture-review';
import { CalendarEventCreator } from '@/components/calendar-event-creator';
import type { AudioTriageProposal } from '@/platform/ai/audio-triage.schema';
import { X, Mic, Type, Sparkles, AlertCircle, Loader2, Calendar } from 'lucide-react';

type CaptureMode = 'text' | 'audio';
type AudioPhase = 'idle' | 'processing' | 'saved' | 'analyzing' | 'reviewing';

export function QuickCaptureModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [mode, setMode] = useState<CaptureMode>('text');
  const [content, setContent] = useState('');
  const [title, setTitle] = useState('');
  const [type, setType] = useState<ItemType>('note');
  const [priority, setPriority] = useState<ItemPriority>('normal');
  const [projectId, setProjectId] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [createdItemId, setCreatedItemId] = useState<string | null>(null);
  const [createdItemTitle, setCreatedItemTitle] = useState('');
  const { item: itemCmds } = useCommands();
  const { workspaceId } = useWorkspace();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  const { project: projectQueries } = useQueries();
  const [projects, setProjects] = useState<Project[]>([]);

  // --- Fluxo de captura por áudio -------------------------------------------
  const [audioPhase, setAudioPhase] = useState<AudioPhase>('idle');
  // "transcript" é o campo editável (Revisar transcrição); "originalTranscript"
  // é a última versão já persistida no item — usada só para saber se há edição
  // pendente antes de decidir se precisa chamar updateItem.
  const [transcript, setTranscript] = useState('');
  const [originalTranscript, setOriginalTranscript] = useState('');
  const [audioError, setAudioError] = useState<string | null>(null);
  const [persistError, setPersistError] = useState<string | null>(null);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);
  const [isSavingWithoutAnalysis, setIsSavingWithoutAnalysis] = useState(false);
  const pendingAudioRef = useRef<{ blob: Blob; seconds: number } | null>(null);
  const [hasPendingAudio, setHasPendingAudio] = useState(false);
  const [savedItemId, setSavedItemId] = useState<string | null>(null);
  const [savedDurationSeconds, setSavedDurationSeconds] = useState(0);
  const [triageProposal, setTriageProposal] = useState<AudioTriageProposal | null>(null);
  const [triageAiRunId, setTriageAiRunId] = useState<string | null>(null);

  const openModal = useCallback(() => {
    previousFocusRef.current = document.activeElement as HTMLElement;
    setIsOpen(true);
  }, []);

  const resetAudioFlow = () => {
    setAudioPhase('idle');
    setTranscript('');
    setOriginalTranscript('');
    setAudioError(null);
    setPersistError(null);
    setAnalyzeError(null);
    setIsSavingWithoutAnalysis(false);
    pendingAudioRef.current = null;
    setHasPendingAudio(false);
    setSavedItemId(null);
    setSavedDurationSeconds(0);
    setTriageProposal(null);
    setTriageAiRunId(null);
  };

  const closeModal = useCallback(() => {
    setIsOpen(false);
    setMode('text');
    setContent('');
    setTitle('');
    setType('note');
    setPriority('normal');
    setProjectId('');
    setError('');
    setSuccess(false);
    setCreatedItemId(null);
    setCreatedItemTitle('');
    resetAudioFlow();
    if (previousFocusRef.current) {
      previousFocusRef.current.focus();
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      projectQueries.listProjects().then(ps => setProjects(ps.filter(p => p.status === 'active')));
    }
  }, [isOpen, projectQueries]);

  // Abertura via botões da interface (sidebar, FAB mobile)
  useEffect(() => {
    const handleOpen = () => openModal();
    window.addEventListener(QUICK_CAPTURE_EVENT, handleOpen);
    return () => window.removeEventListener(QUICK_CAPTURE_EVENT, handleOpen);
  }, [openModal]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl/Cmd + Shift + Space
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.code === 'Space') {
        const target = e.target as HTMLElement;
        const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable;

        if (isInput && !isOpen) return; // Não abre se estiver digitando em outro lugar

        e.preventDefault();
        if (!isOpen) {
          openModal();
        } else {
          closeModal();
        }
      }

      if (e.key === 'Escape' && isOpen) {
        closeModal();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, openModal, closeModal]);

  useEffect(() => {
    if (isOpen && mode === 'text') {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen, mode]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) {
      setError('Conteúdo é obrigatório');
      return;
    }

    setIsSubmitting(true);
    setError('');
    try {
      const savedTitle = title.trim() || content.substring(0, 40) + (content.length > 40 ? '...' : '');
      const newItem = await itemCmds.createItem({
        title: savedTitle,
        content: content.trim(),
        type,
        priority,
        projectId: projectId || undefined,
        source: 'quick_capture'
      }, workspaceId);

      setCreatedItemId(newItem.id);
      setCreatedItemTitle(savedTitle);
      setSuccess(true);
      // Não fecha automaticamente: o usuário pode aproveitar para adicionar
      // um evento de calendário a esta captura antes de fechar.
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Erro ao criar item';
      setError(errorMsg);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Envia o Blob gravado para transcrição e, assim que houver texto, salva a
  // captura na Caixa de Entrada IMEDIATAMENTE — antes de qualquer análise de
  // IA. Uma falha na IA depois disso nunca pode apagar esta captura.
  const sendForTranscription = async (blob: Blob, seconds: number) => {
    pendingAudioRef.current = { blob, seconds };
    setHasPendingAudio(true);
    setAudioPhase('processing');
    setAudioError(null);

    try {
      const formData = new FormData();
      formData.append('audio', blob, `captura.${fileExtensionForMimeType(blob.type)}`);

      const res = await fetch('/api/audio/transcribe', { method: 'POST', body: formData });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body.error ?? 'Não foi possível transcrever o áudio.');
      }
      const transcribedText: string = body.transcript;
      setTranscript(transcribedText);
      setOriginalTranscript(transcribedText);

      const item = await itemCmds.createItem(
        {
          title: transcribedText.slice(0, 60) + (transcribedText.length > 60 ? '…' : ''),
          content: transcribedText,
          type: 'note',
          priority: 'normal',
          source: 'audio_capture',
          audioDurationSeconds: seconds,
        },
        workspaceId
      );
      setSavedItemId(item.id);
      setSavedDurationSeconds(seconds);
      setAudioPhase('saved');
      pendingAudioRef.current = null;
      setHasPendingAudio(false);
    } catch (err) {
      setAudioError(err instanceof Error ? err.message : 'Erro ao processar o áudio.');
      setAudioPhase('idle');
      // pendingAudioRef mantém o Blob — "Tentar novamente" não obriga regravar.
    }
  };

  const handleRetryTranscription = () => {
    if (pendingAudioRef.current) {
      void sendForTranscription(pendingAudioRef.current.blob, pendingAudioRef.current.seconds);
    }
  };

  // Só persiste se o texto do campo divergir do que já está salvo no item —
  // evita uma escrita desnecessária quando o usuário não edita nada. Em caso
  // de falha, o texto digitado permanece no campo para nova tentativa (nunca
  // é descartado) e quem chamou decide não prosseguir (nem triagem, nem
  // fechar o modal).
  const persistTranscriptEditIfNeeded = async (): Promise<boolean> => {
    if (!savedItemId) return false;
    const trimmed = transcript.trim();
    if (trimmed === originalTranscript.trim()) return true;
    try {
      await itemCmds.updateItem(savedItemId, {
        content: trimmed,
        title: trimmed.slice(0, 60) + (trimmed.length > 60 ? '…' : ''),
      });
      setOriginalTranscript(trimmed);
      return true;
    } catch {
      setPersistError('Não foi possível salvar a correção. Seu texto continua aqui. Tente novamente.');
      return false;
    }
  };

  const handleAnalyzeWithAI = async () => {
    if (!savedItemId || !transcript.trim()) return;
    setAudioPhase('analyzing');
    setAnalyzeError(null);
    setPersistError(null);

    const persisted = await persistTranscriptEditIfNeeded();
    if (!persisted) {
      setAudioPhase('saved');
      return;
    }

    try {
      const res = await fetch('/api/ai/triage-capture', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId: savedItemId, idempotencyKey: savedItemId }),
      });
      if (!res.ok) {
        setAnalyzeError('A captura foi salva, mas a análise não foi concluída. Tente novamente.');
        setAudioPhase('saved');
        return;
      }
      const body = await res.json().catch(() => ({}));
      setTriageProposal(body.proposal as AudioTriageProposal);
      setTriageAiRunId(body.aiRunId as string);
      setAudioPhase('reviewing');
    } catch {
      setAnalyzeError('A captura foi salva, mas a análise não foi concluída. Tente novamente.');
      setAudioPhase('saved');
    }
  };

  const handleSaveWithoutAnalysis = async () => {
    setPersistError(null);
    setIsSavingWithoutAnalysis(true);
    const persisted = await persistTranscriptEditIfNeeded();
    setIsSavingWithoutAnalysis(false);
    if (persisted) closeModal();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-label="Captura rápida">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg overflow-hidden flex max-h-[90vh] flex-col">
        <div className="p-4 border-b flex justify-between items-center bg-gray-50">
          <h2 className="font-semibold text-gray-800">Captura Rápida</h2>
          <button onClick={closeModal} className="text-gray-500 hover:text-gray-800" aria-label="Fechar">
            <X size={20} />
          </button>
        </div>

        <div className="flex border-b bg-white px-4 pt-3 gap-1">
          <button
            type="button"
            onClick={() => setMode('text')}
            disabled={audioPhase !== 'idle'}
            className={`inline-flex items-center gap-1.5 rounded-t-md px-3 py-1.5 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-50 ${
              mode === 'text' ? 'bg-blue-50 text-blue-700' : 'text-gray-500 hover:bg-gray-50'
            }`}
          >
            <Type size={14} /> Texto
          </button>
          <button
            type="button"
            onClick={() => setMode('audio')}
            disabled={audioPhase !== 'idle'}
            className={`inline-flex items-center gap-1.5 rounded-t-md px-3 py-1.5 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-50 ${
              mode === 'audio' ? 'bg-blue-50 text-blue-700' : 'text-gray-500 hover:bg-gray-50'
            }`}
          >
            <Mic size={14} /> Áudio
          </button>
        </div>

        {mode === 'text' && (
          <form onSubmit={handleSubmit} className="overflow-y-auto p-4 space-y-4">
            {success && createdItemId ? (
              <div className="space-y-4">
                <div className="bg-green-50 text-green-700 p-3 rounded-md text-sm" role="status">
                  Item capturado com sucesso!
                </div>
                <div className="rounded-lg border border-gray-200 bg-white p-3">
                  <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
                    <Calendar size={14} className="text-blue-500" /> Adicionar ao Calendário (opcional)
                  </h3>
                  <div className="mt-2">
                    <CalendarEventCreator itemId={createdItemId} initialTitle={createdItemTitle} />
                  </div>
                </div>
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={closeModal}
                    aria-label="Fechar captura"
                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                  >
                    Fechar
                  </button>
                </div>
              </div>
            ) : (
              <>
                {error && <div className="text-red-600 text-sm" role="alert">{error}</div>}

                <div>
                  <label htmlFor="qc-content" className="sr-only">Conteúdo</label>
                  <textarea
                    id="qc-content"
                    ref={inputRef}
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    placeholder="O que está em sua mente?"
                    className="w-full h-32 p-3 border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none resize-none"
                    required
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="qc-title" className="block text-xs font-medium text-gray-600 mb-1">Título (Opcional)</label>
                    <input
                      id="qc-title"
                      type="text"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="Título curto..."
                      className="w-full p-2 text-sm border rounded-md focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                  </div>
                  <div>
                    <label htmlFor="qc-project" className="block text-xs font-medium text-gray-600 mb-1">Projeto (Opcional)</label>
                    <select
                      id="qc-project"
                      value={projectId}
                      onChange={(e) => setProjectId(e.target.value)}
                      className="w-full p-2 text-sm border rounded-md focus:ring-2 focus:ring-blue-500 outline-none"
                    >
                      <option value="">Nenhum (Inbox)</option>
                      {projects.map(p => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="qc-type" className="block text-xs font-medium text-gray-600 mb-1">Tipo</label>
                    <select
                      id="qc-type"
                      value={type}
                      onChange={(e) => setType(e.target.value as ItemType)}
                      className="w-full p-2 text-sm border rounded-md focus:ring-2 focus:ring-blue-500 outline-none"
                    >
                      <option value="note">Nota livre</option>
                      <option value="task">Tarefa</option>
                      <option value="idea">Ideia</option>
                      <option value="insight">Insight</option>
                      <option value="decision">Decisão</option>
                      <option value="reference">Referência</option>
                      <option value="reminder">Lembrete</option>
                    </select>
                  </div>
                  <div>
                    <label htmlFor="qc-priority" className="block text-xs font-medium text-gray-600 mb-1">Prioridade</label>
                    <select
                      id="qc-priority"
                      value={priority}
                      onChange={(e) => setPriority(e.target.value as ItemPriority)}
                      className="w-full p-2 text-sm border rounded-md focus:ring-2 focus:ring-blue-500 outline-none"
                    >
                      <option value="low">Baixa</option>
                      <option value="normal">Normal</option>
                      <option value="high">Alta</option>
                      <option value="critical">Crítica</option>
                    </select>
                  </div>
                </div>

                <div className="pt-2 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={closeModal}
                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting || !content.trim()}
                    className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
                  >
                    {isSubmitting ? 'Salvando...' : 'Salvar'}
                  </button>
                </div>
              </>
            )}
          </form>
        )}

        {mode === 'audio' && (
          <div className="overflow-y-auto p-4 space-y-4">
            <p className="flex items-start gap-2 rounded-md bg-gray-50 p-2 text-[11px] text-gray-500">
              <AlertCircle size={14} className="mt-0.5 shrink-0" />
              O áudio é enviado a um serviço de IA (OpenAI) só para transcrição, no servidor. Não é
              armazenado — é descartado assim que a transcrição termina.
            </p>

            {(audioPhase === 'idle') && (
              <>
                <AudioRecorder onSend={sendForTranscription} />
                {audioError && (
                  <div className="space-y-2">
                    <p role="alert" className="flex items-center gap-2 text-sm text-red-700">
                      <AlertCircle size={16} /> {audioError}
                    </p>
                    {hasPendingAudio && (
                      <button
                        type="button"
                        onClick={handleRetryTranscription}
                        className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                      >
                        Tentar novamente (sem regravar)
                      </button>
                    )}
                  </div>
                )}
              </>
            )}

            {audioPhase === 'processing' && (
              <p className="flex items-center justify-center gap-2 py-8 text-sm text-gray-600" role="status">
                <Loader2 size={16} className="animate-spin" /> Enviando e transcrevendo o áudio…
              </p>
            )}

            {(audioPhase === 'saved' || audioPhase === 'analyzing') && (
              <div className="space-y-3">
                <div className="rounded-md bg-green-50 p-3 text-sm text-green-800" role="status">
                  Captura salva na Caixa de Entrada ({savedDurationSeconds}s de áudio).
                </div>
                <div>
                  <label htmlFor="qc-transcript" className="mb-1 block text-xs font-medium text-gray-600">
                    Revisar transcrição
                  </label>
                  <textarea
                    id="qc-transcript"
                    value={transcript}
                    onChange={(e) => setTranscript(e.target.value)}
                    disabled={audioPhase === 'analyzing' || isSavingWithoutAnalysis}
                    rows={5}
                    className="w-full resize-none rounded-md border bg-white p-3 text-base leading-relaxed text-gray-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-500"
                  />
                  <p className="mt-1 text-xs text-gray-500">Corrija nomes, datas ou horários, se necessário.</p>
                </div>
                {persistError && (
                  <p role="alert" className="flex items-center gap-2 text-xs text-red-600">
                    <AlertCircle size={12} /> {persistError}
                  </p>
                )}
                {analyzeError && (
                  <p role="alert" className="flex items-center gap-2 text-xs text-red-600">
                    <AlertCircle size={12} /> {analyzeError}
                  </p>
                )}
                <div className="flex flex-col-reverse gap-2 sm:flex-row sm:flex-wrap">
                  <button
                    type="button"
                    onClick={handleSaveWithoutAnalysis}
                    disabled={audioPhase === 'analyzing' || isSavingWithoutAnalysis}
                    className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isSavingWithoutAnalysis && <Loader2 size={14} className="animate-spin" aria-hidden="true" />}
                    Salvar sem analisar
                  </button>
                  <button
                    type="button"
                    onClick={handleAnalyzeWithAI}
                    disabled={audioPhase === 'analyzing' || isSavingWithoutAnalysis || !transcript.trim()}
                    aria-describedby="qc-analyze-hint"
                    className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {audioPhase === 'analyzing' ? (
                      <>
                        <Loader2 size={14} className="animate-spin" /> Analisando com IA…
                      </>
                    ) : (
                      <>
                        <Sparkles size={14} /> Analisar com IA
                      </>
                    )}
                  </button>
                  <span id="qc-analyze-hint" className="sr-only">
                    Abre uma etapa de revisão das ações propostas antes de aplicar qualquer uma delas.
                  </span>
                </div>
              </div>
            )}

            {audioPhase === 'reviewing' && triageProposal && savedItemId && triageAiRunId && (
              <AudioCaptureReview
                itemId={savedItemId}
                aiRunId={triageAiRunId}
                proposal={triageProposal}
                availableProjects={projects.map((p) => ({ id: p.id, name: p.name }))}
                onClose={closeModal}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
