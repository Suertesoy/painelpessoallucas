# Recomendações Priorizadas — Painel Pessoal Lucas

Complemento de [`MASTER_STRATEGIC_AUDIT.md`](./MASTER_STRATEGIC_AUDIT.md). Especificações implementáveis de P0 e P1 em [`IMPLEMENTATION_BRIEFS.md`](./IMPLEMENTATION_BRIEFS.md).

> **Revisão de 24–25/07/2026.** Três mudanças em relação à primeira versão, todas reduzindo escopo:
> - **P1-3 ficou menor.** A recomendação de cadastrar almoço e academia como blocos recorrentes foi retirada — ver `MASTER_STRATEGIC_AUDIT.md` §0.1. A capacidade passa a ser quatro números configuráveis, e a decisão sobre o escopo do Calendar deixa de ser necessária. Esforço cai de médio para baixo.
> - **P1-1 ficou menor.** Verificação no código mostrou que `estimatedMinutes` já existe em todas as camadas. O trabalho é expor melhor, não criar.
> - **P0-1 ficou menor e mudou de natureza.** Deixou de ser "diagnosticar um bug não resolvido" para ser "homologar fluxos já corrigidos". O projeto já passou por correções de sincronização/sessão/workspace/timestamps, e a hipótese de ausência de sincronização entre dispositivos já foi refutada no código (`ChangeNotifier` revalida ao ganhar foco). Esforço cai de médio para baixo; risco de médio para baixo.

---

## Critérios de priorização

Cada recomendação foi avaliada em dez eixos, conforme a seção 25 do briefing:

| Eixo | Peso na decisão |
|---|---|
| Impacto diário | Alto — o produto é usado todo dia |
| Redução de carga mental | Alto — é a proposta de valor declarada |
| Frequência de uso | Alto |
| Urgência | Alto para o que está quebrado |
| Confiabilidade | Alto — funcionalidade não confiável é pior que ausente |
| Esforço | Médio — implementação assistida por IA reduz o peso deste eixo |
| Risco técnico | Médio |
| Dependências externas | Médio |
| Custo recorrente | Baixo, mas eliminatório acima de um teto |
| Valor estratégico | Alto |

**Regra de contenção aplicada:** 3 itens em P0, 6 em P1. Tudo o mais foi rebaixado. Se P0 e P1 tivessem 25 itens, a priorização não teria sido feita.

---

## Visão geral

| ID | Título | Prioridade | Esforço | Risco | Fase |
|---|---|---|---|---|---|
| P0-1 | Homologar a sincronização mobile já corrigida | P0 | Baixo | Baixo | Imediata |
| P0-2 | Corrigir a transcrição antes da análise de IA | P0 | Baixo | Baixo | Imediata |
| P0-3 | Homologar e tornar observáveis as automações | P0 | Baixo | Baixo | Imediata |
| P1-1 | Tempo como primitivo de domínio | P1 | Médio-alto | Médio | 2 semanas |
| P1-2 | Reconstruir Hoje como central de decisão | P1 | Médio | Baixo | 2 semanas |
| P1-3 | Capacidade habitual configurável | P1 | Baixo | Baixo | 1 mês |
| P1-4 | Motor de recomendações determinísticas | P1 | Médio | Baixo | 1 mês |
| P1-5 | Áreas da vida e alternador de contexto | P1 | Médio | Médio | 1 mês |
| P1-6 | Captura mobile de um toque | P1 | Baixo | Baixo | 2 semanas |
| P2-1 | Consolidar design system | P2 | Médio | Baixo | 3 meses |
| P2-2 | PWA e notificações push | P2 | Médio | Médio | 3 meses |
| P2-3 | IA diretiva sobre estado agregado | P2 | Médio | Médio | 3 meses |
| P2-4 | Unificar Entrada, Ideias e Revisão | P2 | Médio | Médio | 3 meses |
| P2-5 | Memória de projeto e preparação de reunião | P2 | Alto | Médio | 3 meses+ |
| P2-6 | Dependências de terceiros e follow-up | P2 | Baixo | Baixo | 3 meses |
| P2-7 | Estimativas aprendidas com histórico | P2 | Médio | Alto | Longo prazo |
| P2-8 | Rotinas recorrentes fora do módulo Planos | P2 | Baixo | Baixo | 3 meses |
| P2-9 | Auditoria e controle de custo de IA | P2 | Baixo | Baixo | 1 mês |
| P2-10 | Lista de compras | P2 | Baixo | Baixo | 3 meses |
| P2-11 | Componente de modal compartilhado | P2 | Baixo | Baixo | 3 meses |
| P2-12 | Controle granular de sync com Calendar | P2 | Baixo | Baixo | 3 meses |
| P3-1 | Planejamento semanal explícito | P3 | Médio | Médio | Longo prazo |
| P3-2 | Organização financeira | P3 | Alto | Médio | Longo prazo |
| P3-3 | Horas, contratos e rentabilidade | P3 | Médio | Médio | Longo prazo |
| P3-4 | Pipeline de candidaturas e carreira | P3 | Médio | Baixo | Longo prazo |
| P3-5 | Modo foco | P3 | Baixo | Baixo | Longo prazo |
| P3-6 | Widget e atalhos nativos | P3 | Médio | Alto | Longo prazo |
| P3-7 | Tema escuro | P3 | Médio | Baixo | Longo prazo |

**Contagem: 3 P0 · 6 P1 · 12 P2 · 7 P3 · 28 recomendações.**

---

# P0 — Correções essenciais

Definição de P0 nesta auditoria: *algo que está quebrado, não validado, ou que bloqueia um caso de uso declarado como central.* Não inclui melhorias, por maiores que sejam.

