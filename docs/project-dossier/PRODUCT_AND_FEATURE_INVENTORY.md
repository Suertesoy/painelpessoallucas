# Inventário de Funcionalidades e Produto — Painel Pessoal Lucas

Este documento fornece o inventário categorizado e factual de todas as funcionalidades do **Painel Pessoal Lucas**, mapeando seu estado real de implementação no repositório.

---

## 1. Categorização de Funcionalidades

As funcionalidades foram classificadas estritamente de acordo com a seguinte legenda de estado:
- **Implementado e funcionando**: Código completo, testado e em produção no ambiente web.
- **Implementado, mas dependente de homologação manual**: Código completo, mas cuja validação final depende de dados ou contas reais de terceiros em produção.
- **Implementado parcialmente**: Possui a camada principal funcional, mas faltam refinamentos ou componentes de UI.
- **Preparado arquiteturalmente**: Interfaces, rotas ou tabelas criadas no banco, porém sem consumo ativo na UI.
- **Temporário**: Funcionalidade ou componente sinalizado explicitamente no código-fonte para remoção posterior.
- **Legado / Código Morto**: Recursos mantidos apenas para retrocompatibilidade ou testes unitários.
- **Somente documentado / Planejado**: Mencionado nos arquivos de documentação (`ROADMAP.md`), mas sem código correspondente.

---

## 2. Matriz Geral de Funcionalidades

