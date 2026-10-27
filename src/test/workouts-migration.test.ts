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

describe('migration de Web Push para descanso nos Treinos', () => {
  const sql = read('20261026120000_workout_rest_push.sql');

  it('é aditiva e define colunas com default seguro', () => {
    expect(sql).not.toMatch(/drop (table|column)/i);
    expect(sql).toContain('add column if not exists workout_rest_enabled boolean not null default false');
    expect(sql).toContain('add column if not exists rest_nonce uuid');
  });

  it('a geração do descanso é carimbada pelo banco, não pelo cliente', () => {
    expect(sql).toMatch(/create trigger workout_sessions_rest_nonce\s+before insert or update on public\.workout_sessions/);
    expect(sql).toContain('new.rest_nonce := gen_random_uuid()');
    expect(sql).toContain('new.rest_nonce := old.rest_nonce');
  });

  it('o navegador não vincula atleta a conta; um usuário por atleta no workspace', () => {
    expect(sql).toMatch(/coalesce\(auth\.role\(\), ''\) in \('anon', 'authenticated'\)/);
    expect(sql).toMatch(/unique index if not exists workout_athletes_user_unique_idx\s+on public\.workout_athletes \(workspace_id, user_id\)/);
  });

  it('envio idempotente por (sessão, geração, aparelho), só para o servidor', () => {
    expect(sql).toContain('unique (session_id, rest_nonce, subscription_id)');
    expect(sql).toContain('alter table public.workout_rest_push_deliveries enable row level security');
    expect(sql).not.toMatch(/create policy[^;]*workout_rest_push_deliveries/i);
    expect(sql).not.toMatch(/grant[^;]*workout_rest_push_deliveries[^;]*authenticated/i);
  });
});
