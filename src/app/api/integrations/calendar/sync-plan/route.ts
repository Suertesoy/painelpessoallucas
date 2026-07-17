import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSessionContext } from '@/platform/supabase/session';
import { getSupabaseAdminClient } from '@/platform/supabase/admin-client';
import { syncItemToCalendar } from '@/platform/integrations/calendar-sync';

/**
 * POST /api/integrations/calendar/sync-plan
 * { planId, scope: 'none' | 'milestones' | 'timed' | 'all' | 'manual' }
 *
 * Aplica a escolha de sincronização aos itens já materializados do plano.
 * Nada é enviado automaticamente ao Calendar sem esta escolha explícita.
 */
const BodySchema = z.object({
  planId: z.string().uuid(),
  scope: z.enum(['none', 'milestones', 'timed', 'all', 'manual']),
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
  const { planId, scope } = parsed.data;

  // Plano sob RLS.
  const { data: plan, error: planError } = await session.supabase
    .from('execution_plans')
    .update({ calendar_sync_scope: scope })
    .eq('id', planId)
    .select('id, workspace_id')
    .maybeSingle();
  if (planError || !plan) {
    return NextResponse.json({ error: 'Plano não encontrado' }, { status: 404 });
  }

  if (scope === 'none' || scope === 'manual') {
    return NextResponse.json({ scope, updated: 0 });
  }

  // Itens do plano com horário (scheduled_at) — candidatos por escopo.
  const { data: items } = await session.supabase
    .from('items')
    .select('id, plan_action_id, scheduled_at, plan_actions:plan_action_id(action_type)')
    .eq('execution_plan_id', planId)
    .is('deleted_at', null)
    .not('scheduled_at', 'is', null);

  const candidates = (items ?? []).filter((item) => {
    if (scope === 'all') return true;
    const actionType = (item.plan_actions as { action_type?: string } | null)?.action_type;
    if (scope === 'milestones') return actionType === 'milestone';
    if (scope === 'timed') return true; // já filtrado por scheduled_at
    return false;
  });

  const admin = getSupabaseAdminClient();
  let synced = 0;
  const errors: string[] = [];
  for (const item of candidates) {
    await session.supabase.from('items').update({ calendar_sync: 'sync' }).eq('id', item.id);
    const result = await syncItemToCalendar(admin, session.supabase, session.workspaceId, item.id);
    if (result.status === 'error') errors.push(result.detail ?? item.id);
    else synced += 1;
  }

  return NextResponse.json({ scope, updated: synced, errors });
}
