# Sistema de Tempo, Capacidade, Interrupção e Retomada

Complemento de [`MASTER_STRATEGIC_AUDIT.md`](./MASTER_STRATEGIC_AUDIT.md) §4 e §5. Recomendações P1-1, P1-3.

---

## 1. Por que este é o documento mais importante da auditoria

Cinco das nove perguntas diárias do briefing dependem exclusivamente do que está aqui. A seção 18 inteira (interrupções) não tem sujeito sem isso. A seção 19 (capacidade) mede a coisa errada hoje. E toda a "IA diretiva" da seção 8 produz recomendações erradas sem estes dados.

O sistema atual modela trabalho. Não modela tempo. `[INFERÊNCIA de alta confiança — nenhuma das 22 tabelas, 4 grupos de Commands ou 19 eventos de domínio contém qualquer conceito temporal de execução]`

---

## 2. Os três primitivos

### 2.1 Duração estimada — **já existe**

> **Correção registrada em 24/07/2026.** Com acesso ao código, verifiquei que `estimatedMinutes` **já existe** e está mais completo do que o dossiê indicava. A afirmação anterior de que o campo era ausente estava errada.

**O que já existe** `[CÓDIGO — verificado]`:

| Camada | Situação |
|---|---|
| `item.schema.ts` | `estimatedMinutes: z.number().int().positive().optional()` — no `ItemSchema` e no `CreateItemSchema` |
| Banco | `estimated_minutes integer check (estimated_minutes > 0)` em `core_schema.sql` |
| Repositório | Mapeado nos dois sentidos em `supabase-item.repository.ts` |
| `ItemDetailModal` | Campo editável |
| `capacity.ts` | Consumido no cálculo de comprometimento |
| `calendar-sync.ts` | Usado como duração do evento |
| Planos e triagem de áudio | Ambos produzem estimativas |

**O que falta, e é onde está o trabalho real:**

1. **Não há como estimar no momento da triagem.** A estimativa só é editável abrindo o detalhe do item — um modal, vários campos. Deveria ser um toque na Entrada e na definição do foco do dia.
2. **É campo numérico livre**, não escolha rápida. Digitar "45" exige decidir entre 40, 45 e 50 — precisão que a estimativa não tem, e que impede o agrupamento estatístico de P2-7.
3. **A ausência é tratada como 30 minutos** silenciosamente — ver §4.7.

Isso reduz P1-1(a) de "criar campo" para "expor melhor um campo existente". Esforço menor, risco menor.

**Como deveria ser preenchido.** Escolha rápida, nunca digitação livre:

```
15min · 30min · 1h · 2h · 4h · mais
```

Seis opções cobrem praticamente tudo. "Mais" abre entrada precisa para os casos raros.

**Por que escolha e não campo livre.** Digitar "45" exige decidir entre 40, 45 e 50 — uma precisão que a estimativa não tem. Escolher entre seis opções é mais rápido e mais honesto sobre a incerteza. Além disso, opções fixas tornam o agrupamento estatístico possível (P2-7).

**Por que opcional.** Muitos itens nunca serão executados em sessão dedicada — uma referência salva, uma ideia. Exigir estimativa em tudo adicionaria atrito à triagem sem retorno.

**Regra de comportamento:** o item entra no foco do dia sem estimativa, mas aí não conta para a capacidade comprometida — e a interface diz isso: *"sem estimativa"*. Sem essa transparência, a capacidade mente por omissão.

### 2.2 Sessão de trabalho

**O que é.** Nova tabela `work_sessions`.

```
id
workspace_id            (RLS, padrão do produto)
item_id                 opcional — nem todo trabalho tem item
project_id              opcional — derivado do item quando existe
area                    trabalho | pessoal | saude | casa | carreira | lazer
work_type               profundo | reunião | administração | correção | aprendizado
started_at
ended_at                nulo enquanto ativa
source                  timer | manual
resume_note             onde parei — preenchido ao pausar
interrupted_by_item_id  opcional — o que causou a interrupção
```

**Comandos:** `startSession`, `pauseSession`, `resumeSession`, `endSession`, `correctSession`, `logSessionRetroactively`.

