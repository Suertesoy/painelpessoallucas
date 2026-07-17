import { describe, it, expect } from 'vitest';
import { todayDateStr, dateInputToISO, isoToDateInput } from '@/lib/dates';

describe('Utilitários de data (fuso local)', () => {
  it('todayDateStr retorna o dia LOCAL, não o dia UTC', () => {
    const now = new Date();
    const expected = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    expect(todayDateStr()).toBe(expected);
  });

  it('dateInputToISO interpreta o input como meia-noite local (round-trip estável)', () => {
    const iso = dateInputToISO('2026-07-16');
    expect(iso).toBeDefined();
    // O round-trip deve devolver o MESMO dia que o usuário digitou,
    // independentemente do fuso horário da máquina.
    expect(isoToDateInput(iso)).toBe('2026-07-16');
  });

  it('dateInputToISO retorna undefined para valor vazio', () => {
    expect(dateInputToISO('')).toBeUndefined();
  });

  it('isoToDateInput retorna string vazia para undefined', () => {
    expect(isoToDateInput(undefined)).toBe('');
  });
});
