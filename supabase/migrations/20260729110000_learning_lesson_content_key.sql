-- =============================================================================
-- Migration: Identidade editorial estável para lições (content_key)
-- =============================================================================
-- Causa raiz corrigida: `LearningCommands.ensureModulesAndLessons` reconciliava
-- lições por `title` — um campo editorial que pode mudar. Renomear uma lição
-- criaria uma duplicata (o seed não a reconheceria mais) e quebraria qualquer
-- progresso já associado ao `id` original.
--
-- `content_key` é a chave estável (kebab-case, ex.: "hiragana-vogais"),
-- imutável após a criação, única dentro do módulo — mesmo escopo de
-- `unique (module_id, position)` já existente. O backfill abaixo assume as
-- únicas duas lições semeadas até aqui (título ainda não foi editado por
-- nenhum usuário — não existe tela de edição de lição nesta fase).
-- =============================================================================

alter table public.learning_lessons add column content_key text;

update public.learning_lessons
  set content_key = 'introducao-ao-curso'
  where title = 'Introdução ao curso' and content_key is null;

update public.learning_lessons
  set content_key = 'hiragana-vogais'
  where title = 'Hiragana — Vogais' and content_key is null;

alter table public.learning_lessons
  alter column content_key set not null;

alter table public.learning_lessons
  add constraint learning_lessons_module_content_key_unique unique (module_id, content_key);
