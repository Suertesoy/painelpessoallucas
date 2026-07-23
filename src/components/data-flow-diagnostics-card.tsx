'use client';

import { useState } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { getSupabaseBrowserClient } from '@/platform/supabase/browser-client';
import { useWorkspace } from '@/providers/auth.provider';
import { todayDateStr } from '@/lib/dates';
import { rowToProject, type ProjectRow } from '@/modules/projects/infrastructure/supabase-project.repository';
import { rowToItem, type ItemRow } from '@/modules/items/infrastructure/supabase-item.repository';
import { rowToDailyPlan } from '@/modules/planning/infrastructure/supabase-daily-plan.repository';
import { ExecutionPlanSchema } from '@/modules/plans/domain/plan.schema';
import type { ProjectStatus } from '@/modules/projects/domain/project.schema';

/**
 * Configurações → Diagnóstico de sincronização → Fluxo Projetos / Fluxo Hoje
 * (TEMPORÁRIO). Executa a MESMA consulta completa que os repositórios reais
 * usam (não a contagem simples do diagnóstico de sessão) e passa cada linha
 * pelo mapper/schema real, contando sucessos e falhas separadamente — sem
 * nunca expor conteúdo de projetos, IDs completos ou mensagens brutas do
 * banco.
 *
 * Remover junto com sync-diagnostics-card.tsx quando a causa estiver
 * comprovada e corrigida.
 */

type FlowErrorCategory = 'none' | 'permission_denied' | 'network_error' | 'query_error' | 'schema_error' | 'unknown';
type FlowStatus = 'ok' | 'error';

function categorizeFlowError(err: { code?: string } | null | undefined): FlowErrorCategory {
  if (!err) return 'unknown';
  if (err.code === '42501') return 'permission_denied';
  return 'query_error';
}

export interface ProjectsFlowDiagnostics {
  rawRowCount: number;
  mappedProjectCount: number;
  schemaFailureCount: number;
  filteredProjectCount: number;
  selectedFilter: ProjectStatus;
  repositoryStatus: FlowStatus;
  safeErrorCategory: FlowErrorCategory;
}

