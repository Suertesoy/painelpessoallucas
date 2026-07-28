import { NextResponse } from 'next/server';
import { getSessionContext } from '@/platform/supabase/session';
import { getPlaceDetails } from '@/platform/integrations/places';

/**
 * GET /api/integrations/places/details?placeId=xxx
 * Endereço formatado + coordenadas de um local selecionado nas sugestões —
 * é o que vira `location` do evento no Google Calendar.
 */
export async function GET(request: Request) {
  const session = await getSessionContext();
  if (!session) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  }

  const url = new URL(request.url);
  const placeId = url.searchParams.get('placeId') ?? '';
  if (!placeId.trim()) {
    return NextResponse.json({ error: 'placeId ausente' }, { status: 400 });
  }

  const details = await getPlaceDetails(placeId);
  if (!details) {
    return NextResponse.json({ error: 'Local não encontrado' }, { status: 404 });
  }
  return NextResponse.json(details);
}
