# O Que Não Construir Agora

Complemento de [`PRIORITIZED_RECOMMENDATIONS.md`](./PRIORITIZED_RECOMMENDATIONS.md).

Este documento existe porque a decisão mais difícil em um produto de usuário único é o que **não** fazer. Sem foco, um sistema pessoal vira um museu de funcionalidades pela metade — e um sistema pela metade é abandonado.

Três categorias:

- **DESCARTAR** — não deve ser construído; remover o que existe
- **ADIAR** — legítimo, mas com condição de entrada que ainda não foi satisfeita
- **SIMPLIFICAR** — o desejo é válido; a solução imaginada é grande demais

---

# DESCARTAR

## 0. Modelagem de rotinas que já funcionam

> **Adicionado em 24/07/2026, corrigindo uma recomendação errada da primeira versão desta auditoria.**

**O que não construir:** almoço, academia, pausas, deslocamentos e tempo pessoal rotineiro como itens, tarefas, recorrências, hábitos, lembretes ou qualquer coisa concluível dentro do painel.

**Por que a primeira versão errou.** Eu recomendei cadastrá-los como blocos recorrentes via `recurrence_rules` para alimentar o cálculo de capacidade. Tecnicamente funcionava. Como produto, era ruim: criava manutenção, ruído em listas, obrigação de conclusão e presença permanente na tela Hoje — tudo isso para comportamentos que **nunca foram problema**. Lucas almoça sem lembrete.

Foi um caso clássico de otimizar o modelo de dados às custas da experiência: a capacidade ficaria mais precisa, e o painel ficaria pior.

**O que fazer em vez disso.** Esses períodos entram apenas como **redução aproximada da disponibilidade diária** — um número único de horas realmente disponíveis, configurado uma vez. Ver `TIME_CAPACITY_AND_INTERRUPTION_SYSTEM.md` §4.

**A regra geral que isso estabelece, e que vale para toda funcionalidade futura:**

> **O painel ajuda no que pode ser esquecido, subestimado, abandonado, atrasado ou mal priorizado. Não no que já funciona.**

Antes de modelar qualquer coisa, a pergunta é: *isso é algo que eu posso esquecer ou errar?* Se a resposta for não, não construa.

**A fronteira não é pessoal vs. profissional.** Uma consulta médica é pessoal, pontual e esquecível — item legítimo. A academia de terça é pessoal, rotineira e não esquecível — não é. A distinção é **rotina estável vs. compromisso esquecível**.

**Reconsiderar quando:** nunca, para rotinas estáveis. Se uma rotina passar a ser esquecida com frequência, ela deixou de ser estável — e aí entra pela porta normal, como qualquer outra obrigação.

---

## 1. MCP (Model Context Protocol)

**Estado atual:** `MCPRegistry` existe como contrato sem nenhuma implementação `[DOSSIÊ]`.

**Por que descartar.** O briefing menciona MCP na lista de possibilidades da seção 24, mas não descreve nenhum caso de uso concreto. MCP resolve o problema de expor ferramentas a agentes externos — e Lucas não descreveu querer que agentes externos operem o painel. Ele descreveu querer que **o painel** o ajude a decidir.

Um contrato sem implementação e sem caso de uso é ruído no repositório. E, neste contexto específico, tem um custo real: agentes de IA que leem o código para implementar mudanças encontram a interface e podem tentar usá-la.

**Ação:** remover `src/platform/mcp/mcp.registry.ts`.

**Quando reconsiderar:** se surgir a necessidade concreta de operar o painel a partir do Claude Code ou de outro agente. Aí o desenho parte do caso de uso real, não de um contrato antecipado.

---

## 2. Adaptador genérico de integrações e webhooks

**Estado atual:** `IntegrationAdapter` existe como contrato sem implementação `[DOSSIÊ]`.

**Por que descartar.** As duas integrações reais — Calendar e Gmail — são específicas, têm autenticação própria e formas próprias de erro. Uma abstração genérica que nunca teve duas implementações concorrentes é uma abstração adivinhada.

Regra geral: extrair abstração a partir de duas ou três implementações reais funciona; antecipá-la raramente. `AIProvider` é a evidência disso no próprio repositório — foi desenhado antes de existirem três operações de IA, e as três divergiram do contrato `[DOSSIÊ]`.

**Ação:** remover `src/platform/integrations/integration.adapter.ts`.

---

## 3. Leitura da caixa de entrada do Gmail

**Estado atual:** escopo `gmail.send` apenas `[DOSSIÊ]`.

**Por que descartar.** O briefing menciona "leitura de e-mails" na seção 24. Mas ler a caixa de entrada exige o escopo `gmail.readonly`, que é dos mais sensíveis do Google, e traria para dentro do sistema um volume de informação de terceiros que Lucas não controla.

