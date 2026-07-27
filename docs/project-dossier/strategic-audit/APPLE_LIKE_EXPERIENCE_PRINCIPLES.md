# Princípios de Experiência — Aplicação Concreta

Complemento de [`MASTER_STRATEGIC_AUDIT.md`](./MASTER_STRATEGIC_AUDIT.md) §7. Recomendação P2-1.

> **Classificação de evidência (revisão de 25/07/2026).** As marcações `[DOSSIÊ]` neste documento confirmam **fatos de código** (classes Tailwind, famílias de cor, radius e sombras em uso, ausência de componente compartilhado) — isso é `SCREEN_COPY_AND_FLOW_INVENTORY.md` e `DESIGN_SYSTEM_AND_VISUAL_AUDIT.md` lidos corretamente. O dossiê final confirma que **nenhuma tela interna foi observada visualmente** — só as duas capturas públicas de `/login`. Por isso, qualquer afirmação sobre como uma tela **parece** ou **é sentida** hoje (ex.: "cinco cores de alerta simultaneamente", "todo elemento tem o mesmo peso") é uma **inferência plausível a partir dos tokens**, não uma validação visual direta. As recomendações abaixo continuam válidas como hipóteses de trabalho — não foram removidas — mas devem ser confirmadas contra screenshots reais de produção (ver Fase 0, entrega 6, em `FEATURE_ROADMAP.md`) antes de qualquer implementação ampla.

---

## 0. O que "inspirado na Apple" significa aqui

O briefing é explícito: não copiar estética. Os princípios pedidos são interface calma, baixo ruído, hierarquia clara, animação discreta, resposta imediata, controles previsíveis, texto simples, ótima experiência mobile, complexidade progressiva, poucos passos, bom feedback, erros compreensíveis, consistência, sensação de cuidado.

Todos esses princípios têm uma tradução técnica concreta. Nenhum deles é "usar cinza claro e cantos arredondados". Este documento traduz cada um.

**Uma advertência que o próprio briefing faz e que assumo integralmente:** "Apple-like" não pode ser justificativa para remover funcionalidade necessária. Onde eu recomendo remover algo neste documento, a justificativa é sempre "isso duplica outra coisa" ou "isso é ruído sem função" — nunca "isso é demais visualmente".

---

## 1. Interface calma

### O que impede a calma hoje

**Nove famílias de cor em uso simultâneo** `[DOSSIÊ]`: gray, blue, red, amber, green/emerald, orange, yellow, purple, teal. Cinco ocupam a mesma faixa semântica de alerta.

Cenário realista: uma tela Hoje com prazo estourado (vermelho), item bloqueado (laranja), inbox antiga (amarelo), agendamento (roxo) e aviso de capacidade (âmbar) exibe cinco cores de alerta simultaneamente. Nenhuma delas significa nada, porque todas gritam.

Pior: `red` carrega três significados conflitantes — erro, urgência e "Decisão" `[DOSSIÊ]`. Uma Decisão registrada é um tipo neutro de item, não um problema. Renderizá-la com `bg-red-50 border-red-200` treina Lucas a ignorar vermelho.

### A regra

Três papéis de cor, e apenas três:

| Papel | Uso | Proporção alvo da tela |
|---|---|---|
| **Neutro** | Praticamente tudo: texto, fundos, separadores, estados normais | ~90% |
| **Acento** | Ação primária, estado ativo de navegação, sessão em curso | ~7% |
| **Alerta** | Somente o que exige decisão hoje | ~3%, frequentemente 0% |

**Sucesso não precisa de cor.** Uma tarefa concluída pode ser texto riscado em cinza. Verde para confirmação é um reflexo herdado, não uma necessidade — e cada cor a menos aumenta o poder das que ficam.

**Tipos de item deixam de ser codificados por cor de fundo.** Decisão, ideia, insight, referência e nota passam a usar ícone + rótulo em neutro. O ícone `Target` para Decisão já existe `[DOSSIÊ]`; o que sai é o `bg-red-50 border-red-200`.

**Prioridade deixa de ser badge colorido.** Vira ordenação. A informação "isto é mais importante" é melhor comunicada pela posição do que por uma etiqueta laranja — e libera a cor para o que é realmente urgente.

### Como validar

Tirar uma captura de tela de Hoje em um dia movimentado e contar as cores. Se houver mais de duas além do neutro, a regra foi violada.

