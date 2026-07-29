import { z } from 'zod';

/** Fonte única de verdade do formato de preferências trocado com o cliente
 * (camelCase) — as rotas fazem a tradução para as colunas snake_case de
 * `push_subscriptions`. */

export const PushPlatformSchema = z.enum(['ios', 'android', 'desktop', 'other']);
export type PushPlatform = z.infer<typeof PushPlatformSchema>;

const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

export const PushPreferencesSchema = z.object({
  deviceName: z.string().min(1).max(60),
  platform: PushPlatformSchema,
  taskRemindersEnabled: z.boolean(),
  dailyPlanningEnabled: z.boolean(),
  dailyPlanningTime: z.string().regex(TIME_REGEX),
  weeklyReviewEnabled: z.boolean(),
  weeklyReviewDay: z.number().int().min(0).max(6),
  weeklyReviewTime: z.string().regex(TIME_REGEX),
  captureFailureEnabled: z.boolean(),
  showDetailsEnabled: z.boolean(),
  timezone: z.string().min(1).max(100),
});
export type PushPreferences = z.infer<typeof PushPreferencesSchema>;

export const UpdatePushPreferencesSchema = PushPreferencesSchema.partial();
export type UpdatePushPreferencesDTO = z.infer<typeof UpdatePushPreferencesSchema>;

export const SubscribeRequestSchema = z.object({
  subscription: z.object({
    endpoint: z.string().min(1).max(2000),
    keys: z.object({
      p256dh: z.string().min(1).max(500),
      auth: z.string().min(1).max(500),
    }),
  }),
  deviceName: z.string().min(1).max(60).optional(),
  platform: PushPlatformSchema.optional(),
  timezone: z.string().min(1).max(100).optional(),
});
export type SubscribeRequestDTO = z.infer<typeof SubscribeRequestSchema>;

/** Mapeia a linha (snake_case) de push_subscriptions para o formato do cliente. */
export function toPreferencesDTO(row: {
  device_name: string;
  platform: string;
  task_reminders_enabled: boolean;
  daily_planning_enabled: boolean;
  daily_planning_time: string;
  weekly_review_enabled: boolean;
  weekly_review_day: number;
  weekly_review_time: string;
  capture_failure_enabled: boolean;
  show_details_enabled: boolean;
  timezone: string;
}): PushPreferences {
  return {
    deviceName: row.device_name,
    platform: row.platform as PushPlatform,
    taskRemindersEnabled: row.task_reminders_enabled,
    dailyPlanningEnabled: row.daily_planning_enabled,
    dailyPlanningTime: row.daily_planning_time.slice(0, 5),
    weeklyReviewEnabled: row.weekly_review_enabled,
    weeklyReviewDay: row.weekly_review_day,
    weeklyReviewTime: row.weekly_review_time.slice(0, 5),
    captureFailureEnabled: row.capture_failure_enabled,
    showDetailsEnabled: row.show_details_enabled,
    timezone: row.timezone,
  };
}

/** Mapeia um patch (camelCase, parcial) para colunas (snake_case) para update. */
export function fromPreferencesPatch(patch: UpdatePushPreferencesDTO): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (patch.deviceName !== undefined) out.device_name = patch.deviceName;
  if (patch.platform !== undefined) out.platform = patch.platform;
  if (patch.taskRemindersEnabled !== undefined) out.task_reminders_enabled = patch.taskRemindersEnabled;
  if (patch.dailyPlanningEnabled !== undefined) out.daily_planning_enabled = patch.dailyPlanningEnabled;
  if (patch.dailyPlanningTime !== undefined) out.daily_planning_time = patch.dailyPlanningTime;
  if (patch.weeklyReviewEnabled !== undefined) out.weekly_review_enabled = patch.weeklyReviewEnabled;
  if (patch.weeklyReviewDay !== undefined) out.weekly_review_day = patch.weeklyReviewDay;
  if (patch.weeklyReviewTime !== undefined) out.weekly_review_time = patch.weeklyReviewTime;
  if (patch.captureFailureEnabled !== undefined) out.capture_failure_enabled = patch.captureFailureEnabled;
  if (patch.showDetailsEnabled !== undefined) out.show_details_enabled = patch.showDetailsEnabled;
  if (patch.timezone !== undefined) out.timezone = patch.timezone;
  return out;
}
