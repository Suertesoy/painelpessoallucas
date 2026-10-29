// @vitest-environment node
import { describe, it, expect, afterEach, vi } from 'vitest';
import { WorkoutCommands } from '@/modules/workouts/application/workout.commands';
import { WorkoutQueries } from '@/modules/workouts/application/workout.queries';
import { buildExerciseSeries } from '@/modules/workouts/domain/workout-stats';
import { countdownPhase, remainingSeconds } from '@/lib/timer';
import { restCountdownOf } from '@/modules/workouts/domain/workout.schema';
import { FakeWorkoutRepository } from './workout-fakes';
import { FakeEventRepository } from './learning-fakes';

const WS = 'c5be4f82-e8c9-403f-a495-59e2d5838d50';
const OUTRO_WS = '0f6b3a52-1d6e-4f0b-9c55-3f1c2b6d7a10';

/** Um "aparelho" (comandos + consultas) sobre o repositório de um workspace. */
function device(repo: FakeWorkoutRepository, workspaceId = WS) {
  return { cmds: new WorkoutCommands(repo, new FakeEventRepository()), queries: new WorkoutQueries(repo), workspaceId };
}

async function house() {
  const repo = new FakeWorkoutRepository();
  const lucasPhone = device(repo);
  const matheusPhone = device(repo);
  const base = await lucasPhone.cmds.ensureBase(WS);
  const lucas = base.athletes.find((a) => a.name === 'Lucas')!;
  const matheus = base.athletes.find((a) => a.name === 'Matheus')!;
  const dayA = base.days.find((d) => d.code === 'A')!;
  const dayB = base.days.find((d) => d.code === 'B')!;
  const supino = await lucasPhone.cmds.saveExercise(WS, { dayId: dayA.id, name: 'Supino inclinado com halteres', sets: 3, restSeconds: 90 });
  const crucifixo = await lucasPhone.cmds.saveExercise(WS, { dayId: dayA.id, name: 'Crucifixo', sets: 3 });
  const remada = await lucasPhone.cmds.saveExercise(WS, { dayId: dayB.id, name: 'Remada', sets: 2 });
  return { repo, lucasPhone, matheusPhone, lucas, matheus, dayA, dayB, supino, crucifixo, remada };
}

afterEach(() => vi.useRealTimers());

describe('editar o nome do exercício', () => {
  it('troca só o nome: mesmo id, mesma posição, descanso, cargas e histórico intactos', async () => {
    const h = await house();
    await h.lucasPhone.cmds.setAthleteLoad(WS, { exerciseId: h.supino.id, athleteId: h.lucas.id, loadKg: 22 });
    await h.lucasPhone.cmds.setAthleteLoad(WS, { exerciseId: h.supino.id, athleteId: h.matheus.id, loadKg: 18 });
    const s = await h.lucasPhone.cmds.startGeneralSession(WS, h.lucas.id, h.dayA.id, '2026-10-16');
    await h.lucasPhone.cmds.logSet(s.id, { exerciseId: h.supino.id, setNumber: 1, loadKg: 22, reps: 10 });
    await h.lucasPhone.cmds.finishSession(s.id);

    const renamed = await h.lucasPhone.cmds.renameExercise(h.supino.id, '  Supino inclinado  ');
    expect(renamed.name).toBe('Supino inclinado');
    expect(h.repo.exercises.size).toBe(3); // nada foi recriado
    const after = h.repo.exercises.get(h.supino.id)!;
    expect(after).toMatchObject({ id: h.supino.id, position: h.supino.position, sets: 3, restSeconds: 90, dayId: h.dayA.id });
    // cargas de cada atleta e séries registradas continuam apontando para o mesmo exercício
    expect(h.repo.loads.get(`${h.supino.id}:${h.lucas.id}`)?.loadKg).toBe(22);
    expect(h.repo.loads.get(`${h.supino.id}:${h.matheus.id}`)?.loadKg).toBe(18);
    expect([...h.repo.setLogs.values()].filter((l) => l.exerciseId === h.supino.id)).toHaveLength(1);
    // o gráfico de evolução continua com o ponto antigo
    const evo = await h.lucasPhone.queries.getEvolution(h.lucas.id);
    expect(evo?.exercises.find((e) => e.exercise.id === h.supino.id)?.points).toHaveLength(1);
    expect(buildExerciseSeries([...h.repo.setLogs.values()], [...h.repo.sessions.values()], h.supino.id)).toHaveLength(1);
  });

  it('recusa nome vazio ou só com espaços, nome enorme e exercício inexistente/removido', async () => {
    const h = await house();
    await expect(h.lucasPhone.cmds.renameExercise(h.supino.id, '   ')).rejects.toThrow();
    await expect(h.lucasPhone.cmds.renameExercise(h.supino.id, 'x'.repeat(121))).rejects.toThrow();
    await expect(h.lucasPhone.cmds.renameExercise('00000000-0000-4000-8000-000000000000', 'Novo')).rejects.toThrow(/não encontrado/);
    await h.lucasPhone.cmds.removeExercise(h.crucifixo.id);
    await expect(h.lucasPhone.cmds.renameExercise(h.crucifixo.id, 'Outro')).rejects.toThrow(/não encontrado/);
    expect(h.repo.exercises.get(h.supino.id)!.name).toBe('Supino inclinado com halteres');
  });

  it('mesmo nome é no-op (não mexe em nada)', async () => {
    const h = await house();
    const again = await h.lucasPhone.cmds.renameExercise(h.supino.id, 'Supino inclinado com halteres');
    expect(again.name).toBe('Supino inclinado com halteres');
  });
});

