/**
 * Camada de tradução: transforma linhas brutas de `automation_runs` (e as
 * preferências de resumo em `workspace_settings`) em um modelo de saúde já
 * traduzido para linguagem compreensível — o componente de UI nunca vê
 * `snake_case`, status HTTP, nome de tabela/constraint ou mensagem bruta do
 * Supabase/Google. Nenhuma regra aqui usa IA: tudo é determinístico.
 *
 * O cron roda a cada hora (vercel.json). "Recorrências" e "Lembretes" rodam
 * incondicionalmente a cada tick (para todo workspace) — são o "batimento"
 * usado para saber se o cron está vivo. "Google Calendar" só roda se houver
 * conta conectada; "Resumos" só roda se a preferência estiver ativa e o
 * horário configurado já tiver passado — por isso a ausência de execuções
 * desses dois não significa, por si só, que o cron parou.
 */

export type AutomationHealthStatus = 'healthy' | 'attention' | 'problem' | 'no_data';

export type AutomationStepStatus =
  | 'ok'
  | 'attention'
  | 'failing'
  | 'not_connected'
  | 'disabled'
  | 'never_run';

export type AutomationErrorCategory =
  | 'calendar_error'
  | 'calendar_not_connected'
  | 'gmail_not_connected'
  | 'gmail_send_error'
  | 'unknown_error';

export type AutomationSuggestedAction = 'reconnect_calendar' | 'reconnect_gmail' | 'view_details' | null;

export interface AutomationStepHealth {
  /** Chave interna estável (nunca exibida ao usuário). */
  type: string;
  label: string;
  status: AutomationStepStatus;
  lastRunAt: string | null;
  lastSuccessAt: string | null;
  lastErrorCategory: AutomationErrorCategory | null;
  userMessage: string | null;
  suggestedAction: AutomationSuggestedAction;
}

export interface AutomationHealth {
  status: AutomationHealthStatus;
  /** Frase pronta para exibição — toda a lógica de tradução já aplicada. */
  summaryMessage: string;
  /** Mensagem da falha mais recente entre os passos, quando houver uma relevante. */
  lastFailureMessage: string | null;
  lastFailureAction: AutomationSuggestedAction;
  lastRunAt: string | null;
  lastSuccessfulRunAt: string | null;
  runsLast24Hours: number;
  failedRunsLast24Hours: number;
  steps: AutomationStepHealth[];
}

/** Formato de uma linha de `automation_runs` relevante para a leitura de saúde. */
export interface AutomationRunRow {
  automation_type: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'skipped';
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  error_code: string | null;
  error_message: string | null;
  result: unknown;
}

export interface AutomationWorkspaceSettings {
  daily_digest_enabled: boolean;
  weekly_digest_enabled: boolean;
  critical_alerts_enabled: boolean;
}

/** Tipos que rodam a cada tick, para todo workspace, sem depender de conexão
 * ou preferência — usados como "batimento cardíaco" do cron. */
const HEARTBEAT_TYPES = ['materialize_recurrences', 'reminders_to_notifications'];

const HEALTHY_WINDOW_MS = 2 * 3600_000;
const PROBLEM_WINDOW_MS = 4 * 3600_000;
const LAST_24H_MS = 24 * 3600_000;

function sortedByCreatedAtDesc(rows: AutomationRunRow[]): AutomationRunRow[] {
  return [...rows].sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0));
}

function rowsForTypes(rows: AutomationRunRow[], types: string[]): AutomationRunRow[] {
  return sortedByCreatedAtDesc(rows.filter((r) => types.includes(r.automation_type)));
}

function computeSimpleStep(rows: AutomationRunRow[], type: string, label: string): AutomationStepHealth {
  const forType = rowsForTypes(rows, [type]);
  const latest = forType[0] ?? null;

  if (!latest) {
    return {
      type,
      label,
      status: 'never_run',
      lastRunAt: null,
      lastSuccessAt: null,
      lastErrorCategory: null,
      userMessage: 'Ainda não há execução registrada para esta automação.',
      suggestedAction: null,
    };
  }

  const lastSuccess = forType.find((r) => r.status === 'completed') ?? null;

  if (latest.status === 'failed') {
    return {
      type,
      label,
      status: 'failing',
      lastRunAt: latest.created_at,
      lastSuccessAt: lastSuccess?.completed_at ?? null,
      lastErrorCategory: 'unknown_error',
      userMessage: 'Não foi possível concluir esta automação na última execução. Será tentada novamente.',
      suggestedAction: 'view_details',
    };
  }

  return {
    type,
    label,
    status: 'ok',
    lastRunAt: latest.created_at,
    lastSuccessAt: lastSuccess?.completed_at ?? latest.completed_at ?? null,
    lastErrorCategory: null,
    userMessage: null,
    suggestedAction: null,
  };
}

