# Dossiê Master do Projeto — Painel Pessoal Lucas

> **Status da Auditoria**: Concluída (Read-Only) · **Data**: 2026-07-24/25 · **Repositório**: `c:\Users\USER\Desktop\PROJETOS\PAINEL PESSOAL LUCAS` · **Commit**: `137fc0109f37f3e6d34c04b748dfb94bed8812c0` (idêntico a `origin/main`) · **Ambiente de validação**: Node v24.16.0, npm 11.13.0, Windows 11

Este é o relatório mais completo e detalhado do pacote — a fonte primária para quem precisa de profundidade e citações de arquivo. Para uma leitura mais curta e narrativa, ver `EXECUTIVE_HANDOFF.md`. Classificação de cada afirmação: **Confirmado pelo código** (padrão, salvo indicação contrária) · **Confirmado por execução** (rodei o comando) · **Confirmado pela produção** · **Inferência** · **Não foi possível verificar**.

---

## 1. Estado do repositório e produção

- Diretório: `c:\Users\USER\Desktop\PROJETOS\PAINEL PESSOAL LUCAS`. Remoto: `https://github.com/Suertesoy/painelpessoallucas`. Branch: `main`. `git status`: limpo (só `docs/project-dossier/` untracked, criado por esta auditoria e por uma auditoria estratégica anterior já presente em `strategic-audit/`, fora do escopo deste dossiê). **Confirmado por execução.**
- HEAD = `origin/main` = `137fc0109f37f3e6d34c04b748dfb94bed8812c0`. Últimos commits (mais recente primeiro): `137fc01` proveniência/auditoria de áudio no detalhe do item, `006952a` captura por áudio na Captura Rápida, `ec81e94` confirmação de evento no Calendar, `820fa77` revisão/aprovação por ação, `4200744` triagem estruturada por IA, `dd8a3ee` gravação e transcrição, `f6a043c` domínio reconhece origem "captura por áudio", `21db473` schema mínimo de áudio, `7131032` chore, `78946e9` detalhe/edição de item, `c498faa`/`624b258`/`3d1be73` correções pós-migração para nuvem, `a3643a5`/`bdcf223` relatório e docs da Fase 2.
- Versões (via `package-lock.json` e ambiente local, **confirmado por execução**): Node v24.16.0, npm 11.13.0, Next.js 16.2.10, React/React-DOM 19.2.4, TypeScript 5.9.3, Zod 4.4.3, Tailwind CSS 4.3.3, `@supabase/supabase-js` 2.110.7, `@supabase/ssr` 0.12.3, `openai` 6.47.0, Vitest 4.1.10, ESLint 9.39.5, date-fns 4.4.0, lucide-react 1.24.0.
- Scripts (`package.json`): `dev` (next dev), `build` (next build), `start`, `lint` (eslint .), `typecheck` (tsc --noEmit), `test` (vitest run). Não existe script de teste E2E/integração.
- **Resultados de validação, todos confirmados por execução nesta auditoria**:
  | Comando | Resultado | Detalhe |
  |---|---|---|
  | `npm run lint` | PASS | "ESLint: No issues found" |
  | `npm run typecheck` | PASS | `tsc --noEmit` sem saída |
  | `npm run test` | PASS | 31 arquivos, 216 testes, ~10.7s, sem chamadas de rede reais |
  | `npm run build` | PASS | Turbopack, 32 rotas (17 estáticas ○, 15 dinâmicas ƒ) + Proxy |
- Vercel: `vercel.json` define `"framework": "nextjs"` (fix histórico — sem isso a plataforma publicava só `public/`, causando 404 geral; ver `docs/AUDIT.md`) e um cron (`0 * * * *` → `/api/cron/automation-tick`). **Não foi possível verificar** nesta auditoria: projeto/domínio/deployment real na Vercel, commit publicado, execução real do cron (sem acesso ao dashboard Vercel ou a `automation_runs` de um ambiente real).

## 2. Definição do produto