Os três itens estão listados abaixo por ID (P0-1, P0-2, P0-3), não por ordem de execução. **A ordem de execução recomendada da Fase 0 é: P0-2 (transcrição) → P0-3 verificação do cron → P0-3 card de saúde → P0-1 homologação mobile → P0-1 remoção dos diagnósticos → captura de screenshots das telas internas** — ver `FEATURE_ROADMAP.md` §Fase 0 para o roteiro sequenciado com dependências e critérios de encerramento.

---

## P0-1 · Homologar a sincronização mobile já corrigida

**Categoria:** confiabilidade / mobile

> **Correção de 25/07/2026.** Este item tratava a sincronização mobile como um bug ativo e não diagnosticado. O projeto já passou por correções relevantes de sincronização, sessão, workspace e parsing dos timestamps do Supabase, e a verificação no código (ver `MASTER_STRATEGIC_AUDIT.md` §0.2) já **refutou** a hipótese de que faltaria sincronização entre dispositivos — o `ChangeNotifier` já revalida ao ganhar foco de janela. A etapa imediata passa a ser **homologação**, não diagnóstico do zero.

**Problema.** Dois componentes de diagnóstico e uma rota de apoio continuam marcados como `TEMPORÁRIO` no código, o que indica que a homologação final ainda não foi feita — não necessariamente que exista um bug ativo.

**Evidência.**
- Dois componentes marcados no próprio código como `TEMPORÁRIO`, criados para investigar sincronização mobile: `sync-diagnostics-card.tsx` e `data-flow-diagnostics-card.tsx` `[DOSSIÊ]`
- Rota `/api/debug/sync-status` de suporte a esses diagnósticos, ainda presente `[DOSSIÊ]`
- `ChangeNotifier` já revalida ao ganhar foco de janela e ao voltar de segundo plano `[CÓDIGO — verificado, ver MASTER_STRATEGIC_AUDIT.md §0.2]` — a causa "ausência de sincronização entre dispositivos" está refutada
- Não há, nesta auditoria, log de produção nem teste real em dois dispositivos que confirme que o fluxo já está correto — daí a necessidade de homologar, não de presumir

**Impacto no uso real.** O briefing dedica uma seção inteira ao papel do celular: captura rápida, áudio, lista de compras, registro de compromissos fora de casa, consulta da próxima atividade, confirmação de ações. **Todos esses casos pressupõem que o que entra no celular chegue ao desktop.** Enquanto os diagnósticos temporários seguirem visíveis e não homologados, não há como afirmar que esse pressuposto vale — mesmo que o código já tenha sido corrigido.

**Recomendação — roteiro de homologação, nesta ordem:**
1. Homologar os fluxos principais no computador e no celular (login, captura, edição, conclusão, arquivamento)
2. Confirmar revalidação ao retornar à aba (trocar de app/bloquear tela e voltar, sem recarregar manualmente)
3. Confirmar criação e edição nos dois dispositivos, nos dois sentidos
4. Confirmar captura por texto e por áudio especificamente no celular
5. Verificar, com os diagnósticos existentes, se ainda existe algum caso não sincronizado
6. **Só então** remover os dois cards e a rota de debug

**Se, e somente se, o passo 5 revelar um caso real e reproduzível**, escalar para diagnóstico de causa raiz (cookie de sessão em Safari iOS, workspace não resolvido a tempo no cliente mobile) — nessa ordem, e só então considerar mudanças em cookies, autenticação, RLS ou, no limite, Supabase Realtime. Nenhuma dessas mudanças é recomendação desta etapa. Ver `IMPLEMENTATION_BRIEFS.md` BRIEF P0-1 para o roteiro completo e as hipóteses condicionais.

**Benefício esperado.** Confirmar (em vez de presumir) a confiabilidade do canal mobile, que é pré-requisito de P1-6 e de todo o `MOBILE_EXPERIENCE_STRATEGY.md`.

**Complexidade:** baixa (é homologação, não investigação do zero). **Risco:** baixo — só cresce se o passo 5 encontrar um caso real, e mesmo assim de forma contida (ver hipóteses condicionais).
**Dependências:** acesso a dispositivo iOS e Android reais.
**Custo operacional:** nenhum. **Custo recorrente:** nenhum.

**Se nada for feito.** Os diagnósticos temporários seguem expostos ao usuário final indefinidamente, e não há confirmação formal de que o canal mobile é confiável — mesmo que já esteja corrigido.

---

## P0-2 · Corrigir a transcrição antes da análise de IA

**Categoria:** IA / captura

**Problema.** No fluxo de captura por áudio, a transcrição do Whisper é enviada à triagem de IA sem que Lucas possa corrigi-la. Nomes próprios, datas, horários e termos técnicos transcritos errados são analisados como se estivessem certos, e a IA propõe ações erradas com confiança.

**Evidência.**
- Declarado por Lucas como problema confirmado (seção 9 do briefing)
- Diagrama 6: após a transcrição, o modal *"Salva item base na Inbox (source: 'audio_capture')"* — sem passo de revisão `[CÓDIGO]`
- Diagrama 7: `POST /api/ai/triage-capture { itemId }` → *"Busca captura original e projetos ativos"* → envia ao LLM `[CÓDIGO]`
- Não existe passo intermediário entre os dois `[CÓDIGO]`
- **Contra-evidência que barateia a correção:** o `ItemDetailModal` já exibe *"transcrição original vs. editada"* no painel de proveniência de áudio `[DOSSIÊ]` — o campo de transcrição corrigida **já existe no modelo de dados**

**Impacto no uso real.** O áudio é o canal principal de captura mobile no desenho que Lucas descreve — falar é o único modo de captura que funciona andando, dirigindo ou com as mãos ocupadas. Se cada captura por voz exige revisão posterior no desktop para corrigir o que a IA entendeu errado, o áudio deixa de economizar tempo e passa a custar tempo. E há um efeito de segunda ordem pior: uma IA que propõe "reunião com o Grupo Almeida na terça" quando Lucas disse "quinta" ensina Lucas a **não confiar nas propostas** — e aí ele lê todas com desconfiança, o que anula o ganho de ter triagem automática.

