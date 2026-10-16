import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { WorkoutCommands } from '@/modules/workouts/application/workout.commands';
import { WorkoutQueries } from '@/modules/workouts/application/workout.queries';
import { buildExerciseSeries } from '@/modules/workouts/domain/workout-stats';
import { remainingSeconds } from '@/lib/timer';
import { restCountdownOf } from '@/modules/workouts/domain/workout.schema';
import { FakeWorkoutRepository } from './workout-fakes';
import { FakeEventRepository } from './learning-fakes';

const WS = 'c5be4f82-e8c9-403f-a495-59e2d5838d50';

async function setup() {
  const repo = new FakeWorkoutRepository();
  const events = new FakeEventRepository();
  const cmds = new WorkoutCommands(repo, events);
  const queries = new WorkoutQueries(repo);
  const base = await cmds.ensureBase(WS);
  const lucas = base.athletes.find((a) => a.name === 'Lucas')!;
  const matheus = base.athletes.find((a) => a.name === 'Matheus')!;
  const dayA = base.days.find((d) => d.code === 'A')!;
  return { repo, events, cmds, queries, lucas, matheus, dayA, base };
}

describe('base: atletas e dias', () => {
  it('cria Lucas, Matheus e A–E, de forma idempotente', async () => {
    const { cmds, base } = await setup();
    expect(base.athletes.map((a) => a.name)).toEqual(['Lucas', 'Matheus']);
    expect(base.days.map((d) => d.code)).toEqual(['A', 'B', 'C', 'D', 'E']);
    const again = await cmds.ensureBase(WS);
    expect(again.athletes).toHaveLength(2);
    expect(again.days).toHaveLength(5);
  });
});

describe('importação da planilha', () => {
  it('importa 38 exercícios, separa cargas por atleta e é idempotente', async () => {
    const { cmds, repo, lucas, matheus } = await setup();
    const r = await cmds.importSheetRoutine(WS);
    expect(r.created).toBe(38);
    expect(r.needsReview).toBeGreaterThan(0);

    const adutora = [...repo.exercises.values()].find((e) => e.name === 'Cadeira adutora')!;
    expect(repo.loads.get(`${adutora.id}:${lucas.id}`)?.loadKg).toBe(43);
    expect(repo.loads.get(`${adutora.id}:${matheus.id}`)?.loadKg).toBe(50);

    const again = await cmds.importSheetRoutine(WS);
    expect(again.created).toBe(0);
    expect(repo.exercises.size).toBe(38);
  });

  it('exercício removido pelo usuário não volta numa reimportação', async () => {
    const { cmds, repo } = await setup();
    await cmds.importSheetRoutine(WS);
    const ex = [...repo.exercises.values()].find((e) => e.name === 'Pullover')!;
    await cmds.removeExercise(ex.id);
    await cmds.importSheetRoutine(WS);
    expect(repo.exercises.get(ex.id)?.removedAt).toBeDefined();
    expect(repo.exercises.size).toBe(38);
  });
});

describe('rotina: edição', () => {
  it('adiciona, edita, reordena e remove sem apagar histórico', async () => {
    const { cmds, repo, queries, dayA } = await setup();
    const a = await cmds.saveExercise(WS, { dayId: dayA.id, name: 'Supino', sets: 3, repsMin: 8, repsMax: 12 });
    const b = await cmds.saveExercise(WS, { dayId: dayA.id, name: 'Remada', sets: 3 });
    expect([a.position, b.position]).toEqual([0, 1]);

    await cmds.moveExercise(b.id, 'up');
    let routine = await queries.getRoutine();
    expect(routine.days[0].exercises.map((e) => e.name)).toEqual(['Remada', 'Supino']);

    const edited = await cmds.saveExercise(WS, { id: a.id, dayId: dayA.id, name: 'Supino reto', sets: 4, videoUrl: 'https://exemplo.com/v' });
    expect(edited).toMatchObject({ name: 'Supino reto', sets: 4, videoUrl: 'https://exemplo.com/v' });

    await cmds.removeExercise(b.id);
    routine = await queries.getRoutine();
    expect(routine.days[0].exercises.map((e) => e.name)).toEqual(['Supino reto']);
    expect(repo.exercises.has(b.id)).toBe(true);
  });

  it('valida: nome obrigatório, reps mín ≤ máx, link com https, carga não negativa', async () => {
    const { cmds, dayA, lucas } = await setup();
    await expect(cmds.saveExercise(WS, { dayId: dayA.id, name: ' ', sets: 3 })).rejects.toThrow();
    await expect(cmds.saveExercise(WS, { dayId: dayA.id, name: 'X', sets: 3, repsMin: 12, repsMax: 8 })).rejects.toThrow();
    await expect(cmds.saveExercise(WS, { dayId: dayA.id, name: 'X', sets: 3, imageUrl: 'javascript:alert(1)' })).rejects.toThrow();
    const ex = await cmds.saveExercise(WS, { dayId: dayA.id, name: 'X', sets: 3 });
    await expect(cmds.setAthleteLoad(WS, { exerciseId: ex.id, athleteId: lucas.id, loadKg: -5 })).rejects.toThrow();
  });

  it('salvar um exercício a confirmar limpa o alerta', async () => {
    const { cmds, repo } = await setup();
    await cmds.importSheetRoutine(WS);
    const flagged = [...repo.exercises.values()].find((e) => e.needsReview)!;
    const saved = await cmds.saveExercise(WS, { id: flagged.id, dayId: flagged.dayId, name: flagged.name, sets: flagged.sets });
    expect(saved.needsReview).toBe(false);
  });
});

