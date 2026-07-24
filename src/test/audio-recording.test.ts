import { describe, it, expect } from 'vitest';
import {
  getSupportedAudioMimeType,
  isAudioRecordingSupported,
  fileExtensionForMimeType,
  formatRecordingDuration,
  MAX_RECORDING_SECONDS,
} from '@/lib/audio-recording';

describe('getSupportedAudioMimeType', () => {
  it('retorna o primeiro candidato suportado, na ordem de preferência', () => {
    const supported = new Set(['audio/mp4', 'audio/aac']);
    const type = getSupportedAudioMimeType((t) => supported.has(t));
    expect(type).toBe('audio/mp4');
  });

  it('não presume webm/opus universal — Safari/iOS só reporta mp4/aac', () => {
    const type = getSupportedAudioMimeType((t) => t === 'audio/aac');
    expect(type).toBe('audio/aac');
  });

  it('retorna undefined quando nenhum candidato é suportado', () => {
    const type = getSupportedAudioMimeType(() => false);
    expect(type).toBeUndefined();
  });

  it('trata isTypeSupported que lança como não suportado, sem quebrar a detecção', () => {
    const type = getSupportedAudioMimeType((t) => {
      if (t === 'audio/webm;codecs=opus') throw new Error('boom');
      return t === 'audio/webm';
    });
    expect(type).toBe('audio/webm');
  });
});

describe('isAudioRecordingSupported', () => {
  it('false em ambiente sem navigator.mediaDevices/MediaRecorder (Node/SSR)', () => {
    expect(isAudioRecordingSupported()).toBe(false);
  });
});

describe('fileExtensionForMimeType', () => {
  it('mapeia webm, mp4 (Safari), aac e ogg para extensões plausíveis', () => {
    expect(fileExtensionForMimeType('audio/webm;codecs=opus')).toBe('webm');
    expect(fileExtensionForMimeType('audio/mp4')).toBe('m4a');
    expect(fileExtensionForMimeType('audio/aac')).toBe('aac');
    expect(fileExtensionForMimeType('audio/ogg;codecs=opus')).toBe('ogg');
  });

  it('usa fallback genérico para formato desconhecido', () => {
    expect(fileExtensionForMimeType('application/octet-stream')).toBe('bin');
  });
});

describe('formatRecordingDuration', () => {
  it('formata segundos como m:ss', () => {
    expect(formatRecordingDuration(0)).toBe('0:00');
    expect(formatRecordingDuration(5)).toBe('0:05');
    expect(formatRecordingDuration(65)).toBe('1:05');
    expect(formatRecordingDuration(MAX_RECORDING_SECONDS)).toBe('5:00');
  });
});
