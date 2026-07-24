# Mapa de Arquivos do Repositório — Painel Pessoal Lucas

Este documento lista os **60+ arquivos fundamentais** do repositório `Painel Pessoal Lucas`, detalhando suas responsabilidades, camada arquitetural, nível de criticidade e associação com a suíte de testes.

---

## Legenda de Criticidade
- **Crítico**: Núcleo de domínio, persistência em nuvem, segurança ou integrações de produção.
- **Normal**: Funcionalidade de apoio, página de interface ou utilitário secundário.
- **Temporário**: Componente ou rota criada para diagnóstico temporário de produção.
- **Legado**: Código mantido para retrocompatibilidade, migração ou suporte a testes.

---

## 1. Módulos de Domínio (`src/modules/`)

### Módulo Items (`src/modules/items/`)
| Caminho do Arquivo | Responsabilidade | Camada | Criticidade | Testes? |
|---|---|---|---|---|
| [item.schema.ts](file:///C:/Users/USER/Desktop/PROJETOS/PAINEL%20PESSOAL%20LUCAS/src/modules/items/domain/item.schema.ts) | Fonte de verdade Zod dos enums, tipos e entidades Item | Domain | Crítico | Sim |
| [item.commands.ts](file:///C:/Users/USER/Desktop/PROJETOS/PAINEL%20PESSOAL%20LUCAS/src/modules/items/application/item.commands.ts) | Comandos de escrita (create, update, schedule, complete, etc.) | Application | Crítico | Sim |
| [item.queries.ts](file:///C:/Users/USER/Desktop/PROJETOS/PAINEL%20PESSOAL%20LUCAS/src/modules/items/application/item.queries.ts) | Consultas e agregações (listInbox, getTodayOverview, review) | Application | Crítico | Sim |
| [item.repository.ts](file:///C:/Users/USER/Desktop/PROJETOS/PAINEL%20PESSOAL%20LUCAS/src/modules/items/application/item.repository.ts) | Interface do repositório de itens | Application | Crítico | Indireto |
| [supabase-item.repository.ts](file:///C:/Users/USER/Desktop/PROJETOS/PAINEL%20PESSOAL%20LUCAS/src/modules/items/infrastructure/supabase-item.repository.ts) | Persistência real Supabase (produção) | Infrastructure | Crítico | Sim |
| [local-storage-item.repository.ts](file:///C:/Users/USER/Desktop/PROJETOS/PAINEL%20PESSOAL%20LUCAS/src/modules/items/infrastructure/local-storage-item.repository.ts) | Adaptador localStorage (Fase 1) | Legado | Sim |

### Módulo Projects (`src/modules/projects/`)
| Caminho do Arquivo | Responsabilidade | Camada | Criticidade | Testes? |
|---|---|---|---|---|
| [project.schema.ts](file:///C:/Users/USER/Desktop/PROJETOS/PAINEL%20PESSOAL%20LUCAS/src/modules/projects/domain/project.schema.ts) | Domínio Zod de Projetos (status, atenção) | Domain | Crítico | Sim |
| [project.commands.ts](file:///C:/Users/USER/Desktop/PROJETOS/PAINEL%20PESSOAL%20LUCAS/src/modules/projects/application/project.commands.ts) | Comandos de escrita de projetos | Application | Crítico | Indireto |
| [project.queries.ts](file:///C:/Users/USER/Desktop/PROJETOS/PAINEL%20PESSOAL%20LUCAS/src/modules/projects/application/project.queries.ts) | Consultas de projetos (list, getById, search) | Application | Crítico | Indireto |
| [supabase-project.repository.ts](file:///C:/Users/USER/Desktop/PROJETOS/PAINEL%20PESSOAL%20LUCAS/src/modules/projects/infrastructure/supabase-project.repository.ts) | Persistência real Supabase de projetos | Infrastructure | Crítico | Sim |

### Módulo Planning (`src/modules/planning/`)
| Caminho do Arquivo | Responsabilidade | Camada | Criticidade | Testes? |
|---|---|---|---|---|
| [daily-plan.schema.ts](file:///C:/Users/USER/Desktop/PROJETOS/PAINEL%20PESSOAL%20LUCAS/src/modules/planning/domain/daily-plan.schema.ts) | Schema Zod do Foco do Dia (máximo 3 itens) | Domain | Crítico | Indireto |
| [daily-plan.commands.ts](file:///C:/Users/USER/Desktop/PROJETOS/PAINEL%20PESSOAL%20LUCAS/src/modules/planning/application/daily-plan.commands.ts) | Gerenciamento de itens de foco do dia | Application | Crítico | Indireto |
| [supabase-daily-plan.repository.ts](file:///C:/Users/USER/Desktop/PROJETOS/PAINEL%20PESSOAL%20LUCAS/src/modules/planning/infrastructure/supabase-daily-plan.repository.ts) | Persistência normalizada (daily_plans + items) | Infrastructure | Crítico | Indireto |

### Módulo Plans (`src/modules/plans/`)
| Caminho do Arquivo | Responsabilidade | Camada | Criticidade | Testes? |
|---|---|---|---|---|
| [plan.schema.ts](file:///C:/Users/USER/Desktop/PROJETOS/PAINEL%20PESSOAL%20LUCAS/src/modules/plans/domain/plan.schema.ts) | Schemas de Planos, Fases, Ações e Recorrências | Domain | Crítico | Indireto |
| [plan-proposal.schema.ts](file:///C:/Users/USER/Desktop/PROJETOS/PAINEL%20PESSOAL%20LUCAS/src/modules/plans/domain/plan-proposal.schema.ts) | Schema Zod da proposta gerada por IA | Domain | Crítico | Sim |
| [recurrence-engine.ts](file:///C:/Users/USER/Desktop/PROJETOS/PAINEL%20PESSOAL%20LUCAS/src/modules/plans/domain/recurrence-engine.ts) | Motor determinístico de cálculo de recorrências | Domain | Crítico | Sim |
| [plan.commands.ts](file:///C:/Users/USER/Desktop/PROJETOS/PAINEL%20PESSOAL%20LUCAS/src/modules/plans/application/plan.commands.ts) | Comandos de aprovação e ativação de planos | Application | Crítico | Indireto |
| [recurrence-materializer.ts](file:///C:/Users/USER/Desktop/PROJETOS/PAINEL%20PESSOAL%20LUCAS/src/modules/plans/application/recurrence-materializer.ts) | Materialização idempotente de recorrências em itens | Application | Crítico | Indireto |
| [supabase-plan.repository.ts](file:///C:/Users/USER/Desktop/PROJETOS/PAINEL%20PESSOAL%20LUCAS/src/modules/plans/infrastructure/supabase-plan.repository.ts) | Persistência única Supabase de planos | Infrastructure | Crítico | Indireto |

---

## 2. Plataforma e Serviços (`src/platform/`)

### IA e Áudio (`src/platform/ai/`)
| Caminho do Arquivo | Responsabilidade | Camada | Criticidade | Testes? |
|---|---|---|---|---|
| [audio-transcriber.ts](file:///C:/Users/USER/Desktop/PROJETOS/PAINEL%20PESSOAL%20LUCAS/src/platform/ai/audio-transcriber.ts) | Contrato e fábrica injetável do transcritor | Platform | Crítico | Sim |
| [openai-audio-transcriber.ts](file:///C:/Users/USER/Desktop/PROJETOS/PAINEL%20PESSOAL%20LUCAS/src/platform/ai/openai-audio-transcriber.ts) | Implementação OpenAI Whisper | Platform | Crítico | Indireto |
| [audio-triage-structurer.ts](file:///C:/Users/USER/Desktop/PROJETOS/PAINEL%20PESSOAL%20LUCAS/src/platform/ai/audio-triage-structurer.ts) | Contrato e prompt da triagem de voz | Platform | Crítico | Sim |
| [openai-audio-triage-structurer.ts](file:///C:/Users/USER/Desktop/PROJETOS/PAINEL%20PESSOAL%20LUCAS/src/platform/ai/openai-audio-triage-structurer.ts) | Implementação OpenAI Responses API para triagem | Platform | Crítico | Indireto |
| [plan-structurer.ts](file:///C:/Users/USER/Desktop/PROJETOS/PAINEL%20PESSOAL%20LUCAS/src/platform/ai/plan-structurer.ts) | Contrato e prompt da estruturação de plano | Platform | Crítico | Sim |
| [openai-plan-structurer.ts](file:///C:/Users/USER/Desktop/PROJETOS/PAINEL%20PESSOAL%20LUCAS/src/platform/ai/openai-plan-structurer.ts) | Implementação OpenAI para estruturação de plano | Platform | Crítico | Indireto |
| [supabase-audio-provenance.repository.ts](file:///C:/Users/USER/Desktop/PROJETOS/PAINEL%20PESSOAL%20LUCAS/src/platform/ai/supabase-audio-provenance.repository.ts) | Repositório de proveniência de capturas por voz | Platform | Crítico | Sim |

### Integrações Google (`src/platform/integrations/`)
| Caminho do Arquivo | Responsabilidade | Camada | Criticidade | Testes? |
|---|---|---|---|---|
| [google-client.ts](file:///C:/Users/USER/Desktop/PROJETOS/PAINEL%20PESSOAL%20LUCAS/src/platform/integrations/google-client.ts) | Fluxo OAuth Google e gestão de tokens | Platform | Crítico | Sim |
| [google-calendar.ts](file:///C:/Users/USER/Desktop/PROJETOS/PAINEL%20PESSOAL%20LUCAS/src/platform/integrations/google-calendar.ts) | Chamadas diretas à API do Google Calendar | Platform | Crítico | Indireto |
| [calendar-sync.ts](file:///C:/Users/USER/Desktop/PROJETOS/PAINEL%20PESSOAL%20LUCAS/src/platform/integrations/calendar-sync.ts) | Sincronização de itens com o Calendar | Platform | Crítico | Indireto |
| [token-crypto.ts](file:///C:/Users/USER/Desktop/PROJETOS/PAINEL%20PESSOAL%20LUCAS/src/platform/integrations/token-crypto.ts) | Criptografia AES-256-GCM para tokens OAuth | Platform | Crítico | Sim |
| [gmail-sender.ts](file:///C:/Users/USER/Desktop/PROJETOS/PAINEL%20PESSOAL%20LUCAS/src/platform/integrations/gmail-sender.ts) | Envio de e-mails via API do Gmail | Platform | Crítico | Indireto |
| [digest.ts](file:///C:/Users/USER/Desktop/PROJETOS/PAINEL%20PESSOAL%20LUCAS/src/platform/integrations/digest.ts) | Templates em texto puro dos resumos (pt-BR) | Platform | Crítico | Sim |
| [digest-dispatch.ts](file:///C:/Users/USER/Desktop/PROJETOS/PAINEL%20PESSOAL%20LUCAS/src/platform/integrations/digest-dispatch.ts) | Validação de opt-in e despacho de resumos | Platform | Crítico | Indireto |

---

## 3. Componentes de Interface (`src/components/`)

| Caminho do Arquivo | Responsabilidade | Camada | Criticidade | Testes? |
|---|---|---|---|---|
| [app-shell.tsx](file:///C:/Users/USER/Desktop/PROJETOS/PAINEL%20PESSOAL%20LUCAS/src/components/app-shell.tsx) | Casca da aplicação e montagem de modais | UI | Crítico | Indireto |
| [sidebar-nav.tsx](file:///C:/Users/USER/Desktop/PROJETOS/PAINEL%20PESSOAL%20LUCAS/src/components/sidebar-nav.tsx) | Barra lateral (desktop) e menu drawer (mobile) | UI | Normal | Indireto |
| [quick-capture-modal.tsx](file:///C:/Users/USER/Desktop/PROJETOS/PAINEL%20PESSOAL%20LUCAS/src/components/quick-capture-modal.tsx) | Modal global de captura rápida por texto e voz | UI | Crítico | Sim |
| [audio-recorder.tsx](file:///C:/Users/USER/Desktop/PROJETOS/PAINEL%20PESSOAL%20LUCAS/src/components/audio-recorder.tsx) | Componente de gravação de áudio com MediaRecorder | UI | Crítico | Sim |
| [audio-capture-review.tsx](file:///C:/Users/USER/Desktop/PROJETOS/PAINEL%20PESSOAL%20LUCAS/src/components/audio-capture-review.tsx) | Interface de aprovação por ação da triagem da IA | UI | Crítico | Sim |
| [item-detail-modal.tsx](file:///C:/Users/USER/Desktop/PROJETOS/PAINEL%20PESSOAL%20LUCAS/src/components/item-detail-modal.tsx) | Modal global de edição e proveniência do item | UI | Crítico | Sim |
| [global-search-modal.tsx](file:///C:/Users/USER/Desktop/PROJETOS/PAINEL%20PESSOAL%20LUCAS/src/components/global-search-modal.tsx) | Modal de busca global (Ctrl+K) | UI | Normal | Indireto |
| [today-calendar-card.tsx](file:///C:/Users/USER/Desktop/PROJETOS/PAINEL%20PESSOAL%20LUCAS/src/components/today-calendar-card.tsx) | Card de capacidade e compromissos do Calendar | UI | Normal | Sim |
| [item-complete-button.tsx](file:///C:/Users/USER/Desktop/PROJETOS/PAINEL%20PESSOAL%20LUCAS/src/components/item-complete-button.tsx) | Botão reutilizável de conclusão com área de 44px | UI | Normal | Sim |
| [data-error-notice.tsx](file:///C:/Users/USER/Desktop/PROJETOS/PAINEL%20PESSOAL%20LUCAS/src/components/data-error-notice.tsx) | Aviso padronizado de erro de query reativa | UI | Normal | Sim |
| [sync-diagnostics-card.tsx](file:///C:/Users/USER/Desktop/PROJETOS/PAINEL%20PESSOAL%20LUCAS/src/components/sync-diagnostics-card.tsx) | Card visual de diagnóstico de sessão | UI | Temporário | Indireto |
| [data-flow-diagnostics-card.tsx](file:///C:/Users/USER/Desktop/PROJETOS/PAINEL%20PESSOAL%20LUCAS/src/components/data-flow-diagnostics-card.tsx) | Card visual de teste de fluxo de dados | UI | Temporário | Sim |

---

## 4. Rotas e Route Handlers (`src/app/`)

| Caminho do Arquivo | Responsabilidade | Tipo | Criticidade | Testes? |
|---|---|---|---|---|
| [proxy.ts](file:///C:/Users/USER/Desktop/PROJETOS/PAINEL%20PESSOAL%20LUCAS/src/proxy.ts) | Guard de rotas e renovação SSR de sessão | Proxy | Crítico | Indireto |
| [page.tsx](file:///C:/Users/USER/Desktop/PROJETOS/PAINEL%20PESSOAL%20LUCAS/src/app/hoje/page.tsx) | Tela Hoje | Page | Crítico | Indireto |
| [page.tsx](file:///C:/Users/USER/Desktop/PROJETOS/PAINEL%20PESSOAL%20LUCAS/src/app/entrada/page.tsx) | Caixa de Entrada | Page | Crítico | Indireto |
| [page.tsx](file:///C:/Users/USER/Desktop/PROJETOS/PAINEL%20PESSOAL%20LUCAS/src/app/projetos/page.tsx) | Lista de Projetos | Page | Crítico | Sim |
| [route.ts](file:///C:/Users/USER/Desktop/PROJETOS/PAINEL%20PESSOAL%20LUCAS/src/app/api/ai/triage-capture/route.ts) | Rota de triagem de voz com IA | API | Crítico | Sim |
| [route.ts](file:///C:/Users/USER/Desktop/PROJETOS/PAINEL%20PESSOAL%20LUCAS/src/app/api/audio/transcribe/route.ts) | Rota de transcrição Whisper | API | Crítico | Sim |
| [route.ts](file:///C:/Users/USER/Desktop/PROJETOS/PAINEL%20PESSOAL%20LUCAS/src/app/api/audio/confirm-calendar-event/route.ts) | Confirmação de evento no Calendar | API | Crítico | Sim |
| [route.ts](file:///C:/Users/USER/Desktop/PROJETOS/PAINEL%20PESSOAL%20LUCAS/src/app/api/cron/automation-tick/route.ts) | Job de automações e cron | API | Crítico | Sim |
| [route.ts](file:///C:/Users/USER/Desktop/PROJETOS/PAINEL%20PESSOAL%20LUCAS/src/app/api/planos/processar/route.ts) | Estruturação de plano por IA | API | Crítico | Indireto |
| [route.ts](file:///C:/Users/USER/Desktop/PROJETOS/PAINEL%20PESSOAL%20LUCAS/src/app/api/debug/sync-status/route.ts) | Rota de diagnóstico de sincronização | API | Temporário | Sim |
