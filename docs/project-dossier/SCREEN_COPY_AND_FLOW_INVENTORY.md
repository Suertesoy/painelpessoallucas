# Inventário de Telas, Componentes, Fluxos e Copies — Painel Pessoal Lucas

Este documento fornece o levantamento factual e exaustivo de todas as telas, componentes, fluxos de usuário, copies (textos da interface), estados visuais e comportamento responsivo do **Painel Pessoal Lucas**.

---

## 1. Mapeamento Geral de Rotas e Navegação

O sistema é composto por **16 rotas funcionais** no Next.js (App Router), além de 3 modais globais montados na casca da aplicação (`AppShell`):

| Rota | Arquivo Fonte | Tipo / Acesso | Layout & Navegação |
|---|---|---|---|
| `/` | `src/app/page.tsx` | Redirecionamento | Redireciona síncrono para `/hoje` |
| `/hoje` | `src/app/hoje/page.tsx` | Client Component (`'use client'`) | Dashboard principal (SidebarNav) |
| `/entrada` | `src/app/entrada/page.tsx` | Client Component | Caixa de Entrada (SidebarNav) |
| `/projetos` | `src/app/projetos/page.tsx` | Client Component | Lista de Projetos (SidebarNav) |
| `/projetos/[projectId]` | `src/app/projetos/[projectId]/page.tsx` | Client Component | Detalhe do Projeto (Link em Projetos/Hoje) |
| `/ideias` | `src/app/ideias/page.tsx` | Client Component | Repositório de Conhecimento (SidebarNav) |
| `/agenda` | `src/app/agenda/page.tsx` | Client Component | Visão de Calendário Semanal (SidebarNav) |
| `/planos` | `src/app/planos/page.tsx` | Client Component | Lista de Planos e Docs (SidebarNav) |
| `/planos/novo` | `src/app/planos/novo/page.tsx` | Client Component | Form de Importação (Botão em `/planos`) |
| `/planos/processar/[documentId]` | `src/app/planos/processar/[documentId]/page.tsx` | Client Component | Tela de Espera de IA (Navegação de `/planos/novo`) |
| `/planos/[planId]` | `src/app/planos/[planId]/page.tsx` | Client Component | Detalhe do Plano Aprovado (Link em `/planos`) |
| `/planos/[planId]/revisar` | `src/app/planos/[planId]/revisar/page.tsx` | Client Component | Edição da Proposta da IA (Link em `/planos/[planId]`) |
| `/revisao` | `src/app/revisao/page.tsx` | Client Component | Painel de Saúde do Sistema (SidebarNav) |
| `/configuracoes` | `src/app/configuracoes/page.tsx` | Client Component | Conta, Integrações e Settings (SidebarNav) |
| `/migracao` | `src/app/migracao/page.tsx` | Client Component | Wizard de Migração (Banner global em `AppShell`) |
| `/login` | `src/app/login/page.tsx` | Client Component | Tela Pública de Autenticação OAuth |

---

## 2. Casca da Aplicação e Navegação Global (`AppShell` & `SidebarNav`)

### Estrutura do AppShell (`src/components/app-shell.tsx`)
- Encapsula todas as rotas autenticadas (`PUBLIC_PREFIXES = ['/login', '/auth']`).
- Estrutura responsiva: `flex h-dvh flex-col md:flex-row`.
- Renderiza o `MigrationBanner` no topo de cada página quando há dados locais não migrados no `localStorage`.
- Monta permanentemente no DOM os 3 modais globais: `<QuickCaptureModal />`, `<GlobalSearchModal />` e `<ItemDetailModal />`.

### Barra de Navegação (`src/components/sidebar-nav.tsx`)
- **Desktop (`md:flex w-64`)**: Sidebar fixa à esquerda (256px) com logo "Painel Lucas", botão de busca global (`Ctrl+K`), botão destacado "Capturar" (azul), links das 8 seções e rodapé do usuário com e-mail e botão "Sair".
- **Mobile (`md:hidden`)**: Barra superior fixa (`h-14`) com título, ícone de busca e botão hambúrguer com estado `aria-expanded` que abre o menu drawer (`z-30`).
- **FAB Mobile**: Botão flutuante redondo (`w-14 h-14 rounded-full`) no canto inferior direito para acesso rápido à Captura Rápida.

---

## 3. Inventário Detalhado por Tela

