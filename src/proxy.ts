import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

/**
 * Rotas públicas:
 * - /login, /auth/*: autenticação de usuários.
 * - /api/cron/*: rotas de automação protegidas por CRON_SECRET no handler.
 * - /api/health: monitoramento de integridade da aplicação.
 * - /sw.js, /manifest.webmanifest, /manifest.json, /offline.html: recursos
 *   estáticos da PWA para instalação no iPhone e modo offline. Não devem ser
 *   redirecionados para login para não quebrar a instalação no iOS nem o
 *   ciclo de atualização em segundo plano do Service Worker.
 */
export const PUBLIC_PATHS = [
  '/login',
  '/auth',
  '/api/cron',
  '/api/health',
  '/sw.js',
  '/manifest.webmanifest',
  '/manifest.json',
  '/offline.html',
];

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`)
  );
}

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  // Sem configuração do Supabase (ex.: build local sem env), não bloqueia.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return response;

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value)
        );
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
      },
    },
  });

  // IMPORTANTE: getUser() valida o token no servidor do Supabase e renova a
  // sessão. Não usar getSession() aqui (não valida).
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  if (!user && !isPublicPath(pathname)) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = '/login';
    loginUrl.searchParams.set('next', pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (user && pathname === '/login') {
    const homeUrl = request.nextUrl.clone();
    homeUrl.pathname = '/';
    homeUrl.search = '';
    return NextResponse.redirect(homeUrl);
  }

  return response;
}

export const config = {
  matcher: [
    // Tudo, exceto assets estáticos e otimização de imagem.
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|woff2?)$).*)',
  ],
};
