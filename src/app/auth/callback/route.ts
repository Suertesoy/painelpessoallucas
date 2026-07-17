import { NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/platform/supabase/server-client';

/**
 * Callback do OAuth (login com Google via Supabase Auth).
 * Troca o `code` por uma sessão baseada em cookies e redireciona.
 */
export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const next = requestUrl.searchParams.get('next') ?? '/hoje';

  // Só permite redirecionamento interno (evita open redirect).
  const safeNext = next.startsWith('/') && !next.startsWith('//') ? next : '/hoje';

  if (code) {
    const supabase = await getSupabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(new URL(safeNext, requestUrl.origin));
    }
  }

  const loginUrl = new URL('/login', requestUrl.origin);
  loginUrl.searchParams.set('error', 'auth_callback_failed');
  return NextResponse.redirect(loginUrl);
}