describe('sessões, séries e históricos separados', () => {
  let ctx: Awaited<ReturnType<typeof setup>>;
  let exId: string;

  beforeEach(async () => {
    ctx = await setup();
    const ex = await ctx.cmds.saveExercise(WS, { dayId: ctx.dayA.id, name: 'Leg 45', sets: 3, repsMin: 10, repsMax: 12, restSeconds: 120 });
    exId = ex.id;
    await ctx.cmds.setAthleteLoad(WS, { exerciseId: exId, athleteId: ctx.lucas.id, loadKg: 70 });
  });

  it('uma sessão ativa por pessoa; Matheus treina em paralelo', async () => {
    const s = await ctx.cmds.startSession(WS, ctx.lucas.id, ctx.dayA.id, '2026-10-15');
    await expect(ctx.cmds.startSession(WS, ctx.lucas.id, ctx.dayA.id)).rejects.toThrow(/em andamento/);
    const m = await ctx.cmds.startSession(WS, ctx.matheus.id, ctx.dayA.id, '2026-10-15');
    expect(m.id).not.toBe(s.id);
    expect(s.sessionDate).toBe('2026-10-15');
  });

  it('registra séries (idempotente por série) e desfaz', async () => {
    const s = await ctx.cmds.startSession(WS, ctx.lucas.id, ctx.dayA.id);
    await ctx.cmds.logSet(s.id, { exerciseId: exId, setNumber: 1, loadKg: 70, reps: 10 });
    await ctx.cmds.logSet(s.id, { exerciseId: exId, setNumber: 1, loadKg: 72.5, reps: 10 });
    expect(ctx.repo.setLogs.size).toBe(1);
    expect([...ctx.repo.setLogs.values()][0].loadKg).toBe(72.5);
    await ctx.cmds.unlogSet(s.id, exId, 1);
    expect(ctx.repo.setLogs.size).toBe(0);
  });

  it('rejeita repetições negativas e exercício de outro dia', async () => {
    const s = await ctx.cmds.startSession(WS, ctx.lucas.id, ctx.dayA.id);
    await expect(ctx.cmds.logSet(s.id, { exerciseId: exId, setNumber: 1, reps: -1 })).rejects.toThrow();
    const dayB = ctx.base.days.find((d) => d.code === 'B')!;
    const other = await ctx.cmds.saveExercise(WS, { dayId: dayB.id, name: 'Outro', sets: 3 });
    await expect(ctx.cmds.logSet(s.id, { exerciseId: other.id, setNumber: 1, reps: 5 })).rejects.toThrow(/não faz parte/);
  });

  it('concluir o treino atualiza só a carga atual de quem treinou; histórico fica separado', async () => {
    const s = await ctx.cmds.startSession(WS, ctx.lucas.id, ctx.dayA.id, '2026-10-15');
    await ctx.cmds.logSet(s.id, { exerciseId: exId, setNumber: 1, loadKg: 75, reps: 10 });
    await ctx.cmds.finishSession(s.id);

    const loads = await ctx.repo.listLoads();
    expect(loads.find((l) => l.athleteId === ctx.lucas.id)?.loadKg).toBe(75);
    expect(loads.find((l) => l.athleteId === ctx.matheus.id)).toBeUndefined();

    const lucasEvo = await ctx.queries.getEvolution(ctx.lucas.id);
    const matheusEvo = await ctx.queries.getEvolution(ctx.matheus.id);
    expect(lucasEvo?.exercises[0].points[0]).toMatchObject({ topLoadKg: 75, repsAtTop: 10, date: '2026-10-15' });
    expect(matheusEvo?.exercises).toHaveLength(0);
  });

  it('última vez: a sessão seguinte mostra o desempenho anterior do próprio atleta', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-10T12:00:00Z'));
    const s1 = await ctx.cmds.startSession(WS, ctx.lucas.id, ctx.dayA.id, '2026-10-10');
    await ctx.cmds.logSet(s1.id, { exerciseId: exId, setNumber: 1, loadKg: 70, reps: 12 });
    await ctx.cmds.finishSession(s1.id);
    vi.setSystemTime(new Date('2026-10-15T12:00:00Z'));
    const s2 = await ctx.cmds.startSession(WS, ctx.lucas.id, ctx.dayA.id, '2026-10-15');
    const view = await ctx.queries.getSessionView(s2.id);
    vi.useRealTimers();
    expect(view?.exercises[0].previous?.date).toBe('2026-10-10');
    expect(view?.exercises[0].previous?.sets[0]).toMatchObject({ loadKg: 70, reps: 12 });
  });

  it('sessão cancelada não entra na evolução', async () => {
    const s = await ctx.cmds.startSession(WS, ctx.lucas.id, ctx.dayA.id);
    await ctx.cmds.logSet(s.id, { exerciseId: exId, setNumber: 1, loadKg: 70, reps: 10 });
    await ctx.cmds.cancelSession(s.id);
    const logs = await ctx.repo.listSetLogsByAthlete(ctx.lucas.id, 10);
    const series = buildExerciseSeries(logs, await ctx.repo.listSessions(ctx.lucas.id, 10), exId);
    expect(series).toEqual([]);
  });
});

