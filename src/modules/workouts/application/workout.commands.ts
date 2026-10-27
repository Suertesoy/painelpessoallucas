import { EventRepository } from '@/platform/events/event.repository';
import { deterministicUuid } from '@/lib/deterministic-uuid';
import { todayDateStr } from '@/lib/dates';
import { remainingSeconds, countdownPhase } from '@/lib/timer';
import type { WorkoutRepository } from './workout.repository';
import {
  BodyWeightLog,
  BodyWeightLogSchema,
  DEFAULT_WORKOUT_DAY_CODES,
  ExerciseLoad,
  ExerciseLoadSchema,
  LogBodyWeightDTO,
  LogBodyWeightSchema,
  LogSetDTO,
  LogSetSchema,
  MAX_REST_SECONDS,
  SaveExerciseDTO,
  SaveExerciseSchema,
  SetExerciseLoadDTO,
  SetExerciseLoadSchema,
  SetLog,
  SetLogSchema,
  WorkoutAthlete,
  WorkoutAthleteSchema,
  WorkoutDay,
  WorkoutDaySchema,
  WorkoutExercise,
  WorkoutExerciseSchema,
  WorkoutSession,
  WorkoutSessionSchema,
  restCountdownOf,
} from '../domain/workout.schema';
import { buildImportPlan, planKey, summarizePlan, type PlanOverride } from '../import/import-plan';

/** Atletas iniciais do Nossa Casa. */
const DEFAULT_ATHLETE_NAMES = ['Lucas', 'Matheus'] as const;
const MIN_REST_SECONDS = 5;

function normalizeName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export interface ImportRoutineResult {
  created: number;
  skipped: number;
  needsReview: number;
}

/**
 * Agenda o aviso push de fim do descanso que acabou de ser gravado. Só
 * "garante": o servidor lê prazo e geração do banco e deduplica. Não existe
 * "cancelar" — pausar, pular ou reiniciar trocam a geração no banco e o
 * callback antigo é descartado lá.
 */
export interface RestAlertScheduler {
  ensureScheduled(sessionId: string): Promise<void>;
}

export class WorkoutCommands {
  constructor(
    private repo: WorkoutRepository,
    private eventRepo: EventRepository,
    private restAlerts?: RestAlertScheduler
  ) {}

  private async emit(workspaceId: string, type: string, entityId: string, payload: Record<string, unknown>, at: string) {
    await this.eventRepo.save({
      id: crypto.randomUUID(),
      type,
      entityId,
      workspaceId,
      source: 'manual',
      payload,
      createdAt: at,
    });
  }

  // --- Base: atletas e dias A–E -------------------------------------------------

  /**
   * Garante Lucas, Matheus e os dias A–E. Idempotente (ids determinísticos):
   * chamadas repetidas ou concorrentes nunca duplicam. Não importa exercícios
   * — isso é `importSheetRoutine`, acionado pelo usuário.
   */
  async ensureBase(workspaceId: string): Promise<{ athletes: WorkoutAthlete[]; days: WorkoutDay[] }> {
    const [athletes, days] = await Promise.all([this.repo.listAthletes(), this.repo.listDays()]);
    const now = new Date().toISOString();

    const newAthletes: WorkoutAthlete[] = [];
    for (const [index, name] of DEFAULT_ATHLETE_NAMES.entries()) {
      if (athletes.some((a) => normalizeName(a.name) === normalizeName(name))) continue;
      newAthletes.push(
        WorkoutAthleteSchema.parse({
          id: await deterministicUuid(`${workspaceId}:workout-athlete:${normalizeName(name)}`),
          workspaceId,
          name,
          position: index,
          createdAt: now,
          updatedAt: now,
        })
      );
    }

    const newDays: WorkoutDay[] = [];
    for (const [index, code] of DEFAULT_WORKOUT_DAY_CODES.entries()) {
      if (days.some((d) => d.code === code)) continue;
      newDays.push(
        WorkoutDaySchema.parse({
          id: await deterministicUuid(`${workspaceId}:workout-day:${code}`),
          workspaceId,
          code,
          position: index,
          createdAt: now,
          updatedAt: now,
        })
      );
    }

    if (newAthletes.length > 0) await this.repo.saveAthletes(newAthletes);
    if (newDays.length > 0) await this.repo.saveDays(newDays);

    return {
      athletes: [...athletes, ...newAthletes].sort((a, b) => a.position - b.position),
      days: [...days, ...newDays].sort((a, b) => a.position - b.position),
    };
  }