**Causa provável.** Decisão de fluxo, não limitação técnica: a transcrição foi tratada como resultado final em vez de rascunho. `[INFERÊNCIA — alta confiança]`

**Recomendação.** Inserir um estado de revisão de transcrição entre transcrever e analisar:

```
[gravando] → [transcrevendo] → [TRANSCRIÇÃO EDITÁVEL] → [analisar com IA] → [revisar propostas]
                                        ↑ novo
```

Comportamento:
- A transcrição aparece em um campo de texto editável, já preenchido, com foco disponível mas **sem exigir edição**
- Dois botões: **"Analisar com IA"** (primário) e **"Salvar sem analisar"** (secundário)
- O item é salvo na Entrada **antes** de qualquer análise (preserva o princípio de resistência a falhas já estabelecido no produto)
- Ao editar, o texto original é preservado no campo de proveniência já existente; o texto editado é o que vai ao LLM
- Correção pontual apenas: Lucas edita palavras, não reescreve

**Benefício esperado.** A qualidade da triagem passa a depender do que Lucas disse, não do que o Whisper entendeu. Elimina a categoria inteira de erro "IA inventou data/nome" — que é uma das proibições explícitas da seção 8 do briefing.

**Complexidade:** baixa. É um estado adicional em um componente existente (`QuickCaptureModal`), usando um campo que já existe no modelo de dados.
**Risco:** baixo.
**Dependências:** nenhuma.
**Custo operacional:** nenhum. **Custo recorrente:** reduz custo de IA (menos re-análises).

**Se nada for feito.** Lucas para de usar a análise de IA no áudio e passa a usar só a transcrição bruta, ou abandona o áudio. A Fase 3 inteira do produto perde valor.

---

## P0-3 · Homologar e tornar observáveis as automações em produção

**Categoria:** confiabilidade / infraestrutura

**Problema.** O cron horário `/api/cron/automation-tick` — que executa recorrências, lembretes, sync de calendar e digests — está implementado mas nunca foi homologado em produção. Não há como saber se ele roda, se falha, ou se falha silenciosamente.

**Evidência.**
- *"implementado, mas não homologado (sem acesso a logs de produção nesta auditoria)"* `[DOSSIÊ: automations]`
- *"O funcionamento do cron em ambiente de produção Vercel depende de validação em produção via monitoramento de logs do automation_runs"* `[DOSSIÊ]`
- Questão aberta: *"O cron de produção já executou de fato na Vercel? Nenhum log foi consultado"* `[DOSSIÊ]`
- Não existe nenhuma tela ou card que exiba o estado de `automation_runs` `[INFERÊNCIA — a tabela existe mas não aparece em nenhum componente ou rota de UI]`

**Impacto no uso real.** Este é o item mais silenciosamente perigoso da lista. Tudo o que acontece "sozinho" no produto depende deste cron: recorrências que materializam tarefas, lembretes, sincronização com o Calendar, digests por e-mail. E, crucialmente, **é a fundação sobre a qual as notificações da seção 11 do briefing serão construídas.**

Uma falha silenciosa aqui produz o pior comportamento possível para um sistema de confiança: Lucas cria uma rotina recorrente de academia, ela não materializa, e ele só descobre semanas depois — quando já parou de confiar que o sistema lembra das coisas. O produto inteiro se apoia na premissa de que "se está no painel, não vou esquecer". Uma automação não observável mina isso na raiz.

**Causa provável.** Prioridade: o cron foi construído no fim da Fase 2 e a homologação exige acesso a produção, que ficou pendente. `[INFERÊNCIA]`

**Recomendação.**
1. Verificar nos logs da Vercel se o cron executou, com que frequência e com que resultado
2. Consultar `automation_runs` diretamente: contagem por status (`completed`/`skipped`/`failed`) nas últimas 7 dias
3. Construir um **card de saúde das automações** em `/configuracoes` que leia `automation_runs` e mostre: última execução bem-sucedida, contagem de falhas nas últimas 24h, e último erro em linguagem compreensível
4. Garantir que uma falha de automação dispare o alerta que já existe (`digest.automation_failure_sent` está na lista de eventos de domínio `[DOSSIÊ]` — a capacidade existe)

O passo 3 substitui os cards de diagnóstico temporários por algo permanente e legítimo: em vez de expor `snake_case` de debug, expõe o estado real de uma parte do sistema que o usuário precisa confiar.

**Benefício esperado.** Passa-se de "acredito que as automações rodam" para "sei que rodam". Pré-requisito de P1-4 (notificações) e P2-8 (rotinas).

**Complexidade:** baixa. Os dados já existem em `automation_runs` com constraint de idempotência.
**Risco:** baixo. Somente leitura.
**Dependências:** acesso ao painel da Vercel e ao Supabase.
**Custo operacional:** nenhum. **Custo recorrente:** nenhum (o cron já roda).

**Se nada for feito.** Recorrências e lembretes podem estar falhando agora, sem ninguém saber. E qualquer sistema de notificação construído sobre essa base herda a falha.

---

# P1 — Alto impacto imediato

---

## P1-1 · Tempo como primitivo de domínio

**Categoria:** domínio / fundação

**Problema.** O sistema modela trabalho mas não modela a execução dele no tempo. Não existe sessão de trabalho nem atividade atual, e a estimativa — que existe — não tem um fluxo prático para ser preenchida.

