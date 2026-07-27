# Arquitetura da Informação — Painel Pessoal Lucas

Complemento de [`MASTER_STRATEGIC_AUDIT.md`](./MASTER_STRATEGIC_AUDIT.md) §6.

---

## 1. O problema da arquitetura atual

### 1.1 O que existe

Oito seções na navegação `[DOSSIÊ]`: Hoje, Entrada, Projetos, Ideias, Agenda, Planos, Revisão, Configurações. Mais três modais globais: Captura Rápida, Busca Global, Detalhe de Item.

Um único eixo de organização de conteúdo: **projeto**.

### 1.2 Os três problemas

**Problema A — Uma dimensão para uma vida de várias dimensões.**

O escopo declarado no briefing tem 15 áreas: Sartec Papelaria, Sartec Digital, Grupo Almeida, Marketing, Carreira, Portfólio, Estudos, Academia, Saúde, Consultas, Compromissos pessoais, Vida doméstica, Compras, Mergulho, Lazer, mais finanças futuras.

Algumas dessas são projetos no sentido do sistema (objetivo, marco, prazo). A maioria não é. "Academia" não tem próximo marco. "Compras" não tem prazo. "Saúde" não conclui.

Forçar tudo em `project_id` produz um dos dois resultados ruins descritos em `MASTER_STRATEGIC_AUDIT.md` §6.2 — projetos falsos poluindo `/projetos` e o Pulso dos Projetos, ou itens sem projeto gerando alerta permanente em `/revisao` `[CÓDIGO]`.

**Problema B — Telas organizadas por tipo de objeto, não por momento de uso.**

`/entrada`, `/ideias` e `/revisao` são todas listas filtradas de `items` `[CÓDIGO]`. A diferença entre elas é qual filtro está aplicado. Do ponto de vista do sistema faz sentido; do ponto de vista de Lucas, não: ele não pensa "vou à tela de ideias", ele pensa "o que eu sabia sobre aquele cliente?" — que é uma pergunta de busca, não de navegação.

**Problema C — Ausência do eixo temporal como organizador.**

O briefing pede alternância entre rotina diária, planejamento semanal e planos de médio e longo prazo. Hoje: `/hoje` é diário, `/agenda` é semanal mas só mostra compromissos e prazos (não carga de trabalho), `/planos` é de longo prazo mas só alcançável via importação de documento. Os três horizontes existem, mas desconectados e com portas de entrada diferentes.

---

## 2. Arquitetura proposta

### 2.1 Princípio organizador

Três eixos ortogonais, cada um respondendo a uma pergunta diferente:

| Eixo | Pergunta | Como se manifesta |
|---|---|---|
| **Tempo** | Quando isso importa? | Hoje / Semana / Depois |
| **Área** | Que parte da minha vida? | Trabalho / Pessoal / Saúde / Casa / Carreira / Lazer |
| **Projeto** | A que esforço maior isso pertence? | Opcional, dentro de uma área |

A regra que evita caos: **tempo é a navegação, área é o filtro, projeto é o agrupador.** Nunca inverter — se área virar navegação, a barra lateral cresce indefinidamente; se tempo virar filtro, some a noção de "agora".

### 2.2 A dimensão área da vida

**Definição:** um enum curto, exclusivo e estável. Um item tem exatamente uma área. O conjunto de áreas quase nunca muda.

```
trabalho   — Sartec Digital, Grupo Almeida, Sartec Papelaria, Marketing
pessoal    — compromissos, vida doméstica, compras, lazer, mergulho
saude      — academia, consultas, exames, rotinas de saúde
casa       — manutenção, contas, organização doméstica
carreira   — candidaturas, portfólio, estudos
```

Cinco áreas iniciais. Deliberadamente poucas.

**Por que enum e não tag livre.** Tags livres degradam: em seis meses há "academia", "Academia", "gym" e "treino", e nenhum filtro é confiável. Área precisa ser confiável porque será usada para filtrar Hoje e para agregar tempo — dois lugares onde ambiguidade é inaceitável.

**Por que exclusiva.** Se um item pode ter três áreas, "quanto tempo dediquei a saúde este mês" deixa de ter resposta. Exclusividade é o que torna a agregação de tempo possível.

**Por que estável.** Mudar o enum depois exige migration e reclassificação. Escolher cinco genéricas hoje é mais barato que descobrir a décima segunda depois.

**Relação com projeto.** Área é obrigatória; projeto é opcional. Um projeto tem área (e a herda para seus itens por padrão). Um item pode ter área sem projeto — e isso deixa de ser um problema, porque `/revisao` passa a alertar sobre "sem área", não sobre "sem projeto".

Essa única mudança elimina o alerta permanente que hoje pune Lucas por usar o sistema para a vida pessoal.

### 2.3 O alternador de contexto

