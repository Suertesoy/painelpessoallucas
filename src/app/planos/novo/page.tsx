'use client';

import React, { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Upload, AlertCircle } from 'lucide-react';
import { useCommands, useQueries } from '@/providers/repository.provider';
import { useWorkspace } from '@/providers/auth.provider';
import { useReactiveQuery } from '@/lib/hooks';
import type { DocumentType } from '@/modules/plans/domain/plan.schema';

const DOC_TYPES: { value: DocumentType; label: string }[] = [
  { value: 'project_plan', label: 'Plano de projeto' },
  { value: 'personal_guide', label: 'Guia pessoal' },
  { value: 'meeting_notes', label: 'Notas de reunião' },
  { value: 'strategy', label: 'Estratégia' },
  { value: 'reference', label: 'Referência' },
  { value: 'other', label: 'Outro' },
];

const MAX_FILE_BYTES = 500_000;

export default function NovoPlanoPage() {
  const router = useRouter();
  const { plan: planCmds, project: projectCmds } = useCommands();
  const { project: projectQueries } = useQueries();
  const { workspaceId } = useWorkspace();
  const { data: projects } = useReactiveQuery(() => projectQueries.listProjects(), []);

  const [title, setTitle] = useState('');
  const [documentType, setDocumentType] = useState<DocumentType>('project_plan');
  const [content, setContent] = useState('');
  const [fileSource, setFileSource] = useState<'paste' | 'file_md' | 'file_txt'>('paste');
  const [projectId, setProjectId] = useState('');
  const [newProjectName, setNewProjectName] = useState('');
  const [startDate, setStartDate] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const activeProjects = (projects ?? []).filter((p) => p.status === 'active');

  const handleFile = async (file: File) => {
    setError(null);
    const name = file.name.toLowerCase();
    if (!name.endsWith('.md') && !name.endsWith('.txt')) {
      setError('Somente arquivos .md ou .txt são aceitos nesta etapa.');
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setError('Arquivo muito grande (limite 500 KB).');
      return;
    }
    const text = await file.text();
    setContent(text);
    setFileSource(name.endsWith('.md') ? 'file_md' : 'file_txt');
    if (!title) setTitle(file.name.replace(/\.(md|txt)$/i, ''));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!content.trim()) {
      setError('Cole o texto ou importe um arquivo .md/.txt.');
      return;
    }

    setIsSubmitting(true);
    try {
      // 1. Projeto: usa o selecionado ou cria um novo.
      let finalProjectId = projectId || undefined;
      if (!finalProjectId && newProjectName.trim()) {
        const project = await projectCmds.createProject(
          { name: newProjectName.trim(), status: 'active', attentionLevel: 'normal' },
          workspaceId
        );
        finalProjectId = project.id;
      }

      // 2. Salva o documento original (nunca se perde, mesmo se a IA falhar).
      const doc = await planCmds.createSourceDocument(
        {
          title: title.trim() || 'Documento sem título',
          documentType,
          originalContent: content,
          source: fileSource,
          projectId: finalProjectId,
        },
        workspaceId
      );

      // 3. Segue para o processamento com IA (data inicial via querystring).
      const params = new URLSearchParams();
      if (startDate) params.set('startDate', startDate);
      router.push(`/planos/processar/${doc.id}?${params.toString()}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar o documento.');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="p-4 md:p-8 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold">Importar plano</h1>
      <p className="mt-1 text-sm text-gray-500">
        O documento original é salvo antes de qualquer processamento. A IA propõe uma
        estrutura; nada vira definitivo sem a sua aprovação.
      </p>

      <form onSubmit={handleSubmit} className="mt-6 space-y-5">
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <h2 className="font-semibold">1. Projeto</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="projeto" className="block text-sm font-medium text-gray-700">
                Projeto existente
              </label>
              <select
                id="projeto"
                value={projectId}
                onChange={(e) => {
                  setProjectId(e.target.value);
                  if (e.target.value) setNewProjectName('');
                }}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              >
                <option value="">— Selecionar —</option>
                {activeProjects.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="novo-projeto" className="block text-sm font-medium text-gray-700">
                Ou criar projeto novo
              </label>
              <input
                id="novo-projeto"
                type="text"
                value={newProjectName}
                onChange={(e) => {
                  setNewProjectName(e.target.value);
                  if (e.target.value) setProjectId('');
                }}
                placeholder="Nome do novo projeto"
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <h2 className="font-semibold">2. Documento</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="titulo" className="block text-sm font-medium text-gray-700">
                Título
              </label>
              <input
                id="titulo"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ex.: Plano Grupo Almeida — 16 semanas"
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                required
              />
            </div>
            <div>
              <label htmlFor="tipo" className="block text-sm font-medium text-gray-700">
                Tipo
              </label>
              <select
                id="tipo"
                value={documentType}
                onChange={(e) => setDocumentType(e.target.value as DocumentType)}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              >
                {DOC_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="mt-3">
            <div className="flex items-center justify-between">
              <label htmlFor="conteudo" className="block text-sm font-medium text-gray-700">
                Conteúdo
              </label>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:underline"
              >
                <Upload size={14} /> Importar .md/.txt
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".md,.txt,text/markdown,text/plain"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void handleFile(f);
                  e.target.value = '';
                }}
              />
            </div>
            <textarea
              id="conteudo"
              value={content}
              onChange={(e) => {
                setContent(e.target.value);
                setFileSource('paste');
              }}
              rows={12}
              placeholder="Cole aqui o plano, guia ou documento longo…"
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 font-mono text-xs"
            />
            <p className="mt-1 text-xs text-gray-400">
              {content.length.toLocaleString('pt-BR')} caracteres (limite 120.000)
            </p>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <h2 className="font-semibold">3. Data inicial desejada</h2>
          <label htmlFor="data-inicial" className="mt-2 block text-sm text-gray-600">
            Usada como referência do cronograma proposto (opcional)
          </label>
          <input
            id="data-inicial"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="mt-1 rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
        </div>

        {error && (
          <p role="alert" className="flex items-center gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700">
            <AlertCircle size={16} /> {error}
          </p>
        )}

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={isSubmitting}
            className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? 'Salvando documento…' : 'Salvar e processar com IA'}
          </button>
          <button
            type="button"
            onClick={() => router.push('/planos')}
            className="rounded-lg border border-gray-300 bg-white px-5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancelar
          </button>
        </div>
      </form>
    </div>
  );
}
