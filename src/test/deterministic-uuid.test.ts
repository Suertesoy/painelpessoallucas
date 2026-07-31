// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { deterministicUuid } from '@/lib/deterministic-uuid';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('deterministicUuid', () => {
  it('produz um UUID bem formado (versão e variante válidas)', async () => {
    const id = await deterministicUuid('ai-run-1:0');
    expect(id).toMatch(UUID_RE);
  });

  it('é determinístico: a mesma seed sempre produz o mesmo id', async () => {
    const a = await deterministicUuid('ai-run-1:0');
    const b = await deterministicUuid('ai-run-1:0');
    expect(a).toBe(b);
  });

  it('seeds diferentes produzem ids diferentes', async () => {
    const a = await deterministicUuid('ai-run-1:0');
    const b = await deterministicUuid('ai-run-1:1');
    const c = await deterministicUuid('ai-run-2:0');
    expect(a).not.toBe(b);
    expect(a).not.toBe(c);
  });
});
