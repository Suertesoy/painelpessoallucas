# Roadmap — Painel Pessoal Lucas

Complemento de [`PRIORITIZED_RECOMMENDATIONS.md`](./PRIORITIZED_RECOMMENDATIONS.md).

---

## Premissas que moldam este roadmap

1. **O produto está em produção e é usado diariamente.** Nada pode quebrar.
2. **Lucas é o usuário principal e único.** Não há necessidade de generalidade nem de migração de terceiros.
3. **A implementação é assistida por IA.** Isso reduz o peso do esforço de codificação e aumenta o peso da **clareza de especificação** — o gargalo é decidir, não digitar.
4. **Não há grandes reescritas.** Toda fase estende a arquitetura existente.
5. **Cada fase entrega valor utilizável isoladamente.** Nenhuma fase é "preparação para a próxima".

---

## Fase 0 — Imediata

**Objetivo:** o que existe passa a ser confiável — e o que já foi corrigido passa a ser confirmado, não presumido.

Nada de funcionalidade nova. Esta fase existe porque construir sobre fundação não verificada é a forma mais cara de errar.

> **Correção de 25/07/2026.** A ordem e a natureza desta fase mudaram. O projeto já passou por correções importantes de sincronização, sessão, workspace e parsing dos timestamps do Supabase, e a hipótese de ausência de sincronização entre dispositivos já foi refutada por verificação no código (`ChangeNotifier` revalida ao ganhar foco — ver `MASTER_STRATEGIC_AUDIT.md` §0.2). A Fase 0 deixa de ser "diagnosticar um bug do zero" e passa a ser **homologar o que já existe**, na ordem abaixo.

### Entregas

| # | Entrega | Recomendação |
|---|---|---|
| 1 | Corrigir a transcrição antes da triagem de IA | P0-2 |
| 2 | Homologar o cron e as automações em produção | P0-3 |
| 3 | Criar o card permanente de saúde das automações em `/configuracoes` | P0-3 |
| 4 | Revalidar os fluxos desktop e mobile já corrigidos (captura texto/áudio, criação e edição nos dois dispositivos, revalidação ao voltar à aba) | P0-1 |
| 5 | Remover os diagnósticos temporários — **depois** da homologação do item 4 | P0-1 |
| 6 | Capturar screenshots das telas internas atuais (desktop e mobile) — baseline para qualquer recomendação visual | — |

### Dependências
Acesso a dispositivos iOS e Android reais; painel da Vercel; Supabase; sessão autenticada real para as capturas de tela do item 6.

### Critérios de sucesso
- Uma transcrição com erro pode ser corrigida antes da análise de IA
- É possível responder, com evidência: "o cron rodou hoje, quantas vezes, com que resultado?"
- `/configuracoes` mostra o estado real das automações em vez de diagnóstico técnico
- Um item capturado no celular (texto ou áudio) aparece no desktop ao focar a janela, sem recarregar, e vice-versa — confirmado, não presumido
- `/configuracoes` não expõe nenhum texto em `snake_case`
- Existem screenshots reais de `/hoje`, `/entrada`, `/projetos`, `/agenda`, `/planos` e `/revisao` em desktop e mobile, salvos como referência

### Riscos
- Se o roteiro de homologação do item 4 encontrar um caso real e reproduzível de não sincronização, escalar para diagnóstico de causa raiz (cookie de sessão, workspace não resolvido a tempo) e só então considerar mudanças em cookies, autenticação, RLS ou Realtime — nesta ordem, e só se necessário. Nenhuma dessas mudanças é a recomendação padrão desta fase. Ver `IMPLEMENTATION_BRIEFS.md` BRIEF P0-1.

### O que NÃO fazer nesta fase
- Não começar time tracking
- Não mexer em design system
- Não remover scaffolding vazio — irrelevante agora, e diluiria o foco
- Não remover os diagnósticos antes de concluir a homologação do item 4
- Não alterar cookies, RLS, autenticação, implementar Supabase Realtime ou reestruturar o workspace por padrão — só como hipótese condicional se a homologação revelar um problema real

---

## Fase 1 — Próximas duas semanas

**Objetivo:** o sistema passa a saber o que Lucas está fazendo agora.

Esta é a fase mais importante do roadmap. É a que introduz o primitivo ausente. **É deliberadamente incremental:** cria o domínio de tempo e adiciona uma única zona nova à tela Hoje, sem reescrever o resto da tela.

