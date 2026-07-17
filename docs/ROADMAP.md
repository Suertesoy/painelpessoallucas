# Roadmap — Painel Pessoal Lucas

> Fases pequenas e verificáveis. Uma fase só começa quando a anterior está estável em uso real.

## Fase 1 — Fundação local funcional ✅ (atual)
Entregue: captura rápida universal (atalho + botões + FAB mobile), inbox com processamento, projetos com detalhe, foco diário (máx. 3), agenda (agendado vs. prazo, fuso local correto), revisão determinística, busca global, eventos de domínio registrados, testes, lint/typecheck/build limpos, deploy Vercel corrigido.

**Critério de saída:** uso diário por ≥2 semanas sem perda de dados nem fricção bloqueante.

## Fase 1.5 — Utilidade diária (ainda local)
- Área "Aguardando" (quem, desde quando) e bloqueios com motivo.
- Estimativa de duração + capacidade do dia (validar se não vira burocracia).
- Preparação e notas de reunião; extração manual de tarefas da nota.
- Relação ideia→tarefa preservando origem.
- Exportação/backup manual em JSON.
- Detalhe/edição completa de item.

## Fase 2 — Persistência remota e autenticação
- Supabase: schema (workspaces, projects, items, daily_plans, events, relações), RLS, auth de usuário único.
- Migração assistida dos dados do localStorage para o banco (import idempotente).
- Loading/erro/otimismo nas telas; transação entidade+evento (outbox).
- **Sem realtime** nesta fase (single user).

## Fase 3 — Triagem com IA
- Primeira função: triagem de capturas (título, tipo, projeto, prioridade, prazo, próxima ação, confiança, justificativa) com **confirmação humana**.
- Captura salva antes da análise; falha de IA nunca perde captura.
- Prompts versionados; execuções logadas (modelo, duração, tokens, custo, erro).
- Chave somente no servidor (rota/api), nunca `NEXT_PUBLIC_OPENAI_API_KEY`.

## Fase 4 — Agenda e e-mail
- Google Calendar (leitura primeiro; escrita depois) e Gmail → item na Entrada.
- Webhooks assinados, idempotentes, convertidos em Commands.

## Fase 5 — Eventos assíncronos e automações
- Outbox processada de forma assíncrona com retries.
- Automações determinísticas: projeto ativo sem próxima ação → alerta; item adiado repetidamente → sugestão; reunião criada → preparação; prazo próximo → destaque; deploy → registro no projeto.
- Núcleo das regras no painel; n8n/externos apenas chamam endpoints.

## Fase 6 — MCP
- Servidor MCP expondo `capture_item`, `list_today`, `search_items`, `search_decisions`, `get_project_context`, `complete_task`, `schedule_task`, `register_insight`, `register_decision`, `get_waiting_items` — todos delegando aos Commands/Queries existentes (auditoria via `source: 'mcp'`).

## Fase 7 — Busca semântica, áudio e expansão
- Embeddings para ideias/decisões ("perguntas ao meu contexto").
- Captura por áudio (transcrição + triagem).
- Pipelines leves (leads, vagas) como visões derivadas.
- Colaboração leve (se ainda fizer sentido).