  // --- Importação da planilha ------------------------------------------------------

  /**
   * Cria os exercícios da planilha que ainda não existem na rotina. Valores
   * ambíguos entram SINALIZADOS (`needsReview`) e sem conversão: nada
   * duvidoso vira dado definitivo. Idempotente por (dia, nome): reimportar
   * não duplica nem sobrescreve edições — e um exercício removido pelo
   * usuário não volta.
   */
  async importSheetRoutine(workspaceId: string, overrides: Record<string, PlanOverride> = {}): Promise<ImportRoutineResult> {
    const { athletes, days } = await this.ensureBase(workspaceId);
    const existing = await this.repo.listExercises();
    const plan = buildImportPlan();
    const now = new Date().toISOString();
    const byCode = new Map(days.map((d) => [d.code, d]));
    const athleteByName = new Map(athletes.map((a) => [normalizeName(a.name), a]));

    const toSave: WorkoutExercise[] = [];
    const loads: ExerciseLoad[] = [];
    let skipped = 0;

    for (const p of plan) {
      const day = byCode.get(p.dayCode);
      if (!day) continue;
      const exists = existing.some((e) => e.dayId === day.id && normalizeName(e.name) === normalizeName(p.name));
      if (exists) {
        skipped += 1;
        continue;
      }
      const o = overrides[planKey(p)] ?? {};
      // Correção/confirmação feita no pré-visualizador resolve o alerta daquele campo.
      const restFixed = p.editable.rest && o.restSeconds != null;
      const loadsFixed = p.editable.loads && (o.matheusKg != null || o.lucasKg != null);
      const stillPending = (p.editable.rest && !restFixed) || (p.editable.loads && !loadsFixed);
      const exercise = WorkoutExerciseSchema.parse({
        id: await deterministicUuid(`${workspaceId}:sheet:${p.dayCode}:${normalizeName(p.name)}`),
        workspaceId,
        dayId: day.id,
        position: p.position,
        name: p.name,
        sets: p.sets,
        repsMin: p.repsMin,
        repsMax: p.repsMax,
        repsNote: p.repsNote,
        restSeconds: restFixed ? o.restSeconds : p.restSeconds,
        restNote: p.restNote,
        sourceNote: p.sourceNote,
        needsReview: p.needsReview && stillPending,
        createdAt: now,
        updatedAt: now,
      });
      toSave.push(exercise);

      const plannedLoads: Record<string, { loadKg?: number; loadNote?: string } | undefined> = { ...p.loads };
      if (o.matheusKg != null) plannedLoads.matheus = { loadKg: o.matheusKg };
      if (o.lucasKg != null) plannedLoads.lucas = { loadKg: o.lucasKg };
      for (const [key, load] of Object.entries(plannedLoads)) {
        const athlete = athleteByName.get(key);
        if (!athlete || !load) continue;
        loads.push(
          ExerciseLoadSchema.parse({
            workspaceId,
            exerciseId: exercise.id,
            athleteId: athlete.id,
            loadKg: load.loadKg,
            loadNote: load.loadNote,
            updatedAt: now,
          })
        );
      }
    }

    if (toSave.length > 0) await this.repo.saveExercises(toSave);
    if (loads.length > 0) await this.repo.saveLoads(loads);

    const summary = summarizePlan(plan);
    const result: ImportRoutineResult = {
      created: toSave.length,
      skipped,
      needsReview: toSave.filter((e) => e.needsReview).length,
    };
    if (toSave.length > 0) {
      await this.emit(workspaceId, 'workout.routine.imported', workspaceId, { ...result, planned: summary.total }, now);
    }
    return result;
  }

  // --- Rotina: edição de exercícios ---------------------------------------------------

