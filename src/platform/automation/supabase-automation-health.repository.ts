'use client';

import type { SupabaseClient } from '@supabase/supabase-js';
import { AutomationHealthRepository } from './automation-health.repository';
import {
  computeAutomationHealth,
  type AutomationHealth,
  type AutomationRunRow,
  type AutomationWorkspaceSettings,
} from './automation-health';

/** Janela de leitura: cobre bem além dos limiares de saúde (2h/4h) e das
 * automações semanais, sem carregar histórico desnecessário. */
const LOOKBACK_DAYS = 7;
const MAX_ROWS = 1000;

export class SupabaseAutomationHealthRepository implements AutomationHealthRepository {
  constructor(
    private supabase: SupabaseClient,
    private workspaceId: string
  ) {}

  async getHealth(): Promise<AutomationHealth> {
    const since = new Date(Date.now() - LOOKBACK_DAYS * 86_400_000).toISOString();

    const [runsResult, settingsResult] = await Promise.all([
      this.supabase
        .from('automation_runs')
        .select('automation_type, status, created_at, started_at, completed_at, error_code, error_message, result')
        .eq('workspace_id', this.workspaceId)
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(MAX_ROWS),
      this.supabase
        .from('workspace_settings')
        .select('daily_digest_enabled, weekly_digest_enabled, critical_alerts_enabled')
        .eq('workspace_id', this.workspaceId)
        .maybeSingle(),
    ]);

    if (runsResult.error) {
      throw new Error(`Não foi possível carregar o histórico de automações: ${runsResult.error.message}`);
    }
    if (settingsResult.error) {
      throw new Error(`Não foi possível carregar as preferências de automação: ${settingsResult.error.message}`);
    }

    return computeAutomationHealth(
      (runsResult.data ?? []) as AutomationRunRow[],
      (settingsResult.data as AutomationWorkspaceSettings | null) ?? null,
      new Date()
    );
  }
}