**Eventos:** `work_session.started`, `.paused`, `.resumed`, `.ended`, `.corrected`.

Tudo isso usa exatamente o padrão Commands/Repositories/Eventos já estabelecido `[CÓDIGO: Diagrama 3]`. **Não é arquitetura nova** — é uma nova entidade na arquitetura existente.

**Duas restrições não-negociáveis:**

**(a) No máximo uma sessão ativa por workspace.** É isso que torna "atividade atual" um conceito coerente. Duas sessões simultâneas seriam um estado sem significado — Lucas não faz duas coisas ao mesmo tempo, e fingir que faz corromperia toda a estatística de tempo.

**(b) Registro retroativo é cidadão de primeira classe.** Não um recurso escondido em um menu. Lucas vai esquecer de iniciar o cronômetro — todo mundo esquece. Se corrigir depois for difícil, os dados ficam pela metade. E dados de tempo pela metade são **piores que dados nenhum**, porque produzem recomendações erradas com aparência de fundamentadas: "você só trabalhou 2h esta semana" quando ele trabalhou 30 e registrou 2.

Por isso "registrar trabalho já feito" deve ter a mesma proeminência que "iniciar agora".

### 2.3 Atividade atual

**O que é.** Não é tabela nova. É a sessão sem `ended_at`.

**Onde aparece:**
- Zona Agora da tela Hoje, como elemento de maior peso visual
- No mobile, como a tela padrão
- No título da aba do navegador (o painel fica aberto o dia todo entre outras abas — o título é uma superfície de informação gratuita)

**O que ela habilita:**
- Interrupção tem sujeito
- Retomada tem destino
- Nudge de troca de contexto tem gatilho
- "Onde gastei meu tempo" tem fonte

---

## 3. Tipos de trabalho

O briefing pede visualizar trabalho profundo, reuniões, administração e correções separadamente. Cinco tipos:

| Tipo | O que é | Por que separar |
|---|---|---|
| **Profundo** | Design, escrita, arquitetura, código | É o que produz valor e o que mais sofre com interrupção |
| **Reunião** | Conversas com terceiros | Não é comprimível; ocupa capacidade de forma diferente |
| **Administração** | E-mail, orçamento, burocracia, organização | Expande até ocupar o tempo disponível se não for limitado |
| **Correção** | Retrabalho, bug, ajuste não previsto | Se cresce, é sinal de problema a montante |
| **Aprendizado** | Estudo, leitura, experimentação | Não urgente, importante; some quando não é medido |

**Como é preenchido:** derivado do tipo do item quando possível, ajustável em um toque. Nunca um campo obrigatório em formulário.

**Por que esses cinco.** Cada um responde a uma pergunta diferente que Lucas fez: profundo vs. reunião responde "onde gastei meu tempo"; administração responde "o que está me consumindo sem eu perceber"; correção responde "estou refazendo trabalho"; aprendizado responde "estou investindo no futuro ou só apagando incêndio". Um sexto tipo não adicionaria pergunta nova.

---

## 4. Capacidade habitual

> **Correção registrada em 24/07/2026.** Uma versão anterior deste documento recomendava cadastrar almoço, academia e deslocamentos como blocos recorrentes dentro do painel, usando `recurrence_rules`. **Essa recomendação estava errada e foi retirada.** Ela criava burocracia para comportamentos que já funcionam bem sem o painel — exatamente o oposto do objetivo do produto. A seção abaixo é a versão corrigida.

### 4.0 O princípio que essa correção estabelece

> **O painel ajuda no que pode ser esquecido, subestimado, abandonado, atrasado ou mal priorizado. Não no que já funciona.**

Almoço, academia, pausas e deslocamentos não são problemas de memória. Lucas almoça sem lembrete. Registrar essas coisas como itens, recorrências, hábitos ou lembretes adicionaria manutenção e ruído sem resolver problema nenhum.

Isso não é uma regra apenas sobre capacidade — é um filtro que deve ser aplicado a **toda** funcionalidade futura. Antes de modelar qualquer coisa, a pergunta é: *isso é algo que eu posso esquecer ou errar?* Se a resposta for não, o painel não deve tocar.