**Evidência.**
- `[CÓDIGO — verificado]` Nenhuma tabela, comando ou evento de sessão de trabalho existe no repositório
- `[CÓDIGO — verificado]` `estimatedMinutes` **existe** no `ItemSchema`, no banco, no repositório, no `ItemDetailModal` e em `capacity.ts` — mas só é editável abrindo o modal de detalhe
- `[CÓDIGO — verificado]` `capacity.ts` trata a ausência de estimativa como 30min silenciosamente
- `[DOSSIÊ]` Os 19 eventos de domínio não contêm nenhum evento temporal
**Impacto no uso real.** Quatro das nove perguntas diárias do briefing são indecidíveis sem isso — ver o placar em `MASTER_STRATEGIC_AUDIT.md` §1.2. E seis das oito recomendações-exemplo que Lucas quer da IA dependem de saber quanto tempo as coisas levam. Esta é a recomendação que **desbloqueia** P1-2, P1-3, P1-4, P2-3 e P2-7. Sem ela, todas as demais são cosméticas.

**Causa provável.** O produto nasceu de "capturar primeiro, organizar depois" — um princípio sobre **entrada** de informação. A saída (decidir o que fazer com o tempo disponível) nunca foi modelada. `[INFERÊNCIA]`

**Recomendação.** Três primitivos, nesta ordem, cada um entregando valor sozinho:

**(a) Estimativa acessível** — `[revisado em 24/07/2026]` o campo já existe em todas as camadas. O trabalho é **expor melhor**: seletor rápido (15min · 30min · 1h · 2h · 4h · mais) na triagem da Entrada e na definição do foco do dia, sem abrir o modal de detalhe. E parar de contar 30min para itens sem estimativa — sinalizar em vez de inventar. Esforço muito menor do que a primeira versão desta auditoria estimava.

**(b) Sessão de trabalho** — nova tabela `work_sessions`: workspace, item (opcional), projeto (opcional), início, fim, tipo de trabalho, origem (manual/timer), nota de retomada. Comandos: iniciar, pausar, retomar, encerrar, corrigir, registrar retroativamente. Eventos: `work_session.started`, `.paused`, `.resumed`, `.ended`.

Duas exigências não-negociáveis:
- **Registro retroativo é cidadão de primeira classe**, não um recurso escondido. Lucas vai esquecer de iniciar o timer. Se corrigir depois for difícil, os dados ficam incompletos — e dados incompletos geram recomendações erradas com aparência de fundamentadas, que é pior que não ter dados.
- **No máximo uma sessão ativa por vez.** Isso é o que torna "atividade atual" um conceito coerente e evita o estado sem sentido de duas coisas acontecendo simultaneamente.

**(c) Atividade atual** — não é uma tabela nova: é a sessão ativa. Consultável em uma query, exibida no topo de Hoje e no mobile.

Detalhamento completo em [`TIME_CAPACITY_AND_INTERRUPTION_SYSTEM.md`](./TIME_CAPACITY_AND_INTERRUPTION_SYSTEM.md).

**Benefício esperado.** Habilita quatro respostas hoje impossíveis, e transforma a tela Hoje de relatório em cockpit.

**Complexidade:** média-alta — é a maior mudança de domínio da auditoria, mas menor do que a primeira versão estimava, já que (a) é ajuste de fluxo e não criação de campo. **Não é reescrita**: usa exatamente o padrão Commands/Repositories/Eventos já estabelecido `[CÓDIGO — verificado]`.
**Risco:** médio. O risco real não é técnico — é **de adoção**. Se registrar tempo for chato, Lucas para em duas semanas.
**Dependências:** P0-1 (o timer precisa funcionar no mobile). Corrigir a granularidade do `ChangeNotifier` antes — hoje a invalidação é global e as sessões geram mutações frequentes `[CÓDIGO — verificado]`.
**Custo operacional:** baixo. **Custo recorrente:** crescimento de linhas em `work_sessions` — desprezível para um usuário.

**Se nada for feito.** O painel permanece um gerenciador de tarefas competente e nunca se torna o sistema operacional pessoal que o briefing descreve. As nove perguntas continuam sem resposta.

---

## P1-2 · Reconstruir Hoje como central de decisão

**Categoria:** UX / arquitetura da informação

**Problema.** A tela Hoje tem 8 seções de peso visual idêntico e não responde "o que faço agora".

**Evidência.**
- 8 seções descritas em `SCREEN_COPY_AND_FLOW_INVENTORY.md` §3.1 `[DOSSIÊ]`
- Padrão de card `bg-white rounded-xl shadow-sm border p-4 md:p-6` repetido sem variação de peso `[DOSSIÊ]`
- O aviso de capacidade aparece **depois** de tentar adicionar um item, como erro de validação `[DOSSIÊ]`
- Duas seções ("Atenção Necessária", "Pulso dos Projetos") duplicam conteúdo de `/revisao` e `/projetos` `[INFERÊNCIA]`

**Impacto no uso real.** Lucas descreve manter o painel aberto o dia todo. Uma tela que exige varredura de 8 blocos a cada consulta é uma tela que ele consulta cada vez menos. E a informação que ele mais precisa — o que fazer agora, quanto tempo há — está distribuída entre três seções diferentes ou não existe.

**Causa provável.** A tela cresceu por adição: cada nova capacidade ganhou uma seção. Nunca houve um momento de subtração. `[INFERÊNCIA]`

**Recomendação.** Reorganizar em três zonas de peso decrescente:

| Zona | Sempre visível? | Conteúdo | Peso |
|---|---|---|---|
| **Agora** | Sim, topo | Sessão em curso (item, tempo decorrido, estimado) ou a próxima decisão sugerida. Um botão primário. | Máximo |
| **Depois** | Sim | Linha do tempo do restante do dia: compromissos + trabalho planejado no mesmo eixo, com espaço livre visível | Médio |
| **Atenção** | Só quando há algo | Recomendações determinísticas, itens em risco, dependências vencidas | Baixo |

Sai da tela: "Aguardando" (vira card em Atenção quando vence), "Pulso dos Projetos" (vira revisão semanal), "Atenção Necessária" (funde com Atenção), "Dos planos ativos" (funde com Depois).

Detalhamento completo em [`TODAY_EXPERIENCE_REDESIGN.md`](./TODAY_EXPERIENCE_REDESIGN.md).

