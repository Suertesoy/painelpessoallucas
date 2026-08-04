import { describe, it, expect } from 'vitest';
import { formatRecurrenceRuleLabel } from '@/modules/plans/domain/recurrence-label';

/**
 * Caso real do bug: a tela de revisão mostrava "Diária às 18:00 (seg, ter,
 * qua, qui, sex)" numa lista solta, sem ligação com "Estudo de japonês".
 * Este formatador produz o texto único "atividade + frequência + horário"
 * usado dentro do card da própria ação.
 */
describe('formatRecurrenceRuleLabel', () => {
  it('rotina diária de segunda a sexta vira "De segunda a sexta, às HH:MM"', () => {
    const label = formatRecurrenceRuleLabel({
      frequency: 'daily',
      daysOfWeek: [1, 2, 3, 4, 5],
      localTime: '18:00',
    });
    expect(label).toBe('De segunda a sexta, às 18:00');
  });

  it('rotina diária sem dias específicos vira "Todos os dias"', () => {
    const label = formatRecurrenceRuleLabel({ frequency: 'daily', daysOfWeek: null, localTime: '07:00' });
    expect(label).toBe('Todos os dias, às 07:00');
  });

  it('semanal com dois dias vira "Toda segunda e quinta"', () => {
    const label = formatRecurrenceRuleLabel({
      frequency: 'weekly',
      daysOfWeek: [1, 4],
      localTime: '16:30',
    });
    expect(label).toBe('Toda segunda e quinta, às 16:30');
  });

  it('semanal com um único dia vira "Toda terça"', () => {
    const label = formatRecurrenceRuleLabel({ frequency: 'weekly', daysOfWeek: [2], localTime: '16:30' });
    expect(label).toBe('Toda terça, às 16:30');
  });

  it('semanal com outro único dia vira "Toda quarta"', () => {
    const label = formatRecurrenceRuleLabel({ frequency: 'weekly', daysOfWeek: [3], localTime: '16:30' });
    expect(label).toBe('Toda quarta, às 16:30');
  });

  it('semanal com três ou mais dias junta com vírgula e "e"', () => {
    const label = formatRecurrenceRuleLabel({
      frequency: 'weekly',
      daysOfWeek: [1, 3, 5],
      localTime: '09:00',
    });
    expect(label).toBe('Toda segunda, quarta e sexta, às 09:00');
  });

  it('mensal com dia do mês vira "Todo dia N do mês"', () => {
    const label = formatRecurrenceRuleLabel({ frequency: 'monthly', dayOfMonth: 5, localTime: '10:00' });
    expect(label).toBe('Todo dia 5 do mês, às 10:00');
  });

  it('sem horário não adiciona sufixo "às"', () => {
    const label = formatRecurrenceRuleLabel({ frequency: 'weekly', daysOfWeek: [2] });
    expect(label).toBe('Toda terça');
  });

  it('todos os 7 dias da semana vira "Todos os dias" mesmo em frequência semanal', () => {
    const label = formatRecurrenceRuleLabel({
      frequency: 'weekly',
      daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
      localTime: '08:00',
    });
    expect(label).toBe('Todos os dias, às 08:00');
  });

  it('frequência desconhecida cai no fallback sem quebrar', () => {
    const label = formatRecurrenceRuleLabel({ frequency: 'once', localTime: '09:00' });
    expect(label).toBe('Uma vez, às 09:00');
  });
});
