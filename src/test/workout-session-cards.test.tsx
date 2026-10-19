// @vitest-environment jsdom
import { Suspense } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor, within, act } from '@testing-library/react';
import SessaoPage from '@/app/treinos/[athleteId]/sessao/[sessionId]/page';
import AtletaPage from '@/app/treinos/[athleteId]/page';
import { exerciseProgress, sessionProgress } from '@/modules/workouts/domain/workout-progress';
import type { SessionView, AthleteOverview } from '@/modules/workouts/application/workout.queries';
import type { SetLog, WorkoutAthlete, WorkoutDay, WorkoutExercise, WorkoutSession } from '@/modules/workouts/domain/workout.schema';

const WS = '11111111-1111-4111-8111-111111111111';
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const now = '2026-10-16T10:00:00.000Z';

const lucas: WorkoutAthlete = { id: id(1), workspaceId: WS, name: 'Lucas', position: 0, createdAt: now, updatedAt: now };
const matheus: WorkoutAthlete = { id: id(2), workspaceId: WS, name: 'Matheus', position: 1, createdAt: now, updatedAt: now };
const dayA: WorkoutDay = { id: id(10), workspaceId: WS, code: 'A', position: 0, createdAt: now, updatedAt: now };
const dayB: WorkoutDay = { id: id(11), workspaceId: WS, code: 'B', position: 1, createdAt: now, updatedAt: now };
const exercise = (n: number, name: string, sets = 3): WorkoutExercise => ({
  id: id(100 + n), workspaceId: WS, dayId: dayA.id, position: n, name, sets, repsMin: 8, repsMax: 12, needsReview: false, restSeconds: 60, createdAt: now, updatedAt: now,
});
const session: WorkoutSession = {
  id: id(50), workspaceId: WS, athleteId: lucas.id, dayId: dayA.id, sessionDate: '2026-10-16', startedAt: now, status: 'in_progress', createdAt: now, updatedAt: now,
};

/** Estado "do banco" mutável: os comandos falsos gravam aqui e avisam os assinantes (reatividade). */
let exercises: WorkoutExercise[];
let logs: SetLog[];
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());
const fakeRepo = { subscribe: (l: () => void) => { listeners.add(l); return () => listeners.delete(l); } };

function buildView(): SessionView {
  const views = exercises.map((exercise) => {
    const exerciseLogs = logs.filter((l) => l.exerciseId === exercise.id).sort((a, b) => a.setNumber - b.setNumber);
    return {
      exercise, logs: exerciseLogs, progress: exerciseProgress(exercise, exerciseLogs), previous: null,
      loadsByAthlete: {}, previousByAthlete: {},
    };
  });
  return {
    session, athlete: lucas, athletes: [lucas, matheus], day: dayA, days: [dayA, dayB], totalSets: logs.length, setsByDay: { [dayA.id]: logs.length },
    exercises: views, dayProgress: sessionProgress(views.map((v) => v.progress)),
  };
}

const cmds = {
  completeSet: vi.fn(async (_s: string, dto: { exerciseId: string; setNumber: number; reps: number; loadKg?: number }) => {
    logs = [...logs.filter((l) => !(l.exerciseId === dto.exerciseId && l.setNumber === dto.setNumber)), {
      id: `${dto.exerciseId}:${dto.setNumber}`, workspaceId: WS, sessionId: session.id, athleteId: lucas.id, exerciseId: dto.exerciseId,
      setNumber: dto.setNumber, reps: dto.reps, loadKg: dto.loadKg, completedAt: now, createdAt: now,
    }];
    notify();
  }),
  unlogSet: vi.fn(async (_s: string, exerciseId: string, setNumber: number) => {
    logs = logs.filter((l) => !(l.exerciseId === exerciseId && l.setNumber === setNumber));
    notify();
  }),
  renameExercise: vi.fn(async (exerciseId: string, name: string) => {
    exercises = exercises.map((e) => (e.id === exerciseId ? { ...e, name } : e));
    notify();
  }),
  setAthleteLoad: vi.fn(async () => undefined),
  startRest: vi.fn(async () => undefined),
  setExerciseRest: vi.fn(async () => undefined),
  focusDay: vi.fn(async () => undefined),
  finishSession: vi.fn(async () => undefined),
  cancelSession: vi.fn(async () => undefined),
};
const getSessionView = vi.fn(async () => buildView());
const getAthleteOverview = vi.fn();

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/providers/auth.provider', () => ({ useWorkspace: () => ({ workspaceId: WS }) }));
vi.mock('@/lib/beep', () => ({ unlockAudio: vi.fn(), playBeep: vi.fn() }));
vi.mock('@/providers/repository.provider', () => ({
  useRepositories: () => ({
    itemRepository: fakeRepo, projectRepository: fakeRepo, dailyPlanRepository: fakeRepo, calendarEventLinkRepository: fakeRepo,
    learningContentRepository: fakeRepo, studySessionRepository: fakeRepo, lessonProgressRepository: fakeRepo, shoppingListRepository: fakeRepo,
    financeRepository: fakeRepo, financeCashRepository: fakeRepo, practiceRepository: fakeRepo, workoutRepository: fakeRepo,
    changeNotifier: { subscribe: () => () => {} },
  }),
  useQueries: () => ({ workout: { getSessionView, getAthleteOverview } }),
  useCommands: () => ({ workout: cmds }),
}));