**Benefício esperado.** Decisão extraível em menos de 3 segundos, sem rolagem, na maior parte dos dias.

**Complexidade:** média. É reorganização de uma tela, não mudança de domínio.
**Risco:** baixo. Reversível.
**Dependências:** **P1-1** — a zona "Agora" precisa de sessão de trabalho para existir. Fazer P1-2 antes de P1-1 produziria uma zona Agora vazia.
**Custo operacional / recorrente:** nenhum.

**Se nada for feito.** A tela mais importante do produto continua sendo a menos útil no momento em que mais importa.

---

## P1-3 · Capacidade habitual configurável

**Categoria:** planejamento / capacidade

**Problema.** A capacidade disponível é uma constante fixa de 8 horas, todos os dias, sempre. E itens sem estimativa contam 30 minutos silenciosamente.

**Evidência.**
- `[CÓDIGO — verificado]` `src/lib/capacity.ts`: `export const DAY_CAPACITY_MINUTES = 8 * 60;` — não há jornada configurável, horas disponíveis, margem nem ajuste do dia
- `[CÓDIGO — verificado]` `computeCapacity` usa `item.estimatedMinutes ?? 30` — a ausência de estimativa vira 30min sem aviso
- Briefing seção 3: *"O painel não deve considerar automaticamente todo o período entre 8h30 e 18h como capacidade disponível"*

**Nota:** o resto de `capacity.ts` está correto e testado — mesclagem de sobreposições, soma de comprometimento, sugestão de janela livre. O problema é o denominador, não o cálculo.

**Impacto no uso real.** Um sistema que diz "você tem 8h" quando Lucas tem 5h é ativamente prejudicial: ele planeja demais, não entrega, e conclui que o painel é otimista demais para confiar. O `?? 30` agrava nos dois sentidos — a capacidade mente por omissão.

**Causa provável.** A capacidade foi construída para responder "há colisão de horário?", não "quanto trabalho cabe hoje?". `[INFERÊNCIA]`

**Recomendação.** Quatro números configuráveis, substituindo a constante:

```
Jornada habitual                     8h30 → 18h
Horas realmente disponíveis/dia      5h        ← líquido: já absorve almoço,
                                                  academia, pausas, deslocamento
Margem para imprevistos              20%
Ajuste excepcional do dia            "hoje só tenho 3h"  (um toque, vale só hoje)
```

Compromissos do Calendar continuam sendo descontados via `freebusy` porque **variam por dia**. O que é estável e recorrente já está embutido no número habitual e não é declarado, listado nem classificado.

Adicionalmente: itens sem estimativa deixam de contar 30min e passam a ser sinalizados — *"3h comprometidas · 2 itens sem estimativa"*.

> **Correção de 24/07/2026.** A versão anterior recomendava cadastrar almoço e academia como blocos recorrentes e apresentava uma decisão de produto sobre ampliar o escopo do Calendar. **Ambas foram retiradas.** Essas rotinas já funcionam sem o painel; modelá-las cria burocracia sem resolver problema. E, sem a necessidade de classificar blocos, o `freebusy` basta — a decisão sobre escopo OAuth deixa de existir. Ver `MASTER_STRATEGIC_AUDIT.md` §0.1 e §4.

**Benefício esperado.** "Você tem 2h48 livres hoje" passa a ser verdade. Pré-requisito de qualquer recomendação sobre adiar, aceitar ou mover.

**Complexidade:** baixa — substituir uma constante por leitura de `workspace_settings`, que já existe. **Risco:** baixo.
**Dependências:** P1-1 (o seletor rápido de estimativa, para que o comprometimento seja declarado e não inventado).
**Custo operacional:** configuração inicial ~2 minutos, quatro campos. **Custo recorrente:** nenhum.

**Se nada for feito.** O planejamento diário continua otimista por construção, e a sensação de "nunca dou conta do que planejei" persiste — que é justamente o que o produto deveria resolver.

---

## P1-4 · Motor de recomendações determinísticas

**Categoria:** IA / notificações

**Problema.** Não existe nenhuma camada que observe o estado do sistema e diga algo. Toda informação é passiva — Lucas precisa ir procurar.

**Evidência.**
- As três operações de IA existentes são reativas e por objeto `[DOSSIÊ]`
- Nenhuma opera sobre estado agregado (dia, semana, projeto) `[DOSSIÊ]`
- Tabela `notifications` existe com schema Zod, mas sem nenhum consumidor em UI `[DOSSIÊ: aparece em tables e entities, ausente de todas as telas e componentes]`
- O único canal de "o sistema fala com você" é o digest por e-mail `[CÓDIGO]`

**Impacto no uso real.** As dificuldades declaradas por Lucas (seção 6 do briefing) são quase todas de **percepção**, não de registro: lembrar depois, entender impacto, saber se há capacidade, perceber que algo está parado. Um sistema que só responde quando perguntado não resolve nenhuma delas.

**Causa provável.** A camada de recomendação foi imaginada como problema de IA e, portanto, adiada como complexa. `[INFERÊNCIA]`

**Recomendação.** Construir a camada como **motor de regras determinístico**, não como LLM. Análise em `MASTER_STRATEGIC_AUDIT.md` §9.3: seis das oito recomendações-exemplo do briefing são queries SQL, não inferência.

Conjunto inicial de oito regras, todas determinísticas:

| Regra | Condição | Mensagem |
|---|---|---|
| Projeto parado | ativo, sem item atualizado há 7d, sem próxima ação | "Grupo Almeida está parado há 7 dias e não tem próxima ação definida." |
| Dia comprometido demais | comprometido > capacidade real | "Você comprometeu 6h e tem 4h30. Algo precisa sair." |
| Dia com espaço | livre > 2h e sem foco definido | "Você tem 3h livres. Boa hora para adiantar algo de longo prazo." |
| Sessão estourando | decorrido > 1.3 × estimado | "Você está há 1h20 nesta tarefa, estimou 1h." |
| Compromisso próximo | evento em ≤ 15min e sessão ativa | "Reunião em 15min. Encerrar a sessão atual?" |
| Aguardando parado | item `blocked` há > 5d | "Você aguarda retorno sobre isso há 5 dias." |
| Prazo se aproximando | prazo em ≤ 2d, item não iniciado | "Prazo em 2 dias e nenhuma sessão registrada." |
| Captura envelhecendo | item na Entrada há > 7d sem projeto/área | "12 capturas sem destino há mais de uma semana." |

