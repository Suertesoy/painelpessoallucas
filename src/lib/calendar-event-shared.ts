/**
 * Regras puras (sem I/O) da criação de eventos de calendário a partir de uma
 * captura — compartilhadas entre a validação no cliente (feedback imediato,
 * antes de qualquer requisição) e a validação no servidor (garantia real,
 * porque o cliente nunca é confiável sozinho). Mesma lógica dos dois lados,
 * uma única fonte de verdade.
 */

export const DEFAULT_EVENT_DURATION_MINUTES = 60;

export const INVALID_INTERVAL_MESSAGE = 'Não dá para terminar antes de começar.';
export const MISSING_INTERVAL_MESSAGE = 'Informe data e horário de início e fim antes de criar o evento.';
export const INVALID_DATETIME_MESSAGE = 'Data ou horário inválidos.';

export interface IntervalValidation {
  valid: boolean;
  message?: string;
}

/** Único ponto de verdade para "o término precisa ser posterior ao início". */
export function validateEventInterval(
  startIso: string | undefined | null,
  endIso: string | undefined | null
): IntervalValidation {
  if (!startIso || !endIso) {
    return { valid: false, message: MISSING_INTERVAL_MESSAGE };
  }
  const start = new Date(startIso).getTime();
  const end = new Date(endIso).getTime();
  if (Number.isNaN(start) || Number.isNaN(end)) {
    return { valid: false, message: INVALID_DATETIME_MESSAGE };
  }
  if (end <= start) {
    return { valid: false, message: INVALID_INTERVAL_MESSAGE };
  }
  return { valid: true };
}

export function addMinutesIso(iso: string, minutes: number): string {
  return new Date(new Date(iso).getTime() + minutes * 60000).toISOString();
}

export function diffMinutes(startIso: string, endIso: string): number {
  return Math.round((new Date(endIso).getTime() - new Date(startIso).getTime()) / 60000);
}

export type EventModality = 'in_person' | 'online' | 'undetermined';

export const DEFAULT_REMINDER_MINUTES = [1440, 60] as const;

export const REMINDER_LABELS: Record<number, string> = {
  1440: '1 dia antes',
  60: '1 hora antes',
};

export interface ReminderComputation {
  /** Lembretes cujo disparo ainda está no futuro — só esses vão para o Google. */
  minutes: number[];
  /** Aviso amigável quando algum lembrete solicitado já teria disparado no passado. */
  notice: string | null;
}

/**
 * Remove lembretes cujo horário de disparo (início - minutos) já passou. Um
 * evento marcado para daqui a poucas horas não é erro — só significa que
 * nem todo aviso prévio ainda cabe.
 */
export function computeActiveReminders(
  startIso: string,
  requestedMinutes: number[],
  nowIso: string = new Date().toISOString()
): ReminderComputation {
  const start = new Date(startIso).getTime();
  const now = new Date(nowIso).getTime();
  const requested = [...new Set(requestedMinutes)].sort((a, b) => b - a);

  const active = requested.filter((m) => start - m * 60000 > now);
  const expired = requested.filter((m) => start - m * 60000 <= now);

  let notice: string | null = null;
  if (expired.length > 0) {
    if (active.includes(60)) {
      notice = 'O horário do primeiro aviso já passou. O aviso de uma hora continua ativo.';
    } else if (active.length === 0) {
      notice = 'Os avisos prévios já passaram — o evento será criado sem lembretes.';
    } else {
      notice = 'Um dos avisos prévios já passou e foi removido.';
    }
  }

  return { minutes: active, notice };
}

/** Aceita Meet/Teams/Zoom/qualquer link — só exige HTTPS válido, sem allowlist de domínio. */
export function isValidMeetingLink(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  try {
    return new URL(trimmed).protocol === 'https:';
  } catch {
    return false;
  }
}
