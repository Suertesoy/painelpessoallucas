# Arquitetura Técnica e Fluxos de Dados — Painel Pessoal Lucas

Este documento apresenta a especificação técnica detalhada da arquitetura do **Painel Pessoal Lucas**, cobrindo o modelo de dados PostgreSQL (Supabase), estratégias de autenticação, padrões de código, comandos, consultas, integrações e os **14 fluxos de dados obrigatórios** ilustrados com diagramas Mermaid.

---

## 1. Visão Geral da Arquitetura

O sistema é construído como uma aplicação monolítica modular sob o framework **Next.js 16 (App Router)** em TypeScript estrito, utilizando os conceitos de **Clean Architecture** e **Domain-Driven Design (DDD)**.

### Camadas da Aplicação
1. **Apresentação (UI & Route Handlers)**: Server e Client Components React 19, formulários controlados, modais globais e handlers de API sob `src/app/api/`.
2. **Aplicação (Commands & Queries)**: Casos de uso desacoplados por módulo (`src/modules/*/{application, domain}`). Os Commands realizam validações Zod, persistem dados nos repositórios e emitem `DomainEvent`s. As Queries agregam dados para consumo na UI.
3. **Domínio**: Entities, Enums, Schemas Zod e regras de negócio puras (ex: motor de recorrências `recurrence-engine.ts`).
4. **Infraestrutura & Plataforma**: Clientes Supabase (Browser, Server, Admin), OAuth Google, criptografia AES-256-GCM, SDK da OpenAI, adaptadores de e-mail e executores de automação idempotentes.

---

## 2. Modelo de Banco de Dados e Segurança (PostgreSQL / Supabase)

O banco de dados PostgreSQL é composto por **22 tabelas**, todas protegidas por **Row Level Security (RLS)** com isolamento por `workspace_id`.

### Estrutura de Tabelas e Relacionamentos

```
[workspaces] ──< [workspace_members] >── [profiles] (1:1 auth.users)
     │
     ├──< [projects]
     ├──< [items] ──< [item_relations]
     │       │
     │       ├──< [calendar_event_links]
     │       └──< [reminders]
     │
     ├──< [daily_plans] ──< [daily_plan_items]
     ├──< [source_documents]
     ├──< [execution_plans] ──< [plan_phases]
     │       │                └──< [plan_actions]
     │       └──< [recurrence_rules]
     │
     ├──< [domain_events]
     ├──< [ai_runs]
     ├──< [automation_runs]
     ├──< [integration_accounts] ──1:1── [integration_tokens] (Sem RLS p/ client)
     └──< [workspace_settings]
```

### Funções Helper SQL e Triggers
- `public.set_updated_at()`: Trigger function para atualização automática do campo `updated_at`.
- `public.is_workspace_member(ws_id uuid)`: Função `SECURITY DEFINER` (para evitar recursão RLS) que verifica se o usuário autenticado (`auth.uid()`) pertence ao workspace.
- `public.handle_new_user()`: Trigger function em `auth.users` que instancia o `profile` e o workspace "Pessoal" padrão com papel `owner`.
- `public.ensure_personal_workspace()`: RPC `SECURITY DEFINER` estritamente concedida à role `authenticated` (conforme migration `20260722150000_workspace_function_grants.sql`) que garante o provisionamento idempotente do workspace do usuário.

---

## 3. Diagramas Mermaid de Fluxo de Dados (14 Fluxos Factuais)