Mais importante: **o problema que isso resolveria já tem solução melhor.** Se o objetivo é capturar demandas que chegam por e-mail, encaminhar o e-mail para um endereço de captura ou copiar o trecho relevante é mais preciso, mais barato e não requer ampliação de escopo. Ler a caixa inteira significa processar 95% de ruído para encontrar 5% de sinal — e pagar IA por isso.

**Ação:** manter `gmail.send`. Não ampliar.

**Quando reconsiderar:** se Lucas identificar que perde demandas específicas que chegam por e-mail e nenhuma alternativa manual funcionar. E, mesmo então, o desenho correto seria um rótulo específico do Gmail, não a caixa inteira.

---

## 4. Agentes autônomos que executam ações

**Por que descartar.** O briefing é inequívoco na seção 8: a IA nunca deve apagar informações silenciosamente, criar eventos sem confirmação, enviar e-mails sem autorização, concluir tarefas por conta própria ou alterar prioridades sem consentimento.

Isso não é uma restrição temporária a ser relaxada quando o sistema amadurecer. É o que torna o painel confiável. Um sistema que age sozinho exige verificação constante — e verificação constante é exatamente a carga mental que o produto promete eliminar.

O produto já implementa isso corretamente: propostas com aprovação por ação individual `[CÓDIGO]`.

**Ação:** manter o princípio. Nenhuma exceção, incluindo para ações "seguras".

---

## 5. Suíte completa de testes E2E de interface

**Por que descartar.** O dossiê registra a ausência de E2E como lacuna `[DOSSIÊ]`. Discordo da priorização.

Para um produto de usuário único que Lucas usa todo dia, **ele é o teste E2E**. Uma suíte de Playwright cobrindo fluxos de interface seria cara de escrever, frágil a cada mudança de layout, e detectaria problemas mais tarde do que Lucas detectaria sozinho.

O que falta não é cobertura de teste — é **verificação de que a infraestrutura real funciona**. Um teste de fumaça cobrindo quatro caminhos críticos (auth+workspace, escrita de item, tick do cron, chamada ao Calendar) contra produção vale mais que cem testes E2E de UI, e custa uma fração.

**Ação:** construir o teste de fumaça (P0-1, P0-3). Não construir suíte E2E de interface.

---

## 6. Multi-usuário e colaboração

**Estado atual:** a arquitetura já suporta via `workspace_members` e RLS `[CÓDIGO]`.

**Por que descartar como objetivo.** A infraestrutura existir é ótimo e não custa nada manter. Mas construir funcionalidade de colaboração — convites, papéis, permissões granulares, atribuição, comentários — seria construir um produto diferente.

O briefing é explícito: *"Não crie um produto genérico para milhares de usuários. O usuário principal sou eu."*

**Ação:** manter a infraestrutura, não construir funcionalidade em cima dela.

---

## 7. Outbox transacional

**Estado atual:** diretório vazio, mencionado em `ARCHITECTURE.md` `[DOSSIÊ]`.

**Por que descartar.** Outbox resolve garantia de entrega de eventos em sistemas distribuídos com múltiplos consumidores. Aqui há um consumidor (o próprio banco, para auditoria) e um usuário. A complexidade não tem contrapartida.

**Ação:** remover o diretório vazio e a menção na documentação de arquitetura.

---

## 8. Dashboard de métricas do produto

**Por que descartar.** O briefing lista 17 métricas possíveis na seção 28 e pede explicitamente para não transformar o produto em um dashboard de métricas desnecessárias.

Concordo, e vou além: **a maioria das métricas úteis não deve ser mostrada a Lucas.** Elas devem alimentar decisões automáticas do sistema.

Exemplo: "notificações ignoradas" não deveria ser um número que Lucas consulta e interpreta. Deveria desativar a regra automaticamente após três dispensas `[ver AI_AND_AUTOMATION_STRATEGY.md §4.3]`. A métrica vira controle, não relatório.

Seis métricas selecionadas em `MASTER_STRATEGIC_AUDIT.md` §13, e nenhuma delas precisa de tela própria.

**Ação:** nenhum dashboard. Métricas aparecem na revisão semanal ou operam invisivelmente.

---

## 9. Contagem de interrupções como métrica exibida

**Por que descartar.** Está na seção 28 do briefing, mas tem risco alto e retorno baixo.

Um número de interrupções por dia não é acionável — Lucas não controla quando alguém o interrompe. Mostrá-lo produz culpa por algo fora do controle dele, e o briefing pede explicitamente um sistema não invasivo, que não reforce autocrítica.

O que **é** acionável e deve ser registrado: qual atividade foi interrompida e quanto tempo levou para retomar. Isso alimenta a decisão de proteger blocos de trabalho profundo. Mas isso é insumo, não placar.

