import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSessionContext } from '@/platform/supabase/session';
import { getSupabaseAdminClient } from '@/platform/supabase/admin-client';
import { syncItemToCalendar } from '@/platform/integrations/calendar-sync';

/**
 * POST /api/integrations/calendar/sync-item
 * { itemId, mode: 'none' | 'sync' | 'sync_reminder' }
 * Define a preferência do item e executa a sincronização correspondente.
 */
const BodySchema = z.object({
  itemId: z.string().uuid(),
  mode: z.enum(['none', 'sync', 'sync_reminder']),
});

export async function POST(request: Request) {
  const session = await getSessionContext();
  if (!session) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  }

  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Corpo inválido' }, { status: 400 });
  }

  // Atualiza a preferência sob RLS (item precisa ser do workspace do usuário).
  const { data: updated, error } = await session.supabase
    .from('items')
    .update({ calendar_sync: parsed.data.mode })
    .eq('id', parsed.data.itemId)
    .select('id')
    .maybeSingle();
  if (error || !updated) {
    return NextResponse.json({ error: 'Item não encontrado' }, { status: 404 });
  }

  const result = await syncItemToCalendar(
    getSupabaseAdminClient(),
    session.supabase,
    session.workspaceId,
    parsed.data.itemId
  );

  if (result.status === 'error') {
    return NextResponse.json({ error: result.detail }, { status: 502 });
  }
  return NextResponse.json(result);
}