Central operacional pessoal de um único usuário. Princípio: "capturar primeiro, organizar depois" — ver `docs/PRODUCT_DIRECTION.md`. Papéis das áreas principais, tal como implementadas (não aspiracionais):
- **Hoje** (`/hoje`): cockpit — responde "o que faço agora". Foco do dia (máx. 3), próximas ações, capacidade + Calendar, agendado, atividades de plano, aguardando, atenção necessária, pulso dos projetos.
- **Caixa de Entrada** (`/entrada`): inbox universal onde toda captura pousa antes de ser organizada.
- **Projetos** (`/projetos`): objetivos de médio/longo prazo, cada um agregando tarefas/decisões/ideias/referências.
- **Ideias e Insights** (`/ideias`): base de conhecimento e banco de decisões.
- **Agenda** (`/agenda`): separa explicitamente *agendamento* (`scheduledAt`) de *prazo* (`dueAt`) — dois conceitos de domínio distintos, não confundidos no schema nem na UI.
- **Planos** (`/planos/*`): documentos longos viram planos estruturados por IA, revisados e aprovados por humano, materializados em recorrências.
- **Revisão** (`/revisao`): higiene determinística do sistema, sem IA.
- **Configurações** (`/configuracoes`): conta, integrações, preferências de digest, diagnósticos temporários.
- **IA**: só copiloto — nunca cria/edita/conclui/agenda nada sozinha; sempre propõe, humano aprova.
- **Google Calendar**: calendário próprio "Painel Lucas"; agenda principal só como disponibilidade (freebusy).
- **Gmail**: só envio de resumos, opt-in.
- **Automações**: cron horário, idempotente, sem intervenção do usuário.

Diferenciação exigida pela tarefa: **produto atualmente utilizável** = todas as telas de navegação principal listadas acima. **Experimental/dependente de homologação real** = as 3 operações de IA, Calendar, Gmail, cron (código completo, mocks nos testes, sem prova de execução real nesta auditoria). **Instrumentação temporária** = `SyncDiagnosticsCard`, `DataFlowDiagnosticsCard`, `/api/debug/sync-status`. **Em desenvolvimento**: nenhuma feature encontrada em estado visivelmente incompleto no código de produção. **Apenas prevista**: outbox transacional, MCP real, leitura de Gmail, busca semântica (todas nas fases 5-7 do roadmap, sem código).

## 3. Mapa completo de rotas

Ver tabela completa com auth/tipo/objetivo/dados/estados em `SCREEN_COPY_AND_FLOW_INVENTORY.md` e o inventário técnico de cada `route.ts` (payload, resposta, chamador de UI) em `TECHNICAL_ARCHITECTURE_AND_DATA_FLOWS.md`. Resumo:

**Páginas (17)**: `/`, `/login`, `/hoje`, `/entrada`, `/projetos`, `/projetos/[projectId]`, `/ideias`, `/agenda`, `/planos`, `/planos/novo`, `/planos/processar/[documentId]`, `/planos/[planId]`, `/planos/[planId]/revisar`, `/revisao`, `/configuracoes`, `/migracao`, `/auth/callback` (route handler, não página).

**Route handlers de API (15)**: `/api/health` (pública), `/api/cron/automation-tick` (GET/POST, `CRON_SECRET`), `/api/debug/sync-status` (temporário), `/api/ai/triage-capture`, `/api/audio/transcribe`, `/api/audio/confirm-calendar-event`, `/api/integrations/calendar/{sync-item,sync-plan,today}`, `/api/integrations/gmail/send-digest`, `/api/integrations/google/{callback,connect,disconnect,status}`, `/api/planos/processar`, `/api/settings/digest` (GET/PUT).

**Rotas sem chamador de UI identificado**: `POST /api/integrations/calendar/sync-item` e `POST /api/integrations/calendar/sync-plan` — funcionais, protegidas por sessão, mas nenhuma busca por `fetch(...)` no código do cliente encontrou uso. **Inferência**: resquício de UI removida ou preparação para tela futura.

**Rotas de diagnóstico temporário**: `/api/debug/sync-status`, consumida só por `SyncDiagnosticsCard`, ambas marcadas para remoção no próprio código-fonte.

**Rota de saúde**: `/api/health`, sem chamador de UI identificado (provável monitoramento externo — **inferência**, não confirmado).

**Links quebrados**: nenhum encontrado — toda navegação (`<Link href>` e `router.push`) aponta para uma rota existente.

