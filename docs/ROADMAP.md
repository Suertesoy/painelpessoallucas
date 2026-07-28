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

## Fase 2 — Persistência remota, IA, recorrências e integrações ✅ (atual)
Entregue na branch `feat/cloud-sync-ai-automations`:
- Supabase (schema completo com RLS por workspace), login Google (Supabase Auth,
  SSR por cookies), migração assistida e idempotente do localStorage.
- Importação de planos com OpenAI (Responses API + saída estruturada + revisão
  e aprovação humanas), `ai_runs` auditados.
- Recorrências determinísticas com materialização idempotente.
- Google Calendar (scopes mínimos, calendário "Painel Lucas") e Gmail (somente
  envio de resumos, opt-in).
- Cron horário idempotente (`automation_runs`).
- Sem realtime nesta fase (single user); outbox transacional adiada
  (limitação registrada em docs/ARCHITECTURE.md).

**Critério de saída:** login em 2 dispositivos com os mesmos dados, um plano
importado/aprovado gerando ocorrências, digest recebido, cron estável por 1 semana.

## Aprendizado — Learning Engine ✅ (Fase 1 do módulo)
Motor de aprendizado genérico (`modules/learning`), preparado para vários
cursos futuros. Japonês é o primeiro curso cadastrado — nada é hardcoded para
um idioma específico.

Entregue:
- Dashboard (`/aprendizado`) com meta diária (padrão 15 min, configurável de
  5 a 180), sessão de hoje e lista de cursos.
- Página do curso (`/aprendizado/[courseId]`) com módulos (Fundamentos,
  Gramática, Vocabulário, Kanji, Leitura — apenas Fundamentos disponível
  nesta fase), progresso estrutural honesto e atividade recente.
- Configurações (`/aprendizado/configuracoes`): meta diária geral e
  preferências específicas do curso (romaji, furigana, tradução, reprodução
  automática — esta última guardada para uso futuro, sem disparar áudio).
- Sessões de estudo com estados `planned/in_progress/completed/cancelled`,
  duração confirmada pelo usuário, meta diária concluída ao atingir o valor
  configurado e sessões adicionais continuam somando.
- Card compacto em `/hoje`.

Explicitamente fora desta fase: IA, TTS/áudio, listening, speaking,
gamificação, notificações. Progresso do curso nunca deriva de tempo estudado.

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

## Fase 8 — Agenda interativa e sincronização bidirecional com Google Agenda
Fase futura, ainda não iniciada. A correção de exibição de eventos criados
pelo painel (Fase 2/3 — `calendar_event_links` normalizado, consumido por
`useQueries().calendarEvent`) foi desenhada para não impedir esta evolução:
o campo `created_by_panel` já distingue evento criado pelo painel de evento
lido diretamente do Google, e a agenda interna já renderiza a partir de uma
representação normalizada (não direto da API do Google a cada carregamento).
- Leitura dos calendários selecionados pelo usuário (não só "Painel Lucas").
- Sincronização inicial completa dos calendários selecionados.
- Sincronização incremental com `syncToken`.
- Recebimento de mudanças via `events.watch` (push notifications do Google).
- Renovação periódica dos canais de watch.
- Criação, edição e cancelamento de eventos a partir do painel refletindo no Google e vice-versa.
- Suporte a eventos recorrentes e eventos de dia inteiro.
- Cores compatíveis com a paleta de cores do Google Calendar (`colorId`).
- Tratamento de eventos excluídos no Google (remoção refletida no painel).
- Prevenção de duplicações entre eventos criados pelo painel e eventos lidos do Google.
- Resolução de conflitos de edição concorrente (painel x Google).
- Tela de seleção de quais calendários do usuário participam da sincronização.
- Fluxo de reconsentimento OAuth quando novos escopos forem necessários.
- Observabilidade e recuperação automática da sincronização (falhas de watch, tokens expirados, backlog).
- Não amplia os escopos OAuth atuais (`calendar.app.created` + `calendar.freebusy`) enquanto esta fase não for iniciada.

## Fase 9 — PWA e Web Push
Fase futura, sem alterar a prioridade central atual.
- Transformar o painel em PWA (manifest, ícones, instalação).
- Adicionar service worker.
- Registrar push subscriptions por dispositivo.
- Permitir Web Push no celular e no computador.
- No iPhone, orientar a adição do painel à Tela de Início e a autorização das notificações (limitação do Safari/iOS para push web).
- Usar push próprio para: mudança de atividade, avisos de capacidade, projetos parados, falhas de automação, lembretes internos.
- Continuar usando o Google Calendar (lembretes nativos) para notificações de compromissos com horário — não substituído pelo push próprio.
- Não migra para aplicativo nativo.
