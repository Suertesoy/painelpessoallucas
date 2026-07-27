# Resumo Executivo de Decisões — Painel Pessoal Lucas

**24 de julho de 2026** · Auditoria somente leitura sobre o commit `137fc010` · Documento completo em [`MASTER_STRATEGIC_AUDIT.md`](./MASTER_STRATEGIC_AUDIT.md)

---

> **Revisão de 24/07/2026 — segunda passagem, com acesso ao código.** Duas correções: (1) a recomendação de cadastrar almoço e academia como blocos recorrentes foi **retirada** — ver decisão 7; (2) duas conclusões da primeira versão estavam erradas e foram corrigidas por verificação no repositório — ver "O que mudou".

## O diagnóstico em uma frase

O Painel Pessoal Lucas é um **sistema de captura e organização de objetos** bem construído. O que o briefing descreve querer é um **sistema de decisão sobre o tempo**. A distância entre os dois não é de polimento — é a ausência de dois primitivos no domínio (sessão de trabalho e atividade atual), somada a uma capacidade que é constante fixa e a uma estimativa que existe mas não tem fluxo prático para ser preenchida.

---

## A evidência que sustenta isso

Das nove perguntas diárias do briefing, o sistema hoje responde três, responde duas parcialmente e não tem como responder quatro:

| Pergunta | Responde? |
|---|---|
| O que devo fazer agora? | Parcialmente — há foco de 3 itens, sem ordem nem noção de "agora" |
| Quanto tempo isso deve levar? | Parcialmente — o campo existe, mas só editável no modal de detalhe |
| O que será afetado se eu mudar de atividade? | **Não** |
| O que estou esquecendo? | Sim — `/revisao` faz isso bem |
| Minha semana está tranquila ou sobrecarregada? | **Não** |
| Onde estou gastando meu tempo? | **Não** |
| Qual projeto precisa da minha atenção? | Sim, mas manualmente |
| O que posso adiar sem causar problemas? | **Não** |
| Qual é a próxima ação concreta? | Sim |

As quatro impossíveis compartilham a mesma causa: nenhuma tabela, comando ou evento de **sessão de trabalho** existe no repositório. Sem saber o que está sendo feito e há quanto tempo, não há como responder o que seria afetado por uma troca, onde o tempo foi gasto, nem o que pode ser adiado.

Isso não é dívida técnica. É lacuna de escopo de domínio. Nenhuma quantidade de trabalho de interface resolve.

## O que mudou na segunda passagem

Com acesso ao código, duas conclusões da primeira versão se mostraram **erradas**. Registro porque uma auditoria que não corrige as próprias conclusões diante de evidência nova não é auditoria:

| Afirmação anterior | Realidade verificada | Efeito |
|---|---|---|
| "Não existe campo de duração estimada" | **`estimatedMinutes` existe** no schema, no banco, no repositório, no `ItemDetailModal` e em `capacity.ts` | P1-1(a) deixa de ser "criar campo" e vira "expor melhor". Esforço menor |
| "Provavelmente não há sincronização entre dispositivos" | **O `ChangeNotifier` já revalida ao ganhar foco e ao voltar de visibilidade** — exatamente a solução que eu recomendaria | A hipótese está refutada; a causa do bug de sync é outra |

E uma confirmação que **piora** o diagnóstico: a invalidação do `ChangeNotifier` é totalmente global — instância única, cada query assinando três repositórios, e `/hoje` com seis queries. Qualquer mutação re-executa todas. Isso precisa ser corrigido **antes** de adicionar sessões de trabalho, que geram mutações frequentes.

---

## O que está certo e não deve ser tocado

Vale registrar isso antes de qualquer recomendação, porque a base é melhor do que o problema sugere:

- **A arquitetura está correta para o que vem a seguir.** Commands validando Zod → persistindo → emitindo evento auditável é exatamente a fundação de que uma sessão de trabalho precisa. Estender, não reescrever.
- **Os guardrails de IA estão bem calibrados.** Proposta com aprovação por ação individual, proteção contra injeção de prompt, saídas estruturadas com Zod. Isso já implementa as proibições da seção 8 do briefing.
- **A postura de privacidade é séria.** Tokens em AES-256-GCM, Calendar em `freebusy`, Gmail em `gmail.send`, áudio descartado. Manter integralmente.
- **O motor de recorrências é um ativo subaproveitado.** Determinístico, testado, idempotente. Hoje só alcançável via importação de documento.
- **A trava de 3 focos diários é boa decisão de produto**, validada no domínio e não só na interface.
- **A tela de login mostra que a sensibilidade de design existe.** O problema nas telas internas não é falta de gosto — é falta de sistema.

**Não há nenhuma evidência que justifique reescrita arquitetural.**

---

## As oito decisões

### 1. Introduzir tempo no domínio antes de qualquer outra coisa