Consequência direta e não-negociável: esses períodos **não** aparecem em listas de tarefas, **não** geram notificações, **não** exigem conclusão, **não** entram na revisão, **não** aparecem na tela Hoje e **não** são classificados individualmente.

### 4.1 O que existe hoje no código `[CÓDIGO — verificado]`

`src/lib/capacity.ts` implementa mais do que o dossiê sugeria:

- `computeCapacity()` já soma o tempo comprometido a partir de `estimatedMinutes` dos itens agendados e dos focos sem horário
- `mergeIntervals()` já mescla sobreposições, inclusive item × compromisso do Calendar, para não contar duas vezes
- `suggestFreeSlot()` já sugere a próxima janela livre

O problema é uma única linha:

```ts
export const DAY_CAPACITY_MINUTES = 8 * 60; // jornada padrão de 8h
```

**A capacidade é uma constante fixa de 8 horas, para todos os dias, sempre.** É exatamente a suposição que o briefing rejeita: *"o painel não deve considerar automaticamente todo o período entre 8h30 e 18h como capacidade disponível"*.

Isso torna a correção muito mais barata do que a versão anterior desta auditoria estimava: **substituir uma constante por configuração**. Nenhum bloco recorrente, nenhuma tabela nova, nenhuma decisão sobre escopo do Calendar.

### 4.2 O modelo corrigido

Quatro números. Só isso.

```
CONFIGURAÇÃO (uma vez, ~2 minutos)

  Jornada habitual                  8h30 → 18h
    └ define o intervalo do dia, não a quantidade de trabalho

  Horas realmente disponíveis       5h/dia
    └ número único e líquido. Já absorve almoço, academia,
      pausas, deslocamentos e tempo pessoal. Nada disso é
      declarado, listado ou classificado individualmente.

  Margem para imprevistos           20%


CÁLCULO DIÁRIO (automático)

  Horas disponíveis habituais                        5h00
  − Compromissos do Calendar hoje                   −1h30
  − Margem para imprevistos                         −0h42
  ──────────────────────────────────────────────────────
  = Capacidade de trabalho hoje                      2h48

  − Comprometido (soma das estimativas de hoje)     −2h00
  ──────────────────────────────────────────────────────
  = Espaço livre                                     0h48


AJUSTE EXCEPCIONAL (quando o dia foge do normal)

  "Hoje só tenho 3h"  →  substitui as 5h habituais, só hoje
```

### 4.3 Por que compromissos do Calendar continuam sendo descontados

Esta é a distinção que faz o modelo funcionar, e vale ser explícita:

| Natureza | Como entra | Por quê |
|---|---|---|
| **Estável e recorrente** — almoço, academia, pausas, deslocamento | Já embutido nas "horas disponíveis" | Não varia. Descontar todo dia seria redundante e exigiria manutenção |
| **Variável por dia** — reuniões, consultas, compromissos | Descontado do Calendar via `freebusy` | Varia muito. O sistema já sabe, sem esforço nenhum de Lucas |
| **Excepcional** — viagem, dia atípico, cansaço | Ajuste manual do dia | Raro por definição. Um campo, um número |

O `freebusy` continua fazendo exatamente o que faz bem: informar que existe um bloco ocupado. **O sistema não precisa saber o que é aquele bloco** — só que ele existe e consome tempo.

Isso resolve, sem custo, o conflito que a versão anterior desta auditoria tratava como decisão difícil.

### 4.4 A decisão sobre o escopo do Calendar deixa de existir

A versão anterior apresentava três opções (manter `freebusy`, ampliar para `calendar.readonly`, ou híbrido) e pedia uma decisão de produto.

**Essa decisão não é mais necessária.** O motivo para querer títulos era classificar blocos — distinguir almoço de reunião de academia. Com o modelo corrigido, essa distinção é irrelevante: o que é estável já está embutido no número habitual, e o que é variável só precisa ser descontado, não rotulado.

**Manter `calendar.freebusy`.** Sem ampliação de escopo, sem reconsentimento OAuth, sem classificação, sem IA, sem títulos de compromissos pessoais saindo do Google. O princípio de menor privilégio permanece intacto e agora não custa nada.