describe('ficha compartilhada entre Lucas e Matheus (mesmo workspace)', () => {
  it('o que um edita na estrutura aparece para o outro; as cargas continuam individuais', async () => {
    const h = await house();
    await h.lucasPhone.cmds.renameExercise(h.crucifixo.id, 'Crucifixo máquina');
    // Matheus, no aparelho dele, vê o nome novo na MESMA entidade
    const seenByMatheus = await h.matheusPhone.queries.getRoutine();
    expect(seenByMatheus.days.find((d) => d.day.id === h.dayA.id)!.exercises.map((e) => e.name)).toContain('Crucifixo máquina');

    // e a recíproca: Matheus muda a ordem/descanso, Lucas enxerga
    await h.matheusPhone.cmds.setExerciseRest(h.supino.id, 120);
    await h.matheusPhone.cmds.moveExercise(h.crucifixo.id, 'up');
    const seenByLucas = await h.lucasPhone.queries.getRoutine();
    const dayA = seenByLucas.days.find((d) => d.day.id === h.dayA.id)!;
    expect(dayA.exercises.map((e) => e.name)).toEqual(['Crucifixo máquina', 'Supino inclinado com halteres']);
    expect(dayA.exercises.find((e) => e.id === h.supino.id)!.restSeconds).toBe(120);

    // cargas: cada um com a sua
    await h.lucasPhone.cmds.setAthleteLoad(WS, { exerciseId: h.crucifixo.id, athleteId: h.lucas.id, loadKg: 30 });
    await h.matheusPhone.cmds.setAthleteLoad(WS, { exerciseId: h.crucifixo.id, athleteId: h.matheus.id, loadKg: 12 });
    const routine = await h.lucasPhone.queries.getRoutine();
    const loadOf = (athleteId: string) => routine.loads.find((l) => l.exerciseId === h.crucifixo.id && l.athleteId === athleteId)?.loadKg;
    expect(loadOf(h.lucas.id)).toBe(30);
    expect(loadOf(h.matheus.id)).toBe(12);
  });

  it('registros de execução ficam por atleta: séries, progresso, contagem e histórico não se misturam', async () => {
    const h = await house();
    const sl = await h.lucasPhone.cmds.startGeneralSession(WS, h.lucas.id, h.dayA.id, '2026-10-16');
    const sm = await h.matheusPhone.cmds.startGeneralSession(WS, h.matheus.id, h.dayA.id, '2026-10-16');
    expect(sl.id).not.toBe(sm.id);
    await h.lucasPhone.cmds.logSet(sl.id, { exerciseId: h.supino.id, setNumber: 1, reps: 10 });
    await h.lucasPhone.cmds.logSet(sl.id, { exerciseId: h.supino.id, setNumber: 2, reps: 10 });
    await h.matheusPhone.cmds.logSet(sm.id, { exerciseId: h.supino.id, setNumber: 1, reps: 8 });

    const viewL = await h.lucasPhone.queries.getSessionView(sl.id);
    const viewM = await h.matheusPhone.queries.getSessionView(sm.id);
    expect(viewL!.exercises.find((e) => e.exercise.id === h.supino.id)!.progress).toMatchObject({ done: 2, total: 3, state: 'in_progress' });
    expect(viewM!.exercises.find((e) => e.exercise.id === h.supino.id)!.progress).toMatchObject({ done: 1, total: 3, state: 'in_progress' });

    // renomear (estrutura) não mexe no progresso de ninguém
    await h.matheusPhone.cmds.renameExercise(h.supino.id, 'Supino inclinado');
    const afterL = await h.lucasPhone.queries.getSessionView(sl.id);
    expect(afterL!.exercises.find((e) => e.exercise.id === h.supino.id)).toMatchObject({ progress: { done: 2 }, exercise: { name: 'Supino inclinado' } });

    await h.lucasPhone.cmds.completeDay(sl.id, h.dayA.id);
    await h.lucasPhone.cmds.finishSession(sl.id);
    const overL = await h.lucasPhone.queries.getAthleteOverview(h.lucas.id);
    const overM = await h.matheusPhone.queries.getAthleteOverview(h.matheus.id);
    expect(overL!.days.find((d) => d.day.id === h.dayA.id)!.completedCount).toBe(1);
    expect(overM!.days.find((d) => d.day.id === h.dayA.id)!.completedCount).toBe(0); // o Matheus não tocou em Concluir Treino
  });

  it('isolamento entre workspaces: a ficha de outra casa não muda nem aparece', async () => {
    const h = await house();
    const otherRepo = new FakeWorkoutRepository();
    const other = device(otherRepo, OUTRO_WS);
    const otherBase = await other.cmds.ensureBase(OUTRO_WS);
    const otherDay = otherBase.days.find((d) => d.code === 'A')!;
    const otherEx = await other.cmds.saveExercise(OUTRO_WS, { dayId: otherDay.id, name: 'Supino', sets: 3 });

    await h.lucasPhone.cmds.renameExercise(h.supino.id, 'Nome da casa 1');
    expect(otherRepo.exercises.get(otherEx.id)!.name).toBe('Supino');
    expect((await other.queries.getRoutine()).days.flatMap((d) => d.exercises.map((e) => e.name))).toEqual(['Supino']);
    // as entidades de cada casa são distintas (nenhum id compartilhado)
    expect([...h.repo.exercises.keys()].includes(otherEx.id)).toBe(false);
  });
});