  async saveExercise(workspaceId: string, dto: SaveExerciseDTO): Promise<WorkoutExercise> {
    const parsed = SaveExerciseSchema.parse(dto);
    const all = await this.repo.listExercises();
    const existing = parsed.id ? all.find((e) => e.id === parsed.id) : undefined;
    if (parsed.id && !existing) throw new Error('Exercício não encontrado');

    const now = new Date().toISOString();
    const siblings = all.filter((e) => e.dayId === parsed.dayId && !e.removedAt);
    const position = existing && existing.dayId === parsed.dayId
      ? existing.position
      : siblings.reduce((max, e) => Math.max(max, e.position), -1) + 1;

    const exercise = WorkoutExerciseSchema.parse({
      id: existing?.id ?? crypto.randomUUID(),
      workspaceId,
      dayId: parsed.dayId,
      position,
      name: parsed.name,
      sets: parsed.sets,
      repsMin: parsed.repsMin,
      repsMax: parsed.repsMax,
      repsNote: parsed.repsNote,
      restSeconds: parsed.restSeconds,
      restNote: parsed.restNote,
      instructions: parsed.instructions,
      imageUrl: parsed.imageUrl,
      videoUrl: parsed.videoUrl,
      sourceNote: existing?.sourceNote,
      hiddenAt: existing?.hiddenAt,
      // Salvar é confirmar: o usuário acabou de revisar o exercício.
      needsReview: false,
      removedAt: undefined,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    });
    await this.repo.saveExercises([exercise]);
    await this.emit(workspaceId, existing ? 'workout.exercise.updated' : 'workout.exercise.created', exercise.id, { name: exercise.name, dayId: exercise.dayId }, now);
    return exercise;
  }

  /**
   * Renomeia o exercício da ficha COMPARTILHADA (Lucas e Matheus veem o mesmo nome). Altera
   * só a coluna do nome: o id, as cargas de cada atleta, as séries e o histórico, o descanso
   * e a ordem permanecem intactos — nada é recriado.
   */
  async renameExercise(exerciseId: string, name: string): Promise<WorkoutExercise> {
    const trimmed = WorkoutExerciseSchema.shape.name.parse(name);
    const existing = await this.repo.findExercise(exerciseId);
    if (!existing || existing.removedAt) throw new Error('Exercício não encontrado');
    if (existing.name === trimmed) return existing;
    const updated = await this.repo.renameExercise(exerciseId, trimmed);
    if (!updated) throw new Error('Exercício não encontrado');
    await this.emit(existing.workspaceId, 'workout.exercise.renamed', existing.id, { dayId: existing.dayId }, new Date().toISOString());
    return updated;
  }

  /** Remove da rotina sem apagar o histórico de séries. */
  async removeExercise(exerciseId: string): Promise<WorkoutExercise> {
    const existing = await this.repo.findExercise(exerciseId);
    if (!existing) throw new Error('Exercício não encontrado');
    if (existing.removedAt) return existing;
    const now = new Date().toISOString();
    const updated = WorkoutExerciseSchema.parse({ ...existing, removedAt: now, updatedAt: now });
    await this.repo.saveExercises([updated]);
    await this.emit(existing.workspaceId, 'workout.exercise.removed', existing.id, { name: existing.name }, now);
    return updated;
  }

  /**
   * Oculta o exercício: sai do fluxo de execução do treino, mas continua na
   * rotina (para reexibir) e preserva todo o histórico. Não exclui nem conclui.
   */
  async hideExercise(exerciseId: string): Promise<WorkoutExercise> {
    const existing = await this.repo.findExercise(exerciseId);
    if (!existing) throw new Error('Exercício não encontrado');
    if (existing.hiddenAt) return existing;
    const now = new Date().toISOString();
    const updated = WorkoutExerciseSchema.parse({ ...existing, hiddenAt: now, updatedAt: now });
    await this.repo.saveExercises([updated]);
    await this.emit(existing.workspaceId, 'workout.exercise.hidden', existing.id, { name: existing.name }, now);
    return updated;
  }