### 4.5 Interface de configuração

Um card em `/configuracoes`, quatro campos, sem subtelas:

```
┌──────────────────────────────────────────────────────┐
│  Capacidade habitual                                 │
│                                                      │
│  Jornada          [ 08:30 ]  às  [ 18:00 ]           │
│                                                      │
│  Horas realmente disponíveis para trabalho por dia   │
│                   [ 5h ]                             │
│  Uma estimativa aproximada. Almoço, academia,         │
│  pausas e deslocamentos já estão descontados aqui —   │
│  você não precisa registrá-los no painel.            │
│                                                      │
│  Margem para imprevistos      [ 20% ]                │
└──────────────────────────────────────────────────────┘
```

E, na tela Hoje, o ajuste excepcional como controle discreto — não um formulário:

```
5h disponíveis hoje · ajustar
```

Tocar em "ajustar" abre `3h · 4h · 5h · 6h · outro`. Um toque. Vale só para hoje e volta ao habitual amanhã, sem precisar desfazer nada.

### 4.6 Diferenciação por dia da semana — só se necessário

Uma extensão óbvia seria permitir horas diferentes por dia (segunda 6h, sexta 3h). **Não construir na primeira versão.**

Razão: um número único mais o ajuste excepcional provavelmente resolve. Se, depois de algumas semanas, ficar claro que Lucas ajusta a sexta-feira toda semana, aí sim a diferenciação se justifica — e a evidência de que ela é necessária estará no histórico de ajustes, não em suposição.

Começar com sete números é adicionar configuração antes de saber se ela é útil.

### 4.7 Honestidade sobre itens sem estimativa

`[CÓDIGO — verificado]` Hoje, `computeCapacity` usa `item.estimatedMinutes ?? 30` — itens sem estimativa contam **30 minutos silenciosamente**.

Isso faz a capacidade mentir de forma invisível: cinco itens sem estimativa viram 2h30 de comprometimento que Lucas nunca declarou.

Correção: itens sem estimativa **não** entram no total comprometido, e a interface diz isso — *"3h comprometidas · 2 itens sem estimativa"*. Um número honesto e incompleto é melhor que um número completo e inventado.

### 4.8 A margem para imprevistos

Sem margem, o sistema planeja para o dia perfeito — que nunca acontece. Lucas termina todo dia com itens não feitos e conclui que o painel é otimista demais para confiar.

Sugestão inicial: 20%. Ajustável. Depois de algumas semanas de sessões registradas, comparável com a realidade: *"nas últimas 4 semanas, o trabalho não planejado consumiu cerca de 25% do seu tempo"* — uma observação, não um ajuste automático.

### 4.9 Capacidade semanal

Mesma matemática, somada. Uma linha em Hoje apenas quando fora do normal:

> *"Esta semana: 32h comprometidas de 25h disponíveis."*

E o detalhe na Agenda, que hoje mostra apenas compromissos e prazos `[DOSSIÊ]`:

```
seg  ████████░░  4h/5h
ter  ██████████  6h/4h   ← sobrecarregado
qua  ████░░░░░░  2h/5h
qui  ███████░░░  3h/4h
sex  ██░░░░░░░░  1h/5h
```

Responde à quinta pergunta do briefing em uma olhada, e mostra **onde** está o problema.

### 4.10 Aprender com o histórico sem falsa precisão

As cinco regras, repetidas aqui porque são a diferença entre uma funcionalidade útil e uma que gera desconfiança:

1. **Nunca alterar estimativa automaticamente.** Sugerir; Lucas aceita.
2. **Mínimo de 5 sessões concluídas** do mesmo tipo antes de sugerir qualquer coisa.
3. **Faixa, nunca ponto.** *"costuma levar entre 1h30 e 2h30"*, jamais *"1h37"*.
4. **Agrupar por tipo de trabalho**, não por item. Itens são únicos; tipos se repetem.
5. **Mostrar o tamanho da amostra.** *"baseado nas suas últimas 8 sessões de trabalho profundo"* torna a confiança auditável.