function computeCalendarStep(rows: AutomationRunRow[], heartbeatRows: AutomationRunRow[]): AutomationStepHealth {
  const type = 'calendar_sync_pending';
  const label = 'Google Calendar';
  const forType = rowsForTypes(rows, [type]);
  const latest = forType[0] ?? null;

  if (!latest) {
    // A etapa só roda quando há conta conectada. Se o cron está vivo
    // (batimento presente) e mesmo assim nunca rodou, a conclusão mais
    // provável é que o Calendar nunca foi conectado neste período.
    if (heartbeatRows.length > 0) {
      return {
        type,
        label,
        status: 'not_connected',
        lastRunAt: null,
        lastSuccessAt: null,
        lastErrorCategory: 'calendar_not_connected',
        userMessage: 'Google Calendar não está conectado.',
        suggestedAction: 'reconnect_calendar',
      };
    }
    return {
      type,
      label,
      status: 'never_run',
      lastRunAt: null,
      lastSuccessAt: null,
      lastErrorCategory: null,
      userMessage: 'Ainda não há execução registrada para esta automação.',
      suggestedAction: null,
    };
  }

  const lastSuccess = forType.find((r) => r.status === 'completed') ?? null;

  if (latest.status === 'failed') {
    return {
      type,
      label,
      status: 'failing',
      lastRunAt: latest.created_at,
      lastSuccessAt: lastSuccess?.completed_at ?? null,
      lastErrorCategory: 'calendar_error',
      userMessage: 'Não foi possível acessar o Google Calendar. Será tentado novamente.',
      suggestedAction: 'view_details',
    };
  }

  const result = latest.result as { synced?: number; errors?: number } | null;
  if (result && typeof result.errors === 'number' && result.errors > 0) {
    return {
      type,
      label,
      status: 'attention',
      lastRunAt: latest.created_at,
      lastSuccessAt: lastSuccess?.completed_at ?? null,
      lastErrorCategory: 'calendar_error',
      userMessage: 'Algumas sincronizações com o Google Calendar não foram concluídas.',
      suggestedAction: 'view_details',
    };
  }

  return {
    type,
    label,
    status: 'ok',
    lastRunAt: latest.created_at,
    lastSuccessAt: lastSuccess?.completed_at ?? latest.completed_at ?? null,
    lastErrorCategory: null,
    userMessage: null,
    suggestedAction: null,
  };
}

function computeDigestStep(rows: AutomationRunRow[], settings: AutomationWorkspaceSettings | null): AutomationStepHealth {
  const type = 'digest';
  const label = 'Resumos por e-mail';
  const dailyEnabled = settings?.daily_digest_enabled ?? false;
  const weeklyEnabled = settings?.weekly_digest_enabled ?? false;

  if (!dailyEnabled && !weeklyEnabled) {
    return {
      type,
      label,
      status: 'disabled',
      lastRunAt: null,
      lastSuccessAt: null,
      lastErrorCategory: null,
      userMessage: 'Resumos por e-mail estão desativados nas preferências.',
      suggestedAction: null,
    };
  }

  const forType = rowsForTypes(rows, ['daily_digest', 'weekly_digest']);
  const latest = forType[0] ?? null;

  if (!latest) {
    return {
      type,
      label,
      status: 'never_run',
      lastRunAt: null,
      lastSuccessAt: null,
      lastErrorCategory: null,
      userMessage: 'Ainda não houve execução — aguardando o horário configurado.',
      suggestedAction: null,
    };
  }

  const lastSuccess = forType.find((r) => r.status === 'completed') ?? null;

  if (latest.status === 'failed') {
    return {
      type,
      label,
      status: 'failing',
      lastRunAt: latest.created_at,
      lastSuccessAt: lastSuccess?.completed_at ?? null,
      lastErrorCategory: 'gmail_send_error',
      userMessage: 'Não foi possível enviar o último resumo. Será tentado novamente.',
      suggestedAction: 'view_details',
    };
  }

  const result = latest.result as { sent?: boolean; reason?: string } | null;
  if (result && result.sent === false) {
    if (result.reason?.toLowerCase().includes('gmail')) {
      return {
        type,
        label,
        status: 'not_connected',
        lastRunAt: latest.created_at,
        lastSuccessAt: lastSuccess?.completed_at ?? null,
        lastErrorCategory: 'gmail_not_connected',
        userMessage: 'Gmail não está conectado — os resumos não podem ser enviados.',
        suggestedAction: 'reconnect_gmail',
      };
    }
    return {
      type,
      label,
      status: 'attention',
      lastRunAt: latest.created_at,
      lastSuccessAt: lastSuccess?.completed_at ?? null,
      lastErrorCategory: 'unknown_error',
      userMessage: 'O último resumo não foi enviado.',
      suggestedAction: 'view_details',
    };
  }

  return {
    type,
    label,
    status: 'ok',
    lastRunAt: latest.created_at,
    lastSuccessAt: lastSuccess?.completed_at ?? latest.completed_at ?? null,
    lastErrorCategory: null,
    userMessage: null,
    suggestedAction: null,
  };
}

