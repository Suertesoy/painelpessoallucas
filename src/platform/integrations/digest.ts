import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Montagem dos resumos por e-mail (templates simples em português).
 * Puro/isomórfico para ser testável sem rede; o envio real fica no
 * GmailSender (server-only).
 */

export type DigestKind = 'daily' | 'weekly' | 'critical' | 'automation_failure';

export interface DigestContent {
  subject: string;
  text: string;
}

interface ItemLite {
  title: string | null;
  content: string | null;
  type: string;
  status: string;
  priority: string;
  due_at: string | null;
  scheduled_at: string | null;
}

function itemLabel(item: ItemLite): string {
  return item.title ?? item.content?.slice(0, 60) ?? '(sem título)';
}

function formatDateTimeBr(iso: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}

function formatDateBr(iso: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
  }).format(new Date(iso));
}

export function renderDailyDigest(
  dateLabel: string,
  focus: ItemLite[],
  scheduled: ItemLite[],
  dueToday: ItemLite[],
  overdue: ItemLite[]
): DigestContent {
  const lines: string[] = [`Resumo do dia — ${dateLabel}`, ''];

  lines.push('FOCO DO DIA');
  lines.push(
    ...(focus.length ? focus.map((i) => `  • ${itemLabel(i)}`) : ['  (nenhum foco definido)'])
  );
  lines.push('');

  lines.push('AGENDADOS PARA HOJE');
  lines.push(
    ...(scheduled.length
      ? scheduled.map((i) => `  • ${i.scheduled_at ? formatDateTimeBr(i.scheduled_at) + ' — ' : ''}${itemLabel(i)}`)
      : ['  (nada agendado)'])
  );
  lines.push('');

  lines.push('PRAZOS DE HOJE');
  lines.push(
    ...(dueToday.length ? dueToday.map((i) => `  • ${itemLabel(i)}`) : ['  (nenhum prazo hoje)'])
  );
  lines.push('');

  if (overdue.length) {
    lines.push('ATENÇÃO — PRAZOS ESTOURADOS');
    lines.push(...overdue.map((i) => `  • ${i.due_at ? formatDateBr(i.due_at) + ' — ' : ''}${itemLabel(i)}`));
    lines.push('');
  }

  lines.push('— Painel Pessoal Lucas');
  return { subject: `Painel — Resumo do dia ${dateLabel}`, text: lines.join('\n') };
}

export function renderWeeklyDigest(
  weekLabel: string,
  completed: ItemLite[],
  upcoming: ItemLite[],
  overdue: ItemLite[]
): DigestContent {
  const lines: string[] = [`Resumo da semana — ${weekLabel}`, ''];

  lines.push(`CONCLUÍDOS NA SEMANA (${completed.length})`);
  lines.push(...(completed.length ? completed.slice(0, 15).map((i) => `  • ${itemLabel(i)}`) : ['  (nenhum)']));
  lines.push('');

  lines.push('PRÓXIMOS PRAZOS (7 dias)');
  lines.push(
    ...(upcoming.length
      ? upcoming.map((i) => `  • ${i.due_at ? formatDateBr(i.due_at) + ' — ' : ''}${itemLabel(i)}`)
      : ['  (nenhum)'])
  );
  lines.push('');

  if (overdue.length) {
    lines.push('PRAZOS ESTOURADOS');
    lines.push(...overdue.map((i) => `  • ${itemLabel(i)}`));
    lines.push('');
  }

  lines.push('— Painel Pessoal Lucas');
  return { subject: `Painel — Resumo da semana ${weekLabel}`, text: lines.join('\n') };
}

export function renderCriticalAlert(items: ItemLite[]): DigestContent {
  const lines = [
    'Prazos críticos precisando de atenção:',
    '',
    ...items.map((i) => `  • ${i.due_at ? formatDateBr(i.due_at) + ' — ' : ''}${itemLabel(i)} [${i.priority}]`),
    '',
    '— Painel Pessoal Lucas',
  ];
  return { subject: `Painel — ${items.length} prazo(s) crítico(s)`, text: lines.join('\n') };
}

export function renderAutomationFailure(failures: { type: string; error: string }[]): DigestContent {
  const lines = [
    'Falhas de automação registradas:',
    '',
    ...failures.map((f) => `  • ${f.type}: ${f.error}`),
    '',
    'Verifique o painel para detalhes.',
    '— Painel Pessoal Lucas',
  ];
  return { subject: `Painel — falha em automação`, text: lines.join('\n') };
}