Toda recomendação carrega os quatro elementos exigidos pela seção 8 do briefing: **o que**, **por quê**, **impacto esperado**, **ação executável em um clique**.

Exibição em três camadas (ambiente / nudge / push) e deduplicação por chave estável — ver `MASTER_STRATEGIC_AUDIT.md` §11.

**Benefício esperado.** O sistema passa de passivo a diretivo, com custo de IA zero e sem risco de alucinação.

**Complexidade:** média. **Risco:** baixo — determinístico, testável, previsível.
**Dependências:** P1-1 e P1-3 para as regras de tempo. As regras de projeto/aguardando/prazo funcionam sem elas e podem sair antes.
**Custo operacional:** nenhum. **Custo recorrente:** **R$ 0,00** — nenhuma chamada de LLM.

**Se nada for feito.** Lucas continua sendo o motor de vigilância do próprio sistema, que é exatamente a carga mental que o produto promete reduzir.

---

## P1-5 · Áreas da vida e alternador de contexto

**Categoria:** arquitetura da informação

**Problema.** Existe um único agrupador — `project_id`. Metade do escopo de vida que Lucas quer organizar não é projeto.

**Evidência.**
- Único agrupador em `items` é o projeto `[CÓDIGO: item.schema.ts]`
- `/revisao` alerta sobre "itens sem projeto" `[CÓDIGO]` — o que transforma tudo que não é projeto em ruído permanente
- Briefing seção 4 lista 15 áreas de vida e pede que coexistam sem se misturar caoticamente
- Briefing pede alternância entre visão geral / trabalho / pessoal / contexto específico — impossível hoje `[INFERÊNCIA]`

**Impacto no uso real.** Sem essa dimensão, Lucas tem duas opções ruins: criar projetos falsos ("Casa", "Saúde") que poluem `/projetos` e o Pulso dos Projetos com coisas sem marco nem prazo, ou deixar itens sem projeto e conviver com alerta permanente. Ambas degradam o sistema. E, mais grave: **impedem o uso do painel para a vida pessoal**, que é metade do escopo declarado — o que empurra Lucas de volta para ferramentas paralelas, quebrando o ponto único.

**Causa provável.** O produto foi desenhado a partir do trabalho e o escopo de vida veio depois. `[INFERÊNCIA]`

**Recomendação.**
- Campo `area` em `projects` e `items`, enum curto e estável: `trabalho`, `pessoal`, `saude`, `casa`, `carreira`, `lazer`
- Área é **exclusiva** (uma por item) e **estável** (o conjunto quase nunca muda) — o que a torna filtro confiável e bom eixo de agregação de tempo
- Projeto continua opcional; área é sempre preenchível, inclusive sem projeto
- **Alternador de contexto global** no topo da casca: Tudo / Trabalho / Pessoal. Filtra Hoje, Entrada, Projetos e Agenda simultaneamente. Não é uma tela nova
- `/revisao` deixa de alertar sobre "sem projeto" e passa a alertar sobre "sem área" — que é uma pergunta muito mais fácil de responder

Detalhamento em [`PRODUCT_INFORMATION_ARCHITECTURE.md`](./PRODUCT_INFORMATION_ARCHITECTURE.md).

**Benefício esperado.** O painel passa a comportar a vida inteira sem virar caos. Habilita "onde gastei meu tempo" por área, que é mais útil que por projeto.

**Complexidade:** média. Migration + campo em formulários + filtro global. **Risco:** médio — se o enum for mal escolhido, muda-lo depois é custoso. Escolher poucos e genéricos.
**Dependências:** nenhuma.
**Custo operacional:** classificação inicial do acervo existente. **Custo recorrente:** nenhum.

**Se nada for feito.** O painel permanece uma ferramenta de trabalho e a vida pessoal fica em outro lugar — exatamente o problema de fragmentação que Lucas relata ter com Notion, caderno e Google Agenda.

---

## P1-6 · Captura mobile de um toque

**Categoria:** mobile / captura

**Problema.** Capturar por voz no celular exige seis interações antes de a transcrição começar.

**Evidência.**
- FAB abre `QuickCaptureModal` `[DOSSIÊ]`
- O modal tem 2 abas (Texto/Áudio) `[DOSSIÊ]`
- A aba texto tem 5 campos: conteúdo, título, projeto, tipo, prioridade `[DOSSIÊ]`
- Sequência para áudio: FAB → aba Áudio → gravar → falar → parar → enviar `[INFERÊNCIA do fluxo descrito]`

**Impacto no uso real.** Os casos mobile do briefing são de 5 a 30 segundos, frequentemente com uma mão, frequentemente em movimento. Seis toques com precisão é o suficiente para Lucas desistir e "anotar depois" — e depois é onde as coisas se perdem. O princípio "capturar primeiro" falha exatamente onde é mais necessário.

**Causa provável.** O modal mobile é o modal desktop responsivo. `[DOSSIÊ: o dossiê descreve responsividade, não fluxos distintos]`

**Recomendação.**
- No mobile, **pressão longa no FAB inicia a gravação diretamente** — sem abrir modal, sem escolher aba. Solta o dedo, para de gravar. Um gesto.
- Toque simples no FAB abre a captura de texto com **um único campo visível** e o teclado já aberto. Os demais campos ficam atrás de "adicionar detalhes"
- A captura salva com o mínimo. Classificação é progressiva, feita depois, no desktop ou na Entrada
- Após a transcrição, aparece o passo de correção de P0-2 — que no mobile deve ser um campo grande e legível, com "Analisar" e "Só salvar" lado a lado