function buildSummaryMessage(
  status: AutomationHealthStatus,
  failedRunsLast24Hours: number,
  hoursSinceLastRun: number | null
): string {
  switch (status) {
    case 'no_data':
      return 'Nenhuma execução registrada. As automações podem não estar ativas.';
    case 'problem':
      if (hoursSinceLastRun !== null && hoursSinceLastRun > 4) {
        return 'Nenhuma execução nas últimas 4 horas.';
      }
      return failedRunsLast24Hours > 0
        ? `${failedRunsLast24Hours} falha${failedRunsLast24Hours > 1 ? 's' : ''} nas últimas 24 horas.`
        : 'Falhas consecutivas em uma automação.';
    case 'attention':
      if (hoursSinceLastRun !== null && hoursSinceLastRun > 2) {
        return 'A última execução ocorreu há mais de 2 horas.';
      }
      return failedRunsLast24Hours > 0
        ? `${failedRunsLast24Hours} falha${failedRunsLast24Hours > 1 ? 's' : ''} nas últimas 24 horas — nova tentativa automática.`
        : 'Verificando uma execução recente.';
    case 'healthy':
    default:
      return 'Funcionando normalmente.';
  }
}

/**
 * Agrega o histórico recente de `automation_runs` (mais as preferências de
 * resumo) em um modelo de saúde pronto para exibição. Pura — sem I/O — para
 * poder ser testada sem mockar o Supabase.
 */
export function computeAutomationHealth(
  rows: AutomationRunRow[],
  settings: AutomationWorkspaceSettings | null,
  now: Date = new Date()
): AutomationHealth {
  const nowMs = now.getTime();
  const heartbeatRows = rowsForTypes(rows, HEARTBEAT_TYPES);

  const last24h = rows.filter((r) => nowMs - new Date(r.created_at).getTime() <= LAST_24H_MS);
  const runsLast24Hours = last24h.length;
  const failedRunsLast24Hours = last24h.filter((r) => r.status === 'failed').length;

  const lastRunAt = heartbeatRows[0]?.created_at ?? null;
  const lastCompletedHeartbeat = heartbeatRows.find((r) => r.status === 'completed') ?? null;
  const lastSuccessfulRunAt = lastCompletedHeartbeat?.completed_at ?? null;

  const hoursSinceLastRun = lastRunAt !== null ? (nowMs - new Date(lastRunAt).getTime()) / 3600_000 : null;

  // Falha consecutiva: as duas execuções mais recentes do MESMO tipo
  // terminaram em falha — indica um problema que a nova tentativa automática
  // não resolveu sozinho, diferente de uma falha isolada já superada.
  const allTypes = Array.from(new Set(rows.map((r) => r.automation_type)));
  const hasConsecutiveFailure = allTypes.some((type) => {
    const forType = rowsForTypes(rows, [type]);
    return forType[0]?.status === 'failed' && forType[1]?.status === 'failed';
  });

  let status: AutomationHealthStatus;
  if (heartbeatRows.length === 0) {
    status = 'no_data';
  } else if ((hoursSinceLastRun !== null && hoursSinceLastRun > PROBLEM_WINDOW_MS / 3600_000) || hasConsecutiveFailure) {
    status = 'problem';
  } else if ((hoursSinceLastRun !== null && hoursSinceLastRun > HEALTHY_WINDOW_MS / 3600_000) || failedRunsLast24Hours > 0) {
    status = 'attention';
  } else {
    status = 'healthy';
  }

  const steps: AutomationStepHealth[] = [
    computeSimpleStep(rows, 'materialize_recurrences', 'Recorrências'),
    computeSimpleStep(rows, 'reminders_to_notifications', 'Lembretes'),
    computeCalendarStep(rows, heartbeatRows),
    computeDigestStep(rows, settings),
  ];

  const failingSteps = steps
    .filter((s) => s.status === 'failing' && s.lastRunAt)
    .sort((a, b) => (a.lastRunAt! < b.lastRunAt! ? 1 : -1));
  const worstFailure = failingSteps[0] ?? null;

  return {
    status,
    summaryMessage: buildSummaryMessage(status, failedRunsLast24Hours, hoursSinceLastRun),
    lastFailureMessage: worstFailure?.userMessage ?? null,
    lastFailureAction: worstFailure?.suggestedAction ?? null,
    lastRunAt,
    lastSuccessfulRunAt,
    runsLast24Hours,
    failedRunsLast24Hours,
    steps,
  };
}
