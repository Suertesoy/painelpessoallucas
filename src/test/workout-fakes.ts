import type { WorkoutRepository } from '@/modules/workouts/application/workout.repository';
import type {
  BodyWeightLog,
  ExerciseLoad,
  SetLog,
  WorkoutAthlete,
  WorkoutDay,
  WorkoutExercise,
  WorkoutSession,
} from '@/modules/workouts/domain/workout.schema';

/** Repositório em memória de Treinos — mesmas garantias de unicidade do banco. */
export class FakeWorkoutRepository implements WorkoutRepository {
  athletes = new Map<string, WorkoutAthlete>();
  days = new Map<string, WorkoutDay>();
  exercises = new Map<string, WorkoutExercise>();
  loads = new Map<string, ExerciseLoad>();
  sessions = new Map<string, WorkoutSession>();
  setLogs = new Map<string, SetLog>();
  weights = new Map<string, BodyWeightLog>();

  async listAthletes() { return [...this.athletes.values()]; }
  async saveAthletes(a: WorkoutAthlete[]) { a.forEach((x) => this.athletes.set(x.id, x)); }
  async listDays() { return [...this.days.values()]; }
  async saveDays(d: WorkoutDay[]) { d.forEach((x) => this.days.set(x.id, x)); }
  async listExercises() { return [...this.exercises.values()]; }
  async findExercise(id: string) { return this.exercises.get(id) ?? null; }
  async saveExercises(e: WorkoutExercise[]) { e.forEach((x) => this.exercises.set(x.id, x)); }
  async listLoads() { return [...this.loads.values()]; }
  async saveLoads(l: ExerciseLoad[]) { l.forEach((x) => this.loads.set(`${x.exerciseId}:${x.athleteId}`, x)); }
  async findSession(id: string) { return this.sessions.get(id) ?? null; }
  async findActiveSession(athleteId: string) {
    return [...this.sessions.values()].find((s) => s.athleteId === athleteId && s.status === 'in_progress') ?? null;
  }
  async listSessions(athleteId: string, limit: number) {
    return [...this.sessions.values()]
      .filter((s) => s.athleteId === athleteId)
      .sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1))
      .slice(0, limit);
  }
  async saveSession(s: WorkoutSession) { this.sessions.set(s.id, s); }
  async listSetLogsBySession(sessionId: string) { return [...this.setLogs.values()].filter((l) => l.sessionId === sessionId); }
  async listSetLogsByAthlete(athleteId: string, limit: number) {
    return [...this.setLogs.values()]
      .filter((l) => l.athleteId === athleteId)
      .sort((a, b) => (a.completedAt < b.completedAt ? 1 : -1))
      .slice(0, limit);
  }
  async saveSetLog(l: SetLog) { this.setLogs.set(l.id, l); }
  async deleteSetLog(id: string) { this.setLogs.delete(id); }
  async listBodyWeights(athleteId: string) { return [...this.weights.values()].filter((w) => w.athleteId === athleteId); }
  async saveBodyWeight(l: BodyWeightLog) {
    // Unicidade (atleta, dia) como no banco: o último registro do dia vence.
    for (const [id, w] of this.weights) if (w.athleteId === l.athleteId && w.loggedOn === l.loggedOn) this.weights.delete(id);
    this.weights.set(l.id, l);
  }
  async deleteBodyWeight(id: string) { this.weights.delete(id); }
  subscribe() { return () => {}; }
}
