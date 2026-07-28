import { NextResponse } from 'next/server';
import { getSessionContext } from '@/platform/supabase/session';
import { searchPlaces } from '@/platform/integrations/places';

/**
 * GET /api/integrations/places/search?q=texto
 * Sugestões de local para o formulário de evento presencial. Nunca lança:
 * sem chave configurada ou falha na Places API, retorna lista vazia — a
 * busca de locais é uma conveniência, nunca pode travar a criação do evento.
 */
export async function GET(request: Request) {
  const session = await getSessionContext();
  if (!session) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  }

  const url = new URL(request.url);
  const q = url.searchParams.get('q') ?? '';
  if (q.trim().length < 3) {
    return NextResponse.json({ suggestions: [] });
  }

  const suggestions = await searchPlaces(q);
  return NextResponse.json({ suggestions });
}