E uma sexta, sobre tom: apresentar como **calibração**, não como **desempenho**. A diferença entre *"você errou a estimativa em 40%"* e *"trabalho de design tem levado ~1.4× do que você estima"* é a diferença entre uma ferramenta que ajuda e uma que gera culpa. O briefing pede explicitamente um sistema não invasivo — esta é a única funcionalidade com risco real de trair isso.

O mesmo vale para as horas habituais: se Lucas configurou 5h e o histórico mostra 3h30, o sistema **observa** (*"você tem registrado cerca de 3h30 por dia"*) e oferece ajustar. Nunca ajusta sozinho, e nunca apresenta a diferença como falha.

### 4.4 Capacidade semanal

Mesma matemática, somada. Uma linha em Hoje quando fora do normal:

> *"Esta semana: 32h comprometidas de 30h disponíveis."*

E o detalhe na Agenda, que hoje mostra apenas compromissos e prazos `[DOSSIÊ]` e deve passar a mostrar carga:

```
seg  ████████░░  6h/7h
ter  ██████████  8h/7h   ← sobrecarregado
qua  ████░░░░░░  3h/7h
qui  ███████░░░  5h/7h
sex  ██░░░░░░░░  1h/6h
```

Isso responde diretamente à quinta pergunta do briefing ("minha semana está tranquila ou sobrecarregada?") em uma olhada — e mostra **onde** está o problema, não só que existe.

### 4.5 Aprender com o histórico sem falsa precisão

As cinco regras, repetidas aqui porque são a diferença entre uma funcionalidade útil e uma que gera desconfiança:

1. **Nunca alterar estimativa automaticamente.** Sugerir; Lucas aceita.
2. **Mínimo de 5 sessões concluídas** do mesmo tipo antes de sugerir qualquer coisa.
3. **Faixa, nunca ponto.** *"costuma levar entre 1h30 e 2h30"*, jamais *"1h37"*.
4. **Agrupar por tipo de trabalho**, não por item. Itens são únicos; tipos se repetem.
5. **Mostrar o tamanho da amostra.** *"baseado nas suas últimas 8 sessões de trabalho profundo"* torna a confiança auditável.

E uma sexta, sobre tom: apresentar como **calibração**, não como **desempenho**. A diferença entre *"você errou a estimativa em 40%"* e *"trabalho de design tem levado ~1.4× do que você estima"* é a diferença entre uma ferramenta que ajuda e uma que gera culpa. O briefing pede explicitamente um sistema não invasivo e não de vigilância — esta é a única funcionalidade com risco real de trair isso.

---

## 5. Interrupções

### 5.1 O que já acontece hoje

Lucas aperta `Ctrl+Shift+Espaço`, captura a interrupção, e volta ao que fazia. Isso funciona e é rápido.

O que falta não é o fluxo de captura — é o **contexto ao redor dele**: não há registro de que ele estava fazendo algo, nem de onde parou, nem do impacto no dia.

### 5.2 A armadilha a evitar

Construir um fluxo de interrupção com formulário de motivo, categoria, impacto estimado e nota obrigatória. Lucas usa três vezes e abandona. E aí sobram dados de tempo pela metade — que, como já dito, são piores que dados nenhum.

O briefing é explícito: *"sem transformar cada troca de atividade em burocracia"* e *"priorize a solução com menor fricção"*.

### 5.3 A solução: enriquecer, não criar

Quando existe sessão ativa e a Captura Rápida é aberta, o modal ganha **uma linha**, não uma tela:

```
┌────────────────────────────────────────────────────┐
│  [ o que você quer registrar? ]                    │
│                                                    │
│  ──────────────────────────────────────────────    │
│  Você está em: Proposta Grupo Almeida · 47min      │
│                                                    │
│  ● só capturar, continuo          ← padrão         │
│  ○ pausar e trocar para isso                       │
│  ○ pausar, vou resolver fora do painel             │
│                                                    │
│                              [ Capturar ]           │
└────────────────────────────────────────────────────┘
```

**Por que isso funciona:**