---

## 2. Baixo ruído visual

### O que produz ruído hoje

O padrão `bg-white rounded-xl shadow-sm border p-4 md:p-6` é *"repetido manualmente em dezenas de arquivos, não extraído em componente"* `[DOSSIÊ]`. Consequência: **todo elemento tem o mesmo peso.**

Cada card desenha uma borda, uma sombra e um fundo. Em uma tela com oito cards, isso são vinte e quatro elementos visuais que não carregam informação nenhuma — existem apenas para dizer "isto é um bloco". O espaço em branco já diz isso, de graça.

### A regra

Três níveis de contenção, com critério explícito:

| Nível | Aparência | Quando usar |
|---|---|---|
| **Nenhum** | Só espaço e tipografia | Padrão. A maior parte do conteúdo |
| **Sutil** | Fundo levemente distinto, sem borda, sem sombra | Agrupamento de itens relacionados |
| **Elevado** | Fundo + sombra suave | Somente elementos flutuantes: modais, popovers, a zona Agora |

Aplicado à tela Hoje redesenhada: **um único elemento elevado** (zona Agora), o resto separado por espaço e peso tipográfico. A hierarquia passa a vir de tamanho, peso e posição — que é como hierarquia funciona em tipografia há quinhentos anos.

### Radius e sombra

Hoje: `rounded-lg` e `rounded-xl` convivem sem critério; cinco níveis de sombra (`sm`, `md`, `lg`, `xl`, `2xl`) com três modais usando três sombras diferentes `[DOSSIÊ]`.

Proposta:
- **Dois valores de radius:** um para elementos pequenos (botões, campos, badges), outro para superfícies (cards, modais, folhas)
- **Duas sombras:** uma para elevado, uma para flutuante. Nada mais.

---

## 3. Hierarquia clara

### A regra dos três níveis por tela

Toda tela deve ter exatamente:

1. **Um** elemento de primeiro nível — o que Lucas veio ver
2. **Poucos** de segundo nível — contexto imediato
3. **O resto** em terceiro nível — disponível, não competindo

Em Hoje: primeiro nível é o tempo decorrido da sessão atual. Segundo é a linha do tempo. Terceiro é tudo mais.

Teste prático: apertar os olhos até a tela desfocar. O que continua legível deve ser exatamente o primeiro nível. Se três coisas continuam legíveis, a hierarquia não existe.

### Escala tipográfica

Hoje há sete tamanhos, incluindo `text-[10px]` arbitrário fora da escala `[DOSSIÊ]`.

Proposta de cinco papéis, não sete tamanhos:

| Papel | Uso |
|---|---|
| **Destaque** | O número da sessão atual. Um por tela, no máximo |
| **Título** | Título de página |
| **Seção** | Cabeçalho de zona |
| **Corpo** | Texto padrão — a maior parte de tudo |
| **Apoio** | Metadados, timestamps, justificativas |

`text-[10px]` sai. Se algo precisa ser menor que o nível de apoio para caber, o problema é de conteúdo, não de tipografia.

---

## 4. Animações discretas e transições naturais

### A regra

Movimento tem exatamente três funções legítimas. Qualquer animação que não sirva a uma delas sai:

1. **Mostrar origem e destino.** Modal cresce de onde foi acionado; folha mobile sobe de baixo. Isso responde "de onde isso veio" sem texto.
2. **Confirmar que algo aconteceu.** Item concluído desaparece com transição curta em vez de sumir instantaneamente. Sem isso, Lucas duvida se o clique funcionou.
3. **Preservar contexto durante mudança.** Ao expandir um item, o conteúdo ao redor se desloca continuamente em vez de saltar.

Não legítimo: animação de entrada em carregamento de página, contadores que sobem, elementos que aparecem em cascata, qualquer coisa "para dar vida".

### Duração e curva

- Micro-feedback (botão, checkbox): imperceptível, ~100ms
- Transição de estado (expandir, revelar): ~200ms
- Entrada de superfície (modal, folha): ~250–300ms
- Curva: aceleração suave na entrada, desaceleração na saída. Nunca linear — movimento linear parece mecânico

**Nada acima de 300ms.** Acima disso, animação vira espera.

### Respeitar preferência de movimento reduzido