**Proxy** (`src/proxy.ts`, sucessor do middleware no Next 16): rotas públicas = `/login`, `/auth`, `/api/cron`, `/api/health` (prefixo, não path exato). Fail-open (não bloqueia nada) se `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` ausentes — pensado para build local sem env. Usa `supabase.auth.getUser()` (valida no servidor), não `getSession()`. Sem sessão em rota protegida → redirect para `/login?next=<path>`. Com sessão em `/login` → redirect para `/hoje`. `AppShell` e `RepositoryProvider` reimplementam suas próprias listas de "rotas públicas" no cliente (`PUBLIC_PREFIXES`), independentes do proxy — podem divergir se uma mudar sem a outra.

## 4. Inventário de telas e componentes

Cobertura completa (layout, estados, ações, responsividade) em `SCREEN_COPY_AND_FLOW_INVENTORY.md`. Componentes reutilizáveis principais: `AppShell` (casca), `SidebarNav` (navegação desktop/mobile/FAB), `QuickCaptureModal` (captura texto+áudio), `AudioRecorder`, `AudioCaptureReview`, `ItemDetailModal`, `GlobalSearchModal`, `ItemCompleteButton`, `DataErrorNotice`, `MigrationBanner`, `TodayCalendarCard`, `GoogleIntegrationCard`, `DigestSettingsCard`, e os dois cards temporários de diagnóstico. **Achado estrutural**: não existe componente `<Modal>` nem `<Card>` compartilhado — cada tela/modal reimplementa a mesma string de classes Tailwind manualmente (detalhado em `DESIGN_SYSTEM_AND_VISUAL_AUDIT.md`).

## 5. Inventário de textos

Inventário completo por tela, com arquivo/linha, em `SCREEN_COPY_AND_FLOW_INVENTORY.md`. Achados-chave: idioma único pt-BR; pelo menos 3 vocabulários diferentes para "prazo" (Prazo / Data Limite / Due Date, em telas diferentes); pelo menos 3 formas de rotular a origem de um item conforme a tela (`itemSourceLabel()`, lógica local em Hoje, `resolveItemOrigin()`); confirmação de arquivar usa `window.confirm()` nativo em algumas telas e painel customizado de dois cliques em `/migracao`; mensagens de sucesso de salvamento variam ("Salvo.", "Alterações salvas.", "Preferências salvas.", "Item capturado com sucesso!"); pontos confirmados de texto técnico vazando ao usuário (status HTTP cru, categorias de erro em snake_case nos diagnósticos temporários, fragmento de UUID exibido como identificador de lote de migração, valor bruto do parâmetro `integracao_erro`).

## 6. Design visual

Cobertura completa em `DESIGN_SYSTEM_AND_VISUAL_AUDIT.md`. Resumo: Tailwind 4 sem `@theme` customizado (paleta padrão); 2 variáveis CSS próprias (`--background`, `--foreground`); fonte única Inter; sem dark mode (reservado em comentário no `globals.css`); padrão de card mais repetido `bg-white rounded-xl shadow-sm border p-4 md:p-6`, nunca extraído em componente; dois `border-radius` concorrentes para "card"; duas escalas de badge; três larguras de container concorrentes; um componente de erro compartilhado convivendo com ≥6 implementações manuais; foco de teclado inconsistente entre campos "formais" e "inline editáveis"; área de toque abaixo de 44px disseminada em botões só-ícone (exceto `ItemCompleteButton`, já corrigido).

## 7. Arquitetura técnica

Cobertura completa com 14 diagramas Mermaid (arquitetura geral, leitura, escrita, autenticação/workspace, captura texto, captura áudio, triagem IA, confirmação de ações, criação de evento Calendar, importação de planos, recorrências, cron, Gmail/digest, migração) em `TECHNICAL_ARCHITECTURE_AND_DATA_FLOWS.md`. Camadas: `src/app` (rotas) → `src/modules/*/{domain,application,infrastructure}` (Commands/Queries/Repositories por módulo: items, projects, planning, plans) → `src/platform/{storage,events,ai,integrations,automation,supabase}` (infraestrutura compartilhada) → `src/providers` (composition root via Context). Desvios da arquitetura pretendida: localStorage é código morto em runtime (só testes); 3 emissões de evento pulam `EventRepository`; 3 contratos de plataforma (`ai.provider.ts`, `mcp.registry.ts`, `integration.adapter.ts`) nunca implementados; `src/modules/review/{application,ui}` são diretórios vazios (a lógica real vive em `items/application/item.queries.ts::getReviewOverview`); `src/types/`, `src/platform/{outbox,workflows}/` vazios.

