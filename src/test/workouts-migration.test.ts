import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (f: string) => readFileSync(join(process.cwd(), 'supabase/migrations', f), 'utf8');

describe('migration de Treinos', () => {
  const sql = read('20261015110000_workouts.sql');
  const tables = ['workout_athletes', 'workout_days', 'workout_exercises', 'workout_exercise_loads', 'workout_sessions', 'workout_set_logs', 'workout_body_weights'];

  it('toda tabela tem RLS, GRANT e realtime — e não depende de convites', () => {
    for (const t of tables) {
      expect(sql).toContain(`create table public.${t}`);
      expect(sql).toMatch(new RegExp(`grant [a-z, ]+ on public\\.${t} to authenticated`));
      expect(sql.match(/'workout_[a-z_]+'/g)).toContain(`'${t}'`);
    }
    expect(sql).toContain('enable row level security');
    expect(sql).toContain('is_workspace_member(workspace_id)');
    const code = sql
      .split(/\r?\n/)
      .filter((l) => !l.trim().startsWith('--'))
      .join('\n');
    expect(code).not.toMatch(/invite|convite/i);
  });

  it('um treino ativo por atleta e uma série por (sessão, exercício, nº)', () => {
    expect(sql).toMatch(/workout_sessions_one_active_idx[\s\S]*where status = 'in_progress'/);
    expect(sql).toContain('unique (session_id, exercise_id, set_number)');
    expect(sql).toContain('unique (athlete_id, logged_on)');
  });

  it('nenhum dado da planilha é semeado na migration', () => {
    expect(sql).not.toMatch(/insert into/i);
  });
});

describe('migration de Estudos', () => {
  const sql = read('20261015100000_estudos_sessions_practice.sql');
  it('é aditiva e concede privilégios', () => {
    expect(sql).not.toMatch(/drop (table|column)/i);
    expect(sql).toContain('add column paused_at');
    expect(sql).toContain('grant select, insert, update on public.learning_practice_items to authenticated');
    expect(sql).toContain('unique (workspace_id, course_id, kind, subject)');
  });
});