Duração estimada nos itens, tabela de sessões de trabalho, e atividade atual como a sessão sem fim registrado.

Isso desbloqueia cinco das nove perguntas e é pré-requisito de tudo o mais que vale a pena. É a maior mudança da auditoria, e usa o padrão arquitetural existente sem alteração.

**Risco principal, e é de produto, não de engenharia:** se registrar tempo tiver atrito, Lucas abandona em duas semanas. E dados de tempo pela metade são piores que dados nenhum, porque produzem recomendações erradas com aparência de fundamentadas. Por isso **registro retroativo tem que ser tão fácil quanto o cronômetro** — não um recurso escondido.

### 2. Reconstruir Hoje em torno de "agora", não de "estado do sistema"

Oito seções de peso visual idêntico viram três zonas hierárquicas: **Agora** (sempre visível, peso máximo), **Depois** (linha do tempo do dia com o espaço livre representado visualmente), **Atenção** (aparece só quando há algo).

Seis das oito seções atuais são preservadas, reposicionadas por frequência de uso. Duas saem para a revisão semanal.

O critério de sucesso: extrair a decisão em menos de três segundos, sem rolar.

### 3. A maior parte da "IA diretiva" não deve ser IA

Analisando as oito frases-exemplo do briefing, **seis são queries SQL** — "projeto parado há sete dias", "você tem duas horas livres", "aguardando há cinco dias". O que as faz parecer IA não é inferência: é redação direta e momento certo de aparecer.

Consequência: construir a camada de recomendação como **motor de regras determinístico**, com custo zero, latência zero, sem alucinação e — crucialmente — **auditável por Lucas**. Ele pode conferir "parado há 7 dias". Não pode conferir "acho que você deveria priorizar isso".

O LLM entra depois, e apenas para o que as regras comprovadamente não conseguem dizer: uma chamada por dia, cacheada, recebendo um snapshot determinístico e devolvendo de uma a três frases.

**Não construir a camada de LLM antes de rodar as regras por três ou quatro semanas.** Sem isso, o resultado provável é um modelo redigindo com floreio o que uma regra já dizia melhor.

### 4. Homologar a sincronização mobile antes de investir mais em mobile

`[Correção de 25/07/2026]` Existem dois componentes e uma rota marcados no código como temporários, criados durante a investigação de sincronização mobile. Isso não significa que exista hoje um bug ativo: o projeto já recebeu correções de sincronização, sessão, workspace e timestamps do Supabase, e a verificação no código já refutou a hipótese de ausência de sincronização entre dispositivos — o `ChangeNotifier` já revalida ao ganhar foco de janela, que é exatamente a solução que eu recomendaria para esse cenário.

Todo o caso de uso mobile do briefing — captura rápida, áudio, lista de compras, agendar fora de casa — pressupõe que o que entra no celular chegue ao desktop. O que falta não é corrigir um bug: é **homologar** que os fluxos principais (texto, áudio, criação e edição nos dois sentidos, revalidação ao voltar à aba) funcionam de fato, em dois dispositivos reais, e só então remover os diagnósticos temporários.

Não recomendo, como próximo passo padrão, alterar cookies, RLS, autenticação, nem implementar Supabase Realtime — Realtime resolveria colaboração simultânea, que não é o cenário de um usuário único. Essas medidas só voltam à mesa se a homologação revelar um caso real e reproduzível de não sincronização.

### 5. Corrigir a transcrição antes da análise de IA

Problema confirmado por Lucas. E o achado que o barateia muito: **o campo de transcrição editada já existe no modelo de dados** — o detalhe do item já exibe "transcrição original vs. editada".

Não é funcionalidade nova. É mover um campo existente para um passo antes no fluxo. Esforço baixo, e elimina a categoria inteira de erro "a IA inventou a data" — que é uma das proibições explícitas do briefing.

Isso importa mais do que parece: uma IA que propõe "reunião na terça" quando Lucas disse "quinta" ensina Lucas a desconfiar de todas as propostas, o que anula o ganho de ter triagem automática.

### 6. Introduzir "área da vida" como dimensão separada de "projeto"

Hoje há um único agrupador. Metade do escopo que Lucas quer organizar não é projeto — academia não tem marco, compras não têm prazo, saúde não conclui.

Sem essa dimensão, ele tem duas opções ruins: criar projetos falsos que poluem a lista de projetos, ou deixar itens sem projeto e conviver com alerta permanente em `/revisao`. Ambas empurram a vida pessoal de volta para ferramentas paralelas — quebrando exatamente o ponto único que o painel deveria ser.

Solução: campo `area` exclusivo e estável (seis valores), mais um alternador de contexto global (Tudo / Trabalho / Pessoal) que filtra quatro telas simultaneamente. Não é uma tela nova — é uma projeção sobre o que já existe.

