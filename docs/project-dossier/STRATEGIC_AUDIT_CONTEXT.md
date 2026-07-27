# Contexto para Auditoria Estratégica — Painel Pessoal Lucas

> **Finalidade do Documento**: Fornecer a outro agente de IA ou auditor técnico o contexto integral, factual e autocontido do projeto **Painel Pessoal Lucas**, permitindo realizar auditorias de produto, arquitetura, UX, UI, automações e inteligência artificial sem necessidade de reanalisar a fundo o repositório.

---

## 1. Visão Geral do Produto e Propósito de Negócio

O **Painel Pessoal Lucas** é uma central operacional pessoal desenvolvida sob medida para gerenciar o fluxo de trabalho de um único usuário ("Lucas"). O produto foi concebido sob a premissa de que capturar e registrar ideias ou tarefas deve ter atrito próximo de zero, deixando a estruturação, priorização e agendamento para momentos posteriores assistidos por automações e Inteligência Artificial.

### Princípios Norteadores
1. **Capturar Primeiro, Organizar Depois**: Minimizar a carga cognitiva no momento da captura (seja por texto rápido ou gravação de voz).
2. **Confirmação Humana Explícita**: A Inteligência Artificial (OpenAI) atua estritamente como copiloto e geradora de propostas; ela **nunca** executa ações destrutivas, aprova planos automaticamente ou agenda compromissos sem confirmação direta.
3. **Escopo Mínimo de Permissões (Princípio do Menor Privilégio)**: As integrações com o Google utilizam scopes mínimos. O Google Calendar lê apenas disponibilidades de horários (`freebusy`, sem títulos de compromissos pessoais) e o Gmail possui permissão exclusiva para envio de e-mails (`gmail.send`, sem leitura de caixa de entrada).
4. **Resistência a Falhas e Desacoplamento**: Falhas em integrações externas (ex: erro no Google Calendar ou falha na API da OpenAI) nunca impedem o usuário de salvar suas capturas locais no banco de dados.

---

## 2. Evolução de Fases do Projeto

| Fase | Descrição & Status | Mecanismo de Persistência |
|---|---|---|
| **Fase 1 (Legado)** | Armazenamento local no navegador. | `localStorage` via `LocalStorageAdapter` |
| **Fase 2 (Ativa em Produção)** | Nuvem multi-tenant com isolamento RLS por workspace, reatividade local e integrações. | Supabase PostgreSQL + `@supabase/ssr` + Google APIs + Vercel Cron |
| **Fase 3 (Integrada)** | Captura por voz, transcrição assíncrona com Whisper e triagem assistida por IA. | OpenAI Audio API (`whisper-1`) + Responses API (`gpt-4.1-mini`) |

> [!NOTE]
> Todos os componentes de UI em produção operam 100% na **Fase 2/3**. As classes de repositório `localStorage` permanecem no repositório exclusivamente para exercitar os 216 testes unitários e para dar suporte ao assistente de migração (`/migracao`).

---

## 3. Arquitetura Técnica e Modelo de Isolamento

- **Clean Architecture & DDD**: O código está organizado sob `src/modules/{items, projects, planning, plans}` e `src/platform/{ai, events, integrations, supabase}`.
- **Commands vs. Queries**: A escrita é realizada por *Commands* que validam schemas com Zod, persistem no Supabase e geram um `DomainEvent` auditável na tabela `domain_events`. A leitura é realizada por *Queries* consumidas na UI pelo hook `useReactiveQuery`.
- **Isolamento RLS (Row Level Security)**: Cada tabela no PostgreSQL possui a coluna `workspace_id` e políticas RLS validadas pela função SQL `is_workspace_member(workspace_id)`.
- **Proxy de Autenticação (`src/proxy.ts`)**: Implementação nativa para Next.js 16 App Router que valida sessões no servidor via `supabase.auth.getUser()`, renova cookies e protege rotas privadas.

---

## 4. Estado Factual Verificado e Validações

No commit `137fc0109f37f3e6d34c04b748dfb94bed8812c0` na branch `main`:
- **Node**: `v24.16.0` | **npm**: `11.13.0`
- **Lint**: `npm run lint` -> **PASS** (Zero avisos/erros).
- **Typecheck**: `npm run typecheck` -> **PASS** (Zero erros de compilação TS).
- **Testes**: `npm run test` -> **PASS** (31 arquivos, 216 testes passando).
- **Build**: `npm run build` -> **PASS** (32 páginas/rotas geradas, build de produção Turbopack sem falhas).