/** Promise já resolvida (status marcado): `use()` lê na hora, sem suspender. */
function resolved<T>(value: T): Promise<T> {
  return Object.assign(Promise.resolve(value), { status: 'fulfilled' as const, value });
}

async function renderSession() {
  const view = render(
    <Suspense fallback={<p>suspenso</p>}>
      <SessaoPage params={resolved({ athleteId: lucas.id, sessionId: session.id })} />
    </Suspense>
  );
  await waitFor(() => expect(screen.getByTestId('day-progress')).toBeTruthy());
  return view;
}

const card = (name: string) => screen.getByRole('button', { name: new RegExp(`^${name}`) }).closest('li') as HTMLElement;
const header = (name: string) => screen.getByRole('button', { name: new RegExp(`^${name}`) });

beforeEach(() => {
  vi.clearAllMocks();
  window.sessionStorage.clear();
  exercises = [exercise(1, 'Supino reto'), exercise(2, 'Supino inclinado'), exercise(3, 'Crucifixo')];
  logs = [];
});
afterEach(cleanup);

describe('ficha com cards de exercício', () => {
  it('começa recolhida (nenhum exercício ativo) e mostra nome, progresso e estado em cada card', async () => {
    await renderSession();
    expect(screen.getByTestId('day-progress').textContent).toBe('Treino A · 0 de 3 exercícios concluídos');
    for (const name of ['Supino reto', 'Supino inclinado', 'Crucifixo']) {
      expect(header(name).getAttribute('aria-expanded')).toBe('false');
      expect(within(card(name)).getByText('0/3 séries · Não iniciado')).toBeTruthy();
    }
    expect(screen.queryByLabelText('Repetições da série 1')).toBeNull(); // séries escondidas: menos rolagem
  });

  it('tocar expande (séries, repetições, carga, descanso); só um card fica aberto por vez', async () => {
    await renderSession();
    fireEvent.click(header('Supino reto'));
    expect(header('Supino reto').getAttribute('aria-expanded')).toBe('true');
    const open = within(card('Supino reto'));
    expect(open.getByLabelText('Repetições da série 1')).toBeTruthy();
    expect(open.getByLabelText('Carga')).toBeTruthy();
    expect(open.getByText('Descanso')).toBeTruthy();
    expect(open.getAllByRole('button', { name: /Concluir série/ })).toHaveLength(3);

    fireEvent.click(header('Crucifixo'));
    expect(header('Crucifixo').getAttribute('aria-expanded')).toBe('true');
    expect(header('Supino reto').getAttribute('aria-expanded')).toBe('false'); // o anterior recolheu
    fireEvent.click(header('Crucifixo'));
    expect(header('Crucifixo').getAttribute('aria-expanded')).toBe('false');
  });

  it('concluir série não recolhe; progresso 1/3 e 2/3; ao concluir a última, vira Concluído e recolhe', async () => {
    await renderSession();
    fireEvent.click(header('Supino reto'));
    const click = async (n: number) => {
      fireEvent.click(within(card('Supino reto')).getByRole('button', { name: `Concluir série ${n}` }));
      await waitFor(() => expect(cmds.completeSet).toHaveBeenCalledTimes(n));
    };
    await click(1);
    await waitFor(() => expect(within(card('Supino reto')).getByText('1/3 séries · Em andamento')).toBeTruthy());
    expect(header('Supino reto').getAttribute('aria-expanded')).toBe('true');
    await click(2);
    await waitFor(() => expect(within(card('Supino reto')).getByText('2/3 séries · Em andamento')).toBeTruthy());
    expect(header('Supino reto').getAttribute('aria-expanded')).toBe('true');
    await click(3);
    await waitFor(() => expect(within(card('Supino reto')).getByText('3/3 séries · Concluído')).toBeTruthy());
    expect(header('Supino reto').getAttribute('aria-expanded')).toBe('false');
    expect(screen.getByTestId('day-progress').textContent).toBe('Treino A · 1 de 3 exercícios concluídos');
    // a conclusão vem dos registros reais, que foram gravados com a repetição padrão
    expect(logs.filter((l) => l.exerciseId === exercises[0].id)).toHaveLength(3);
  });

  it('desfazer uma série atualiza o progresso na hora (3/3 → 2/3) e o indicador do topo', async () => {
    logs = [1, 2, 3].map((n) => ({ id: `${exercises[0].id}:${n}`, workspaceId: WS, sessionId: session.id, athleteId: lucas.id, exerciseId: exercises[0].id, setNumber: n, reps: 10, completedAt: now, createdAt: now }));
    await renderSession();
    expect(within(card('Supino reto')).getByText('3/3 séries · Concluído')).toBeTruthy();
    expect(screen.getByTestId('day-progress').textContent).toBe('Treino A · 1 de 3 exercícios concluídos');
    fireEvent.click(header('Supino reto')); // reabrir um concluído para corrigir
    fireEvent.click(within(card('Supino reto')).getByRole('button', { name: 'Desfazer série 3' }));
    await waitFor(() => expect(within(card('Supino reto')).getByText('2/3 séries · Em andamento')).toBeTruthy());
    expect(screen.getByTestId('day-progress').textContent).toBe('Treino A · 0 de 3 exercícios concluídos');
    expect(header('Supino reto').getAttribute('aria-expanded')).toBe('true'); // corrigir não recolhe
  });

  it('o exercício em andamento já abre sozinho ao carregar; os outros ficam recolhidos', async () => {
    logs = [{ id: 'x', workspaceId: WS, sessionId: session.id, athleteId: lucas.id, exerciseId: exercises[1].id, setNumber: 1, reps: 10, completedAt: now, createdAt: now }];
    await renderSession();
    expect(header('Supino inclinado').getAttribute('aria-expanded')).toBe('true');
    expect(within(card('Supino inclinado')).getByText('1/3 séries · Em andamento')).toBeTruthy();
    expect(header('Supino reto').getAttribute('aria-expanded')).toBe('false');
  });

  it('a escolha de qual card está aberto sobrevive a sair e voltar (e as repetições digitadas também)', async () => {
    const first = await renderSession();
    fireEvent.click(header('Crucifixo'));
    first.unmount(); // navegou para outra ficha/seção
    await renderSession();
    expect(header('Crucifixo').getAttribute('aria-expanded')).toBe('true');
    expect(header('Supino reto').getAttribute('aria-expanded')).toBe('false');
  });

  it('acessibilidade: o cabeçalho é um botão com aria-expanded/aria-controls e o conteúdo é uma região nomeada', async () => {
    await renderSession();
    fireEvent.click(header('Supino reto'));
    const btn = header('Supino reto');
    const region = within(card('Supino reto')).getByRole('region', { name: 'Detalhes de Supino reto' });
    expect(btn.getAttribute('aria-controls')).toBe(region.id);
    expect(btn.className).toMatch(/min-h-16/); // área de toque grande
    // o estado também está em texto, não só em cor
    expect(within(card('Supino reto')).getByText(/séries · /)).toBeTruthy();
  });
});

