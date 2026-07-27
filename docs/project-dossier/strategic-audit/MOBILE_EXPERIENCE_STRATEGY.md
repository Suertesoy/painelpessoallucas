# Estratégia Mobile — Painel Pessoal Lucas

Complemento de [`MASTER_STRATEGIC_AUDIT.md`](./MASTER_STRATEGIC_AUDIT.md) §8. Recomendações P0-1, P1-6, P2-2.

---

## 1. O princípio: o mobile não é o desktop menor

### 1.1 O que existe hoje

`[DOSSIÊ]` Breakpoint `md:` (768px) como fronteira única. Abaixo dele: barra superior fixa `h-14` com título, ícone de busca e menu hambúrguer que abre drawer; FAB redondo de 56px no canto inferior direito para Captura Rápida; `ItemDetailModal` vira folha de tela cheia.

Isso é responsividade competente. Os **fluxos**, porém, são idênticos aos do desktop.

### 1.2 O que os casos de uso reais exigem

O briefing lista oito usos mobile: captura rápida, áudio, lista de compras, agendar fora de casa, consultar a próxima atividade, confirmar ações, trocar a atividade atual, receber notificações.

Duas características comuns a todos:

**São de 5 a 30 segundos.** Nenhum é de leitura extensa ou edição complexa.

**Acontecem em condições ruins.** Andando, na rua, com uma mão, saindo de um cliente, com o telefone entre a orelha e o ombro.

Um produto desenhado para isso não é o mesmo produto com colunas empilhadas. É um produto com **menos escolhas por tela e alvos maiores**.

---

## 2. Diagnóstico dos problemas

### 2.1 A captura custa toques demais

`[INFERÊNCIA a partir do fluxo descrito no DOSSIÊ]`

Para capturar por voz: FAB → aba Áudio → botão gravar → falar → parar → enviar. **Seis interações antes de a transcrição começar.**

Para capturar texto: FAB abre um modal com 5 campos visíveis (conteúdo, título, projeto, tipo, prioridade) `[DOSSIÊ]`. Cinco decisões possíveis no momento em que Lucas quer apenas registrar antes de esquecer.

Isso contradiz o princípio central do produto. **Se organizar vem depois, por que o formulário de captura pede organização?**

### 2.2 Não existe PWA

`[INFERÊNCIA de alta confiança]` Nenhuma menção a manifest, service worker, ícones de aplicativo ou push em nenhum dos 10 documentos do dossiê, nem nos 15 componentes, nem nas 32 rotas de build.

Consequência dura: **as notificações da seção 11 do briefing são impossíveis no iPhone.** O Safari em iOS só entrega Web Push para aplicações adicionadas à Tela de Início. Sem PWA, "sua reunião começa em uma hora" só existe se o painel estiver aberto na tela — o que no celular praticamente nunca é o caso.

Isso torna P2-2 uma dependência dura de metade da seção 11 do briefing, não um refinamento.

### 2.3 Homologar a sincronização mobile

`[DOSSIÊ]` Detalhado em P0-1. É o item de maior prioridade de toda a auditoria para o mobile, porque **invalida tudo o mais** se não estiver confirmado: se Lucas não confia que o que ele captura no celular chega ao desktop, ele não captura no celular. `[Correção de 25/07/2026]` O projeto já recebeu correções de sincronização/sessão/workspace/timestamps; a etapa que falta é homologar esses fluxos em uso real, não diagnosticar um bug do zero — ver o roteiro em `PRIORITIZED_RECOMMENDATIONS.md` P0-1.

### 2.4 Seletores de data e hora

`[DOSSIÊ]` A Entrada usa `date input` para agendamento. Inputs nativos de data são aceitáveis. O problema é **hora**: o seletor nativo do iOS Safari é uma roda que exige precisão de toque — exatamente o que não se tem saindo de uma reunião.

### 2.5 A busca está escondida

