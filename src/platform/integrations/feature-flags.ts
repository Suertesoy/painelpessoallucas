import { NextResponse } from 'next/server';

/**
 * Desativação reversível das integrações Google Calendar e Gmail (resumos por
 * e-mail). Com `GOOGLE_INTEGRATIONS_DISABLED=true`:
 *  - as rotas das integrações respondem 410 sem tocar em tokens ou dados;
 *  - o cron deixa de sincronizar calendário e de enviar resumos.
 * Nada é revogado nem apagado: remover a variável reativa tudo. O login com
 * Google (Supabase Auth) é independente e continua funcionando.
 */
export function googleIntegrationsDisabled(): boolean {
  return process.env.GOOGLE_INTEGRATIONS_DISABLED === 'true';
}

/** Resposta padrão das rotas desativadas; `null` quando a integração está ativa. */
export function googleIntegrationsDisabledResponse(): NextResponse | null {
  if (!googleIntegrationsDisabled()) return null;
  return NextResponse.json(
    { error: 'As integrações com Google Calendar e Gmail estão desativadas.' },
    { status: 410 }
  );
}
