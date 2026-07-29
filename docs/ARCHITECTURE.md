# Arquitetura — Painel Pessoal Lucas

> Este documento descreve a arquitetura **realmente implementada** (Fase 1), não a aspiração.

## Visão geral

Monólito modular em Next.js (App Router). A UI nunca acessa persistência diretamente: tudo passa por **Commands** (escrita) e **Queries** (leitura), que usam **Repositories** (interfaces) implementados por adaptadores de **localStorage** na Fase 1.

```
src/
  app/                    # Rotas (hoje, entrada, projetos, ideias, agenda, revisao, api/health)
  components/             # Componentes client (modais, navegação)
  lib/                    # hooks reativos, datas (fuso local), constantes, eventos de UI
  modules/
    items|projects|planning/
      domain/             # Zod schemas + tipos (fonte única de verdade)
      application/        # Commands, Queries e interfaces de Repository
      infrastructure/     # Adaptadores localStorage
    global/application/   # Busca global (composição de queries)
  platform/
    storage/              # LocalStorageAdapter<T> (observável, seguro em SSR)
    events/               # DomainEvent + repositório de eventos (append-only)
    ai/, integrations/, mcp/  # SOMENTE contratos (interfaces) para fases futuras
  providers/              # RepositoryProvider (composition root / DI via Context)
  test/                   # Vitest (domínio, queries, datas)
```

## Fluxo de dados

1. Componente chama `useCommands()` / `useQueries()` (Context).
2. Command valida o payload com Zod (`domain/*.schema.ts`), persiste via Repository e grava um `DomainEvent` no repositório de eventos.
3. O adaptador de storage notifica os inscritos (`subscribe`); `useReactiveQuery` reexecuta a query e a UI atualiza sem refresh.
4. Mudanças em outra aba chegam pelo evento `storage` do navegador.

### Reatividade — decisão registrada
Queries são assíncronas (retornam `Promise`), então a UI usa o padrão **effect + subscribe** (`useReactiveQuery`), e não `useSyncExternalStore` (que exige snapshot síncrono). `useSyncExternalStore` é usado apenas no `useMounted()` (detecção de hidratação). Documentações anteriores afirmavam o contrário; este documento reflete o código.

## Commands e Queries

- `ItemCommands`: create, update, schedule, complete, archive — todos validam com `ItemSchema.parse` e emitem eventos (`item.created`, `item.updated`, `item.scheduled` com valor anterior/novo, `item.completed`, `item.archived`).
- `ProjectCommands`: create, update, archive (+ eventos).
- `DailyPlanCommands`: `setDailyFocus` (regra de máx. 3 itens aplicada no domínio) e `removeDailyFocusItem`.
- Queries correspondentes (`ItemQueries`, `ProjectQueries`, `DailyPlanQueries`, `GlobalQueries`) são somente leitura.

## Datas e fuso horário

Regra do projeto (ver `src/lib/dates.ts`): "hoje", agendamento e prazo são conceitos do **dia local** do usuário. Proibido derivar dia de `toISOString()` e proibido `new Date('YYYY-MM-DD')` para inputs (interpretação UTC desloca o dia no Brasil). Armazenamento continua ISO 8601; a fronteira converte.

## Erros

- Commands lançam `Error` com mensagem em português; páginas capturam e exibem inline (`role="alert"`).
- Leitura de localStorage corrompido degrada para lista vazia (try/catch no adaptador) — decisão consciente para nunca travar a UI; auditoria de dados chega com a persistência remota.

## Testes

Vitest em ambiente `node` (proposital: prova que os módulos não dependem de `window`). Cobrem: limite de foco, persistência do plano, reatividade (subscribe), payload de eventos, resiliência SSR, queries de inbox/busca e utilitários de data (round-trip de fuso).

## Fase 2 — implementada

- **Supabase**: repositórios `Supabase*Repository` implementam as MESMAS
  interfaces da Fase 1; `useReactiveQuery` ganhou `error` e `isOffline`.
  Sessão via `@supabase/ssr` (cookies) renovada no `src/proxy.ts` (Next 16).
  Clientes separados: browser, server (Server Components/Route Handlers) e
  admin (`server-only`, SUPABASE_SECRET_KEY). RLS por membership de workspace
  (`is_workspace_member`). `workspaceId` vem da sessão (`useWorkspace`).
- **Migração local**: assistente em `/migracao` (backup JSON, validação Zod,
  upsert idempotente pelos IDs originais, conferência de contagens, limpeza
  somente com confirmação).
- **Planos + OpenAI**: domínio em `modules/plans` (schemas, commands com
  aprovação/ativação explícitas, queries). IA server-only
  (`platform/ai/openai-plan-structurer.ts`, Responses API + saída estruturada
  estrita) gera PROPOSTAS validadas por Zod; execuções auditadas em `ai_runs`.
  Falha da IA nunca perde o documento (`source_documents`).
