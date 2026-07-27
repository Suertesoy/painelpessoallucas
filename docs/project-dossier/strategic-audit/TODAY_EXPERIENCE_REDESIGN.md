# Redesenho da Tela Hoje — Central de Decisões

Complemento de [`MASTER_STRATEGIC_AUDIT.md`](./MASTER_STRATEGIC_AUDIT.md) §3. Recomendação P1-2.

> **Nota de sequenciamento (revisão de 25/07/2026).** Este documento descreve o **estado-alvo** das três zonas (Agora, Depois, Atenção). A entrega **não é um único redesenho**. Conforme `FEATURE_ROADMAP.md`, a Fase 1 entrega **só a zona Agora**, adicionada à tela Hoje **mantendo temporariamente** as seções atuais (Foco do Dia, Próximas Ações, Agendado, Aguardando, Atenção Necessária, Pulso dos Projetos). O conjunto é usado por ~1 semana antes de qualquer reorganização adicional. As zonas Depois e Atenção descritas abaixo (§3.3–3.4) são o alvo da Fase 2, não da Fase 1, e só devem ser construídas depois que a zona Agora estiver validada em uso real. Isso evita combinar a criação do domínio de tempo com um redesenho completo e irreversível da tela principal.
>
> **Classificação de evidência para as descrições visuais deste documento.** O dossiê final confirma que apenas duas imagens foram observadas visualmente: as capturas públicas de `/login` (desktop e mobile). Nenhuma tela interna (incluindo a Hoje atual) foi vista renderizada. Os mockups ASCII e a descrição da tela atual (§2) são **inferidos da estrutura de componentes e dos tokens de design** documentados em `SCREEN_COPY_AND_FLOW_INVENTORY.md` e `DESIGN_SYSTEM_AND_VISUAL_AUDIT.md` — não são validações visuais diretas. Antes de implementar qualquer mudança de layout descrita aqui, capturar screenshots reais de `/hoje` (desktop e mobile) e usá-las como baseline — ver Fase 0, entrega 6, em `FEATURE_ROADMAP.md`.

---

## 1. O que a tela precisa responder

O briefing (seção 17) define dez perguntas. Classifiquei cada uma pela frequência real com que Lucas precisa da resposta — porque essa classificação **é** o desenho da tela:

| Pergunta | Frequência | Destino |
|---|---|---|
| O que fazer agora? | Muitas vezes por dia | Zona Agora, permanente |
| Qual é o foco? | Muitas vezes por dia | Zona Agora, permanente |
| Quanto tempo existe? | Várias vezes por dia | Zona Depois, permanente |
| Qual é a próxima atividade? | Várias vezes por dia | Zona Depois, permanente |
| O que está em risco? | 1–2× por dia | Zona Atenção, condicional |
| O que está atrasado? | 1–2× por dia | Zona Atenção, condicional |
| O que depende de terceiros? | Algumas vezes por semana | Zona Atenção, só quando vencido |
| Qual projeto precisa de atenção? | Semanal | **Sai da tela** → revisão semanal |
| Existe espaço para algo adicional? | Quando surge algo | Zona Atenção, como recomendação |
| A semana está tranquila ou apertada? | Semanal, ou quando surge algo grande | Uma linha em Depois; detalhe na Agenda |

**Conclusão que orienta tudo:** quatro perguntas são permanentes, cinco são condicionais, uma sai. A tela atual trata as dez como permanentes e de mesmo peso — é essa a raiz do problema.

---

## 2. Diagnóstico da tela atual

### 2.1 Mapeamento seção a seção

