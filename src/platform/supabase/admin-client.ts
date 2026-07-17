import 'server-only';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Cliente administrativo — EXCLUSIVAMENTE para uso no servidor.
 *
 * Usa SUPABASE_SECRET_KEY (bypassa RLS). O import de 'server-only' garante,
 * em tempo de build, que este módulo nunca entra no bundle do navegador.
 *
 * Uso legítimo: cron de automações, operações de sistema (nunca operações
 * normais do usuário — essas passam pelos clientes com RLS).
 */
export function getSupabaseAdminClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;

  if (!url || !secretKey) {
    throw new Error(
      'Supabase admin: NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SECRET_KEY são obrigatórias no servidor.'
    );
  }

  return createClient(url, secretKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
