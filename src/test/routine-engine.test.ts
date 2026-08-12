import { describe, it, expect } from 'vitest';
import {
  WEEKDAY_ROUTINE_BLOCKS,
  getBlocksForDate,
  isBusinessDay,
  getCurrentBlock,
  getNextBlock,
  findNextCompatibleBlockToday,
  nextBusinessDayStr,
  minutesRemainingInBlock,
  roleCapacityMinutesForDate,
  originDayLabel,
  selectTasksForBlock,
  computeLoad,
  classifyPendingItems,
  localTimeParts,
  blockStartIso,
  localDateTimeToIso,
  tasksScheduledOnDate,
  type RoutineTaskLike,
} from '@/modules/routine/domain/routine-engine';

// 2026-08-10 é uma segunda-feira; 2026-08-14 sexta; 2026-08-15/16 sáb/dom.
const MONDAY = '2026-08-10';
const FRIDAY = '2026-08-14';
const SATURDAY = '2026-08-15';
const SUNDAY = '2026-08-16';

function task(over: Partial<RoutineTaskLike>): RoutineTaskLike {
  return {
    id: over.id ?? crypto.randomUUID(),
    type: 'task',
    status: 'organized',
    priority: 'normal',
    ...over,
  };
}

describe('rotina em dia útil', () => {
  it('retorna os 10 blocos padrão numa segunda-feira', () => {
    const blocks = getBlocksForDate(MONDAY);
    expect(blocks).toEqual(WEEKDAY_ROUTINE_BLOCKS);
  });

  it('não gera rotina de trabalho em sábado ou domingo', () => {
    expect(isBusinessDay(SATURDAY)).toBe(false);
    expect(isBusinessDay(SUNDAY)).toBe(false);
    expect(getBlocksForDate(SATURDAY)).toEqual([]);
    expect(getBlocksForDate(SUNDAY)).toEqual([]);
  });
});

describe('sexta → próxima segunda (nunca sábado/domingo)', () => {
  it('próximo dia útil depois de sexta é segunda', () => {
    expect(nextBusinessDayStr(FRIDAY)).toBe('2026-08-17');
  });

  it('próximo dia útil depois de quarta é quinta', () => {
    expect(nextBusinessDayStr('2026-08-12')).toBe('2026-08-13');
  });

  it('próximo dia útil depois de quinta é sexta', () => {
    expect(nextBusinessDayStr('2026-08-13')).toBe(FRIDAY);
  });
});

describe('identificação do bloco por horário', () => {
  const blocks = getBlocksForDate(MONDAY);

  it('11:20 cai no segundo bloco de Projeto principal', () => {
    const current = getCurrentBlock(blocks, '11:20');
    expect(current?.id).toBe('primary-2');
    expect(minutesRemainingInBlock(current!, '11:20')).toBe(70);
  });

  it('10:35 cai na Pausa', () => {
    const current = getCurrentBlock(blocks, '10:35');
    expect(current?.role).toBe('break');
    expect(current?.label).toBe('Pausa');
  });

  it('12:45 cai no Almoço', () => {
    const current = getCurrentBlock(blocks, '12:45');
    expect(current?.role).toBe('lunch');
  });

  it('17:30 cai no Buffer', () => {
    const current = getCurrentBlock(blocks, '17:30');
    expect(current?.role).toBe('buffer');
  });

  it('19:00 cai no Japonês', () => {
    const current = getCurrentBlock(blocks, '19:00');
    expect(current?.role).toBe('learning');
    expect(current?.label).toBe('Japonês');
  });

  it('08:00 (antes da rotina) não cai em nenhum bloco', () => {
    expect(getCurrentBlock(blocks, '08:00')).toBeNull();
  });

  it('próximo bloco depois do primeiro é a Pausa', () => {
    const current = getCurrentBlock(blocks, '09:30');
    const next = getNextBlock(blocks, current);
    expect(next?.id).toBe('break-1');
  });
});

describe('próximo bloco compatível', () => {
  const blocks = getBlocksForDate(MONDAY);

  it('de Projeto principal (09:00) pula Pausa/Almoço e cai no próximo primary', () => {
    const current = getCurrentBlock(blocks, '09:30')!;
    const compatible = findNextCompatibleBlockToday(blocks, current);
    expect(compatible?.id).toBe('primary-2');
  });

  it('do último bloco de Projeto principal (13:00) não pula para Frente secundária', () => {
    const current = getCurrentBlock(blocks, '13:30')!;
    const compatible = findNextCompatibleBlockToday(blocks, current);
    // Não existe outro bloco de deep_work_primary depois das 14:30 hoje.
    expect(compatible).toBeNull();
  });

  it('de Frente secundária (14:30) encontra o segundo bloco de Frente secundária', () => {
    const current = getCurrentBlock(blocks, '15:00')!;
    const compatible = findNextCompatibleBlockToday(blocks, current);
    expect(compatible?.id).toBe('secondary-2');
  });
});

