// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/platform/push/vapid', async () => {
  class WebPushDeliveryError extends Error {
    constructor(message: string, public readonly category: string, public readonly statusCode?: number) {
      super(message);
    }
  }
  return { sendWebPush: vi.fn(), WebPushDeliveryError };
});
vi.mock('@/platform/push/push-dispatch', () => ({ disableSubscription: vi.fn(async () => undefined) }));

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  handleRestAlertCallback,
  scheduleRestAlert,
  RestAlertInfraError,
  REST_ALERT_MAX_LATE_MS,
  type PublishRequest,
} from '@/platform/workouts/rest-alert';
import { sendWebPush, WebPushDeliveryError } from '@/platform/push/vapid';
import { disableSubscription } from '@/platform/push/push-dispatch';

/**
 * Regra central do aviso de fim de descanso, com um banco em memória que
 * modela o que importa aqui: a chave única de workout_rest_push_deliveries
 * (atômica, como no Postgres), erros de leitura e intercalação assíncrona
 * entre callbacks simultâneos. A geração (rest_nonce) é carimbada por trigger
 * no banco real — aqui as mudanças de geração são feitas à mão, como o
 * trigger faria (o trigger em si é validado contra Postgres real fora da
 * suíte; ver docs/TREINOS_AVISO_DESCANSO_PUSH.md).
 */

type Row = Record<string, unknown>;

const UNIQUE: Record<string, string[]> = {
  workout_rest_push_deliveries: ['session_id', 'rest_nonce', 'subscription_id'],
};

function createDb(initial: Record<string, Row[]>) {
  const tables: Record<string, Row[]> = {};
  for (const [k, v] of Object.entries(initial)) tables[k] = v.map((r) => ({ ...r }));
  const failSelect = new Set<string>();
  const failInsert = new Set<string>();
  let seq = 0;
  const rows = (t: string) => (tables[t] ??= []);
  // Um tick por operação: deixa dois callbacks concorrentes se intercalarem.
  const tick = () => new Promise((r) => setTimeout(r, 0));

  function select(table: string) {
    const filters: ((r: Row) => boolean)[] = [];
    const run = async () => {
      await tick();
      if (failSelect.has(table)) return { data: null, error: { code: 'XX000', message: 'db down' } };
      return { data: rows(table).filter((r) => filters.every((f) => f(r))).map((r) => ({ ...r })), error: null };
    };
    const b = {
      eq(c: string, v: unknown) {
        filters.push((r) => r[c] === v);
        return b;
      },
      is(c: string, v: unknown) {
        filters.push((r) => (v === null ? r[c] == null : r[c] === v));
        return b;
      },
      async maybeSingle() {
        const res = await run();
        return { data: res.data?.[0] ?? null, error: res.error };
      },
      then(resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) {
        return run().then(resolve, reject);
      },
    };
    return b;
  }

  const client = {
    tables,
    failSelect,
    failInsert,
    from(table: string) {
      return {
        select: () => select(table),
        insert(payload: Row) {
          const run = async () => {
            await tick();
            if (failInsert.has(table)) return { data: null, error: { code: 'XX000', message: 'db down' } };
            const key = UNIQUE[table];
            // Checagem e inserção sem await no meio: atômicas como no banco.
            if (key && rows(table).some((r) => key.every((c) => r[c] === payload[c]))) {
              return { data: null, error: { code: '23505', message: 'duplicate key' } };
            }
            const row = { id: `row-${++seq}`, ...payload };
            rows(table).push(row);
            return { data: { id: row.id }, error: null };
          };
          return { select: () => ({ single: run }) };
        },
        update(patch: Row) {
          return {
            eq: async (c: string, v: unknown) => {
              await tick();
              for (const r of rows(table)) if (r[c] === v) Object.assign(r, patch);
              return { error: null };
            },
          };
        },
      };
    },
  };
  return client;
}

type Db = ReturnType<typeof createDb>;
const asClient = (db: Db) => db as unknown as SupabaseClient;

