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

## Evolução planejada

- **Automações externas**: regras centrais vivem no painel (commands/endpoints); ferramentas externas (n8n etc.) apenas chamam essas portas.
- **MCP**: servidor MCP como porta de entrada que chama os mesmos Commands/Queries — nunca o banco direto. Contratos em `platform/mcp/mcp.registry.ts`.
- **Leitura de Gmail**: documentada como fase posterior (scopes e requisitos adicionais).

## Deploy

Vercel, projeto `painelpessoallucas`. `vercel.json` fixa `"framework": "nextjs"` — necessário porque o Framework Preset do projeto ficou como "Other" no primeiro deploy (causa histórica do 404 em produção; ver `docs/AUDIT.md`). Build de produção valida TypeScript e não ignora erros.