describe('capacidade por papel/dia', () => {
  it('Projeto principal soma os três blocos (1h30 + 1h45 + 1h30 = 4h45)', () => {
    expect(roleCapacityMinutesForDate(MONDAY, 'deep_work_primary')).toBe(90 + 105 + 90);
  });

  it('Frente secundária soma os dois blocos de 1h', () => {
    expect(roleCapacityMinutesForDate(MONDAY, 'deep_work_secondary')).toBe(120);
  });

  it('sábado/domingo têm capacidade zero para qualquer papel', () => {
    expect(roleCapacityMinutesForDate(SATURDAY, 'deep_work_primary')).toBe(0);
  });
});

describe('timezone America/Sao_Paulo', () => {
  it('decompõe um instante UTC em data/hora local correta', () => {
    // 2026-08-10T14:20:00Z = 2026-08-10 11:20 em America/Sao_Paulo (-03:00)
    const { dateStr, time } = localTimeParts(new Date('2026-08-10T14:20:00Z'));
    expect(dateStr).toBe('2026-08-10');
    expect(time).toBe('11:20');
  });
});

describe('tarefas concluídas permanecem visíveis durante o dia', () => {
  const primaryBlock = getBlocksForDate(MONDAY).find((b) => b.id === 'primary-1')!;

  it('tarefa concluída HOJE continua na lista do bloco (não desaparece instantaneamente)', () => {
    const tasks = [
      task({ id: 'a', projectId: 'proj-1', status: 'completed', completedAt: '2026-08-10T13:00:00Z' /* hoje, 10:00 local */ }),
      task({ id: 'b', projectId: 'proj-1', status: 'organized' }),
    ];
    const result = selectTasksForBlock(primaryBlock, tasks, MONDAY, 'proj-1');
    expect(result.map((t) => t.id).sort()).toEqual(['a', 'b']);
  });

  it('tarefa concluída num dia anterior não reaparece', () => {
    const tasks = [
      task({ id: 'a', projectId: 'proj-1', status: 'completed', completedAt: '2026-08-07T13:00:00Z' /* sexta anterior */ }),
      task({ id: 'b', projectId: 'proj-1', status: 'organized' }),
    ];
    const result = selectTasksForBlock(primaryBlock, tasks, MONDAY, 'proj-1');
    expect(result.map((t) => t.id)).toEqual(['b']);
  });

  it('tarefas concluídas ficam depois das ativas na ordenação', () => {
    const tasks = [
      task({ id: 'done', projectId: 'proj-1', status: 'completed', completedAt: '2026-08-10T13:00:00Z', priority: 'critical' }),
      task({ id: 'active', projectId: 'proj-1', status: 'organized', priority: 'low' }),
    ];
    const result = selectTasksForBlock(primaryBlock, tasks, MONDAY, 'proj-1');
    expect(result.map((t) => t.id)).toEqual(['active', 'done']);
  });
});

describe('associação de tarefas ao bloco (Projeto principal)', () => {
  const primaryBlock = getBlocksForDate(MONDAY).find((b) => b.id === 'primary-1')!;

  it('tarefa sem horário do projeto atribuído aparece no bloco atual', () => {
    const tasks = [task({ id: 'a', projectId: 'proj-1' })];
    const result = selectTasksForBlock(primaryBlock, tasks, MONDAY, 'proj-1');
    expect(result.map((t) => t.id)).toEqual(['a']);
  });

  it('tarefa de outro projeto não aparece', () => {
    const tasks = [task({ id: 'a', projectId: 'proj-2' })];
    expect(selectTasksForBlock(primaryBlock, tasks, MONDAY, 'proj-1')).toEqual([]);
  });

  it('tarefa agendada para outro bloco (13:00) não aparece no bloco das 09:00', () => {
    const tasks = [
      task({ id: 'a', projectId: 'proj-1', scheduledAt: '2026-08-10T16:00:00Z' /* 13:00 local */ }),
    ];
    expect(selectTasksForBlock(primaryBlock, tasks, MONDAY, 'proj-1')).toEqual([]);
  });

  it('tarefa agendada dentro da janela do bloco aparece', () => {
    const tasks = [
      task({ id: 'a', projectId: 'proj-1', scheduledAt: '2026-08-10T12:30:00Z' /* 09:30 local */ }),
    ];
    const result = selectTasksForBlock(primaryBlock, tasks, MONDAY, 'proj-1');
    expect(result.map((t) => t.id)).toEqual(['a']);
  });

  it('sem projeto atribuído ao papel, nenhuma tarefa aparece (não inventa trabalho)', () => {
    const tasks = [task({ id: 'a', projectId: 'proj-1' })];
    expect(selectTasksForBlock(primaryBlock, tasks, MONDAY, undefined)).toEqual([]);
  });
});

