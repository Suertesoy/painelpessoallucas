import { describe, it, expect } from 'vitest';
import {
  computeAutomationHealth,
  type AutomationRunRow,
  type AutomationWorkspaceSettings,
} from '@/platform/automation/automation-health';

/**
 * Camada pura de tradução de `automation_runs` em saúde das automações
 * (P0-3). Cobre a agregação (execuções/falhas em 24h), os quatro estados
 * gerais (saudável/atenção/problema/sem dados), a distinção entre falha
 * isolada já recuperada e falha consecutiva não recuperada, e a tradução de
 * categorias técnicas em mensagens compreensíveis — sem nenhuma chamada de
 * IA, tudo determinístico.
 */

const NOW = new Date('2026-07-27T14:00:00.000Z');

function isoHoursAgo(hours: number): string {
  return new Date(NOW.getTime() - hours * 3600_000).toISOString();
}

function row(overrides: Partial<AutomationRunRow> & { automation_type: string }): AutomationRunRow {
  const createdAt = overrides.created_at ?? NOW.toISOString();
  return {
    status: 'completed',
    started_at: createdAt,
    completed_at: createdAt,
    error_code: null,
    error_message: null,
    result: null,
    ...overrides,
    created_at: createdAt,
  };
}

const SETTINGS_ALL_OFF: AutomationWorkspaceSettings = {
  daily_digest_enabled: false,
  weekly_digest_enabled: false,
  critical_alerts_enabled: false,
};

const SETTINGS_DAILY_ON: AutomationWorkspaceSettings = {
  daily_digest_enabled: true,
  weekly_digest_enabled: false,
  critical_alerts_enabled: false,
};

function heartbeatOk(hoursAgo = 0): AutomationRunRow[] {
  return [
    row({ automation_type: 'materialize_recurrences', created_at: isoHoursAgo(hoursAgo) }),
    row({ automation_type: 'reminders_to_notifications', created_at: isoHoursAgo(hoursAgo) }),
  ];
}

describe('computeAutomationHealth — agregação', () => {
  it('conta execuções e falhas das últimas 24 horas corretamente, ignorando o que é mais antigo', () => {
    const rows: AutomationRunRow[] = [
      ...heartbeatOk(1),
      row({ automation_type: 'calendar_sync_pending', created_at: isoHoursAgo(3), status: 'failed' }),
      row({ automation_type: 'calendar_sync_pending', created_at: isoHoursAgo(30) }), // fora da janela de 24h
      row({ automation_type: 'calendar_sync_pending', created_at: isoHoursAgo(30), status: 'failed' }), // idem
    ];
    const health = computeAutomationHealth(rows, SETTINGS_ALL_OFF, NOW);
    expect(health.runsLast24Hours).toBe(3);
    expect(health.failedRunsLast24Hours).toBe(1);
  });

  it('lastRunAt e lastSuccessfulRunAt vêm das automações que rodam a cada tick (recorrências/lembretes)', () => {
    const rows: AutomationRunRow[] = [
      row({ automation_type: 'materialize_recurrences', created_at: isoHoursAgo(1), completed_at: isoHoursAgo(1) }),
      row({ automation_type: 'reminders_to_notifications', created_at: isoHoursAgo(0.5), completed_at: isoHoursAgo(0.5) }),
      // Um resumo muito antigo não deve "esconder" a informação de que o cron está vivo.
      row({ automation_type: 'daily_digest', created_at: isoHoursAgo(40) }),
    ];
    const health = computeAutomationHealth(rows, SETTINGS_ALL_OFF, NOW);
    expect(health.lastRunAt).toBe(isoHoursAgo(0.5));
  });
});

describe('computeAutomationHealth — estados gerais', () => {
  it('saudável: execução recente (≤2h) e nenhuma falha', () => {
    const health = computeAutomationHealth(heartbeatOk(1), SETTINGS_ALL_OFF, NOW);
    expect(health.status).toBe('healthy');
    expect(health.summaryMessage).toBe('Funcionando normalmente.');
  });

  it('sem execução registrada: estado distinto — nunca tratado como saudável ou neutro', () => {
    const health = computeAutomationHealth([], SETTINGS_ALL_OFF, NOW);
    expect(health.status).toBe('no_data');
    expect(health.summaryMessage).toContain('Nenhuma execução registrada');
    expect(health.lastRunAt).toBeNull();
  });

  it('última execução muito antiga (>4h): problema, mesmo sem nenhuma falha registrada', () => {
    const health = computeAutomationHealth(heartbeatOk(5), SETTINGS_ALL_OFF, NOW);
    expect(health.status).toBe('problem');
    expect(health.summaryMessage).toBe('Nenhuma execução nas últimas 4 horas.');
  });

  it('última execução entre 2 e 4 horas: atenção', () => {
    const health = computeAutomationHealth(heartbeatOk(3), SETTINGS_ALL_OFF, NOW);
    expect(health.status).toBe('attention');
    expect(health.summaryMessage).toBe('A última execução ocorreu há mais de 2 horas.');
  });

  it('falha seguida de sucesso não permanece como falha crítica (não vira "problem")', () => {
    const rows: AutomationRunRow[] = [
      ...heartbeatOk(0.5),
      row({ automation_type: 'calendar_sync_pending', created_at: isoHoursAgo(3), status: 'failed' }),
      row({ automation_type: 'calendar_sync_pending', created_at: isoHoursAgo(1), status: 'completed' }),
    ];
    const health = computeAutomationHealth(rows, SETTINGS_ALL_OFF, NOW);
    expect(health.status).not.toBe('problem');
    // Ainda houve 1 falha nas últimas 24h — não é "saudável" silenciosamente.
    expect(health.status).toBe('attention');
  });

  it('falhas consecutivas do mesmo tipo (sem sucesso entre elas): problema', () => {
    const rows: AutomationRunRow[] = [
      row({ automation_type: 'materialize_recurrences', created_at: isoHoursAgo(0.2) }),
      row({ automation_type: 'reminders_to_notifications', created_at: isoHoursAgo(1), status: 'failed' }),
      row({ automation_type: 'reminders_to_notifications', created_at: isoHoursAgo(2), status: 'failed' }),
    ];
    const health = computeAutomationHealth(rows, SETTINGS_ALL_OFF, NOW);
    expect(health.status).toBe('problem');
    expect(health.summaryMessage).toContain('falha');
  });
});