describe('editar o nome do exercício na ficha', () => {
  it('campo preenchido com o nome atual; salvar atualiza a interface na hora e persiste pelo comando', async () => {
    exercises[1] = { ...exercises[1], name: 'Supino inclinado com halteres' };
    await renderSession();
    fireEvent.click(header('Supino inclinado com halteres'));
    fireEvent.click(screen.getByRole('button', { name: 'Editar nome de Supino inclinado com halteres' }));
    const input = screen.getByLabelText(/Nome do exercício/) as HTMLInputElement;
    expect(input.value).toBe('Supino inclinado com halteres');
    fireEvent.change(input, { target: { value: '  Supino inclinado ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(cmds.renameExercise).toHaveBeenCalledWith(exercises[1].id, 'Supino inclinado'));
    await waitFor(() => expect(screen.getAllByText('Supino inclinado').length).toBeGreaterThan(0));
    expect(screen.queryByText('Supino inclinado com halteres')).toBeNull();
  });

  it('nome vazio é bloqueado com aviso; cancelar descarta', async () => {
    await renderSession();
    fireEvent.click(header('Crucifixo'));
    fireEvent.click(screen.getByRole('button', { name: 'Editar nome de Crucifixo' }));
    fireEvent.change(screen.getByLabelText(/Nome do exercício/), { target: { value: '   ' } });
    expect(screen.getByText('O nome não pode ficar vazio.')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Salvar' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(cmds.renameExercise).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Editar nome de Crucifixo' })).toBeTruthy();
  });

  it('erro ao salvar aparece no campo e o nome antigo permanece', async () => {
    cmds.renameExercise.mockRejectedValueOnce(new Error('Sem conexão'));
    await renderSession();
    fireEvent.click(header('Crucifixo'));
    fireEvent.click(screen.getByRole('button', { name: 'Editar nome de Crucifixo' }));
    fireEvent.change(screen.getByLabelText(/Nome do exercício/), { target: { value: 'Crucifixo máquina' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(screen.getByText('Sem conexão')).toBeTruthy());
    expect(exercises[2].name).toBe('Crucifixo');
  });
});

describe('contador de treinos concluídos na lista de treinos', () => {
  const overview = (over: Partial<AthleteOverview['days'][number]> = {}): AthleteOverview => ({
    athlete: lucas,
    days: [{ day: dayA, exerciseCount: 7, lastDoneOn: '2026-10-16', loggedInActive: 0, completedCount: 10, lastCompletedOn: '2026-10-16', ...over }, { day: dayB, exerciseCount: 6, loggedInActive: 0, completedCount: 0 }],
    activeSession: null,
    recentSessions: [],
  });

  async function renderAthlete() {
    render(
      <Suspense fallback={<p>suspenso</p>}>
        <AtletaPage params={resolved({ athleteId: lucas.id })} />
      </Suspense>
    );
    await waitFor(() => expect(screen.getByText('Treino A')).toBeTruthy());
  }

  it('mostra "Última execução: 16/10/2026 · 10×" (concluído) em cada treino', async () => {
    getAthleteOverview.mockResolvedValue(overview());
    await renderAthlete();
    const a = screen.getByText('Treino A').closest('a') as HTMLElement;
    expect(within(a).getByText(/Última execução: 16\/10\/2026/)).toBeTruthy();
    expect(within(a).getByTitle('Vezes que este treino foi concluído').textContent).toContain('10×');
    const b = screen.getByText('Treino B').closest('a') as HTMLElement;
    expect(within(b).getByText(/Ainda não executado/)).toBeTruthy();
    expect(within(b).getByText('ainda não concluído')).toBeTruthy();
  });

  it('deixa clara a diferença entre última execução e última conclusão', async () => {
    getAthleteOverview.mockResolvedValue(overview({ lastDoneOn: '2026-10-16', lastCompletedOn: '2026-10-14', completedCount: 7 }));
    await renderAthlete();
    const a = screen.getByText('Treino A').closest('a') as HTMLElement;
    expect(within(a).getByText(/Última execução: 16\/10\/2026/)).toBeTruthy();
    expect(within(a).getByText('Última conclusão: 14/10/2026')).toBeTruthy();
  });

  it('treino executado mas nunca concluído não mostra contagem inventada', async () => {
    getAthleteOverview.mockResolvedValue(overview({ completedCount: 0, lastCompletedOn: undefined }));
    await renderAthlete();
    const a = screen.getByText('Treino A').closest('a') as HTMLElement;
    expect(within(a).getByText('ainda não concluído')).toBeTruthy();
    expect(within(a).queryByTitle('Vezes que este treino foi concluído')).toBeNull();
  });
});

void act;