describe('descanso persistido', () => {
  afterEach(() => vi.useRealTimers());

  async function started() {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-15T12:00:00Z'));
    const ctx = await setup();
    const ex = await ctx.cmds.saveExercise(WS, { dayId: ctx.dayA.id, name: 'Leg', sets: 3, restSeconds: 90 });
    const s = await ctx.cmds.startSession(WS, ctx.lucas.id, ctx.dayA.id);
    return { ...ctx, s, ex };
  }
  const left = async (ctx: Awaited<ReturnType<typeof started>>) =>
    remainingSeconds(restCountdownOf((await ctx.repo.findSession(ctx.s.id))!), Date.now());

  it('concluir a série inicia o descanso sugerido, com prazo gravado', async () => {
    const ctx = await started();
    await ctx.cmds.completeSet(ctx.s.id, { exerciseId: ctx.ex.id, setNumber: 1, loadKg: 50, reps: 10 }, 90);
    expect(await left(ctx)).toBe(90);
    const saved = await ctx.repo.findSession(ctx.s.id);
    expect(saved?.restEndsAt).toBe('2026-10-15T12:01:30.000Z');
    vi.setSystemTime(new Date('2026-10-15T12:00:40Z')); // "recarregar a página" 40 s depois
    expect(await left(ctx)).toBe(50);
  });

  it('ajustar, pausar, retomar, reiniciar e encerrar', async () => {
    const ctx = await started();
    await ctx.cmds.startRest(ctx.s.id, 60);
    await ctx.cmds.adjustRest(ctx.s.id, 15);
    expect(await left(ctx)).toBe(75);
    vi.setSystemTime(new Date('2026-10-15T12:00:15Z'));
    await ctx.cmds.pauseRest(ctx.s.id);
    vi.setSystemTime(new Date('2026-10-15T12:10:00Z')); // muito tempo pausado
    expect(await left(ctx)).toBe(60);
    await ctx.cmds.resumeRest(ctx.s.id);
    expect(await left(ctx)).toBe(60);
    await ctx.cmds.restartRest(ctx.s.id);
    expect(await left(ctx)).toBe(75);
    await ctx.cmds.adjustRest(ctx.s.id, -1000);
    expect((await ctx.repo.findSession(ctx.s.id))?.restEndsAt).toBeUndefined();
  });

  it('descanso vencido enquanto o app estava fechado aparece como terminado (0 s)', async () => {
    const ctx = await started();
    await ctx.cmds.startRest(ctx.s.id, 60);
    vi.setSystemTime(new Date('2026-10-15T13:00:00Z'));
    expect(await left(ctx)).toBe(0);
  });

  it('limita o descanso a 30 min e mínimo de 5 s', async () => {
    const ctx = await started();
    await ctx.cmds.startRest(ctx.s.id, 99999);
    expect(await left(ctx)).toBe(1800);
    await ctx.cmds.startRest(ctx.s.id, 1);
    expect(await left(ctx)).toBe(5);
  });
});

describe('peso corporal', () => {
  it('um registro por atleta por dia, histórico separado, valida faixa', async () => {
    const { cmds, queries, lucas, matheus } = await setup();
    await cmds.logBodyWeight(WS, { athleteId: lucas.id, weightKg: 80.04, loggedOn: '2026-10-01' });
    await cmds.logBodyWeight(WS, { athleteId: lucas.id, weightKg: 79, loggedOn: '2026-10-01' });
    await cmds.logBodyWeight(WS, { athleteId: lucas.id, weightKg: 78.5, loggedOn: '2026-10-15' });
    await cmds.logBodyWeight(WS, { athleteId: matheus.id, weightKg: 90, loggedOn: '2026-10-15' });
    const l = await queries.getEvolution(lucas.id);
    expect(l?.bodyWeights.map((w) => w.weightKg)).toEqual([79, 78.5]);
    expect((await queries.getEvolution(matheus.id))?.bodyWeights).toHaveLength(1);
    await expect(cmds.logBodyWeight(WS, { athleteId: lucas.id, weightKg: 5 })).rejects.toThrow();
  });
});