---

## 5. Diretrizes para a Próxima Auditoria Estratégica

Ao utilizar este dossiê para conduzir a auditoria estratégica de produto, UX e arquitetura, considere as seguintes premissas firmadas:

1. **Não Re-Verificar Fatos Já Confirmados**: O estado do código, versões de dependências, integridade do build e aprovação nos testes foram comprovados por execução direta.
2. **Foco na Carga Cognitiva e Fluidez**: Avaliar a experiência do usuário nos fluxos de captura e triagem, verificando se o design da interface apoia o objetivo de produtividade.
3. **Análise de Inconsistências de UI**: Investigar o impacto das inconsistências apontadas no [DESIGN_SYSTEM_AND_VISUAL_AUDIT.md](file:///C:/Users/USER/Desktop/PROJETOS/PAINEL%20PESSOAL%20LUCAS/docs/project-dossier/DESIGN_SYSTEM_AND_VISUAL_AUDIT.md) (como áreas de toque reduzidas e variação de border-radius).
4. **Avaliação da Cobertura de Testes E2E**: Notar que, embora haja 216 testes unitários/componentes passando, as integrações com Supabase, Google e OpenAI utilizam mocks. A auditoria deve ponderar os riscos de ausência de homologação E2E automatizada em ambiente real.
5. **Limites de Automação e IA**: Garantir que as propostas de melhoria mantenham os guardrails éticos e funcionais (humano no loop, sem execuções autônomas sem confirmação).

---

## 6. CONTEXTO PESSOAL E OPERACIONAL A SER ADICIONADO PELO USUÁRIO

> **Nota**: Esta auditoria de preparação é estritamente factual e derivada do código-fonte. Ela **não** contém — e não deveria inventar — informações sobre a rotina, as responsabilidades ou as preferências pessoais do usuário (Lucas). Antes de anexar este dossiê a um modelo com maior capacidade de análise para a auditoria estratégica de produto/UX, o usuário deveria complementar este documento com as informações abaixo, que só ele pode fornecer:

- **Rotina de uso**: em que momentos do dia o painel é efetivamente aberto (ex.: início do expediente, durante reuniões, à noite); se o uso é contínuo ao longo do dia ou concentrado em blocos.
- **Dispositivos e contexto de uso**: proporção de uso em desktop vs. celular; se a captura por áudio é usada em deslocamento, em reuniões, ou em outro contexto específico.
- **Projetos reais em andamento**: quais projetos hoje cadastrados (ex.: os citados em `docs/PRODUCT_DIRECTION.md` — Grupo Almeida, Sartec, Marketing Sartec, portfólio/carreira, Sartec Digital) ainda são ativos, e quais mudaram de escopo desde que aquele documento foi escrito.
- **Tipos de demanda predominantes**: qual proporção do fluxo de captura é tarefa vs. ideia vs. decisão vs. reunião/compromisso; se há demandas recorrentes que ainda não têm um "molde" (ex.: reuniões semanais, relatórios).
- **Dificuldades reais de organização**: em que ponto do fluxo (captura, triagem, revisão, agenda) o usuário sente mais atrito ou abandona a tarefa hoje.
- **Comportamento esperado da IA**: quão intervencionista a IA deveria ser (sugestões amplas vs. conservadoras); tolerância a falsos positivos na triagem por voz.
- **Preferências de notificação e resumo**: se os resumos por e-mail (digest) já estão ativados e sendo usados; frequência desejada; se alertas críticos são úteis ou ruído.
- **Frequência real de revisão**: se a tela `/revisao` é consultada com regularidade, ou se a "higiene do sistema" acumula pendências sem revisão.
- **Objetivos de curto prazo** (próximas 2-4 semanas) para o painel: o que precisa funcionar melhor primeiro.
- **Objetivos de longo prazo**: até onde o usuário pretende levar o produto (uso estritamente pessoal vs. eventual expansão a outras pessoas/equipe — embora o `docs/PRODUCT_DIRECTION.md` explicitamente descarte colaboração multiusuário na fase atual).
- **Tolerância a mudança visual/estrutural**: o quanto o usuário está disposto a reaprender fluxos em nome de uma experiência mais "fluida"/"Apple-like", conforme mencionado como objetivo de uma auditoria futura.

Sem essas respostas, qualquer recomendação de produto/UX feita pela próxima auditoria corre o risco de otimizar para um uso genérico hipotético em vez do uso real do Lucas.