describe('progresso por exercício na sessão', () => {
  it('reflete os registros reais: concluir, desfazer e voltar ao estado inicial; indicador do topo acompanha', async () => {
    const h = await house();
    const s = await h.lucasPhone.cmds.startGeneralSession(WS, h.lucas.id, h.dayA.id, '2026-10-16');
    const view = async () => (await h.lucasPhone.queries.getSessionView(s.id))!;
    const prog = async (id: string) => (await view()).exercises.find((e) => e.exercise.id === id)!.progress;

    expect(await prog(h.supino.id)).toMatchObject({ done: 0, state: 'not_started' });
    expect((await view()).dayProgress).toEqual({ completed: 0, total: 2 });

    for (const n of [1, 2, 3]) await h.lucasPhone.cmds.logSet(s.id, { exerciseId: h.supino.id, setNumber: n, reps: 10 });
    expect(await prog(h.supino.id)).toMatchObject({ done: 3, total: 3, state: 'done' });
    expect((await view()).dayProgress).toEqual({ completed: 1, total: 2 });

    await h.lucasPhone.cmds.unlogSet(s.id, h.supino.id, 3);
    expect(await prog(h.supino.id)).toMatchObject({ done: 2, state: 'in_progress' });
    expect((await view()).dayProgress).toEqual({ completed: 0, total: 2 });

    await h.lucasPhone.cmds.unlogSet(s.id, h.supino.id, 1);
    await h.lucasPhone.cmds.unlogSet(s.id, h.supino.id, 2);
    expect(await prog(h.supino.id)).toMatchObject({ done: 0, state: 'not_started' });
  });

  it('trocar de treino e voltar não perde o progresso nem reinicia a sessão', async () => {
    const h = await house();
    const s = await h.lucasPhone.cmds.startGeneralSession(WS, h.lucas.id, h.dayA.id, '2026-10-16');
    await h.lucasPhone.cmds.logSet(s.id, { exerciseId: h.supino.id, setNumber: 1, reps: 10 });
    await h.lucasPhone.cmds.focusDay(s.id, h.dayB.id);
    expect((await h.lucasPhone.queries.getSessionView(s.id))!.dayProgress).toEqual({ completed: 0, total: 1 });
    await h.lucasPhone.cmds.focusDay(s.id, h.dayA.id);
    const back = (await h.lucasPhone.queries.getSessionView(s.id))!;
    expect(back.exercises.find((e) => e.exercise.id === h.supino.id)!.progress.done).toBe(1);
    expect(back.session.startedAt).toBe(s.startedAt);
  });
});

