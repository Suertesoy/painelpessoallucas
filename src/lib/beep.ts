/**
 * Aviso sonoro sem arquivo de áudio (WebAudio). No iPhone o áudio só toca
 * depois de um gesto do usuário: `unlockAudio()` deve ser chamado dentro de
 * um clique/toque (ex.: "Concluir série"), e `playBeep()` pode tocar depois,
 * enquanto o app estiver aberto em primeiro plano.
 */
let ctx: AudioContext | null = null;

function getContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (ctx) return ctx;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  try {
    ctx = new Ctor();
  } catch {
    ctx = null;
  }
  return ctx;
}

export function unlockAudio(): void {
  const c = getContext();
  if (c && c.state === 'suspended') void c.resume().catch(() => {});
}

export function playBeep(times = 3): void {
  const c = getContext();
  if (!c) return;
  void c.resume().catch(() => {});
  for (let i = 0; i < times; i++) {
    const start = c.currentTime + i * 0.28;
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = 'sine';
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.35, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.2);
    osc.connect(gain).connect(c.destination);
    osc.start(start);
    osc.stop(start + 0.22);
  }
  try {
    navigator.vibrate?.([200, 100, 200]);
  } catch {
    /* vibração não suportada (iOS) */
  }
}
