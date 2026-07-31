import { NextResponse } from 'next/server';
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getSessionContext } from '@/platform/supabase/session';
import { ItemTypeSchema, ItemPrioritySchema } from '@/modules/items/domain/item.schema';
import { checkTriageFreshness, STALE_ANALYSIS_MESSAGE } from '@/platform/ai/triage-freshness';
import { ensureDefaultShoppingLists } from '@/modules/shopping/infrastructure/ensure-default-shopping-lists';
import { FALLBACK_SHOPPING_LIST_SLUG } from '@/modules/shopping/domain/shopping-list.schema';
import { deterministicUuid } from '@/lib/deterministic-uuid';

/**
 * POST /api/ai/confirm-triage-action
 * Aplica UMA ação (nova tarefa/item ou atualização da própria captura)
 * aprovada explicitamente na revisão da triagem por IA de uma captura livre.
 * Existe como rota de servidor — em vez de o cliente gravar direto no
 * Supabase — porque só aqui é possível garantir, de forma que o cliente não
 * consiga contornar, que a proposta confirmada ainda corresponde ao texto
 * que foi analisado (ver checkTriageFreshness). Uma proposta desatualizada
 * (transcrição editada depois da análise) nunca é aplicada.
 */

const ActionPayloadSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  itemType: ItemTypeSchema.optional(),
  priority: ItemPrioritySchema.optional(),
  projectId: z.string().uuid().optional(),
  nextAction: z.string().optional(),
  dueAt: z.string().datetime({ offset: true }).optional(),
  scheduledAt: z.string().datetime({ offset: true }).optional(),
  estimatedMinutes: z.number().int().positive().optional(),
  /** Só usado quando itemType === 'shopping_item'; padrão Mercado quando ausente. */
  shoppingListId: z.string().uuid().optional(),
});

const BodySchema = z.object({
  itemId: z.string().uuid(),
  aiRunId: z.string().uuid(),
  actionType: z.enum(['create_item', 'update_capture']),
  action: ActionPayloadSchema,
  /**
   * Índice da ação dentro de `proposal.proposedActions` (ver
   * AudioCaptureReview). Quando presente, o id do item criado é derivado
   * deterministicamente de `aiRunId:actionIndex` — uma confirmação retentada
   * (rede instável, duplo clique) colide com a chave primária em vez de criar
   * um item duplicado. Opcional para não quebrar chamadas antigas.
   */
  actionIndex: z.number().int().min(0).optional(),
});

type ErrorCategory = 'unauthenticated' | 'invalid_request' | 'not_found' | 'stale_analysis' | 'write_failed';

function errorResponse(status: number, errorCategory: ErrorCategory, message: string) {
  return NextResponse.json({ error: message, errorCategory }, { status });
}