Um controle no topo da casca da aplicação, sempre visível, com três estados:

```
[ Tudo ]  [ Trabalho ]  [ Pessoal ]
```

- **Tudo** — visão integrada, padrão
- **Trabalho** — filtra para a área `trabalho`
- **Pessoal** — filtra para `pessoal` + `saude` + `casa` + `lazer`

Comportamento:
- Filtra **simultaneamente** Hoje, Entrada, Projetos e Agenda
- Persiste entre sessões e entre dispositivos
- Não afeta a Captura Rápida (capturar nunca deve exigir escolher contexto antes) nem a Busca Global (buscar deve varrer tudo, sempre)

**O que isso não é:** não é uma tela nova, não é um workspace separado, não é uma mudança de dados. É uma projeção sobre o que já existe. Esse é o ponto — a alternância que o briefing pede é uma questão de **visão**, não de **estrutura**.

**Por que só três estados e não seis.** O uso real é binário: "estou trabalhando" ou "não estou". Filtro por área específica pertence às telas de lista, não ao alternador global. Um alternador com seis botões vira mais uma decisão a tomar antes de ver a informação — o oposto do objetivo.

### 2.4 Navegação proposta

De oito para seis itens:

| Item | Responde | Mudança |
|---|---|---|
| **Hoje** | O que faço agora? | Reconstruída (P1-2) |
| **Entrada** | O que capturei e ainda não organizei? | Absorve `/ideias` como visão salva |
| **Projetos** | Em que estou trabalhando? | Ganha área; ganha memória de projeto (P2-5) |
| **Agenda** | Como está minha semana? | Ganha carga de trabalho, não só compromissos |
| **Planos** | O que é de longo prazo? | Deixa de ser a única porta para recorrências |
| **Configurações** | Como o sistema funciona? | Perde diagnósticos; ganha saúde de automações |

**O que sai:**
- **Ideias** → visão salva dentro de Entrada. A pergunta que ela responde ("o que eu sabia sobre X?") é melhor atendida pela Busca Global, que já existe e é boa.
- **Revisão** → deixa de ser aba permanente. Vira (a) um card condicional na zona Atenção de Hoje quando há algo relevante, e (b) um ritual semanal acessível pela Agenda. A revisão do sistema é uma atividade semanal; ocupar espaço permanente na navegação a torna algo que se olha todo dia sem ação — ou seja, ruído.

**Por que reduzir importa.** Cada item de navegação é uma decisão em aberto ("será que devia olhar ali?"). Seis é confortável. Oito começa a ter itens que Lucas nunca clica — e um item nunca clicado é carga mental sem contrapartida.

### 2.5 A busca merece mais destaque

Achado que vale isolar: entre as dificuldades declaradas por Lucas está *"encontrar informações antigas"*. A Busca Global já resolve isso bem — busca simultânea em itens e projetos, com debounce `[CÓDIGO]`.

Mas ela está atrás de `Ctrl+K`, um atalho **que não existe no mobile**. No celular há apenas um ícone de busca na barra superior `[DOSSIÊ]`.

Recomendação: elevar a busca no mobile a elemento persistente, não ícone secundário. É a funcionalidade existente com maior distância entre valor e visibilidade.

---

## 3. Modelo mental do produto

### 3.1 Como Lucas deve pensar o sistema

Uma frase que deve ser verdadeira depois das mudanças:

> **Tudo que entra na minha cabeça vai para a Entrada. O que tem hora vai para a Agenda. O que estou fazendo está em Hoje. O que é grande está em Projetos. Nada mais precisa ser lembrado por mim.**

Cada parte dessa frase mapeia para exatamente um lugar. Onde há dois lugares possíveis para a mesma coisa, o modelo mental quebra — e é exatamente isso que acontece hoje com Entrada/Ideias e com Hoje/Revisão.

### 3.2 O ciclo de vida de uma informação

```
CAPTURA          → Entrada (área opcional, projeto opcional, tudo opcional)
   ↓
TRIAGEM          → ganha área (obrigatória), tipo, e talvez projeto
   ↓
    ├─ tem hora?      → Agenda (compromisso)
    ├─ é trabalho?    → ganha estimativa de duração
    ├─ é referência?  → fica em Entrada, visível pela busca
    └─ é recorrente?  → vira rotina (P2-8)
   ↓
EXECUÇÃO         → Hoje: entra no foco, vira sessão de trabalho
   ↓
CONCLUSÃO        → tempo registrado, alimenta estimativas futuras
```

O ponto importante desse ciclo: **a única etapa obrigatória é a captura.** Todas as outras são progressivas. Um item pode viver para sempre na Entrada sem virar nada — e isso é aceitável, desde que a busca o encontre. Isso é o que "capturar primeiro, organizar depois" significa levado a sério.