| # | Seção atual | Diagnóstico | Destino |
|---|---|---|---|
| 1 | Foco do Dia (máx 3) | Bom conceito, sem ordem nem duração | **Evolui** → base da zona Agora |
| 2 | Próximas Ações (`max-h-96`) | Lista longa rolável; é a Entrada com outro filtro | **Reduz** → 3 sugestões contextuais em Depois |
| 3 | Capacidade + Calendar | Mede a coisa errada (ver §4.3 do master) | **Evolui** → capacidade real, integrada à linha do tempo |
| 4 | Agendado para Hoje | Correto, mas isolado do trabalho planejado | **Funde** → linha do tempo única em Depois |
| 5 | Dos planos ativos | Itens materializados por recorrência | **Funde** → são itens do dia como quaisquer outros |
| 6 | Aguardando (`blocked`) | Informação de baixa frequência em posição permanente | **Condicional** → Atenção, só quando vence prazo de cobrança |
| 7 | Atenção Necessária | Duplica `/revisao` | **Funde** → Atenção |
| 8 | Pulso dos Projetos | Informação semanal em tela diária | **Sai** → revisão semanal |

Oito seções viram três zonas. Isso não é remoção de funcionalidade: seis das oito são preservadas, mas reposicionadas por frequência de uso e nível de urgência.

### 2.2 Os cinco problemas estruturais

**1. Nenhuma seção responde "agora".** "Foco do Dia" lista até três itens sem ordem temporal, sem duração e sem indicação de qual está em curso `[CÓDIGO]`. É uma lista de intenções, não uma decisão.

**2. Peso visual uniforme.** Todas as seções usam `bg-white rounded-xl shadow-sm border p-4 md:p-6` `[DOSSIÊ]`. A hierarquia existe apenas pela posição no grid — o que exige varredura completa a cada consulta.

**3. Validação em vez de orientação.** O aviso *"Esta atividade ultrapassa a capacidade do dia"* aparece **depois** de tentar adicionar `[DOSSIÊ]`. Comportamento desejado: dizer antes o que cabe.

**4. Capacidade que não reflete a realidade.** Detalhado em `MASTER_STRATEGIC_AUDIT.md` §4.3.

**5. Sobreposição com outras telas.** Seções 6, 7 e 8 mostram o que `/revisao` e `/projetos` já mostram. Ver a mesma informação em dois lugares não dá segurança — dá dúvida sobre qual é a fonte de verdade.

---

## 3. A nova estrutura: três zonas

### 3.1 Princípio

```
┌──────────────────────────────────────────────┐
│  AGORA        — o que estou fazendo          │  peso máximo, sempre
│                 ou a próxima decisão          │
├──────────────────────────────────────────────┤
│  DEPOIS       — o resto do dia na linha       │  peso médio, sempre
│                 do tempo, com espaço livre    │
├──────────────────────────────────────────────┤
│  ATENÇÃO      — o que exige decisão hoje      │  peso baixo, condicional
└──────────────────────────────────────────────┘
```

Regra de ouro: **a zona Atenção pode estar vazia, e isso é o estado desejado.** Um dia sem nada em Atenção é um dia sob controle. Isso dá à zona um significado real — quando aparece algo, importa.

Isso é o oposto do padrão atual, em que "Atenção Necessária" está sempre presente com seus três atalhos coloridos, independentemente de haver ou não algo a atender.

### 3.2 Zona AGORA

**Estado A — há uma sessão de trabalho ativa** (o estado mais comum durante o expediente):

```
┌────────────────────────────────────────────────────────┐
│  AGORA                                                 │
│                                                        │
│  Proposta comercial — Grupo Almeida                    │
│  Trabalho · Grupo Almeida                              │
│                                                        │
│      47min          de ~1h30 estimados                 │
│      ████████████░░░░░░░░░░░░░                         │
│                                                        │
│  [ Pausar ]  [ Concluir ]              ⋯               │
└────────────────────────────────────────────────────────┘
```

- O tempo decorrido é o maior elemento tipográfico da tela
- A barra é a única representação de progresso; nenhum outro elemento da tela compete com ela
- Quando o decorrido passa de ~1.3× o estimado, a barra muda de cor e uma linha discreta aparece: *"20min além do estimado"*. Sem modal, sem alerta, sem interrupção — é notificação de camada **ambiente**, conforme `MASTER_STRATEGIC_AUDIT.md` §11.2
- `⋯` abre: trocar de item, corrigir tempo, adicionar nota de retomada

**Estado B — nenhuma sessão ativa, há foco definido:**