- **Recorrências**: motor puro e determinístico
  (`modules/plans/domain/recurrence-engine.ts`) + materializador idempotente
  (chave única `recurrence_rule_id + occurrence_at`).
- **Google**: OAuth próprio (separado do login), tokens AES-256-GCM em
  `integration_tokens` (sem policy de cliente), rotação/revogação tratadas.
  Calendar com scopes mínimos (calendar.app.created + freebusy); Gmail apenas
  gmail.send.
- **Cron**: `/api/cron/automation-tick` (CRON_SECRET, hora em hora) com
  `automation_runs` únicos por (workspace, tipo, idempotency_key) e retries.

### Limitações registradas
- Entidade + evento de domínio são gravados em duas operações (sem transação
  client-side no PostgREST); o evento é auditoria, não fonte de verdade. A
  outbox transacional (RPC) permanece como evolução futura.
- Sem realtime (decisão do ROADMAP): mudanças de outro dispositivo chegam por
  refetch em foco/visibilidade da aba.

## Learning Engine (módulo Aprendizado)

`modules/learning` — motor de aprendizado genérico (Course, LearningModule,
StudySession, LearningPreferences, CoursePreferences), com Japonês como
primeiro curso cadastrado (não hardcoded). Dois repositórios, seguindo o
mesmo princípio de agrupamento de `plans` (`ExecutionPlanRepository` reúne
plano/fases/ações/recorrências):
- `LearningContentRepository`: cursos, módulos e preferências (gerais e por
  curso) — muda pouco, principalmente no seed inicial e em telas de
  configuração.
- `StudySessionRepository`: sessões de estudo — a entidade mais dinâmica.

`LearningCommands`/`LearningQueries` seguem o padrão de `PlanCommands`/
`PlanQueries`. O curso Japonês **não é semeado pela migration SQL**: como
`learning_courses` é uma tabela por workspace, uma migration só alcançaria os
workspaces já existentes no momento em que ela roda. O cadastro é feito por
`LearningCommands.initializeDefaultLearningContent`, chamado (idempotente) na
primeira visita a `/aprendizado` — mesmo padrão de `ensure_personal_workspace`
para o workspace pessoal.

`useReactiveQuery` (`src/lib/hooks.ts`) assina também
`learningContentRepository` e `studySessionRepository`, para que o dashboard
de Aprendizado e o card em `/hoje` atualizem sem refresh ao iniciar/concluir
sessões.

### Learning Content Engine (Fase 2 do módulo)

Conteúdo de lição é declarativo, nunca componente React. `Lesson.content`
(`modules/learning/domain/lesson-content.schema.ts`) é `{ blocks: LessonBlock[] }`
— uma sequência de blocos tipados, validada por `LessonContentSchema`
(`z.discriminatedUnion` sobre `block.type`), que exige que toda lição comece
com um bloco `objective` e termine com um bloco `summary`. "Objetivo",
"conteúdo", "exercícios" e "resumo" não são campos separados: são só blocos
diferentes na mesma sequência — a estrutura pedida vem de onde cada tipo
aparece, não de um esquema paralelo.

Tipos de bloco suportados: `objective`, `text`, `kana`, `example`, `note`,
`multiple_choice`, `matching`, `summary`. `multiple_choice` e `matching` são
os "blocos de exercício" (`EXERCISE_BLOCK_TYPES`): ao serem respondidos,
produzem um `ExerciseResult` padronizado (`{ blockId, outcome }`) — o
contrato que uma futura fase de revisão espaçada consumiria, hoje só usado
para o contador de progresso local em `LessonRenderer`.

`LessonRenderer` (`components/learning/lesson-renderer.tsx`) é o único
renderer: recebe uma `Lesson` e percorre `content.blocks`, delegando cada um
ao componente registrado em `LESSON_BLOCK_COMPONENTS`
(`components/learning/blocks/index.tsx`) para `block.type`. Nunca existe
`Lesson001.tsx`. Para adicionar um tipo de bloco novo: schema em
`lesson-content.schema.ts` → componente em `components/learning/blocks/` →
uma entrada no registro — `LessonRenderer` não muda.

O conteúdo de cada lição vive em `modules/learning/content/*.ts`: objetos
TypeScript validados por `LessonContentSchema.parse(...)` na importação
(erro do Zod imediato, com o campo exato, se o conteúdo for inválido). São
literais TS — não JSON solto nem carregados em runtime — porque a
inicialização de conteúdo já é feita por seed idempotente em
`LearningCommands.ensureModulesAndLessons`. Um curso novo é só: escrever o
conteúdo das lições em `modules/learning/content/`, referenciá-lo no seed —
nenhum componente React novo, nenhuma mudança no renderer.

