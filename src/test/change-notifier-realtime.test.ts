// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChangeNotifier } from '@/platform/supabase/change-notifier';

type RealtimeStatus =
  | 'SUBSCRIBED'
  | 'TIMED_OUT'
  | 'CLOSED'
  | 'CHANNEL_ERROR';

function createFakeSupabase() {
  let postgresCallback: (() => void) | null = null;
  let statusCallback: ((status: RealtimeStatus) => void) | null = null;

  const channel = {
    on: vi.fn(
      (
        _event: string,
        _filter: Record<string, unknown>,
        callback: () => void
      ) => {
        postgresCallback = callback;
        return channel;
      }
    ),
    subscribe: vi.fn((callback: (status: RealtimeStatus) => void) => {
      statusCallback = callback;
      return channel;
    }),
  };

  const supabase = {
    channel: vi.fn(() => channel),
    removeChannel: vi.fn(async () => 'ok'),
    realtime: { connect: vi.fn() },
  };

  return {
    supabase,
    channel,
    emitPostgresChange: () => postgresCallback?.(),
    emitStatus: (status: RealtimeStatus) => statusCallback?.(status),
  };
}

function setOnline(value: boolean) {
  Object.defineProperty(window.navigator, 'onLine', {
    configurable: true,
    value,
  });
}

beforeEach(() => {
  setOnline(true);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ChangeNotifier com Supabase Realtime', () => {
  it('notifica as queries quando outro dispositivo altera o banco', () => {
    const fake = createFakeSupabase();
    const notifier = new ChangeNotifier(
      fake.supabase as never,
      'workspace-1'
    );
    const listener = vi.fn();
    notifier.subscribe(listener);

    notifier.startRealtime();
    fake.emitPostgresChange();

    expect(fake.supabase.channel).toHaveBeenCalledWith(
      'painel-realtime-workspace-1'
    );
    expect(fake.channel.on).toHaveBeenCalledWith(
      'postgres_changes',
      { event: '*', schema: 'public' },
      expect.any(Function)
    );
    expect(listener).toHaveBeenCalledTimes(1);
    notifier.dispose();
  });

  it('reconcilia tudo ao conectar e expõe falhas de conexão', () => {
    const fake = createFakeSupabase();
    const notifier = new ChangeNotifier(
      fake.supabase as never,
      'workspace-1'
    );
    const dataListener = vi.fn();
    const statusListener = vi.fn();
    notifier.subscribe(dataListener);
    notifier.subscribeStatus(statusListener);

    notifier.startRealtime();
    expect(notifier.getStatus()).toBe('connecting');

    fake.emitStatus('SUBSCRIBED');
    expect(notifier.getStatus()).toBe('connected');
    expect(dataListener).toHaveBeenCalledTimes(1);

    fake.emitStatus('CHANNEL_ERROR');
    expect(notifier.getStatus()).toBe('reconnecting');
    expect(statusListener).toHaveBeenCalled();
    notifier.dispose();
  });

  it('marca offline e, quando a internet volta, reconecta e confere os dados', () => {
    const fake = createFakeSupabase();
    const notifier = new ChangeNotifier(
      fake.supabase as never,
      'workspace-1'
    );
    const listener = vi.fn();
    notifier.subscribe(listener);
    notifier.startRealtime();

    setOnline(false);
    window.dispatchEvent(new Event('offline'));
    expect(notifier.getStatus()).toBe('offline');

    setOnline(true);
    window.dispatchEvent(new Event('online'));
    expect(notifier.getStatus()).toBe('reconnecting');
    expect(fake.supabase.realtime.connect).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledTimes(1);

    notifier.dispose();
    expect(fake.supabase.removeChannel).toHaveBeenCalledWith(fake.channel);
  });
});
