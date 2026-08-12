import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSessionContext } from '@/platform/supabase/session';

/**
 * GET/PUT /api/settings/routine — qual projeto ocupa "Projeto principal" e
 * "Frente secundária" na rotina diária da Home. Vive na mesma tabela
 * `workspace_settings` das demais preferências (RLS por workspace), como
 * rota dedicada (mesmo padrão de /api/settings/shopping) para que o upsert
 * toque somente estas duas colunas — nunca sobrescreve preferências de
 * outro card. A rotina em si (horários/papéis) é código, não configuração;
 * aqui só persiste a atribuição de projeto, para poder trocar sem deploy.
 */

const PutBodySchema = z.object({
  primaryProjectId: z.string().uuid().nullable(),
  secondaryProjectId: z.string().uuid().nullable(),
});

export async function GET() {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

  const { data, error } = await session.supabase
    .from('workspace_settings')
    .select('routine_primary_project_id, routine_secondary_project_id')
    .eq('workspace_id', session.workspaceId)
    .maybeSingle();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    primaryProjectId: data?.routine_primary_project_id ?? null,
    secondaryProjectId: data?.routine_secondary_project_id ?? null,
  });
}

export async function PUT(request: Request) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

  const parsed = PutBodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Dados inválidos' },
      { status: 400 }
    );
  }
  const { primaryProjectId, secondaryProjectId } = parsed.data;

  const idsToCheck = [primaryProjectId, secondaryProjectId].filter((id): id is string => Boolean(id));
  if (idsToCheck.length > 0) {
    const { data: ownedProjects, error: projectsError } = await session.supabase
      .from('projects')
      .select('id')
      .eq('workspace_id', session.workspaceId)
      .in('id', idsToCheck);
    if (projectsError) {
      return NextResponse.json({ error: projectsError.message }, { status: 500 });
    }
    const ownedIds = new Set((ownedProjects ?? []).map((p: { id: string }) => p.id));
    if (idsToCheck.some((id) => !ownedIds.has(id))) {
      return NextResponse.json({ error: 'Projeto inválido para este workspace.' }, { status: 400 });
    }
  }

  const { error } = await session.supabase.from('workspace_settings').upsert(
    {
      workspace_id: session.workspaceId,
      routine_primary_project_id: primaryProjectId,
      routine_secondary_project_id: secondaryProjectId,
    },
    { onConflict: 'workspace_id' }
  );
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
