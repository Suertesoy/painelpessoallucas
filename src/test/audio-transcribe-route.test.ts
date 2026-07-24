// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { setAudioTranscriberFactory, type AudioTranscriber } from '@/platform/ai/audio-transcriber';
import { getSessionContext } from '@/platform/supabase/session';
import { POST } from '@/app/api/audio/transcribe/route';

/**
 * POST /api/audio/transcribe — sem chamadas reais à OpenAI. O transcritor é
 * substituído pela fábrica injetável (mesmo padrão de plan-structurer).
 *
 * Sem vi.resetModules(): a fábrica injetável só é visível para a rota se
 * ambas apontarem para a mesma instância do módulo — resetar módulos entre
 * testes quebraria esse singleton e forçaria a rota a tentar construir o
 * provider real da OpenAI (que falha sem OPENAI_API_KEY).
 */

vi.mock('server-only', () => ({}));
vi.mock('@/platform/supabase/session', () => ({
  getSessionContext: vi.fn(),
}));

function makeAudioFile(bytes: number, type = 'audio/webm'): File {
  return new File([new Uint8Array(bytes)], 'captura.webm', { type });
}

function formDataWith(file: File | null): FormData {
  const fd = new FormData();
  if (file) fd.set('audio', file);
  return fd;
}

beforeEach(() => {
  setAudioTranscriberFactory(null);
});

afterEach(() => {
  setAudioTranscriberFactory(null);
});

describe('POST /api/audio/transcribe', () => {
  it('rejeita requisição sem sessão (401)', async () => {
    vi.mocked(getSessionContext).mockResolvedValue(null);

    const res = await POST(new Request('http://x/api/audio/transcribe', { method: 'POST', body: formDataWith(makeAudioFile(100)) }));

    expect(res.status).toBe(401);
    expect((await res.json()).errorCategory).toBe('unauthenticated');
  });

  it('rejeita quando o campo audio está ausente', async () => {
    vi.mocked(getSessionContext).mockResolvedValue({
      supabase: {} as never,
      user: { id: 'user-1' } as never,
      workspaceId: 'ws-1',
    });

    const res = await POST(new Request('http://x/api/audio/transcribe', { method: 'POST', body: formDataWith(null) }));

    expect(res.status).toBe(400);
    expect((await res.json()).errorCategory).toBe('invalid_request');
  });

  it('rejeita gravação vazia (0 bytes)', async () => {
    vi.mocked(getSessionContext).mockResolvedValue({
      supabase: {} as never,
      user: { id: 'user-1' } as never,
      workspaceId: 'ws-1',
    });

    const res = await POST(new Request('http://x/api/audio/transcribe', { method: 'POST', body: formDataWith(makeAudioFile(0)) }));

    expect(res.status).toBe(400);
    expect((await res.json()).errorCategory).toBe('empty_file');
  });

  it('rejeita arquivo maior que o limite de 25MB', async () => {
    vi.mocked(getSessionContext).mockResolvedValue({
      supabase: {} as never,
      user: { id: 'user-1' } as never,
      workspaceId: 'ws-1',
    });

    const res = await POST(
      new Request('http://x/api/audio/transcribe', { method: 'POST', body: formDataWith(makeAudioFile(26 * 1024 * 1024)) })
    );

    expect(res.status).toBe(413);
    expect((await res.json()).errorCategory).toBe('file_too_large');
  });

  it('rejeita formato que não é áudio', async () => {
    vi.mocked(getSessionContext).mockResolvedValue({
      supabase: {} as never,
      user: { id: 'user-1' } as never,
      workspaceId: 'ws-1',
    });

    const res = await POST(
      new Request('http://x/api/audio/transcribe', {
        method: 'POST',
        body: formDataWith(makeAudioFile(100, 'image/png')),
      })
    );

    expect(res.status).toBe(415);
    expect((await res.json()).errorCategory).toBe('invalid_format');
  });

  it('transcreve com sucesso usando o transcritor mockado e devolve o texto em português', async () => {
    vi.mocked(getSessionContext).mockResolvedValue({
      supabase: {} as never,
      user: { id: 'user-1' } as never,
      workspaceId: 'ws-1',
    });

    const mockTranscriber: AudioTranscriber = {
      transcribe: async () => ({ text: 'Preciso ligar para o cliente amanhã.', model: 'whisper-1' }),
    };
    setAudioTranscriberFactory(() => mockTranscriber);

    const res = await POST(new Request('http://x/api/audio/transcribe', { method: 'POST', body: formDataWith(makeAudioFile(1000)) }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.transcript).toBe('Preciso ligar para o cliente amanhã.');
  });

  it('categoriza falha de transcrição sem vazar áudio/transcrição no erro', async () => {
    vi.mocked(getSessionContext).mockResolvedValue({
      supabase: {} as never,
      user: { id: 'user-1' } as never,
      workspaceId: 'ws-1',
    });

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    setAudioTranscriberFactory(() => ({
      transcribe: async () => {
        throw new Error('timeout upstream da OpenAI');
      },
    }));

    const res = await POST(new Request('http://x/api/audio/transcribe', { method: 'POST', body: formDataWith(makeAudioFile(1000)) }));
    const body = await res.json();

    expect(res.status).toBe(502);
    expect(body.errorCategory).toBe('transcription_failed');
    expect(JSON.stringify(body)).not.toContain('timeout upstream');
    consoleSpy.mockRestore();
  });

  it('aplica limite de taxa por usuário (429 após muitas transcrições na mesma janela)', async () => {
    vi.mocked(getSessionContext).mockResolvedValue({
      supabase: {} as never,
      user: { id: 'rate-limit-user' } as never,
      workspaceId: 'ws-1',
    });
    setAudioTranscriberFactory(() => ({ transcribe: async () => ({ text: 'ok', model: 'whisper-1' }) }));

    let lastStatus = 200;
    for (let i = 0; i < 31; i++) {
      const res = await POST(
        new Request('http://x/api/audio/transcribe', { method: 'POST', body: formDataWith(makeAudioFile(100)) })
      );
      lastStatus = res.status;
    }
    expect(lastStatus).toBe(429);
  });
});