describe('computeAutomationHealth — passos e tradução de categorias', () => {
  it('Google Calendar nunca executou apesar do cron estar vivo: interpretado como desconectado', () => {
    const health = computeAutomationHealth(heartbeatOk(0.5), SETTINGS_ALL_OFF, NOW);
    const calendarStep = health.steps.find((s) => s.type === 'calendar_sync_pending')!;
    expect(calendarStep.status).toBe('not_connected');
    expect(calendarStep.suggestedAction).toBe('reconnect_calendar');
    expect(calendarStep.userMessage).toBe('Google Calendar não está conectado.');
  });

  it('Google Calendar com falha na última execução: traduzido como falhando, com ação de detalhes', () => {
    const rows: AutomationRunRow[] = [
      ...heartbeatOk(0.5),
      row({ automation_type: 'calendar_sync_pending', created_at: isoHoursAgo(0.5), status: 'failed' }),
    ];
    const health = computeAutomationHealth(rows, SETTINGS_ALL_OFF, NOW);
    const calendarStep = health.steps.find((s) => s.type === 'calendar_sync_pending')!;
    expect(calendarStep.status).toBe('failing');
    expect(calendarStep.lastErrorCategory).toBe('calendar_error');
    expect(calendarStep.suggestedAction).toBe('view_details');
  });

  it('Google Calendar concluído mas com erros parciais no resultado: atenção, não falha crítica', () => {
    const rows: AutomationRunRow[] = [
      ...heartbeatOk(0.5),
      row({
        automation_type: 'calendar_sync_pending',
        created_at: isoHoursAgo(0.5),
        status: 'completed',
        result: { synced: 3, errors: 2 },
      }),
    ];
    const health = computeAutomationHealth(rows, SETTINGS_ALL_OFF, NOW);
    const calendarStep = health.steps.find((s) => s.type === 'calendar_sync_pending')!;
    expect(calendarStep.status).toBe('attention');
  });

  it('resumos desativados nas preferências: estado "desativado", não confundido com falha', () => {
    const health = computeAutomationHealth(heartbeatOk(0.5), SETTINGS_ALL_OFF, NOW);
    const digestStep = health.steps.find((s) => s.type === 'digest')!;
    expect(digestStep.status).toBe('disabled');
    expect(digestStep.lastErrorCategory).toBeNull();
  });

  it('resumo ativo mas Gmail não conectado: traduzido como desconectado, com ação de reconectar', () => {
    const rows: AutomationRunRow[] = [
      ...heartbeatOk(0.5),
      row({
        automation_type: 'daily_digest',
        created_at: isoHoursAgo(0.2),
        status: 'completed',
        result: { sent: false, reason: 'Gmail não conectado em Configurações → Integrações.' },
      }),
    ];
    const health = computeAutomationHealth(rows, SETTINGS_DAILY_ON, NOW);
    const digestStep = health.steps.find((s) => s.type === 'digest')!;
    expect(digestStep.status).toBe('not_connected');
    expect(digestStep.suggestedAction).toBe('reconnect_gmail');
  });

  it('resumo enviado com sucesso: passo ok', () => {
    const rows: AutomationRunRow[] = [
      ...heartbeatOk(0.5),
      row({
        automation_type: 'daily_digest',
        created_at: isoHoursAgo(0.2),
        status: 'completed',
        result: { sent: true, kind: 'daily', to: 'lucas@example.com' },
      }),
    ];
    const health = computeAutomationHealth(rows, SETTINGS_DAILY_ON, NOW);
    const digestStep = health.steps.find((s) => s.type === 'digest')!;
    expect(digestStep.status).toBe('ok');
  });

  it('nenhuma mensagem traduzida expõe snake_case, UUID ou nomes internos de tabela/coluna', () => {
    const rows: AutomationRunRow[] = [
      ...heartbeatOk(5),
      row({ automation_type: 'calendar_sync_pending', created_at: isoHoursAgo(1), status: 'failed' }),
      row({
        automation_type: 'daily_digest',
        created_at: isoHoursAgo(1),
        status: 'completed',
        result: { sent: false, reason: 'Gmail não conectado.' },
      }),
    ];
    const health = computeAutomationHealth(rows, SETTINGS_DAILY_ON, NOW);
    const texts = [
      health.summaryMessage,
      health.lastFailureMessage,
      ...health.steps.map((s) => s.userMessage),
    ].filter((t): t is string => !!t);

    expect(texts.length).toBeGreaterThan(0);
    for (const text of texts) {
      expect(text).not.toMatch(/[a-z]+_[a-z]+/); // snake_case
      expect(text).not.toMatch(/\b[0-9a-f]{8}-[0-9a-f]{4}-/i); // UUID
      expect(text).not.toMatch(/\b\d{3}\b/); // status HTTP tipo "500"
      expect(text.toLowerCase()).not.toContain('automation_runs');
      expect(text.toLowerCase()).not.toContain('workspace_id');
    }
  });
});