const WS = '0b8f1a52-6d1e-4c1a-9a51-2a8e3c7b9d01';
const LUCAS_USER = '1c9e2b7a-3f4d-4e5a-8b6c-7d8e9f0a1b2c';
const MATHEUS_USER = '2d0f3c8b-4a5e-4f6b-9c7d-8e9f0a1b2c3d';
const ATHLETE_LUCAS = '3e1a4d9c-5b6f-4a7c-8d8e-9f0a1b2c3d4e';
const ATHLETE_MATHEUS = '4f2b5e0d-6c7a-4b8d-9e9f-0a1b2c3d4e5f';
const SESSION_LUCAS = '5a3c6f1e-7d8b-4c9e-8f0a-1b2c3d4e5f6a';
const SESSION_MATHEUS = '6b4d7a2f-8e9c-4d0f-9a1b-2c3d4e5f6a7b';
const NONCE_1 = '7c5e8b3a-9f0d-4e1a-8b2c-3d4e5f6a7b8c';
const NONCE_2 = '8d6f9c4b-0a1e-4f2b-9c3d-4e5f6a7b8c9d';

const NOW = Date.parse('2026-10-26T15:00:00.000Z');
const iso = (ms: number) => new Date(ms).toISOString();

function sub(id: string, userId: string, enabled = true, extra: Row = {}): Row {
  return { id, user_id: userId, endpoint: `https://web.push.apple.com/${id}`, p256dh: `p-${id}`, auth_key: `a-${id}`, is_active: true, disabled_at: null, workout_rest_enabled: enabled, ...extra };
}

function seed(over: { lucasRest?: Partial<Row>; lucasSubs?: Row[] } = {}) {
  return createDb({
    workout_sessions: [
      { id: SESSION_LUCAS, workspace_id: WS, athlete_id: ATHLETE_LUCAS, status: 'in_progress', rest_ends_at: iso(NOW + 90_000), rest_paused_remaining_seconds: null, rest_nonce: NONCE_1, ...over.lucasRest },
      { id: SESSION_MATHEUS, workspace_id: WS, athlete_id: ATHLETE_MATHEUS, status: 'in_progress', rest_ends_at: iso(NOW + 60_000), rest_paused_remaining_seconds: null, rest_nonce: NONCE_2 },
    ],
    workout_athletes: [
      { id: ATHLETE_LUCAS, workspace_id: WS, user_id: LUCAS_USER },
      { id: ATHLETE_MATHEUS, workspace_id: WS, user_id: MATHEUS_USER },
    ],
    workspace_members: [
      { workspace_id: WS, user_id: LUCAS_USER },
      { workspace_id: WS, user_id: MATHEUS_USER },
    ],
    push_subscriptions: over.lucasSubs ?? [sub('sub-lucas-iphone', LUCAS_USER), sub('sub-matheus-iphone', MATHEUS_USER)],
    workout_rest_push_deliveries: [],
  });
}

function scheduleDeps(db: Db, nowMs = NOW, publish = vi.fn<(req: PublishRequest) => Promise<{ messageId: string }>>(async () => ({ messageId: 'msg-1' }))) {
  return { deps: { db: asClient(db), admin: asClient(db), publish, callbackUrl: 'https://app.example/api/workouts/rest-callback', nowMs }, publish };
}

const session = (db: Db, id = SESSION_LUCAS) => db.tables.workout_sessions.find((s) => s.id === id)!;
const endsAt = (db: Db, id = SESSION_LUCAS) => Date.parse(session(db, id).rest_ends_at as string);
const payload = (sessionId = SESSION_LUCAS, restNonce = NONCE_1) => ({ v: 1 as const, sessionId, restNonce });
const sentEndpoints = () => vi.mocked(sendWebPush).mock.calls.map((c) => c[0].endpoint);

beforeEach(() => {
  vi.mocked(sendWebPush).mockReset();
  vi.mocked(sendWebPush).mockResolvedValue(undefined);
  vi.mocked(disableSubscription).mockClear();
});