> **Correção de 25/07/2026.** A entrega "Zona Depois com linha do tempo unificada" foi removida desta fase e adiada para a Fase 2. Combinar a criação do domínio de tempo com a reconstrução completa da tela Hoje no mesmo ciclo de duas semanas era arriscado demais para mudar de uma vez — e irreversível se desse errado. A Fase 1 agora entrega só a zona Agora, mantendo as seções atuais de Hoje intactas, com um período mínimo de uso real antes de qualquer reorganização adicional.

### Entregas

| # | Entrega | Recomendação |
|---|---|---|
| 1 | Duração estimada opcional nos itens | P1-1 |
| 2 | Domínio de sessão de trabalho (tabela `work_sessions`) | P1-1 |
| 3 | Regra de uma única sessão ativa por vez | P1-1 |
| 4 | Iniciar, pausar, retomar e encerrar sessão | P1-1 |
| 5 | Registro retroativo simples (trabalho já feito, sem cronômetro) | P1-1 |
| 6 | Nota opcional de retomada (o que ficou pendente ao pausar/interromper) | P1-1 |
| 7 | Zona **Agora** adicionada à tela Hoje | P1-2 |
| 8 | Manter temporariamente as seções atuais de Hoje (Foco, Próximas Ações, Agendado, Aguardando, Atenção Necessária, Pulso dos Projetos) — nada é removido nesta fase | P1-2 |
| 9 | Usar por aproximadamente uma semana antes de qualquer mudança adicional na tela | — |
| 10 | Captura mobile de um gesto | P1-6 |

**Só depois** da entrega 9 — e não antes — entra a reorganização do restante da tela Hoje (zonas Depois e Atenção), que passa a ser trabalho da Fase 2.

### Dependências
- Fase 0 concluída (mobile homologado e cron confiável antes de introduzir um recurso que depende dos dois)
- Verificação da granularidade do `ChangeNotifier` antes da entrega 2

### Critérios de sucesso
- A pergunta "o que estou fazendo e há quanto tempo" é respondida sem rolar a tela, pela zona Agora
- Iniciar uma sessão custa um clique a partir de Hoje
- Registrar trabalho já feito é tão fácil quanto iniciar o cronômetro
- Nunca existe mais de uma sessão ativa ao mesmo tempo
- No celular, pressionar o FAB e falar é um único gesto
- As seções atuais de Hoje continuam funcionando exatamente como antes, ao lado da zona Agora
- **Métrica de adoção na semana 1:** pelo menos 50% dos dias úteis com uma sessão registrada. Abaixo disso, o problema é atrito e o fluxo deve ser simplificado antes de reorganizar o resto da tela

### Riscos
- **Principal:** abandono por atrito. Mitigação: medir adoção já na primeira semana e tratar número baixo como defeito de produto, não de disciplina
- Sessões esquecidas gerando dados absurdos. Mitigação: confirmação obrigatória para sessões > 4h desde o primeiro dia
- Reorganizar o resto de Hoje antes de validar a zona Agora em uso real. Mitigação: a entrega 9 é um portão explícito, não uma sugestão

### O que NÃO fazer nesta fase
- Não construir a zona Depois nem a zona Atenção — ficam para a Fase 2, depois de ~1 semana de uso da zona Agora
- Não remover nem reorganizar as seções atuais de Hoje
- Não construir estatísticas de estimativa — não há dados
- Não tocar em cores ou componentes
- Não construir fila de retorno de interrupções — não se sabe ainda quantas acontecem
- Não construir agregação "onde gastei meu tempo" — dados ainda incompletos

---

## Fase 2 — Próximo mês

**Objetivo:** o sistema passa a saber quanto tempo Lucas realmente tem, e começa a falar. É também quando o restante da tela Hoje é reorganizado — depois, não junto, da introdução da zona Agora na Fase 1.

### Entregas

| # | Entrega | Recomendação |
|---|---|---|
| 1 | Zona **Depois** com linha do tempo unificada (movida da Fase 1 — ver correção de 25/07/2026 em §Fase 1) | P1-2 |
| 2 | Campo `area` em itens e projetos | P1-5 |
| 3 | Alternador de contexto global (Tudo / Trabalho / Pessoal) | P1-5 |
| 4 | Capacidade habitual configurável (jornada, horas disponíveis, margem, ajuste do dia) | P1-3 |
| 5 | Cálculo de capacidade real com margem para imprevistos | P1-3 |
| 6 | Motor de regras com as 8 regras iniciais | P1-4 |
| 7 | Zona **Atenção** na tela Hoje | P1-2 / P1-4 |
| 8 | Notificações in-app com deduplicação | P1-4 |
| 9 | Auditoria de transcrição e módulo de custo de IA | P2-9 |
| 10 | Áreas de toque e anel de foco corrigidos | P2-1 parcial |

