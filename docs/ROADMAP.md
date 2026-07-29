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
- Sincronização instantânea entre dispositivos por Supabase Realtime, com
  reconciliação ao reconectar; outbox transacional adiada (limitação
  registrada em docs/ARCHITECTURE.md).

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

## Aprendizado — Learning Content Engine ✅ (Fase 2 do módulo)
Motor de conteúdo declarativo para lições, para que qualquer curso futuro
seja só conteúdo — nunca um componente React novo.

Entregue:
- `Lesson.content` em blocos tipados (`objective`, `text`, `kana`, `example`,
  `note`, `multiple_choice`, `matching`, `summary`), validados por
  `LessonContentSchema`/`LessonBlockSchema` (Zod, `discriminatedUnion`).
- `LessonRenderer` único, guiado por um registro tipo→componente
  (`LESSON_BLOCK_COMPONENTS`); nenhuma lição tem componente próprio.
- Página de lição (`/aprendizado/[courseId]/modulos/[moduleId]/licoes/[lessonId]`).
- Blocos de exercício (`multiple_choice`, `matching`) produzem um
  `ExerciseResult` padronizado (`{ blockId, outcome }`) ao serem
  respondidos — hoje só alimenta o progresso exibido na própria lição.
- Duas lições de exemplo validando a infraestrutura: "Introdução ao curso"
  (adaptada ao novo modelo) e "Hiragana — Vogais" (あ・い・う・え・お).
- `Lesson.contentKey`: identidade editorial estável (não `title`), única por
  módulo e imutável — seed reconcilia por ela, nunca duplica, preserva `id`
  e progresso ao editar título/descrição/conteúdo.
- Progresso de lição persistido (`learning_lesson_progress`): estado
  (`not_started`/`in_progress`/`completed`), total/respondidos/resolvidos,
  início/última atividade/conclusão. Exercício errado é aprendizagem, não
  avaliação — resposta incorreta não trava, permite nova tentativa;
  `firstOutcome` por `blockId` é imutável, `attemptCount` cresce a cada
  tentativa real sem inflar `answeredCount`, e um exercício resolvido é
  idempotente (não reabre). Sobrevive a refresh.
- Conclusão consciente: ação explícita ("Concluir lição"), nunca inferida
  de visualização nem de exercícios resolvidos — sempre permitida, com
  aviso da UI se houver pendências. Página do módulo deriva "X de Y
  concluídas" e o selo por lição de progresso real, nunca um percentual
  fictício.

Explicitamente fora desta fase: flashcards, revisão espaçada (SRS), áudio,
IA, reconhecimento de voz, editor visual de conteúdo, desbloqueio de
módulos por conclusão de lições. `attempts` por `blockId` já tem o formato
que uma fase futura de SRS consumiria, mas nenhuma tentativa de revisão é
persistida ainda — só a primeira exposição.

## Aprendizado — Percurso Hiragana ✅ (Fase 3 do módulo)
Primeiro percurso pedagógico completo do curso Japonês — conteúdo real,
sem nenhuma mudança de arquitetura no Learning Content Engine.

Entregue:
- 19 lições novas em `modules/learning/content/*.ts`, registradas no seed
  (`DEFAULT_MODULES` em `learning.commands.ts`), completando o módulo
  Fundamentos com 21 lições: Introdução, Hiragana — Vogais (Fase 2) e o
  percurso completo do hiragana básico — linhas K/S/T/N/H/M/Y/R/W+ん,
  três revisões cumulativas intermediárias, dakuten/handakuten (G/Z, D/B/P),
  sons combinados (yōon), っ pequeno, vogais longas, leitura de palavras
  frequentes e uma revisão final.
- Convenção editorial: cada lição normal introduz no máximo cinco símbolos
  novos (exceto lições de dakuten/handakuten, que tratam が/ざ/だ/ば/ぱ como
  transformação sistemática de K/S/T/H já conhecidos, não como alfabetos
  independentes); toda lição de conteúdo tem `objective` → explicação →
  exemplos → pelo menos dois exercícios → `summary`; a cada bloco de linhas
  novas segue uma lição de revisão cumulativa sem símbolos novos.
- `CoursePreferences.showRomaji` (já existente desde a Fase 1, mas nunca
  consumida na renderização) agora chega até `KanaBlockView`/
  `ExampleBlockView` via `LessonRenderer` → `LessonBlockViewProps.showRomaji`,
  lido pela página da lição com `getCoursePreferences`. `ExampleItemSchema`
  ganhou um campo opcional `romaji` (leitura da palavra/frase inteira,
  distinto de `note`, que é comentário pedagógico sempre visível) para que
  os exemplos também respeitem a preferência.
