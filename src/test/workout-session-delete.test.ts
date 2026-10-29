// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { WorkoutCommands } from '@/modules/workouts/application/workout.commands';
import { WorkoutQueries } from '@/modules/workouts/application/workout.queries';
import { FakeWorkoutRepository } from './workout-fakes';
import { FakeEventRepository } from './learning-fakes';

const WS = 'c5be4f82-e8c9-403f-a495-59e2d5838d50';

async function house() {
  const repo = new FakeWorkoutRepository();
  const cmds = new WorkoutCommands(repo, new FakeEventRepository());
  const queries = new WorkoutQueries(repo);
  const base = await cmds.ensureBase(WS);
  const lucas = base.athletes.find((a) => a.name === 'Lucas')!;
  const matheus = base.athletes.find((a) => a.name === 'Matheus')!;
  const dayA = base.days.find((d) => d.code === 'A')!;
  const dayB = base.days.find((d) => d.code === 'B')!;
  const supino = await cmds.saveExercise(WS, { dayId: dayA.id, name: 'Supino', sets: 3 });
  const remada = await cmds.saveExercise(WS, { dayId: dayB.id, name: 'Remada', sets: 3 });
  return { repo, cmds, queries, lucas, matheus, dayA, dayB, supino, remada };
}

/** Sessão encerrada com séries em duas fichas e as duas concluídas. */
async function finishedTwoFichas(h: Awaited<ReturnType<typeof house>>, athleteId: string, date: string) {
  const s = await h.cmds.startGeneralSession(WS, athleteId, h.dayA.id, date);
  await h.cmds.logSet(s.id, { exerciseId: h.supino.id, setNumber: 1, loadKg: 20, reps: 10 });
  await h.cmds.logSet(s.id, { exerciseId: h.remada.id, setNumber: 1, loadKg: 30, reps: 8 });
  await h.cmds.completeDay(s.id, h.dayA.id);
  await h.cmds.completeDay(s.id, h.dayB.id);
  await h.cmds.finishSession(s.id);
  return s;
}