### Diagrama 1: Arquitetura Geral do Sistema
```mermaid
flowchart TD
    subgraph Client["Navegador (Client Components)"]
        UI["Interface React / AppShell"]
        Provider["RepositoryProvider / AuthProvider"]
        Hooks["useReactiveQuery / useCommands"]
    end

    subgraph Server["Next.js 16 Server (Node.js)"]
        Proxy["Proxy (src/proxy.ts)"]
        Routes["Route Handlers (/api/*)"]
        Services["Platform Services (AI, Integrations, Cron)"]
    end

    subgraph Storage["Nuvem / Supabase"]
        Auth["Supabase GoTrue Auth"]
        DB[(PostgreSQL DB - 22 Tabelas + RLS)]
        AdminClient["Service Role (Bypassa RLS)"]
    end

    subgraph External["Serviços Externos"]
        OpenAI["OpenAI API (Whisper & gpt-4.1-mini)"]
        Google["Google APIs (Calendar & Gmail)"]
        VercelCron["Vercel Cron Service"]
    end

    UI --> Hooks
    Hooks --> Provider
    Provider --> DB
    Proxy --> Auth
    Routes --> Services
    Services --> OpenAI
    Services --> Google
    VercelCron --> Routes
    Services --> AdminClient
    AdminClient --> DB
```

---

### Diagrama 2: Fluxo de Leitura (`useReactiveQuery`)
```mermaid
sequenceDiagram
    autonumber
    participant UI as Componente React (UI)
    participant Hook as useReactiveQuery Hook
    participant Query as Query Layer (ex: ItemQueries)
    participant Repo as SupabaseItemRepository
    participant DB as Supabase PostgreSQL
    participant Notifier as ChangeNotifier (Pub/Sub)

    UI->>Hook: Monta componente / subscreve
    Hook->>Query: Executa busca síncrona
    Query->>Repo: Chamada ao método de leitura
    Repo->>DB: SELECT com filtro de workspace (RLS)
    DB-->>Repo: Retorna dados (Rows)
    Repo-->>Query: Mapeia Rows -> Domain Objects (rowToItem)
    Query-->>Hook: Retorna resultado { data, isLoading: false }
    Hook-->>UI: Renderiza interface com dados

    Note over UI,Notifier: Atualização reativa (Mutação em outra ação)
    Notifier->>Hook: Dispara notificação de mudança
    Hook->>Query: Re-executa fetch automaticamente
    Query->>DB: Re-consulta dados atualizados
    DB-->>UI: Re-renderiza UI com novos dados
```

---

### Diagrama 3: Fluxo de Escrita (Commands -> Repositories -> Supabase)
```mermaid
sequenceDiagram
    autonumber
    participant UI as Interface do Usuário
    participant Cmd as ItemCommands (Application)
    participant Zod as ItemSchema (Zod Validation)
    participant Repo as SupabaseItemRepository
    participant DB as Supabase PostgreSQL
    participant EventRepo as SupabaseEventRepository
    participant Notifier as ChangeNotifier

    UI->>Cmd: Invoca comando (ex: completeItem)
    Cmd->>Zod: Valida payload de entrada
    Zod-->>Cmd: Payload válido
    Cmd->>Repo: save(item)
    Repo->>DB: UPSERT na tabela items
    DB-->>Repo: Confirmado
    Cmd->>EventRepo: save(DomainEvent 'item.completed')
    EventRepo->>DB: INSERT na tabela domain_events (auditoria)
    Repo->>Notifier: notify()
    Notifier-->>UI: Notifica leituras ativas para refetch
```

---

### Diagrama 4: Autenticação e Resolução de Workspace
```mermaid
flowchart TD
    A["Requisição de Usuário"] --> B{"Possui Cookie de Sessão?"}
    B -- Não --> C["Redireciona para /login"]
    B -- Sim --> D["Proxy (src/proxy.ts) executa getUser()"]
    D --> E{"Sessão Válida no Server?"}
    E -- Não --> C
    E -- Sim --> F["AuthProvider inicia no Cliente"]
    F --> G["Chama RPC ensure_personal_workspace()"]
    G --> H{"Workspace Existe?"}
    H -- Não --> I["Trigger/RPC cria Workspace Pessoal"]
    H -- Sim --> J["Retorna workspace_id"]
    I --> J
    J --> K["RepositoryProvider instancia Repositórios Supabase"]
    K --> L["Aplicação Carregada e Pronta"]
```