### 3.1 Tela Hoje (`src/app/hoje/page.tsx`)
- **Objetivo**: Dashboard diário do usuário.
- **Layout**: Grid responsivo `grid-cols-1 lg:grid-cols-3` (`max-w-6xl`).
- **Seções**:
  1. *Foco do Dia*: Até 3 itens de foco com indicador "X/3", aviso visual de estouro de capacidade (banco âmbar com sugestão de horário livre) e seletor inline de novas tarefas.
  2. *Próximas Ações (Tarefas)*: Lista rolável (`max-h-96`) das tarefas mais prioritárias.
  3. *Capacidade + Google Calendar*: Exibida via `<TodayCalendarCard />`.
  4. *Agendado para Hoje*: Linha do tempo vertical roxa de horários marcados.
  5. *Dos planos ativos*: Atividades geradas por planos/recorrências ativas.
  6. *Aguardando*: Itens com status `blocked`.
  7. *Atenção Necessária*: Atalhos coloridos para prazos estourados (vermelho), bloqueados (laranja) e inbox antiga >30d (amarelo).
  8. *Pulso dos Projetos*: Até 5 projetos ativos com indicação de próximo marco.

### 3.2 Caixa de Entrada (`src/app/entrada/page.tsx`)
- **Objetivo**: Triagem e organização rápida de capturas pendentes.
- **Layout**: Filtros em card (`flex-wrap`) com busca por texto, select de Tipo e Prioridade. Lista rolável de itens em `divide-y`.
- **Ações Inline**: Edição de título ao clicar, alteração de próxima ação (texto) e agendamento (date input). Botão "Organizar" (move para `organized`), "Arquivar" (com `window.confirm`) e "Ver detalhes" (abre `ItemDetailModal`).

### 3.3 Gestão de Projetos (`src/app/projetos/page.tsx` e `[projectId]/page.tsx`)
- **Lista (`/projetos`)**: Grid `grid-cols-1 md:grid-cols-2 lg:grid-cols-3`. Filtros por status (Ativos, Pausados, Concluídos, Arquivados). Formulário expansível de novo projeto.
- **Detalhe (`/projetos/[projectId]`)**: Cabeçalho com inputs inline para Nome, Status, Nível de Atenção, Objetivo, Próximo Marco e Prazo. Corpo dividido em 5 seções de itens vinculados: Tarefas, Decisões, Ideias & Insights, Referências & Notas e Arquivados.

### 3.4 Ideias e Insights (`src/app/ideias/page.tsx`)
- **Objetivo**: Repositório de conhecimento e reflexões.
- **Layout**: Filtros por busca, Tipo e Projeto. Destaque visual especial para itens do tipo `decision` (fundo e borda vermelhos `bg-red-50 border-red-200` com ícone `Target`).

### 3.5 Agenda Semanal (`src/app/agenda/page.tsx`)
- **Objetivo**: Visualização temporal por dias da semana.
- **Layout**: Cabeçalho com barra de 7 dias navegáveis (setas e botão "Hoje"). Corpo em 2 colunas: "Agendamentos" (roxo) e "Prazos / Due Dates" (vermelho).

### 3.6 Módulo de Planos (`/planos/*`)
- **Lista (`/planos`)**: Cards de planos com badges de status coloridos e seção de documentos pendentes de estruturação.
- **Importação (`/planos/novo`)**: Wizard em 3 passos com contador de caracteres ao vivo (limite 120.000) e suporte a upload de `.md`/`.txt`.
- **Espera de IA (`/planos/processar/[documentId]`)**: Spinner animado com mensagem de progresso "Estruturando o plano com IA…".
- **Revisão da Proposta (`/planos/[planId]/revisar`)**: Interface de 534 linhas com sistema de badges da IA:
  - `ClipboardCheck` (Verde) = Fato informado
  - `AlertTriangle` (Âmbar) = Hipótese da IA
  - `Lightbulb` (Azul) = Sugestão da IA
  - `CheckCircle` (Verde Escuro) = Decisão aprovada
  - `HelpCircle` (Roxo) = Pergunta aberta
  - Barra inferior fixa para salvar e aprovar o plano.

### 3.7 Revisão do Sistema (`src/app/revisao/page.tsx`)
- **Objetivo**: Painel de saúde determinístico do sistema.
- **Layout**: 4 `StatCard`s superiores (Prazos Estourados, Bloqueados, Inbox >30d, Proj. Sem Marco). Seções condicionais com ações de correção direta (redefinir prazo, desbloquear, organizar).

