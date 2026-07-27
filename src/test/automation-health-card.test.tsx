// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { AutomationHealthCard } from '@/components/automation-health-card';
import type { AutomationHealth } from '@/platform/automation/automation-health';

/**
 * Card de saúde das automações em /configuracoes. Somente leitura: nunca
 * chama a rota do cron nem qualquer automação — só lê o histórico já
 * traduzido pelo repositório (automation-health.test.ts cobre a tradução em
 * si; aqui cobrimos carregamento, erro e renderização dos estados).
 */

const getHealth = vi.fn();

vi.mock('@/providers/repository.provider', () => ({
  useRepositories: () => ({ automationHealthRepository: { getHealth } }),
}));

const originalFetch = global.fetch;

const HEALTHY: AutomationHealth = {
  status: 'healthy',
  summaryMessage: 'Funcionando normalmente.',
  lastFailureMessage: null,
  lastFailureAction: null,
  lastRunAt: '2026-07-27T14:00:00.000Z',
  lastSuccessfulRunAt: '2026-07-27T14:00:00.000Z',
  runsLast24Hours: 24,
  failedRunsLast24Hours: 0,
  steps: [
    {
      type: 'materialize_recurrences',
      label: 'Recorrências',
      status: 'ok',
      lastRunAt: '2026-07-27T14:00:00.000Z',
      lastSuccessAt: '2026-07-27T14:00:00.000Z',
      lastErrorCategory: null,
      userMessage: null,
      suggestedAction: null,
    },
    {
      type: 'reminders_to_notifications',
      label: 'Lembretes',
      status: 'ok',
      lastRunAt: '2026-07-27T14:00:00.000Z',
      lastSuccessAt: '2026-07-27T14:00:00.000Z',
      lastErrorCategory: null,
      userMessage: null,
      suggestedAction: null,
    },
    {
      type: 'calendar_sync_pending',
      label: 'Google Calendar',
      status: 'ok',
      lastRunAt: '2026-07-27T14:00:00.000Z',
      lastSuccessAt: '2026-07-27T14:00:00.000Z',
      lastErrorCategory: null,
      userMessage: null,
      suggestedAction: null,
    },
    {
      type: 'digest',
      label: 'Resumos por e-mail',
      status: 'disabled',
      lastRunAt: null,
      lastSuccessAt: null,
      lastErrorCategory: null,
      userMessage: 'Resumos por e-mail estão desativados nas preferências.',
      suggestedAction: null,
    },
  ],
};

const WITH_FAILURE: AutomationHealth = {
  ...HEALTHY,
  status: 'problem',
  summaryMessage: '2 falhas nas últimas 24 horas.',
  lastFailureMessage: 'Google Calendar não está conectado.',
  lastFailureAction: 'reconnect_calendar',
  failedRunsLast24Hours: 2,
  steps: HEALTHY.steps.map((s) =>
    s.type === 'calendar_sync_pending'
      ? {
          ...s,
          status: 'not_connected' as const,
          userMessage: 'Google Calendar não está conectado.',
          suggestedAction: 'reconnect_calendar' as const,
        }
      : s
  ),
};

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
  global.fetch = originalFetch;
});

describe('AutomationHealthCard', () => {
  it('mostra estado de carregamento antes da primeira resposta', async () => {
    let resolve: (h: AutomationHealth) => void = () => {};
    getHealth.mockReturnValue(new Promise((r) => { resolve = r; }));
    render(<AutomationHealthCard />);

    expect(screen.getByText(/Carregando estado das automações/)).toBeTruthy();
    resolve(HEALTHY);
    await waitFor(() => expect(screen.queryByText(/Carregando estado das automações/)).toBeNull());
  });

  it('estado saudável: mostra última execução, contagens e nenhuma falha', async () => {
    getHealth.mockResolvedValue(HEALTHY);
    render(<AutomationHealthCard />);

    await waitFor(() => expect(screen.getByText(/Funcionando normalmente/)).toBeTruthy());
    expect(screen.getByText('24 execuções')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Automações' })).toBeTruthy();
  });

  it('estado com falha: mostra a falha mais recente e a ação de reconectar', async () => {
    getHealth.mockResolvedValue(WITH_FAILURE);
    render(<AutomationHealthCard />);

    await waitFor(() => expect(screen.getByText(/Última falha: Google Calendar não está conectado/)).toBeTruthy());
    const link = screen.getByRole('link', { name: 'Reconectar Google' });
    expect(link.getAttribute('href')).toBe('/configuracoes#integracoes');
  });

  it('estado sem falha, mas com detalhes de um passo desativado: "Ver detalhes" expande a mensagem, nunca aparece por padrão', async () => {
    getHealth.mockResolvedValue(HEALTHY);
    render(<AutomationHealthCard />);

    await waitFor(() => expect(screen.getByText('Resumos por e-mail')).toBeTruthy());
    expect(screen.queryByText('Resumos por e-mail estão desativados nas preferências.')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Ver detalhes' }));
    expect(screen.getByText('Resumos por e-mail estão desativados nas preferências.')).toBeTruthy();
  });

  it('falha ao carregar usa o componente padrão de erro, com "Tentar novamente"', async () => {
    getHealth.mockRejectedValue(new Error('permission denied for table automation_runs'));
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<AutomationHealthCard />);

    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
    expect(screen.getByText('Não foi possível carregar seus dados.')).toBeTruthy();
    // A mensagem bruta do Supabase nunca aparece na tela.
    expect(screen.queryByText(/automation_runs/)).toBeNull();

    getHealth.mockResolvedValue(HEALTHY);
    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    await waitFor(() => expect(screen.getByText(/Funcionando normalmente/)).toBeTruthy());
    consoleSpy.mockRestore();
  });

  it('funciona normalmente sem o Google conectado (estado "desconectado" no passo de Calendar)', async () => {
    getHealth.mockResolvedValue(WITH_FAILURE);
    render(<AutomationHealthCard />);

    await waitFor(() => expect(screen.getByText('desconectado')).toBeTruthy());
    // O card renderiza normalmente mesmo com o Calendar desconectado — sem lançar erro.
    expect(screen.getByRole('heading', { name: 'Automações' })).toBeTruthy();
  });

  it('nenhum snake_case aparece no texto renderizado do componente', async () => {
    getHealth.mockResolvedValue(WITH_FAILURE);
    const { container } = render(<AutomationHealthCard />);

    await waitFor(() => expect(screen.getByText(/Última falha/)).toBeTruthy());
    for (const btn of screen.getAllByRole('button', { name: 'Ver detalhes' })) {
      fireEvent.click(btn);
    }

    expect(container.textContent ?? '').not.toMatch(/[a-z]+_[a-z]+/);
  });

  it('não dispara nenhuma automação (nenhuma chamada de rede) ao renderizar — é somente leitura', async () => {
    global.fetch = vi.fn();
    getHealth.mockResolvedValue(HEALTHY);
    render(<AutomationHealthCard />);

    await waitFor(() => expect(getHealth).toHaveBeenCalledTimes(1));
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
