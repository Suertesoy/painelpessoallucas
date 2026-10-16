'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * Voz japonesa do navegador (Web Speech API). Sem custo e sem rede, mas a
 * qualidade depende do aparelho: no iPhone costuma existir a voz "Kyoko"
 * (ja-JP) e só fala após um toque do usuário; em alguns navegadores não há
 * voz japonesa instalada. Kana isolado pode ser lido de forma estranha por
 * sintetizadores — palavras funcionam melhor. Por isso `available` é
 * exposto e a interface sempre funciona sem som.
 */
function pickJapaneseVoice(): SpeechSynthesisVoice | null {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return null;
  const voices = window.speechSynthesis.getVoices();
  return voices.find((v) => v.lang.toLowerCase().replace('_', '-').startsWith('ja')) ?? null;
}

export function useJapaneseSpeech(): { available: boolean; speak: (text: string, slow?: boolean) => void } {
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    const update = () => setAvailable(pickJapaneseVoice() !== null);
    update();
    window.speechSynthesis.addEventListener?.('voiceschanged', update);
    return () => window.speechSynthesis.removeEventListener?.('voiceschanged', update);
  }, []);

  const speak = useCallback((text: string, slow = true) => {
    const voice = pickJapaneseVoice();
    if (!voice || typeof window === 'undefined') return;
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.voice = voice;
    utter.lang = voice.lang;
    utter.rate = slow ? 0.8 : 1;
    window.speechSynthesis.speak(utter);
  }, []);

  return { available, speak };
}