`prefers-reduced-motion` deve desligar todo movimento não essencial. Isso é acessibilidade, não refinamento.

---

## 5. Respostas imediatas

### O problema técnico por trás do princípio

`[INFERÊNCIA a partir do Diagrama 2]` O `ChangeNotifier` dispara e o `useReactiveQuery` *"re-executa fetch automaticamente"*. Se a notificação não for granular, cada mutação em Hoje — que tem múltiplas queries ativas — provoca re-fetch de todas.

Com sessões de trabalho (P1-1), que geram mutações a cada início/pausa/fim, isso piora. Este é um pré-requisito técnico da sensação de imediatismo, e está em [`TECHNICAL_EVOLUTION_PLAN.md`](./TECHNICAL_EVOLUTION_PLAN.md).

### A regra de interface

**Toda ação do usuário deve produzir resposta visual em menos de 100ms**, mesmo que o servidor demore.

- Concluir item: sai da lista imediatamente; reverte com aviso se falhar
- Iniciar sessão: cronômetro começa a contar imediatamente
- Editar inline: o valor muda no ato

**Onde não usar atualização otimista:** ações que criam efeito externo irreversível — criar evento no Google Calendar, enviar e-mail. Aí é melhor esperar e confirmar. Mentir sobre um e-mail enviado é pior que 800ms de espera.

### Estados de espera

- **< 300ms:** nada. Um spinner que pisca é pior que espera nenhuma
- **300ms–2s:** indicador no lugar do conteúdo, com a forma do conteúdo (esqueleto)
- **> 2s:** progresso com texto do que está acontecendo. O produto já faz isso bem: *"Isso pode levar até 2 minutos"* e *"O documento original está preservado — nada foi perdido"* `[DOSSIÊ]` — esse é o padrão a replicar

---

## 6. Controles previsíveis

### Regras

1. **O mesmo controle faz a mesma coisa em todo lugar.** Hoje, "arquivar" usa `window.confirm` na Entrada `[DOSSIÊ]` — um diálogo do navegador, visualmente estranho ao produto e impossível de estilizar.
2. **Ação primária sempre no mesmo lugar.** Em modais: canto inferior direito no desktop, largura total na parte inferior no mobile.
3. **Destrutivo nunca adjacente a construtivo.** Separação física, não apenas cor.
4. **Nada mais destrutivo que arquivar deve existir sem desfazer.** Ver §9.

### Sobre confirmações

`window.confirm` deve sair inteiramente. Mas o substituto não é um modal customizado — na maior parte dos casos é **desfazer**.

Arquivar um item com confirmação: dois passos, toda vez, para uma ação reversível.
Arquivar com desfazer: um passo, e o segundo passo só existe no raro caso de engano.

Confirmação fica reservada para o que é genuinamente irreversível: limpar dados locais na migração (que já usa confirmação em duas etapas `[DOSSIÊ]` — correto), desconectar integração.

---

## 7. Textos simples

### O problema

Três diagnósticos do dossiê convergem aqui:

1. *"Terminologia inconsistente: 'Prazo' vs 'Data Limite' vs 'Due Date' para o mesmo conceito em telas diferentes"* `[DOSSIÊ]`
2. *"Texto técnico exposto ao usuário final em pelo menos 5 pontos"* `[DOSSIÊ]`
3. Cards de diagnóstico expondo `permission_denied` diretamente `[DOSSIÊ]`

### Glossário mínimo

Um termo por conceito, aplicado sem exceção:

| Conceito | Termo | Nunca usar |
|---|---|---|
| Data em que algo vence | **Prazo** | Data limite, due date, deadline |
| Data/hora marcada | **Agendado** | Agendamento, scheduled, compromisso (para itens) |
| Compromisso externo do Calendar | **Compromisso** | Evento, agendamento |
| Aguardando terceiro | **Aguardando** | Bloqueado, blocked, travado |
| Tempo previsto | **Estimativa** | Duração prevista, tempo estimado |
| Tempo registrado | **Tempo trabalhado** | Tracked, realizado, gasto |
| Trabalho em curso | **Sessão** | Timer, cronômetro, tracking |

Esta é a mudança de maior retorno por esforço de toda a auditoria de UI: um documento e um `find`.

### Regras de escrita