describe('contador de treinos concluídos (conclusão explícita)', () => {
  async function runSession(h: Awaited<ReturnType<typeof house>>, athleteId: string, date: string, plan: { exerciseId: string; sets: number }[], end: 'finish' | 'cancel' | 'leave') {
    const s = await h.lucasPhone.cmds.startGeneralSession(WS, athleteId, h.dayA.id, date);
    for (const p of plan) for (let n = 1; n <= p.sets; n += 1) await h.lucasPhone.cmds.logSet(s.id, { exerciseId: p.exerciseId, setNumber: n, reps: 10 });
    if (end === 'finish') await h.lucasPhone.cmds.finishSession(s.id);
    if (end === 'cancel') await h.lucasPhone.cmds.cancelSession(s.id);
    return s;
  }
  const countA = async (h: Awaited<ReturnType<typeof house>>, athleteId: string) =>
    (await h.lucasPhone.queries.getAthleteOverview(athleteId))!.days.find((d) => d.day.id === h.dayA.id)!;
  // Datas posteriores ao corte legado: só a conclusão explícita conta.
  const D1 = '2026-11-02';
  const D2 = '2026-11-03';

  it('abrir a ficha, registrar séries e sair (ou encerrar a academia) sem concluir não incrementa', async () => {
    const h = await house();
    await h.lucasPhone.queries.getDayPreview(h.lucas.id, h.dayA.id);
    await runSession(h, h.lucas.id, D1, [{ exerciseId: h.supino.id, sets: 3 }, { exerciseId: h.crucifixo.id, sets: 3 }], 'finish');
    const r = await countA(h, h.lucas.id);
    expect(r.completedCount).toBe(0); // 100% dos exercícios, academia encerrada, mas sem toque
    expect(r.lastDoneOn).toBe(D1);
    await runSession(h, h.lucas.id, D2, [{ exerciseId: h.supino.id, sets: 1 }], 'leave');
    expect((await countA(h, h.lucas.id)).completedCount).toBe(0);
  });

  it('treino parcial concluído pelo botão conta uma vez; sem série alguma também (a decisão é do usuário)', async () => {
    const h = await house();
    const s = await runSession(h, h.lucas.id, D1, [{ exerciseId: h.supino.id, sets: 1 }], 'leave'); // 1 de 2 exercícios, 1 de 3 séries
    await h.lucasPhone.cmds.completeDay(s.id, h.dayA.id);
    const r = await countA(h, h.lucas.id);
    expect(r.completedCount).toBe(1);
    expect(r.lastCompletedOn).toBe(D1);
  });

  it('duplo toque e toques repetidos não duplicam; mantém a conclusão original', async () => {
    const h = await house();
    const s = await runSession(h, h.lucas.id, D1, [{ exerciseId: h.supino.id, sets: 1 }], 'leave');
    const [a, b] = await Promise.all([h.lucasPhone.cmds.completeDay(s.id, h.dayA.id), h.lucasPhone.cmds.completeDay(s.id, h.dayA.id)]);
    const again = await h.lucasPhone.cmds.completeDay(s.id, h.dayA.id);
    expect(new Set([a.id, b.id, again.id]).size).toBe(1);
    expect(h.repo.completions.size).toBe(1);
    expect((await countA(h, h.lucas.id)).completedCount).toBe(1);
  });

  it('concluir a ficha não encerra a academia: sessão segue em andamento e dá para concluir outra ficha', async () => {
    const h = await house();
    const s = await runSession(h, h.lucas.id, D1, [{ exerciseId: h.supino.id, sets: 1 }], 'leave');
    await h.lucasPhone.cmds.completeDay(s.id, h.dayA.id);
    expect((await h.repo.findSession(s.id))!.status).toBe('in_progress');
    await h.lucasPhone.cmds.logSet(s.id, { exerciseId: h.remada.id, setNumber: 1, reps: 10 });
    await h.lucasPhone.cmds.completeDay(s.id, h.dayB.id);
    expect((await h.lucasPhone.queries.getSessionView(s.id))!.completedDayIds.sort()).toEqual([h.dayA.id, h.dayB.id].sort());
    await h.lucasPhone.cmds.finishSession(s.id); // encerrar academia não cria nem remove conclusões
    expect(h.repo.completions.size).toBe(2);
    const over = (await h.lucasPhone.queries.getAthleteOverview(h.lucas.id))!;
    expect(over.days.find((d) => d.day.id === h.dayA.id)!.completedCount).toBe(1);
    expect(over.days.find((d) => d.day.id === h.dayB.id)!.completedCount).toBe(1);
  });

  it('só em sessão em andamento; sessão cancelada ou encerrada recusa', async () => {
    const h = await house();
    const s = await runSession(h, h.lucas.id, D1, [{ exerciseId: h.supino.id, sets: 1 }], 'cancel');
    await expect(h.lucasPhone.cmds.completeDay(s.id, h.dayA.id)).rejects.toThrow(/encerrado/);
    expect(h.repo.completions.size).toBe(0);
  });

  it('contadores são individuais por atleta e por ficha', async () => {
    const h = await house();
    const sl = await runSession(h, h.lucas.id, D1, [{ exerciseId: h.supino.id, sets: 2 }], 'leave');
    await h.lucasPhone.cmds.completeDay(sl.id, h.dayA.id);
    await h.lucasPhone.cmds.finishSession(sl.id);
    const sm = await runSession(h, h.matheus.id, D2, [{ exerciseId: h.supino.id, sets: 3 }], 'finish'); // Matheus não concluiu
    expect(sm.athleteId).toBe(h.matheus.id);
    expect((await countA(h, h.lucas.id)).completedCount).toBe(1);
    expect((await countA(h, h.matheus.id)).completedCount).toBe(0);
    const lucasB = (await h.lucasPhone.queries.getAthleteOverview(h.lucas.id))!.days.find((d) => d.day.id === h.dayB.id)!;
    expect(lucasB.completedCount).toBe(0);
  });

  it('legado: sessões até o corte seguem estimadas à parte, sem virar conclusão explícita nem duplicar com o toque', async () => {
    const h = await house();
    await runSession(h, h.lucas.id, '2026-10-12', [{ exerciseId: h.supino.id, sets: 3 }, { exerciseId: h.crucifixo.id, sets: 3 }], 'finish');
    await runSession(h, h.lucas.id, '2026-10-13', [{ exerciseId: h.supino.id, sets: 3 }], 'cancel');
    const before = await countA(h, h.lucas.id);
    expect(before.completedCount).toBe(0);
    expect(before.legacyCompletedCount).toBe(1);
    expect(before.legacyLastCompletedOn).toBe('2026-10-12');
    // nada foi reescrito no histórico
    expect([...h.repo.sessions.values()].map((x) => x.status).sort()).toEqual(['cancelled', 'completed']);
    expect(h.repo.completions.size).toBe(0);
    // sessão nova após o corte com ≥50% e sem toque: não vira legado
    await runSession(h, h.lucas.id, D1, [{ exerciseId: h.supino.id, sets: 3 }, { exerciseId: h.crucifixo.id, sets: 3 }], 'finish');
    expect((await countA(h, h.lucas.id)).legacyCompletedCount).toBe(1);
  });

  it('renomear ou ocultar exercícios depois não apaga conclusões já registradas', async () => {
    const h = await house();
    const s = await runSession(h, h.lucas.id, D1, [{ exerciseId: h.supino.id, sets: 3 }], 'leave');
    await h.lucasPhone.cmds.completeDay(s.id, h.dayA.id);
    await h.matheusPhone.cmds.renameExercise(h.supino.id, 'Supino');
    await h.matheusPhone.cmds.hideExercise(h.crucifixo.id);
    expect((await countA(h, h.lucas.id)).completedCount).toBe(1);
  });
});