## 8. Modelos de domínio

Entidades com Zod formal: `Item` (7 tipos, 7 status, 4 prioridades, 8 fontes incluindo `audio_capture`), `Project`, `DailyPlan` (foco máx. 3), `DomainEvent`, `SourceDocument`, `ExecutionPlan` (7 status), `PlanPhase`, `PlanAction`, `RecurrenceRule` (7 frequências), `Notification`, mais os schemas de proposta de IA não persistidos diretamente (`PlanProposalSchema`, `AudioTriageProposalSchema`, gravados como JSON em `ai_runs.response_metadata`). Sem Zod formal: `Workspace`, `WorkspaceMember`, `WorkspaceSettings`, `IntegrationAccount`, `IntegrationToken`, `CalendarEventLink`, `AiRun`, `AutomationRun`, `Reminder` — manipuladas como objetos snake_case soltos. Divergências confirmadas entre schema/SQL/mapper (nenhuma inventada): `items.calendar_sync` e `execution_plans.calendar_sync_scope` existem no banco mas fora do `ItemSchema`/`ExecutionPlanSchema` e dos repositórios canônicos — só lidos/escritos pelas rotas de sincronização de Calendar. `items.deleted_at`/`created_by` e equivalentes em outras tabelas existem no SQL mas não no domínio (soft-delete interno, não deveria vazar mesmo). Nas entidades auditadas campo a campo (Item, ExecutionPlan/PlanAction, RecurrenceRule, IntegrationToken), **RecurrenceRule não teve nenhuma divergência de nome/tipo** — é a correspondência mais literal do sistema.

## 9. Supabase e banco de dados

22 tabelas, RLS ativa em todas. Ver inventário completo (colunas, PK/FK, índices, triggers, policies, grants) em `TECHNICAL_ARCHITECTURE_AND_DATA_FLOWS.md` seção 4. Funções: `set_updated_at` (trigger, não SECURITY DEFINER), `is_workspace_member` (RLS helper, SECURITY DEFINER, evita recursão), `handle_new_user` (bootstrap no `auth.users`, SECURITY DEFINER), `ensure_personal_workspace` (RPC idempotente, SECURITY DEFINER, `EXECUTE` restrito a `authenticated` desde a migration de correção). Duas migrations corretivas relevantes: `api_role_grants` (GRANTs de tabela que faltavam — sem eles o Postgres nega antes mesmo de avaliar RLS) e `workspace_function_grants` (revoga `EXECUTE` de `PUBLIC`, que ainda deixava `ensure_personal_workspace` tecnicamente chamável por `anon` por herança). Únicas tabelas sem acesso de cliente: `integration_tokens` (zero policy `authenticated`, só `service_role`). Idempotência garantida por unique constraint em pelo menos 6 pontos: `items(recurrence_rule_id, occurrence_at)`, `automation_runs(workspace_id, automation_type, idempotency_key)`, `calendar_event_links(item_id)` e `(google_calendar_id, google_event_id)`, `item_relations(from,to,type)`, `workspace_members(workspace_id,user_id)`, `daily_plans(workspace_id,date)`.

## 10. Autenticação, sessão e workspace

Login: Supabase Auth + Google OAuth (`openid email profile` apenas — integrações são autorização separada). `/auth/callback` troca `code` por sessão (`exchangeCodeForSession`), com proteção contra open-redirect no parâmetro `next` (deve começar com `/`, não `//`). Sessão chega ao servidor via cookies `@supabase/ssr`, renovados pelo proxy a cada requisição via `getUser()`. Workspace resolvido por `useAuth()`/`useWorkspace()` no cliente, que chama o RPC idempotente `ensure_personal_workspace()`. Clientes Supabase distintos: browser (`browser-client.ts`), server (`server-client.ts`, Server Components/Route Handlers), admin (`admin-client.ts`, `server-only`, `SUPABASE_SECRET_KEY`, bypassa RLS — usado só pelo cron e pelas integrações). RLS usa `auth.uid()` via `is_workspace_member`. Diagnóstico temporário existente: `sessionStorage` guarda só o nome do último evento de auth (não sensível), consumido pelo card `SyncDiagnosticsCard`.

