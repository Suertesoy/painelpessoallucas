# Arquitetura — Painel Pessoal Lucas

> Este documento descreve a arquitetura realmente implementada, incluindo a persistência remota, IA e sincronização em tempo real.

## Visão geral

Monólito modular em Next.js (App Router). A UI nunca acessa persistência diretamente: tudo passa por **Commands** (escrita) e **Queries** (leitura), que usam **Repositories** (interfaces). Em produção, os adaptadores usam Supabase; os adaptadores de localStorage permanecem apenas para a migração da Fase 1.

```
src/
  app/                    # Rotas (hoje, entrada, projetos, ideias, agenda, revisao, api/health)
  components/             # Componentes client (modais, navegação)
  lib/                    # hooks reativos, datas (fuso local), constantes, eventos de UI
  modules/
    items|projects|planning|reminders/
      domain/             # Zod schemas + tipos (fonte única de verdade)
      application/        # Commands, Queries e interfaces de Repository
      infrastructure/     # Adaptadores Supabase e legado localStorage
    global/application/   # Busca global (composição de queries)
  platform/
    storage/              # Adaptadores legados e infraestrutura compartilhada
    events/               # DomainEvent + repositório de eventos (append-only)
    ai/, integrations/, mcp/, push/  # IA, integrações, contratos e Web Push (tudo server-only)
  providers/              # RepositoryProvider (composition root / DI via Context)
  test/                   # Vitest (domínio, queries, datas)
```

## Fluxo de dados

1. Componente chama `useCommands()` / `useQueries()` (Context).
2. Command valida o payload com Zod (`domain/*.schema.ts`), persiste via Repository e grava um `DomainEvent` no repositório de eventos.
3. O repositório notifica o `ChangeNotifier`; `useReactiveQuery` reexecuta a query e a UI atualiza sem refresh.
4. Mudanças de outro dispositivo chegam por uma única assinatura Supabase Realtime do workspace.
5. Após perda de conexão, `online`, foco, visibilidade e a confirmação `SUBSCRIBED` disparam uma consulta completa para reconciliar qualquer evento perdido.

### Reatividade — decisão registrada
Queries são assíncronas (retornam `Promise`), então a UI usa o padrão **effect + subscribe** (`useReactiveQuery`). O hook descarta respostas antigas quando consultas sobrepostas terminam fora de ordem. `useSyncExternalStore` é usado para snapshots síncronos, como o status da conexão Realtime.

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
- **Realtime**: `ChangeNotifier` mantém uma assinatura de mudanças do
  workspace, atualiza todas as queries abertas e expõe
  `connected/reconnecting/offline` para a interface. A publicação das tabelas
  é configurada por migration idempotente.
- **Captura inteligente**: texto ou áudio é persistido imediatamente como
  captura; o áudio existe apenas em memória até a transcrição. A triagem
  server-only registra `ai_runs`, pode separar múltiplas intenções e só cria
  tarefa, agendamento, nota ou item de compra após confirmação individual.

### Limitações registradas
- Entidade + evento de domínio são gravados em duas operações (sem transação
  client-side no PostgREST); o evento é auditoria, não fonte de verdade. A
  outbox transacional (RPC) permanece como evolução futura.
- Realtime avisa que algo mudou, mas a fonte de verdade continua sendo uma
  nova query ao Supabase. Assim, reconexões não dependem de reproduzir cada
  evento intermediário.

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

## Web Push (Fase 2.2)

Notificações push nativas do navegador (Web Push padrão: Service Worker +
Push API + Notification API + VAPID), por dispositivo — não confundir com
Firebase Cloud Messaging (não usado) nem com os lembretes nativos do Google
Calendar (que continuam sendo o canal para compromissos com horário).

### Arquitetura

- `platform/push/vapid.ts` (server-only): configura o par VAPID e envia via
  [`web-push`](https://www.npmjs.com/package/web-push) (biblioteca de
  referência para o protocolo Web Push — nunca implementamos a criptografia
  manualmente). Categoriza erros do serviço de push em
  `expired_subscription | rate_limited | payload_too_large | network_error |
  server_error | unknown_error`, nunca propagando a mensagem crua.
- `platform/push/push-content.ts` (puro): conteúdo genérico vs. detalhado por
  categoria — ver "Privacidade do conteúdo" abaixo.
- `platform/push/calendar-coverage.ts` (puro): regra de não duplicidade com o
  Google Calendar — ver seção própria.
- `platform/push/push-dispatch.ts` (server-only): outbox — cria
  `notifications` (idempotente por `dedup_key`) + uma `push_deliveries` por
  assinatura elegível, e despacha as pendentes com retries.
- `platform/push/push-tick.ts` (server-only): os quatro trabalhos do cron de
  5 minutos (lembretes vencidos, aviso diário, aviso semanal, recuperação de
  falha de captura).
- `platform/push/push-subscription.controller.ts` (`'use client'`): único
  ponto que toca `Notification`, `PushManager` e `navigator.serviceWorker` —
  representa os 10 estados possíveis (sem suporte, iOS fora do modo
  instalado, VAPID ausente, permissão default/negada/concedida sem
  assinatura, assinatura ativa, assinatura perdida, erro recuperável). Usa o
  **mesmo** service worker já registrado por `ServiceWorkerController` —
  nunca registra um segundo.
- `lib/use-push-notifications.ts`: hook que combina o controller acima com as
  rotas server-side (preferências, dispositivos, teste). Nenhum componente
  chama `fetch('/api/push/...')` diretamente.
- `components/push/push-notifications-card.tsx`: card "Notificações neste
  dispositivo" em Configurações.
- `modules/reminders/`: domínio do lembrete de tarefa (`ReminderCommands.
  setTaskReminder/cancelReminder`), reaproveitando a tabela `reminders`
  existente com `channel = 'push'`.

### Tabelas e outbox

- `push_subscriptions`: uma linha por dispositivo (`endpoint` único
  globalmente), com `user_id` + `workspace_id` (nunca gerenciável por outro
  usuário), preferências por categoria (todas começam **desativadas**),
  fuso IANA do dispositivo e `last_seen_at`/`disabled_at`. Sem policy de RLS
  para `authenticated` (mesmo padrão de `integration_tokens`): leitura e
  escrita só pelo servidor, depois de validar sessão + workspace + user_id.
