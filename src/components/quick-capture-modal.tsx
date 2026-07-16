'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useCommands, useQueries } from '@/providers/repository.provider';
import { ItemType } from '@/modules/items/domain/item.schema';
import { Project } from '@/modules/projects/domain/project.schema';
import { X } from 'lucide-react';

export function QuickCaptureModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [content, setContent] = useState('');
  const [title, setTitle] = useState('');
  const [type, setType] = useState<ItemType>('note');
  const [priority, setPriority] = useState<'low' | 'normal' | 'high' | 'critical'>('normal');
  const [projectId, setProjectId] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const { item: itemCmds } = useCommands();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  const { project: projectQueries } = useQueries();
  const [projects, setProjects] = useState<Project[]>([]);

  const closeModal = useCallback(() => {
    setIsOpen(false);
    setContent('');
    setTitle('');
    setType('note');
    setPriority('normal');
    setProjectId('');
    setError('');
    setSuccess(false);
    if (previousFocusRef.current) {
      previousFocusRef.current.focus();
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      projectQueries.listProjects().then(setProjects);
    }
  }, [isOpen, projectQueries]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl/Cmd + Shift + Space
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.code === 'Space') {
        const target = e.target as HTMLElement;
        const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable;
        
        if (isInput && !isOpen) return; // Não abre se estiver digitando em outro lugar
        
        e.preventDefault();
        if (!isOpen) {
          previousFocusRef.current = document.activeElement as HTMLElement;
          setIsOpen(true);
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
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) {
      setError('Conteúdo é obrigatório');
      return;
    }

    setIsSubmitting(true);
    setError('');
    try {
      await itemCmds.createItem({
        title: title.trim() || content.substring(0, 40) + (content.length > 40 ? '...' : ''),
        content: content.trim(),
        type,
        priority,
        projectId: projectId || undefined,
        source: 'quick_capture'
      }, 'ws-1');

      setSuccess(true);
      setTimeout(() => {
        closeModal();
      }, 1000);
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Erro ao criar item';
      setError(errorMsg);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg overflow-hidden flex flex-col">
        <div className="p-4 border-b flex justify-between items-center bg-gray-50">
          <h2 className="font-semibold text-gray-800">Captura Rápida</h2>
          <button onClick={closeModal} className="text-gray-500 hover:text-gray-800" aria-label="Fechar">
            <X size={20} />
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {success ? (
            <div className="bg-green-50 text-green-700 p-4 rounded-md text-center">
              Item capturado com sucesso!
            </div>
          ) : (
            <>
              {error && <div className="text-red-600 text-sm">{error}</div>}
              
              <div>
                <label className="sr-only">Conteúdo</label>
                <textarea
                  ref={inputRef}
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="O que está em sua mente?"
                  className="w-full h-32 p-3 border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none resize-none"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Título (Opcional)</label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Título curto..."
                    className="w-full p-2 text-sm border rounded-md focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Projeto (Opcional)</label>
                  <select
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
                  <label className="block text-xs font-medium text-gray-600 mb-1">Tipo</label>
                  <select
                    value={type}
                    onChange={(e) => setType(e.target.value as ItemType)}
                    className="w-full p-2 text-sm border rounded-md focus:ring-2 focus:ring-blue-500 outline-none"
                  >
                    <option value="note">Nota livre</option>
                    <option value="task">Tarefa</option>
                    <option value="idea">Ideia</option>
                    <option value="insight">Insight</option>
                    <option value="decision">Decisão</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Prioridade</label>
                  <select
                    value={priority}
                    onChange={(e) => setPriority(e.target.value as 'low' | 'normal' | 'high' | 'critical')}
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
                  {isSubmitting ? 'Salvando...' : 'Salvar (Enter)'}
                </button>
              </div>
            </>
          )}
        </form>
      </div>
    </div>
  );
}