describe('histórico de treinos', () => {
  async function seed() {
    const h = await house();
    vi.useFakeTimers();
    // Lucas: sessão passando por A e B, 1h05
    vi.setSystemTime(new Date('2026-10-28T12:00:00Z'));
    const s1 = await h.lucasPhone.cmds.startGeneralSession(WS, h.lucas.id, h.dayA.id, '2026-10-28');
    await h.lucasPhone.cmds.logSet(s1.id, { exerciseId: h.supino.id, setNumber: 1, loadKg: 20, reps: 10 });
    await h.lucasPhone.cmds.logSet(s1.id, { exerciseId: h.supino.id, setNumber: 2, loadKg: 22, reps: 8 });
    await h.lucasPhone.cmds.focusDay(s1.id, h.dayB.id);
    await h.lucasPhone.cmds.logSet(s1.id, { exerciseId: h.remada.id, setNumber: 1, loadKg: 30, reps: 12 });
    await h.lucasPhone.cmds.completeDay(s1.id, h.dayA.id);
    vi.setSystemTime(new Date('2026-10-28T13:05:00Z'));
    await h.lucasPhone.cmds.finishSession(s1.id);
    // Matheus: sessão de 10h53 (esquecida aberta), 1 série
    vi.setSystemTime(new Date('2026-10-27T08:00:00Z'));
    const s2 = await h.matheusPhone.cmds.startGeneralSession(WS, h.matheus.id, h.dayA.id, '2026-10-27');
    await h.matheusPhone.cmds.logSet(s2.id, { exerciseId: h.supino.id, setNumber: 1, loadKg: 18, reps: 10 });
    vi.setSystemTime(new Date('2026-10-27T18:53:00Z'));
    await h.matheusPhone.cmds.finishSession(s2.id);
    // Lucas: sessão cancelada sem séries
    vi.setSystemTime(new Date('2026-10-26T09:00:00Z'));
    const s3 = await h.lucasPhone.cmds.startGeneralSession(WS, h.lucas.id, h.dayA.id, '2026-10-26');
    vi.setSystemTime(new Date('2026-10-26T09:05:00Z'));
    await h.lucasPhone.cmds.cancelSession(s3.id);
    return { h, s1, s2, s3 };
  }

  it('séries, exercícios distintos, fichas e duração reais; sessão com mais de uma ficha não vira dois dias', async () => {
    const { h } = await seed();
    const hist = (await h.lucasPhone.queries.getWorkoutHistory(h.lucas.id))!;
    expect(hist.entries.map((e) => e.session.sessionDate)).toEqual(['2026-10-28', '2026-10-26']); // mais recente primeiro
    const e = hist.entries[0];
    expect(e).toMatchObject({ totalSets: 3, exerciseCount: 2, dayCodes: ['A', 'B'], completedDayCodes: ['A'], durationSeconds: 65 * 60, atypicalDuration: false });
    expect(e.exercises.find((x) => x.name.startsWith('Supino'))!.sets).toEqual([
      expect.objectContaining({ setNumber: 1, loadKg: 20, reps: 10 }),
      expect.objectContaining({ setNumber: 2, loadKg: 22, reps: 8 }),
    ]);
    expect(e.exercises.find((x) => x.name === 'Remada')).toMatchObject({ dayCode: 'B' });
  });

  it('sessão cancelada/sem séries aparece sem inventar exercícios', async () => {
    const { h } = await seed();
    const cancelled = (await h.lucasPhone.queries.getWorkoutHistory(h.lucas.id))!.entries[1];
    expect(cancelled).toMatchObject({ totalSets: 0, exerciseCount: 0, dayCodes: [], exercises: [], durationSeconds: 5 * 60 });
    expect(cancelled.session.status).toBe('cancelled');
  });

  it('duração muito longa só é sinalizada: nada é cortado nem alterado', async () => {
    const { h, s2 } = await seed();
    const m = (await h.matheusPhone.queries.getWorkoutHistory(h.matheus.id))!.entries[0];
    expect(m.durationSeconds).toBe((10 * 60 + 53) * 60);
    expect(m.atypicalDuration).toBe(true);
    expect((await h.repo.findSession(s2.id))!.endedAt).toBe('2026-10-27T18:53:00.000Z');
  });

  it('históricos de Lucas e Matheus não se misturam', async () => {
    const { h } = await seed();
    const lucas = (await h.lucasPhone.queries.getWorkoutHistory(h.lucas.id))!;
    const matheus = (await h.matheusPhone.queries.getWorkoutHistory(h.matheus.id))!;
    expect(matheus.entries).toHaveLength(1);
    expect(matheus.entries[0].exercises.flatMap((x) => x.sets.map((s) => s.loadKg))).toEqual([18]);
    expect(lucas.entries.every((e) => e.session.athleteId === h.lucas.id)).toBe(true);
    expect(lucas.entries[0].completedDayCodes).toEqual(['A']);
    expect(matheus.entries[0].completedDayCodes).toEqual([]);
  });

  it('paginação: hasMore indica sessões mais antigas', async () => {
    const { h } = await seed();
    const page = (await h.lucasPhone.queries.getWorkoutHistory(h.lucas.id, 1))!;
    expect(page.entries).toHaveLength(1);
    expect(page.hasMore).toBe(true);
  });
});

