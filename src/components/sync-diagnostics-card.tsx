'use client';

import { useState } from 'react';
import { AlertTriangle, RefreshCw, Copy, Check } from 'lucide-react';
import { getSupabaseBrowserClient } from '@/platform/supabase/browser-client';
import { useWorkspace } from '@/providers/auth.provider';
import { LAST_AUTH_EVENT_KEY } from '@/providers/auth.provider';

/**
 * Configurações → Diagnóstico de sincronização (TEMPORÁRIO).
 *
 * Compara, lado a lado, o que o SERVIDOR reconhece (via /api/debug/sync-status,
 * sessão validada por cookies) e o que o NAVEGADOR reconhece (cliente Supabase
 * do browser, sessão local deste dispositivo). Serve para diferenciar, com
 * evidência do próprio dispositivo, onde a sincronização está falhando —
 * nunca expõe JWT, cookies, tokens, e-mail completo ou UUIDs completos.
 *
 * Remover esta seção depois que a causa da falta de sincronização no celular
 * for identificada e corrigida.
 */

export type ErrorCategory =
  | 'none'
  | 'unauthenticated'
  | 'workspace_not_found'
  | 'membership_not_found'
  | 'permission_denied'
  | 'network_error'
  | 'query_error'
  | 'unknown';

export interface ServerSyncStatus {
  serverAuthenticated: boolean;
  serverUserResolved: boolean;
  serverWorkspaceResolved: boolean;
  serverMembershipFound: boolean;
  serverProjectsQueryExecuted: boolean;
  serverProjectsQueryStatus: 'success' | 'error';
  serverProjectCount: number | null;
  serverErrorCategory: ErrorCategory;
}

export interface BrowserSyncStatus {
  browserUserResolved: boolean;
  browserSessionResolved: boolean;
  browserWorkspaceResolved: boolean;
  browserProjectsQueryExecuted: boolean;
  browserProjectsQueryStatus: 'success' | 'error';
  browserProjectCount: number | null;
  browserErrorCategory: ErrorCategory;
  lastAuthEvent: string | null;
}

const SERVER_UNAUTHENTICATED: ServerSyncStatus = {
  serverAuthenticated: false,
  serverUserResolved: false,
  serverWorkspaceResolved: false,
  serverMembershipFound: false,
  serverProjectsQueryExecuted: false,
  serverProjectsQueryStatus: 'error',
  serverProjectCount: null,
  serverErrorCategory: 'unauthenticated',
};

export function categorizePostgrestError(err: { code?: string } | null | undefined): ErrorCategory {
  if (!err) return 'unknown';
  if (err.code === '42501') return 'permission_denied';
  return 'query_error';
}

function readLastAuthEvent(): string | null {
  try {
    return window.sessionStorage.getItem(LAST_AUTH_EVENT_KEY);
  } catch {
    return null;
  }
}

export async function fetchServerStatus(): Promise<ServerSyncStatus> {
  try {
    const res = await fetch('/api/debug/sync-status', { cache: 'no-store' });
    if (res.status === 401) return SERVER_UNAUTHENTICATED;
    if (!res.ok) {
      return { ...SERVER_UNAUTHENTICATED, serverErrorCategory: 'unknown' };
    }
    return (await res.json()) as ServerSyncStatus;
  } catch {
    return { ...SERVER_UNAUTHENTICATED, serverErrorCategory: 'network_error' };
  }
}

export async function fetchBrowserStatus(workspaceId: string | null): Promise<BrowserSyncStatus> {
  const status: BrowserSyncStatus = {
    browserUserResolved: false,
    browserSessionResolved: false,
    browserWorkspaceResolved: false,
    browserProjectsQueryExecuted: false,
    browserProjectsQueryStatus: 'error',
    browserProjectCount: null,
    browserErrorCategory: 'none',
    lastAuthEvent: readLastAuthEvent(),
  };

  try {
    const supabase = getSupabaseBrowserClient();

    const { data: sessionData } = await supabase.auth.getSession();
    status.browserSessionResolved = !!sessionData.session;

    const { data: userData } = await supabase.auth.getUser();
    status.browserUserResolved = !!userData.user;

    status.browserWorkspaceResolved = !!workspaceId;

    if (workspaceId) {
      status.browserProjectsQueryExecuted = true;
      const { count, error } = await supabase
        .from('projects')
        .select('id', { count: 'exact', head: true })
        .eq('workspace_id', workspaceId)
        .is('deleted_at', null);

      if (error) {
        status.browserErrorCategory = categorizePostgrestError(error);
      } else {
        status.browserProjectsQueryStatus = 'success';
        status.browserProjectCount = count ?? 0;
        status.browserErrorCategory = 'none';
      }
    }
  } catch {
    status.browserErrorCategory = 'network_error';
  }

  return status;
}

