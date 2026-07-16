'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useQueries } from '@/providers/repository.provider';
import { GlobalSearchResult } from '@/modules/global/application/global.queries';
import { Search, X, Folder, FileText } from 'lucide-react';
import { useRouter } from 'next/navigation';

export function GlobalSearchModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<GlobalSearchResult[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const router = useRouter();
  const { global } = useQueries();

  const closeModal = useCallback(() => {
    setIsOpen(false);
    setQuery('');
    setResults([]);
    if (previousFocusRef.current) {
      previousFocusRef.current.focus();
    }
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl/Cmd + K
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        const target = e.target as HTMLElement;
        const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable;
        
        if (isInput && !isOpen) return;
        
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

  useEffect(() => {
    if (!query.trim()) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setResults([]);
      return;
    }

    const search = async () => {
      const res = await global.globalSearch(query);
      setResults(res);
    };

    const debounce = setTimeout(search, 300);
    return () => clearTimeout(debounce);
  }, [query, global]);


  const handleSelect = (item: GlobalSearchResult) => {
    closeModal();
    if (item.type === 'project') {
      router.push(`/projetos/${item.data.id}`);
    } else {
      // Por enquanto, redireciona para caixa de entrada ou detalhe. 
      // Faremos abrir num modal futuramente ou redirecionar dependendo do projeto
      if (item.data.projectId) {
        router.push(`/projetos/${item.data.projectId}`);
      } else {
        router.push(`/entrada`);
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh] bg-black/50 p-4">
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col">
        <div className="flex items-center p-4 border-b gap-3">
          <Search className="text-gray-400" size={20} />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Pesquisar tarefas, ideias, projetos..."
            className="flex-1 bg-transparent text-lg outline-none"
          />
          <button onClick={closeModal} className="text-gray-400 hover:text-gray-600">
            <X size={20} />
          </button>
        </div>

        {results.length > 0 && (
          <div className="max-h-96 overflow-y-auto">
            {results.map((result) => (
              <button
                key={result.data.id}
                onClick={() => handleSelect(result)}
                className="w-full text-left p-4 hover:bg-gray-50 border-b flex items-start gap-3"
              >
                <div className="mt-1">
                  {result.type === 'project' ? <Folder size={18} className="text-blue-500" /> : <FileText size={18} className="text-gray-500" />}
                </div>
                <div>
                  <div className="font-medium text-gray-900">
                    {result.type === 'project' ? result.data.name : (result.data as {title: string}).title}
                  </div>
                  <div className="text-sm text-gray-500 truncate">
                    {result.type === 'project' ? result.data.objective : (result.data as {content: string}).content}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
        
        {query && results.length === 0 && (
          <div className="p-8 text-center text-gray-500">
            Nenhum resultado encontrado para &quot;{query}&quot;
          </div>
        )}

        {!query && (
          <div className="p-4 text-center text-xs text-gray-400">
            Comece a digitar para buscar
          </div>
        )}
      </div>
    </div>
  );
}
