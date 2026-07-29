-- =============================================================================
-- Migration: Conteúdo declarativo em blocos para lições (Learning Content
-- Engine — Fase 2 do módulo Aprendizado)
-- =============================================================================
-- `learning_lessons` até aqui só tinha metadados (title/description/position).
-- Esta migration adiciona `content` (jsonb), validado no cliente por
-- `LessonContentSchema` (modules/learning/domain/lesson-content.schema.ts):
-- uma sequência de blocos tipados, sempre começando em "objective" e
-- terminando em "summary".
--
-- O default é um conteúdo mínimo porém válido (não `'{}'`): garante que
-- nenhuma linha fique num estado que `LessonContentSchema.parse` rejeite
-- entre a migration e o reparo idempotente de `LearningCommands.
-- ensureModulesAndLessons`, que substitui este placeholder pelo conteúdo
-- real na próxima inicialização do curso.
-- =============================================================================

alter table public.learning_lessons
  add column content jsonb not null default '{
    "blocks": [
      { "id": "placeholder-objective", "type": "objective", "text": "Conteúdo em atualização." },
      { "id": "placeholder-summary", "type": "summary", "points": ["Este conteúdo será atualizado em breve."] }
    ]
  }'::jsonb;