// ----------------------------------------------------------------------------
// Coleta de dados (queries sob o client informado)
// ----------------------------------------------------------------------------

export async function buildDailyDigest(
  db: SupabaseClient,
  workspaceId: string,
  localDate: string // YYYY-MM-DD
): Promise<DigestContent> {
  const dayStartIso = new Date(`${localDate}T00:00:00-03:00`).toISOString();
  const dayEndIso = new Date(`${localDate}T23:59:59-03:00`).toISOString();

  const [focusRes, scheduledRes, dueRes, overdueRes] = await Promise.all([
    db
      .from('daily_plans')
      .select('daily_plan_items(items(title, content, type, status, priority, due_at, scheduled_at))')
      .eq('workspace_id', workspaceId)
      .eq('date', localDate)
      .maybeSingle(),
    db
      .from('items')
      .select('title, content, type, status, priority, due_at, scheduled_at')
      .eq('workspace_id', workspaceId)
      .is('deleted_at', null)
      .gte('scheduled_at', dayStartIso)
      .lte('scheduled_at', dayEndIso)
      .not('status', 'in', '(completed,archived)')
      .order('scheduled_at'),
    db
      .from('items')
      .select('title, content, type, status, priority, due_at, scheduled_at')
      .eq('workspace_id', workspaceId)
      .is('deleted_at', null)
      .gte('due_at', dayStartIso)
      .lte('due_at', dayEndIso)
      .not('status', 'in', '(completed,archived)'),
    db
      .from('items')
      .select('title, content, type, status, priority, due_at, scheduled_at')
      .eq('workspace_id', workspaceId)
      .is('deleted_at', null)
      .lt('due_at', dayStartIso)
      .not('status', 'in', '(completed,archived)')
      .order('due_at')
      .limit(10),
  ]);

  type FocusRow = { daily_plan_items?: { items: ItemLite | null }[] };
  const focus =
    ((focusRes.data as FocusRow | null)?.daily_plan_items ?? [])
      .map((r) => r.items)
      .filter((i): i is ItemLite => Boolean(i)) ?? [];

  const dateLabel = localDate.split('-').reverse().join('/');
  return renderDailyDigest(
    dateLabel,
    focus,
    (scheduledRes.data ?? []) as ItemLite[],
    (dueRes.data ?? []) as ItemLite[],
    (overdueRes.data ?? []) as ItemLite[]
  );
}

export async function buildWeeklyDigest(
  db: SupabaseClient,
  workspaceId: string,
  localDate: string
): Promise<DigestContent> {
  const now = new Date(`${localDate}T12:00:00-03:00`);
  const weekAgoIso = new Date(now.getTime() - 7 * 86_400_000).toISOString();
  const weekAheadIso = new Date(now.getTime() + 7 * 86_400_000).toISOString();
  const nowIso = now.toISOString();

  const [completedRes, upcomingRes, overdueRes] = await Promise.all([
    db
      .from('items')
      .select('title, content, type, status, priority, due_at, scheduled_at')
      .eq('workspace_id', workspaceId)
      .is('deleted_at', null)
      .gte('completed_at', weekAgoIso)
      .order('completed_at', { ascending: false }),
    db
      .from('items')
      .select('title, content, type, status, priority, due_at, scheduled_at')
      .eq('workspace_id', workspaceId)
      .is('deleted_at', null)
      .gte('due_at', nowIso)
      .lte('due_at', weekAheadIso)
      .not('status', 'in', '(completed,archived)')
      .order('due_at'),
    db
      .from('items')
      .select('title, content, type, status, priority, due_at, scheduled_at')
      .eq('workspace_id', workspaceId)
      .is('deleted_at', null)
      .lt('due_at', nowIso)
      .not('status', 'in', '(completed,archived)')
      .limit(10),
  ]);

  const dateLabel = localDate.split('-').reverse().join('/');
  return renderWeeklyDigest(
    `até ${dateLabel}`,
    (completedRes.data ?? []) as ItemLite[],
    (upcomingRes.data ?? []) as ItemLite[],
    (overdueRes.data ?? []) as ItemLite[]
  );
}