## 11. OpenAI e Inteligência Artificial

Três operações reais, detalhadas com prompt (sanitizado), timeout, retry e auditoria em `TECHNICAL_ARCHITECTURE_AND_DATA_FLOWS.md` e no `PROJECT_INVENTORY.json` (`aiOperations`). Resumo: `plan_import` (estruturação de plano, `gpt-4.1-mini` default, grava draft inativo direto no banco antes de aprovação humana), `audio_transcription` (Whisper, `whisper-1` default, **não audita em `ai_runs`** — lacuna confirmada), `audio_capture_triage` (triagem de voz, `gpt-4.1-mini` default, nunca aplica ação sozinha). Duplicação de código confirmada entre `openai-plan-structurer.ts` e `openai-audio-triage-structurer.ts` (mesmo padrão de client/timeout/retry/structured output, reconhecido em comentário no próprio segundo arquivo). Acoplamento cruzado: `estimateCostUsd`/`PRICES_PER_MTOKEN` vivem no módulo de planos mas são importados por uma rota de áudio. Ambos os prompts têm proteção textual explícita contra prompt injection. `AIProvider` genérico (`ai.provider.ts`) não é usado por nenhuma das 3 operações reais.

## 12. Captura por áudio

Fluxo completo (permissão, MediaRecorder, MIME types por navegador, pausa/retomada/cancelamento, preview, upload, transcrição, triagem, revisão, Calendar, proveniência) detalhado em `TECHNICAL_ARCHITECTURE_AND_DATA_FLOWS.md` (Diagramas 6-9) e no `PROJECT_INVENTORY.json`. Ponto crítico verificado com certeza: **o texto transcrito NÃO é editável antes de ser salvo como item, nem dentro da tela de revisão da triagem** (é renderizado em `<div>` estático) — é editável **depois**, como conteúdo normal de qualquer item, no `ItemDetailModal`, que preserva a transcrição original separadamente para auditoria mesmo se o conteúdo for editado. Limite de gravação: 300s (5 min) no cliente; limite de upload: 25 MB no servidor (limite da própria API OpenAI). Falha de transcrição preserva o Blob em memória para nova tentativa sem regravar, mas o áudio se perde se o modal for fechado antes disso — não há persistência do Blob fora da sessão do componente.

## 13. Google Calendar

Scopes confirmados no código (não só na doc): `calendar.app.created` + `calendar.freebusy`. Agenda principal do usuário: **só freebusy, sem títulos** — tecnicamente garantido pelo próprio scope concedido, não apenas por convenção do código. Participantes: **nunca recebem convite automático** (payload de evento nunca inclui `attendees`). Eventos: criados só após ação explícita (aprovação na revisão de áudio, ou escolha explícita de modo de sync por item — não há uma etapa extra de "revisar o evento" nesse segundo caminho, mas a escolha do modo já é a aprovação humana). Anti-loop via `extendedProperties.private.painelItemId`; nenhuma importação inversa Calendar→item foi encontrada (o anti-loop protege contra a app duplicar seus próprios eventos, não contra importar eventos externos, que não existe no código).

## 14. Gmail

Scope único `gmail.send`. **Nenhuma leitura de e-mail** confirmada por busca exaustiva no código. **Nenhum envio sem ativação explícita** — `sendDigest` só envia se `manual===true` (teste) ou a preferência correspondente estiver `true` em `workspace_settings` (default `false` em todas). Templates em texto puro (sem HTML), 4 tipos: diário, semanal, alerta crítico, falha de automação. Destinatário configurável com fallback para o e-mail da conta Google conectada.

## 15. Planos e recorrências