```
┌────────────────────────────────────────────────────────┐
│  AGORA                                                 │
│                                                        │
│  Próximo: Proposta comercial — Grupo Almeida           │
│  ~1h30 · você tem 2h15 antes da reunião das 15h        │
│                                                        │
│  [ Começar ]                          trocar foco →    │
└────────────────────────────────────────────────────────┘
```

Uma frase que junta duração, espaço disponível e a próxima restrição. Um botão primário. Essa é a tela que responde "o que faço agora" em menos de 3 segundos.

**Estado C — nenhuma sessão, nenhum foco definido:**

```
┌────────────────────────────────────────────────────────┐
│  AGORA                                                 │
│                                                        │
│  Você tem 5h de trabalho disponíveis hoje.             │
│  Sugestões, considerando prazo e tempo disponível:     │
│                                                        │
│  ○ Proposta Grupo Almeida     ~1h30   prazo em 2 dias  │
│  ○ Revisar criativos Sartec   ~45min  vence hoje       │
│  ○ Retomar: Portfólio         ~2h     parado há 9 dias │
│                                                        │
│  [ Definir foco do dia ]                               │
└────────────────────────────────────────────────────────┘
```

Este é o estado de início de manhã. As três sugestões vêm do motor determinístico (P1-4), ordenadas por prazo × tempo disponível × tempo desde a última sessão. Nenhuma chamada de IA. A justificativa aparece ao lado de cada sugestão — atendendo à exigência do briefing de que toda recomendação diga *por quê*.

**Estado D — fora do horário de trabalho:**

```
┌────────────────────────────────────────────────────────┐
│  Fora do expediente.                                   │
│  Amanhã você começa às 8h30 com 2 compromissos.        │
└────────────────────────────────────────────────────────┘
```

Um sistema que sabe quando parar é parte da promessa de reduzir carga mental, não aumentá-la. À noite, a tela deve dizer menos, não mais.

### 3.3 Zona DEPOIS

Uma **linha do tempo única** que funde compromissos e trabalho planejado no mesmo eixo vertical — hoje eles vivem em seções separadas `[DOSSIÊ: seções 3, 4 e 5]`, o que impede ver o dia como um todo contínuo.

```
DEPOIS                              5h disponíveis · 3h30 comprometidas · ajustar

  agora ──  Proposta Grupo Almeida              ~1h30    em curso
            ─────────────────────────────────────────────────────
            2h livres
            ─────────────────────────────────────────────────────
  15:00     Reunião — Grupo Almeida               1h      Calendar
            ⚠ preparação pendente
            ─────────────────────────────────────────────────────
  16:00     Revisar criativos Sartec              ~45min  planejado
            ─────────────────────────────────────────────────────
            1h livre
```

Decisões de desenho:

- **O espaço livre é representado visualmente**, não calculado mentalmente. "2h livres" ocupa espaço proporcional na linha. Isso é o que torna a capacidade tangível — e é o que hoje não existe em lugar nenhum.
- **Almoço, academia, pausas e deslocamentos NÃO aparecem.** `[Correção de 24/07/2026]` A primeira versão os incluía como "blocos de vida" em peso reduzido. Isso estava errado: são rotinas que já funcionam sem o painel, e listá-las adiciona ruído sem resolver problema nenhum. Elas já estão descontadas nas "5h disponíveis" — a linha do tempo não mente sobre o dia, ela apenas não repete o que é constante.
- **Compromissos do Calendar aparecem** porque variam por dia, exigem preparação e são esquecíveis. A fronteira não é pessoal vs. profissional; é rotina estável vs. compromisso esquecível. Uma consulta médica apareceria; a academia de terça, não.
- **"ajustar" é um controle discreto no cabeçalho**, não um formulário. Tocar abre `3h · 4h · 5h · 6h · outro` e vale só para hoje.
- **A origem de cada bloco é explícita** (Calendar / planejado). Lucas precisa saber o que ele controla e o que vem de fora.
- **Alertas contextuais aparecem no bloco**, não em uma seção separada. "⚠ preparação pendente" fica junto à reunião, onde é acionável.
- Sem borda e sem sombra nesta zona. Separação por linha fina e espaço. Ver [`APPLE_LIKE_EXPERIENCE_PRINCIPLES.md`](./APPLE_LIKE_EXPERIENCE_PRINCIPLES.md).