describe('exclusão lógica de sessão de treino', () => {
  it('exclui a sessão inteira (todas as fichas) e preserva séries e conclusões no banco', async () => {
    const h = await house();
    const s = await finishedTwoFichas(h, h.lucas.id, '2026-10-16');
    await h.cmds.deleteSession(h.lucas.id, s.id);

    expect(h.repo.sessions.get(s.id)?.deletedAt).toBeTruthy();
    expect([...h.repo.setLogs.values()].filter((l) => l.sessionId === s.id)).toHaveLength(2); // preservadas
    expect([...h.repo.completions.values()].filter((c) => c.sessionId === s.id)).toHaveLength(2);
  });

  it('some do histórico, da contagem de concluídos, da última execução e das séries recentes', async () => {
    const h = await house();
    const keep = await finishedTwoFichas(h, h.lucas.id, '2026-10-20');
    const gone = await finishedTwoFichas(h, h.lucas.id, '2026-10-16');

    const before = await h.queries.getAthleteOverview(h.lucas.id);
    expect(before?.days.find((d) => d.day.id === h.dayA.id)?.completedCount).toBe(2);

    await h.cmds.deleteSession(h.lucas.id, gone.id);

    const history = await h.queries.getWorkoutHistory(h.lucas.id);
    expect(history?.entries.map((e) => e.session.id)).toEqual([keep.id]);

    const after = await h.queries.getAthleteOverview(h.lucas.id);
    expect(after?.days.find((d) => d.day.id === h.dayA.id)?.completedCount).toBe(1);
    expect(after?.days.find((d) => d.day.id === h.dayB.id)?.completedCount).toBe(1);
    expect(after?.days.find((d) => d.day.id === h.dayA.id)?.lastDoneOn).toBe('2026-10-20');
    expect(await h.repo.listSetLogsByAthlete(h.lucas.id, 100)).toHaveLength(2);
    expect((await h.repo.listSetLogTouches(h.lucas.id)).every((t) => t.sessionId === keep.id)).toBe(true);

    const evo = await h.queries.getEvolution(h.lucas.id);
    expect(evo?.exercises.find((e) => e.exercise.id === h.supino.id)?.points).toHaveLength(1);
  });

  it('restaurar devolve tudo: histórico, séries e conclusões', async () => {
    const h = await house();
    const s = await finishedTwoFichas(h, h.lucas.id, '2026-10-16');
    await h.cmds.deleteSession(h.lucas.id, s.id);
    expect((await h.queries.getDeletedWorkouts(h.lucas.id)).map((e) => e.session.id)).toEqual([s.id]);

    await h.cmds.restoreSession(h.lucas.id, s.id);
    expect(h.repo.sessions.get(s.id)?.deletedAt).toBeUndefined();
    const history = await h.queries.getWorkoutHistory(h.lucas.id);
    expect(history?.entries[0]).toMatchObject({ totalSets: 2, completedDayCodes: ['A', 'B'] });
    expect(await h.queries.getDeletedWorkouts(h.lucas.id)).toEqual([]);
  });

  it('excluir duas vezes é idempotente', async () => {
    const h = await house();
    const s = await finishedTwoFichas(h, h.lucas.id, '2026-10-16');
    const first = await h.cmds.deleteSession(h.lucas.id, s.id);
    const second = await h.cmds.deleteSession(h.lucas.id, s.id);
    expect(second.deletedAt).toBe(first.deletedAt);
  });

  it('isolamento por atleta: não exclui a sessão de outra pessoa e o histórico dela não muda', async () => {
    const h = await house();
    const lucasSession = await finishedTwoFichas(h, h.lucas.id, '2026-10-16');
    const matheusSession = await finishedTwoFichas(h, h.matheus.id, '2026-10-16');

    await expect(h.cmds.deleteSession(h.matheus.id, lucasSession.id)).rejects.toThrow(/não pertence/);
    expect(h.repo.sessions.get(lucasSession.id)?.deletedAt).toBeUndefined();

    await h.cmds.deleteSession(h.lucas.id, lucasSession.id);
    const matheus = await h.queries.getWorkoutHistory(h.matheus.id);
    expect(matheus?.entries.map((e) => e.session.id)).toEqual([matheusSession.id]);
    expect(matheus?.entries[0].totalSets).toBe(2);
  });

  it('não exclui treino em andamento nem sessão inexistente', async () => {
    const h = await house();
    const active = await h.cmds.startGeneralSession(WS, h.lucas.id, h.dayA.id, '2026-10-29');
    await expect(h.cmds.deleteSession(h.lucas.id, active.id)).rejects.toThrow(/Encerre/);
    await expect(h.cmds.deleteSession(h.lucas.id, '00000000-0000-4000-8000-000000000000')).rejects.toThrow(/não encontrado/);
  });

  it('sessão excluída não aceita novas séries (findSession não a encontra)', async () => {
    const h = await house();
    const s = await finishedTwoFichas(h, h.lucas.id, '2026-10-16');
    await h.cmds.deleteSession(h.lucas.id, s.id);
    expect(await h.repo.findSession(s.id)).toBeNull();
  });
});

describe('migration da exclusão lógica', () => {
  const sql = readFileSync(join(process.cwd(), 'supabase/migrations/20261029150000_workout_session_soft_delete.sql'), 'utf8');
  const code = sql.split(/\r?\n/).filter((l) => !l.trim().startsWith('--')).join('\n');

  it('é aditiva: só adiciona coluna nula, índice e função — sem delete/drop/update físico', () => {
    expect(code).toMatch(/add column deleted_at timestamptz;/);
    expect(code).not.toMatch(/\bdelete from\b/i);
    expect(code).not.toMatch(/drop (table|column)/i);
    expect(code).not.toMatch(/\bupdate public\.workout_set_logs\b/i);
  });

  it('confere workspace E atleta, recusa sessão em andamento e restringe a função a authenticated', () => {
    expect(code).toContain('is_workspace_member(v_session.workspace_id)');
    expect(code).toContain('v_session.athlete_id <> p_athlete_id');
    expect(code).toContain("v_session.status = 'in_progress'");
    expect(code).toMatch(/revoke execute on function public\.workout_set_session_deleted\(uuid, uuid, boolean\) from public, anon/);
    expect(code).toMatch(/grant execute on function public\.workout_set_session_deleted\(uuid, uuid, boolean\) to authenticated/);
    expect(code).toContain('security invoker');
  });
});