Fluxo: criar documento (colado ou `.md`/`.txt`, até 500KB/120k caracteres) → hash SHA-256 salvo (documento nunca se perde mesmo se a IA falhar) → processar com IA → proposta com fatos/hipóteses/sugestões/perguntas diferenciados visualmente → revisar/editar → aprovar → ativar → recorrências materializam ocorrências como itens. Motor de recorrências (`recurrence-engine.ts`) é puro/determinístico: daily/weekly/monthly/once + 3 variantes relativas (ao início do plano, da fase, de evento), com `interval`, `days_of_week`, `day_of_month` (clamped em meses curtos), `local_time`, timezone via `Intl` (America/Sao_Paulo), `end_at`/`max_occurrences`. Materialização idempotente via constraint única `(recurrence_rule_id, occurrence_at)`, horizonte de 7 dias na ativação e a cada tick do cron.

## 16. Automações e cron

`vercel.json`: `0 * * * *` → `/api/cron/automation-tick`. Auth por `CRON_SECRET` (Bearer), não sessão de usuário. Idempotência via `automation_runs` (constraint única no banco, não memória da função); execuções `running` travadas há >15min são retomadas; até 3 tentativas por job, sem backoff exponencial (o espaçamento é o próprio intervalo horário do cron). **Classificação obrigatória**: implementado e testado com mocks, mas **não foi possível verificar execução real em produção** nesta auditoria (sem acesso a logs Vercel ou a `automation_runs` real) — "implementado, mas não homologado".

## 17. Fluxos completos do usuário (passo a passo)

**Capturar por texto**: abrir modal (atalho/botão/FAB) → aba Texto → preencher conteúdo (obrigatório) + opcionais → Salvar → `createItem` valida com Zod, persiste, emite `item.created` → feedback "Item capturado com sucesso!" → modal fecha em 800ms. Erros possíveis: conteúdo vazio (validação client-side). Dados criados: 1 `Item` (`status: inbox`). Sem integrações acionadas.

**Capturar por áudio**: abrir modal → aba Áudio (aviso de privacidade fixo) → permitir microfone → gravar (até 5 min, pausa/retoma) → ouvir preview → enviar → `POST /api/audio/transcribe` → texto volta → item já é criado na Entrada com `source: audio_capture` **antes** de qualquer análise → opcionalmente "Analisar com IA" → `POST /api/ai/triage-capture` → proposta aparece em `AudioCaptureReview` → usuário marca/edita ações → "Confirmar ações selecionadas" aplica em lote (`createItem`/`updateItem` por ação aprovada) → opcionalmente "Criar evento no Calendar" → `POST /api/audio/confirm-calendar-event`. Pontos de abandono possíveis: fechar antes de enviar (perde o áudio gravado), fechar a revisão sem aprovar nenhuma ação (a captura de texto já está salva, só as ações extras se perdem).

**Processar item na Entrada**: buscar/filtrar → editar campos inline (`onBlur`) → "Organizar" (`status: organized`) ou "Arquivar" (`window.confirm` + `archiveItem`) ou agendar (date input) ou concluir (se `type: task`).

**Definir foco do dia**: em `/hoje`, "Adicionar ao Foco" → seleciona item → `setDailyFocus` valida máx. 3 no Zod → se ultrapassar capacidade do dia, aviso com opção "Manter mesmo assim"/"Cancelar".

**Criar/aprovar/ativar plano**: `/planos/novo` → colar/importar documento → `createSourceDocument` → redirect para `/planos/processar/[id]` → dispara `POST /api/planos/processar` (até ~2 min) → grava `execution_plans(status: draft)` + fases/ações/recorrências inativas → redirect para `/planos/[id]/revisar` → editar proposta → "Aprovar plano" → `approvePlan` → volta para `/planos/[id]` → "Ativar plano" → `activatePlan` → recorrências passam a `is_active: true` e materializam.

**Revisão semanal**: `/revisao` → 4 categorias de problema (prazos estourados, bloqueados, inbox >30d, projetos sem marco) → ação de correção por linha (redefinir prazo, desbloquear, organizar, link para definir marco).

**Conectar/desconectar Google**: `/configuracoes` → "Conectar" → `GET /api/integrations/google/connect?service=` → redirect Google → `GET /api/integrations/google/callback` → tokens criptografados salvos → volta para Configurações com `?integracao_ok=`.