Uma linha de contexto semanal no topo, quando relevante:

> *"Esta semana está apertada: 32h comprometidas de 30h disponíveis."*

Uma frase. O detalhe fica na Agenda. Isso responde a décima pergunta do briefing sem trazer a semana inteira para a tela diária.

### 3.4 Zona ATENÇÃO

**Aparece apenas quando há algo.** Quando vazia, a tela termina em Depois — e ver a tela terminar é, em si, uma informação útil.

```
ATENÇÃO

  ⚠  Você comprometeu 6h e tem 4h30 disponíveis.
     Mover "Revisar criativos" para amanhã resolve.
     [ Mover ]  [ Ignorar hoje ]

  ⚠  Grupo Almeida: reunião às 15h sem preparação registrada.
     [ Preparar agora ]  [ Ver projeto ]

  ○  Portfólio está parado há 9 dias e não tem próxima ação.
     [ Definir próxima ação ]  [ Adiar ]
```

Cada cartão contém obrigatoriamente os quatro elementos da seção 8 do briefing:

1. **O que** — a afirmação
2. **Por quê** — o número ou o fato que a sustenta
3. **Impacto** — o que a ação sugerida resolve
4. **Ação** — um botão que executa, e um que dispensa

**Regra de contenção:** no máximo três cartões simultâneos. Se houver mais condições verdadeiras, mostrar as três de maior urgência e uma linha *"mais 4 na revisão"*. Uma zona de atenção com dez itens não é atenção — é uma segunda caixa de entrada.

**Dispensar é permanente por período.** "Ignorar hoje" suprime aquela chave de deduplicação até o fim do dia. Sem isso, a zona vira ruído em uma semana. Ver `MASTER_STRATEGIC_AUDIT.md` §11.3.

---

## 4. Classificação da informação

Conforme pedido na seção 17 do briefing:

### Sempre visível

- Atividade atual ou próxima decisão (Agora)
- Tempo decorrido e estimado da sessão em curso
- Linha do tempo do restante do dia
- Total disponível vs. comprometido

### Visível somente quando relevante

- Sobrecarga de capacidade
- Dependências de terceiros vencidas
- Preparação pendente de reunião
- Projeto parado sem próxima ação
- Prazo próximo sem trabalho iniciado
- Contexto semanal (só quando fora do normal)

### Deve ser acionável

- **Tudo** na zona Atenção — um cartão sem ação é uma notificação disfarçada de informação, e produz exatamente a sensação de impotência que o briefing quer evitar
- Cada bloco da linha do tempo (tocar inicia sessão, reagenda ou abre detalhe)
- Cada sugestão do estado C (tocar define o foco)

### Deve ser recomendação da IA ou de regra

- A escolha das três sugestões do estado C
- O aviso de sobrecarga com proposta concreta de o que mover
- A detecção de projeto parado
- O nudge de troca de contexto antes de compromisso

Todas determinísticas na primeira versão (P1-4). LLM só entra em P2-3, e só depois de haver evidência do que as regras não conseguem dizer.

### Deve sair da tela

- **Pulso dos Projetos** → revisão semanal
- **Aguardando** como lista permanente → só entra em Atenção quando vence
- **Atenção Necessária** com três atalhos coloridos permanentes → funde com Atenção condicional
- **Próximas Ações** como lista rolável de `max-h-96` → reduz a três sugestões contextuais; a lista completa é a Entrada
- **Dos planos ativos** como seção separada → itens materializados por recorrência são itens do dia; a origem é um detalhe, não uma categoria

---

## 5. Comportamento mobile

O mobile não recebe as três zonas reduzidas — recebe **uma zona por vez**, com Agora como padrão.

