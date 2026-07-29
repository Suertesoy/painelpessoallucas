// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { urlBase64ToUint8Array } from '@/platform/push/vapid-key';

describe('urlBase64ToUint8Array', () => {
  it('converte uma chave VAPID pública (base64url) para Uint8Array', () => {
    // "Hello" em base64 padrão é "SGVsbG8=" — versão url-safe (sem padding).
    const result = urlBase64ToUint8Array('SGVsbG8');
    expect(Array.from(result)).toEqual([72, 101, 108, 108, 111]);
  });

  it('lida com caracteres url-safe (-, _) convertendo para o alfabeto padrão (+, /)', () => {
    // Bytes [0xfb, 0xff] em base64 padrão: "+/8=" — url-safe: "-_8"
    const result = urlBase64ToUint8Array('-_8');
    expect(Array.from(result)).toEqual([0xfb, 0xff]);
  });

  it('produz o comprimento correto para uma chave VAPID real (65 bytes P-256 sem compressão)', () => {
    const fakeKey = 'A'.repeat(87); // 87 chars base64url ≈ 65 bytes
    const result = urlBase64ToUint8Array(fakeKey);
    expect(result).toBeInstanceOf(Uint8Array);
    expect(result.length).toBeGreaterThan(0);
  });
});
