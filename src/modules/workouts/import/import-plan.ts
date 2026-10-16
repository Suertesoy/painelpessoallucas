import { SHEET_DAYS, SHEET_NAME, type SheetDay, type SheetRow } from './sheet-seed';
import { parseLoad, parseRest, parseSetsReps } from './sheet-parser';

export type AthleteKey = 'matheus' | 'lucas';

export interface PlannedLoad {
  loadKg?: number;
  loadNote?: string;
}

export interface PlannedExercise {
  dayCode: SheetDay['code'];
  position: number;
  name: string;
  sets: number;
  repsMin?: number;
  repsMax?: number;
  repsNote?: string;
  restSeconds?: number;
  restNote?: string;
  /** true = há valor ambíguo/não confirmado; o usuário precisa revisar. */
  needsReview: boolean;
  sourceNote: string;
  /** Motivos legíveis do alerta (exibidos na pré-visualização). */
  flags: string[];
  loads: Partial<Record<AthleteKey, PlannedLoad>>;
  /** Cargas lidas da planilha SEM rótulo de pessoa (dia D): só sugestão, nunca gravadas sozinhas. */
  suggestedLoads?: Partial<Record<AthleteKey, PlannedLoad>>;
  /** Campos que o pré-visualizador deixa o usuário corrigir antes de importar. */
  editable: { rest: boolean; loads: boolean };
}

/** Correções feitas no pré-visualizador, por "DIA:nome". */
export interface PlanOverride {
  restSeconds?: number;
  matheusKg?: number;
  lucasKg?: number;
}
export const planKey = (p: Pick<PlannedExercise, "dayCode" | "name">) => `${p.dayCode}:${p.name}`;

function planRow(day: SheetDay, row: SheetRow, position: number): PlannedExercise {
  const flags: string[] = [];
  const planned: PlannedExercise = {
    dayCode: day.code,
    position,
    name: row.name.trim(),
    sets: 1,
    needsReview: false,
    sourceNote: `Planilha ${SHEET_NAME} — treino ${day.code}`,
    flags,
    loads: {},
    editable: { rest: false, loads: false },
  };

  const sr = parseSetsReps(row.setsReps);
  if (!sr) {
    flags.push(`Séries/repetições não reconhecidas ("${row.setsReps}")`);
  } else {
    planned.sets = sr.sets;
    planned.repsMin = sr.repsMin;
    planned.repsMax = sr.repsMax;
    planned.repsNote = sr.repsNote;
    // "10min" é um exercício por duração: mantido como está, sem alerta.
    if (sr.ambiguous) planned.repsNote = `${sr.raw} (por duração)`;
  }

  const rest = parseRest(row.rest);
  if (rest) {
    planned.restNote = rest.note;
    if (rest.seconds != null) planned.restSeconds = rest.seconds;
    if (rest.ambiguous) {
      flags.push(`Descanso "${rest.note}" sem unidade clara (segundos ou minutos?)`);
      planned.editable.rest = true;
    }
  }
  // O marcador "X" da planilha é ignorado de propósito: não significa nada para o app.

  const loadsByAthlete: Array<[AthleteKey, string | undefined]> = [
    ['matheus', row.mat],
    ['lucas', row.lu],
  ];
  const rawLoads = loadsByAthlete.map(([key, raw]) => `${key === 'matheus' ? 'Mat' : 'Lu'} ${raw?.trim() || '—'}`).join(' · ');

  if (!day.loadsLabeled) {
    // As colunas de carga do dia não têm cabeçalho Mat/Lu: não atribui a ninguém.
    if (row.mat?.trim() || row.lu?.trim()) {
      flags.push(`Cargas sem cabeçalho Mat/Lu nesta aba (${rawLoads.replace('Mat', '1ª coluna').replace('Lu', '2ª coluna')})`);
      planned.sourceNote += `. Cargas na planilha, sem rótulo de pessoa: 1ª coluna ${row.mat?.trim() || '—'}, 2ª coluna ${row.lu?.trim() || '—'}.`;
      planned.editable.loads = true;
      const sMat = parseLoad(row.mat);
      const sLu = parseLoad(row.lu);
      planned.suggestedLoads = {};
      if (sMat?.loadKg != null) planned.suggestedLoads.matheus = { loadKg: sMat.loadKg };
      if (sLu?.loadKg != null) planned.suggestedLoads.lucas = { loadKg: sLu.loadKg };
    }
  } else {
    for (const [key, raw] of loadsByAthlete) {
      const load = parseLoad(raw);
      if (!load) continue;
      if (load.ambiguous) {
        planned.loads[key] = { loadNote: load.note };
        flags.push(`Carga "${load.note}" (${key === 'matheus' ? 'Matheus' : 'Lucas'}) não é um número simples`);
        planned.editable.loads = true;
      } else {
        planned.loads[key] = { loadKg: load.loadKg };
      }
    }
  }

  planned.needsReview = flags.length > 0;
  if (planned.needsReview) planned.sourceNote += `. A confirmar: ${flags.join('; ')}.`;
  return planned;
}

/** Plano de importação: o que será criado e o que precisa de confirmação. */
export function buildImportPlan(days: SheetDay[] = SHEET_DAYS): PlannedExercise[] {
  return days.flatMap((day) => day.rows.map((row, index) => planRow(day, row, index)));
}

export function summarizePlan(plan: PlannedExercise[]): { total: number; needsReview: number } {
  return { total: plan.length, needsReview: plan.filter((p) => p.needsReview).length };
}