describe('scheduleRestAlert — agendamento a partir do estado persistido', () => {
  it.each([30, 60, 90, 180])('descanso de %i s agenda um callback para o prazo salvo (notBefore em segundos)', async (seconds) => {
    const db = seed({ lucasRest: { rest_ends_at: iso(NOW + seconds * 1000) } });
    const { deps, publish } = scheduleDeps(db);

    const result = await scheduleRestAlert(deps, SESSION_LUCAS);

    expect(result).toEqual({ scheduled: true, messageId: 'msg-1', notBefore: Math.ceil((NOW + seconds * 1000) / 1000) });
    expect(publish).toHaveBeenCalledTimes(1);
    const req = publish.mock.calls[0][0];
    expect(req.url).toBe('https://app.example/api/workouts/rest-callback');
    // O corpo só identifica (sessão, geração) — nada de destinatário ou endpoint.
    expect(req.body).toEqual({ v: 1, sessionId: SESSION_LUCAS, restNonce: NONCE_1 });
    expect(req.deduplicationId).toBe(`workout-rest-${SESSION_LUCAS}-${NONCE_1}`);
    expect(req.retries).toBeLessThanOrEqual(1);
  });

  it('não agenda quando a preferência está desativada em todos os aparelhos do dono do atleta', async () => {
    const db = seed({ lucasSubs: [sub('sub-lucas-iphone', LUCAS_USER, false), sub('sub-matheus-iphone', MATHEUS_USER)] });
    const { deps, publish } = scheduleDeps(db);
    expect(await scheduleRestAlert(deps, SESSION_LUCAS)).toEqual({ scheduled: false, reason: 'no_enabled_device' });
    expect(publish).not.toHaveBeenCalled();
  });

  it('não agenda para atleta sem conta vinculada', async () => {
    const db = seed();
    db.tables.workout_athletes[0].user_id = null;
    const { deps, publish } = scheduleDeps(db);
    expect(await scheduleRestAlert(deps, SESSION_LUCAS)).toEqual({ scheduled: false, reason: 'athlete_not_linked' });
    expect(publish).not.toHaveBeenCalled();
  });

  it('não agenda descanso pausado, pulado, já vencido ou de sessão encerrada', async () => {
    const cases: [Partial<Row>, string][] = [
      [{ rest_ends_at: null, rest_paused_remaining_seconds: 40, rest_nonce: null }, 'rest_not_running'],
      [{ rest_ends_at: null, rest_nonce: null }, 'rest_not_running'],
      [{ status: 'completed', rest_ends_at: null, rest_nonce: null }, 'rest_not_running'],
      [{ rest_ends_at: iso(NOW - 1000) }, 'rest_elapsed'],
    ];
    for (const [rest, reason] of cases) {
      const { deps, publish } = scheduleDeps(seed({ lucasRest: rest }));
      expect(await scheduleRestAlert(deps, SESSION_LUCAS)).toEqual({ scheduled: false, reason });
      expect(publish).not.toHaveBeenCalled();
    }
  });

  it('sessão fora do alcance do usuário (RLS) não agenda', async () => {
    const db = seed();
    const { deps } = scheduleDeps(db);
    expect(await scheduleRestAlert(deps, '9e8d7c6b-5a49-4382-9716-0f1e2d3c4b5a')).toEqual({ scheduled: false, reason: 'session_not_found' });
  });

  it('falha de conexão com o QStash propaga (a rota responde 502) sem tocar no banco', async () => {
    const db = seed();
    const publish = vi.fn(async () => {
      throw new Error('fetch failed');
    });
    const { deps } = scheduleDeps(db, NOW, publish);
    await expect(scheduleRestAlert(deps, SESSION_LUCAS)).rejects.toThrow('fetch failed');
    expect(db.tables.workout_rest_push_deliveries).toHaveLength(0);
  });

  it('erro de leitura do banco vira RestAlertInfraError', async () => {
    const db = seed();
    db.failSelect.add('workout_sessions');
    const { deps } = scheduleDeps(db);
    await expect(scheduleRestAlert(deps, SESSION_LUCAS)).rejects.toBeInstanceOf(RestAlertInfraError);
  });
});