### 3.8 Configurações (`src/app/configuracoes/page.tsx`)
- **Conteúdo**: Status da Conta, Cards de Integração Google (Calendar e Gmail), preferências de Resumos por E-mail (`DigestSettingsCard`) e seções de diagnósticos temporários de sincronização (`SyncDiagnosticsCard` e `DataFlowDiagnosticsCard`).

### 3.9 Assistente de Migração (`src/app/migracao/page.tsx`)
- **Objetivo**: Migração guiada dos dados da Fase 1 (`localStorage`) para a nuvem.
- **Fluxo**: Prévias de contagem -> Download de backup JSON -> Execução da migração -> Limpeza opcional dos dados locais (com confirmação em duas etapas).

---

## 4. Modais Globais

### 4.1 QuickCaptureModal (`src/components/quick-capture-modal.tsx`)
- Modal centralizado acionado por `Ctrl+Shift+Espaço`.
- **Aba Texto**: Form com conteúdo (obrigatório), título, projeto, tipo e prioridade.
- **Aba Áudio**: Integra o `<AudioRecorder />`, exibe aviso fixo de privacidade, realiza upload para transcrição e exibe a interface de revisão de IA (`<AudioCaptureReview />`).

### 4.2 ItemDetailModal (`src/components/item-detail-modal.tsx`)
- Modal adaptativo (tela cheia em mobile, dialog centralizado em desktop).
- Permite editar todos os atributos do item, alterar status, gerenciar datas e visualizar o **Painel de Proveniência de Áudio** (transcrição original vs. editada, status da IA, resultado de aprovação de ações e link do evento no Google Calendar).

### 4.3 GlobalSearchModal (`src/components/global-search-modal.tsx`)
- Acionado por `Ctrl+K`. Possui debounce de 300ms. Resultados divididos entre Projetos (navegam para a página) e Itens (abrem o `ItemDetailModal`).

---

## 5. Inventário Completo de Textos e Copies (pt-BR)

### Textos de Mensagens de Erro e Sucesso

| Chave / Contexto | Texto Exato da Interface | Tipo / Elemento |
|---|---|---|
| Captura Texto | `"Item capturado com sucesso!"` | Feedback (Verde) |
| Captura Texto | `"Conteúdo é obrigatório"` | Erro de Validação |
| Captura Áudio | `"O áudio é enviado a um serviço de IA (OpenAI) só para transcrição, no servidor. Não é armazenado — é descartado assim que a transcrição termina."` | Aviso de Privacidade |
| Gravador de Voz | `"Permissão do microfone negada. Autorize o acesso e tente novamente."` | Erro do Dispositivo |
| Gravador de Voz | `"Este navegador não tem suporte a gravação de áudio."` | Erro de Suporte |
| Transcrição | `"Enviando e transcrevendo o áudio…"` | Status de Progresso |
| Transcrição | `"Tentar novamente (sem regravar)"` | Botão de Fallback |
| Triagem IA | `"Confirmação humana necessária: nenhuma ação é aplicada automaticamente."` | Aviso de Guardrail |
| Detalhe Item | `"Salvo."` | Status (some em 2s) |
| Detalhe Item | `"Informe um título ou um conteúdo."` | Erro de Validação |
| Foco do Dia | `"Esta atividade ultrapassa a capacidade do dia."` | Aviso de Sobreposição |
| Foco do Dia | `"No máximo 3 itens no foco diário."` | Trava de Domínio |
| Importar Plano | `"Conteúdo do documento não pode estar vazio."` | Erro de Validação |
| Importar Plano | `"O arquivo excede o limite máximo de 500 KB."` | Erro de Validação |
| Processar Plano | `"Isso pode levar até 2 minutos."` | Aviso de Latência |
| Processar Plano | `"O documento original está preservado — nada foi perdido."` | Garantia de Erro |
| Configurações | `"Google Calendar conectado."` / `"Gmail conectado."` | Retorno de OAuth |
| Resumo E-mail | `"Resumo {tipo} enviado para {email}."` | Status de Teste |
| Migração | `"Este navegador tem dados da Fase 1 que ainda não foram migrados para a nuvem."` | Banner Global |