  async unhideExercise(exerciseId: string): Promise<WorkoutExercise> {
    const existing = await this.repo.findExercise(exerciseId);
    if (!existing) throw new Error('Exercício não encontrado');
    if (!existing.hiddenAt) return existing;
    const now = new Date().toISOString();
    const updated = WorkoutExerciseSchema.parse({ ...existing, hiddenAt: undefined, updatedAt: now });
    await this.repo.saveExercises([updated]);
    await this.emit(existing.workspaceId, 'workout.exercise.unhidden', existing.id, { name: existing.name }, now);
    return updated;
  }

  /** Nome opcional do treino (A–E mantêm o código; o título é livre). */
  async renameDay(dayId: string, title: string): Promise<WorkoutDay> {
    const day = (await this.repo.listDays()).find((d) => d.id === dayId);
    if (!day) throw new Error('Treino não encontrado');
    const updated = WorkoutDaySchema.parse({ ...day, title: title.trim() || undefined, updatedAt: new Date().toISOString() });
    await this.repo.saveDays([updated]);
    return updated;
  }

  async confirmExerciseReview(exerciseId: string): Promise<WorkoutExercise> {
    const existing = await this.repo.findExercise(exerciseId);
    if (!existing) throw new Error('Exercício não encontrado');
    if (!existing.needsReview) return existing;
    const now = new Date().toISOString();
    const updated = WorkoutExerciseSchema.parse({ ...existing, needsReview: false, updatedAt: now });
    await this.repo.saveExercises([updated]);
    return updated;
  }

  /** Ajuste rápido do descanso sugerido de um exercício (valor padrão da rotina). */
  async setExerciseRest(exerciseId: string, seconds: number): Promise<WorkoutExercise> {
    const existing = await this.repo.findExercise(exerciseId);
    if (!existing) throw new Error('Exercício não encontrado');
    const rest = Math.round(Math.min(MAX_REST_SECONDS, Math.max(0, seconds)));
    const now = new Date().toISOString();
    // A observação "da planilha" deixa de descrever o valor atual.
    const updated = WorkoutExerciseSchema.parse({ ...existing, restSeconds: rest, restNote: undefined, updatedAt: now });
    await this.repo.saveExercises([updated]);
    return updated;
  }

  /** Troca a posição com o vizinho (ordem prescrita dentro do dia). */
  async moveExercise(exerciseId: string, direction: 'up' | 'down'): Promise<void> {
    const all = await this.repo.listExercises();
    const target = all.find((e) => e.id === exerciseId);
    if (!target) throw new Error('Exercício não encontrado');
    const ordered = all
      .filter((e) => e.dayId === target.dayId && !e.removedAt && !e.hiddenAt)
      .sort((a, b) => a.position - b.position);
    const index = ordered.findIndex((e) => e.id === exerciseId);
    const neighbor = ordered[direction === 'up' ? index - 1 : index + 1];
    if (!neighbor) return;
    const now = new Date().toISOString();
    // Reatribui posições sequenciais para sanear eventuais empates/lacunas.
    const reordered = [...ordered];
    reordered[index] = neighbor;
    reordered[direction === 'up' ? index - 1 : index + 1] = target;
    const updates = reordered
      .map((e, i) => ({ e, i }))
      .filter(({ e, i }) => e.position !== i)
      .map(({ e, i }) => WorkoutExerciseSchema.parse({ ...e, position: i, updatedAt: now }));
    if (updates.length > 0) await this.repo.saveExercises(updates);
  }

  // --- Cargas atuais por atleta ---------------------------------------------------------

  async setAthleteLoad(workspaceId: string, dto: SetExerciseLoadDTO): Promise<ExerciseLoad> {
    const parsed = SetExerciseLoadSchema.parse(dto);
    const exercise = await this.repo.findExercise(parsed.exerciseId);
    if (!exercise) throw new Error('Exercício não encontrado');
    const now = new Date().toISOString();
    const load = ExerciseLoadSchema.parse({ workspaceId, ...parsed, updatedAt: now });
    await this.repo.saveLoads([load]);
    await this.emit(workspaceId, 'workout.load.updated', exercise.id, { athleteId: parsed.athleteId, loadKg: parsed.loadKg ?? null }, now);
    return load;
  }

  // --- Sessões ----------------------------------------------------------------------------