- **O padrão é o comportamento atual.** Quem só quer capturar aperta Enter. **Fricção zero adicionada ao caminho comum** — que é o caminho de 80% das vezes.
- A escolha só é feita quando Lucas *já decidiu* trocar. Nesse momento, um clique é barato.
- Os três estados cobrem a realidade: interrupção que espera, interrupção que assume, e interrupção que tira Lucas do painel.

**O que acontece em cada opção:**

| Opção | Comportamento |
|---|---|
| Só capturar | Item vai para a Entrada, vinculado como "surgiu durante {sessão}". Sessão continua. |
| Pausar e trocar | Sessão atual é pausada com o tempo decorrido gravado. Campo opcional de uma linha: *"onde você parou?"*. Nova sessão inicia no item capturado. |
| Pausar, resolver fora | Sessão pausada. Nenhuma sessão nova. Item vai para a Entrada. |

O campo "onde você parou?" é **opcional e de uma linha**. Placeholder concreto: *"faltava a seção de preço"*. Se Lucas pular, tudo bem — o item e o tempo decorrido já são contexto suficiente na maioria dos casos.

### 5.4 Retomada

A retomada aparece onde ela é necessária: na zona Agora da tela Hoje.

```
┌────────────────────────────────────────────────────────┐
│  Retomar                                               │
│                                                        │
│  Proposta comercial — Grupo Almeida                    │
│  47min investidos · ~43min restantes estimados         │
│  Você parou em: "faltava a seção de preço"             │
│                                                        │
│  [ Retomar ]                        outra coisa →      │
└────────────────────────────────────────────────────────┘
```

Três informações, e cada uma responde a uma pergunta real da retomada:
- **Tempo investido** → responde "vale a pena voltar ou recomeço?"
- **Tempo restante estimado** → responde "cabe no que sobrou do dia?"
- **Onde parou** → responde "por onde continuo?" — é o que elimina os 5 minutos de reconstrução mental

### 5.5 O que deliberadamente não construir agora

O briefing lista nove recursos possíveis e pede para não presumir que todos devem ser implementados. Minha divisão:

**Construir agora:**
- Estado "fazendo agora"
- Sessão de trabalho
- Ponto de retomada (a nota de uma linha)
- Tempo já investido
- Estimativa restante

**Não construir agora:**
- **Fila de retorno formal.** Uma lista ordenada de coisas a retomar. Não construir até saber quantas interrupções acontecem por dia. Se for 1–2, a fila é a própria zona Agora. Se for 8, aí faz sentido — mas isso é mensurável depois.
- **Sugestão automática de reorganização do dia.** "Você perdeu 40min, sugiro mover X" é atraente mas requer confiança nas estimativas que ainda não existe. Depende de P2-7.
- **Análise de impacto da troca.** "Trocar agora custa 15min de retomada" é uma estimativa que o sistema não tem como fazer com honestidade hoje.
- **Categorização de interrupções.** Motivo, origem, evitabilidade. Alto atrito, valor especulativo, e risco de virar autopunição.

A régua: construir o que responde uma pergunta que Lucas já faz. Adiar o que responde uma pergunta que ele talvez venha a fazer.

---

## 6. Sessões esquecidas

Vai acontecer. O tratamento define se os dados são confiáveis ou lixo.

**Regra:** o cron horário detecta sessão ativa há mais de 4 horas sem qualquer interação.

**O que faz:** encerra a sessão e a marca como **pendente de confirmação**. Não registra a duração.

**O que Lucas vê na volta:**

```
┌────────────────────────────────────────────────────────┐
│  Sessão em aberto                                      │
│                                                        │
│  "Proposta Grupo Almeida" ficou aberta por 14h.        │
│  Quanto tempo você realmente trabalhou?                │
│                                                        │
│  [ 1h ] [ 2h ] [ 3h ] [ outro ]      [ descartar ]     │
└────────────────────────────────────────────────────────┘
```

**Por que isso importa tanto.** Se o sistema registrar 14h silenciosamente, todas as estatísticas de estimativa ficam corrompidas — e as recomendações futuras serão erradas de forma invisível. Uma pergunta ocasional é barata; dados corrompidos permanentemente não são.

E o botão "descartar" precisa existir sem culpa. Nem toda sessão vale registrar.

---

## 7. Onde gastei meu tempo

