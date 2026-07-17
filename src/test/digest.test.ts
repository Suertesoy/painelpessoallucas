import { describe, it, expect } from 'vitest';
import {
  renderDailyDigest,
  renderWeeklyDigest,
  renderCriticalAlert,
  renderAutomationFailure,
} from '@/platform/integrations/digest';
import {
  setEmailSenderFactory,
  resolveEmailSender,
  type EmailMessage,
  type EmailSender,
} from '@/platform/integrations/email-sender';

const item = (over: Partial<Record<string, unknown>> = {}) => ({
  title: 'Tarefa exemplo',
  content: null,
  type: 'task',
  status: 'planned',
  priority: 'normal',
  due_at: null,
  scheduled_at: null,
  ...over,
});

describe('Templates de resumo (português)', () => {
  it('resumo diário lista foco, agendados, prazos e estourados', () => {
    const digest = renderDailyDigest(
      '17/07/2026',
      [item({ title: 'Foco 1' })],
      [item({ title: 'Reunião', scheduled_at: '2026-07-17T14:00:00.000Z' })],
      [item({ title: 'Entregar proposta' })],
      [item({ title: 'Atrasada', due_at: '2026-07-10T12:00:00.000Z' })]
    );
    expect(digest.subject).toContain('17/07/2026');
    expect(digest.text).toContain('FOCO DO DIA');
    expect(digest.text).toContain('Foco 1');
    expect(digest.text).toContain('Reunião');
    expect(digest.text).toContain('PRAZOS ESTOURADOS');
    expect(digest.text).toContain('Atrasada');
    expect(digest.text).toContain('Painel Pessoal Lucas');
  });

  it('resumo diário vazio tem placeholders amigáveis', () => {
    const digest = renderDailyDigest('17/07/2026', [], [], [], []);
    expect(digest.text).toContain('(nenhum foco definido)');
    expect(digest.text).toContain('(nada agendado)');
    expect(digest.text).not.toContain('PRAZOS ESTOURADOS');
  });

  it('resumo semanal resume concluídos e próximos prazos', () => {
    const digest = renderWeeklyDigest(
      'até 17/07/2026',
      [item({ title: 'Feita 1' }), item({ title: 'Feita 2' })],
      [item({ title: 'Próxima', due_at: '2026-07-20T12:00:00.000Z' })],
      []
    );
    expect(digest.text).toContain('CONCLUÍDOS NA SEMANA (2)');
    expect(digest.text).toContain('Próxima');
  });

  it('alerta crítico e falha de automação têm assuntos claros', () => {
    const critical = renderCriticalAlert([
      item({ title: 'Urgente', priority: 'critical', due_at: '2026-07-18T12:00:00.000Z' }),
    ]);
    expect(critical.subject).toContain('crítico');
    const failure = renderAutomationFailure([{ type: 'recorrencia', error: 'timeout' }]);
    expect(failure.text).toContain('recorrencia: timeout');
  });

  it('horários são formatados no fuso America/Sao_Paulo', () => {
    const digest = renderDailyDigest(
      '17/07/2026',
      [],
      [item({ title: 'Call', scheduled_at: '2026-07-17T18:30:00.000Z' })], // 15:30 em SP
      [],
      []
    );
    expect(digest.text).toContain('15:30');
  });
});

describe('Envio com provider mock (sem rede)', () => {
  it('usa o sender injetado', async () => {
    const sent: EmailMessage[] = [];
    const mock: EmailSender = {
      send: async (m) => {
        sent.push(m);
      },
    };
    setEmailSenderFactory(() => mock);

    const sender = resolveEmailSender(() => {
      throw new Error('não deveria usar o Gmail real');
    });
    await sender.send({ to: 'lucas@exemplo.dev', subject: 'Teste', text: 'corpo' });

    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe('lucas@exemplo.dev');
  });
});