| Módulo / Recurso | Descrição da Funcionalidade | Estado Real | Evidência / Arquivo no Código |
|---|---|---|---|
| **Captura Rápida (Texto)** | Modal global acionado por atalho (`Ctrl+Shift+Espaço`) ou UI para salvar tarefas, ideias ou notas instantaneamente. | Implementado e funcionando | [quick-capture-modal.tsx](file:///C:/Users/USER/Desktop/PROJETOS/PAINEL%20PESSOAL%20LUCAS/src/components/quick-capture-modal.tsx) |
| **Captura por Áudio (Voz)** | Gravação de voz via microfone com contador `MM:SS`, player de áudio pré-envio e limite de 5 minutos. | Implementado e funcionando | [audio-recorder.tsx](file:///C:/Users/USER/Desktop/PROJETOS/PAINEL%20PESSOAL%20LUCAS/src/components/audio-recorder.tsx) |
| **Transcrição por IA (Whisper)** | Envio assíncrono de áudio para a API Whisper da OpenAI (`whisper-1`) em português. Áudio descartado pós-transcrição. | Implementado, mas dependente de homologação manual | [route.ts](file:///C:/Users/USER/Desktop/PROJETOS/PAINEL%20PESSOAL%20LUCAS/src/app/api/audio/transcribe/route.ts) |
| **Triagem por IA (Voz)** | Análise estruturada da fala capturada gerando proposta com intenção, projeto sugerido e ações recomendadas. | Implementado, mas dependente de homologação manual | [route.ts](file:///C:/Users/USER/Desktop/PROJETOS/PAINEL%20PESSOAL%20LUCAS/src/app/api/ai/triage-capture/route.ts) |
| **Revisão da Triagem por Áudio** | Componente visual para aprovação ou edição individual de ações sugeridas pela IA antes de aplicar ao banco. | Implementado e funcionando | [audio-capture-review.tsx](file:///C:/Users/USER/Desktop/PROJETOS/PAINEL%20PESSOAL%20LUCAS/src/components/audio-capture-review.tsx) |
| **Caixa de Entrada (Inbox)** | Interface de triagem de itens com busca, filtros por tipo/prioridade, edição inline e ação de organizar/arquivar. | Implementado e funcionando | [page.tsx](file:///C:/Users/USER/Desktop/PROJETOS/PAINEL%20PESSOAL%20LUCAS/src/app/entrada/page.tsx) |
| **Foco do Dia (até 3 itens)** | Gestão do plano diário no dashboard `/hoje` com trava de no máximo 3 itens no Zod e validação de capacidade. | Implementado e funcionando | [daily-plan.commands.ts](file:///C:/Users/USER/Desktop/PROJETOS/PAINEL%20PESSOAL%20LUCAS/src/modules/planning/application/daily-plan.commands.ts) |
| **Cálculo de Capacidade Diária** | Algoritmo que mescla intervalos de tempo sobrepostos e alerta sobrecarga de horário com sugestão de janela livre. | Implementado e funcionando | [capacity.ts](file:///C:/Users/USER/Desktop/PROJETOS/PAINEL%20PESSOAL%20LUCAS/src/lib/capacity.ts) |
| **Gestão de Projetos** | CRUD de projetos com definição de objetivo, status, nível de atenção (normal/atenção/crítico), próximo marco e prazo. | Implementado e funcionando | [page.tsx](file:///C:/Users/USER/Desktop/PROJETOS/PAINEL%20PESSOAL%20LUCAS/src/app/projetos/page.tsx) |
| **Repositório de Ideias e Insights** | Filtro e busca de conhecimento com destaque visual diferenciado para Decisões (borda/fundo vermelho). | Implementado e funcionando | [page.tsx](file:///C:/Users/USER/Desktop/PROJETOS/PAINEL%20PESSOAL%20LUCAS/src/app/ideias/page.tsx) |
| **Visualização de Agenda Semanal** | Calendário navegável por semana exibindo compromissos agendados e due dates de itens/projetos. | Implementado e funcionando | [page.tsx](file:///C:/Users/USER/Desktop/PROJETOS/PAINEL%20PESSOAL%20LUCAS/src/app/agenda/page.tsx) |
| **Importação de Planos (Documentos)** | Formulário para colagem de texto ou upload de arquivos `.md`/`.txt` até 500 KB / 120.000 caracteres. | Implementado e funcionando | [page.tsx](file:///C:/Users/USER/Desktop/PROJETOS/PAINEL%20PESSOAL%20LUCAS/src/app/planos/novo/page.tsx) |
| **Estruturação de Plano por IA** | Geração automática de proposta de plano com fases, ações e recorrências via Responses API (`gpt-4.1-mini`). | Implementado, mas dependente de homologação manual | [route.ts](file:///C:/Users/USER/Desktop/PROJETOS/PAINEL%20PESSOAL%20LUCAS/src/app/api/planos/processar/route.ts) |
| **Revisão e Ativação de Planos** | Interface de edição da proposta da IA com diferenciação de Fatos, Hipóteses, Sugestões, Decisões e Perguntas. | Implementado e funcionando | [page.tsx](file:///C:/Users/USER/Desktop/PROJETOS/PAINEL%20PESSOAL%20LUCAS/src/app/planos/[planId]/revisar/page.tsx) |
| **Motor de Recorrências** | Cálculo determinístico de datas de ocorrência (diário, semanal, mensal, relativo a fases) no fuso de SP. | Implementado e funcionando | [recurrence-engine.ts](file:///C:/Users/USER/Desktop/PROJETOS/PAINEL%20PESSOAL%20LUCAS/src/modules/plans/domain/recurrence-engine.ts) |
| **Painel de Revisão do Sistema** | Auditoria automática de saúde: prazos estourados, tarefas bloqueadas, inbox estagnada >30d e proj. sem marco. | Implementado e funcionando | [page.tsx](file:///C:/Users/USER/Desktop/PROJETOS/PAINEL%20PESSOAL%20LUCAS/src/app/revisao/page.tsx) |
| **Integração Google Calendar (OAuth)** | Sincronização bidirecional de disponibilidade (freebusy) e criação de eventos no calendário "Painel Lucas". | Implementado, mas dependente de homologação manual | [calendar-sync.ts](file:///C:/Users/USER/Desktop/PROJETOS/PAINEL%20PESSOAL%20LUCAS/src/platform/integrations/calendar-sync.ts) |
| **Integração Gmail (Resumos por E-mail)** | Envio de resumos diários/semanais e alertas críticos via API do Gmail (`gmail.send`). Requer opt-in explícito. | Implementado, mas dependente de homologação manual | [digest-dispatch.ts](file:///C:/Users/USER/Desktop/PROJETOS/PAINEL%20PESSOAL%20LUCAS/src/platform/integrations/digest-dispatch.ts) |
| **Automações Horárias (Cron)** | Job executado via Vercel Cron (`/api/cron/automation-tick`) com idempotência garantida pela tabela `automation_runs`. | Implementado, mas dependente de homologação manual | [automation-runner.ts](file:///C:/Users/USER/Desktop/PROJETOS/PAINEL%20PESSOAL%20LUCAS/src/platform/automation/automation-runner.ts) |
| **Assistente de Migração Local->Nuvem** | Ferramenta para prévia, backup em JSON, migração idempotente e limpeza de dados salvos no `localStorage`. | Implementado e funcionando | [local-data-migration.ts](file:///C:/Users/USER/Desktop/PROJETOS/PAINEL%20PESSOAL%20LUCAS/src/modules/migration/local-data-migration.ts) |
| **Busca Global (`Ctrl+K`)** | Modal com debounce de 300ms pesquisando títulos e conteúdos de itens e projetos em simultâneo. | Implementado e funcionando | [global-search-modal.tsx](file:///C:/Users/USER/Desktop/PROJETOS/PAINEL%20PESSOAL%20LUCAS/src/components/global-search-modal.tsx) |
| **Modal de Detalhes do Item** | Modal responsivo (bottom sheet em mobile, dialog em desktop) com edição completa e painel de proveniência de áudio. | Implementado e funcionando | [item-detail-modal.tsx](file:///C:/Users/USER/Desktop/PROJETOS/PAINEL%20PESSOAL%20LUCAS/src/components/item-detail-modal.tsx) |
| **Diagnósticos Temporários de Sync** | Cards visuais na tela `/configuracoes` para inspecionar estado da sessão e diagnosticar falta de sync em mobile. | Temporário | [sync-diagnostics-card.tsx](file:///C:/Users/USER/Desktop/PROJETOS/PAINEL%20PESSOAL%20LUCAS/src/components/sync-diagnostics-card.tsx) |
| **Sincronização Granular por Item/Plano** | Rotas `/api/integrations/calendar/sync-item` e `sync-plan` para alterar escopo de sincronização via API. | Preparado arquiteturalmente | [sync-item/route.ts](file:///C:/Users/USER/Desktop/PROJETOS/PAINEL%20PESSOAL%20LUCAS/src/app/api/integrations/calendar/sync-item/route.ts) |
| **Adaptadores LocalStorage (Fase 1)** | Classes `LocalStorageItemRepository`, `LocalStorageProjectRepository`, etc. | Legado / Código Morto | [local-storage-adapter.ts](file:///C:/Users/USER/Desktop/PROJETOS/PAINEL%20PESSOAL%20LUCAS/src/platform/storage/local-storage-adapter.ts) |
| **Contrato Genérico AIProvider** | Interface `AIProvider` (`triage`, `summarizeProject`, `semanticSearch`). | Preparado arquiteturalmente | [ai.provider.ts](file:///C:/Users/USER/Desktop/PROJETOS/PAINEL%20PESSOAL%20LUCAS/src/platform/ai/ai.provider.ts) |
| **Registro MCP (Model Context Protocol)** | Interface `MCPRegistry` para ferramentas MCP externas. | Preparado arquiteturalmente | [mcp.registry.ts](file:///C:/Users/USER/Desktop/PROJETOS/PAINEL%20PESSOAL%20LUCAS/src/platform/mcp/mcp.registry.ts) |
| **Outbox Transacional** | Padrão Outbox assíncrono para garantia de entrega de eventos. | Planejado | `src/platform/outbox/` (diretório vazio) |