- **Frase em vez de rótulo, quando a frase informa mais.** "2h livres antes da reunião" > "Disponível: 2h"
- **Números específicos em vez de qualificadores.** "9 dias" > "há bastante tempo"
- **Direto na segunda pessoa.** "Você comprometeu 6h e tem 4h30" — o briefing pede IA diretiva; a copy inteira deve ser diretiva
- **Sem exclamação.** "Item capturado com sucesso!" `[DOSSIÊ]` vira "Capturado." O ponto de exclamação não adiciona informação e adiciona ruído emocional a uma ação corriqueira
- **Sem "por favor" e sem desculpas.** O sistema é uma ferramenta, não um atendente

---

## 8. Detalhes bem resolvidos

Lista concreta, verificável, extraída dos achados do dossiê:

| Detalhe | Estado atual | Correção |
|---|---|---|
| Áreas de toque | `p-1`/`p-1.5` sobre ícones de 16–20px, ~28px reais `[DOSSIÊ]` | Mínimo 44×44px em todo alvo tocável. `ItemCompleteButton` já é o modelo |
| Anel de foco | Formulários usam `focus:ring-2`; edição inline usa só `focus:border` `[DOSSIÊ]` | Anel visível em tudo que recebe foco, sem exceção |
| Contraste | Nota de privacidade no login em cinza muito claro sobre `#f9fafb` `[HIPÓTESE — verificável]` | Mínimo 4.5:1 para texto corrido, 3:1 para texto grande |
| Larguras de container | Três valores concorrentes sem critério `[DOSSIÊ]` | Dois: um para leitura/formulário, um para painel |
| Sombras de modal | Três modais, três sombras `[DOSSIÊ]` | Uma sombra para superfície flutuante |
| Estado vazio | Existe, mas varia por tela | Padrão único: o que é este lugar + uma ação |
| Truncamento | Não especificado no dossiê | Nunca truncar sem acesso ao conteúdo completo |
| Zona segura mobile | Não mencionada `[INFERÊNCIA]` | `env(safe-area-inset-*)` em elementos fixos — sem isso, o FAB colide com o indicador de gestos do iPhone |

---

## 9. Erros compreensíveis

### Regra estrutural

**Nenhuma categoria técnica de erro deve chegar à interface.** Sempre uma camada de tradução entre a causa técnica e a mensagem.

Todo erro visível responde três coisas:

1. **O que aconteceu**, em linguagem comum
2. **Se algo foi perdido** — e a resposta preferencial é "não"
3. **O que fazer agora**

O produto já tem um exemplo excelente: *"O documento original está preservado — nada foi perdido."* `[DOSSIÊ]` Essa frase antecipa a pergunta real do usuário. É o padrão.

### Tabela de tradução

| Técnico | Interface |
|---|---|
| `permission_denied` | "Sem acesso a estes dados. Tente sair e entrar novamente." |
| `Failed to fetch` | "Sem conexão. Suas alterações serão salvas quando voltar." |
| HTTP 500 na transcrição | "A transcrição falhou. Seu áudio ainda está aqui — pode tentar de novo sem regravar." |
| Token OAuth expirado | "A conexão com o Google expirou. Reconectar leva 10 segundos." |
| Timeout na estruturação | "A IA demorou demais. O documento está salvo — pode tentar de novo." |

Nota: o produto **já** tem *"Tentar novamente (sem regravar)"* `[DOSSIÊ]`. Essa é exatamente a mentalidade certa — preservar o trabalho do usuário e dizer isso explicitamente. Generalizar.

### Erro nunca deve ser a primeira coisa que Lucas vê

Se o Google Calendar falha, a linha do tempo mostra o que tem e uma linha discreta sobre o que falta. Uma falha de integração periférica **nunca** deve esvaziar a tela.

---

## 10. Consistência

### Componentes a extrair

Consequência direta de *"repetido manualmente em dezenas de arquivos, não extraído em componente"* `[DOSSIÊ]`:

| Componente | Substitui |
|---|---|
| `Surface` | Todas as variantes manuais de card |
| `Section` | Cabeçalhos de seção com contagem e ação |
| `Badge` | `text-xs` e `text-[10px]` concorrentes |
| `Button` | Variantes de botão espalhadas |
| `Field` | Rótulo + entrada + erro + ajuda |
| `EmptyState` | Estados vazios variados |
| `Modal` | Três implementações de overlay/foco/Escape `[DOSSIÊ]` |
| `ErrorNotice` | `DataErrorNotice` + blocos ad-hoc em 6+ telas `[DOSSIÊ]` |
| `Timeline` | Novo, para a zona Depois |