### Dependências
- Fase 1 concluída, incluindo a semana de uso da zona Agora antes de iniciar a entrega 1 (zona Depois)
- Capacidade comprometida (entregas 4–5) precisa das estimativas da Fase 1
- P0-3 concluído (as notificações rodam sobre o cron)

> **Nota (correção de 25/07/2026):** a decisão de produto sobre ampliar o escopo do Google Calendar **não existe mais como dependência**. O modelo de capacidade corrigido mantém `calendar.freebusy` — ver `TIME_CAPACITY_AND_INTERRUPTION_SYSTEM.md` §4.4.

### Critérios de sucesso
- "Você tem X horas livres hoje" é verdade quando verificado manualmente
- A zona Atenção está **vazia** na maioria dos dias
- É possível alternar entre visão de trabalho e pessoal em um clique
- Nenhuma notificação repetida sem mudança de estado
- Nenhum alvo tocável abaixo de 44px
- Custo semanal de IA é consultável

### Riscos
- Regras mal calibradas gerando ruído. Mitigação: começar com limiares conservadores e afrouxar; auto-desativação após 3 dispensas desde o dia 1
- Configuração de capacidade virar manutenção. Mitigação: quatro números, uma vez. Almoço, academia e deslocamentos **não** são cadastrados — já estão embutidos nas horas disponíveis
- Enum de área mal escolhido. Mitigação: poucas e genéricas; nulo permitido

### O que NÃO fazer nesta fase
- Não usar LLM em nenhuma recomendação — todas determinísticas
- Não construir Web Push — depende de PWA
- Não unificar rotas ainda — muita mudança simultânea
- Não construir planejamento semanal — poucos dados

---

## Fase 3 — Próximos três meses

**Objetivo:** o sistema fica calmo, confiável no bolso, e começa a ter opinião fundamentada.

### Entregas

| # | Entrega | Recomendação |
|---|---|---|
| 1 | Componentes base e redução de paleta | P2-1 |
| 2 | Componente de modal compartilhado | P2-11 |
| 3 | Glossário aplicado e tradução de erros técnicos | P2-1 |
| 4 | PWA (manifest, service worker, ícones, fila offline) | P2-2 |
| 5 | Web Push para os três tipos urgentes | P2-2 |
| 6 | Camada 3 de IA — recomendação diária redigida | P2-3 |
| 7 | Dependências de terceiros e follow-up | P2-6 |
| 8 | Rotinas recorrentes fora do módulo Planos | P2-8 |
| 9 | Unificação de Entrada, Ideias e Revisão | P2-4 |
| 10 | Revisão semanal com "onde gastei meu tempo" | P1-1 completo |
| 11 | Lista de compras | P2-10 |
| 12 | Controle granular de sync com Calendar | P2-12 |

### Dependências
- Fase 2 concluída
- Entrega 6 exige **3–4 semanas de motor de regras rodando** — só construir a camada de LLM depois de saber o que as regras não conseguem dizer
- Entrega 10 exige dados de sessão confiáveis (registro retroativo em uso)

### Critérios de sucesso
- Uma captura de tela de Hoje em dia movimentado tem no máximo duas cores além do neutro
- O painel abre da tela inicial do celular sem barra do navegador
- Uma notificação de compromisso chega com o painel fechado
- A recomendação diária de IA custa menos de uma chamada por dia
- Lucas para de usar outro aplicativo para lista de compras
- A revisão semanal é lida em menos de um minuto

### Riscos
- Design system consumir tempo desproporcional. Mitigação: nove componentes, não um sistema completo
- Web Push em iOS não funcionar como esperado. Mitigação: verificar o comportamento atual do Safari antes de investir
- LLM redigindo com floreio o que a regra já dizia melhor. Mitigação: comparar as duas saídas por duas semanas antes de substituir

### O que NÃO fazer nesta fase
- Não construir memória de projeto completa (P2-5) — alto esforço; entrar só depois de a base estar calma
- Não construir estatísticas de estimativa sem 6 semanas de dados
- Não construir tema escuro
- Não construir finanças, MCP ou agentes

---

## Fase 4 — Longo prazo

**Objetivo:** o sistema aprende, e a vida inteira cabe dentro dele.