  async startSession(workspaceId: string, athleteId: string, dayId: string, today: string = todayDateStr()): Promise<WorkoutSession> {
    const [athletes, days, active] = await Promise.all([
      this.repo.listAthletes(),
      this.repo.listDays(),
      this.repo.findActiveSession(athleteId),
    ]);
    if (!athletes.some((a) => a.id === athleteId)) throw new Error('Atleta não encontrado');
    if (!days.some((d) => d.id === dayId)) throw new Error('Treino não encontrado');
    if (active) throw new Error('Já existe um treino em andamento para esta pessoa. Conclua ou cancele antes de iniciar outro.');

    const now = new Date().toISOString();
    const session = WorkoutSessionSchema.parse({
      id: crypto.randomUUID(),
      workspaceId,
      athleteId,
      dayId,
      sessionDate: today,
      startedAt: now,
      status: 'in_progress',
      createdAt: now,
      updatedAt: now,
    });
    await this.repo.saveSession(session);
    await this.emit(workspaceId, 'workout.session.started', session.id, { athleteId, dayId }, now);
    return session;
  }

  /**
   * Inicia a SESSÃO GERAL de academia (e o cronômetro) de uma pessoa, sem
   * depender de qual treino será feito. `dayId` é só o treino "em foco" inicial
   * (por padrão o primeiro); trocar de treino depois (`focusDay`) não reinicia
   * o cronômetro nem conclui nada. Só `finishSession`/`cancelSession` encerram.
   * Se já existe sessão em andamento, devolve a mesma.
   */
  async startGeneralSession(workspaceId: string, athleteId: string, dayId?: string, today: string = todayDateStr()): Promise<WorkoutSession> {
    const active = await this.repo.findActiveSession(athleteId);
    if (active) return active;
    const days = (await this.repo.listDays()).sort((x, y) => x.position - y.position);
    const focus = dayId ?? days[0]?.id;
    if (!focus) throw new Error('Nenhum treino cadastrado ainda');
    return this.startSession(workspaceId, athleteId, focus, today);
  }

  /**
   * Muda o treino em foco da sessão em andamento (A → B → A…). Não encerra
   * nem cria registro algum: as séries já feitas continuam na sessão e o
   * cronômetro geral segue contando.
   */
  async focusDay(sessionId: string, dayId: string): Promise<WorkoutSession> {
    const session = await this.loadActiveSession(sessionId);
    if (session.dayId === dayId) return session;
    const day = (await this.repo.listDays()).find((d) => d.id === dayId);
    if (!day) throw new Error('Treino não encontrado');
    const updated = WorkoutSessionSchema.parse({ ...session, dayId, updatedAt: new Date().toISOString() });
    await this.repo.saveSession(updated);
    return updated;
  }

  private async loadActiveSession(sessionId: string): Promise<WorkoutSession> {
    const session = await this.repo.findSession(sessionId);
    if (!session) throw new Error('Treino não encontrado');
    if (session.status !== 'in_progress') throw new Error('Este treino já foi encerrado');
    return session;
  }

  /** Registra (ou corrige) uma série. Idempotente por (sessão, exercício, nº da série). */
  async logSet(sessionId: string, dto: LogSetDTO): Promise<SetLog> {
    const parsed = LogSetSchema.parse(dto);
    const session = await this.loadActiveSession(sessionId);
    const exercise = await this.repo.findExercise(parsed.exerciseId);
    if (!exercise || exercise.removedAt) throw new Error('Este exercício não faz parte do treino');

    const now = new Date().toISOString();
    const log = SetLogSchema.parse({
      id: await deterministicUuid(`${sessionId}:${parsed.exerciseId}:${parsed.setNumber}`),
      workspaceId: session.workspaceId,
      sessionId,
      athleteId: session.athleteId,
      exerciseId: parsed.exerciseId,
      setNumber: parsed.setNumber,
      loadKg: parsed.loadKg,
      reps: parsed.reps,
      completedAt: now,
      createdAt: now,
    });
    await this.repo.saveSetLog(log);
    await this.emit(session.workspaceId, 'workout.set.logged', log.id, { exerciseId: log.exerciseId, setNumber: log.setNumber, loadKg: log.loadKg ?? null, reps: log.reps }, now);
    return log;
  }