Nove componentes. Isso não é um design system completo — é o conjunto mínimo que elimina a duplicação identificada.

### Consistência de comportamento importa mais que de aparência

Duas telas com cards ligeiramente diferentes: pouco custo. Dois modais em que Escape funciona em um e não no outro: quebra de confiança. Priorizar comportamento.

---

## 11. Complexidade progressiva

### Aplicação à Captura Rápida

Hoje: 5 campos visíveis na aba texto `[DOSSIÊ]` — conteúdo, título, projeto, tipo, prioridade.

Isso contradiz o princípio central do próprio produto. Se organizar vem depois, por que o formulário de captura pede organização?

Proposta:

```
┌─────────────────────────────────────────┐
│  [ o que você quer registrar? ]         │
│                                          │
│  + detalhes            [ Capturar ]      │
└─────────────────────────────────────────┘
```

Um campo. `Enter` salva. "+ detalhes" revela o resto para quem já sabe onde vai.

**Isso não remove funcionalidade** — remove a exigência de decidir no pior momento para decidir, que é o instante em que a ideia acabou de surgir.

### Aplicação ao detalhe de item

O modal edita todos os atributos mais o painel de proveniência de áudio `[DOSSIÊ]`. Proposta: campos usados sempre em cima; proveniência de áudio, histórico e vínculo de calendário recolhidos por padrão. Estão disponíveis, não presentes.

---

## 12. Sensação de cuidado

Os detalhes que produzem a impressão de que alguém pensou:

- **Números com unidade legível:** "1h30", não "90 minutos" nem "1.5h"
- **Datas relativas quando ajuda:** "amanhã, 15h" em vez de "25/07/2026 15:00". Absoluta quando passa de uma semana
- **Plural correto:** "1 item", "2 itens". Nunca "1 item(ns)"
- **Estados vazios que informam em vez de decorar:** "Nada aguardando retorno." é melhor que uma ilustração
- **Preservar posição de rolagem** ao voltar de um detalhe
- **Foco no lugar certo:** abrir a Captura Rápida coloca o cursor no campo. Fechar devolve o foco ao elemento que a abriu
- **Rótulo do documento útil:** o título da aba do navegador deve dizer algo — "3 focos · Hoje" — porque o painel fica aberto o dia todo entre outras abas
- **Nunca perder texto digitado.** Se um modal fecha por engano, o conteúdo volta ao reabrir

---

## 13. O que não fazer em nome da estética

Explicitamente, para evitar interpretação errada deste documento:

- **Não remover informação necessária para parecer limpo.** O que sai da tela Hoje sai porque tem lugar melhor, não porque polui.
- **Não usar animação para mascarar lentidão.** Corrigir a lentidão.
- **Não adotar vidro fosco, gradientes ou desfoque.** Isso é a estética que o briefing pediu para não copiar. Os princípios são de comportamento.
- **Não esconder ações atrás de gestos não descobríveis.** Deslizar para arquivar é bom **como adição** a um botão visível, nunca como substituto.
- **Não perseguir simetria à custa de hierarquia.** Um grid perfeitamente balanceado é um grid sem prioridade.
- **Não construir tema escuro antes dos tokens.** Sem design system consolidado, tema escuro é trabalho em dezenas de arquivos e vira dívida imediata.

---

## 14. Ordem de aplicação

Nem tudo aqui vale o mesmo. Sequência por retorno sobre esforço:

1. **Glossário e copy** — barato, alto impacto, sem risco
2. **Áreas de toque e anel de foco** — mecânico, corrige acessibilidade
3. **Tradução de erros** — remove o pior sintoma de descuido
4. **Redução de cor** — alto impacto na calma, esforço médio
5. **Componentes base** (`Surface`, `Section`, `Button`, `Field`, `Modal`) — habilita todo o resto
6. **Redução de contenção visual** (menos borda e sombra) — só depois dos componentes
7. **Motion** — por último; é refinamento sobre uma base correta

Os passos 1 a 3 podem ser feitos junto com P0/P1 sem atrapalhar. Os passos 4 a 7 são P2-1 e devem esperar a forma final de Hoje (P1-2) para não gerar retrabalho.