### 3.3 O que fica visível em cada horizonte

| Horizonte | Onde | O que aparece | O que não aparece |
|---|---|---|---|
| **Agora** | Hoje, zona Agora | A sessão em curso; ou a próxima decisão | Qualquer coisa que não seja executável nos próximos 90 minutos |
| **Hoje** | Hoje, zona Depois | Compromissos e trabalho planejado, na linha do tempo | Projetos, saúde do sistema, tudo que é semanal |
| **Semana** | Agenda | Carga por dia, compromissos, prazos, ritual de revisão | Detalhe de execução |
| **Aberto** | Entrada | Tudo que foi capturado e não tem lugar ainda | Nada — a Entrada é deliberadamente completa |
| **Longo prazo** | Projetos e Planos | Objetivos, fases, marcos, memória | Ações do dia |

Essa tabela é a regra de decisão para toda dúvida futura do tipo "onde isso deveria aparecer?".

---

## 4. Divisão entre vida pessoal e profissional

O briefing pede coexistência sem mistura caótica. Três mecanismos, em ordem de força:

**Nível 1 — Separação por dado (área).** Todo item e projeto tem área. Isso é a base de tudo.

**Nível 2 — Separação por visão (alternador).** Lucas escolhe o contexto e o sistema inteiro obedece.

**Nível 3 — Separação por comportamento.** Áreas diferentes se comportam diferente:
- `trabalho` participa do cálculo de capacidade e de sessões de trabalho
- `pessoal`, `casa`, `lazer` aparecem na linha do tempo mas **não consomem capacidade de trabalho** — eles a reduzem, o que é diferente
- `saude` cobre o que é **pontual e esquecível** (consultas, exames). Academia e rotinas estáveis **não** são modeladas — já estão embutidas nas horas disponíveis da capacidade. Ver `MASTER_STRATEGIC_AUDIT.md` §0.1

Esse terceiro nível é o que impede o resultado absurdo de "comprar detergente" competir por prioridade com "entregar proposta do Grupo Almeida". Eles não estão na mesma fila porque não são o mesmo tipo de tempo.

**O que deliberadamente não é separado:** captura e busca. Capturar nunca deve exigir decidir se é pessoal ou profissional — essa decisão vem depois. E buscar deve sempre varrer tudo, porque quando Lucas procura algo ele não lembra em que contexto salvou.

---

## 5. O módulo Planos na nova arquitetura

Diagnóstico em `MASTER_STRATEGIC_AUDIT.md` §6.4: motor excelente, porta de entrada de baixíssima frequência.

Na arquitetura proposta, Planos tem dois papéis distintos que hoje estão fundidos:

**Papel 1 — Estruturação de documento (baixa frequência, alto valor quando acontece).** "Tenho um documento de estratégia, transforme em plano executável." Bem resolvido hoje. **Manter como está**, incluindo a tela de revisão com badges de fato/hipótese/sugestão/decisão/pergunta — que é, aliás, um dos melhores exemplos de IA transparente do produto inteiro e merece ser replicada em outras operações de IA.

**Papel 2 — Motor de recorrências (alta frequência potencial, hoje inacessível).** Deve ser desacoplado e alcançável de item ou projeto, sem passar por documento. Ver P2-8.

Concretamente:
- `/planos` continua existindo, mas desce na navegação
- Criar uma rotina recorrente passa a ser possível a partir de qualquer item
- Obrigações periódicas **esquecíveis** (revisão semanal do sistema, envio de nota fiscal, follow-up mensal) usam a mesma infraestrutura. Rotinas que já funcionam sozinhas — academia, almoço, suplemento — **não entram**

Isso extrai valor diário de uma infraestrutura que já está construída, testada e é determinística — que é o melhor tipo de investimento disponível.

---

## 6. O que muda e o que não muda

### Muda

- Novo campo `area` em `items` e `projects` (migration)
- Alternador de contexto na casca da aplicação
- `/ideias` deixa de ser rota e vira visão salva em `/entrada`
- `/revisao` deixa de ser rota e vira card condicional + ritual semanal
- Recorrências alcançáveis fora do módulo Planos
- Busca elevada no mobile
- `/revisao` alerta sobre "sem área" em vez de "sem projeto"

### Não muda

- O modelo de dados de `items`, `projects`, `daily_plans`, `execution_plans` — apenas ganham um campo
- O princípio "capturar primeiro, organizar depois"
- A trava de 3 focos diários
- A Captura Rápida e a Busca Global como modais globais
- Os schemas Zod de domínio e o padrão Commands/Queries
- Toda a camada de segurança e RLS

Nenhuma dessas mudanças exige reescrita. A arquitetura da informação evolui por **adição de um eixo** e **subtração de duas rotas** — não por reconstrução.
