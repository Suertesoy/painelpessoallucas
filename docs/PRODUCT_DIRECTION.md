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

1. Manhã: abrir **Hoje** → escolher até 3 focos → ver agendados e alertas.
2. Durante o dia: `Ctrl+Shift+Espaço` (ou botão Capturar / FAB no celular) para despejar qualquer coisa na **Entrada**, sem interromper o trabalho.
3. Pausas: processar a **Entrada** (definir tipo, projeto, próxima ação, agendar ou arquivar).
4. Fim do dia / semana: **Revisão** aponta prazos estourados, bloqueios, inbox estagnada e projetos sem marco.

## 4. Estrutura de navegação

`Hoje` (cockpit) · `Entrada` (inbox universal) · `Projetos` (lista + detalhe com tarefas/decisões/ideias/referências) · `Ideias e Insights` (base de conhecimento e decisões) · `Agenda` (agendado vs. prazo — conceitos distintos) · `Revisão` (higiene do sistema). Busca global (`Ctrl+K`) e captura rápida disponíveis em todo lugar.

## 5. Priorização de funcionalidades (candidatas da visão)

### Essencial agora (implementado nesta fase)
Caixa de entrada universal · captura com texto livre · foco do dia (máx. 3) · próxima ação por item · registro de decisões (tipo `decision`) · revisão determinística (prazos, bloqueados, inbox velha, projetos sem marco) · busca global · agenda separando agendamento de prazo.

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
- Realtime/colaboração multiusuário na fase pessoal.

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
