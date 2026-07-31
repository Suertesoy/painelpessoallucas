// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
  normalizePhoneDigits,
  isValidWhatsAppNumber,
  buildWhatsAppShareText,
  buildWhatsAppShareUrl,
} from '@/modules/shopping/domain/whatsapp-share';

describe('normalizePhoneDigits', () => {
  it('remove espaços, parênteses, hífen e o "+"', () => {
    expect(normalizePhoneDigits('+55 48 98816-5106')).toBe('5548988165106');
    expect(normalizePhoneDigits('(48) 98816-5106')).toBe('48988165106');
  });
});

describe('isValidWhatsAppNumber', () => {
  it('aceita o número do Matheus (código do país + DDD + linha)', () => {
    expect(isValidWhatsAppNumber('+55 48 98816-5106')).toBe(true);
  });

  it('rejeita número claramente incompleto (sem código do país/DDD)', () => {
    expect(isValidWhatsAppNumber('98816')).toBe(false);
    expect(isValidWhatsAppNumber('123456789')).toBe(false);
  });

  it('rejeita string vazia ou só símbolos', () => {
    expect(isValidWhatsAppNumber('')).toBe(false);
    expect(isValidWhatsAppNumber('+()-')).toBe(false);
  });

  it('rejeita número maior que o limite do E.164 (15 dígitos)', () => {
    expect(isValidWhatsAppNumber('1'.repeat(16))).toBe(false);
  });
});

describe('buildWhatsAppShareText', () => {
  it('inclui o nome da lista, uma linha por item e o marcador ☐', () => {
    const text = buildWhatsAppShareText('Mercado', ['Leite', 'Pão', 'Café']);
    expect(text).toContain('Mercado');
    expect(text).toContain('☐ Leite');
    expect(text).toContain('☐ Pão');
    expect(text).toContain('☐ Café');
  });

  it('não inclui nenhuma linha de item quando não há pendentes', () => {
    const text = buildWhatsAppShareText('Internet', []);
    expect(text).not.toContain('☐');
    expect(text).toContain('Internet');
  });
});

describe('buildWhatsAppShareUrl', () => {
  it('usa somente o domínio oficial https://wa.me/', () => {
    const url = buildWhatsAppShareUrl('+55 48 98816-5106', 'texto');
    expect(url.startsWith('https://wa.me/5548988165106?text=')).toBe(true);
  });

  it('normaliza o telefone formatado para dígitos na URL', () => {
    const url = buildWhatsAppShareUrl('(48) 98816-5106'.padStart(0), 'x');
    expect(url).toContain('wa.me/48988165106');
  });

  it('codifica corretamente o texto compartilhado (espaços, quebras de linha, acentos, ☐)', () => {
    const text = buildWhatsAppShareText('Mercado', ['Café ☕']);
    const url = buildWhatsAppShareUrl('+5548988165106', text);
    const queryText = url.split('?text=')[1];
    expect(decodeURIComponent(queryText)).toBe(text);
    expect(queryText).not.toContain(' ');
    expect(queryText).not.toContain('\n');
  });
});