describe('handleRestAlertCallback — revalidação no horário', () => {
  it('envia o aviso ao iPhone do Lucas no fim do descanso dele, com o texto combinado', async () => {
    const db = seed();
    const result = await handleRestAlertCallback({ admin: asClient(db), nowMs: endsAt(db) + 800 }, payload());

    expect(result).toEqual({ sent: true, accepted: 1, failed: 0, duplicates: 0 });
    expect(sendWebPush).toHaveBeenCalledTimes(1);
    const [target, message] = vi.mocked(sendWebPush).mock.calls[0];
    expect(target.endpoint).toBe('https://web.push.apple.com/sub-lucas-iphone');
    expect(message).toEqual({
      title: 'Lutheus 🏡',
      body: 'Descanso concluído! 💪 Hora da próxima série.',
      url: `/treinos/${ATHLETE_LUCAS}/sessao/${SESSION_LUCAS}`,
      tag: `workout-rest:${SESSION_LUCAS}`,
      kind: 'workout_rest',
    });
    // Registro honesto: "aceito pelo serviço de push", não "recebido".
    expect(db.tables.workout_rest_push_deliveries).toEqual([expect.objectContaining({ subscription_id: 'sub-lucas-iphone', rest_nonce: NONCE_1, status: 'accepted' })]);
  });

  it('isolamento: o descanso do Lucas nunca chega ao aparelho do Matheus, e vice-versa', async () => {
    const db = seed();
    await handleRestAlertCallback({ admin: asClient(db), nowMs: endsAt(db) }, payload());
    expect(sentEndpoints()).toEqual(['https://web.push.apple.com/sub-lucas-iphone']);

    vi.mocked(sendWebPush).mockClear();
    await handleRestAlertCallback({ admin: asClient(db), nowMs: endsAt(db, SESSION_MATHEUS) }, payload(SESSION_MATHEUS, NONCE_2));
    expect(sentEndpoints()).toEqual(['https://web.push.apple.com/sub-matheus-iphone']);
  });

  it('o payload não escolhe destinatário: sessão do Matheus com geração do Lucas é descartada', async () => {
    const db = seed();
    expect(await handleRestAlertCallback({ admin: asClient(db), nowMs: NOW + 90_000 }, payload(SESSION_MATHEUS, NONCE_1))).toEqual({ sent: false, reason: 'rest_superseded' });
    expect(sendWebPush).not.toHaveBeenCalled();
  });

  it('dois aparelhos do mesmo usuário com o aviso ligado recebem um aviso cada; aparelho com a opção desligada não', async () => {
    const db = seed({
      lucasSubs: [sub('sub-lucas-iphone', LUCAS_USER), sub('sub-lucas-ipad', LUCAS_USER), sub('sub-lucas-mac', LUCAS_USER, false), sub('sub-matheus-iphone', MATHEUS_USER)],
    });
    const result = await handleRestAlertCallback({ admin: asClient(db), nowMs: endsAt(db) }, payload());
    expect(result).toEqual({ sent: true, accepted: 2, failed: 0, duplicates: 0 });
    expect(sentEndpoints().sort()).toEqual(['https://web.push.apple.com/sub-lucas-ipad', 'https://web.push.apple.com/sub-lucas-iphone']);
  });

  it('assinatura desativada ou removida não recebe', async () => {
    const db = seed({ lucasSubs: [sub('sub-lucas-iphone', LUCAS_USER, true, { is_active: false, disabled_at: iso(NOW) }), sub('sub-matheus-iphone', MATHEUS_USER)] });
    expect(await handleRestAlertCallback({ admin: asClient(db), nowMs: endsAt(db) }, payload())).toEqual({ sent: false, reason: 'no_enabled_device' });
    expect(sendWebPush).not.toHaveBeenCalled();
  });

  it('preferência desligada depois do agendamento: não envia', async () => {
    const db = seed();
    db.tables.push_subscriptions[0].workout_rest_enabled = false;
    expect(await handleRestAlertCallback({ admin: asClient(db), nowMs: endsAt(db) }, payload())).toEqual({ sent: false, reason: 'no_enabled_device' });
  });

  it('descanso cancelado (pular): não envia', async () => {
    const db = seed();
    const at = endsAt(db);
    Object.assign(session(db), { rest_ends_at: null, rest_nonce: null });
    expect(await handleRestAlertCallback({ admin: asClient(db), nowMs: at }, payload())).toEqual({ sent: false, reason: 'rest_superseded' });
    expect(sendWebPush).not.toHaveBeenCalled();
  });

  it('descanso pausado: não envia', async () => {
    const db = seed();
    const at = endsAt(db);
    Object.assign(session(db), { rest_ends_at: null, rest_paused_remaining_seconds: 42, rest_nonce: null });
    expect(await handleRestAlertCallback({ admin: asClient(db), nowMs: at }, payload())).toEqual({ sent: false, reason: 'rest_superseded' });
  });

  it('pausado e retomado: só o agendamento da geração nova envia', async () => {
    const db = seed();
    const oldAt = endsAt(db);
    // Retomar grava novo prazo → trigger gera nova geração.
    Object.assign(session(db), { rest_ends_at: iso(oldAt + 20_000), rest_nonce: NONCE_2 });

    expect(await handleRestAlertCallback({ admin: asClient(db), nowMs: oldAt }, payload(SESSION_LUCAS, NONCE_1))).toEqual({ sent: false, reason: 'rest_superseded' });
    expect(await handleRestAlertCallback({ admin: asClient(db), nowMs: oldAt + 20_000 }, payload(SESSION_LUCAS, NONCE_2))).toMatchObject({ sent: true, accepted: 1 });
    expect(sendWebPush).toHaveBeenCalledTimes(1);
  });

  it('reiniciado: o prazo antigo não gera alerta, o novo gera', async () => {
    const db = seed();
    const oldAt = endsAt(db);
    Object.assign(session(db), { rest_ends_at: iso(oldAt + 50_000), rest_nonce: NONCE_2 });
    expect((await handleRestAlertCallback({ admin: asClient(db), nowMs: oldAt }, payload())).sent).toBe(false);
    expect((await handleRestAlertCallback({ admin: asClient(db), nowMs: oldAt + 50_000 }, payload(SESSION_LUCAS, NONCE_2))).sent).toBe(true);
  });

  it('duração alterada (+15 s): o alerta segue o novo prazo', async () => {
    const db = seed();
    const oldAt = endsAt(db);
    Object.assign(session(db), { rest_ends_at: iso(oldAt + 15_000), rest_nonce: NONCE_2 });
    expect((await handleRestAlertCallback({ admin: asClient(db), nowMs: oldAt }, payload())).sent).toBe(false);
    // Chegou cedo para o prazo novo? Também não envia.
    expect(await handleRestAlertCallback({ admin: asClient(db), nowMs: oldAt }, payload(SESSION_LUCAS, NONCE_2))).toEqual({ sent: false, reason: 'too_early' });
    expect((await handleRestAlertCallback({ admin: asClient(db), nowMs: oldAt + 15_000 }, payload(SESSION_LUCAS, NONCE_2))).sent).toBe(true);
  });

  it('sessão concluída ou cancelada: não envia', async () => {
    for (const status of ['completed', 'cancelled']) {
      const db = seed();
      const at = endsAt(db);
      Object.assign(session(db), { status, rest_ends_at: null, rest_nonce: null });
      expect(await handleRestAlertCallback({ admin: asClient(db), nowMs: at }, payload())).toEqual({ sent: false, reason: 'rest_superseded' });
    }
    expect(sendWebPush).not.toHaveBeenCalled();
  });

  it('trocar de ficha A–E mantém a geração: o aviso do mesmo descanso continua válido (uma vez só)', async () => {
    const db = seed();
    session(db).day_id = 'outro-dia';
    const at = endsAt(db);
    expect((await handleRestAlertCallback({ admin: asClient(db), nowMs: at }, payload())).sent).toBe(true);
    expect(await handleRestAlertCallback({ admin: asClient(db), nowMs: at + 1000 }, payload())).toEqual({ sent: false, reason: 'already_handled' });
    expect(sendWebPush).toHaveBeenCalledTimes(1);
  });

  it('callback duplicado (retry do QStash): o mesmo aparelho não recebe duas vezes', async () => {
    const db = seed();
    const at = endsAt(db);
    await handleRestAlertCallback({ admin: asClient(db), nowMs: at }, payload());
    expect(await handleRestAlertCallback({ admin: asClient(db), nowMs: at + 2000 }, payload())).toEqual({ sent: false, reason: 'already_handled' });
    expect(sendWebPush).toHaveBeenCalledTimes(1);
  });

  it('callbacks concorrentes para o mesmo descanso: um envio por aparelho', async () => {
    const db = seed({ lucasSubs: [sub('sub-lucas-iphone', LUCAS_USER), sub('sub-lucas-ipad', LUCAS_USER)] });
    const at = endsAt(db);
    const results = await Promise.all([1, 2, 3].map(() => handleRestAlertCallback({ admin: asClient(db), nowMs: at }, payload())));
    expect(sendWebPush).toHaveBeenCalledTimes(2);
    expect(new Set(sentEndpoints()).size).toBe(2);
    expect(db.tables.workout_rest_push_deliveries).toHaveLength(2);
    expect(results.filter((r) => r.sent)).not.toHaveLength(0);
  });

  it('callback atrasado além do limite é suprimido (sem aviso obsoleto)', async () => {
    const db = seed();
    const at = endsAt(db);
    expect(await handleRestAlertCallback({ admin: asClient(db), nowMs: at + REST_ALERT_MAX_LATE_MS + 1 }, payload())).toEqual({ sent: false, reason: 'stale' });
    expect((await handleRestAlertCallback({ admin: asClient(db), nowMs: at + REST_ALERT_MAX_LATE_MS }, payload())).sent).toBe(true);
  });

  it('callback adiantado demais não envia', async () => {
    const db = seed();
    expect(await handleRestAlertCallback({ admin: asClient(db), nowMs: endsAt(db) - 5000 }, payload())).toEqual({ sent: false, reason: 'too_early' });
  });

  it('assinatura expirada (410) é desativada e não é retentada', async () => {
    const db = seed();
    vi.mocked(sendWebPush).mockRejectedValueOnce(new WebPushDeliveryError('gone', 'expired_subscription', 410));
    const at = endsAt(db);
    expect(await handleRestAlertCallback({ admin: asClient(db), nowMs: at }, payload())).toEqual({ sent: true, accepted: 0, failed: 1, duplicates: 0 });
    expect(disableSubscription).toHaveBeenCalledWith(expect.anything(), 'sub-lucas-iphone');
    expect(db.tables.workout_rest_push_deliveries[0]).toMatchObject({ status: 'failed', error_category: 'expired_subscription' });
    // Retry posterior não reenvia.
    await handleRestAlertCallback({ admin: asClient(db), nowMs: at + 1000 }, payload());
    expect(sendWebPush).toHaveBeenCalledTimes(1);
  });

  it('falha temporária do Web Push num aparelho não impede o outro e não é reenviada depois', async () => {
    const db = seed({ lucasSubs: [sub('sub-lucas-iphone', LUCAS_USER), sub('sub-lucas-ipad', LUCAS_USER)] });
    vi.mocked(sendWebPush).mockRejectedValueOnce(new WebPushDeliveryError('boom', 'server_error', 503));
    const result = await handleRestAlertCallback({ admin: asClient(db), nowMs: endsAt(db) }, payload());
    expect(result).toEqual({ sent: true, accepted: 1, failed: 1, duplicates: 0 });
    expect(disableSubscription).not.toHaveBeenCalled();
  });

  it('dono do atleta saiu do workspace: não envia', async () => {
    const db = seed();
    db.tables.workspace_members = db.tables.workspace_members.filter((m) => m.user_id !== LUCAS_USER);
    expect(await handleRestAlertCallback({ admin: asClient(db), nowMs: endsAt(db) }, payload())).toEqual({ sent: false, reason: 'recipient_not_member' });
  });

  it('banco indisponível na leitura: erro de infraestrutura (QStash pode tentar de novo)', async () => {
    const db = seed();
    db.failSelect.add('workout_sessions');
    await expect(handleRestAlertCallback({ admin: asClient(db), nowMs: NOW }, payload())).rejects.toBeInstanceOf(RestAlertInfraError);
  });

  it('banco indisponível ao reivindicar o envio: nada é enviado e o erro sobe para retry', async () => {
    const db = seed();
    db.failInsert.add('workout_rest_push_deliveries');
    await expect(handleRestAlertCallback({ admin: asClient(db), nowMs: endsAt(db) }, payload())).rejects.toBeInstanceOf(RestAlertInfraError);
    expect(sendWebPush).not.toHaveBeenCalled();
  });
});
