'use client';

import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Cliente Supabase para Client Components (browser).
 * Usa exclusivamente a URL pública e a publishable key — nunca a secret key.
 * Singleton por aba: o @supabase/ssr já deduplica internamente, mas mantemos
 * uma única instância para que os repositórios compartilhem o mesmo estado.
 */
let client: SupabaseClient | undefined;

export function getSupabaseBrowserClient(): SupabaseClient {
  if (!client) {
    client = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
    );
  }
  return client;
}
