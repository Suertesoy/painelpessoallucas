import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getSessionContext } from '@/platform/supabase/session';
import { buildGoogleAuthUrl, type GoogleService } from '@/platform/integrations/google-client';

/**
 * GET /api/integrations/google/connect?service=calendar|gmail
 * Inicia o OAuth 2.0 (Authorization Code, servidor). Separado do login.
 */
export async function GET(request: Request) {
  const session = await getSessionContext();
  if (!session) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  const url = new URL(request.url);
  const service = url.searchParams.get('service');
  if (service !== 'calendar' && service !== 'gmail') {
    return NextResponse.json({ error: 'Serviço inválido' }, { status: 400 });
  }

  const state = crypto.randomUUID();
  const cookieStore = await cookies();
  cookieStore.set('g_oauth_state', JSON.stringify({ state, service }), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 600,
    path: '/',
  });

  return NextResponse.redirect(buildGoogleAuthUrl(service as GoogleService, state));
}
