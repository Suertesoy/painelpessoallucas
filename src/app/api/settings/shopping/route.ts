import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSessionContext } from '@/platform/supabase/session';
import { isValidWhatsAppNumber } from '@/modules/shopping/domain/whatsapp-share';

/**
 * GET/PUT /api/settings/shopping — número de WhatsApp usado para compartilhar
 * a lista de compras. Vive na mesma tabela `workspace_settings` das demais
 * preferências (RLS por workspace), como rota dedicada (não a de /digest)
 * para que o upsert toque somente esta coluna — nunca sobrescreve as
 * preferências de resumo por e-mail salvas por outro card.
 */

const PutBodySchema = z.object({
  whatsappNumber: z
    .string()
    .trim()
    .max(30)
    .nullable()
    .refine((v) => v === null || v === '' || isValidWhatsAppNumber(v), {
      message: 'Número de WhatsApp inválido — inclua o código do país e DDD.',
    }),
});

export async function GET() {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

  const { data, error } = await session.supabase
    .from('workspace_settings')
    .select('shopping_whatsapp_number')
    .eq('workspace_id', session.workspaceId)
    .maybeSingle();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ whatsappNumber: data?.shopping_whatsapp_number ?? null });
}

export async function PUT(request: Request) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

  const parsed = PutBodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Número inválido' },
      { status: 400 }
    );
  }

  const whatsappNumber = parsed.data.whatsappNumber || null;

  const { error } = await session.supabase.from('workspace_settings').upsert(
    {
      workspace_id: session.workspaceId,
      shopping_whatsapp_number: whatsappNumber,
    },
    { onConflict: 'workspace_id' }
  );
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