describe('Buffer nunca é preenchido automaticamente', () => {
  const bufferBlock = getBlocksForDate(MONDAY).find((b) => b.id === 'buffer')!;

  it('tarefa sem horário não aparece no Buffer mesmo com projeto compatível', () => {
    const tasks = [task({ id: 'a', projectId: 'proj-1' })];
    expect(selectTasksForBlock(bufferBlock, tasks, MONDAY, 'proj-1')).toEqual([]);
  });

  it('tarefa explicitamente agendada para a janela do Buffer aparece', () => {
    const tasks = [
      task({ id: 'a', projectId: 'proj-1', scheduledAt: '2026-08-10T20:30:00Z' /* 17:30 local */ }),
    ];
    const result = selectTasksForBlock(bufferBlock, tasks, MONDAY, undefined);
    expect(result.map((t) => t.id)).toEqual(['a']);
  });
});

describe('Pausa e Almoço nunca mostram tarefas genéricas', () => {
  it('Pausa nunca retorna tarefas', () => {
    const breakBlock = getBlocksForDate(MONDAY).find((b) => b.id === 'break-1')!;
    const tasks = [task({ id: 'a', projectId: 'proj-1' })];
    expect(selectTasksForBlock(breakBlock, tasks, MONDAY, 'proj-1')).toEqual([]);
  });

  it('Japonês nunca retorna tarefas genéricas', () => {
    const learningBlock = getBlocksForDate(MONDAY).find((b) => b.id === 'learning')!;
    const tasks = [task({ id: 'a', projectId: 'proj-1' })];
    expect(selectTasksForBlock(learningBlock, tasks, MONDAY, 'proj-1')).toEqual([]);
  });
});

describe('sobrecarga sem alteração automática', () => {
  it('computeLoad sinaliza sobrecarga sem tocar nas tarefas', () => {
    const tasks = [task({ estimatedMinutes: 90 }), task({ estimatedMinutes: 90 })];
    const load = computeLoad(tasks, 120);
    expect(load.plannedMinutes).toBe(180);
    expect(load.overCapacity).toBe(true);
    expect(load.overMinutes).toBe(60);
    // A função apenas relata — não remove nem reordena tarefas.
    expect(tasks).toHaveLength(2);
  });

  it('dentro da capacidade não sinaliza sobrecarga', () => {
    const load = computeLoad([task({ estimatedMinutes: 60 })], 90);
    expect(load.overCapacity).toBe(false);
    expect(load.overMinutes).toBe(0);
  });
});