---

### Diagrama 5: Captura Rápida por Texto
```mermaid
sequenceDiagram
    autonumber
    participant User as Usuário
    participant Modal as QuickCaptureModal
    participant Cmd as ItemCommands
    participant Repo as SupabaseItemRepository
    participant DB as Supabase DB

    User->>Modal: Pressiona Ctrl+Shift+Espaço / Digita texto
    User->>Modal: Clica em "Salvar"
    Modal->>Cmd: createItem({ content, type, priority, workspaceId })
    Cmd->>Repo: save(newItem)
    Repo->>DB: INSERT INTO public.items
    DB-->>Repo: Sucesso (HTTP 201)
    Modal->>User: Exibe feedback "Item capturado com sucesso!"
    Modal->>Modal: Fecha modal automaticamente após 800ms
```

---

### Diagrama 6: Captura por Áudio (Gravação e Upload)
```mermaid
sequenceDiagram
    autonumber
    participant User as Usuário
    participant Recorder as AudioRecorder Component
    participant Modal as QuickCaptureModal
    participant API as Route Handler /api/audio/transcribe
    participant OpenAI as OpenAI Whisper API

    User->>Recorder: Clica em "Gravar áudio" (getUserMedia)
    Recorder->>Recorder: Grava chunks em memória (webm/opus ou mp4)
    User->>Recorder: Clica em "Parar" / Ouve no player pré-envio
    User->>Recorder: Clica em "Enviar para transcrição"
    Recorder->>Modal: Retorna Blob de áudio
    Modal->>API: POST multipart/form-data (file: Blob)
    API->>API: Valida tamanho (< 25 MB) e tipo MIME
    API->>OpenAI: Transcriptions API (model: 'whisper-1', lang: 'pt')
    OpenAI-->>API: Retorna texto transcrevido ({ transcript })
    API-->>Modal: Retorna HTTP 200 { transcript }
    Note over API: O arquivo de áudio é descartado da memória
    Modal->>Modal: Salva item base na Inbox (source: 'audio_capture')
```

---

### Diagrama 7: Transcrição e Triagem com IA
```mermaid
sequenceDiagram
    autonumber
    participant Modal as QuickCaptureModal
    participant API as Route Handler /api/ai/triage-capture
    participant DB as Supabase DB
    participant Structurer as OpenAIAudioTriageStructurer
    participant OpenAI as OpenAI Responses API

    Modal->>API: POST /api/ai/triage-capture { itemId }
    API->>DB: Busca captura original e projetos ativos
    API->>DB: Registra ai_runs (status: 'queued' -> 'running')
    API->>Structurer: executeAudioTriage(transcript, context)
    Structurer->>OpenAI: responses.create (model: 'gpt-4.1-mini', format: zodTextFormat)
    OpenAI-->>Structurer: Retorna JSON estrito da proposta
    Structurer->>Structurer: safeParse com AudioTriageProposalSchema
    API->>DB: Atualiza ai_runs (status: 'completed', metadata: proposal)
    API-->>Modal: Retorna HTTP 200 { proposal, aiRunId }
    Note over Modal: Nenhuma alteração de domínio foi feita no banco
```

---

### Diagrama 8: Confirmação de Ações Propostas pela IA
```mermaid
sequenceDiagram
    autonumber
    participant User as Usuário
    participant Review as Componente AudioCaptureReview
    participant Cmd as ItemCommands / ProjectCommands
    participant CalAPI as Rota /api/audio/confirm-calendar-event
    participant DB as Supabase DB

    User->>Review: Visualiza ações sugeridas pela IA
    User->>Review: Marca checkboxes e edita campos se necessário
    User->>Review: Clica em "Confirmar ações selecionadas"
    loop Para cada ação aprovada
        Review->>Cmd: Executa createItem / updateItem
        Cmd->>DB: Persiste no banco de dados
    end
    opt Se houver evento de calendário aprovado
        User->>Review: Clica em "Criar evento no Calendar"
        Review->>CalAPI: POST /api/audio/confirm-calendar-event
        CalAPI->>DB: Cria registro em calendar_event_links
    end
    Review->>User: Exibe status de conclusão e fecha revisão
```