  /**
   * Conclui uma série e já inicia o descanso (`restSeconds`, padrão do
   * exercício ou ajuste do usuário). Os dois efeitos acontecem juntos: o
   * descanso é gravado com timestamp de término na sessão.
   */
  async completeSet(sessionId: string, dto: LogSetDTO, restSeconds?: number): Promise<SetLog> {
    const log = await this.logSet(sessionId, dto);
    if (restSeconds != null && restSeconds > 0) await this.startRest(sessionId, restSeconds);
    return log;
  }

  async unlogSet(sessionId: string, exerciseId: string, setNumber: number): Promise<void> {
    await this.loadActiveSession(sessionId);
    await this.repo.deleteSetLog(await deterministicUuid(`${sessionId}:${exerciseId}:${setNumber}`));
  }

  // --- Descanso (contagem regressiva persistida na sessão) -------------------------------------

  private async saveRest(session: WorkoutSession, patch: Partial<WorkoutSession>): Promise<WorkoutSession> {
    const now = new Date().toISOString();
    const updated = WorkoutSessionSchema.parse({ ...session, ...patch, updatedAt: now });
    await this.repo.saveSession(updated);
    return updated;
  }

  async startRest(sessionId: string, seconds: number): Promise<WorkoutSession> {
    const session = await this.loadActiveSession(sessionId);
    const duration = Math.round(Math.min(MAX_REST_SECONDS, Math.max(MIN_REST_SECONDS, seconds)));
    const updated = await this.saveRest(session, {
      restEndsAt: new Date(Date.now() + duration * 1000).toISOString(),
      restDurationSeconds: duration,
      restPausedRemainingSeconds: undefined,
    });
    this.ensureRestAlert(sessionId);
    return updated;
  }

  /** Dispara (sem esperar) o agendamento do aviso push do descanso atual. */
  ensureRestAlert(sessionId: string): void {
    void this.restAlerts?.ensureScheduled(sessionId).catch(() => undefined);
  }

  /** Reinicia com a duração original do último descanso. */
  async restartRest(sessionId: string): Promise<WorkoutSession> {
    const session = await this.loadActiveSession(sessionId);
    return this.startRest(sessionId, session.restDurationSeconds ?? 90);
  }

  /** Soma/subtrai segundos do descanso (ex.: +15 s, −15 s). Abaixo de zero encerra. */
  async adjustRest(sessionId: string, deltaSeconds: number): Promise<WorkoutSession> {
    const session = await this.loadActiveSession(sessionId);
    const nowMs = Date.now();
    const state = restCountdownOf(session);
    const next = remainingSeconds(state, nowMs) + deltaSeconds;
    if (next <= 0) return this.clearRest(sessionId);
    const clamped = Math.min(MAX_REST_SECONDS, next);
    const duration = Math.min(MAX_REST_SECONDS, Math.max(clamped, (session.restDurationSeconds ?? clamped) + deltaSeconds));
    if (countdownPhase(state, nowMs) === 'paused') {
      return this.saveRest(session, { restPausedRemainingSeconds: clamped, restDurationSeconds: duration });
    }
    const updated = await this.saveRest(session, {
      restEndsAt: new Date(nowMs + clamped * 1000).toISOString(),
      restDurationSeconds: duration,
      restPausedRemainingSeconds: undefined,
    });
    this.ensureRestAlert(sessionId);
    return updated;
  }

  async pauseRest(sessionId: string): Promise<WorkoutSession> {
    const session = await this.loadActiveSession(sessionId);
    const state = restCountdownOf(session);
    if (countdownPhase(state, Date.now()) !== 'running') return session;
    return this.saveRest(session, {
      restPausedRemainingSeconds: remainingSeconds(state, Date.now()),
      restEndsAt: undefined,
    });
  }

  async resumeRest(sessionId: string): Promise<WorkoutSession> {
    const session = await this.loadActiveSession(sessionId);
    if (session.restPausedRemainingSeconds == null) return session;
    const updated = await this.saveRest(session, {
      restEndsAt: new Date(Date.now() + session.restPausedRemainingSeconds * 1000).toISOString(),
      restPausedRemainingSeconds: undefined,
    });
    this.ensureRestAlert(sessionId);
    return updated;
  }