export async function fetchProjectsFlowDiagnostics(
  workspaceId: string,
  selectedFilter: ProjectStatus = 'active'
): Promise<ProjectsFlowDiagnostics> {
  const result: ProjectsFlowDiagnostics = {
    rawRowCount: 0,
    mappedProjectCount: 0,
    schemaFailureCount: 0,
    filteredProjectCount: 0,
    selectedFilter,
    repositoryStatus: 'ok',
    safeErrorCategory: 'none',
  };

  try {
    const supabase = getSupabaseBrowserClient();
    // Consulta completa real (mesmo select/filtros de SupabaseProjectRepository.findAll()).
    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .eq('workspace_id', workspaceId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (error) {
      result.repositoryStatus = 'error';
      result.safeErrorCategory = categorizeFlowError(error);
      return result;
    }

    const rows = (data ?? []) as ProjectRow[];
    result.rawRowCount = rows.length;

    for (const row of rows) {
      try {
        const project = rowToProject(row);
        result.mappedProjectCount += 1;
        if (project.status === selectedFilter) result.filteredProjectCount += 1;
      } catch {
        result.schemaFailureCount += 1;
      }
    }

    if (result.schemaFailureCount > 0) {
      result.repositoryStatus = 'error';
      result.safeErrorCategory = 'schema_error';
    }
  } catch {
    result.repositoryStatus = 'error';
    result.safeErrorCategory = 'network_error';
  }

  return result;
}

export interface HojeFlowDiagnostics {
  itemsStatus: FlowStatus;
  projectsStatus: FlowStatus;
  dailyPlanStatus: FlowStatus;
  plansStatus: FlowStatus;
  waitingStatus: FlowStatus;
  calendarStatus: FlowStatus | 'not_connected';
}

async function checkItemsFlow(workspaceId: string): Promise<FlowStatus> {
  try {
    const supabase = getSupabaseBrowserClient();
    const { data, error } = await supabase
      .from('items')
      .select('*')
      .eq('workspace_id', workspaceId)
      .is('deleted_at', null);
    if (error) return 'error';
    for (const row of (data ?? []) as ItemRow[]) rowToItem(row);
    return 'ok';
  } catch {
    return 'error';
  }
}

async function checkDailyPlanFlow(workspaceId: string): Promise<FlowStatus> {
  try {
    const supabase = getSupabaseBrowserClient();
    const { data, error } = await supabase
      .from('daily_plans')
      .select('workspace_id, date, created_at, updated_at, daily_plan_items(item_id, position)')
      .eq('workspace_id', workspaceId)
      .eq('date', todayDateStr())
      .maybeSingle();
    if (error) return 'error';
    if (!data) return 'ok'; // sem plano hoje ainda é um resultado válido.
    const focusItemIds = [...(data.daily_plan_items ?? [])]
      .sort((a: { position: number }, b: { position: number }) => a.position - b.position)
      .map((r: { item_id: string }) => r.item_id);
    rowToDailyPlan(data, focusItemIds);
    return 'ok';
  } catch {
    return 'error';
  }
}

async function checkPlansFlow(workspaceId: string): Promise<FlowStatus> {
  try {
    const supabase = getSupabaseBrowserClient();
    const { data, error } = await supabase
      .from('execution_plans')
      .select('*')
      .eq('workspace_id', workspaceId)
      .is('deleted_at', null);
    if (error) return 'error';
    for (const row of data ?? []) {
      ExecutionPlanSchema.parse({
        id: row.id,
        workspaceId: row.workspace_id,
        projectId: row.project_id ?? undefined,
        sourceDocumentId: row.source_document_id ?? undefined,
        name: row.name,
        objective: row.objective ?? undefined,
        status: row.status,
        startDate: row.start_date ?? undefined,
        targetDate: row.target_date ?? undefined,
        timezone: row.timezone,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        approvedAt: row.approved_at ?? undefined,
      });
    }
    return 'ok';
  } catch {
    return 'error';
  }
}

async function checkCalendarFlow(): Promise<FlowStatus | 'not_connected'> {
  try {
    const res = await fetch(`/api/integrations/calendar/today?date=${todayDateStr()}`);
    if (!res.ok) return 'error';
    const body = (await res.json()) as { connected?: boolean };
    return body.connected ? 'ok' : 'not_connected';
  } catch {
    return 'error';
  }
}

export async function fetchHojeFlowDiagnostics(workspaceId: string): Promise<HojeFlowDiagnostics> {
  const [itemsStatus, projectsFlow, dailyPlanStatus, plansStatus, calendarStatus] = await Promise.all([
    checkItemsFlow(workspaceId),
    fetchProjectsFlowDiagnostics(workspaceId),
    checkDailyPlanFlow(workspaceId),
    checkPlansFlow(workspaceId),
    checkCalendarFlow(),
  ]);
  return {
    itemsStatus,
    projectsStatus: projectsFlow.repositoryStatus,
    dailyPlanStatus,
    plansStatus,
    // "Aguardando" usa a mesma fonte de itens (status=blocked); não é uma
    // consulta separada, então reflete o mesmo status.
    waitingStatus: itemsStatus,
    calendarStatus,
  };
}

function StatusRow({ label, value }: { label: string; value: string | number }) {
  const isStatus = value === 'ok' || value === 'error' || value === 'not_connected';
  const tone = value === 'ok' ? 'text-green-700' : value === 'error' ? 'text-red-700' : 'text-gray-700';
  return (
    <div className="flex items-center justify-between py-1 text-sm">
      <span className="text-gray-600">{label}</span>
      <span className={`font-medium ${isStatus ? tone : 'text-gray-900'}`}>{String(value)}</span>
    </div>
  );
}

export function DataFlowDiagnosticsCard() {
  const { workspaceId } = useWorkspace();
  const [projectsFlow, setProjectsFlow] = useState<ProjectsFlowDiagnostics | null>(null);
  const [hojeFlow, setHojeFlow] = useState<HojeFlowDiagnostics | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const run = async () => {
    setIsLoading(true);
    const [p, h] = await Promise.all([
      fetchProjectsFlowDiagnostics(workspaceId),
      fetchHojeFlowDiagnostics(workspaceId),
    ]);
    setProjectsFlow(p);
    setHojeFlow(h);
    setIsLoading(false);
  };

  return (
    <section className="mt-4 rounded-xl border border-amber-200 bg-amber-50/40 p-6">
      <div className="flex items-start gap-2">
        <AlertTriangle size={18} className="mt-0.5 shrink-0 text-amber-600" />
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Fluxo de leitura e mapeamento</h2>
          <p className="mt-1 text-xs text-amber-800">
            Esta área é temporária e será removida depois que a sincronização for corrigida.
          </p>
        </div>
      </div>

      <button
        type="button"
        onClick={run}
        disabled={isLoading}
        className="mt-4 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <RefreshCw size={16} className={isLoading ? 'animate-spin' : ''} />
        {isLoading ? 'Executando…' : 'Executar diagnóstico de fluxo'}
      </button>

      {projectsFlow && hojeFlow && (
        <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <h3 className="text-sm font-semibold text-gray-900">Fluxo da página Projetos</h3>
            <div className="mt-2 divide-y divide-gray-100">
              <StatusRow label="Linhas cruas do banco" value={projectsFlow.rawRowCount} />
              <StatusRow label="Projetos mapeados com sucesso" value={projectsFlow.mappedProjectCount} />
              <StatusRow label="Falhas de schema" value={projectsFlow.schemaFailureCount} />
              <StatusRow label="Filtro avaliado" value={projectsFlow.selectedFilter} />
              <StatusRow label="Projetos no filtro" value={projectsFlow.filteredProjectCount} />
              <StatusRow label="Status do repositório" value={projectsFlow.repositoryStatus} />
              <StatusRow label="Categoria de erro" value={projectsFlow.safeErrorCategory} />
            </div>
          </div>

          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <h3 className="text-sm font-semibold text-gray-900">Fluxo da página Hoje</h3>
            <div className="mt-2 divide-y divide-gray-100">
              <StatusRow label="Itens" value={hojeFlow.itemsStatus} />
              <StatusRow label="Projetos" value={hojeFlow.projectsStatus} />
              <StatusRow label="Plano do dia" value={hojeFlow.dailyPlanStatus} />
              <StatusRow label="Planos ativos" value={hojeFlow.plansStatus} />
              <StatusRow label="Aguardando" value={hojeFlow.waitingStatus} />
              <StatusRow label="Google Calendar" value={hojeFlow.calendarStatus} />
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
