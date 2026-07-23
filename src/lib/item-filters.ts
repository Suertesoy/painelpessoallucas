import type { Item } from '@/modules/items/domain/item.schema';

/**
 * Regra de Hoje → Próximas Ações: tarefas (type === 'task') que ainda não
 * foram concluídas nem arquivadas. Itens sem natureza de ação (ideia,
 * insight, decisão, referência, nota, lembrete) nunca aparecem aqui,
 * independentemente de terem prazo, agendamento ou próxima ação definidos.
 *
 * Concluídos e arquivados saem da lista assim que o status muda — não há
 * exclusão separada por "excluído" porque itens com deleted_at já são
 * filtrados na consulta remota (nunca chegam a este ponto).
 */
export function selectActiveTasks(items: Item[]): Item[] {
  return items.filter((i) => i.type === 'task' && i.status !== 'completed' && i.status !== 'archived');
}