`[DOSSIÊ]` No desktop, a Busca Global tem botão dedicado na barra lateral e atalho `Ctrl+K`. No mobile, é um ícone na barra superior. E `Ctrl+K` não existe no celular.

"Encontrar informações antigas" é uma dificuldade declarada por Lucas, e a busca já a resolve bem. É a maior distância entre valor e visibilidade no produto.

### 2.6 Áreas de toque e zona segura

`[DOSSIÊ]` Botões só-ícone com `p-1`/`p-1.5` sobre ícones de 16–20px resultam em alvos de ~28px — abaixo do mínimo de 44px, e o problema aparece justamente onde mais importa.

`[INFERÊNCIA]` A zona segura (`env(safe-area-inset-*)`) não é mencionada em lugar nenhum do dossiê. Sem ela, o FAB no canto inferior direito colide com o indicador de gestos do iPhone.

---

## 3. Fluxos que devem ser diferentes no mobile

Esta é a resposta direta ao pedido do briefing.

### 3.1 Captura por voz: um gesto

**Pressão longa no FAB inicia a gravação diretamente.** Sem abrir modal, sem escolher aba.

```
manter pressionado  →  grava enquanto o dedo estiver na tela
soltar              →  para e envia para transcrição
arrastar para cima  →  cancela
```

Um gesto, sem precisão de toque, executável com uma mão em movimento. É o padrão de mensagem de voz que Lucas já usa dezenas de vezes por dia em outro aplicativo — **memória muscular existente é o recurso de interface mais barato disponível**.

O feedback precisa ser inequívoco: vibração ao iniciar, indicador de amplitude durante, vibração ao soltar. Sem isso, pressão longa parece travamento.

**O toque simples continua abrindo a captura de texto** — o gesto adiciona, não substitui.

### 3.2 Captura por texto: um campo

```
┌─────────────────────┐
│                     │
│  [ registrar...  ]  │  ← teclado já aberto, foco no campo
│                     │
│  + detalhes         │
│                     │
│    [  Capturar  ]   │  ← alcance do polegar
└─────────────────────┘
```

Um campo visível. Os outros quatro atrás de "+ detalhes". Salvar com o mínimo é o comportamento correto — classificação é progressiva.

### 3.3 Correção de transcrição adaptada ao mobile

O passo de P0-2 no mobile precisa de tratamento próprio:

```
┌─────────────────────┐
│  Transcrição        │
│                     │
│  Reunião com o      │
│  grupo Almeida na   │
│  quinta às duas da  │
│  tarde para revisar │
│  a proposta         │
│                     │
│  toque para corrigir│
│                     │
│  [ Analisar com IA ]│
│  [   Só salvar    ] │
└─────────────────────┘
```

- Texto grande e legível — a correção exige leitura confortável
- Editável ao toque, sem botão "editar" separado
- Duas ações empilhadas na base, ambas alcançáveis com o polegar
- **"Só salvar" nunca deve ser secundário demais.** Na rua, o mais comum é registrar e resolver depois

### 3.4 Agendar fora de casa: relativo antes de absoluto

Substituir o seletor de data e hora por escolhas relativas:

```
Quando?
  [ hoje 14h ]  [ hoje 16h ]  [ amanhã cedo ]
  [ amanhã tarde ]  [ próxima terça ]
  [ escolher data e hora ]
```

As opções são geradas a partir da capacidade real — sugerindo horários que realmente estão livres. Isso transforma um seletor genérico em uma sugestão informada, com zero esforço adicional para Lucas.

O seletor preciso continua disponível, como último item.

### 3.5 Consultar a próxima atividade: a tela padrão