**Ação:** registrar interrupções como dado. Nunca exibir como contagem.

---

## 10. Gamificação, sequências e hábitos com streaks

**Por que descartar.** O briefing menciona "hábitos" na seção 24. A implementação convencional — sequências de dias, medalhas, percentual de conclusão — é ativamente prejudicial a alguém que já relata dificuldade com carga mental.

Uma sequência de 40 dias cria pressão para não quebrar a sequência, não para fazer a coisa. E quando quebra, o efeito é desproporcional ao evento real.

O que Lucas descreve querer é diferente: lembrar da academia, registrar consultas, manter rotinas. Isso é **recorrência**, e o motor determinístico já existe `[CÓDIGO]`.

**Ação:** rotinas via `recurrence_rules` (P2-8). Sem sequências, sem medalhas, sem percentual de aderência.

---

# ADIAR

## 11. Estimativas aprendidas com histórico

**Condição de entrada:** 6 semanas de sessões registradas e no mínimo 5 amostras por tipo de trabalho.

**Por que adiar.** Com poucas amostras, qualquer "aprendizado" é ruído apresentado como certeza. E uma sugestão errada apresentada com confiança é pior que nenhuma sugestão — mina a confiança em todo o módulo de tempo.

As cinco regras de proteção estão em `TIME_CAPACITY_AND_INTERRUPTION_SYSTEM.md` §4.5.

---

## 12. Planejamento semanal explícito

**Condição de entrada:** 6 semanas de dados de capacidade real.

**Por que adiar.** Planejar a semana requer saber quanto cabe em uma semana. Sem histórico, o planejamento semanal é um exercício de otimismo — e otimismo estruturado gera frustração estruturada.

A versão barata (carga por dia na Agenda) entra em P1-3 e provavelmente resolve 70% da necessidade.

---

## 13. Memória de projeto e preparação de reunião

**Condição de entrada:** núcleo de tempo estável e Grupo Almeida gerando volume de registros que justifique.

**Por que adiar.** É a funcionalidade mais valiosa de P2 para o caso Grupo Almeida especificamente. Mas é de alto esforço e depende de áreas (P1-5), de follow-up (P2-6) e de haver conteúdo registrado.

Construir a estrutura antes de haver o que guardar produz uma tela vazia sofisticada.

**Versão barata a testar antes:** um item do tipo nota por reunião, vinculado ao projeto, com um resumo escrito por Lucas. Se isso funcionar, a versão elaborada talvez nunca seja necessária.

---

## 14. Organização financeira

**Condição de entrada:** núcleo de tempo estável e em uso há pelo menos 3 meses.

**Por que adiar.** Finanças é um domínio inteiro: contas, categorias, recorrências, conciliação, relatórios. É um segundo produto dentro do produto.

Risco concreto: começar finanças enquanto o núcleo de tempo ainda não está consolidado significa terminar com dois módulos pela metade em vez de um completo.

---

## 15. Horas, contratos e rentabilidade

**Condição de entrada:** histórico de sessões confiável e pelo menos dois projetos com valor contratado.

**Por que adiar.** Depende inteiramente de P1-1 com dados de qualidade. Calcular rentabilidade sobre registro incompleto produz números errados sobre dinheiro — que é a pior categoria de número errado, porque leva a decisões comerciais ruins.

---

## 16. Tema escuro

**Condição de entrada:** P2-1 concluído.

**Por que adiar.** Sem tokens consolidados, tema escuro é trabalho em dezenas de arquivos com cores literais espalhadas `[DOSSIÊ]`. Com tokens, é barato.

Fazer na ordem errada custa várias vezes mais e cria dívida imediata.

---

## 17. Widget iOS e Atalhos nativos

**Condição de entrada:** PWA em uso e comprovadamente insuficiente.

**Por que adiar.** Alto valor potencial para captura instantânea, mas exige aplicativo nativo ou integração com Atalhos via API — um esforço desproporcional.

A pressão longa no FAB (P1-6) somada ao PWA (P2-2) provavelmente resolve o mesmo problema por uma fração do custo. Verificar isso antes de investir.

---

## 18. Busca semântica e embeddings

**Condição de entrada:** falha demonstrável da busca textual.

**Por que adiar.** `AIProvider` declara `semanticSearch`, nunca implementado `[DOSSIÊ]`. A busca por texto já funciona com debounce e varre itens e projetos `[CÓDIGO]`.

Busca semântica exige embeddings, armazenamento vetorial, reindexação a cada escrita e custo recorrente — para um acervo de alguns milhares de itens onde a busca textual é adequada.

