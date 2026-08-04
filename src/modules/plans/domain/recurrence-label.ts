/**
 * Rótulo humano de uma RecurrenceRule ("atividade + frequência + horário"
 * como uma unidade compreensível), usado nas telas de revisão e detalhe do
 * plano para que uma rotina apareça como UMA atividade recorrente, nunca
 * como duas informações soltas (título da ação + regra técnica) que o
 * usuário precisa relacionar mentalmente.
 *
 * Puro, sem I/O — mesmo padrão de recurrence-engine.ts.
 */

const WEEKDAY_LONG = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
const WEEKDAYS_MON_FRI = [1, 2, 3, 4, 5];
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

export interface RecurrenceLabelInput {
  frequency: string;
  daysOfWeek?: number[] | null;
  dayOfMonth?: number | null;
  localTime?: string | null;
}

function sameDaySet(days: number[], candidate: number[]): boolean {
  if (days.length !== candidate.length) return false;
  const sorted = [...days].sort();
  return candidate.every((d, i) => sorted[i] === d);
}

/** Junta nomes de dia em português: "a", "a e b", "a, b e c". */
function joinDayNames(names: string[]): string {
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} e ${names[1]}`;
  return `${names.slice(0, -1).join(', ')} e ${names.at(-1)}`;
}

function daysOfWeekPhrase(daysOfWeek: number[]): string {
  const sorted = [...daysOfWeek].sort();
  if (sameDaySet(sorted, ALL_DAYS)) return 'Todos os dias';
  if (sameDaySet(sorted, WEEKDAYS_MON_FRI)) return 'De segunda a sexta';
  const names = sorted.map((d) => WEEKDAY_LONG[d]);
  return `Toda ${joinDayNames(names)}`;
}

function timeSuffix(localTime?: string | null): string {
  return localTime ? `, às ${localTime.slice(0, 5)}` : '';
}

const FREQUENCY_FALLBACK: Record<string, string> = {
  monthly: 'Mensal',
  once: 'Uma vez',
  relative_to_plan_start: 'Relativa ao início do plano',
  relative_to_phase_start: 'Relativa ao início da fase',
  relative_to_event: 'Relativa a um evento',
};

/**
 * Formata "atividade + frequência + horário" como um único texto legível,
 * ex.: "De segunda a sexta, às 18:00", "Toda terça e quinta, às 16:30".
 */
export function formatRecurrenceRuleLabel(rule: RecurrenceLabelInput): string {
  const time = timeSuffix(rule.localTime);

  if (rule.frequency === 'daily') {
    if (rule.daysOfWeek && rule.daysOfWeek.length > 0) {
      return `${daysOfWeekPhrase(rule.daysOfWeek)}${time}`;
    }
    return `Todos os dias${time}`;
  }

  if (rule.frequency === 'weekly') {
    if (rule.daysOfWeek && rule.daysOfWeek.length > 0) {
      return `${daysOfWeekPhrase(rule.daysOfWeek)}${time}`;
    }
    return `Semanalmente${time}`;
  }

  if (rule.frequency === 'monthly') {
    if (rule.dayOfMonth) {
      return `Todo dia ${rule.dayOfMonth} do mês${time}`;
    }
    return `Mensalmente${time}`;
  }

  return `${FREQUENCY_FALLBACK[rule.frequency] ?? rule.frequency}${time}`;
}