Não é uma tela nova. É a **revisão semanal**, que hoje é `/revisao` e passa a incluir tempo.

```
Semana de 20–26 de julho          26h30 registradas

Por área
  Trabalho          19h00   ████████████████░░░░
  Saúde              3h00   ███░░░░░░░░░░░░░░░░░
  Casa               2h30   ██░░░░░░░░░░░░░░░░░░
  Carreira           2h00   ██░░░░░░░░░░░░░░░░░░

Por projeto (trabalho)
  Grupo Almeida     11h00   você planejou 8h
  Sartec Digital     5h00
  Marketing Sartec   3h00   você planejou 6h

Por tipo
  Profundo          14h00   53%
  Reunião            6h00   23%
  Administração      4h30   17%
  Correção           2h00    7%

Observações
  · Grupo Almeida consumiu 3h a mais que o planejado
  · Portfólio não recebeu nenhuma sessão nesta semana
  · Trabalho profundo caiu de 62% para 53% em relação à semana anterior
```

Decisões de desenho:

- **Sem gráficos.** Barras de texto. O objetivo é ler em 30 segundos, não explorar dados.
- **As observações são a parte útil.** Números sozinhos exigem interpretação; as observações já são a interpretação, e são determinísticas.
- **Comparar com o planejado, não com um ideal.** O sistema não tem opinião sobre quantas horas Lucas deveria trabalhar. Só sobre a diferença entre o que ele disse que faria e o que fez.
- **Nunca somar horas por semana como métrica de desempenho.** Isso convida à comparação e à culpa, o que o briefing pede explicitamente para evitar. As horas totais aparecem como contexto, não como placar.

---

## 8. Sequência de implementação

Cada etapa entrega valor sozinha e não quebra o que veio antes.

| Etapa | Entrega | Valor isolado |
|---|---|---|
| **1** | Seletor rápido de estimativa na triagem e no foco (campo já existe) | Capacidade comprometida passa a ser declarada, não inventada |
| **2** | Tabela `work_sessions` + iniciar/encerrar | "Fazendo agora" existe; zona Agora ganha conteúdo |
| **3** | Pausar, retomar, nota de retomada | Interrupção tratada |
| **4** | Registro retroativo e correção | Dados ficam confiáveis |
| **5** | Capacidade habitual configurável (substitui `DAY_CAPACITY_MINUTES`) + ajuste do dia | Capacidade deixa de ser 8h fixas |
| **6** | Agregação por área, projeto e tipo | "Onde gastei meu tempo" |
| **7** | Estatística de estimativa (P2-7) | Sugestão de duração |

**Ordem crítica:** a etapa 4 vem antes da 6. Agregar dados incompletos produz números errados que parecem certos — e uma vez que Lucas vê "você trabalhou 3h esta semana" quando trabalhou 30, ele deixa de confiar em todo o módulo de tempo, permanentemente.

---

## 9. O risco real

Não é técnico. É de adoção.

Se registrar tempo tiver qualquer atrito significativo, Lucas para em duas semanas. E aí o sistema fica com um módulo morto e com dados parciais que envenenam as recomendações.

Cinco proteções contra isso:

1. **Iniciar sessão em um clique**, direto da zona Agora — sem escolher tipo, sem escolher projeto (ambos derivados do item)
2. **Registro retroativo tão fácil quanto o cronômetro** — não escondido
3. **Nunca punir o esquecimento.** Nenhum alerta do tipo "você não registrou tempo ontem"
4. **Valor visível na primeira semana.** A zona Agora precisa ser útil no dia 1, não no dia 30. Ela é — mesmo sem nenhum histórico, ela responde "o que estou fazendo e há quanto tempo"
5. **Aceitar dados incompletos com honestidade.** Se uma semana tem poucos registros, a revisão diz *"poucos dados esta semana"* em vez de mostrar números enganosos

O sinal de que está funcionando: a métrica 2 de `MASTER_STRATEGIC_AUDIT.md` §13 — percentual de dias úteis com pelo menos uma sessão registrada. Se cair abaixo de 50% por duas semanas, o problema é de atrito, não de disciplina, e a resposta é simplificar o fluxo — não insistir.
