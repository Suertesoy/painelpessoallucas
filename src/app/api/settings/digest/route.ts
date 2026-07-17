import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSessionContext } from '@/platform/supabase/session';

/**
 * GET/PUT /api/settings/digest — preferências de resumos por e-mail.
 * Tudo sob RLS (workspace do usuário autenticado).
 */

const SettingsSchema = z.object({
  daily_digest_enabled: z.boolean(),
  daily_digest_time: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/),
  weekly_digest_enabled: z.boolean(),
  weekly_digest_day: z.number().int().min(0).max(6),
  weekly_digest_time: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/),
  critical_alerts_enabled: z.boolean(),
  digest_recipient: z.string().email().nullable(),
});

export async function GET() {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

  const { data } = await session.supabase
    .from('workspace_settings')
    .select('*')
    .eq('workspace_id', session.workspaceId)
    .maybeSingle();

  return NextResponse.json(
    data ?? {
      daily_digest_enabled: false,
      daily_digest_time: '07:30',
      weekly_digest_enabled: false,
      weekly_digest_day: 1,
      weekly_digest_time: '08:00',
      critical_alerts_enabled: false,
      digest_recipient: null,
    }
  );
}

export async function PUT(request: Request) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

  const parsed = SettingsSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Preferências inválidas' }, { status: 400 });
  }

  const { error } = await session.supabase.from('workspace_settings').upsert(
    {
      workspace_id: session.workspaceId,
      ...parsed.data,
    },
    { onConflict: 'workspace_id' }
  );
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
