'use client';

import type { SupabaseClient } from '@supabase/supabase-js';
import { DailyPlanRepository } from '../application/daily-plan.repository';
import { DailyPlan, DailyPlanSchema } from '../domain/daily-plan.schema';
import { ChangeNotifier } from '@/platform/supabase/change-notifier';

/**
 * Persiste o plano diário em duas tabelas normalizadas:
 * daily_plans (workspace + data) e daily_plan_items (itens de foco, com posição).
 * A interface do domínio (DailyPlan com focusItemIds) permanece a mesma.
 */
export class SupabaseDailyPlanRepository implements DailyPlanRepository {
  constructor(
    private supabase: SupabaseClient,
    private workspaceId: string,
    private notifier: ChangeNotifier
  ) {}

  async save(plan: DailyPlan): Promise<void> {
    // 1. Garante o registro do plano (unique workspace_id+date).
    const { data: planRow, error: planError } = await this.supabase
      .from('daily_plans')
      .upsert(
        {
          workspace_id: plan.workspaceId,
          date: plan.date,
        },
        { onConflict: 'workspace_id,date' }
      )
      .select('id')
      .single();
    if (planError || !planRow) {
      throw new Error(
        `Não foi possível salvar o plano do dia: ${planError?.message ?? 'sem retorno'}`
      );
    }

    // 2. Substitui o conjunto de itens de foco (máx. 3, garantido no domínio).
    const { error: deleteError } = await this.supabase
      .from('daily_plan_items')
      .delete()
      .eq('daily_plan_id', planRow.id);
    if (deleteError) {
      throw new Error(`Não foi possível atualizar o foco do dia: ${deleteError.message}`);
    }

    if (plan.focusItemIds.length > 0) {
      const { error: insertError } = await this.supabase.from('daily_plan_items').insert(
        plan.focusItemIds.map((itemId, index) => ({
          workspace_id: plan.workspaceId,
          daily_plan_id: planRow.id,
          item_id: itemId,
          position: index,
        }))
      );
      if (insertError) {
        throw new Error(`Não foi possível salvar o foco do dia: ${insertError.message}`);
      }
    }

    this.notifier.notify();
  }

  async findByDate(date: string): Promise<DailyPlan | null> {
    const { data, error } = await this.supabase
      .from('daily_plans')
      .select('id, workspace_id, date, created_at, updated_at, daily_plan_items(item_id, position)')
      .eq('workspace_id', this.workspaceId)
      .eq('date', date)
      .maybeSingle();
    if (error) {
      throw new Error(`Não foi possível carregar o plano do dia: ${error.message}`);
    }
    if (!data) return null;

    const focusItemIds = [...(data.daily_plan_items ?? [])]
      .sort((a: { position: number }, b: { position: number }) => a.position - b.position)
      .map((r: { item_id: string }) => r.item_id);

    return DailyPlanSchema.parse({
      workspaceId: data.workspace_id,
      date: data.date,
      focusItemIds,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    });
  }

  subscribe(listener: () => void): () => void {
    return this.notifier.subscribe(listener);
  }
}