describe('ocultar e reexibir exercícios', () => {
  it('oculto sai do treino e das contagens, continua na rotina e volta ao reexibir; histórico intacto', async () => {
    const { cmds, queries, repo, lucas, dayA } = await setup();
    const a = await cmds.saveExercise(WS, { dayId: dayA.id, name: 'Supino', sets: 3 });
    const b = await cmds.saveExercise(WS, { dayId: dayA.id, name: 'Remada', sets: 3 });

    const s1 = await cmds.startSession(WS, lucas.id, dayA.id, '2026-10-10');
    await cmds.logSet(s1.id, { exerciseId: a.id, setNumber: 1, loadKg: 40, reps: 10 });
    await cmds.finishSession(s1.id);

    await cmds.hideExercise(a.id);
    const routine = await queries.getRoutine();
    expect(routine.days[0].exercises.map((e) => e.name)).toEqual(['Remada']);
    expect(routine.days[0].hidden.map((e) => e.name)).toEqual(['Supino']);
    expect((await queries.getAthleteOverview(lucas.id))?.days[0].exerciseCount).toBe(1);

    const s2 = await cmds.startSession(WS, lucas.id, dayA.id, '2026-10-15');
    const view = await queries.getSessionView(s2.id);
    expect(view?.exercises.map((e) => e.exercise.name)).toEqual(['Remada']);
    await expect(cmds.logSet(s2.id, { exerciseId: b.id, setNumber: 1, reps: 8 })).resolves.toBeDefined();

    // histórico preservado e ocultar não remove
    expect((await queries.getEvolution(lucas.id))?.exercises.map((e) => e.exercise.name)).toContain('Supino');
    expect(repo.exercises.get(a.id)?.removedAt).toBeUndefined();

    await cmds.unhideExercise(a.id);
    const after = await queries.getRoutine();
    expect(after.days[0].exercises.map((e) => e.name).sort()).toEqual(['Remada', 'Supino']);
    expect(after.days[0].hidden).toEqual([]);
  });

  it('editar um exercício oculto o mantém oculto; ocultar é idempotente', async () => {
    const { cmds, repo, dayA } = await setup();
    const a = await cmds.saveExercise(WS, { dayId: dayA.id, name: 'Supino', sets: 3 });
    const h1 = await cmds.hideExercise(a.id);
    const h2 = await cmds.hideExercise(a.id);
    expect(h2.hiddenAt).toBe(h1.hiddenAt);
    await cmds.saveExercise(WS, { id: a.id, dayId: dayA.id, name: 'Supino reto', sets: 4 });
    expect(repo.exercises.get(a.id)?.hiddenAt).toBeDefined();
  });

  it('renomear treino', async () => {
    const { cmds, dayA } = await setup();
    expect((await cmds.renameDay(dayA.id, ' Peito e perna '))).toMatchObject({ title: 'Peito e perna' });
    expect((await cmds.renameDay(dayA.id, '  '))).toMatchObject({ title: undefined });
  });
});

describe('correções do pré-visualizador de importação', () => {
  it('cargas do dia D só são gravadas se confirmadas; descanso corrigido resolve o alerta', async () => {
    const { cmds, repo, lucas, matheus } = await setup();
    await cmds.importSheetRoutine(WS, {
      'D:Frances corda': { matheusKg: 25, lucasKg: 25 },
      'E:Flexão nórdica': { restSeconds: 120 },
      'E:Stiff': { matheusKg: 20 },
    });
    const byName = (n: string) => [...repo.exercises.values()].find((e) => e.name === n)!;
    const frances = byName('Frances corda');
    expect(repo.loads.get(`${frances.id}:${matheus.id}`)?.loadKg).toBe(25);
    expect(repo.loads.get(`${frances.id}:${lucas.id}`)?.loadKg).toBe(25);
    expect(frances.needsReview).toBe(false);

    const triceps = byName('Triceps - barra reta polia alta');
    expect(repo.loads.get(`${triceps.id}:${lucas.id}`)).toBeUndefined();
    expect(triceps.needsReview).toBe(true);

    const nordica = byName('Flexão nórdica');
    expect(nordica.restSeconds).toBe(120);
    expect(nordica.needsReview).toBe(false);
    expect(repo.loads.get(`${byName('Stiff').id}:${matheus.id}`)?.loadKg).toBe(20);
  });
});
