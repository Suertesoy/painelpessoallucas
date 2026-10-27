// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { WorkoutPushToggle } from '@/components/workouts/workout-push-toggle';

const mockUsePushNotifications = vi.fn();
const mockUseRestAlertStatus = vi.fn();

vi.mock('@/lib/use-push-notifications', () => ({
  usePushNotifications: () => mockUsePushNotifications(),
}));
vi.mock('@/lib/use-rest-alert-status', () => ({
  useRestAlertStatus: (athleteId: string) => mockUseRestAlertStatus(athleteId),
}));

const ATHLETE = '3e1a4d9c-5b6f-4a7c-8d8e-9f0a1b2c3d4e';

function pushState(over: Record<string, unknown> = {}) {
  return {
    state: 'subscribed',
    preferences: { workoutRestEnabled: true },
    busy: false,
    error: null,
    updatePreferences: vi.fn(),
    activate: vi.fn().mockResolvedValue(undefined),
    ...over,
  };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('WorkoutPushToggle — "Avisar quando o descanso terminar"', () => {
  it('ligado: mostra o estado e desliga só a preferência deste aparelho', () => {
    const push = pushState();
    mockUsePushNotifications.mockReturnValue(push);
    mockUseRestAlertStatus.mockReturnValue({ ready: true, athlete: 'mine' });

    render(<WorkoutPushToggle athleteId={ATHLETE} />);

    expect(mockUseRestAlertStatus).toHaveBeenCalledWith(ATHLETE);
    expect(screen.getByText(/Avisos automáticos ativos neste aparelho/i)).toBeTruthy();
    const toggle = screen.getByRole('switch') as HTMLInputElement;
    expect(toggle.checked).toBe(true);
    fireEvent.click(toggle);
    expect(push.updatePreferences).toHaveBeenCalledWith({ workoutRestEnabled: false });
    expect(push.activate).not.toHaveBeenCalled();
  });

  it('desligado: liga a preferência sem pedir permissão de novo', () => {
    const push = pushState({ preferences: { workoutRestEnabled: false } });
    mockUsePushNotifications.mockReturnValue(push);
    mockUseRestAlertStatus.mockReturnValue({ ready: true, athlete: 'mine' });

    render(<WorkoutPushToggle athleteId={ATHLETE} />);
    fireEvent.click(screen.getByRole('switch'));
    expect(push.updatePreferences).toHaveBeenCalledWith({ workoutRestEnabled: true });
    expect(push.activate).not.toHaveBeenCalled();
  });

  it.each(['permission_default', 'permission_granted_no_subscription', 'subscription_lost'])(
    'sem assinatura (%s): "Ativar" registra o aparelho já com o aviso de descanso ligado',
    (state) => {
      const push = pushState({ state, preferences: null });
      mockUsePushNotifications.mockReturnValue(push);
      mockUseRestAlertStatus.mockReturnValue(null);

      render(<WorkoutPushToggle athleteId={ATHLETE} />);
      fireEvent.click(screen.getByRole('button', { name: 'Ativar' }));
      expect(push.activate).toHaveBeenCalledWith({ workoutRestEnabled: true });
      expect(push.updatePreferences).not.toHaveBeenCalled();
    }
  );

  it('iOS fora da Tela de Início: orienta instalar, sem switch', () => {
    mockUsePushNotifications.mockReturnValue(pushState({ state: 'ios_not_installed', preferences: null }));
    mockUseRestAlertStatus.mockReturnValue(null);
    render(<WorkoutPushToggle athleteId={ATHLETE} />);
    expect(screen.getAllByText(/Tela de Início/i).length).toBeGreaterThan(0);
    expect(screen.queryByRole('switch')).toBeNull();
  });

  it('permissão negada: orienta liberar em Ajustes do iPhone', () => {
    mockUsePushNotifications.mockReturnValue(pushState({ state: 'permission_denied', preferences: null }));
    mockUseRestAlertStatus.mockReturnValue(null);
    render(<WorkoutPushToggle athleteId={ATHLETE} />);
    expect(screen.getByText(/bloqueadas neste aparelho/i)).toBeTruthy();
    expect(screen.getByText(/Ajustes do iPhone › Notificações › Lutheus/i)).toBeTruthy();
  });

  it('servidor sem QStash configurado: avisa, sem prometer aviso ativo', () => {
    mockUsePushNotifications.mockReturnValue(pushState());
    mockUseRestAlertStatus.mockReturnValue({ ready: false, athlete: 'mine' });
    render(<WorkoutPushToggle athleteId={ATHLETE} />);
    expect(screen.getByText(/ainda não foram configurados no servidor/i)).toBeTruthy();
    expect(screen.queryByText(/Avisos automáticos ativos/i)).toBeNull();
  });

  it('perfil sem conta vinculada: avisa que ninguém receberá', () => {
    mockUsePushNotifications.mockReturnValue(pushState());
    mockUseRestAlertStatus.mockReturnValue({ ready: true, athlete: 'unlinked' });
    render(<WorkoutPushToggle athleteId={ATHLETE} />);
    expect(screen.getByText(/ainda não está vinculado a uma conta/i)).toBeTruthy();
    expect(screen.queryByText(/Avisos automáticos ativos/i)).toBeNull();
  });

  it('perfil de outra pessoa: explica que o aviso vai para o aparelho dela', () => {
    mockUsePushNotifications.mockReturnValue(pushState());
    mockUseRestAlertStatus.mockReturnValue({ ready: true, athlete: 'other' });
    render(<WorkoutPushToggle athleteId={ATHLETE} />);
    expect(screen.getByText(/vão para o aparelho da pessoa dona dele/i)).toBeTruthy();
  });

  it('mostra erro do push', () => {
    mockUsePushNotifications.mockReturnValue(pushState({ error: 'Falha ao salvar preferências.' }));
    mockUseRestAlertStatus.mockReturnValue({ ready: true, athlete: 'mine' });
    render(<WorkoutPushToggle athleteId={ATHLETE} />);
    expect(screen.getByRole('alert').textContent).toContain('Falha ao salvar preferências.');
  });
});