E `/revisao` passa a alertar sobre "sem área" em vez de "sem projeto", o que elimina o alerta que hoje pune Lucas por usar o sistema para a vida pessoal.

### 7. A capacidade é uma constante de 8 horas — e a solução é mais simples do que eu propus

`[CÓDIGO — verificado]` `src/lib/capacity.ts` contém `DAY_CAPACITY_MINUTES = 8 * 60`. Oito horas, todos os dias, sempre. É exatamente a suposição que o briefing rejeita. E `computeCapacity` trata itens sem estimativa como 30 minutos silenciosamente — a capacidade mente nos dois sentidos.

O resto de `capacity.ts` está correto e testado. O problema é o denominador, não o cálculo.

**Solução: quatro números.**

```
Jornada habitual                  8h30 → 18h
Horas realmente disponíveis/dia   5h     ← líquido: já absorve almoço,
                                            academia, pausas, deslocamento
Margem para imprevistos           20%
Ajuste excepcional do dia         "hoje só tenho 3h"
```

Compromissos do Calendar continuam sendo descontados porque **variam por dia**. O que é estável e recorrente já está no número habitual e nunca é declarado, listado ou classificado.

> **Correção da primeira versão.** Eu havia recomendado cadastrar almoço e academia como blocos recorrentes no painel, e apresentado uma decisão de produto sobre ampliar o escopo do Calendar para classificar títulos. **Você apontou corretamente que isso criava burocracia para comportamentos que já funcionam.** Ambas as recomendações foram retiradas.
>
> E há um efeito colateral bom: sem a necessidade de classificar blocos, o `freebusy` basta. **A decisão sobre escopo OAuth deixa de existir.** Sem ampliação, sem reconsentimento, sem títulos de compromissos pessoais saindo do Google.

O princípio que essa correção estabelece vale para toda funcionalidade futura:

> **O painel ajuda no que pode ser esquecido, subestimado, abandonado, atrasado ou mal priorizado. Não no que já funciona.**

A fronteira não é pessoal vs. profissional. Uma consulta médica é pessoal, pontual e esquecível — item legítimo. A academia de terça é pessoal, rotineira e não esquecível — não é.

### 8. Não construir vinte e cinco coisas

O documento [`WHAT_NOT_TO_BUILD.md`](./WHAT_NOT_TO_BUILD.md) lista 25 itens: 10 a descartar, 10 a adiar com condição de entrada explícita, 5 a simplificar radicalmente.

Os mais relevantes:

- **Descartar:** MCP, adaptador genérico de integrações, leitura da caixa do Gmail, agentes autônomos, suíte E2E de interface, dashboard de métricas, gamificação com sequências
- **Adiar com condição:** estimativas aprendidas (exige 6 semanas de dados), planejamento semanal (idem), finanças (exige núcleo estável há 3 meses), tema escuro (exige design system consolidado)
- **Simplificar:** pipeline de candidaturas resolvido com projeto + área + itens existentes, antes de qualquer código novo

Um sistema pessoal falha por excesso, não por falta.

---

## O que fazer primeiro

**Fase 0 — imediata. Objetivo: o que existe passa a ser confiável — e confirmado, não presumido.** `[Correção de 25/07/2026: ordem revisada]`

1. Corrigir a transcrição antes da triagem de IA
2. Homologar o cron e as automações em produção
3. Criar o card permanente de saúde das automações em `/configuracoes`
4. Revalidar os fluxos desktop e mobile já corrigidos (texto, áudio, criação/edição nos dois dispositivos, revalidação ao voltar à aba)
5. Remover os diagnósticos temporários — só depois de 4
6. Capturar screenshots das telas internas atuais (desktop e mobile) — baseline para qualquer recomendação visual

Nada de funcionalidade nova. Construir sobre fundação não verificada é a forma mais cara de errar. E o cron é a base das notificações — se ele nunca rodou, tudo que depende dele é fé.

**Pergunta de encerramento da fase:** homologuei — não presumi — que o que capturo no celular chega ao desktop e que as automações rodam? Tenho screenshots reais das telas internas?

---

## Prioridades

**3 itens em P0, 6 em P1, 12 em P2, 7 em P3.** A contenção é deliberada — se P0 e P1 tivessem 25 itens, a priorização não teria sido feita.

| P0 — não validado ou não homologado |
|---|
| Transcrição corrigível antes da análise |
| Automações homologadas e observáveis |
| Sincronização mobile homologada (já corrigida no código; falta confirmar em uso real) |

| P1 — alto impacto imediato |
|---|
| Tempo como primitivo de domínio |
| Hoje como central de decisão |
| Capacidade habitual configurável |
| Motor de recomendações determinísticas |
| Áreas da vida e alternador de contexto |
| Captura mobile de um toque |

---

## Roadmap

