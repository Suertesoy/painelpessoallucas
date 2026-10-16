/**
 * Interpretação das células da planilha "Treino Marcio Seco 2.xlsx".
 *
 * Princípio: só converte o que é inequívoco. Qualquer célula que admita mais
 * de uma leitura (unidade ausente, "20x20", duração no lugar de séries×reps…)
 * volta como `ambiguous` com o texto original preservado — o importador NÃO
 * a transforma em dado definitivo; ela chega ao app sinalizada para
 * confirmação do usuário.
 */

export interface ParsedSetsReps {
  sets: number;
  repsMin?: number;
  repsMax?: number;
  repsNote?: string;
  ambiguous: boolean;
  raw: string;
}

/** "3x10-12", "2x15", "3x10-12 (cada perna)". Duração ("10min") é ambígua. */
export function parseSetsReps(raw: string): ParsedSetsReps | null {
  const text = raw.trim();
  if (!text) return null;
  const m = text.match(/^(\d+)\s*[xX×]\s*(\d+)(?:\s*-\s*(\d+))?\s*(.*)$/);
  if (m) {
    const repsMin = Number(m[2]);
    const repsMax = m[3] ? Number(m[3]) : repsMin;
    const note = m[4]?.trim().replace(/^\((.*)\)$/, '$1').trim();
    return { sets: Number(m[1]), repsMin, repsMax, repsNote: note || undefined, ambiguous: false, raw: text };
  }
  // "10min": é um tempo, não séries×reps — não vira número de séries.
  if (/^\d+\s*min/i.test(text)) {
    return { sets: 1, repsNote: text, ambiguous: true, raw: text };
  }
  return null;
}

export interface ParsedRest {
  /** Segundos usados no cronômetro (limite superior de faixas); ausente se ambíguo. */
  seconds?: number;
  /** Texto original, para exibir ao lado do valor convertido. */
  note: string;
  ambiguous: boolean;
}

/**
 * Descanso. Regras:
 * - "3min", "2 min", "2 mim" (erro de digitação), "2-3min" → minutos.
 * - "90", "45-60", "60-90 seg" → segundos.
 * - número solto pequeno (< 20), como "2", NÃO tem unidade confiável → ambíguo.
 * - faixas usam o limite SUPERIOR (descansar o prescrito, nunca menos).
 */
export function parseRest(raw: string): ParsedRest | null {
  const text = raw.trim();
  if (!text) return null;
  const m = text.match(/^(\d+)(?:\s*-\s*(\d+))?\s*(seg|s|min|mim|m)?\.?$/i);
  if (!m) return { note: text, ambiguous: true };
  const upper = Number(m[2] ?? m[1]);
  const unit = m[3]?.toLowerCase();
  if (!unit) {
    if (upper < 20) return { note: text, ambiguous: true };
    return { seconds: upper, note: text, ambiguous: false };
  }
  if (unit === 'min' || unit === 'mim' || unit === 'm') return { seconds: upper * 60, note: text, ambiguous: false };
  return { seconds: upper, note: text, ambiguous: false };
}

export interface ParsedLoad {
  loadKg?: number;
  /** Texto original quando não é um número simples. */
  note?: string;
  ambiguous: boolean;
}

/** Carga em kg. Vazio = sem carga; "20x20" e afins são ambíguos. */
export function parseLoad(raw: string | undefined): ParsedLoad | null {
  const text = (raw ?? '').trim();
  if (!text) return null;
  if (/^\d+(?:[.,]\d+)?$/.test(text)) return { loadKg: Number(text.replace(',', '.')), ambiguous: false };
  return { note: text, ambiguous: true };
}