describe('adiamento e acúmulo de pendências', () => {
  it('agrupa por dia de origem e rotula "ontem"/dia da semana', () => {
    const tasks = [
      task({ id: 'a', scheduledAt: '2026-08-09T12:00:00Z' }), // domingo (não é dia útil, mas pode ter ficado pendente)
      task({ id: 'b', dueAt: '2026-08-07T12:00:00Z' }), // sexta anterior
      task({ id: 'c', scheduledAt: '2026-08-10T12:00:00Z' }), // hoje — não é pendência
      task({ id: 'd', status: 'completed', scheduledAt: '2026-08-05T12:00:00Z' }), // concluída — não é pendência
    ];
    const groups = classifyPendingItems(tasks, MONDAY);
    expect(groups.map((g) => g.originDateStr)).toEqual(['2026-08-07', '2026-08-09']);
    expect(groups[0].label).toBe('sexta');
    expect(groups.find((g) => g.originDateStr === '2026-08-09')?.tasks.map((t) => t.id)).toEqual(['a']);
  });

  it('acumula tarefas adiadas com as já existentes no dia de destino (sem substituir)', () => {
    // Simula: segunda já tem 3 tarefas de 50min cada; chega 1 adiada de sexta (60min).
    const existingMonday = [
      task({ id: '1', scheduledAt: '2026-08-10T12:00:00Z', estimatedMinutes: 50 }),
      task({ id: '2', scheduledAt: '2026-08-10T13:00:00Z', estimatedMinutes: 50 }),
      task({ id: '3', scheduledAt: '2026-08-10T14:00:00Z', estimatedMinutes: 50 }),
    ];
    const deferredFromFriday = task({ id: '4', scheduledAt: '2026-08-10T12:00:00Z', estimatedMinutes: 60 });
    const allMonday = [...existingMonday, deferredFromFriday];

    expect(allMonday).toHaveLength(4);
    const load = computeLoad(allMonday, roleCapacityMinutesForDate(MONDAY, 'deep_work_primary'));
    expect(load.plannedMinutes).toBe(50 * 3 + 60);
  });

  it('originDayLabel usa dd/mm para origens com mais de uma semana', () => {
    expect(originDayLabel('2026-07-20', MONDAY)).toBe('20/07');
  });
});

describe('agendamento ao mover (horário local America/Sao_Paulo)', () => {
  it('blockStartIso converte o início do bloco para o instante UTC correto', () => {
    const primaryBlock = getBlocksForDate(MONDAY).find((b) => b.id === 'primary-1')!;
    // 09:00 em América/São Paulo (-03:00) = 12:00 UTC
    expect(blockStartIso(MONDAY, primaryBlock)).toBe('2026-08-10T12:00:00.000Z');
  });

  it('localDateTimeToIso preserva o horário ao trocar apenas a data', () => {
    expect(localDateTimeToIso('2026-08-17', '09:30')).toBe('2026-08-17T12:30:00.000Z');
  });
});

describe('sobrecarga ao adiar para próximo dia útil (acúmulo, sem alteração automática)', () => {
  it('tasksScheduledOnDate só considera tarefas já comprometidas com aquele dia', () => {
    const tasks = [
      task({ id: '1', projectId: 'proj-1', scheduledAt: localDateTimeToIso('2026-08-17', '09:00') }),
      task({ id: '2', projectId: 'proj-1', scheduledAt: localDateTimeToIso('2026-08-17', '10:45') }),
      task({ id: '3', projectId: 'proj-1' }), // backlog sem horário — não conta
      task({ id: '4', projectId: 'proj-2', scheduledAt: localDateTimeToIso('2026-08-17', '09:00') }), // outro projeto
    ];
    const result = tasksScheduledOnDate(tasks, '2026-08-17', 'proj-1');
    expect(result.map((t) => t.id)).toEqual(['1', '2']);
  });

  it('detecta sobrecarga ao simular o acúmulo de uma tarefa adiada, sem mover as demais', () => {
    const destDate = nextBusinessDayStr(FRIDAY); // segunda
    const existing = [
      task({ id: '1', projectId: 'proj-1', scheduledAt: localDateTimeToIso(destDate, '09:00'), estimatedMinutes: 90 }),
      task({ id: '2', projectId: 'proj-1', scheduledAt: localDateTimeToIso(destDate, '10:45'), estimatedMinutes: 90 }),
    ];
    const deferred = task({ id: '3', projectId: 'proj-1', estimatedMinutes: 90 });

    const alreadyOnDestDay = tasksScheduledOnDate(existing, destDate, 'proj-1');
    const projected = computeLoad(
      [...alreadyOnDestDay, deferred],
      roleCapacityMinutesForDate(destDate, 'deep_work_primary')
    );

    expect(projected.plannedMinutes).toBe(270); // 90+90+90
    expect(projected.capacityMinutes).toBe(90 + 105 + 90); // 4h45 de capacidade
    expect(projected.overCapacity).toBe(false); // ainda cabe
    // As tarefas existentes não foram tocadas pelo cálculo.
    expect(existing).toHaveLength(2);

    const secondDeferral = task({ id: '4', projectId: 'proj-1', estimatedMinutes: 60 });
    const projectedWithSecond = computeLoad(
      [...alreadyOnDestDay, deferred, secondDeferral],
      roleCapacityMinutesForDate(destDate, 'deep_work_primary')
    );
    expect(projectedWithSecond.overCapacity).toBe(true);
    expect(projectedWithSecond.overMinutes).toBe(330 - 285);
  });
});
