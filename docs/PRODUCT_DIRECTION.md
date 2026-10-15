# Direção de Produto — Painel Pessoal Lucas

## 1. Problema do usuário

Lucas (Product Designer / Design Engineer) não sofre de falta de ferramentas — sofre de **custo de organização no momento da captura**. Notion, caderno, lembretes e agenda exigem decidir *onde* e *como* registrar antes de registrar. Consequências: ideias perdidas durante o trabalho, prioridades atropeladas por demandas inesperadas, decisões esquecidas, informação espalhada (IA, docs, repositórios, Vercel, Figma, Drive, e-mail) e dificuldade de enxergar a próxima ação concreta de cada projeto.

## 2. Princípios do produto

1. **Capturar primeiro, organizar depois.** Registrar algo nunca pode exigir classificação prévia.
2. **Cockpit, não arquivo.** A tela padrão responde "o que devo fazer agora?", não "onde guardei aquilo?".
3. **Próxima ação explícita.** Projeto ativo sem próximo passo é um defeito que o sistema aponta (Revisão).
4. **Confiabilidade acima de recursos.** Nada de features que corrompem a confiança nos dados.
5. **Fatos ≠ hipóteses ≠ sugestões de IA.** Quando a IA entrar, ela sugere; não altera dados silenciosamente.
6. **Crescer por fases verificáveis**, sem abstração especulativa.

## 3. Fluxo diário pretendido

1. Manhã: abrir **Hoje** e ver imediatamente o bloco de rotina atual e as
   tarefas associadas — não mais "escolher até 3 focos" (esse passo saiu da
   experiência: virou mais uma tarefa de organização em vez de ajudar a
   começar a trabalhar; ver `docs/ROADMAP.md` Fase 12).
2. Durante o dia: `Ctrl+Shift+Espaço` (ou botão Capturar / FAB no celular) para despejar qualquer coisa na **Entrada**, sem interromper o trabalho.
3. Pausas: processar a **Entrada** (definir tipo, projeto, próxima ação, agendar ou arquivar).
4. Fim do dia / semana: **Revisão** aponta prazos estourados, bloqueios, inbox estagnada e projetos sem marco.

## 4. Estrutura de navegação

`Hoje` (cockpit) · `Entrada` (capturas e revisão) · `Projetos` (lista + detalhe) · `Notas` (informações, ideias, referências e decisões) · `Agenda` (agendado vs. prazo — conceitos distintos) · `Revisão` (higiene do sistema). Busca global (`Ctrl+K`) e captura livre disponíveis em todo lugar.

## 5. Priorização de funcionalidades (candidatas da visão)

### Essencial agora (implementado)
Caixa de entrada universal · captura livre por texto/áudio · triagem com confirmação humana · sincronização instantânea entre dispositivos · Home de execução por blocos de rotina (substituiu o foco do dia) · próxima ação por item · notas e decisões · revisão determinística · busca global · agenda separando agendamento de prazo.

### Próxima fase (Fase 1.5 — ainda local)
- Área **"Aguardando"** (itens esperando terceiros, com "quem" e "desde quando") — dor direta do Grupo Almeida (respostas da Priscila etc.).
- **Bloqueios com motivo** registrado.
- **Estimativa de duração** por tarefa + soma da capacidade do dia.
- **Preparação e notas de reunião** (tipo de item ou seção do projeto).
- **Exportação/backup manual em JSON** (mitiga risco do localStorage).
- Detalhe/edição completa de item (modal ou página).
- **Relação simples entre itens** (ideia → tarefa preservando origem).

### Futuro (dependem de Supabase/IA — Fases 2+)
Captura por áudio · anexos (imagem/PDF/link) · triagem por IA · replanejamento assistido e impacto de demanda nova · linha do tempo e marcos por projeto · riscos e stakeholders estruturados · controle de versões de documentos/propostas · comparação de cenários (trilhas A/B, cronograma de 16 semanas) · pipelines leves (leads, vagas) · bugs/incidentes/deploys/commits · versões de prompts de agentes · calendário de marketing e banco de criativos · métricas de campanhas · logbook e relatórios diário/semanal · busca semântica · perguntas ao próprio contexto · automações baseadas em eventos.

### Desnecessária (nesta visão de produto)
- Chat genérico com IA (a primeira função de IA é triagem de captura, não conversa).
- Transformar o painel num CRM completo (pipelines devem ser visões leves).
- Colaboração multiusuário na fase pessoal.

### Precisa de validação com uso real
- Capacidade do dia (pode virar burocracia se exigir estimativa em tudo).
- Histórico de commits/deploys dentro do painel (pode ser melhor como link para GitHub/Vercel).
- Calendário de marketing dentro do painel vs. ferramenta dedicada.