- Navegação sequencial: a página da lição oferece "Próxima lição" (por
  `Lesson.position`, nunca por título) após a conclusão, e "Voltar ao
  módulo" na última lição do módulo. A página do módulo destaca com o selo
  "Recomendada" a primeira lição ainda não concluída, também por posição.

Explicitamente fora desta fase (igual à Fase 2): áudio, TTS, reconhecimento
de voz, IA, SRS, editor visual, novo curso, katakana, kanji, gramática
extensa, desbloqueio de módulos por conclusão de lições.

## Fase 3 — Captura livre e triagem com IA ✅
- Captura por texto ou áudio sem classificação prévia.
- Captura salva antes da análise; falha de IA nunca perde captura.
- Áudio temporário: depois da transcrição confirmada, somente o texto permanece.
- Uma captura pode gerar múltiplas propostas com quatro destinos principais:
  tarefa, agendamento, nota e item de compra.
- Caixa de Entrada mostra recebida, em análise, pronta para revisão,
  parcialmente organizada, concluída ou falha.
- Confirmação, edição ou descarte individual; nada é aplicado silenciosamente.
- Prompts versionados; execuções registradas em `ai_runs`; chave somente no servidor.

## Fase 4 — Agenda e e-mail
- Google Calendar (leitura primeiro; escrita depois) e Gmail → item na Entrada.
- Webhooks assinados, idempotentes, convertidos em Commands.

## Fase 5 — Eventos assíncronos e automações
- Outbox processada de forma assíncrona com retries.
- Automações determinísticas: projeto ativo sem próxima ação → alerta; item adiado repetidamente → sugestão; reunião criada → preparação; prazo próximo → destaque; deploy → registro no projeto.
- Núcleo das regras no painel; n8n/externos apenas chamam endpoints.

## Fase 6 — MCP
- Servidor MCP expondo `capture_item`, `list_today`, `search_items`, `search_decisions`, `get_project_context`, `complete_task`, `schedule_task`, `register_insight`, `register_decision`, `get_waiting_items` — todos delegando aos Commands/Queries existentes (auditoria via `source: 'mcp'`).

## Fase 7 — Busca semântica e expansão
- Embeddings para ideias/decisões ("perguntas ao meu contexto").
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

### Fase 2.1 — PWA instalável ✅
- Manifest, ícones, instalação (`InstallAppCard`), service worker com
  política de cache conservadora (`public/sw.js`), página offline,
  atualização controlada pelo usuário ("Nova versão disponível" → "Atualizar
  agora").

### Fase 2.2 — Web Push ✅ (código; migration remota pendente de aplicação — ver abaixo)
Web Push padrão (Service Worker + Push API + Notification API + VAPID,
`userVisibleOnly: true`), reaproveitando o service worker e o cron
existentes — ver `docs/ARCHITECTURE.md` § Web Push para a arquitetura
completa.
- Categorias: lembrete de tarefa (data/horário explícitos, no detalhe do
  item), aviso diário ("Organize seu dia"), revisão semanal, falha de
  captura inteligente.
- Preferências e assinatura por dispositivo (`push_subscriptions`),
  independentes entre si — ativar no celular não ativa no computador.
- Não duplica com o Google Calendar (regra server-side,
  `isCoveredByGoogleCalendarReminder`); Google Calendar continua sendo o
  canal de compromissos com horário.
- Outbox (`push_deliveries`) com retries (backoff, máx. 3 tentativas) e
  desativação automática em 404/410.
- Novo cron `/api/cron/push-tick` (5 em 5 minutos, plano Pro) — separado do
  `automation-tick` horário, que permanece inalterado.
- No iPhone/iPad, exige o app adicionado à Tela de Início (limitação do
  Safari/iOS); a UI nunca oferece um botão de ativação que não funcionaria
  nesse estado.
- Permissão nunca solicitada automaticamente — sempre por ação explícita em
  Configurações → "Notificações neste dispositivo".
- **Pendência real**: a migration `20260730120000_web_push.sql` foi criada
  no repositório mas **não foi aplicada** no Supabase remoto nesta entrega
  (ver relatório da tarefa). Até ser aplicada, as rotas de push falham de
  forma segura e compreensível — não derrubam Configurações nem o resto do
  painel.
- Fora do escopo desta fase: aplicativo nativo, push de terceiros (FCM),
  ações interativas na notificação (concluir/adiar), fila offline de
  alterações, badge numérico.
