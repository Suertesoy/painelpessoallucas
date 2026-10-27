'use client';

import type { RestAlertScheduler } from '@/modules/workouts/application/workout.commands';

const RETRY_DELAY_MS = 1500;

async function post(sessionId: string): Promise<Response> {
  return fetch('/api/workouts/rest-schedule', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId }),
    // Deixa a requisição terminar mesmo se a tela for bloqueada logo após o toque.
    keepalive: true,
  });
}

/**
 * Pede ao servidor para agendar o aviso do descanso que ACABOU de ser gravado.
 * Best-effort: nunca lança nem bloqueia o treino — o cronômetro da tela segue
 * funcionando sem push. Uma nova tentativa para falha de rede/5xx; repetir é
 * seguro porque o servidor deduplica pela geração do descanso.
 */
export const browserRestAlertScheduler: RestAlertScheduler = {
  async ensureScheduled(sessionId: string): Promise<void> {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const res = await post(sessionId);
        if (res.ok || res.status < 500) return;
      } catch {
        // Conexão instável: tenta mais uma vez.
      }
      if (attempt === 0) await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
    }
  },
};
