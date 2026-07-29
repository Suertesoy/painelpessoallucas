import { describe, it, expect } from 'vitest';
import { buildNotificationContent, targetUrlForCategory } from '@/platform/push/push-content';

describe('buildNotificationContent', () => {
  it('lembrete de tarefa com detalhes desativados: título/corpo genéricos', () => {
    const content = buildNotificationContent({
      category: 'task_reminder',
      showDetails: false,
      itemTitle: 'Ligar para o dentista',
    });
    expect(content.title).toBe('Painel Lucas');
    expect(content.body).toBe('Você tem um lembrete para revisar.');
    expect(content.body).not.toContain('dentista');
  });

  it('lembrete de tarefa com detalhes ativados: mostra o título da tarefa', () => {
    const content = buildNotificationContent({
      category: 'task_reminder',
      showDetails: true,
      itemTitle: 'Ligar para o dentista',
    });
    expect(content.body).toBe('Ligar para o dentista');
  });

  it('trunca título muito longo em 140 caracteres', () => {
    const longTitle = 'A'.repeat(300);
    const content = buildNotificationContent({ category: 'task_reminder', showDetails: true, itemTitle: longTitle });
    expect(content.body.length).toBe(140);
  });

  it('sem itemTitle, mesmo com showDetails, cai para o genérico', () => {
    const content = buildNotificationContent({ category: 'task_reminder', showDetails: true });
    expect(content.body).toBe('Você tem um lembrete para revisar.');
  });

  it('aviso diário: conteúdo fixo, nunca pessoal', () => {
    const content = buildNotificationContent({ category: 'daily_planning', showDetails: true });
    expect(content).toEqual({
      title: 'Organize seu dia',
      body: 'Abra o Painel Lucas e escolha seus focos de hoje.',
    });
  });

  it('revisão semanal: conteúdo fixo, nunca pessoal', () => {
    const content = buildNotificationContent({ category: 'weekly_review', showDetails: true });
    expect(content).toEqual({
      title: 'Hora da revisão semanal',
      body: 'Revise o que avançou e prepare a próxima semana.',
    });
  });

  it('falha de captura: nunca inclui mensagem técnica, mesmo com detalhes ativados', () => {
    const content = buildNotificationContent({ category: 'capture_failure', showDetails: true });
    expect(content.title).toBe('Uma captura precisa de atenção');
    expect(content.body).toBe('Não foi possível organizar uma captura. O conteúdo original está preservado.');
  });
});

describe('targetUrlForCategory', () => {
  it('lembrete de tarefa e falha de captura apontam para a Caixa de Entrada com deep link', () => {
    expect(targetUrlForCategory('task_reminder', 'item-1')).toBe('/entrada?item=item-1');
    expect(targetUrlForCategory('capture_failure', 'item-2')).toBe('/entrada?item=item-2');
  });

  it('sem itemId, cai para a Caixa de Entrada genérica', () => {
    expect(targetUrlForCategory('task_reminder')).toBe('/entrada');
  });

  it('aviso diário aponta para Hoje; revisão semanal aponta para Revisão', () => {
    expect(targetUrlForCategory('daily_planning')).toBe('/hoje');
    expect(targetUrlForCategory('weekly_review')).toBe('/revisao');
  });
});