- `push_deliveries`: outbox de envio — uma linha por
  (`notification_id`, `subscription_id`), única (nunca envia a mesma
  notificação duas vezes ao mesmo dispositivo). Estados `pending | sent |
  failed | cancelled`, `attempt`, `next_attempt_at`, `error_category`
  sanitizado.
- `notifications` ganhou `dedup_key` (único por workspace, índice parcial),
  `target_url` (deep link interno) e `metadata` jsonb mínimo (só o título da
  tarefa para lembretes, quando aplicável — nunca transcrição, resposta de
  IA ou erro técnico).
- `reminders.channel` ganhou o valor `'push'` (mantendo `'app'`/`'email'`
  existentes).

### Categorias

1. **Lembrete de tarefa** — data/horário definidos explicitamente pelo
   usuário no detalhe do item (`ReminderCommands.setTaskReminder`), máximo
   um lembrete push pendente por item. Diferente de prazo, agendamento e do
   lembrete nativo do Google Calendar.
2. **Aviso diário** ("Organize seu dia") — horário e fuso configuráveis por
   dispositivo, destino `/hoje`.
3. **Revisão semanal** ("Hora da revisão semanal") — dia, horário e fuso por
   dispositivo, destino `/revisao`.
4. **Falha de captura** — só quando o item é uma captura analisável
   (`source` `quick_capture`/`audio_capture`) e a execução de triagem
   correspondente (`ai_runs.operation = 'capture_triage'`) terminou
   `failed`; nunca para falha de outra operação de IA. Criada no caminho
   principal (`/api/ai/triage-capture`, best-effort) e recuperada
   idempotentemente pelo `push-tick` (janela de 14 dias).

### Não duplicidade com o Google Calendar

Antes de criar uma entrega de lembrete de tarefa, `push-tick` consulta
`calendar_event_links` do item. Um lembrete só é considerado "já coberto"
(`isCoveredByGoogleCalendarReminder`, `platform/push/calendar-coverage.ts`)
quando **todas** as condições são verdadeiras:
`items.calendar_sync === 'sync_reminder'` **e** o vínculo existe com
`sync_status === 'synced'` **e** `reminders_minutes` não está vazio (é
exatamente o que `upsertItemEvent` envia ao Google quando `sync_reminder`
está ativo). Qualquer outro estado (`pending`, `error`, `deleted`,
`calendar_sync = 'sync'` sem lembrete, ou ausência de vínculo) significa que
o Google não está de fato avisando — o push é permitido como garantia. A
regra roda no servidor (nunca só escondida na UI); a UI mostra um aviso
informativo quando aplicável.

### Privacidade do conteúdo