---

### Diagrama 9: Criação de Evento no Google Calendar
```mermaid
sequenceDiagram
    autonumber
    participant API as Rota /api/audio/confirm-calendar-event
    participant TokenService as Token Crypto & Refresh Service
    participant GClient as Google Calendar Client
    participant GAPI as Google Calendar API
    participant DB as Supabase DB

    API->>DB: Valida item sob RLS do workspace
    API->>TokenService: Solicita Access Token válido
    TokenService->>DB: Le de integration_tokens e decifra AES-256-GCM
    TokenService-->>API: Access Token decifrado
    API->>GClient: ensureAppCalendar(accessToken)
    GClient->>GAPI: Garante existência do calendário "Painel Lucas"
    API->>GClient: upsertItemEvent(accessToken, eventData)
    GClient->>GAPI: POST /calendars/{appCalId}/events
    Note over GAPI: Inclui extendedProperties { private: { painelItemId } }
    GAPI-->>GClient: Retorna Google Event ID
    API->>DB: UPSERT em calendar_event_links (sync_status: 'synced')
    API-->>API: Retorna HTTP 200 { status: 'created' }
```

---

### Diagrama 10: Importação e Processamento de Planos
```mermaid
sequenceDiagram
    autonumber
    participant User as Usuário
    participant Form as Tela /planos/novo
    participant ProcPage as Tela /planos/processar/[docId]
    participant ProcAPI as Rota /api/planos/processar
    participant OpenAI as OpenAI Responses API
    participant DB as Supabase DB

    User->>Form: Cola documento ou envia arquivo .md/.txt
    Form->>DB: Salva source_documents (status: 'pending')
    Form->>ProcPage: Redireciona para tela de processamento
    ProcPage->>ProcAPI: POST /api/planos/processar { documentId }
    ProcAPI->>OpenAI: Envia prompt de estruturação (gpt-4.1-mini)
    OpenAI-->>ProcAPI: Retorna PlanProposal (fases, ações, recorrências)
    ProcAPI->>DB: Salva execution_plans (status: 'draft')
    ProcAPI->>DB: Salva plan_phases, plan_actions e recurrence_rules (is_active: false)
    ProcAPI-->>ProcPage: Retorna HTTP 200 { planId }
    ProcPage->>User: Redireciona para /planos/[planId]/revisar
```

---

### Diagrama 11: Recorrências e Materialização de Itens
```mermaid
flowchart TD
    A["Job do Cron ou Disparo Manual"] --> B["Consulta recurrence_rules (is_active = true)"]
    B --> C{"Possui regras vencidas (next_occurrence_at <= NOW)?"}
    C -- Não --> D["Fim do ciclo de materialização"]
    C -- Sim --> E["Para cada regra vencida:"]
    E --> F["RecurrenceEngine calcula data exata no fuso SP"]
    F --> G["Monta Item derivado (source: 'automation')"]
    G --> H["Executa UPSERT em items (Constraint: recurrence_rule_id + occurrence_at)"]
    H --> I{"Houve conflito de chave única?"}
    I -- Sim (Já existia) --> J["Ignora duplicação (Idempotência garantida)"]
    I -- Não (Novo) --> K["Insere novo Item no banco"]
    J --> L["Atualiza recurrence_rules (last_occurrence_at e next_occurrence_at)"]
    K --> L
    L --> D
```

---