**Migrar dados locais**: banner em qualquer tela (exceto `/migracao`) → prévia de contagens → baixar backup JSON → "Iniciar migração" → `migrateLocalData` (ordem: projetos → itens → planos diários → eventos, por causa de FKs) → tabela Local vs. Nuvem → opcionalmente limpar dados locais (confirmação em duas etapas).

Nenhum destes fluxos foi observado em execução real (sem sessão autenticada disponível nesta auditoria) — descritos por leitura de código.

## 18. Experiência mobile

Breakpoint único relevante: `md:` (768px). Sidebar de 256px vira barra fixa + drawer + FAB abaixo de 768px. Único modal com comportamento adaptativo mobile→desktop real: `ItemDetailModal` (tela cheia → dialog). `QuickCaptureModal`/`GlobalSearchModal` permanecem modal com padding mesmo em telas pequenas. **Não foi possível verificar** visualmente em dispositivo real ou emulador (auth necessária, não disponível). Achados por leitura de código: campos de filtro em telas de lista usam `flex-wrap` em vez de grid por breakpoint (padrão diferente do resto do app); botões só-ícone com área de toque provavelmente abaixo de 44px fora do `ItemCompleteButton`.

## 19. Acessibilidade

Confirmado pelo código: `role="dialog"`/`aria-modal="true"` nos 3 modais principais (drawer mobile tem `role="dialog"` mas sem `aria-modal`); `aria-current="page"` no item de navegação ativo; `aria-label` consistente em botões de ícone da navegação; `htmlFor`/`id` pareados em filtros de Entrada; restauração de foco ao fechar modais; fechamento por `Escape` nos 3 modais principais. Não verificado nesta auditoria (exige execução real): navegação por teclado ponta a ponta, comportamento de screen reader, contraste medido, `prefers-reduced-motion`. Achado confirmado de risco: foco de teclado (`focus:ring`) ausente em campos "inline editáveis", presente só em formulários "formais".

## 20. Performance e fluidez

Não medido com ferramentas reais (Lighthouse/DevTools não disponíveis nesta auditoria sem sessão). Por leitura estática: cada seção de `/hoje` trata seu próprio loading/erro independentemente (comentário explícito no código: "um bloco quebrado não pode esconder ou substituir os demais") — bom para resiliência, mas potencialmente mais requisições paralelas do que uma query agregada única. `useReactiveQuery` assina só `items`/`projects`/`dailyPlan`; mudanças em planos/documentos/proveniência não notificam automaticamente esse hook (exigem `refetch()` manual ou outro mecanismo). Rate limit de IA em memória por instância — não distribuído, reinicia em cold start ou múltiplas instâncias.

## 21. Testes e qualidade

31 arquivos, 216 testes, 100% passando, ambiente Vitest (node/happy-dom conforme o teste). Categorias: domínio/commands/lifecycle (5), repositories Supabase/mappers (3), queries auxiliares/diagnóstico (3), datas (1), componentes RTL (9, incluindo áudio), IA plano+áudio (6), automação/google/digest/migração (4). **Nenhum teste chama rede real** — Supabase é mockado inline ou via fábricas injetáveis; OpenAI e Google idem. **Sem E2E, sem teste em navegador real, sem teste específico Safari/iOS.** Diferenciação exigida: testado com mock (todos os 216); testado localmente = não aplicável (sem banco local); testado contra Supabase real = não encontrado; testado em produção = não verificável nesta auditoria; homologado manualmente = não verificável nesta auditoria.

## 22. Tratamento de erros e observabilidade

`DataErrorNotice` é o componente compartilhado (9 usos), com mensagens deliberadamente genéricas por design (nunca expõe a string bruta do Supabase — comentário explícito no código). Convive com implementações manuais de erro em ≥6 telas. Pontos confirmados de informação técnica exposta ao usuário: status HTTP cru (`planos/processar/[documentId]`), categorias de erro snake_case (`SyncDiagnosticsCard`/`DataFlowDiagnosticsCard`, ambas rotuladas "temporário" na própria tela), fragmento de UUID em `/migracao`, parâmetro de erro OAuth ecoado sem tradução em `/configuracoes`. Nenhuma stack trace/nome de exceção JS crua foi encontrada renderizada diretamente.