  async clearRest(sessionId: string): Promise<WorkoutSession> {
    const session = await this.loadActiveSession(sessionId);
    return this.saveRest(session, {
      restEndsAt: undefined,
      restDurationSeconds: undefined,
      restPausedRemainingSeconds: undefined,
    });
  }

  // --- Encerramento -------------------------------------------------------------------------

  /**
   * Conclui o treino. A carga atual de cada exercício passa a ser a da última
   * série registrada — assim a próxima sessão já começa do ponto certo, sem
   * redigitar. Só altera o atleta que treinou.
   */
  async finishSession(sessionId: string): Promise<WorkoutSession> {
    const session = await this.loadActiveSession(sessionId);
    const [logs, currentLoads] = await Promise.all([this.repo.listSetLogsBySession(sessionId), this.repo.listLoads()]);
    const now = new Date().toISOString();

    const lastByExercise = new Map<string, SetLog>();
    for (const log of [...logs].sort((a, b) => a.completedAt.localeCompare(b.completedAt))) {
      if (log.loadKg != null) lastByExercise.set(log.exerciseId, log);
    }
    const loadUpdates: ExerciseLoad[] = [];
    for (const [exerciseId, log] of lastByExercise) {
      const current = currentLoads.find((l) => l.exerciseId === exerciseId && l.athleteId === session.athleteId);
      if (current?.loadKg === log.loadKg) continue;
      loadUpdates.push(
        ExerciseLoadSchema.parse({ workspaceId: session.workspaceId, exerciseId, athleteId: session.athleteId, loadKg: log.loadKg, updatedAt: now })
      );
    }
    if (loadUpdates.length > 0) await this.repo.saveLoads(loadUpdates);

    const updated = WorkoutSessionSchema.parse({
      ...session,
      status: 'completed',
      endedAt: now,
      restEndsAt: undefined,
      restDurationSeconds: undefined,
      restPausedRemainingSeconds: undefined,
      updatedAt: now,
    });
    await this.repo.saveSession(updated);
    await this.emit(session.workspaceId, 'workout.session.completed', session.id, { athleteId: session.athleteId, dayId: session.dayId, sets: logs.length }, now);
    return updated;
  }

  async cancelSession(sessionId: string): Promise<WorkoutSession> {
    const session = await this.loadActiveSession(sessionId);
    const now = new Date().toISOString();
    const updated = WorkoutSessionSchema.parse({
      ...session,
      status: 'cancelled',
      endedAt: now,
      restEndsAt: undefined,
      restDurationSeconds: undefined,
      restPausedRemainingSeconds: undefined,
      updatedAt: now,
    });
    await this.repo.saveSession(updated);
    await this.emit(session.workspaceId, 'workout.session.cancelled', session.id, { athleteId: session.athleteId }, now);
    return updated;
  }

  // --- Peso corporal ----------------------------------------------------------------------------

  /** Um registro por atleta por dia local: registrar de novo no mesmo dia corrige o valor. */
  async logBodyWeight(workspaceId: string, dto: LogBodyWeightDTO): Promise<BodyWeightLog> {
    const parsed = LogBodyWeightSchema.parse(dto);
    const athletes = await this.repo.listAthletes();
    if (!athletes.some((a) => a.id === parsed.athleteId)) throw new Error('Atleta não encontrado');
    const loggedOn = parsed.loggedOn ?? todayDateStr();
    const now = new Date().toISOString();
    const log = BodyWeightLogSchema.parse({
      id: await deterministicUuid(`${workspaceId}:body-weight:${parsed.athleteId}:${loggedOn}`),
      workspaceId,
      athleteId: parsed.athleteId,
      weightKg: Math.round(parsed.weightKg * 10) / 10,
      loggedOn,
      createdAt: now,
      updatedAt: now,
    });
    await this.repo.saveBodyWeight(log);
    await this.emit(workspaceId, 'workout.body_weight.logged', log.id, { athleteId: log.athleteId, weightKg: log.weightKg, loggedOn }, now);
    return log;
  }

  async deleteBodyWeight(id: string): Promise<void> {
    await this.repo.deleteBodyWeight(id);
  }
}