| Fase | Prazo | Objetivo |
|---|---|---|
| **0** | Imediata | O que existe é confiável e confirmado |
| **1** | 2 semanas | O sistema sabe o que estou fazendo agora (incremental — sem redesenhar Hoje ainda) |
| **2** | 1 mês | O sistema sabe quanto tempo tenho, começa a falar, e o resto de Hoje é reorganizado |
| **3** | 3 meses | O sistema fica calmo e confiável no bolso |
| **4** | Longo prazo | O sistema aprende |

Cada fase entrega valor sozinha. Nenhuma é preparação para a seguinte.

---

## Métricas

Seis, e nenhuma precisa de tela própria:

1. Tempo até capturar — < 10s texto, < 20s áudio
2. Percentual de dias úteis com sessão registrada — **a mais importante**; abaixo de 50% na semana 2 significa atrito, e a resposta é simplificar o fluxo, não insistir
3. Erro mediano de estimativa — tendência, apresentado como calibração e nunca como desempenho
4. Taxa de aceitação de recomendação — abaixo de 20% por duas semanas desativa a regra automaticamente
5. Itens sem área há mais de 7 dias
6. Custo de IA por semana

Deliberadamente fora: contagem de interrupções (vira autopunição por algo fora do controle dele) e notificações ignoradas como relatório (deve ser controle automático, não número a interpretar).

---

## A decisão mais importante

Se apenas uma coisa for feita nos próximos três meses:

> **Introduzir duração, sessão de trabalho e atividade atual no domínio, e reconstruir a tela Hoje em torno de "agora".**

Não é a mais visível nem a mais divertida. Mas é a única que desbloqueia todas as outras. Sem ela: não há capacidade real, não há interrupção, não há retomada, não há estimativa aprendida, não há "onde gastei meu tempo", não há recomendação com fundamento.

E o corolário, igualmente importante: **não construir IA diretiva antes disso.** Uma IA que recomenda prioridades sem saber quanto tempo as coisas levam nem quanto tempo resta vai errar de forma convincente. Lucas vai seguir a recomendação, ela vai falhar, e a confiança no sistema inteiro cai. Isso é pior que não ter IA nenhuma.

---

## Limitações desta auditoria

Declaradas para que nenhuma recomendação seja lida com mais certeza do que merece:

1. **Li o código de forma dirigida, não integral.** Verifiquei `capacity.ts`, `item.schema.ts`, `change-notifier.ts`, `hooks.ts`, `quick-capture-modal.tsx`, `item-detail-modal.tsx`, as migrations e o fluxo de triagem — os pontos que sustentam P0 e P1. Não li o repositório inteiro.
2. **Vi duas telas** — ambas do login público. A análise visual de Hoje, Entrada, Projetos, Agenda e dos modais deriva de descrição e de leitura de JSX (estrutura de componentes e tokens de design), não de observação da interface renderizada. Toda afirmação sobre como uma tela "parece" ou "é sentida" neste documento é inferência, não validação visual — ver adendo em `MASTER_STRATEGIC_AUDIT.md` (Legenda de classificação de evidência). **A captura de screenshots das telas internas passou a ser a entrega 6 da Fase 0** em `FEATURE_ROADMAP.md`, precisamente para fechar esta lacuna antes de qualquer recomendação de interface ser implementada.
3. **Nenhuma validação em produção.** Não consultei logs da Vercel, `automation_runs` nem `ai_runs`. P0-3 existe justamente para fechar isso.
4. **Não conheço a frequência real de uso.** Assumi, a partir do briefing, que importação de documento é rara e captura é diária. Esta é a suposição mais frágil da priorização.
5. **Não executei lint, testes nem build.** As recomendações preservam a estrutura testada, mas alterações em `item.schema.ts` e `capacity.ts` tocam arquivos com cobertura existente.

Três verificações permanecem abertas antes de implementar: cobertura de teste de `capacity.ts`, comportamento atual do Web Push em iOS Safari, e execuções reais do cron em produção. Listadas ao final de [`IMPLEMENTATION_BRIEFS.md`](./IMPLEMENTATION_BRIEFS.md).

---

## Nenhuma alteração foi feita

Somente arquivos em `docs/project-dossier/strategic-audit/` foram criados. Nenhum código, banco, migration, variável, integração ou configuração foi tocado. Nenhum commit, push ou deploy.

**Verificado com git:** o único arquivo não rastreado é `docs/project-dossier/strategic-audit/`. Os 89 arquivos que aparecem como modificados em `git status` são exclusivamente diferenças de fim de linha (CRLF) pré-existentes — `git diff --ignore-cr-at-eol` retorna vazio.

**Recomendação avulsa:** normalizar isso com um `.gitattributes` (`* text=auto`) antes de começar qualquer implementação. Caso contrário, todo diff futuro virá poluído e a revisão de mudanças fica impraticável.