## 23. Segurança e privacidade

Separação cliente/servidor: nenhuma chave sensível com prefixo `NEXT_PUBLIC_` além de URL/chave publicável do Supabase. `admin-client.ts` é `server-only`. RLS ativa em todas as 22 tabelas; `integration_tokens` sem policy de cliente. Tokens Google criptografados AES-256-GCM (`token-crypto.ts`), chave via `GOOGLE_TOKEN_ENCRYPTION_KEY` (32 bytes). OAuth state em cookie httpOnly com expiração de 10 min. `CRON_SECRET` comparado por igualdade estrita, nunca logado. `workspace_id` nunca aceito do cliente — sempre resolvido da sessão no servidor + reforçado por RLS. Idempotência em pontos críticos (recorrências, automation_runs, calendar_event_links). Soft-delete em `projects`/`items`/`source_documents`/`execution_plans`; delete físico nas demais.

## 24. Dívida técnica e inconsistências (catálogo)

Ver lista priorizada e classificada por impacto/probabilidade em `RISKS_DEBT_AND_OPEN_QUESTIONS.md`. Itens confirmados sem necessidade de re-verificação: constante legada não usada (`LEGACY_LOCAL_WORKSPACE_ID`); 4 repositórios localStorage + adapter usados só em teste; 3 contratos de plataforma nunca implementados; 5 diretórios de scaffold vazios; 3 emissões de evento que pulam `EventRepository`; duplicação estrutural entre dois "structurer" de IA; ausência de Zod formal em 9 entidades de infraestrutura; `AGENTS.md` desatualizado num ponto (constante `WORKSPACE_ID`); 2 componentes + 1 rota marcados "temporário" pelo próprio código.

## 25. Inventário de portas de evolução já existentes

Sem propor nada novo: MCP (contrato pronto, zero implementação — Fase 6 do roadmap); leitura de Gmail (scopes/requisitos documentados como fase posterior nos comentários do próprio código); webhooks genéricos (`integration.adapter.ts`, contrato pronto); mais operações de IA (padrão replicável, ainda que duplicado hoje); `reminders`/`notifications` (tabelas prontas, sem Zod nem tela de gestão dedicada); outbox transacional (mencionada, zero código). Classificação: "pronto para usar" = nenhum destes hoje; "exige pequena extensão" = mais operações de IA seguindo o padrão existente; "exige novo módulo" = outbox, gestão de reminders; "exige nova integração" = leitura de Gmail, GitHub/Vercel (mencionados como futuros em `docs/integrations.md`); "exige mudança estrutural" = MCP real (novo processo/servidor).

## 26. Capturas de tela

**Realizado**: 2 capturas da tela pública `/login` em produção (`https://painelpessoallucas.vercel.app/login`), via scraping autorizado (não é bypass de autenticação — é a única rota pública do app), salvas em `docs/project-dossier/screenshots/`: `login-desktop-1440x1000.png` e `login-mobile-390x844.png`. **Confirmado pela produção.**

**Não realizado, com limitação explícita**: todas as demais telas exigem sessão autenticada (Google OAuth real). Esta auditoria não tentou contornar autenticação, conforme instrução explícita da tarefa. Nenhuma captura de Hoje, Entrada, Projetos, Ideias, Agenda, Planos, Revisão, Configurações, Migração, modais (captura rápida, áudio, revisão de triagem, detalhe de item) foi feita — a caracterização dessas telas nesta auditoria vem inteiramente de leitura de código-fonte (JSX, classes Tailwind, texto literal), não de observação visual. Isso é dito explicitamente sempre que uma afirmação de layout/visual é feita neste dossiê.

## 27. Validação final desta auditoria

- Nenhum arquivo de código do produto foi alterado (só arquivos dentro de `docs/project-dossier/` foram criados/editados).
- Nenhuma variável de ambiente foi exibida com valor — só nomes, extraídos de `.env.example` e de `process.env.NOME` no código.
- Nenhum segredo foi salvo nos documentos deste dossiê.
- `PROJECT_INVENTORY.json` é JSON válido (verificado por `JSON.parse` nesta auditoria).
- Nenhum comando de escrita foi executado contra Supabase, Vercel, Google ou OpenAI.
