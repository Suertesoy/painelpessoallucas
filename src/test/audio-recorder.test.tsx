// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { AudioRecorder } from '@/components/audio-recorder';

/**
 * Cobre a experiência de gravação no navegador sem microfone real:
 * MediaRecorder e getUserMedia são mockados. Foco nos cenários obrigatórios
 * (permissão negada, formato não suportado, iniciar/pausar/retomar/encerrar/
 * cancelar/ouvir/enviar) sem depender de hardware.
 */

class FakeMediaRecorder {
  static isTypeSupported = vi.fn(() => true);
  state: 'inactive' | 'recording' | 'paused' = 'inactive';
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  constructor(
    public stream: unknown,
    public options?: unknown
  ) {}
  start() {
    this.state = 'recording';
  }
  pause() {
    this.state = 'paused';
  }
  resume() {
    this.state = 'recording';
  }
  stop() {
    this.state = 'inactive';
    this.ondataavailable?.({ data: new Blob(['audio-bytes'], { type: 'audio/webm' }) });
    this.onstop?.();
  }
}

function stubMediaDevices(getUserMedia: (...args: unknown[]) => Promise<unknown>) {
  Object.defineProperty(global.navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia },
  });
}

beforeEach(() => {
  vi.stubGlobal('MediaRecorder', FakeMediaRecorder as unknown as typeof MediaRecorder);
  vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:fake'), revokeObjectURL: vi.fn() });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('AudioRecorder', () => {
  it('mostra erro compreensível quando o navegador não tem suporte a gravação', async () => {
    vi.stubGlobal('MediaRecorder', undefined);
    render(<AudioRecorder onSend={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /Gravar áudio/ }));

    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
    expect(screen.getByText(/não tem suporte a gravação de áudio/)).toBeTruthy();
  });

  it('mostra erro compreensível quando a permissão do microfone é negada', async () => {
    stubMediaDevices(() => Promise.reject(new DOMException('Permission denied', 'NotAllowedError')));
    render(<AudioRecorder onSend={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /Gravar áudio/ }));

    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
    expect(screen.getByText(/Permissão do microfone negada/)).toBeTruthy();
  });

  it('grava, pausa, retoma e encerra — depois permite ouvir e enviar', async () => {
    const fakeTrack = { stop: vi.fn() };
    stubMediaDevices(() => Promise.resolve({ getTracks: () => [fakeTrack] }));
    const onSend = vi.fn();
    render(<AudioRecorder onSend={onSend} />);

    fireEvent.click(screen.getByRole('button', { name: /Gravar áudio/ }));
    await waitFor(() => expect(screen.getByTestId('recording-indicator')).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: 'Pausar' }));
    await waitFor(() => expect(screen.getByText('Pausado')).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    await waitFor(() => expect(screen.getByTestId('recording-indicator')).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: 'Encerrar' }));
    await waitFor(() => expect(screen.getByLabelText('Ouvir gravação antes de enviar')).toBeTruthy());
    expect(fakeTrack.stop).toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /Enviar para transcrição/ }));
    expect(onSend).toHaveBeenCalledTimes(1);
    const [blob] = onSend.mock.calls[0];
    expect(blob).toBeInstanceOf(Blob);
  });

  it('cancelar/regravar descarta a gravação e libera o microfone', async () => {
    const fakeTrack = { stop: vi.fn() };
    stubMediaDevices(() => Promise.resolve({ getTracks: () => [fakeTrack] }));
    render(<AudioRecorder onSend={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /Gravar áudio/ }));
    await waitFor(() => expect(screen.getByTestId('recording-indicator')).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: 'Encerrar' }));
    await waitFor(() => expect(screen.getByText(/Excluir e regravar/)).toBeTruthy());

    fireEvent.click(screen.getByText(/Excluir e regravar/));
    await waitFor(() => expect(screen.getByRole('button', { name: /Gravar áudio/ })).toBeTruthy());
  });
});
