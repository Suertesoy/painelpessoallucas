'use client';

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from 'react';
import type { User } from '@supabase/supabase-js';
import { getSupabaseBrowserClient } from '@/platform/supabase/browser-client';

type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated' | 'error';

interface AuthContextType {
  user: User | null;
  /** UUID do workspace pessoal do usuário (resolvido após o login). */
  workspaceId: string | null;
  status: AuthStatus;
  error: string | null;
  signOut: () => Promise<void>;
  retry: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    let cancelled = false;

    const resolveWorkspace = async (currentUser: User) => {
      // Idempotente: retorna o workspace existente ou cria o pessoal.
      const { data, error: rpcError } = await supabase.rpc('ensure_personal_workspace');
      if (cancelled) return;
      if (rpcError || !data) {
        setStatus('error');
        setError(
          'Não foi possível carregar seu workspace. Verifique a conexão e tente novamente.'
        );
        return;
      }
      setUser(currentUser);
      setWorkspaceId(data as string);
      setStatus('authenticated');
      setError(null);
    };

    const init = async () => {
      // getUser() valida o token no servidor (não confiar apenas no cookie).
      const {
        data: { user: currentUser },
      } = await supabase.auth.getUser();
      if (cancelled) return;
      if (!currentUser) {
        setUser(null);
        setWorkspaceId(null);
        setStatus('unauthenticated');
        return;
      }
      await resolveWorkspace(currentUser);
    };

    init();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (cancelled) return;
      if (event === 'SIGNED_OUT') {
        setUser(null);
        setWorkspaceId(null);
        setStatus('unauthenticated');
      } else if (event === 'SIGNED_IN' && session?.user) {
        // resolveWorkspace é assíncrono; onAuthStateChange não pode aguardar.
        void resolveWorkspace(session.user);
      }
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [attempt]);

  const signOut = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    await supabase.auth.signOut();
    // O proxy redireciona para /login na próxima navegação.
    window.location.assign('/login');
  }, []);

  const retry = useCallback(() => {
    setStatus('loading');
    setError(null);
    setAttempt((n) => n + 1);
  }, []);

  return (
    <AuthContext.Provider value={{ user, workspaceId, status, error, signOut, retry }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth deve ser usado dentro de um AuthProvider');
  }
  return context;
}

/**
 * Workspace do usuário autenticado. Substitui a constante WORKSPACE_ID da
 * Fase 1. Só pode ser usado em telas protegidas (após autenticação).
 */
export function useWorkspace(): { workspaceId: string } {
  const { workspaceId } = useAuth();
  if (!workspaceId) {
    throw new Error('useWorkspace usado fora de uma sessão autenticada');
  }
  return { workspaceId };
}