export async function POST(request: Request) {
  const session = await getSessionContext();
  if (!session) {
    return errorResponse(401, 'unauthenticated', 'Sessão expirada. Faça login novamente.');
  }

  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await request.json());
  } catch {
    return errorResponse(400, 'invalid_request', 'Não foi possível confirmar: dados incompletos.');
  }

  // Captura sob RLS: só encontra se pertencer ao workspace do usuário.
  const { data: itemRow, error: itemError } = await session.supabase
    .from('items')
    .select(
      'id, title, content, type, status, priority, project_id, due_at, scheduled_at, estimated_minutes, next_action, source'
    )
    .eq('id', body.itemId)
    .is('deleted_at', null)
    .maybeSingle();
  if (itemError || !itemRow) {
    return errorResponse(404, 'not_found', 'Captura não encontrada.');
  }

  const currentContent = (itemRow.content as string | null) ?? (itemRow.title as string | null) ?? '';
  const freshness = await checkTriageFreshness(session.supabase, {
    aiRunId: body.aiRunId,
    itemId: body.itemId,
    workspaceId: session.workspaceId,
    currentContent,
  });
  if (!freshness.fresh) {
    if (freshness.reason === 'stale') {
      return errorResponse(409, 'stale_analysis', STALE_ANALYSIS_MESSAGE);
    }
    return errorResponse(404, 'not_found', 'Análise não encontrada. Analise novamente antes de confirmar.');
  }

  const now = new Date().toISOString();

  if (body.actionType === 'create_item') {
    const isShoppingItem = (body.action.itemType ?? 'task') === 'shopping_item';

    // Garante que a lista de destino exista antes de vincular o item — nunca
    // referencia um shopping_list_id que a IA/cliente possa ter inventado.
    // Mercado é o destino quando a revisão não escolheu outra lista.
    let shoppingListId: string | undefined;
    if (isShoppingItem) {
      const { lists } = await ensureDefaultShoppingLists(session.supabase, session.workspaceId);
      const requested = body.action.shoppingListId
        ? lists.find((l) => l.id === body.action.shoppingListId)
        : undefined;
      const fallback = lists.find((l) => l.slug === FALLBACK_SHOPPING_LIST_SLUG);
      shoppingListId = (requested ?? fallback)?.id;
    }

    const newItemId =
      body.actionIndex !== undefined
        ? await deterministicUuid(`${body.aiRunId}:${body.actionIndex}`)
        : crypto.randomUUID();
    const newItem = {
      id: newItemId,
      workspaceId: session.workspaceId,
      title: body.action.title,
      content: body.action.description,
      type: body.action.itemType ?? 'task',
      // O usuário acabou de revisar e confirmar todos os campos desta ação;
      // o destino criado não volta para a fila de capturas.
      status: 'organized' as const,
      priority: body.action.priority ?? 'normal',
      projectId: body.action.projectId,
      dueAt: body.action.dueAt,
      scheduledAt: body.action.scheduledAt,
      estimatedMinutes: body.action.estimatedMinutes,
      nextAction: body.action.nextAction,
      shoppingListId,
      source: 'ai' as const,
      createdAt: now,
      updatedAt: now,
    };

    const { error: insertError } = await session.supabase.from('items').insert({
      id: newItem.id,
      workspace_id: newItem.workspaceId,
      project_id: newItem.projectId ?? null,
      title: newItem.title ?? null,
      content: newItem.content ?? null,
      type: newItem.type,
      status: newItem.status,
      priority: newItem.priority,
      due_at: newItem.dueAt ?? null,
      scheduled_at: newItem.scheduledAt ?? null,
      estimated_minutes: newItem.estimatedMinutes ?? null,
      next_action: newItem.nextAction ?? null,
      shopping_list_id: newItem.shoppingListId ?? null,
      source: newItem.source,
      created_at: newItem.createdAt,
    });
    if (insertError) {
      // Confirmação retentada com o mesmo actionIndex: o id determinístico
      // colide com a chave primária (item já criado por uma tentativa
      // anterior) — sucesso idempotente, não um erro.
      const isDuplicateRetry =
        body.actionIndex !== undefined && (insertError as { code?: string }).code === '23505';
      if (isDuplicateRetry) {
        return NextResponse.json({ status: 'created', itemId: newItem.id });
      }
      return errorResponse(500, 'write_failed', 'Não foi possível aplicar esta ação. Tente novamente.');
    }

    await recordDomainEvent(session.supabase, {
      workspaceId: session.workspaceId,
      type: 'item.created',
      entityId: newItem.id,
      source: 'ai',
      payload: newItem,
      createdAt: now,
    });

    return NextResponse.json({ status: 'created', itemId: newItem.id });
  }

  // update_capture: atualiza a própria captura (mesmo itemId já validado acima).
  const existing = {
    id: itemRow.id as string,
    title: (itemRow.title as string | null) ?? undefined,
    content: (itemRow.content as string | null) ?? undefined,
    type: itemRow.type,
    status: itemRow.status,
    priority: itemRow.priority,
    projectId: (itemRow.project_id as string | null) ?? undefined,
    dueAt: (itemRow.due_at as string | null) ?? undefined,
    scheduledAt: (itemRow.scheduled_at as string | null) ?? undefined,
    estimatedMinutes: (itemRow.estimated_minutes as number | null) ?? undefined,
    nextAction: (itemRow.next_action as string | null) ?? undefined,
  };
  const updated = {
    ...existing,
    title: body.action.title ?? existing.title,
    content: body.action.description ?? existing.content,
    type: body.action.itemType ?? existing.type,
    priority: body.action.priority ?? existing.priority,
    projectId: body.action.projectId ?? existing.projectId,
    dueAt: body.action.dueAt ?? existing.dueAt,
    scheduledAt: body.action.scheduledAt ?? existing.scheduledAt,
    estimatedMinutes: body.action.estimatedMinutes ?? existing.estimatedMinutes,
    nextAction: body.action.nextAction ?? existing.nextAction,
  };

  const { error: updateError } = await session.supabase
    .from('items')
    .update({
      title: updated.title ?? null,
      content: updated.content ?? null,
      type: updated.type,
      priority: updated.priority,
      project_id: updated.projectId ?? null,
      due_at: updated.dueAt ?? null,
      scheduled_at: updated.scheduledAt ?? null,
      estimated_minutes: updated.estimatedMinutes ?? null,
      next_action: updated.nextAction ?? null,
    })
    .eq('id', body.itemId);
  if (updateError) {
    return errorResponse(500, 'write_failed', 'Não foi possível aplicar esta ação. Tente novamente.');
  }

  await recordDomainEvent(session.supabase, {
    workspaceId: session.workspaceId,
    type: 'item.updated',
    entityId: body.itemId,
    source: 'ai',
    payload: { previous: existing, new: updated },
    createdAt: now,
  });

  return NextResponse.json({ status: 'updated', itemId: body.itemId });
}

/** Evento é auditoria: uma falha aqui nunca derruba a ação principal já aplicada. */
async function recordDomainEvent(
  supabase: SupabaseClient,
  event: { workspaceId: string; type: string; entityId: string; source: string; payload: unknown; createdAt: string }
): Promise<void> {
  const { error } = await supabase.from('domain_events').insert({
    id: crypto.randomUUID(),
    workspace_id: event.workspaceId,
    type: event.type,
    entity_id: event.entityId,
    source: event.source,
    payload: event.payload,
    created_at: event.createdAt,
  });
  if (error) {
    console.error('Falha ao registrar evento de domínio', error.message);
  }
}
