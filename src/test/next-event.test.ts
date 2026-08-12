import { describe, it, expect } from 'vitest';
import { selectNextEvent } from '@/lib/next-event';

const NOW = '2026-08-10T14:00:00Z'; // 11:00 local

describe('próximo evento', () => {
  it('escolhe o evento com título mais próximo no futuro', () => {
    const result = selectNextEvent(
      [
        { id: 'e1', summary: 'Reunião com Helóra', start: '2026-08-10T17:00:00Z' },
        { id: 'e2', summary: 'Follow-up', start: '2026-08-10T20:00:00Z' },
      ],
      [],
      NOW
    );
    expect(result).toEqual({
      id: 'e1',
      label: 'Reunião com Helóra',
      hasTitle: true,
      startIso: '2026-08-10T17:00:00Z',
    });
  });

  it('ignora eventos/blocos passados', () => {
    const result = selectNextEvent(
      [{ id: 'e1', summary: 'Já passou', start: '2026-08-10T10:00:00Z' }],
      [{ start: '2026-08-10T09:00:00Z', end: '2026-08-10T10:00:00Z' }],
      NOW
    );
    expect(result).toBeNull();
  });

  it('busy block sem título aparece como "Compromisso" quando é o mais próximo', () => {
    const result = selectNextEvent(
      [{ id: 'e1', summary: 'Depois', start: '2026-08-10T20:00:00Z' }],
      [{ start: '2026-08-10T18:00:00Z', end: '2026-08-10T19:00:00Z' }],
      NOW
    );
    expect(result).toEqual({
      id: 'busy-2026-08-10T18:00:00Z',
      label: 'Compromisso',
      hasTitle: false,
      startIso: '2026-08-10T18:00:00Z',
    });
  });

  it('estado vazio: sem eventos nem busy blocks futuros', () => {
    expect(selectNextEvent([], [], NOW)).toBeNull();
  });
});