### Diagrama 12: Cron e Automações Horárias
```mermaid
sequenceDiagram
    autonumber
    participant Vercel as Vercel Cron Service
    participant CronAPI as Rota /api/cron/automation-tick
    participant Runner as automation-runner (runIdempotentJob)
    participant DB as Supabase DB
    participant Services as Recorrências, Reminders, Calendar & Digest

    Vercel->>CronAPI: GET /api/cron/automation-tick (Header: Bearer CRON_SECRET)
    CronAPI->>CronAPI: Valida CRON_SECRET
    loop Para cada Workspace no sistema
        CronAPI->>Runner: Tenta executar passo (ex: 'materialize_recurrences')
        Runner->>DB: Tenta criar registro em automation_runs (status: 'running')
        alt Conflito de Chave Única (Idempotency Key já processada nesta hora/dia)
            DB-->>Runner: Conflito de Unique Constraint
            Runner-->>CronAPI: Pula execução (status: 'skipped')
        else Reivindicação Bem-Sucedida
            Runner->>Services: Executa tarefa de fundo
            Services-->>Runner: Sucesso
            Runner->>DB: Atualiza automation_runs (status: 'completed')
        end
    end
    CronAPI-->>Vercel: Retorna HTTP 200 { ok: true, summary }
```

---

### Diagrama 13: Gmail e Envio de Resumos (Digests)
```mermaid
sequenceDiagram
    autonumber
    participant Trigger as Cron / Disparo Manual em Configurações
    participant Dispatch as digest-dispatch.ts
    participant DB as Supabase DB
    participant Templates as digest.ts (Templates Puros)
    participant Sender as GmailSender
    participant GmailAPI as Google Gmail API

    Trigger->>Dispatch: sendDigest(workspaceId, kind: 'daily'|'weekly')
    Dispatch->>DB: Consulta workspace_settings
    Dispatch->>Dispatch: Valida se opt-in está ativo (daily_digest_enabled)
    alt Desativado e não-manual
        Dispatch-->>Trigger: Retorna { sent: false, reason: 'Desativado' }
    else Ativo ou Teste Manual
        Dispatch->>DB: Coleta dados do dia/semana (itens, focos, prazos)
        Dispatch->>Templates: renderDailyDigest(dados)
        Templates-->>Dispatch: Retorna corpo em texto puro (pt-BR)
        Dispatch->>Sender: send(recipientEmail, subject, bodyText)
        Sender->>DB: Obtém token decifrado do Gmail (scope: gmail.send)
        Sender->>GmailAPI: POST /gmail/v1/users/me/messages/send
        GmailAPI-->>Sender: Confirmado envio
        Sender->>DB: Grava DomainEvent ('digest.daily_sent')
        Dispatch-->>Trigger: Retorna { sent: true }
    end
```

---

### Diagrama 14: Migração de Dados Locais para a Nuvem
```mermaid
sequenceDiagram
    autonumber
    participant User as Usuário
    participant Wizard as Tela /migracao
    participant Migrator as local-data-migration.ts
    participant Local as localStorage (Fase 1)
    participant DB as Supabase DB

    User->>Wizard: Acessa rota de migração
    Wizard->>Migrator: readLocalData()
    Migrator->>Local: Lê e valida dicionários (items, projects, plans)
    Local-->>Wizard: Retorna contadores da prévia
    User->>Wizard: Clica em "Baixar backup JSON"
    Wizard-->>User: Faz download de arquivo .json
    User->>Wizard: Clica em "Migrar para a nuvem"
    Wizard->>Migrator: migrateLocalData(workspaceId)
    Migrator->>DB: Upsert Projetos -> Items -> DailyPlans (ordem respeita FKs)
    DB-->>Migrator: Todos os registros gravados com sucesso
    Migrator->>DB: Insere DomainEvent ('migration.completed')
    Wizard->>User: Exibe tabela de comparação e sucesso
    opt Limpeza opcional
        User->>Wizard: Confirma remoção em duas etapas
        Wizard->>Local: clearLocalData()
    end
```
