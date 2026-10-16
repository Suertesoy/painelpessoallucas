-- =============================================================================
-- Migration: Estudos individuais dentro do workspace compartilhado
-- =============================================================================
-- Contexto: Lucas e Matheus passam a usar o MESMO workspace. Compras, Finanças
-- e Notas são da casa. O progresso de estudo é de cada pessoa: Japonês é do
-- Lucas; o futuro Inglês será do Matheus.
--
-- Como a separação funciona SEM tocar nos dados existentes:
--   * Sessões, progresso de lição e prática já são por CURSO (course_id).
--     Basta o curso ter dono para que tudo que depende dele também tenha.
--   * learning_courses.owner_user_id: dono do curso. NULO = curso anterior ao
--     compartilhamento; o app o atribui, na LEITURA, a quem administra o
--     workspace (papel owner). Nenhuma linha é reescrita: nada de backfill,
--     nenhuma reatribuição de progresso — essa decisão só deve ser tomada
--     com aprovação explícita.
--   * A trava "uma sessão em andamento por workspace" impediria Matheus de
--     estudar enquanto Lucas estuda. Passa a ser "uma por curso" (como cada
--     curso é de uma pessoa, continua sendo uma sessão por pessoa e curso).
--
-- Limites conhecidos (documentados em docs/NOSSA_CASA_ESTUDOS_TREINOS.md):
--   * A separação é de PROGRESSO, não de sigilo: RLS continua por workspace.
--   * learning_preferences (meta diária) segue uma por workspace.
-- =============================================================================

alter table public.learning_courses
  add column if not exists owner_user_id uuid references auth.users (id) on delete set null;

create index if not exists learning_courses_owner_idx
  on public.learning_courses (workspace_id, owner_user_id);

drop index if exists public.study_sessions_one_active_idx;
create unique index study_sessions_one_active_idx
  on public.study_sessions (course_id) where status = 'in_progress';