`learning_lessons.content` (jsonb) tem como default um placeholder mínimo
porém válido (não `{}`), para que nenhuma linha fique num estado que
`LessonContentSchema.parse` rejeite entre a migration e o próximo reparo
idempotente.

### Identidade da lição: `contentKey`, nunca `title`

`title`/`description` são conteúdo editorial e podem mudar a qualquer
momento; `Lesson.contentKey` (kebab-case, ex.: `"hiragana-vogais"`) é a
identidade estável, única dentro do módulo (`unique (module_id,
content_key)`) e imutável após a criação. `ensureModulesAndLessons`
reconcilia lições por `contentKey` — nunca por `title`: encontra a lição
pelo `contentKey` do seed e repara título/descrição/posição/conteúdo caso
divirjam (o seed é a fonte de verdade), sem nunca criar uma linha nova nem
trocar o `id` de uma lição existente. É esse `id` estável que
`learning_lesson_progress.lesson_id` referencia — renomear uma lição no
código de conteúdo nunca duplica a lição nem perde o progresso associado.

### Progresso de lição (`learning_lesson_progress`)

Uma linha por (workspace, lição) — nunca em `study_sessions`, que é sobre
tempo estudado e nunca deriva progresso estrutural. A ausência de linha É o
estado `not_started`; a linha só passa a existir na primeira visualização
(`LearningCommands.recordLessonViewed`, chamado por `LessonRenderer` ao
montar — idempotente, não recria a linha). **`recordLessonViewed` nunca
conclui a lição** — leva no máximo a `in_progress`, mesmo para lições sem
exercícios. Mount de componente nunca é conclusão.

Exercício errado é aprendizagem, não avaliação: uma resposta incorreta
**não trava o exercício** — ele continua respondível até ser resolvido
(acertado). `attempts` (jsonb, `{ [blockId]: { firstOutcome, latestOutcome,
attemptCount, resolvedAt? } }`) é a fonte de verdade por `blockId`:
- `firstOutcome` — resultado da primeira tentativa, **imutável**, guardado
  para análise futura (ex.: uma fase de SRS decidiria a partir dele quanto
  um item precisa de repetição).
- `latestOutcome`/`attemptCount` — acompanham cada tentativa real.
- `resolvedAt` — preenchido na primeira vez em que a resposta é correta; a
  partir daí o exercício trava, mostrando a resposta certa.

`answeredCount`/`resolvedCount` são denormalizados, sempre recalculados a
partir de `attempts` (mesmo princípio de `learning_modules.lessons_count`):
uma nova tentativa no mesmo `blockId` nunca infla `answeredCount`, e uma
chamada para um `blockId` já resolvido é idempotente (não reabre, não
altera o registro). Decisão explícita sobre qual valor persistir ao mudar
de resposta: preservar a **primeira** tentativa em `firstOutcome` — é o
sinal mais honesto de domínio na exposição inicial; uma futura fase de SRS
registraria tentativas de revisão à parte (tabela própria), sem
sobrescrever este snapshot. O log de eventos (`learning.lesson.
exercise_answered`, em toda tentativa real) já dá um rastro histórico leve
sem precisar de uma tabela de tentativas completa nesta fase.