**Benefício esperado.** Da intenção de capturar até estar falando: 1 gesto. Isso é o que torna o áudio realmente utilizável na rua.

**Complexidade:** baixa a média.
**Risco:** baixo. Pressão longa precisa de feedback tátil/visual claro para não parecer travamento.
**Dependências:** **P0-1** (a captura precisa sincronizar) e **P0-2** (o passo de correção).
**Custo operacional:** nenhum. **Custo recorrente:** aumento de chamadas ao Whisper — desejável, mas reforça a necessidade de P2-9.

**Se nada for feito.** O celular continua sendo um lugar ruim para capturar, e as coisas capturadas fora do desktop continuam se perdendo.

---

# P2 — Evolução importante

Formato condensado. Todas seguem o mesmo método; os campos completos estão em [`RECOMMENDATIONS.json`](./RECOMMENDATIONS.json).

---

**P2-1 · Consolidar design system.** Extrair componentes base (`Card`, `Section`, `Badge`, `Button`, `Field`, `EmptyState`), reduzir de 9 famílias de cor para neutro + 1 acento + 1 alerta, padronizar radius em 2 valores, corrigir áreas de toque <44px, unificar renderização de erro em `DataErrorNotice`, definir 2 larguras de container com critério. **Evidência:** `[DOSSIÊ]` — padrão de card repetido em dezenas de arquivos sem extração, 9 cores semânticas, 3 `max-w`, erros em duas formas, toque <44px. **Impacto:** viabiliza toda mudança visual futura a custo baixo; hoje qualquer ajuste é um trabalho de dezenas de arquivos. **Esforço:** médio. **Risco:** baixo. **Depende de:** P1-2 (fazer depois de saber a forma final de Hoje evita retrabalho).

**P2-2 · PWA e notificações push.** Manifest, service worker, ícones, e Web Push. **Evidência:** `[INFERÊNCIA de alta confiança]` — nenhuma menção a PWA em nenhum dos 10 documentos do dossiê. **Impacto:** é a **única** via para as notificações da seção 11 do briefing chegarem ao iPhone. Sem PWA, "sua reunião começa em uma hora" só existe com o painel aberto na tela. **Esforço:** médio. **Risco:** médio — Web Push em iOS exige adicionar à Tela de Início, o que é um passo manual que precisa ser explicado. **Depende de:** P1-4 (ter o que notificar) e P0-1 (sincronização confiável). **Custo recorrente:** nenhum.

**P2-3 · IA diretiva sobre estado agregado.** Uma operação de LLM que lê um snapshot determinístico do dia/semana e produz de 1 a 3 recomendações redigidas, priorizadas. **Evidência:** `[DOSSIÊ]` — nenhuma operação atual opera sobre agregado. **Impacto:** cobre os casos que regras não cobrem (ranqueamento semântico, julgamento situacional). **Esforço:** médio. **Risco:** médio — alucinação, custo. **Depende de:** P1-1, P1-3, P1-4. **Custo recorrente:** ~1 chamada `gpt-4.1-mini` por dia, cacheada. Ordem de grandeza de centavos por mês. **Condição de entrada:** só construir depois que o motor determinístico estiver rodando e for possível medir o que ele *não* consegue dizer. Construir antes é inverter a ordem correta.

**P2-4 · Unificar Entrada, Ideias e Revisão.** Uma tela de itens com visões salvas. `/ideias` vira visão salva; `/revisao` vira ritual semanal + card condicional em Hoje. Navegação cai de 8 para 6. **Evidência:** `[CÓDIGO]` — três telas são listas filtradas da mesma entidade com três implementações de filtro. **Impacto:** menos lugares para procurar a mesma coisa; uma implementação em vez de três. **Esforço:** médio. **Risco:** médio — Lucas tem memória muscular das rotas atuais. **Depende de:** P1-5 (as visões salvas ficam muito melhores com área).

**P2-5 · Memória de projeto e preparação de reunião.** Uma visão de projeto que responde: o que foi discutido, o que foi decidido, o que está aberto, o que depende de terceiros, o que preciso preparar, qual a próxima ação. Mais um briefing gerado antes de reuniões. **Evidência:** briefing seção 5 detalha isso para o Grupo Almeida; hoje o detalhe de projeto agrupa itens por tipo `[DOSSIÊ]`, sem linha do tempo nem estado de discussão. **Impacto:** alto para o Grupo Almeida especificamente; menor para os demais projetos. **Esforço:** alto. **Risco:** médio. **Depende de:** P1-5, P2-6. **Nota:** enviar ao LLM apenas as últimas N interações do projeto, não o histórico integral — ver `MASTER_STRATEGIC_AUDIT.md` §12.3.

**P2-6 · Dependências de terceiros e follow-up.** Enriquecer o status `blocked` com: de quem depende, desde quando, e quando cobrar. **Evidência:** `[CÓDIGO]` — existe status `blocked` e a seção "Aguardando" em Hoje, mas sem quem/desde quando. **Impacto:** resolve uma dificuldade declarada ("acompanhar algo que depende de outra pessoa") com esforço muito baixo. **Esforço:** baixo. **Risco:** baixo. **Depende de:** nada. **Nota:** esta é a melhor relação impacto/esforço de todo o P2 — considerar antecipar.

**P2-7 · Estimativas aprendidas com histórico.** Sugerir duração a partir de sessões concluídas do mesmo tipo de trabalho. **Evidência:** briefing seção 19. **Impacto:** médio, e crescente com o tempo. **Esforço:** médio. **Risco:** **alto** — falsa precisão. Aplicar rigorosamente as cinco regras de `MASTER_STRATEGIC_AUDIT.md` §4.4: nunca alterar automaticamente, mínimo de 5 amostras, mostrar faixa e não ponto, agrupar por tipo, exibir o tamanho da amostra. **Depende de:** P1-1 com pelo menos 4–6 semanas de dados reais.

