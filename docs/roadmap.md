# Roadmap do Painel Pessoal Lucas

Este roadmap organiza a evolução planejada para o projeto, partindo de uma fundação local para um sistema distribuído e inteligente.

## Fase 1: Fundação Local Funcional (Atual)
- Arquitetura de Monólito Modular com forte separação de camadas.
- Modelagem de Domínio (Itens, Projetos, DailyPlan).
- Armazenamento em `localStorage` com adaptadores observáveis (`useSyncExternalStore`).
- Eventos locais e comandos validados.
- Interface funcional para Hoje, Caixa de Entrada, Projetos, Ideias, Agenda e Revisão.

## Fase 2: Persistência Real e Autenticação
- Integração com Supabase.
- Autenticação de usuários.
- Substituição dos adaptadores `LocalStorage` por `SupabaseRepository` (sem reescrever a aplicação).
- Sincronização entre dispositivos.

## Fase 3: Triagem Inteligente
- Integração com OpenAI.
- Funcionalidades de auto-classificação de capturas rápidas, extração de ações e sugestão de prioridade.
- Geração de resumos automáticos de projetos.

## Fase 4: Integrações Básicas
- Google Calendar (sincronização bidirecional de blocos de tempo).
- Gmail (conversão de emails críticos em itens de foco/inbox).

## Fase 5: Assincronicidade e Workflows
- Processamento assíncrono real de eventos via Outbox, utilizando Vercel Workflows ou filas equivalentes.
- Retentativas em caso de falha.
- Webhooks de entrada seguros e idempotentes.

## Fase 6: Model Context Protocol (MCP) e Agentes
- Servidor MCP expondo as Queries e Commands do sistema de forma segura.
- Agentes externos atuando sobre os dados via MCP, com log de auditoria claro na fonte (source: 'mcp').

## Fase 7: Busca Semântica e Acesso Expandido
- Embeddings vetoriais para busca inteligente de ideias, insights e decisões.
- Captura por áudio (transcrição + triagem).
- Acesso colaborativo futuro para times pequenos ou parceiros.