```
┌─────────────────────┐
│  AGORA              │
│                     │
│  Proposta           │
│  Grupo Almeida      │
│                     │
│      47min          │
│   de ~1h30          │
│   ███████░░░░       │
│                     │
│  [   Pausar   ]     │
│  [  Concluir  ]     │
│                     │
│  ─────────────────  │
│  Depois: reunião    │
│  15h · 2h livres    │
│                     │
│  ⚠ 1 item em        │
│    atenção      →   │
└─────────────────────┘
```

- Zona Agora ocupa a tela: é a única coisa que Lucas consulta no celular durante o trabalho
- Depois vira uma linha resumida, expansível
- Atenção vira um contador tocável
- Ações primárias na metade inferior, alcançáveis com o polegar

Detalhamento em [`MOBILE_EXPERIENCE_STRATEGY.md`](./MOBILE_EXPERIENCE_STRATEGY.md).

---

## 6. Estados que precisam ser bem resolvidos

Um cockpit é julgado pelos estados ruins, não pelo estado ideal.

| Estado | Comportamento correto |
|---|---|
| **Primeiro acesso do dia** | Estado C com sugestões. Nunca uma tela vazia com "defina seu foco" — isso transfere o trabalho de volta a Lucas |
| **Nada capturado, nada planejado** | *"Nada planejado para hoje. Você tem 5h livres."* Neutro, sem culpa, sem exclamação |
| **Google Calendar indisponível** | A linha do tempo mostra o trabalho planejado e uma linha discreta: *"Compromissos indisponíveis no momento."* **Nunca** esconder tudo por falha de integração — o produto já estabelece esse princípio de desacoplamento `[DOSSIÊ §1.4]`, e a tela Hoje deve honrá-lo |
| **Sessão esquecida aberta a noite toda** | Ao detectar sessão ativa > 4h sem interação, perguntar na volta: *"Sessão de ontem ficou aberta por 14h. Quanto tempo você realmente trabalhou?"* com sugestão. **Nunca** registrar 14h silenciosamente — dado errado é pior que dado ausente |
| **Carregando** | Esqueleto com a estrutura das três zonas, não spinner central. A forma da tela deve aparecer antes do conteúdo |
| **Offline** | Última versão conhecida com marca de horário. `DataErrorNotice` já existe para isso `[CÓDIGO]` |

---

## 7. Critérios de sucesso

Como saber se o redesenho funcionou:

1. **Menos de 3 segundos** entre abrir a tela e saber o que fazer, na maior parte dos dias
2. **Sem rolagem** para responder "o que faço agora" e "quanto tempo tenho", em desktop
3. **Zona Atenção vazia** na maioria dos dias — se estiver sempre cheia, as regras estão mal calibradas e devem ser afrouxadas, não a tela redesenhada
4. **A sessão de trabalho é iniciada pela tela Hoje** na maior parte das vezes — se Lucas inicia por outro caminho, a zona Agora não está cumprindo seu papel
5. **Redução no número de vezes que Lucas abre `/revisao`** — se ele continua indo lá diariamente, algo que deveria estar em Atenção não está

---

## 8. O que este redesenho deliberadamente não faz

- **Não remove o foco de 3 itens.** É uma boa restrição, validada no domínio `[CÓDIGO]`. Ela ganha ordem e duração, não desaparece.
- **Não introduz arrastar e soltar** para reordenar a linha do tempo. Alto custo de implementação, ruim no mobile, e resolve um problema que um seletor simples resolve.
- **Não introduz visão de calendário por hora** dentro de Hoje. Isso é a Agenda. Hoje é sobre decisão, não sobre planejamento.
- **Não adiciona gráficos.** Nenhum número histórico pertence à tela do agora. Tempo por projeto e comparação planejado vs. realizado vivem na revisão semanal.
- **Não usa IA na primeira versão.** Todas as sugestões e alertas são determinísticos. A IA entra depois, quando houver evidência do que falta.
- **Não exibe almoço, academia, pausas nem deslocamentos.** `[Correção de 24/07/2026]` Esses períodos existem apenas como redução do número de horas disponíveis. Não aparecem na linha do tempo, não geram notificação, não exigem conclusão e não entram na revisão. O painel não controla o que já funciona.