**P2-8 · Recorrências fora do módulo Planos.** Permitir criar uma `recurrence_rule` diretamente de um item ou projeto. **Evidência:** `[CÓDIGO]` — o motor é determinístico, testado e idempotente, mas só alcançável via importação de documento. **Impacto:** desbloqueia obrigações recorrentes reais — revisão semanal do sistema, envio de nota fiscal, follow-up mensal com cliente, renovação de domínio. **Esforço:** baixo. **Risco:** baixo. **Depende de:** P0-3 (o cron precisa comprovadamente rodar) e P1-5.

> **Correção de 24/07/2026.** A versão anterior citava "academia, suplemento" como caso de uso e dizia que isso alimentaria os blocos de vida de P1-3. **Errado nos dois pontos.** Academia e suplemento são rotinas que já funcionam sem o painel — não devem virar itens recorrentes a concluir. E P1-3 não usa mais blocos de vida. O caso de uso legítimo de recorrência é a obrigação **esquecível e periódica**: aquilo que Lucas de fato esquece se ninguém lembrar. O teste continua sendo o de `MASTER_STRATEGIC_AUDIT.md` §0.1.

**P2-9 · Auditoria e controle de custo de IA.** Registrar `/api/audio/transcribe` em `ai_runs`; extrair a lógica de custo de `openai-plan-structurer.ts` para módulo próprio; gravar versão de prompt em cada execução; exibir custo semanal em `/configuracoes`. **Evidência:** `[DOSSIÊ]` — transcrição não auditada, acoplamento cruzado de `estimateCostUsd`. **Impacto:** com P1-6 aumentando o volume de áudio, a maior fonte de custo do sistema fica invisível. **Esforço:** baixo. **Risco:** baixo. **Depende de:** nada. **Nota:** considerar antecipar para junto de P1-6.

**P2-10 · Lista de compras.** Um tipo de item com comportamento próprio: agrupável, marcável em lote, otimizado para uso mobile com uma mão. **Evidência:** briefing seções 3 e 4. **Impacto:** alto em frequência, baixo em complexidade — e é o caso que mais testa se o painel realmente comporta a vida pessoal. **Esforço:** baixo. **Risco:** baixo. **Depende de:** P1-5.

**P2-11 · Componente de modal compartilhado.** Extrair overlay, foco, Escape e animação para um componente único. **Evidência:** `[DOSSIÊ]` — três modais reimplementam tudo, com três sombras diferentes. **Impacto:** dívida que impacta UX; corrigir um bug de foco hoje exige três lugares. **Esforço:** baixo. **Risco:** baixo. **Depende de:** P2-1.

**P2-12 · Controle granular de sync com Calendar.** Expor em UI as rotas `sync-item` e `sync-plan`, que existem sem chamador. **Evidência:** `[DOSSIÊ]` — *"sem chamador de UI identificado"*. **Impacto:** com a vida inteira no painel, Lucas não vai querer "comprar detergente" no Google Calendar. **Esforço:** baixo. **Risco:** baixo — mas exige antes trazer `items.calendar_sync` e `execution_plans.calendar_sync_scope` para dentro dos schemas Zod, hoje fora do ciclo de validação `[DOSSIÊ]`. **Depende de:** P1-5.

---

# P3 — Expansão futura

Itens legítimos, com valor real, que não competem com P0–P2. Cada um só deve ser reconsiderado quando a condição de entrada indicada for satisfeita.

**P3-1 · Planejamento semanal explícito.** Uma visão de semana com carga por dia e distribuição de comprometimento. *Condição de entrada:* pelo menos 6 semanas de dados de capacidade e sessão. Construir antes seria planejar sobre números fictícios.

**P3-2 · Organização financeira.** Está no escopo declarado, mas é um domínio inteiro (contas, categorias, recorrências, conciliação). *Condição de entrada:* o núcleo de tempo estar estável e em uso há pelo menos 3 meses. Sério risco de virar um segundo produto dentro do produto.

**P3-3 · Horas, contratos e rentabilidade.** Relacionar `work_sessions` a valores. *Condição de entrada:* P1-1 com histórico confiável e pelo menos dois projetos com valor contratado.

**P3-4 · Pipeline de candidaturas e carreira.** Vagas, aderência, currículo, cartas, acompanhamento, entrevistas. *Condição de entrada:* validar se a frequência justifica estrutura própria — pode ser resolvido com um projeto + área `carreira` + itens, sem código novo. **Testar a solução barata primeiro.**

**P3-5 · Modo foco.** Ocultar tudo exceto a atividade atual. *Condição de entrada:* P1-1 e P1-2 em uso. Provavelmente 20 linhas de CSS sobre a zona "Agora" — barato, mas sem sentido antes dela existir.

**P3-6 · Widget iOS e Atalhos.** Alto valor para captura instantânea, mas exige app nativo ou Atalhos via API. *Condição de entrada:* P2-2 (PWA) em uso e comprovadamente insuficiente. **Risco alto de esforço desproporcional.**

**P3-7 · Tema escuro.** Reservado no `globals.css` `[DOSSIÊ]`. *Condição de entrada:* P2-1 concluído — com tokens consolidados é barato; sem eles é um trabalho de dezenas de arquivos.

---

## O que não entra em nenhuma prioridade

Ver [`WHAT_NOT_TO_BUILD.md`](./WHAT_NOT_TO_BUILD.md) para a lista completa com justificativas: leitura de caixa de entrada do Gmail, MCP, agentes autônomos, multi-usuário, Outbox transacional, dashboard de métricas, hábitos com sequências e gamificação, integração com contatos e documentos, suíte E2E completa de UI, e reescrita arquitetural.