Sem prazo. Cada item tem uma condição de entrada que deve ser satisfeita antes de entrar em consideração.

| Entrega | Condição de entrada |
|---|---|
| Estimativas aprendidas (P2-7) | ≥6 semanas de sessões, ≥5 amostras por tipo de trabalho |
| Memória de projeto e preparação de reunião (P2-5) | Grupo Almeida ativo e gerando volume de registros suficiente para justificar |
| Planejamento semanal explícito (P3-1) | ≥6 semanas de dados de capacidade |
| Horas, contratos e rentabilidade (P3-3) | Histórico confiável + ≥2 projetos com valor contratado |
| Pipeline de candidaturas (P3-4) | Testar antes com projeto + área `carreira` + itens. Só construir se a solução barata falhar |
| Organização financeira (P3-2) | Núcleo de tempo estável e em uso há ≥3 meses |
| Modo foco (P3-5) | P1-1 e P1-2 em uso consolidado |
| Tema escuro (P3-7) | P2-1 concluído |
| Widget e atalhos nativos (P3-6) | PWA em uso e comprovadamente insuficiente |

**Regra desta fase:** nada entra sem a condição satisfeita. Se, ao chegar aqui, algum item parecer urgente, a pergunta certa é "que dado mudou desde a auditoria?" — não "por que não construímos isso antes?".

---

## Visão consolidada

| Fase | Prazo | Objetivo | Entregas |
|---|---|---|---|
| **0** | Imediata | O que existe é confiável e confirmado | 6 |
| **1** | 2 semanas | O sistema sabe o que estou fazendo (incremental, sem redesenhar Hoje) | 10 |
| **2** | 1 mês | O sistema sabe quanto tempo tenho, fala, e o resto de Hoje é reorganizado | 10 |
| **3** | 3 meses | O sistema fica calmo e confiável no bolso | 12 |
| **4** | Longo prazo | O sistema aprende | Condicional |

---

## Por que esta ordem e não outra

**Por que confiabilidade antes de funcionalidade.** Construir sobre algo não homologado significa que cada bug novo terá duas causas possíveis. Fase 0 elimina essa variável — confirmando, não redescobrindo, o que já foi corrigido.

**Por que a zona Agora sozinha antes do resto de Hoje.** Introduzir o domínio de tempo e reconstruir a tela inteira no mesmo ciclo é uma mudança grande demais para reverter se o modelo de sessão não for o certo. Validar a zona Agora por ~1 semana de uso real antes de tocar no resto da tela reduz o risco de um redesenho irreversível baseado em suposição.

**Por que tempo antes de IA.** Uma IA que recomenda prioridades sem saber quanto tempo as coisas levam nem quanto tempo resta vai errar de forma convincente. Lucas seguirá a recomendação, ela falhará, e a confiança no sistema inteiro cai. É pior que não ter IA.

**Por que regras antes de LLM.** Seis das oito recomendações que Lucas quer são queries SQL. Construir LLM primeiro seria pagar por inferência para responder perguntas que o banco responde de graça, melhor e mais rápido.

**Por que áreas antes de unificação de telas.** As visões salvas que substituem `/ideias` ficam muito melhores com área como filtro. Unificar antes exigiria refazer depois.

**Por que design system depois de Hoje.** Extrair componentes antes de saber a forma final da tela principal produz componentes com a forma errada.

**Por que PWA na fase 3 e não antes.** PWA sem notificações é só um ícone. Notificações exigem o motor de regras (fase 2), que exige capacidade (fase 2), que exige tempo (fase 1).

---

## Como saber que uma fase pode ser encerrada

Cada fase tem uma pergunta de encerramento. Se a resposta for não, a fase não acabou — independentemente do que foi entregue.

| Fase | Pergunta de encerramento |
|---|---|
| **0** | Homologuei (não presumi) que o que capturo no celular chega ao desktop, que as automações rodam, e tenho screenshots reais das telas internas? |
| **1** | Consigo responder "o que estou fazendo e há quanto tempo" sem pensar? Estou registrando na maioria dos dias, com as seções atuais de Hoje ainda intactas ao lado da zona Agora? |
| **2** | Quando o painel diz que tenho 2h livres, isso é verdade? A zona Atenção fica vazia na maioria dos dias? |
| **3** | O painel me diz algo útil que eu não teria percebido sozinho? Uso ele no celular sem atrito? |
| **4** | O sistema sabe algo sobre como eu trabalho que eu mesmo não sabia? |