describe('cronômetros: continuidade e prazo após voltar ao app', () => {
  it('o prazo do descanso vive na sessão: trocar de treino e renomear não o perde; o geral segue contando', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-16T10:00:00Z'));
    const h = await house();
    const s = await h.lucasPhone.cmds.startGeneralSession(WS, h.lucas.id, h.dayA.id, '2026-10-16');
    await h.lucasPhone.cmds.startRest(s.id, 90);
    const ends = h.repo.sessions.get(s.id)!.restEndsAt!;

    await h.lucasPhone.cmds.focusDay(s.id, h.dayB.id);
    await h.matheusPhone.cmds.renameExercise(h.supino.id, 'Supino');
    const kept = h.repo.sessions.get(s.id)!;
    expect(kept.restEndsAt).toBe(ends);
    expect(kept.startedAt).toBe(s.startedAt);

    vi.setSystemTime(new Date('2026-10-16T10:00:30Z'));
    expect(remainingSeconds(restCountdownOf(kept), Date.now())).toBe(60);
    // o descanso não interfere no cronômetro geral: limpar o descanso mantém o início da sessão
    await h.lucasPhone.cmds.clearRest(s.id);
    expect(h.repo.sessions.get(s.id)!.startedAt).toBe(s.startedAt);
    expect(h.repo.sessions.get(s.id)!.status).toBe('in_progress');
  });

  it('voltar ao app depois do fim do descanso mostra "terminou" (prazo por timestamp), sem JavaScript em segundo plano', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-16T10:00:00Z'));
    const h = await house();
    const s = await h.lucasPhone.cmds.startGeneralSession(WS, h.lucas.id, h.dayA.id, '2026-10-16');
    await h.lucasPhone.cmds.startRest(s.id, 60);
    // tela bloqueada por 5 minutos; nenhum código rodou nesse intervalo
    vi.setSystemTime(new Date('2026-10-16T10:05:00Z'));
    const state = restCountdownOf(h.repo.sessions.get(s.id)!);
    expect(countdownPhase(state, Date.now())).toBe('finished');
    expect(remainingSeconds(state, Date.now())).toBe(0);
  });

  it('descanso pausado congela os segundos e retomar continua do ponto certo', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-16T10:00:00Z'));
    const h = await house();
    const s = await h.lucasPhone.cmds.startGeneralSession(WS, h.lucas.id, h.dayA.id, '2026-10-16');
    await h.lucasPhone.cmds.startRest(s.id, 90);
    vi.setSystemTime(new Date('2026-10-16T10:00:20Z'));
    await h.lucasPhone.cmds.pauseRest(s.id);
    vi.setSystemTime(new Date('2026-10-16T10:10:00Z')); // muito depois
    expect(remainingSeconds(restCountdownOf(h.repo.sessions.get(s.id)!), Date.now())).toBe(70);
    await h.lucasPhone.cmds.resumeRest(s.id);
    expect(remainingSeconds(restCountdownOf(h.repo.sessions.get(s.id)!), Date.now())).toBe(70);
  });
});