**Conclusão consciente**: `status`/`completedAt` só mudam por
`LearningCommands.completeLesson` — uma ação explícita do usuário
("Concluir lição" em `LessonRenderer`), nunca inferida de visualização nem
de todos os exercícios estarem resolvidos. Sempre permitida, mesmo com
exercícios pendentes — o Command não valida nada sobre completude; é a UI
(`LessonRenderer`) que mostra uma confirmação ("ainda há N pendentes —
concluir mesmo assim?") antes de chamar o Command quando há exercícios não
resolvidos. Idempotente: concluir de novo não reemite o evento nem move
`completedAt`.

`LessonRenderer` é o único ponto que chama `recordLessonViewed`/
`recordExerciseResult`/`completeLesson` — mesmo papel que `StudySessionCard`
cumpre para sessões de estudo. A página da lição só busca `Lesson` +
`LessonProgress` via Queries e trata carregamento/erro; `LessonRenderer`
restaura cada exercício a partir de `attempts[blockId]` (resolvido trava;
incorreto continua respondível, mostrando o histórico — não a interação
exata, já que só o resultado agregado é persistido) e nunca perde progresso
ao atualizar a página. A página do módulo deriva "X de Y concluídas" e o
selo por lição de `listLessonProgressByModule` — nunca um percentual
fictício, e sem alterar `LearningModule.status`/desbloqueios (fora do
escopo desta fase).

### Percurso Hiragana e convenções editoriais (Fase 3 do módulo)

O módulo Fundamentos tem hoje 21 lições — Introdução, Hiragana — Vogais e o
percurso completo do hiragana básico (`modules/learning/content/hiragana-*.ts`),
registradas em `DEFAULT_MODULES[0].lessons` (`learning.commands.ts`). Nenhuma
mudança de arquitetura foi necessária: é só mais conteúdo declarativo,
reconciliado pelo mesmo `ensureModulesAndLessons` por `contentKey`.

Convenções seguidas por todo o conteúdo do curso (para orientar lições
futuras, inclusive de outros cursos):
- No máximo cinco símbolos novos por lição de conteúdo — **exceto** lições
  de dakuten/handakuten (`hiragana-dakuten-*`), que introduzem mais porque
  tratam が/ざ/だ/ば/ぱ como transformação sistemática de か/さ/た/は já
  conhecidos (mesma forma + marca), não como símbolos independentes. Lições
  de revisão (`hiragana-revisao-*`) nunca introduzem símbolo novo.
  Devem sempre seguir a sequência `objective` → explicação → `kana` →
  `example` → `note` (só quando útil) → pelo menos dois exercícios →
  `summary`; para adicionar uma lição nova, ver as lições existentes como
  padrão de estilo e criar o arquivo em `modules/learning/content/`,
  reexportando `LessonContentSchema.parse({...})` como default.
- A cada bloco de 2–3 linhas novas de kana, segue uma lição de revisão
  cumulativa sem símbolos novos, misturando o conjunto recente com o
  anterior — nunca testando algo ainda não ensinado.
- Palavras de exemplo usam só kana já ensinados; quando isso não é possível
  (ex.: がっこう antes da lição de vogais longas, だいじょうぶ antes de じょ
  ser coberto), a parte não ensinada é sinalizada em `note`/comentário como
  exposição, nunca cobrada em exercício.
- `id` de bloco é estável e só precisa ser único **dentro** da lição —
  lições diferentes reusam ids como `'objective'`/`'resumo'` livremente.
  `contentKey` (não `title`) é o que precisa ser globalmente único e
  imutável dentro do módulo (ver seção acima).

**Romaji conectado à renderização**: `CoursePreferences.showRomaji` existia
desde a Fase 1 mas não era lido em lugar nenhum. Agora `LessonBlockViewProps`
(`components/learning/blocks/types.ts`) tem um campo opcional `showRomaji`
(default `true` quando ausente), repassado por `LessonRenderer` a todo
bloco. Só `KanaBlockView` e `ExampleBlockView` o usam, ocultando
`character.romaji`/`item.romaji` quando `false` — tradução (`translation`)
e o hiragana em si nunca somem, só o apoio em romaji. A página da lição
busca a preferência com `getCoursePreferences(courseId)` e a repassa;
exercícios (`multiple_choice`/`matching`) nunca leem `showRomaji` — quando
romaji é o próprio conteúdo testado (ex.: parear kana↔romaji), ele precisa
continuar visível independente da preferência de exibição passiva.
`ExampleItemSchema` ganhou um campo opcional `romaji` (leitura da
palavra/frase inteira), distinto de `note` (comentário pedagógico livre,
ex.: decomposição em sílabas, sempre visível).

**Navegação sequencial por posição, nunca por título**: a página da lição
busca `listLessonsByModule(moduleId)`, ordena por `position` e calcula a
lição seguinte à atual. Após `completeLesson` (via `onCompleted` do
`LessonRenderer`, para não esperar um refetch) ou ao reabrir uma lição já
concluída, mostra "Próxima lição" (se houver) ou "Voltar ao módulo" (na
última). A página do módulo faz o mesmo cálculo — primeira lição da lista
ordenada sem progresso `completed` — para destacar um selo "Recomendada";
sem destaque quando todas as lições já estão concluídas.

## Evolução planejada

- **Automações externas**: regras centrais vivem no painel (commands/endpoints); ferramentas externas (n8n etc.) apenas chamam essas portas.
- **MCP**: servidor MCP como porta de entrada que chama os mesmos Commands/Queries — nunca o banco direto. Contratos em `platform/mcp/mcp.registry.ts`.
- **Leitura de Gmail**: documentada como fase posterior (scopes e requisitos adicionais).

## Deploy

Vercel, projeto `painelpessoallucas`. `vercel.json` fixa `"framework": "nextjs"` — necessário porque o Framework Preset do projeto ficou como "Other" no primeiro deploy (causa histórica do 404 em produção; ver `docs/AUDIT.md`). Build de produção valida TypeScript e não ignora erros.
