/**
 * Conteúdo das notificações push — puro (sem I/O), para ser testável sem
 * mockar Supabase/web-push. Nunca inclui transcrição, resposta de IA,
 * mensagem técnica de erro ou qualquer segredo: no máximo o título de uma
 * tarefa, e só quando o dispositivo autorizou "Mostrar detalhes".
 */

export type PushCategory = 'task_reminder' | 'daily_planning' | 'weekly_review' | 'capture_failure';

const GENERIC_TITLE = 'Painel Lucas';
const MAX_DETAIL_LENGTH = 140;

export interface NotificationContent {
  title: string;
  body: string;
}

export interface BuildContentInput {
  category: PushCategory;
  /** Preferência do dispositivo que vai receber a entrega (não do workspace). */
  showDetails: boolean;
  /** Só usado por task_reminder quando showDetails=true. */
  itemTitle?: string;
}

/** Conteúdo genérico — usado sempre que "Mostrar detalhes" estiver desativado. */
function genericContentFor(category: PushCategory): NotificationContent {
  switch (category) {
    case 'task_reminder':
      return { title: GENERIC_TITLE, body: 'Você tem um lembrete para revisar.' };
    case 'daily_planning':
      return { title: 'Organize seu dia', body: 'Abra o Painel Lucas e escolha seus focos de hoje.' };
    case 'weekly_review':
      return { title: 'Hora da revisão semanal', body: 'Revise o que avançou e prepare a próxima semana.' };
    case 'capture_failure':
      return {
        title: 'Uma captura precisa de atenção',
        body: 'Não foi possível organizar uma captura. O conteúdo original está preservado.',
      };
  }
}

export function buildNotificationContent(input: BuildContentInput): NotificationContent {
  const generic = genericContentFor(input.category);

  // Detalhe pessoal só existe para lembrete de tarefa (título da tarefa) — as
  // demais categorias já são genéricas por natureza (nenhum dado pessoal a
  // esconder ou revelar).
  if (input.category === 'task_reminder' && input.showDetails && input.itemTitle?.trim()) {
    return {
      title: 'Lembrete',
      body: input.itemTitle.trim().slice(0, MAX_DETAIL_LENGTH),
    };
  }

  return generic;
}

/** Destino interno (mesma origem) para o clique da notificação. */
export function targetUrlForCategory(category: PushCategory, itemId?: string): string {
  switch (category) {
    case 'task_reminder':
    case 'capture_failure':
      return itemId ? `/entrada?item=${itemId}` : '/entrada';
    case 'daily_planning':
      return '/hoje';
    case 'weekly_review':
      return '/revisao';
  }
}