`push_subscriptions.show_details_enabled` começa **desativado**. Desativado:
título genérico ("Painel Lucas") e corpo genérico ("Você tem um lembrete
para revisar."/textos fixos por categoria). Ativado: o lembrete de tarefa
mostra o título da tarefa (truncado em 140 caracteres) — as demais
categorias já são genéricas por natureza. Nunca: transcrição, resposta de
IA, tokens, credenciais ou mensagem técnica de erro (`platform/push/
push-content.ts`, puro e testado isoladamente).

### Idempotência e retries

- Criação de notificação: `insert` em `notifications` com `dedup_key` único
  por workspace; conflito (23505) busca a existente — nunca duas
  notificações para a mesma ocorrência.
- Criação de entrega: `insert` em `push_deliveries` único por (notificação,
  assinatura); conflito é ignorado.
- Envio: sucesso confirmado pelo `web-push` antes de marcar `sent`. HTTP 404
  ou 410 desativa a assinatura permanentemente (`disableSubscription`) e
  cancela outras entregas pendentes do mesmo dispositivo (efeito visível a
  partir da próxima leva do cron — duas notificações vencidas no mesmo
  lote ainda tentam enviar independentemente, best-effort). Erros
  temporários (rede, 5xx, 429) reagendam com backoff (5 min na 1ª
  tentativa, 15 min na 2ª) até `PUSH_MAX_ATTEMPTS = 3`; depois, `failed`
  permanente. Uma falha num dispositivo nunca impede o envio aos demais; uma
  falha num workspace nunca aborta os demais (loop por workspace, try/catch
  isolado, mesmo padrão do `automation-tick`).
- Cron: chave de idempotência em blocos de 5 minutos
  (`fiveMinuteBucketKey`), nunca a chave horária do `automation-tick` — um
  lembrete criado às 14:07 e outro às 14:22 são processados em blocos
  distintos, sem competir pela mesma chave.

### Cron

`/api/cron/push-tick` (`runtime = 'nodejs'`, obrigatório porque depende de
`web-push`), a cada 5 minutos (`vercel.json`) — plano Vercel Pro do projeto
(confirmado por `vercel usage`), que permite frequência de até 1x/minuto e
precisão por minuto (Hobby só permite 1x/dia). Cuida somente de: lembretes
push vencidos, avisos diário/semanal, recuperação de falha de captura e
despacho da outbox. Recorrências, Google Calendar e resumos por e-mail
continuam exclusivamente no `automation-tick` horário, inalterado.

**Achado crítico corrigido nesta entrega**: o projeto nunca teve
`CRON_SECRET` configurado na Vercel — sem essa variável, `isAuthorized()`
(em ambos os crons) sempre retorna `false`, então toda invocação do
`automation-tick` retornava 401 desde o deploy original. Um `CRON_SECRET`
foi gerado e configurado (Production + Preview) como parte desta entrega.

### Limitações do iPhone/iPad

Safari/iOS só entrega Web Push a partir do app **adicionado à Tela de
Início** (modo standalone) — nunca no navegador aberto normalmente. Antes
disso, o card de Configurações explica a instalação e não oferece nenhum
botão de ativação que não funcionaria (`ios_not_installed`).

### Variáveis de ambiente

`NEXT_PUBLIC_VAPID_PUBLIC_KEY` (pode chegar ao navegador), `VAPID_PRIVATE_KEY`
(somente servidor), `VAPID_SUBJECT` (`mailto:` ou URL HTTPS do app).

### Renovar o par VAPID

Gerar um novo par com `webpush.generateVAPIDKeys()` (ou
`npx web-push generate-vapid-keys`) invalida **todas** as assinaturas
existentes (o navegador rejeita `applicationServerKey` diferente da usada na
assinatura original) — todo usuário precisaria reativar manualmente.
Preferir não trocar a menos que a chave privada tenha vazado. Ao trocar:
gerar um único par novo, atualizar `NEXT_PUBLIC_VAPID_PUBLIC_KEY` e
`VAPID_PRIVATE_KEY` na Vercel (nunca versionar a privada) e comunicar aos
usuários que precisarão clicar em "Ativar notificações" novamente.

### Desativar uma assinatura expirada manualmente

Normalmente automático (404/410 do serviço de push). Para forçar: usar
"Desativar neste dispositivo" (o próprio) ou revogar pela lista de
dispositivos em Configurações (`POST /api/push/devices/[id]/revoke`) — nunca
DELETE direto na tabela (preserva histórico/auditoria via `disabled_at`).

## Lista de Compras

Reaproveita a entidade `items` existente (`type = 'shopping_item'`) para o
conteúdo comprável — a Fase 3 (captura inteligente) já sabia reconhecer e
armazenar esse tipo, mas não existia nenhuma experiência de lista utilizável
(só um valor de filtro na Caixa de Entrada). Esta fase acrescenta o conceito
de **lista** e o vínculo entre um item de compra e sua lista, sem criar uma
segunda entidade de item concorrente com `items`.

### Modelo de dados

- `shopping_lists` (nova tabela): `id`, `workspace_id`, `slug`, `name`,
  `created_at`, `updated_at`, `unique (workspace_id, slug)`. RLS por
  `is_workspace_member`, mesmo padrão das demais tabelas de domínio.
  Publicada no `supabase_realtime` (migration
  `20260731100000_shopping_lists.sql`).
- `items.shopping_list_id` (aditiva, nula): `uuid references shopping_lists
  (id) on delete set null`. Só é relevante quando `type = 'shopping_item'`;
  índice parcial `items_shopping_list_idx` (`where deleted_at is null and
  type = 'shopping_item'`).
- `workspace_settings.shopping_whatsapp_number` (aditiva, nula): número de
  WhatsApp usado para compartilhar a lista — ver seção própria abaixo.

"Comprado"/"pendente" reaproveita o `status` que `items` já tinha
(`completed`/qualquer outro) e `ItemCommands.completeItem`/`reopenItem`
existentes — nenhum campo novo de conclusão foi criado. "Editar", "mover
entre listas" e "excluir" reaproveitam, respectivamente,
`ItemCommands.updateItem({ title })`, `updateItem({ shoppingListId })`
(atualiza só o vínculo com a lista) e `archiveItem` (soft delete/arquivamento,
mesmo padrão já usado pelo resto do domínio — nunca exclusão física).

### Listas iniciais (Mercado/Internet) — criação idempotente

Como `shopping_lists` é uma tabela por workspace, uma migration só
alcançaria os workspaces já existentes no momento em que ela roda (mesma
razão pela qual `learning_courses` não é semeada por SQL — ver seção
"Learning Engine" acima). `ShoppingCommands.ensureDefaultLists()`
(`modules/shopping/application/shopping.commands.ts`) garante Mercado e
Internet por `slug`, via `upsert(..., { onConflict: 'workspace_id,slug',
ignoreDuplicates: true })` — abrir `/compras` duas vezes nunca duplica.
Chamada na primeira visita a `/compras` (mesmo padrão de
`initializeDefaultLearningContent`) e também a partir de
`/api/ai/confirm-triage-action`, para garantir que a lista de destino exista
antes de vincular uma captura confirmada como `shopping_item`.

O núcleo idempotente vive em
`modules/shopping/infrastructure/ensure-default-shopping-lists.ts` — uma
função pura de `(SupabaseClient, workspaceId)`, sem `ChangeNotifier`, para
ser reaproveitada tanto pelo repositório do cliente
(`SupabaseShoppingListRepository`, que ainda dispara `notify()`) quanto pela
rota de servidor de confirmação da triagem.

**Backfill dos `shopping_item` antigos**: a mesma chamada faz
`update items set shopping_list_id = <id de Mercado> where workspace_id = $1
and type = 'shopping_item' and shopping_list_id is null and deleted_at is
null` — determinístico e idempotente (não há mais linhas nulas para migrar
depois da primeira execução). Nenhum item de compra antigo desaparece.

### Commands, Queries e eventos

- `ShoppingListRepository`/`SupabaseShoppingListRepository`
  (`modules/shopping/{application,infrastructure}`): `findAll`,
  `ensureDefaultLists`, `subscribe` — mesmo formato de repositório do resto
  do projeto.
- `ShoppingCommands.ensureDefaultLists()`: emite `shopping_list.initialized`
  só para listas realmente criadas nesta chamada (nunca reemite).
- `ShoppingQueries.getBoard()`: uma única leitura para toda a página —
  listas + itens de compra (não arquivados) já separados em
  pendentes/comprados e ordenados (pendentes por `createdAt` asc, comprados
  por `completedAt` asc — ordenação estável dentro de cada grupo).
- Toda mutação de item (adicionar, editar, marcar/desmarcar, mover, excluir)
  usa `ItemCommands` já existente — nenhum Command novo foi criado para o
  conteúdo do item, só para o ciclo de vida das listas.
- `Item.shoppingListId` (schema) e `CreateItemSchema.skipInbox`: exceção
  estreita à regra "captura primeiro, organizar depois" — um item de compra
  adicionado direto numa lista já nasce `organized` (o usuário escolheu a
  lista no próprio ato de digitar, não precisa de triagem). Nunca expõe um
  `status` arbitrário — só um booleano que pula especificamente o estado
  `inbox`. `ItemQueries.getReviewOverview().noProject` passou a excluir
  `type = 'shopping_item'` — ele nunca tem projeto por design, não é uma
  omissão a ser revisada.

### Relação com `shopping_item` e a captura inteligente

`/api/ai/confirm-triage-action` ganhou `action.shoppingListId` (opcional) e
`actionIndex` (opcional). Quando a ação confirmada é `shopping_item`: a rota
garante Mercado/Internet (idempotente), valida que o `shoppingListId`
recebido realmente pertence ao workspace (nunca confia num id vindo do
cliente/IA) e usa Mercado como padrão quando ausente ou inválido.
`AudioCaptureReview` mostra um seletor "Lista" só quando o tipo da ação é
`shopping_item`, pré-selecionado com Mercado assim que as listas carregam,
sem travar a revisão caso a chamada falhe (o servidor resolve Mercado de
novo).

**Idempotência da confirmação**: `actionIndex` (posição da ação em
`proposal.proposedActions`) permite ao servidor derivar um id de item
**determinístico** (`deterministicUuid(`${aiRunId}:${actionIndex}`)`, em
`src/lib/deterministic-uuid.ts`) em vez de um `crypto.randomUUID()` puro.
Uma confirmação retentada (rede instável, duplo clique) colide com a chave
primária (Postgres `23505`) em vez de criar um item duplicado — a rota trata
esse conflito especificamente como sucesso idempotente. Isso vale para
qualquer `actionType: 'create_item'`, não só `shopping_item`; clientes que
não enviam `actionIndex` mantêm o comportamento anterior (sem essa garantia).

### Realtime

Nenhum canal novo: `/compras` usa exatamente o mesmo `useReactiveQuery` e o
`ChangeNotifier` compartilhado do resto do painel.
`shoppingListRepository` foi adicionado à lista fixa de repositórios que
`useReactiveQuery` assina (`src/lib/hooks.ts`) — como todos os repositórios
Supabase compartilham a mesma instância de `ChangeNotifier`, qualquer
mudança em `items`, `shopping_lists` ou `workspace_settings` (todas
publicadas no `supabase_realtime`) já dispara um refetch da página, entre
dispositivos, sem polling.

### Configuração do WhatsApp

`workspace_settings.shopping_whatsapp_number` — nunca hardcoded (nenhum
componente, constante ou migration contém um número; teste dedicado
`src/test/no-hardcoded-whatsapp-number.test.ts` varre o código-fonte). Fica
vazio em todo workspace novo; preenchido pela interface em Configurações →
Compras (`ShoppingWhatsappSettingsCard`), rota dedicada
`/api/settings/shopping` (GET/PUT) — narrower que `/api/settings/digest`
para que o `upsert` só toque essa coluna, nunca as preferências de resumo.

`modules/shopping/domain/whatsapp-share.ts` (puro, sem I/O):
`normalizePhoneDigits`, `isValidWhatsAppNumber` (10–15 dígitos, cobre código
do país + DDD + linha), `buildWhatsAppShareText` (nome da lista + um item
pendente por linha, marcador `☐`) e `buildWhatsAppShareUrl` — sempre
`https://wa.me/<dígitos>?text=<mensagem>`, nunca uma URL arbitrária. O botão
"Enviar pelo WhatsApp" só compartilha a lista selecionada, só itens
pendentes, e fica desabilitado (com explicação) sem número válido ou sem
itens pendentes — nunca envia nada sozinho, só abre a conversa após clique
explícito.

### Limitação conhecida

As migrations `20260731100000_shopping_lists.sql` e
`20260731110000_shopping_lists_grants.sql` foram criadas no repositório mas
**não foram aplicadas** no Supabase remoto nesta entrega. Até serem
aplicadas (nesta ordem), `shopping_lists` e `items.shopping_list_id` não
existem remotamente — `/compras` e a confirmação de `shopping_item` na
triagem falham de forma tratada (aviso seguro via `DataErrorNotice`, com
"Tentar novamente" repetindo o fluxo completo de inicialização; nunca uma
tela quebrada, nunca a mensagem interna do Postgres exposta na UI).

A segunda migration existe porque a primeira criou tabela e RLS mas nunca
concedeu `GRANT` a `authenticated`/`service_role` — sem isso o Postgres nega
o acesso na camada de privilégios antes mesmo de avaliar qualquer policy de
RLS, produzindo "permission denied for table shopping_lists" mesmo depois
de aplicar a primeira migration sozinha (mesma causa raiz já documentada em
`20260722140000_api_role_grants.sql` para as demais tabelas do projeto).

## Finanças

Módulo Finanças: importação em lote de extratos/faturas (CSV/OFX) com
detecção automática de formato, categorização local determinística, revisão
antes da confirmação, e consolidação mensal da casa. Reaproveita o padrão de
`shopping` como template (Commands→Zod→Repository→evento, `ensureDefault*`
idempotente por workspace), mas com uma diferença deliberada: RLS **e**
GRANT já saem juntos na mesma migration (`20260731120000_finance.sql`), para
não repetir a lacuna que exigiu uma segunda migration corretiva em
`shopping_lists`. Uma segunda migration aditiva
(`20260731130000_finance_batch_import.sql`) acrescenta os campos usados pela
simplificação do fluxo de importação (origem automática, caixa separado por
pessoa, auditoria de valor bruto) — ver subseções abaixo.

### Escopo consciente: consolidado, nunca por pessoa

Os gastos são separados **só por categoria**, nunca por quem comprou. As
origens de importação (cartões/contas) existem para identificar o arquivo,
prevenir duplicidade e interpretar pagamento de fatura — nunca para inferir
se a compra foi de Lucas ou Matheus (os dois usam os cartões disponíveis).
Não há divisão de despesas, cálculo de quanto uma pessoa deve à outra, nem
saldo por banco/conta.

### Modelo de dados

`src/modules/finance/domain/*.schema.ts` (Zod, fonte única de verdade) +
`supabase/migrations/20260731120000_finance.sql`:

- `finance_settings` — 1 linha por workspace: valor padrão de renda do
  Matheus para **novos** meses (mudar o padrão nunca reescreve meses já
  criados — a fotografia acontece na criação do registro do mês, em
  `SupabaseFinanceRepository.upsertMonthlyRecord`).
- `finance_sources` — origens (`kind: 'card' | 'account'`), mais (desde
  `20260731130000_finance_batch_import.sql`) `provider` (`'nubank' | 'c6' |
  'generic'`, chave estável de resolução automática — nunca o nome de
  exibição) e `status` (`'active' | 'legacy'`). Seed idempotente por
  workspace: as três origens antigas vinculadas a pessoa (Cartão Nubank
  Lucas, Cartão C6 Lucas, Cartão Nubank Matheus) continuam sendo criadas
  como `legacy` — preservadas para dados já existentes, mas nunca usadas
  pelo fluxo de importação atual, que não pergunta origem ao usuário; as
  três origens internas automáticas (`Nubank • Cartão`, `Nubank • Conta`,
  `C6 • Cartão`, esta última só metadado — sem detecção automática
  implementada) nascem `active`. Ver "Origem automática" abaixo.
- `finance_categories` — 13 categorias conservadoras (Mercado, Alimentação,
  Casa, Transporte, Saúde, Educação, Assinaturas, Lazer, Compras, Serviços e
  tarifas, Viagens, Outros, Não classificado), seed idempotente por
  workspace (mesmo motivo de `shopping_lists`/`learning_courses`: tabela por
  workspace não é alcançável por seed de migration).
- `finance_classification_rules` — regras aprendidas, exatas ou por trecho
  normalizado, isoladas por workspace, criadas só após confirmação explícita
  na revisão.
- `finance_imports` / `finance_import_rows` — lote de importação e linhas em
  revisão (`status: pending_review | confirmed | ignored`).
  `finance_import_rows.source_amount_cents` (desde a migration aditiva)
  guarda o valor bruto antes da normalização de sinal do perfil, só para
  auditoria — nunca a linha bruta inteira.
- `finance_transactions` — só as confirmadas; único ponto que alimenta
  gráficos e cálculos. Também ganhou `source_amount_cents` pelo mesmo motivo.
- `finance_monthly_records` — renda (Matheus/Lucas/outras), guardado, e
  (desde a migration aditiva) disponível separado por pessoa
  (`lucas_available_cash_cents`/`matheus_available_cash_cents`); a coluna
  original `available_cash_cents` passou a ser sempre o TOTAL calculado
  (soma dos dois), nunca editada diretamente — ver "Caixa separado por
  pessoa" abaixo.

**Integridade entre workspaces via FK composta**: `finance_categories`,
`finance_sources` e `finance_imports` têm `unique (workspace_id, id)` além
da PK; toda referência cruzada (`finance_import_rows.category_id`,
`.import_id`, `finance_transactions.source_id` etc.) usa
`foreign key (workspace_id, <col>) references <tabela> (workspace_id, id)`
— impossível uma linha referenciar uma entidade de outro workspace, mesmo
manipulando o payload enviado ao servidor.

**Possível duplicidade sem referência polimórfica**:
`finance_import_rows` tem duas colunas opcionais —
`possible_duplicate_transaction_id` (aponta para uma transação já
confirmada, sinalizado por FITID ou impressão digital repetida) e
`possible_duplicate_import_row_id` (aponta para outra linha do mesmo lote,
quando duas linhas do CSV têm a mesma impressão digital) — nunca as duas ao
mesmo tempo (`check` no banco). Nenhuma das duas bloqueia a confirmação:
duas compras legítimas idênticas continuam preserváveis, só marcadas para
conferência na revisão.

### Convenção monetária

Valor **negativo = saída**, **positivo = entrada**, em toda parte —
inclusive internamente em `finance_transactions.amount_cents`. Faturas de
cartão que representam compra como número positivo são invertidas na
importação (`domain/csv-parser.ts`, `amountMode: 'card_positive_purchase'`);
quando o mapeamento não permite inferir isso com segurança (uma única
coluna de valor, sem colunas separadas de débito/crédito), a rota de
importação sempre pede confirmação explícita do usuário antes de processar
qualquer linha.

Gasto do mês = soma de `purchase`/`fee` (valor absoluto) **menos** a redução
de `refund` corretamente classificado; `invoice_payment`, `transfer`,
`unidentified_credit` e `ignored` contribuem zero
(`domain/money.ts#expenseContributionCents`, único lugar onde essa regra
existe — nenhum componente reimplementa a aritmética).

### Parsers (`domain/csv-parser.ts`, `domain/ofx-parser.ts`) — puros, sem I/O

- **CSV**: tokenizer manual (aspas, `""` literal, delimitador `,`/`;`/tab
  detectado por amostragem), decimal brasileiro e ISO, datas `dd/mm/aaaa` e
  ISO por regex/fatiamento (nunca `new Date(...)`), colunas separadas de
  crédito/débito. `detectCsv` primeiro tenta dois **perfis conhecidos**
  (assinatura exata de cabeçalho, nunca o nome do arquivo):
  `nubank_credit_card_statement` (`date,title,amount`, decimal com vírgula,
  compra positiva invertida via `amountMode: 'card_positive_purchase'`) e
  `nubank_account_statement` (`Data,Valor,Identificador,Descrição`, decimal
  com ponto, `Identificador` como `idColumn`/FITID) — os dois sempre
  `confident: true`, nunca pedem mapeamento manual, mesmo com uma única
  coluna de valor. Fora desses dois, cai no reconhecimento heurístico
  genérico por cabeçalho; quando a confiança é baixa — ou há só uma coluna
  de valor sem separação débito/crédito — a rota devolve `{ needsMapping:
  true, detection }` sem persistir nada; o cliente reenvia o arquivo +
  mapeamento no mesmo POST (o arquivo nunca fica esperando no servidor entre
  as duas requisições). `domain/date-range.ts#computeDateRange` calcula
  menor/maior data do lote de linhas (nunca depende de o arquivo estar em
  ordem crescente ou decrescente — faturas reais atravessam dois meses).
- **OFX**: detecta XML (OFX 2.x, `<?xml`) vs SGML (OFX 1.x). XML via
  `fast-xml-parser` (única dependência nova, pequena, sem dependências,
  processamento 100% local). SGML via uma máquina de estados de pilha
  própria (tags-container abrem/fecham explicitamente; tags-folha trazem o
  valor na mesma linha e fecham implicitamente na tag seguinte do mesmo
  nível) — não é regex solto. Datas (`DTPOSTED`/`DTSTART`/`DTEND`) são
  extraídas por fatiamento dos 8 primeiros dígitos (`YYYYMMDD`), nunca via
  `Date`/UTC — um sufixo de fuso (`[-3:BRT]`) nunca desloca o dia bancário.
  Quando `DTSTART`/`DTEND` estão ausentes, `parseOfx` cai para
  `computeDateRange` das transações (mesmo helper do CSV). `kind` (cartão x
  conta) é decidido estruturalmente por `detectOfxAccountKind`
  (`CREDITCARDMSGSRSV1`/`CCACCTFROM` vs o resto) — não há perfil de banco
  reconhecido para OFX nesta versão, só a estrutura cartão/conta.
- **Encoding**: BOM/decodificação UTF-8 estrita primeiro; se falhar, cai
  para Windows-1252 (`domain/csv-parser.ts#decodeTextBuffer`, reaproveitado
  pelos dois formatos).

### Categorização local (`domain/classification-engine.ts`)

Regras aprendidas (por workspace, exatas ou por trecho normalizado) têm
prioridade sobre um conjunto pequeno de regras seed conservadoras
(supermercado→Mercado, ifood/restaurante→Alimentação, farmácia→Saúde,
netflix/spotify→Assinaturas, tarifa/anuidade/IOF→Serviços e tarifas;
"pagamento de fatura"/"pagamento recebido"→natureza `invoice_payment`
(fatura de cartão identifica o pagamento como "Pagamento recebido", o
extrato da conta como "Pagamento de fatura" — mesma operação, dois lados);
"estorno"→natureza `refund`; "resgate" (ex.: RDB)→natureza `transfer`
(nunca renda); "transferência"/TED/DOC→natureza `transfer`, **exceto**
quando a descrição também contém "pix" (`excludeIfContains`) — Pix é
propositalmente excluído dessa regra: pode ser tanto repasse pessoal quanto
despesa para um estabelecimento, nenhum dos dois é uma suposição segura só
pelo texto, então a natureza padrão pelo sinal do valor prevalece e a
revisão manual decide. Sem correspondência segura: `nao-classificado`, sem
forçar nada.
Regra nova só é criada quando o usuário confirma explicitamente "Aplicar
esta classificação a lançamentos semelhantes" na revisão
(`FinanceImportCommands.createClassificationRuleFromReview`).

### Importação (`/api/finance/import`, servidor) — uma requisição por arquivo, sem escolha de origem

Sessão + workspace via `getSessionContext()` (mesmo helper de
`/api/audio/transcribe`), limite de 10 MB conferido pelo `Content-Length`
(fail-fast) e pelo tamanho real do buffer lido, formato conferido pela
extensão **e** pela estrutura do conteúdo (nunca só extensão/MIME). SHA-256
calculado no servidor (`crypto.subtle.digest`) antes de qualquer
persistência; o buffer do arquivo existe só durante a requisição — nunca é
gravado em disco, Supabase, evento ou log.

A rota não recebe mais `sourceId` no corpo — a origem é sempre resolvida
automaticamente pelo perfil detectado (ver "Origem automática" abaixo), o
que também simplifica a duplicidade: a checagem por hash só acontece depois
que a origem já foi resolvida (perfil → nome estável → busca/criação).

**Reimportação idempotente sem corrida**: `finance_imports` tem um único
`unique (workspace_id, source_id, file_sha256)` (não parcial — NULL nunca
colide consigo mesmo em UNIQUE, então isso já bastaria mesmo sem essa
coluna ser opcional). A rota busca antes de inserir: hash já confirmado →
409 sem criar nada; hash já pendente → devolve o import existente (reabre a
revisão, sem duplicar linhas); hash novo → insere. Duas requisições
simultâneas colidem no índice único (Postgres `23505`); a perdedora da
corrida busca de novo e devolve o resultado da vencedora como reaberto —
nunca um erro para o usuário nem uma segunda importação.

### Origem automática (`domain/source-resolution.ts`, `infrastructure/resolve-import-source.ts`)

O usuário nunca escolhe origem, cartão ou pessoa antes do upload — a tela de
importação não tem esse campo. `importSourceProfileForCsv`/`ForOfx`
(funções puras) mapeiam o perfil detectado para um nome ESTÁVEL e
determinístico: `nubank_credit_card_statement` → `"Nubank • Cartão"`,
`nubank_account_statement` → `"Nubank • Conta"`; fora dos dois perfis
Nubank, uma origem genérica por tipo (`"Cartão (formato genérico)"` /
`"Conta (formato genérico)"`, `provider: 'generic'` — nunca declara um banco
específico como C6 sem fixture/arquivo real validado). `kind` (cartão x
conta), quando o CSV não é um perfil conhecido, vem do `amountMode`
escolhido no mapeamento manual (nunca de uma pergunta "é cartão ou conta?"
separada) ou da estrutura do OFX.

`resolveImportSource` faz busca-ou-cria por `(workspace_id, name)` — o
mesmo índice único já usado por `ensureFinanceDefaults` — então nomes
estáveis bastam para nunca duplicar a origem entre importações,
inclusive sob corrida concorrente (mesmo tratamento de `23505` do
`finance_imports`). As origens antigas vinculadas a pessoa (`status:
'legacy'`) nunca são candidatas: a resolução é só por perfil, nunca por
nome digitado ou escolhido pelo usuário.

### Upload em lote (`/financas/importar`) e fila de revisão

A tela aceita múltiplos arquivos numa única seleção ou arrasto (`<input
multiple>` + drop zone), com limite de 10 arquivos/40 MB por lote além do
limite de 10 MB por arquivo — tudo conferido no cliente antes de processar,
com contagem e tamanho total visíveis e remoção individual. "Processar N
arquivo(s)" dispara uma fila de concorrência fixa (2 requisições
simultâneas) contra a MESMA rota `/api/finance/import` de um arquivo — não
existe uma rota multipart de lote; cada arquivo tem progresso e resultado
independentes (`pending → uploading → recognized_card/recognized_account/
processed/duplicate/needs_mapping/invalid/failed`), e um arquivo com
erro ou duplicidade nunca cancela os demais. Ao final, um resumo consolida
contagens (processados, reconhecidos automaticamente, já importados,
precisam de confirmação, lançamentos encontrados, possíveis duplicidades) e
oferece "Ir para revisão", que leva à primeira importação pendente com
`?queue=id1,id2,...&pos=0` — uma coordenação puramente local via query
string, nunca uma entidade de lote persistida no banco. Em
`/financas/revisao/[importId]`, confirmar (ou voltar) oferece a próxima
posição da fila automaticamente (`useReviewQueue`, no próprio componente de
página) e mostra "Arquivo X de N".

### Revisão e confirmação

Tela de revisão (`/financas/revisao/[importId]`) por linha: categoria,
natureza, descrição editável (original sempre preservada à parte), ignorar,
ações em lote (categoria/natureza/ignorar para os selecionados). **Edição
em andamento nunca é sobrescrita por um refetch reativo**: cada linha
(`components/finance/finance-review-row.tsx`) mantém rascunho local
separado do valor persistido, ajustado durante a renderização (padrão
documentado do React para "resetar estado quando uma prop muda", não em
`useEffect` — evita a cascata de `setState` num efeito) — só sincroniza com
o valor vindo da Query quando não há edição/salvamento em andamento. O
mesmo princípio se aplica ao formulário mensal
(`components/finance/finance-monthly-form.tsx`).

**Confirmação transacional e idempotente**: `confirm_finance_import(uuid)`
é uma função Postgres `security invoker` (não `definer` — todas as tabelas
tocadas já têm RLS via `is_workspace_member` e o chamador é sempre
`authenticated`), `search_path` fixo, `execute` revogado de `public`/`anon`
e concedido só a `authenticated` (mesma lição de
`20260722150000_workspace_function_grants.sql`: funções nascem com EXECUTE
implícito para PUBLIC). `select ... for update` na linha do import serializa
confirmações concorrentes — duplo clique ou retry de rede encontram
`status = 'confirmed'` e recebem o resultado existente sem inserir nada de
novo. `insert ... on conflict (workspace_id, source_id, fitid) do nothing`
evita duplicar transação quando um OFX se sobrepõe a uma importação já
confirmada. Chamada pelo cliente via `supabase.rpc('confirm_finance_import',
...)` (mesmo padrão de `auth.provider.tsx`), sem uma rota Next.js
intermediária — a atomicidade já vive inteira na função.

### Análises (`domain/analytics.ts`)

Toda a aritmética do módulo mora aqui — renda total, gastos confirmados,
resultado do mês, total financeiro, percentual por categoria, comparação
com o mês anterior. Só transações **confirmadas** entram nos cálculos.
Textos determinísticos em pt-BR (ex.: "Mercado representou 23% dos gastos
confirmados deste mês"), sem juízo de valor; ausência de dado suficiente
produz uma limitação explícita, nunca uma comparação vazia apresentada como
completa. Gráfico de categoria e evolução mensal são CSS/SVG com rótulo de
texto visível (nome, valor, percentual) sempre ao lado — nunca dependem só
de cor/largura/posição — e têm uma tabela textual equivalente
(`sr-only`) para leitor de tela.

### Caixa separado por pessoa

`finance_monthly_records` guarda `lucasAvailableCashCents` e
`matheusAvailableCashCents` (formulário mensal,
`components/finance/finance-monthly-form.tsx`); o disponível TOTAL
(`availableCashCents`) é sempre calculado como a soma dos dois pelo
repositório (`SupabaseFinanceRepository.upsertMonthlyRecord`), nunca editado
diretamente nem derivado das transações importadas. Total financeiro =
disponível total + guardado (guardado continua conjunto, sem divisão por
pessoa). Transições seguras: um total pré-existente de antes desta divisão
(`availableCashCents > 0` com os dois campos por pessoa ainda em zero) é
sinalizado como "não distribuído" (`MonthOverview.availableCashUnallocated`)
— a UI nunca zera nem atribui esse total a Lucas ou Matheus por suposição:
os campos começam vazios com um aviso, e salvar sem tocá-los mantém o total
intacto no banco (o repositório só toca as colunas de disponível quando o
chamador informa pelo menos um dos dois valores). Renda continua separada
por pessoa como antes; nenhuma transação tem proprietário, e não há
nenhuma análise de "quanto Lucas ou Matheus gastou" em nenhum ponto do
módulo.

### Privacidade do nome do arquivo

O nome original do arquivo NUNCA é persistido, retornado pela rota ou usado
em log/evento — extratos de conta Nubank têm um nome como
`NU_584626107_01JUN2026_30JUN2026.csv`, que carrega um identificador da
conta. `domain/import-naming.ts#buildSafeImportName` deriva um nome seguro
só do perfil detectado e do intervalo de datas já calculado do conteúdo
(nunca do nome enviado pelo usuário): `"Fatura Nubank • 21/05/2026 a
17/06/2026"`, `"Extrato Nubank • 01/06/2026 a 29/06/2026"`, ou um rótulo
genérico equivalente fora dos dois perfis Nubank — esse é o valor gravado em
`finance_imports.file_name`.

### Segurança e privacidade

Nenhuma chamada à OpenAI ou a qualquer serviço externo em nenhum ponto do
módulo — parsing e classificação são 100% locais. Eventos de domínio
(`finance.setup_initialized`, `finance.import_created`,
`finance.import_confirmed`, `finance.transaction_updated`,
`finance.classification_rule_created`, `finance.monthly_values_updated`,
ver `docs/events.md`) carregam só ids/contagens/metadados mínimos — nunca
descrição de transação, valor, saldo, nome original do arquivo ou o arquivo
em si.

### Limitação conhecida

As migrations `20260731120000_finance.sql` e
`20260731130000_finance_batch_import.sql` foram criadas no repositório mas
**não foram aplicadas** no Supabase remoto nesta entrega (nem nenhuma outra
migration pendente citada acima) — ver ordem de aplicação no fim deste
documento. Até serem aplicadas, `/financas` mostra uma orientação distinta
de "migration ainda não aplicada" (detectada por uma heurística segura
sobre a mensagem de erro interna, nunca exibida literalmente), sem afetar
nenhuma outra página do painel. A detecção automática de formato cobre só
os dois perfis Nubank validados por fixture (fatura de cartão e extrato de
conta) — nenhum outro banco (incluindo C6, que só existe como origem
genérica de compatibilidade futura) tem detecção automática declarada sem
uma fixture ou arquivo real validado; um CSV desses formatos ainda cai no
mapeamento manual de colunas. Transações
confirmadas são imutáveis nesta versão — não há edição/estorno de uma
transação já confirmada pela interface (só durante a revisão, antes de
confirmar).

## Evolução planejada

- **Automações externas**: regras centrais vivem no painel (commands/endpoints); ferramentas externas (n8n etc.) apenas chamam essas portas.
- **MCP**: servidor MCP como porta de entrada que chama os mesmos Commands/Queries — nunca o banco direto. Contratos em `platform/mcp/mcp.registry.ts`.
- **Leitura de Gmail**: documentada como fase posterior (scopes e requisitos adicionais).

## Deploy

Vercel, projeto `painelpessoallucas`. `vercel.json` fixa `"framework": "nextjs"` — necessário porque o Framework Preset do projeto ficou como "Other" no primeiro deploy (causa histórica do 404 em produção; ver `docs/AUDIT.md`). Build de produção valida TypeScript e não ignora erros.

### Migrations pendentes de aplicação manual no Supabase remoto

Nesta ordem, quando alguém com acesso ao projeto Supabase for aplicá-las:

1. `20260731120000_finance.sql`
2. `20260731130000_finance_batch_import.sql` (aditiva sobre a anterior — nunca editada)
3. `20260804100000_plan_actions_date_repair.sql` (repara `plan_actions` gravadas antes da correção descrita em "Planos — contrato de datas" abaixo; ver essa seção para o que ela faz e por que é segura/não destrutiva)

## Planos — contrato de datas entre IA, domínio e materialização

Causa raiz de um bug real em produção: `PlanProposalSchema` (fronteira da IA)
aceitava `suggestedStart`/`suggestedDue` como `string` livre (comentário dizia
`YYYY-MM-DD`, mas nada garantia o formato), enquanto `DueRuleSchema` do
domínio exige `^\d{4}-\d{2}-\d{2}$`. Uma resposta da IA com texto como
`"Semana 2, sexta-feira"` em vez de uma data passava pela validação da
proposta, era persistida sem checagem em `plan_actions.due_rule` por
`POST /api/planos/processar`, e só quebrava depois — como um `ZodError` cru
renderizado na página do plano (`actionRowToDomain` valida na leitura; nada
validava na escrita). Havia ainda um segundo problema: `schedule_rule` era
gravado como `{ suggestedStart: ... }`, um formato que `ScheduleRuleSchema`
nunca modelou — o Zod descarta chaves desconhecidas silenciosamente, então
esse dado só desaparecia sem erro.

Correção (`modules/plans/domain/plan.schema.ts`,
`modules/plans/domain/plan-proposal.schema.ts`):

- `PlanDateRuleSchema` (discriminated union `fixed | offset_from_start |
  offset_from_phase`) é o único vocabulário de "quando" no domínio de
  planos — reaproveitado por `DueRuleSchema` (prazo) e pelo novo campo
  `ScheduleRuleSchema.dateRule` (dia do agendamento). Nenhuma segunda
  representação concorrente do mesmo conceito.
- Na fronteira da IA, `ProposedDateRuleSchema` espelha esse formato (mantido
  separado do domínio de propósito, mesmo padrão já usado por
  `ProposedRecurrenceSchema`). `ProposedActionSchema.suggestedDue` agora é
  `ProposedDateRuleSchema.nullable()` — nunca mais texto livre.
  `suggestedStart` foi substituído por `suggestedSchedule: { dateRule,
  localTime }`, separando explicitamente prazo de agendamento.
- `buildPrompt` instrui a IA a nunca calcular uma data de calendário a partir
  de uma referência relativa do documento ("Semana 3", "sexta da segunda
  semana"): usar `offset_from_phase`/`offset_from_start` nesses casos,
  `fixed` só quando o documento cita uma data explícita. Isso faz o próprio
  formato estruturado da OpenAI (JSON Schema com `pattern`/enum) impedir a
  IA de gerar uma data fora do contrato, em vez de depender só do texto do
  prompt.
- `POST /api/planos/processar` valida a proposta uma segunda vez com
  `PlanProposalSchema.safeParse` logo após `structurer.structure(...)`,
  independente da implementação do provider — mesmo um `PlanStructurer`
  (real ou mock de teste) que devolva dado fora do contrato nunca chega a
  `plan_actions`. `due_rule`/`schedule_rule` são gravados 1:1 a partir do
  formato já validado, sem transformação ad-hoc.
- `PlanCommands.saveActions/savePhases/saveRecurrenceRules` (chamados pela
  tela de revisão) agora validam com Zod antes de persistir — a mesma
  assimetria leitura valida/escrita não valida que permitiu o dado inválido
  original.

### Reprocessamento idempotente (o "problema de conexão" investigado)

O relato de "problema de conexão" durante a importação real não era da rede:
`/api/planos/processar` roda inteiramente no servidor (até ~2 min de IA) sem
checar `request.signal` — se o navegador perder a conexão, a aba for
recarregada ou o usuário fechar a página, o servidor continua processando até
o fim e cria o draft normalmente. O problema era a UI (`/planos/processar/
[documentId]`) não ter como saber disso: "Tentar novamente" apenas recarregava
a página e reenviava a mesma requisição do zero, criando um SEGUNDO plano
para o mesmo documento.

Correção: a rota agora é idempotente por `documentId`. Se
`source_documents.processing_status` já é `completed`, devolve o
`execution_plan` existente sem chamar a IA de novo. Se está `processing` há
menos de 3 minutos (mais que o timeout esperado da IA), responde 409 pedindo
para aguardar — o cliente entra em polling automático (a cada 5s, até ~2 min)
em vez de mostrar erro. Se `processing` está "travado" há mais de 3 minutos
(tentativa anterior morta sem atualizar o status), permite reprocessar. Nada
disso depende de estado no cliente — funciona mesmo se a aba foi fechada e
reaberta em outro dispositivo.

### Ações únicas do plano viram items na ativação

`activatePlan` já materializava `recurrence_rules` (rotinas), mas ações não
recorrentes ficavam só em `plan_actions` — nunca apareciam em Hoje/Agenda,
que leem `items`. `modules/plans/application/plan-action-materializer.ts`
(`materializeOneOffActions`, chamado em paralelo com
`activateAndMaterializePlanRules` no callback de ativação em
`repository.provider.tsx`) resolve `due_rule`/`schedule_rule.dateRule` de
cada ação sem `recurrence_rule_id` (fixo, ou relativo ao início do
plano/fase — mesma aritmética de dias local já usada pelo motor de
recorrências) e faz upsert em `items` com `onConflict: 'plan_action_id'` +
`ignoreDuplicates` — chave única (`items_plan_action_idx`, criada pela
migration de reparo). Ativar de novo, recarregar ou reexecutar a automação
nunca duplica.

Mapeamento: prazo (`due_rule`) vira `items.due_at` (23:59 local); agendamento
(`schedule_rule` com `time`) vira `items.scheduled_at` — os dois continuam
distintos, uma ação pode ter só um, os dois, ou nenhum (nesse caso não vira
item ainda). `action_type: 'waiting'` vira `status: 'blocked'` (aparece em
"Aguardando" em Hoje) com o motivo (`waiting_on`) anexado ao conteúdo;
`decision`/`reminder` mapeiam para os `item.type` homônimos; `task`/
`milestone` viram `task`. Rotinas (`action_type: 'routine'`) nunca passam por
aqui — só pela recorrência.

### Experiência de erro segura

`/planos/[planId]` renderizava `error` (a `.message` bruta de uma exceção,
incluindo `ZodError` — uma lista JSON de issues) direto num `<p>`. Corrigido
para usar `DataErrorNotice` (mesmo componente já usado em `/planos/[planId]/
revisar`, Agenda, Hoje): mensagem curta em português, nunca o erro técnico,
com "Tentar novamente".