## 6. Recomendações por tipo de projeto

### Grupo Almeida (comercial/operacional, alto valor)
O painel deve servir como **memória de negociação**: decisões com data (ex.: R$ 40.000 implantação, R$ 2.900/mês × 12), versões de proposta como referências, perguntas abertas como itens "aguardando", preparação de reunião com checklist do que precisa estar pronto, e comparação de trilhas de implementação (16 semanas; começar por Almeida Equipamentos ou piloto Financeiro/Fiscal) como cenários lado a lado. Regra de ouro: separar **fato confirmado** (decisão registrada) de **hipótese** e de **sugestão de IA**. Fase 1 já cobre: decisões, pendências, próximas ações, foco. Fase 1.5 adiciona "Aguardando" e notas de reunião. Cenários comparáveis ficam para quando houver persistência remota.

### Sartec (CRM/agente em produção)
Usa forte o ciclo bug → correção → deploy → validação. No curto prazo: tarefas com prioridade crítica + decisões de regra de negócio registradas em Ideias/Decisões. Futuro: incidentes, histórico de deploys e versões de prompts (Fase de integrações).

### Marketing Sartec
Fase 1: campanhas como projeto, criativos como ideias, hipóteses como decisões/hipóteses. Calendário e métricas ficam para fases futuras.

### Portfólio/carreira e UNIEDU
Pipeline leve de vagas é visão derivada (futuro). Hoje: projeto próprio para não misturar com trabalho comercial; insights de portfólio capturados com tipo `insight` e projeto associado.

### Sartec Digital / prospecção
Leads como visão leve derivada (futuro). Hoje: cada lead relevante pode ser item com próxima tentativa agendada.

## 7. Critérios de sucesso

1. Capturar um pensamento leva **menos de 10 segundos** a partir de qualquer tela (desktop e celular).
2. A pergunta "o que devo fazer agora?" é respondida pela tela Hoje **sem rolagem** no desktop.
3. Nenhum projeto ativo permanece sem próxima ação/marco por mais de uma revisão semanal.
4. Decisões antigas são reencontráveis em **menos de 30 segundos** (busca ou filtro de decisões).
5. Refresh, navegação direta por URL e reabertura do navegador **nunca** perdem dados registrados.
6. O repositório passa `lint`, `typecheck`, `test` e `build` a cada push — sem exceções mascaradas.

## 8. Redirecionamento: central doméstica (Lucas e Matheus)

O produto passou de organizador pessoal para **central doméstica compartilhada**. Vale esta seção quando conflitar com o texto acima.

- **Navegação:** Nossa casa (`/`), Compras, Finanças, Notas; Configurações à parte. Hoje, Entrada, Projetos, Planos, Agenda, Aprendizado e Revisão continuam existindo **por URL**, com dados e código preservados, mas fora da navegação. `/ideias` redireciona para `/notas`.
- **Divulgação progressiva:** resumo primeiro, composição um toque abaixo (Finanças); gastos em rosca → lojas → lançamentos; listas completas recolhidas.
- **Finanças:** "Sobra depois do combinado" considera só obrigações já conhecidas; a composição separa o resultado do mês (entrou − saiu) do acumulado ao fim do mês. Estimativa de cartão é opcional, separada e exige histórico (3 faturas de meses anteriores por cartão).
- **Categorias:** ids persistidos em `finance_invoice_items.category` não mudam; a apresentação doméstica usa o mapeamento de leitura `DISPLAY_OF` (`spending-groups.ts`). Nada é migrado ou sobrescrito.
- **Compartilhamento (adiado):** convite por e-mail + `profiles.default_workspace_id` estão prontos na branch local `feat/compartilhamento-convite` (migration `20260817100000_workspace_invites.sql`), **não publicados** até a migration ser validada em ambiente isolado. Enquanto isso, nada de convite aparece na interface.
- **Google Calendar/Gmail:** desativação reversível com `GOOGLE_INTEGRATIONS_DISABLED=true` (rotas respondem 410; cron não sincroniza nem envia resumos). Tokens e dados não são tocados.

### Pendências técnicas registradas (fora desta rodada)
- `automation_runs` cresce sem retenção (~330 mil linhas; os jobs `push_*` gravam várias linhas a cada 5 minutos). Definir política de retenção/limpeza.
- Rotas e telas de Projetos/Planos/Rotina/Agenda/Aprendizado seguem no código (ocultas). Remover só com auditoria de dependências (triagem, captura e roteador de rotina ainda referenciam `projects` e `plan_actions`).
- Revogação/remoção de tokens Google: decisão futura, após desativar por flag.