**Antes de considerar:** melhorar a busca textual (sinônimos simples, tolerância a acentuação, busca em próxima ação e notas). Muito mais barato.

---

## 19. Integração com contatos e documentos

**Condição de entrada:** caso de uso concreto e recorrente.

**Por que adiar.** Mencionadas na seção 24 do briefing sem caso de uso descrito. Integração sem problema definido é solução à procura de problema.

---

## 20. Integração com GitHub

**Condição de entrada:** identificar o que especificamente traria valor.

**Por que adiar.** Lucas usa Claude Code e desenvolvimento assistido por IA, mas o briefing não descreve o painel precisando saber sobre commits ou pull requests. O painel gerencia **decisões e tempo**, não código.

---

# SIMPLIFICAR

## 21. Pipeline de candidaturas

**Desejo:** encontrar vagas, analisar aderência, adaptar currículo, produzir cartas, preencher formulários, acompanhar candidaturas, registrar retornos, preparar entrevistas, controlar prazos.

**Por que simplificar.** Isso descreve um produto de recrutamento. Mas o volume real provavelmente não justifica estrutura própria.

**Versão simples a testar primeiro:** um projeto "Candidaturas" na área `carreira`, com um item por vaga, usando os campos que já existem — status, próxima ação, prazo, aguardando (P2-6 dá "aguardando desde quando"). Zero código novo.

**Só construir estrutura dedicada se** o volume passar de 10 candidaturas simultâneas e os campos genéricos se mostrarem insuficientes na prática.

---

## 22. Modo foco

**Desejo:** ocultar tudo exceto a atividade atual.

**Por que simplificar.** Legítimo, mas provavelmente 20 linhas de CSS sobre a zona Agora — não uma funcionalidade com estado, configuração e transições.

**Versão simples:** um botão que expande a zona Agora para tela cheia. Sem bloqueio de site, sem temporizador Pomodoro, sem estatística de foco.

---

## 23. Preparação de reunião por IA

**Desejo:** briefing automático antes de reuniões.

**Por que simplificar.** A versão elaborada (LLM lendo todo o histórico e sintetizando) depende de P2-5 e tem custo e risco de alucinação.

**Versão simples que entrega a maior parte do valor:** uma regra determinística que, antes de um compromisso vinculado a projeto, lista os itens abertos, as decisões recentes e o que está aguardando. Sem IA. Sem custo. Sem invenção.

**Só evoluir para síntese por LLM se** a lista determinística se mostrar insuficiente na prática.

---

## 24. Notificações inteligentes

**Desejo:** notificações que aprendem o que é relevante.

**Por que simplificar.** "Inteligente" aqui geralmente significa modelo aprendendo preferências. Desnecessário.

**Versão simples:** regras determinísticas com deduplicação e auto-desativação após três dispensas `[AI_AND_AUTOMATION_STRATEGY.md §4.3]`. Isso já produz o comportamento de "aprender o que não interessa", de forma explicável e sem custo.

---

## 25. Automação por eventos

**Desejo:** ações disparadas por eventos do sistema.

**Por que simplificar.** A infraestrutura já existe — `domain_events` registra 19 tipos de evento `[CÓDIGO]`. Construir um motor de automação configurável em cima disso seria construir Zapier interno.

**Versão simples:** as automações específicas de que Lucas precisa, escritas diretamente no cron, com idempotência — que é como as automações atuais já funcionam `[CÓDIGO]`.

---

# Resumo

| Ação | Itens |
|---|---|
| **Descartar** | **modelagem de rotinas que já funcionam** · MCP · adaptador genérico de integrações · leitura de Gmail · agentes autônomos · suíte E2E de UI · funcionalidade multi-usuário · outbox · dashboard de métricas · contagem de interrupções exibida · gamificação |
| **Adiar** | estimativas aprendidas · planejamento semanal · memória de projeto · finanças · rentabilidade · tema escuro · widget nativo · busca semântica · contatos e documentos · GitHub |
| **Simplificar** | candidaturas · modo foco · preparação de reunião · notificações inteligentes · automação por eventos |

**25 itens que não competem com P0 e P1.** Essa é a função deste documento: proteger os nove itens que importam agora.

---

## O princípio por trás de todas estas decisões

Um sistema pessoal falha por excesso, não por falta. Cada funcionalidade adicional é mais superfície para manter, mais decisões a tomar durante o uso, e mais lugares onde algo pode não funcionar.

O briefing pede que o painel reduza carga mental. Toda funcionalidade que não reduz carga mental de forma direta e verificável está trabalhando contra o objetivo — por melhor que seja individualmente.

A pergunta a fazer diante de cada nova ideia não é *"isso seria útil?"* — quase tudo seria. É: **"isso responde a uma pergunta que eu já me faço todo dia?"**