Abrir o painel no celular durante o expediente deve mostrar a zona Agora, nada mais.

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
│  Depois:            │
│  15h reunião        │
│  2h livres          │
│                     │
│  ⚠ 1 em atenção  →  │
└─────────────────────┘
```

Uma pergunta, uma resposta, duas ações. Rolar revela o restante do dia.

### 3.6 Lista de compras: um modo, não uma tela

Quando o filtro de área é `casa` e o tipo é lista de compras (P2-10), a interface muda de comportamento:

- Itens em lista densa, marcáveis com um toque em qualquer parte da linha
- Adicionar novo item sem sair da lista, com o teclado permanentemente aberto
- Marcados vão para o fim, esmaecidos, sem sumir
- Sem cards, sem badge, sem metadado

Este é o caso que mais testa se o painel realmente comporta a vida pessoal. Se comprar detergente exigir escolher tipo e prioridade, Lucas usa outro aplicativo — e o ponto único se quebra.

### 3.7 Confirmar ações da IA

A revisão de triagem por áudio `[CÓDIGO: AudioCaptureReview]` no mobile:

- Uma proposta por vez, não todas empilhadas
- Ação primária de largura total na base
- Deslizar horizontalmente entre propostas
- Aprovar tudo disponível quando todas forem de alta confiança
- Alvos de toque de 44px+ em cada checkbox

---

## 4. Navegação mobile

### 4.1 O problema do drawer

`[DOSSIÊ]` Barra superior com hambúrguer que abre drawer. Navegar exige: tocar hambúrguer → ler 8 opções → tocar destino → drawer fecha. Três interações e uma leitura, com o conteúdo coberto durante o processo.

### 4.2 Proposta: barra inferior de quatro destinos

```
┌─────────────────────┐
│                     │
│      conteúdo       │
│                     │
│                     │
├──────┬──────┬───────┤
│ Hoje │Entrada│Buscar │  + FAB flutuante
└──────┴──────┴───────┘
```

Quatro elementos alcançáveis com o polegar:

| Destino | Por quê |
|---|---|
| **Hoje** | O uso mais frequente: consultar a atividade atual |
| **Entrada** | Segundo mais frequente: ver o que foi capturado |
| **Buscar** | Resolve "encontrar informações antigas"; hoje escondido |
| **FAB** | Captura — a ação, não um destino |

Projetos, Agenda, Planos e Configurações ficam em um menu secundário. `[INFERÊNCIA]` São telas de leitura e planejamento — desktop, não celular.

**A busca ganha lugar permanente.** É a mudança de maior retorno na navegação mobile.

---

## 5. PWA e notificações

### 5.1 O mínimo necessário

- **Manifest** com nome, ícones, `display: standalone`, cor de tema
- **Service worker** para instalabilidade e casca offline
- **Ícones** em todos os tamanhos exigidos por iOS e Android

Isso sozinho já entrega: ícone na tela inicial, abertura em tela cheia sem barra do navegador, e carregamento mais rápido.

### 5.2 Web Push

**Android/Chrome:** funciona diretamente.

**iOS/Safari:** exige que o painel seja adicionado à Tela de Início. Isso é um passo manual que o produto precisa **explicar**, não assumir — uma tela de configuração com instrução visual clara.

`[HIPÓTESE — verificar antes de implementar]` O comportamento e as restrições de Web Push em iOS mudam entre versões do Safari. Confirmar o estado atual antes de investir.

### 5.3 O que notificar

Somente três tipos, todos com ação de um toque:

| Tipo | Exemplo | Ação |
|---|---|---|
| **Compromisso próximo** | "Reunião Grupo Almeida em 15min" | Ver · Dispensar |
| **Preparação pendente** | "Consulta amanhã 9h — preparação pendente" | Preparar · Dispensar |
| **Troca de atividade** | "Você está há 2h nesta tarefa" | Concluir · Continuar |

**O que nunca notificar por push:** projeto parado, inbox envelhecendo, capacidade comprometida, resumos. Nada disso é urgente, e push para não-urgente é o caminho mais rápido para as notificações serem desligadas — e aí as três que importam morrem junto.

A regra de deduplicação de `MASTER_STRATEGIC_AUDIT.md` §11.3 vale integralmente e é ainda mais crítica aqui.

### 5.4 Offline

Com service worker, o mínimo viável:

- A casca carrega sempre
- A última versão de Hoje fica em cache e é exibida com marca de horário
- **Capturas feitas offline entram em fila e sincronizam ao reconectar**

O último ponto é o mais valioso. Metrô, elevador, área sem sinal — capturar precisa funcionar sempre. É o princípio de resistência a falhas que o produto já declara `[DOSSIÊ §1.4]`, estendido ao mobile.

---

## 6. Detalhes técnicos que definem a qualidade

| Item | Requisito |
|---|---|
| **Áreas de toque** | 44×44px mínimo, sem exceção |
| **Zona segura** | `env(safe-area-inset-bottom)` no FAB e na barra inferior |
| **Teclado iOS** | Usar `dvh`, não `vh` — o produto já usa `h-dvh` no AppShell `[DOSSIÊ]`, manter |
| **Zoom automático iOS** | Campos com `font-size` ≥16px, senão o Safari dá zoom ao focar |
| **Rolagem** | Sem rolagem aninhada. `max-h-96` com rolagem interna `[DOSSIÊ]` deve sair no mobile |
| **Folhas modais** | Fechar por arrasto para baixo, além do botão |
| **Rotação** | Retrato apenas nos fluxos de captura; paisagem não agrega |
| **Retorno tátil** | Vibração curta em gravação, conclusão e erro |
| **Estado de rede** | Indicador discreto quando offline, nunca modal bloqueante |

---

## 7. O que o mobile deliberadamente não deve fazer

- **Detalhe de projeto completo.** Cabeçalho com seis campos editáveis inline e cinco seções de itens `[DOSSIÊ]` é uma tela de desktop. No celular: leitura e uma ação (definir próxima ação).
- **Revisão de proposta de plano.** A tela de 534 linhas com cinco tipos de badge `[DOSSIÊ]` é trabalho de revisão cuidadosa. No celular: apenas notificar que há um plano aguardando revisão.
- **Importação de documento.** Colar 120.000 caracteres no celular não é um caso real.
- **Configurações completas.** Somente o essencial: conta, notificações, sair.
- **Edição de longos textos.** Se um item precisa de edição extensa, oferecer "abrir no desktop".

Cada uma dessas ausências é uma decisão de foco, não uma limitação. Uma tela mobile que faz tudo mal é pior que uma que faz cinco coisas muito bem.

---

## 8. Sequência

| Ordem | Item | Depende de |
|---|---|---|
| 1 | **P0-1** — resolver sincronização | — |
| 2 | **P0-2** — correção de transcrição (versão mobile) | — |
| 3 | **P1-6** — captura de um gesto | P0-1, P0-2 |
| 4 | Áreas de toque, zona segura, zoom de campo | — |
| 5 | Zona Agora como tela padrão mobile | P1-1, P1-2 |
| 6 | Barra inferior com busca | — |
| 7 | **P2-2** — PWA | P0-1 |
| 8 | Web Push | P2-2, P1-4 |
| 9 | Fila offline | P2-2 |
| 10 | **P2-10** — lista de compras | P1-5 |

O item 1 é bloqueante para todos os demais. Não faz sentido investir em experiência mobile enquanto houver dúvida sobre se os dados chegam.

---

## 9. Critérios de sucesso

1. **Da intenção de capturar até estar falando: um gesto.**
2. **Da abertura do aplicativo até saber a próxima atividade: zero toques** — é a tela padrão.
3. **Nenhuma captura perdida por falta de sinal.**
4. **Notificações push com taxa de ação acima de 40%** — abaixo disso, reduzir o que é notificado, não melhorar a redação.
5. **Lucas para de usar outro aplicativo para lista de compras** — o teste mais honesto de que o painel realmente comporta a vida pessoal.
