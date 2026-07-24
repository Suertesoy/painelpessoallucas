# Dossiê Master do Projeto — Painel Pessoal Lucas

> **Status da Auditoria**: Concluída (Read-Only)  
> **Data de Referência**: 24 de julho de 2026  
> **Repositório**: `c:\Users\USER\Desktop\PROJETOS\PAINEL PESSOAL LUCAS`  
> **Commit de Referência**: `137fc0109f37f3e6d34c04b748dfb94bed8812c0` (`origin/main`)  
> **Ambiente de Execução/Validação**: Node v24.16.0, npm 11.13.0, Windows 11  

---

## Sumário Executive

O **Painel Pessoal Lucas** é uma central operacional pessoal orientada à produtividade, estruturada sob o princípio fundamental de **"capturar primeiro, organizar depois"**. O sistema permite a entrada rápida de tarefas, ideias, insights, decisões, referências e notas livres por texto e por áudio, fornecendo fluxos de triagem assistida por Inteligência Artificial (OpenAI), planejamento estruturado, sincronização com o Google Calendar, envio de resumos por e-mail (Gmail) e automações horárias via Vercel Cron.

### Visão Geral do Estado Atual
- **Fase Arquitetural Ativa**: O projeto encontra-se na **Fase 2** (nuvem/Supabase com RLS por workspace) totalmente operacional em produção no Vercel ([painelpessoallucas.vercel.app](https://painelpessoallucas.vercel.app)). A captura por áudio com triagem por IA (rotulada como Fase 3 no mapa de evolução) já está totalmente implementada e integrada.
- **Saúde do Código**: 
  - `npm run lint`: **100% PASS** (ESLint sem avisos ou erros).
  - `npm run typecheck`: **100% PASS** (TypeScript 5.9.3 em modo estrito sem erros).
  - `npm run test`: **100% PASS** (31 arquivos de teste Vitest, 216 testes aprovados).
  - `npm run build`: **100% PASS** (Build de produção com Turbopack gerando 32 páginas/rotas).
- **Abstração e Transição**: Os adaptadores de persistência em `localStorage` (Fase 1) permanecem no código-fonte apenas para a suíte de testes unitários e para o assistente de migração (`/migracao`); nenhum componente de produção em runtime utiliza `localStorage` para leitura/escrita de domínio.

---

## 1. Stack Tecnológico

| Camada | Tecnologia / Biblioteca | Versão | Observações de Implementação |
|---|---|---|---|
| **Framework Web** | Next.js (App Router) | 16.2.10 | Turbopack ativado, React 19, Server & Client Components |
| **Linguagem** | TypeScript | 5.9.3 | Modo estrito (`strict: true`), sem `ignoreBuildErrors` |
| **Interface / Estilo** | Tailwind CSS / PostCSS | 4.3.3 | Tailwind 4 sem `tailwind.config`, configurado via `@import "tailwindcss"` |
| **Validação de Domínio** | Zod | 4.4.3 | Schemas para entidades, DTOs, formulários e structured outputs |
| **Banco de Dados** | Supabase Postgres | 2.110.7 | PostgreSQL com RLS habilitado em todas as 22 tabelas |
| **Sessão & Auth SSR** | `@supabase/ssr` | 0.12.3 | Autenticação via Google OAuth + suporte a cookies em Server Components/Proxy |
| **Inteligência Artificial**| OpenAI SDK | 6.47.0 | Responses API com `zodTextFormat` (structured outputs) + Whisper API |
| **Testes Unitários/UI** | Vitest + RTL | 4.1.10 | Environment happy-dom, 31 suítes de teste sem rede real |
| **Datas & Fusos** | date-fns | 4.4.0 | Utilitários de manipulação de data no fuso local (`America/Sao_Paulo`) |
| **Iconografia** | lucide-react | 1.24.0 | Conjunto padronizado de ícones SVG |
| **Hospedagem / Cron** | Vercel Cron | — | Acionamento horário via `vercel.json` na rota `/api/cron/automation-tick` |

---

## 2. Mapa Geral de Documentos do Dossiê

Para auditorias especializadas em áreas específicas do sistema, consulte os relatórios autocontidos criados sob `docs/project-dossier/`:

1. [STRATEGIC_AUDIT_CONTEXT.md](file:///C:/Users/USER/Desktop/PROJETOS/PAINEL%20PESSOAL%20LUCAS/docs/project-dossier/STRATEGIC_AUDIT_CONTEXT.md)  
   *Contexto estratégico e briefing completo preparado para handoff de auditoria de produto/arquitetura por IA ou especialistas humanos.*
2. [PRODUCT_AND_FEATURE_INVENTORY.md](file:///C:/Users/USER/Desktop/PROJETOS/PAINEL%20PESSOAL%20LUCAS/docs/project-dossier/PRODUCT_AND_FEATURE_INVENTORY.md)  
   *Matriz completa de funcionalidades ativas, parciais, preparadas, temporárias, legadas e planejadas.*
3. [SCREEN_COPY_AND_FLOW_INVENTORY.md](file:///C:/Users/USER/Desktop/PROJETOS/PAINEL%20PESSOAL%20LUCAS/docs/project-dossier/SCREEN_COPY_AND_FLOW_INVENTORY.md)  
   *Inventário de todas as 16 rotas, componentes de interface, modais globais, micro-copies, mensagens de erro/sucesso e responsividade.*
4. [TECHNICAL_ARCHITECTURE_AND_DATA_FLOWS.md](file:///C:/Users/USER/Desktop/PROJETOS/PAINEL%20PESSOAL%20LUCAS/docs/project-dossier/TECHNICAL_ARCHITECTURE_AND_DATA_FLOWS.md)  
   *Arquitetura técnica detalhada, modelo de dados Postgres (22 tabelas, RLS, triggers), Rota Handler proxy, 14 diagramas Mermaid e módulos DDD.*
5. [DESIGN_SYSTEM_AND_VISUAL_AUDIT.md](file:///C:/Users/USER/Desktop/PROJETOS/PAINEL%20PESSOAL%20LUCAS/docs/project-dossier/DESIGN_SYSTEM_AND_VISUAL_AUDIT.md)  
   *Análise do sistema visual atual: paleta Tailwind, tipografia Inter, espaçamentos, bordas, sombras, acessibilidade e inconsistências.*
6. [RISKS_DEBT_AND_OPEN_QUESTIONS.md](file:///C:/Users/USER/Desktop/PROJETOS/PAINEL%20PESSOAL%20LUCAS/docs/project-dossier/RISKS_DEBT_AND_OPEN_QUESTIONS.md)  
   *Análise de riscos de produção, dívida técnica identificada, diretórios de scaffolding, gaps de teste, segurança e perguntas abertas.*
7. [PROJECT_INVENTORY.json](file:///C:/Users/USER/Desktop/PROJETOS/PAINEL%20PESSOAL%20LUCAS/docs/project-dossier/PROJECT_INVENTORY.json)  
   *Inventário estruturado em formato JSON válido para consumo por máquinas e scripts de auditoria.*
8. [FILE_MAP.md](file:///C:/Users/USER/Desktop/PROJETOS/PAINEL%20PESSOAL%20LUCAS/docs/project-dossier/FILE_MAP.md)  
   *Mapeamento exaustivo de 60+ arquivos fundamentais do repositório, com responsabilidades, camadas e classificação de criticidade.*
9. [EXECUTIVE_HANDOFF.md](file:///C:/Users/USER/Desktop/PROJETOS/PAINEL%20PESSOAL%20LUCAS/docs/project-dossier/EXECUTIVE_HANDOFF.md)  
   *Resumo executivo condensado (handoff de alto nível) para início rápido de novos ciclos de trabalho.*

---

## 3. Resumo da Arquitetura e Fluxo de Dados

A aplicação é construída segundo os princípios de **Domain-Driven Design (DDD)** desacoplado em camadas:

```
[UI Components / Pages] 
        │
        ▼ (useCommands / useQueries)
[Application Layer (Commands & Queries)]
        │
        ▼ (Domain Interfaces & Zod Validation)
[Infrastructure Layer (Supabase Repositories)]
        │
        ├──> [Supabase Postgres DB] (RLS por workspace_id)
        └──> [ChangeNotifier] ──> (Refetch de Queries Reativas no Browser)
```

- **Resolução de Workspace**: Toda operação exige um `workspaceId` resolvido pela sessão Supabase através da RPC `ensure_personal_workspace()`. O usuário possui isolation total via Row Level Security (RLS) no PostgreSQL.
- **Proxy do Next.js 16** (`src/proxy.ts`): Intercepta todas as requisições (exceto rotas públicas estáticas, `/login`, `/auth`, `/api/cron` e `/api/health`), renova cookies de sessão Supabase SSR via `getUser()` e força o redirecionamento de usuários não autenticados.
- **Reatividade sem WebSocket**: `useReactiveQuery` escuta eventos do `ChangeNotifier` emitidos localmente após mutações de escrita, e reconecta re-buscas síncronas ao focar a aba/janela (`window focus`).

---

## 4. Integrações Externas e Inteligência Artificial

1. **OpenAI API**:
   - **Estruturação de Planos** (`POST /api/planos/processar`): Transforma documentos `.md`/`.txt` em planos com fases, ações e recorrências usando o modelo `gpt-4.1-mini` via Responses API e `zodTextFormat`. O documento original permanece intacto e o plano é salvo como rascunho (`draft`) inativo até aprovação humana.
   - **Transcrição de Áudio** (`POST /api/audio/transcribe`): Transcreve arquivos de voz em português via `whisper-1`. O arquivo de áudio **nunca é gravado em disco ou banco**; é descartado da memória imediatamente após a chamada.
   - **Triagem por Voz** (`POST /api/ai/triage-capture`): Analisa a transcrição e gera propostas de ação (`AudioTriageProposal`). **Nenhuma ação é aplicada automaticamente**; exige confirmação por ação no componente `AudioCaptureReview`.
2. **Google Calendar API**:
   - Autenticação OAuth separada do login do app, com tokens criptografados no servidor via **AES-256-GCM** na tabela inacessível ao cliente `integration_tokens`.
   - Permite consultar disponibilidade (método `freebusy`, **sem acesso aos títulos dos eventos do usuário**) e criar/atualizar compromissos no calendário dedicado "Painel Lucas". Convites a terceiros **não são enviados**.
3. **Gmail API**:
   - Scope exclusivo `gmail.send`. Utilizado para o envio de resumos diários/semanais e alertas críticos de prazos. Nenhuma leitura de caixa de entrada é realizada. Funciona exclusivamente por opt-in em `workspace_settings`.
4. **Vercel Cron / Automações**:
   - Job horário acionado em `/api/cron/automation-tick`, protegido por `CRON_SECRET`. Executa materialização idempotente de recorrências vencidas, conversão de lembretes em notificações e despacho de resumos. A idempotência é garantida por constraint única no banco na tabela `automation_runs`.

---

## 5. Dívidas Técnicas e Achados Relevantes

1. **Constante Legada**: `LEGACY_LOCAL_WORKSPACE_ID` em `src/lib/constants.ts` é mantida para compatibilidade de migração, mas não é consumida por nenhum fluxo de produção.
2. **Diretórios de Scaffolding Vazios**: `src/types/`, `src/platform/outbox/`, `src/platform/workflows/`, `src/modules/review/application/` e `src/modules/review/ui/` estão vazios ou não possuem arquivos implementados.
3. **Contratos Desconectados**: `src/platform/ai/ai.provider.ts`, `src/platform/mcp/mcp.registry.ts` e `src/platform/integrations/integration.adapter.ts` contêm stubs/interfaces de fases futuras que não são instanciados pela aplicação viva.
4. **Bypass da Abstração EventRepository**: Três pontos de gravação de eventos de domínio (`execution_plan.draft_created`, `migration.completed` e `digest.*_sent`) inserem dados diretamente na tabela `domain_events` via cliente Supabase, contornando o repositório injetável.
5. **Inconsistências de Design System**: Duplicidade de tokens visuais ad-hoc (variação entre `rounded-xl` e `rounded-lg`, fontes sub-escala `text-[10px]`, containers com larguras `max-w-4xl` a `max-w-6xl` e duas formas de renderizar avisos de erro).

---

## 6. Conclusão da Auditoria

O repositório do **Painel Pessoal Lucas** apresenta um estado de desenvolvimento altamente maduro, funcional e seguro para produção. Todas as regras de negócio, limites de segurança de tokens e requisitos de privacidade em relação a integrações e Inteligência Artificial foram confirmados diretamente no código-fonte e validados por suítes de testes automáticos e build de produção.