function BoolRow({ label, value }: { label: string; value: boolean }) {
  return (
    <div className="flex items-center justify-between py-1 text-sm">
      <span className="text-gray-600">{label}</span>
      <span className={`font-medium ${value ? 'text-green-700' : 'text-red-700'}`}>
        {value ? 'sim' : 'não'}
      </span>
    </div>
  );
}

function ValueRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-1 text-sm">
      <span className="text-gray-600">{label}</span>
      <span className="font-medium text-gray-900">{value}</span>
    </div>
  );
}

export function SyncDiagnosticsCard() {
  const { workspaceId } = useWorkspace();
  const [server, setServer] = useState<ServerSyncStatus | null>(null);
  const [browser, setBrowser] = useState<BrowserSyncStatus | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const runDiagnostics = async () => {
    setIsLoading(true);
    setCopied(false);
    const [serverStatus, browserStatus] = await Promise.all([
      fetchServerStatus(),
      fetchBrowserStatus(workspaceId ?? null),
    ]);
    setServer(serverStatus);
    setBrowser(browserStatus);
    setIsLoading(false);
  };

  const handleCopy = async () => {
    if (!server || !browser) return;
    const payload = { ...server, ...browser };
    try {
      await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard indisponível — sem ação (não é crítico para o diagnóstico).
    }
  };

  return (
    <section className="rounded-xl border border-amber-200 bg-amber-50/40 p-6">
      <div className="flex items-start gap-2">
        <AlertTriangle size={18} className="mt-0.5 shrink-0 text-amber-600" />
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Diagnóstico de sincronização</h2>
          <p className="mt-1 text-xs text-amber-800">
            Esta área é temporária e será removida depois que a sincronização for corrigida.
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={runDiagnostics}
          disabled={isLoading}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <RefreshCw size={16} className={isLoading ? 'animate-spin' : ''} />
          {isLoading ? 'Atualizando…' : 'Atualizar diagnóstico'}
        </button>
        {server && browser && (
          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            {copied ? <Check size={16} className="text-green-600" /> : <Copy size={16} />}
            {copied ? 'Copiado' : 'Copiar diagnóstico'}
          </button>
        )}
      </div>

      {server && browser && (
        <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <h3 className="text-sm font-semibold text-gray-900">Sessão no servidor</h3>
            <div className="mt-2 divide-y divide-gray-100">
              <BoolRow label="Autenticado" value={server.serverAuthenticated} />
              <BoolRow label="Usuário resolvido" value={server.serverUserResolved} />
              <BoolRow label="Associação ao workspace" value={server.serverMembershipFound} />
              <BoolRow label="Workspace resolvido" value={server.serverWorkspaceResolved} />
              <BoolRow label="Consulta de projetos executada" value={server.serverProjectsQueryExecuted} />
              <ValueRow label="Status da consulta" value={server.serverProjectsQueryStatus} />
              <ValueRow
                label="Projetos encontrados"
                value={server.serverProjectCount === null ? '—' : String(server.serverProjectCount)}
              />
              <ValueRow label="Categoria de erro" value={server.serverErrorCategory} />
            </div>
          </div>

          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <h3 className="text-sm font-semibold text-gray-900">Sessão neste navegador</h3>
            <div className="mt-2 divide-y divide-gray-100">
              <BoolRow label="Sessão local encontrada" value={browser.browserSessionResolved} />
              <BoolRow label="Usuário resolvido" value={browser.browserUserResolved} />
              <BoolRow label="Workspace resolvido" value={browser.browserWorkspaceResolved} />
              <BoolRow label="Consulta de projetos executada" value={browser.browserProjectsQueryExecuted} />
              <ValueRow label="Status da consulta" value={browser.browserProjectsQueryStatus} />
              <ValueRow
                label="Projetos encontrados"
                value={browser.browserProjectCount === null ? '—' : String(browser.browserProjectCount)}
              />
              <ValueRow label="Categoria de erro" value={browser.browserErrorCategory} />
              <ValueRow label="Último evento de auth" value={browser.lastAuthEvent ?? '—'} />
            </div>
          </div>
        </div>
      )}

      {!server && !browser && (
        <p className="mt-4 text-sm text-gray-500">
          Clique em &ldquo;Atualizar diagnóstico&rdquo; para comparar a sessão deste navegador com a
          sessão reconhecida pelo servidor.
        </p>
      )}
    </section>
  );
}
