import { createServerClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

/**
 * Cliente Supabase para Server Components e Route Handlers (App Router).
 * Sessão baseada em cookies via @supabase/ssr.
 *
 * Em Server Components o Next.js proíbe escrever cookies — o try/catch em
 * setAll é o padrão documentado do @supabase/ssr: a renovação de sessão
 * acontece no proxy (src/proxy.ts), então ignorar a escrita aqui é seguro.
 */
export async function getSupabaseServerClient(): Promise<SupabaseClient> {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Server Component: escrita de cookies indisponível (ok — ver proxy.ts).
          }
        },
      },
    }
  );
}
