# Especificações de Implementação — P0 e P1

Especificações destinadas a execução posterior por Claude Code ou outro agente. **Nenhum código foi escrito nesta auditoria.**

Cada brief contém: problema, solução, fluxo desejado, arquivos e módulos provavelmente afetados, mudanças de dados, mudanças de interface, regras de negócio, integrações, estados de erro, acessibilidade, testes necessários, critérios de aceitação e riscos de regressão.

> **Revisão de 24/07/2026 — com acesso ao código-fonte.** Os caminhos e nomes de arquivo abaixo foram **verificados no repositório**, não inferidos. Três briefs mudaram de escopo: P0-2 ficou muito menor (a estrutura já existe), P1-1(a) deixou de ser criação de campo, e P1-3 deixou de exigir blocos recorrentes e decisão sobre escopo OAuth.

---

# BRIEF P0-1 · Homologar a sincronização mobile já corrigida

> **Correção de 25/07/2026.** Este brief tratava a sincronização mobile como um bug não diagnosticado, com investigação a partir de três hipóteses abertas. Isso não reflete o estado atual: o projeto já passou por correções de sincronização, sessão, workspace e parsing dos timestamps do Supabase (ver histórico de commits — `fix: exibe erros reais de consulta e adiciona diagnóstico de sincronização`, `fix: corrige validação Zod de datas que rejeitava timestamps reais do Postgres`, `fix: grant scoped database access for cloud migration`), e a própria verificação no código já **refutou H3**: o `ChangeNotifier` revalida ao ganhar foco de janela e ao voltar de segundo plano — a solução que este brief recomendaria já está implementada. A etapa imediata é **homologar os fluxos principais**, não redescobrir a causa raiz do zero. Alterar cookies, RLS, autenticação ou implementar Supabase Realtime **não são recomendações desta etapa** — só se tornam hipóteses a considerar se a homologação abaixo revelar um caso real e reproduzível de não sincronização.

## Problema
Dois componentes de diagnóstico (`SyncDiagnosticsCard`, `DataFlowDiagnosticsCard`) e uma rota de apoio (`/api/debug/sync-status`) seguem marcados como "TEMPORÁRIO" no código, criados durante a investigação de um problema de sincronização mobile. `[DOSSIÊ]` Não há, nesta auditoria, confirmação de que o problema original persiste — nem confirmação de que foi totalmente resolvido. É preciso fechar essa dúvida por homologação antes de remover os diagnósticos ou de investir mais em mobile.

## Solução
Homologar os fluxos principais em computador e celular, usando os diagnósticos que já existem como instrumento de verificação (não como ponto de partida de uma investigação do zero). Só escalar para mudança de cookie/sessão/RLS/Realtime se a homologação encontrar um caso real não sincronizado.

## Fluxo desejado
1. Lucas captura um item no celular (texto e áudio)
2. O item é persistido no Supabase sob o workspace correto
3. Ao abrir ou focar o painel no desktop, o item aparece sem ação manual
4. O mesmo no sentido inverso (criação e edição no desktop aparecem no celular)

## Roteiro de homologação (etapa imediata)

1. **Homologar os fluxos principais no computador e no celular** — login, captura, edição, conclusão, arquivamento.
2. **Confirmar revalidação ao retornar à aba** — sair do app (trocar de aba/app, bloquear tela) e voltar; o conteúdo deve estar atualizado sem recarregar manualmente. Isso testa diretamente a correção do `ChangeNotifier` (foco/visibilidade) já presente no código.
3. **Confirmar criação e edição nos dois dispositivos** — criar um item no celular e verificar que aparece no desktop ao focar a janela, e vice-versa.
4. **Confirmar captura por texto e por áudio** especificamente no celular — são os dois modos de entrada mais usados fora do desktop.
5. **Verificar se ainda existe algum caso não sincronizado** — usar `SyncDiagnosticsCard`/`DataFlowDiagnosticsCard` para comparar sessão do servidor vs. navegador **só se** algum dos passos acima falhar.
6. **Só então remover os diagnósticos temporários** (os dois cards e a rota `/api/debug/sync-status`) — nunca antes de completar 1–5.

## Se a homologação revelar um caso real não sincronizado — hipóteses condicionais, nesta ordem

Estas só entram em jogo se o passo 5 acima encontrar uma falha reproduzível. Não são a recomendação padrão desta etapa.

**H1 — Cookie de sessão não persiste em Safari iOS.**
Teste: abrir `/configuracoes` no iPhone e comparar sessão do servidor vs. navegador via `SyncDiagnosticsCard`. Divergência confirma H1.
Se confirmado: revisar atributos de cookie (`SameSite`, `Secure`, `Domain`) na configuração do `@supabase/ssr` e a renovação em `src/proxy.ts`. **Alteração de cookie/autenticação só entra aqui, condicionada à confirmação.**

**H2 — Workspace não resolvido a tempo no cliente mobile.**
Teste: verificar se `ensure_personal_workspace()` retorna o `workspace_id` esperado no mobile e se as queries retornam vazio sem erro.
Se confirmado: garantir que o `RepositoryProvider` só instancie repositórios após a resolução do workspace, com estado de carregamento explícito. **Isso não é mudança de RLS** — é sequenciamento no cliente.

**H3 — Ausência de sincronização entre dispositivos (não é bug, é funcionalidade ausente).**
`[REFUTADA — verificado no código]` O `ChangeNotifier` já revalida ao ganhar foco de janela e ao voltar de segundo plano. Supabase Realtime **não é recomendado** para este cenário de usuário único — resolveria colaboração simultânea, que não é o caso — e só voltaria à mesa se a homologação mostrar que a revalidação por foco, de fato, não é suficiente na prática.

## Arquivos prováveis, se uma hipótese condicional for confirmada
- `src/proxy.ts`
- `src/providers/auth.provider.tsx`
- `src/providers/repository.provider.tsx`
- `src/lib/hooks.ts` (`useReactiveQuery`)
- `src/components/sync-diagnostics-card.tsx` — remover só após homologação completa
- `src/components/data-flow-diagnostics-card.tsx` — remover só após homologação completa
- `src/app/api/debug/sync-status/route.ts` — remover só após homologação completa
- `src/app/configuracoes/page.tsx` — remover as duas seções de diagnóstico

## Mudanças de dados
Nenhuma, na etapa de homologação. Só se uma hipótese condicional for confirmada.

## Mudanças de interface
- Remoção dos dois cards de diagnóstico de `/configuracoes`, **depois** da homologação
- Indicador discreto de estado offline, sem modal bloqueante (já existe via `DataErrorNotice`/`useOnlineStatus` — verificar se cobre o caso mobile)

## Regras de negócio
- Uma captura nunca pode ser perdida por falha de sincronização
- Se a sessão expirar, o usuário é levado ao login sem perder o conteúdo digitado

## Integrações
Supabase Auth e PostgreSQL. Nenhuma alteração de escopo prevista na etapa de homologação.

## Estados de erro
| Situação | Comportamento |
|---|---|
| Sessão expirada no mobile | Renovação silenciosa; se falhar, redirecionar ao login preservando o conteúdo |
| Workspace não resolvido | Estado de carregamento explícito, nunca lista vazia silenciosa |
| Sem conexão | Indicador discreto; captura enfileirada se possível |

## Acessibilidade
- Estado de carregamento anunciado via `aria-live`
- Nunca comunicar erro apenas por cor

## Testes necessários
- Fumaça em produção: login em dois dispositivos → captura de texto em A → visível em B ao focar → captura de áudio em A → visível em B ao focar → edição em B → visível em A ao focar
- Manual: iOS Safari e Chrome Android, incluindo retorno de segundo plano após mais de uma hora
- Só se uma hipótese condicional for confirmada: unitário cobrindo a correção específica (cookie, sequenciamento de workspace, etc.)

## Critérios de aceitação
1. Um item capturado no celular (texto ou áudio) aparece no desktop ao focar a janela, sem recarregar manualmente
2. O mesmo no sentido inverso
3. Após uma hora em segundo plano no iOS, voltar ao painel mantém a sessão ou redireciona ao login sem estado inconsistente
4. Nenhum caso reproduzível de não sincronização é encontrado nos passos 1–4 do roteiro de homologação
5. Nenhum texto em `snake_case` aparece em `/configuracoes`
6. Os três arquivos de diagnóstico foram removidos **depois** de 1–4 confirmados

## Riscos de regressão
- Remover os diagnósticos antes de concluir a homologação elimina a capacidade de investigar qualquer caso residual — só remover depois
- Se uma hipótese condicional exigir alterar atributos de cookie, isso pode invalidar sessões existentes — aceitável, exige novo login, mas deve ser comunicado como mudança deliberada, não acidental

---

# BRIEF P0-2 · Corrigir a transcrição antes da análise de IA

## Problema
A transcrição do Whisper é enviada à triagem de IA sem possibilidade de correção. Erros em nomes, datas e horários produzem propostas erradas. `[DOSSIÊ + declarado por Lucas]`

## Solução
`[CÓDIGO — verificado]` **A estrutura já está 90% pronta.** A correção é menor do que a primeira versão estimava.

O que já existe em `quick-capture-modal.tsx`:
- A fase `audioPhase === 'saved'` **já exibe a transcrição** (linha ~411)
- **Mas em uma `<div>` somente leitura**, não em um campo editável
- Já existem os dois botões corretos: **"Concluir sem IA"** e **"Analisar com IA"**
- O item já é salvo **antes** de qualquer análise (linha ~180), com comentário explícito: *"Uma falha na IA depois disso nunca pode apagar esta captura"*

A correção é: **trocar a `<div>` por um `<textarea>` controlado e persistir a edição no item antes de chamar a triagem.**

`/api/ai/triage-capture` lê `item.content ?? item.title` do banco (linha ~106) — basta salvar o conteúdo editado antes de chamar.

**Nenhuma mudança de dados é necessária.** `[CÓDIGO — verificado]` O `ItemDetailModal` reconstrói a transcrição original a partir do payload do evento `item.created` em `domain_events`, não de um campo dedicado. Editar `content` livremente preserva a proveniência automaticamente.

*Correção da primeira versão: eu afirmei que existia um campo dedicado de "transcrição editada". Não existe — o original vem do evento de domínio. O efeito prático é o mesmo, e o custo é ainda menor.*

## Fluxo desejado

```
gravando → transcrevendo → [TRANSCRIÇÃO EDITÁVEL] → analisar com IA → revisar propostas
                                    ↑ novo estado
```

1. Lucas grava e envia
2. A transcrição retorna e o item é salvo na Entrada imediatamente
3. **Novo:** a transcrição aparece em campo editável, preenchido, sem exigir edição
4. Duas ações: **Analisar com IA** (primária) e **Salvar sem analisar** (secundária)
5. Se editado, o texto original é preservado; o editado é o enviado ao LLM
6. A triagem prossegue como hoje

## Arquivos afetados `[verificados]`
- `src/components/quick-capture-modal.tsx` — trocar a `<div>` de transcrição (fase `saved`) por `<textarea>` controlado; chamar `updateItem` antes de `handleAnalyzeWithAI`
- Nenhum outro. `/api/ai/triage-capture` já lê do banco; `item-detail-modal.tsx` já reconstrói o original do evento de domínio

## Mudanças de dados
**Nenhuma.** `[CÓDIGO — verificado]` O `content` do item é o campo editado; o original vive no payload de `item.created` em `domain_events`.

## Mudanças de interface

**Desktop:**
```
┌──────────────────────────────────────────────────┐
│  Transcrição                                     │
│  ┌────────────────────────────────────────────┐  │
│  │ Reunião com o grupo Almeida na quinta às   │  │
│  │ duas da tarde para revisar a proposta      │  │
│  └────────────────────────────────────────────┘  │
│  Corrija nomes, datas ou horários se necessário. │
│                                                  │
│  [ Salvar sem analisar ]   [ Analisar com IA ]   │
└──────────────────────────────────────────────────┘
```

**Mobile:** texto grande, editável ao toque, duas ações empilhadas na base. Ver `MOBILE_EXPERIENCE_STRATEGY.md` §3.3.

## Regras de negócio
- O item é salvo **antes** de qualquer análise — já é o comportamento atual `[CÓDIGO — verificado]`, manter
- A edição é persistida via `updateItem` **antes** de chamar a triagem, porque a rota lê do banco
- A transcrição original permanece recuperável pelo evento `item.created`
- "Concluir sem IA" é um caminho de primeira classe — já existe com esse rótulo, manter
- O campo nunca exige edição para prosseguir
- O `title` do item é gerado dos primeiros 60 caracteres da transcrição `[CÓDIGO — verificado]`. Ao editar, decidir: regenerar o título ou preservar. **Recomendação: regenerar apenas se o título ainda for o prefixo automático não modificado**

## Integrações
OpenAI Whisper (inalterado) e Responses API (passa a receber o texto editado).

## Estados de erro
| Situação | Comportamento |
|---|---|
| Transcrição falha | Item salvo sem transcrição; botão "Tentar novamente (sem regravar)" — já existe `[DOSSIÊ]` |
| Análise de IA falha | Item permanece salvo com a transcrição corrigida; oferecer nova tentativa |
| Modal fechado durante a edição | Texto editado preservado; reabrir restaura |

## Acessibilidade
- Campo com rótulo associado
- Foco não deve saltar automaticamente para o campo — o padrão é não editar
- Ações anunciadas corretamente; "Analisar com IA" deve indicar que abrirá uma etapa de revisão

## Testes necessários
- Componente: o novo estado renderiza a transcrição retornada
- Componente: editar e clicar em Analisar envia o texto editado, não o original
- Componente: "Salvar sem analisar" encerra o fluxo com o item persistido
- Componente: fechar e reabrir preserva a edição
- Rota: `/api/ai/triage-capture` prioriza o texto editado quando presente
- Regressão: o fluxo de áudio existente continua funcionando quando não há edição

## Critérios de aceitação
1. Após a transcrição, o texto aparece editável antes de qualquer análise
2. Corrigir uma palavra e analisar resulta em proposta baseada no texto corrigido
3. A transcrição original permanece visível no painel de proveniência do item
4. É possível salvar sem analisar em um clique
5. Nenhuma etapa adicional é imposta a quem não quer editar — basta clicar em Analisar
6. No mobile, o texto é legível e editável sem zoom

## Riscos de regressão
- A máquina de estados do `QuickCaptureModal` é a parte mais complexa do componente — mapear todos os estados atuais antes de inserir o novo
- Testes existentes de `AudioCaptureReview` podem assumir transição direta de transcrição para triagem

---

# BRIEF P0-3 · Homologar e tornar observáveis as automações

## Problema
O cron horário nunca foi homologado em produção. Não há como saber se executa, falha ou falha silenciosamente. `[DOSSIÊ]`

## Solução
Verificar execução real, e substituir a incerteza por um card permanente de saúde alimentado por `automation_runs`.

## Fluxo desejado
1. O cron executa de hora em hora
2. Cada passo grava em `automation_runs` com status
3. `/configuracoes` exibe o estado atual em linguagem compreensível
4. Uma falha dispara o alerta que já existe

## Arquivos provavelmente afetados
- `src/app/api/cron/automation-tick/route.ts` — verificação, provavelmente sem alteração
- `src/platform/automation/automation-runner.ts` — garantir gravação de falha, não só sucesso e pulo
- Novo componente `automation-health-card.tsx`
- Nova query de leitura de `automation_runs`
- `src/app/configuracoes/page.tsx`
- `vercel.json` — confirmar o agendamento

## Mudanças de dados
Nenhuma estrutural. `[HIPÓTESE — verificar]` Confirmar que `automation_runs` registra falhas com mensagem de erro, e não apenas `completed` e `skipped`.

## Mudanças de interface

```
┌──────────────────────────────────────────────────┐
│  Automações                                      │
│                                                  │
│  Última execução      hoje, 14:00           ✓    │
│  Últimas 24 horas     24 execuções, 0 falhas     │
│                                                  │
│  Recorrências         3 itens criados hoje       │
│  Sincronização        última: hoje, 14:00        │
│  Resumo diário        enviado hoje, 07:00        │
└──────────────────────────────────────────────────┘
```

Quando há falha:
```
  ⚠ 2 falhas nas últimas 24 horas
    Última: não foi possível acessar o Google Calendar
    [ Ver detalhes ]  [ Reconectar Google ]
```

## Regras de negócio
- Nenhuma categoria técnica de erro na interface — sempre traduzida
- "Sem execução nas últimas 2 horas" é uma condição de alerta, não um estado neutro
- O card é somente leitura; não há botão de disparo manual do cron na interface

## Integrações
Vercel Cron, Google Calendar, Gmail. Somente leitura de estado.

## Estados de erro
| Situação | Comportamento |
|---|---|
| Nenhuma execução registrada | "Nenhuma execução registrada. As automações podem não estar ativas." |
| Falhas recorrentes | Alerta com a causa traduzida e ação de correção |
| `automation_runs` inacessível | `DataErrorNotice` padrão |

## Acessibilidade
- Estado não comunicado apenas por cor — sempre acompanhado de texto
- Contagens em `aria-live="polite"`

## Testes necessários
- Unitário: query de saúde agrega corretamente por tipo e status
- Componente: renderiza estados saudável, com falha e sem execução
- Unitário: tradução de erro técnico para mensagem compreensível
- Manual: consultar logs da Vercel e confirmar correspondência com `automation_runs`

## Critérios de aceitação
1. É possível responder, com evidência na interface: "o cron rodou hoje?"
2. Uma falha aparece com causa em linguagem comum e ação sugerida
3. Nenhum `snake_case` ou status HTTP cru é exibido
4. O card carrega em menos de um segundo
5. A ausência de execuções recentes é sinalizada como problema

## Riscos de regressão
Nenhum significativo — é leitura. Cuidado apenas para não introduzir consulta pesada em `/configuracoes`.

---

# BRIEF P1-1 · Tempo como primitivo de domínio

## Problema
O sistema não modela duração, sessão de trabalho nem atividade atual. `[INFERÊNCIA de alta confiança a partir do DOSSIÊ]`

## Solução
Três primitivos, entregues em sequência, cada um com valor isolado. Especificação conceitual completa em [`TIME_CAPACITY_AND_INTERRUPTION_SYSTEM.md`](./TIME_CAPACITY_AND_INTERRUPTION_SYSTEM.md).

## Fluxo desejado

**Estimativa:** ao triar um item na Entrada ou defini-lo como foco, escolher a duração entre seis opções.

**Sessão:** em Hoje, clicar em "Começar" no item em foco → sessão inicia → cronômetro conta → pausar, concluir ou trocar.

**Retroativo:** "registrar trabalho já feito" com item, duração e quando, em um formulário de três campos.

**Interrupção:** com sessão ativa, abrir a Captura Rápida mostra três opções — o padrão mantém o comportamento atual.

## Arquivos provavelmente afetados

**Domínio**
- `src/modules/items/domain/item.schema.ts` — **nenhuma alteração necessária.** `estimatedMinutes` já existe no `ItemSchema` e no `CreateItemSchema` `[CÓDIGO — verificado]`
- Novo: `src/modules/time/domain/work-session.schema.ts`

**Aplicação**
- Novo: `src/modules/time/application/work-session.commands.ts`
- Novo: `src/modules/time/application/work-session.queries.ts`
- Novo: `src/modules/time/application/work-session.repository.ts`

**Infraestrutura**
- Novo: `src/modules/time/infrastructure/supabase-work-session.repository.ts`
- Nova migration

**Plataforma**
- `src/platform/events/event.schema.ts` — cinco novos eventos

**Interface**
- `src/app/hoje/page.tsx`
- `src/components/quick-capture-modal.tsx`
- `src/components/item-detail-modal.tsx`
- `src/app/entrada/page.tsx`
- Novos: `now-card.tsx`, `session-timer.tsx`, `estimate-picker.tsx`, `retroactive-session-form.tsx`

## Mudanças de dados

`items.estimated_minutes` **já existe** com `check (estimated_minutes > 0)` em `core_schema.sql` `[CÓDIGO — verificado]`. Nenhuma migration para estimativa.

```sql
-- nova tabela
CREATE TABLE work_sessions (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES workspaces,
  item_id uuid REFERENCES items,
  project_id uuid REFERENCES projects,
  area text,
  work_type text NOT NULL,
  started_at timestamptz NOT NULL,
  ended_at timestamptz,
  source text NOT NULL,            -- timer | manual
  resume_note text,
  interrupted_by_item_id uuid REFERENCES items,
  needs_confirmation boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
```

**Índices:**
- `(workspace_id, started_at DESC)`
- Único parcial em `(workspace_id) WHERE ended_at IS NULL` — garante no banco o invariante de sessão única ativa

**RLS:** política padrão via `is_workspace_member(workspace_id)`.
**Trigger:** `set_updated_at`.

## Mudanças de interface
- Zona Agora em Hoje — ver [`TODAY_EXPERIENCE_REDESIGN.md`](./TODAY_EXPERIENCE_REDESIGN.md) §3.2
- Seletor de estimativa na triagem e no detalhe de item
- Três opções de interrupção na Captura Rápida quando há sessão ativa
- Formulário de registro retroativo, acessível em um clique a partir de Hoje
- Cronômetro no título da aba do navegador

## Regras de negócio
1. **No máximo uma sessão ativa por workspace**, garantido por índice único parcial
2. Iniciar uma sessão com outra ativa encerra a primeira automaticamente e registra o evento
3. Sessão sem item é permitida (trabalho não catalogado); sessão sem workspace não
4. `work_type` deriva do tipo do item quando possível; sempre ajustável
5. Sessão ativa há mais de 4 horas sem interação é encerrada pelo cron e marcada `needs_confirmation = true` — **a duração não é registrada até a confirmação**
6. Sessão retroativa exige apenas item ou descrição, duração e data
7. Corrigir uma sessão gera evento `work_session.corrected`, preservando a trilha
8. O tempo decorrido é calculado no cliente a partir de `started_at` — **nunca gravado periodicamente no banco**
9. Item sem estimativa entra no foco, mas não conta para a capacidade comprometida, e a interface informa isso

## Integrações
Nenhuma externa.

## Estados de erro
| Situação | Comportamento |
|---|---|
| Falha ao iniciar sessão | Cronômetro não inicia; erro claro; nenhum estado fantasma |
| Falha ao encerrar | Repetir; se persistir, permitir encerramento retroativo |
| Sessão órfã (item excluído) | Sessão preservada com referência nula e rótulo genérico |
| Relógio do dispositivo divergente | Usar `started_at` do servidor como referência |

## Acessibilidade
- Cronômetro em `aria-live="off"` com valor legível sob demanda — não anunciar a cada segundo
- Iniciar e encerrar acessíveis por teclado
- Estado da sessão nunca comunicado só por cor
- Seletor de estimativa navegável por teclado, com rótulos claros

## Testes necessários
- Domínio: schema Zod de `work_session` valida e rejeita corretamente
- Domínio: encerrar sessão com `ended_at` anterior a `started_at` é rejeitado
- Comando: iniciar sessão com outra ativa encerra a primeira
- Comando: registro retroativo cria sessão com `source = manual`
- Comando: correção gera evento
- Repositório: mapeamento linha ↔ domínio
- Query: sessão ativa retorna no máximo uma
- Componente: cronômetro conta corretamente e sobrevive a remontagem
- Componente: as três opções de interrupção produzem os efeitos esperados
- Componente: o padrão da Captura Rápida não altera o comportamento atual
- Integração: cron encerra sessão com mais de 4h e marca para confirmação

## Critérios de aceitação
1. É possível iniciar uma sessão em um clique a partir de Hoje
2. O tempo decorrido é visível sem rolar a tela
3. Só existe uma sessão ativa por vez, garantido pelo banco
4. Registrar trabalho já feito leva menos de 15 segundos
5. Capturar uma interrupção sem trocar de atividade custa exatamente o mesmo que hoje
6. Ao trocar de atividade, é possível registrar onde parou em uma linha opcional
7. Ao retomar, o tempo investido e a nota aparecem
8. Uma sessão esquecida a noite toda nunca registra a duração sem confirmação
9. Um item sem estimativa não distorce a capacidade e isso é visível

## Riscos de regressão
- A tela Hoje é a mais complexa do sistema — a zona Agora deve ser adicionada sem quebrar as seções existentes, que só serão reorganizadas em P1-2
- Alterar `item.schema.ts` afeta os testes de domínio existentes; o campo é opcional, o que reduz o risco
- Mutações frequentes de sessão podem expor problema de granularidade do `ChangeNotifier` — **verificar antes**

---

# BRIEF P1-2 · Reconstruir Hoje como central de decisão

## Problema
Oito seções de peso visual idêntico, nenhuma respondendo "o que faço agora". `[DOSSIÊ]`

## Solução
Três zonas hierárquicas. Especificação completa em [`TODAY_EXPERIENCE_REDESIGN.md`](./TODAY_EXPERIENCE_REDESIGN.md).

## Fluxo desejado
Lucas abre Hoje e, em menos de três segundos e sem rolar, sabe: o que está fazendo, há quanto tempo, o que vem depois, e se há algo exigindo decisão.

## Arquivos provavelmente afetados
- `src/app/hoje/page.tsx` — reorganização principal
- `src/components/today-calendar-card.tsx` — absorvido pela linha do tempo
- Novos: `now-zone.tsx`, `later-timeline.tsx`, `attention-zone.tsx`
- `src/modules/items/application/item.queries.ts` — `getTodayOverview` passa a incluir sessão ativa e capacidade
- `src/modules/planning/application/daily-plan.commands.ts` — sem mudança estrutural

## Mudanças de dados
Nenhuma além de P1-1.

## Mudanças de interface
Reorganização completa. Ver `TODAY_EXPERIENCE_REDESIGN.md` §3 para os quatro estados da zona Agora, a estrutura da linha do tempo e o formato dos cartões de atenção.

**Migração de seções:**

| Atual | Destino |
|---|---|
| Foco do Dia | Base da zona Agora, com ordem e duração |
| Próximas Ações | Três sugestões contextuais em Depois |
| Capacidade + Calendar | Integrado à linha do tempo |
| Agendado para Hoje | Linha do tempo |
| Dos planos ativos | Linha do tempo, como itens comuns |
| Aguardando | Atenção, condicional |
| Atenção Necessária | Atenção, condicional |
| Pulso dos Projetos | **Sai** → revisão semanal |

## Regras de negócio
1. A zona Agora sempre mostra algo — nunca vazia. Os quatro estados cobrem todos os casos
2. A zona Atenção não aparece quando não há condição verdadeira
3. Máximo de três cartões em Atenção; o excedente vira uma linha de referência
4. Todo cartão de Atenção tem ação executável e ação de dispensar
5. Dispensar suprime por período proporcional ao tipo
6. A linha do tempo mostra o espaço livre com proporção visual
7. Blocos de vida aparecem com peso reduzido
8. Falha do Calendar não esvazia a linha do tempo

## Integrações
Google Calendar via `/api/integrations/calendar/today` (inalterada).

## Estados de erro
Ver `TODAY_EXPERIENCE_REDESIGN.md` §6 — tabela completa de estados incluindo primeiro acesso, dia vazio, Calendar indisponível, sessão esquecida, carregando e offline.

## Acessibilidade
- Estrutura de cabeçalhos correta: `h1` na página, `h2` por zona
- Zona Atenção com `role="region"` e rótulo
- Ordem de tabulação: Agora → Depois → Atenção
- Esqueleto de carregamento com `aria-busy`
- Nenhuma informação apenas por cor

## Testes necessários
- Componente: os quatro estados da zona Agora renderizam corretamente
- Componente: zona Atenção ausente quando não há condições
- Componente: máximo de três cartões respeitado
- Componente: linha do tempo funciona sem dados do Calendar
- Componente: falha do Calendar não esvazia a tela
- Query: `getTodayOverview` retorna sessão ativa e capacidade
- Acessibilidade: navegação por teclado percorre todas as ações

## Critérios de aceitação
1. Em desktop, "o que faço agora" e "quanto tempo tenho" são respondidos sem rolar
2. A zona Agora nunca está vazia
3. A zona Atenção está vazia em um dia sem pendências
4. O espaço livre é visível na linha do tempo, não apenas numérico
5. Falha do Calendar mantém a tela útil
6. Nenhuma seção duplica `/revisao` ou `/projetos`
7. O foco de três itens continua funcionando com a mesma trava de domínio

## Riscos de regressão
- Alto risco de regressão funcional — é a tela mais complexa. Recomendação: manter as seções antigas atrás de um sinalizador durante uma semana de uso real antes de removê-las
- `TodayCalendarCard` tem testes `[DOSSIÊ]` — preservar ou migrar a cobertura
- A trava de 3 focos é validada no domínio; a mudança de interface não pode contorná-la

---

# BRIEF P1-3 · Capacidade habitual configurável

## Problema
`[CÓDIGO — verificado]` A capacidade é uma constante fixa: `export const DAY_CAPACITY_MINUTES = 8 * 60;` em `src/lib/capacity.ts`. Oito horas, todos os dias, sempre. E `computeCapacity` trata itens sem estimativa como 30 minutos silenciosamente (`item.estimatedMinutes ?? 30`).

## Solução
Substituir a constante por quatro campos de configuração. O restante de `capacity.ts` — mesclagem de sobreposições, soma de comprometimento, sugestão de janela livre — está correto e testado. **Estender, não reescrever.**

> **Correção de 24/07/2026.** A versão anterior deste brief exigia cadastrar almoço e academia como blocos recorrentes e pedia uma decisão de produto sobre ampliar o escopo do Google Calendar. **Ambas foram retiradas.** Rotinas que já funcionam não devem ser modeladas; e, sem a necessidade de classificar blocos, o `freebusy` basta. Ver `MASTER_STRATEGIC_AUDIT.md` §0.1 e §4.

## Fluxo desejado
1. Lucas configura uma vez, em ~2 minutos: jornada habitual, horas realmente disponíveis por dia, margem
2. O sistema desconta os compromissos do Calendar (que variam por dia) e a margem
3. Hoje mostra disponível vs. comprometido, com "ajustar" para o dia excepcional
4. Ao adicionar algo que não cabe, o sistema avisa **antes**, com proposta concreta

## Arquivos afetados `[verificados]`
- `src/lib/capacity.ts` — `DAY_CAPACITY_MINUTES` vira parâmetro de `computeCapacity`; o `?? 30` vira contagem separada de itens sem estimativa
- `src/app/api/settings/digest/route.ts` — estender, ou criar rota irmã para as novas preferências
- Novo: `src/components/capacity-settings-card.tsx`
- `src/app/configuracoes/page.tsx`
- `src/app/hoje/page.tsx` e `src/components/today-calendar-card.tsx`
- `src/app/agenda/page.tsx` — carga por dia

## Mudanças de dados

Estender `workspace_settings`, que já existe com uma linha por workspace `[CÓDIGO — verificado]`:

```sql
alter table public.workspace_settings
  add column workday_start time,
  add column workday_end time,
  add column available_minutes_per_day integer,
  add column buffer_percentage integer not null default 20;
```

Ajuste excepcional do dia: preferir uma coluna em `daily_plans`, que já existe por data — evita tabela nova.

**Nenhuma tabela de blocos de vida. Nenhum novo tipo de `recurrence_rule`.**

## Mudanças de interface
- Card de capacidade habitual em `/configuracoes`, quatro campos, sem subtelas
- Texto explicativo sob o campo de horas: *"Almoço, academia, pausas e deslocamentos já estão descontados aqui — você não precisa registrá-los no painel."*
- Resumo em Hoje: `5h disponíveis · 3h30 comprometidas · ajustar`
- "ajustar" abre `3h · 4h · 5h · 6h · outro`; vale só para hoje
- Itens sem estimativa sinalizados: *"3h comprometidas · 2 itens sem estimativa"*
- Carga por dia na Agenda, em barras de texto
- Aviso **preventivo** ao adicionar item que não cabe

## Regras de negócio
1. Capacidade do dia = horas disponíveis − compromissos do Calendar − margem
2. O ajuste excepcional **substitui** as horas habituais, apenas naquela data
3. Espaço livre = capacidade − soma das estimativas dos itens de hoje
4. **Itens sem estimativa não contam** e são sinalizados — substitui o `?? 30` atual
5. Margem é percentual configurável; padrão 20%
6. Sobreposições são mescladas uma única vez — lógica existente preservada `[CÓDIGO — verificado]`
7. Sem configuração, o sistema pede a configuração — **nunca assume 8h**
8. Capacidade semanal é a soma diária; linha em Hoje apenas quando fora do normal
9. **Almoço, academia, pausas e deslocamentos nunca são entidades.** Não geram item, recorrência, notificação, conclusão nem entrada na revisão

## Integrações
Google Calendar via `freebusy`. **Sem alteração de escopo, sem reconsentimento OAuth.**

## Estados de erro
| Situação | Comportamento |
|---|---|
| Calendar indisponível | Calcular sem compromissos, sinalizando: "compromissos indisponíveis no momento" |
| Configuração ausente | Convite à configuração, sem número inventado |
| Compromissos excedem as horas disponíveis | Capacidade zero, nunca negativa; mensagem clara |

## Acessibilidade
- Barras de carga sempre acompanhadas de valor textual
- Configuração de horário navegável por teclado
- "ajustar" acessível por teclado, não só por toque
- Aviso de sobrecarga anunciado sem interromper o fluxo

## Testes necessários
- Unitário: `computeCapacity` com capacidade parametrizada substitui corretamente a constante
- Unitário: itens sem estimativa não somam e são contados à parte
- Unitário: ajuste do dia sobrepõe as horas habituais só naquela data
- Unitário: mesclagem de sobreposições — **cobertura existente preservada sem alteração**
- Unitário: sem configuração, retorna estado indefinido, não zero
- Componente: aviso preventivo aparece antes de adicionar
- Regressão: os testes atuais de `capacity.ts` continuam passando com o valor padrão

## Critérios de aceitação
1. "Você tem X horas livres" confere com a verificação manual
2. Configuração inicial leva menos de 2 minutos e tem quatro campos
3. **Nenhuma rotina pessoal precisa ser cadastrada** para a capacidade ficar correta
4. Ajustar a capacidade de hoje leva um toque e não afeta amanhã
5. Itens sem estimativa aparecem sinalizados, não embutidos no total
6. Adicionar item que não cabe gera aviso **antes**, com proposta de o que mover
7. A carga da semana é visível na Agenda
8. Falha do Calendar não impede o cálculo

## Riscos de regressão
- `capacity.ts` tem cobertura de teste — parametrizar mantendo o valor padrão evita quebrar os testes existentes
- Remover o `?? 30` **muda os números exibidos hoje**. É intencional e correto, mas deve ser comunicado na interface para não parecer defeito
- `TodayCalendarCard` consome `computeCapacity` — atualizar em conjunto

---

# BRIEF P1-4 · Motor de recomendações determinísticas

## Problema
Nenhuma camada observa o estado do sistema e diz algo. Toda informação é passiva. `[DOSSIÊ]`

## Solução
Motor de regras determinístico, sem LLM. Oito regras iniciais, deduplicação por chave estável, auto-desativação. Especificação completa em [`AI_AND_AUTOMATION_STRATEGY.md`](./AI_AND_AUTOMATION_STRATEGY.md) §4.

## Fluxo desejado
1. O cron avalia as regras de hora em hora
2. Condições verdadeiras geram notificações não duplicadas
3. Aparecem em Hoje, na zona Atenção, e como nudge quando urgentes
4. Cada uma tem ação executável e ação de dispensar
5. Dispensar silencia por período proporcional
6. Três dispensas seguidas desativam a regra

## Arquivos provavelmente afetados
- Novo: `src/platform/rules/rule-engine.ts`
- Novo: `src/platform/rules/rules/*.ts` — uma por regra
- Novo: `src/modules/notifications/application/notification.commands.ts`
- Novo: `src/modules/notifications/application/notification.queries.ts`
- `src/app/api/cron/automation-tick/route.ts` — novo passo
- `src/platform/automation/automation-runner.ts`
- Novos: `attention-zone.tsx`, `nudge-bar.tsx`
- `src/app/hoje/page.tsx`

## Mudanças de dados

A tabela `notifications` **já existe** com schema Zod `[DOSSIÊ]`.

`[HIPÓTESE — verificar antes]` Confirmar a presença de: `type`, `payload`, `state` (não lida / lida / dispensada), `dedup_key`, `dismissed_until`, `rule_id`. Se `dedup_key` faltar, adicionar — é o campo mais importante, e sem ele o sistema vira ruído.

Possível nova tabela ou colunas em `workspace_settings` para regras desativadas e contagem de dispensas.

## Mudanças de interface
- Zona Atenção em Hoje, com no máximo três cartões
- Faixa de nudge no topo, dispensável, para o que é urgente
- Cada cartão: afirmação, justificativa, ação, dispensar

## Regras de negócio
1. Toda notificação tem chave de deduplicação `(regra, entidade, janela)`
2. Não reemitir enquanto a condição não mudar de estado
3. Dispensar silencia por período definido por regra
4. Três dispensas seguidas sem ação desativam a regra e registram o fato
5. Máximo de três cartões visíveis
6. Nenhuma regra aplica mudança de domínio — apenas propõe
7. Toda regra é determinística; nenhuma chamada de LLM nesta camada
8. Taxa de aceitação calculada por regra

## Integrações
Nenhuma externa. Roda sobre o cron existente.

## Estados de erro
| Situação | Comportamento |
|---|---|
| Falha na avaliação de uma regra | Registrar e continuar; uma regra com defeito não derruba as demais |
| Falha ao gravar notificação | Registrar; será reavaliada no próximo tick por idempotência |
| Ação da notificação falha | Erro claro; notificação permanece |

## Acessibilidade
- Zona Atenção como região rotulada
- Notificações novas em `aria-live="polite"`
- Dispensar acessível por teclado
- Severidade nunca só por cor

## Testes necessários
- Unitário: cada uma das oito regras, com casos verdadeiro e falso
- Unitário: deduplicação impede reemissão sem mudança de estado
- Unitário: dispensa respeita a janela de silêncio
- Unitário: três dispensas desativam a regra
- Unitário: limite de três cartões
- Componente: cartão renderiza os quatro elementos obrigatórios
- Integração: passo do cron avalia e emite corretamente

## Critérios de aceitação
1. Um projeto parado há 7 dias gera exatamente **uma** notificação, não sete
2. Dispensar impede reaparecimento no período definido
3. Toda notificação diz o quê, por quê e oferece ação
4. A zona Atenção está vazia em um dia sem pendências
5. Nenhuma chamada de IA é feita por esta camada
6. Três dispensas seguidas desativam a regra automaticamente

## Riscos de regressão
- Adicionar passo ao cron pode aumentar o tempo de execução — manter a idempotência
- Regras mal calibradas geram ruído imediato e minam a confiança rapidamente — começar conservador e afrouxar

---

# BRIEF P1-5 · Áreas da vida e alternador de contexto

## Problema
Um único agrupador (`project_id`) para um escopo de vida com 15 áreas. `[CÓDIGO + briefing §4]`

## Solução
Campo `area` de primeira classe + alternador de contexto global. Especificação completa em [`PRODUCT_INFORMATION_ARCHITECTURE.md`](./PRODUCT_INFORMATION_ARCHITECTURE.md) §2.

## Fluxo desejado
1. Todo item e projeto tem uma área
2. O alternador filtra Hoje, Entrada, Projetos e Agenda simultaneamente
3. A preferência persiste entre sessões e dispositivos
4. Captura e busca ignoram o alternador

## Arquivos provavelmente afetados
- `src/modules/items/domain/item.schema.ts`
- `src/modules/projects/domain/project.schema.ts`
- Comandos e queries de itens e projetos
- Repositórios Supabase e mapeadores
- `src/components/app-shell.tsx` — alternador
- Novo: `context-switcher.tsx`
- `src/app/hoje/page.tsx`, `entrada/page.tsx`, `projetos/page.tsx`, `agenda/page.tsx`
- `src/app/revisao/page.tsx` — trocar o alerta de "sem projeto" para "sem área"

## Mudanças de dados

```sql
ALTER TABLE items ADD COLUMN area text;
ALTER TABLE projects ADD COLUMN area text;
```

Enum validado no Zod, não no Postgres — mais fácil de evoluir.
Valores: `trabalho`, `pessoal`, `saude`, `casa`, `carreira`, `lazer`.

Índice em `(workspace_id, area)`.

**Migração de dados existentes:** deixar nulo. `/revisao` lista itens sem área como pendência e Lucas classifica gradualmente. **Não inferir automaticamente** — produziria classificações erradas em silêncio.

## Mudanças de interface
- Alternador no topo da casca: `Tudo · Trabalho · Pessoal`
- Seletor de área na triagem, no detalhe de item e no formulário de projeto
- Área herdada do projeto por padrão
- `/revisao` alerta sobre itens sem área

## Regras de negócio
1. Área é exclusiva — exatamente uma por item
2. Área é opcional no momento da captura, obrigatória na triagem
3. Item com projeto herda a área do projeto por padrão, com possibilidade de sobrescrever
4. O alternador não afeta Captura Rápida nem Busca Global
5. "Pessoal" no alternador abrange `pessoal`, `saude`, `casa`, `lazer`
6. Áreas não-trabalho aparecem na linha do tempo mas não consomem capacidade de trabalho — a reduzem
7. Alterar a área de um projeto **não** reclassifica itens existentes em massa — propõe, não executa

## Integrações
Nenhuma.

## Estados de erro
| Situação | Comportamento |
|---|---|
| Área inválida | Rejeitada pelo Zod na escrita |
| Item sem área | Permitido; aparece em `/revisao` |
| Alternador com contexto vazio | Estado vazio informativo com sugestão de trocar de contexto |

## Acessibilidade
- Alternador como grupo de rádio com rótulo
- Mudança de contexto anunciada em `aria-live`
- Área nunca comunicada só por cor

## Testes necessários
- Domínio: schema aceita apenas os valores do enum
- Comando: item herda a área do projeto
- Comando: sobrescrever a herança funciona
- Query: filtro por contexto retorna o conjunto correto
- Componente: alternador filtra as quatro telas
- Componente: Captura e Busca ignoram o alternador
- Componente: preferência persiste após recarregar

## Critérios de aceitação
1. Alternar entre trabalho e pessoal leva um clique e afeta as quatro telas
2. A preferência persiste entre sessões e dispositivos
3. Capturar não exige escolher contexto
4. Buscar varre tudo, independentemente do contexto
5. `/revisao` alerta sobre itens sem área, não sobre itens sem projeto
6. Itens de vida pessoal não geram alerta permanente por não terem projeto

## Riscos de regressão
- Alterar os schemas de item e projeto afeta testes de domínio existentes — o campo é opcional, o que reduz o risco
- O filtro por contexto altera todas as queries de listagem — cuidado para não quebrar a paginação ou a contagem
- `/revisao` tem lógica testada `[CÓDIGO: getReviewOverview]` — atualizar em conjunto

---

# BRIEF P1-6 · Captura mobile de um toque

## Problema
Capturar por voz no celular exige seis interações. `[INFERÊNCIA a partir do DOSSIÊ]`

## Solução
Pressão longa no FAB grava diretamente. Toque simples abre captura de texto com um único campo. Especificação completa em [`MOBILE_EXPERIENCE_STRATEGY.md`](./MOBILE_EXPERIENCE_STRATEGY.md) §3.

## Fluxo desejado

**Voz:** manter o FAB pressionado → grava → soltar → para e envia → correção de transcrição (P0-2) → analisar ou salvar.
**Cancelar:** arrastar para cima antes de soltar.
**Texto:** tocar o FAB → um campo, teclado aberto → Capturar.

## Arquivos provavelmente afetados
- `src/components/sidebar-nav.tsx` — FAB com gesto
- `src/components/quick-capture-modal.tsx` — modo mobile simplificado
- `src/components/audio-recorder.tsx` — modo pressionar para falar
- Novo: `press-to-record-fab.tsx`

## Mudanças de dados
Nenhuma.

## Mudanças de interface
- FAB com dois comportamentos: toque e pressão longa
- Durante a gravação: indicador de amplitude, contador, área de cancelamento
- Retorno tátil ao iniciar, ao cancelar e ao soltar
- Captura de texto com um campo e "+ detalhes"
- Zona segura respeitada

## Regras de negócio
1. Pressão longa acima de 300ms inicia a gravação; abaixo disso é toque
2. Soltar para e envia automaticamente
3. Arrastar acima do limiar cancela sem enviar
4. Gravação abaixo de 1 segundo é descartada com aviso
5. Limite de 5 minutos mantido `[DOSSIÊ]`
6. Sem permissão de microfone, a pressão longa abre a captura de texto com explicação
7. O toque simples nunca deve iniciar gravação acidentalmente

## Integrações
OpenAI Whisper via `/api/audio/transcribe` (inalterada).

## Estados de erro
| Situação | Comportamento |
|---|---|
| Permissão negada | Mensagem existente `[DOSSIÊ]` + alternativa de texto |
| Navegador sem suporte | Mensagem existente `[DOSSIÊ]`; FAB só abre texto |
| Gravação interrompida por chamada | Áudio parcial preservado, oferecido para envio |
| Sem conexão ao soltar | Áudio mantido; enviar ao reconectar |

## Acessibilidade
- **Alternativa acessível obrigatória:** pressão longa não é acessível por teclado nem por leitor de tela. O botão de gravação dentro do modal continua existindo e sendo a via acessível
- FAB com `aria-label` descrevendo os dois comportamentos
- Estado de gravação anunciado
- Retorno tátil nunca como único sinal

## Testes necessários
- Componente: pressão acima de 300ms inicia gravação
- Componente: toque abre captura de texto
- Componente: arrastar cancela sem enviar
- Componente: gravação abaixo de 1s descartada
- Componente: sem permissão, recai para texto
- Regressão: o caminho de gravação por botão continua funcionando
- Manual: iOS Safari e Chrome Android, incluindo interrupção por chamada

## Critérios de aceitação
1. Manter o FAB pressionado inicia a gravação em menos de 300ms
2. Soltar envia automaticamente
3. Arrastar para cima cancela
4. Toque simples abre captura de texto com um campo e teclado aberto
5. O retorno tátil e visual torna o estado inequívoco
6. Existe caminho acessível equivalente sem gesto
7. O FAB não colide com o indicador de gestos do iPhone
8. Nenhuma captura é perdida por falta de sinal no momento do envio

## Riscos de regressão
- `AudioRecorder` tem testes `[DOSSIÊ]` — o novo modo não pode quebrar o modo por botão
- Gestos podem conflitar com o gesto de voltar do sistema — testar em ambas as plataformas
- Pressão longa em elemento fixo pode disparar o menu de contexto do navegador — suprimir explicitamente

---

## Ordem de implementação recomendada

| Ordem | Brief | Bloqueado por |
|---|---|---|
| 1 | P0-1 | — |
| 2 | P0-3 | — |
| 3 | P0-2 | — |
| 4 | P1-1 | P0-1 |
| 5 | P1-2 | P1-1 |
| 6 | P1-6 | P0-1, P0-2 |
| 7 | P1-5 | — (mas melhor após P1-2) |
| 8 | P1-3 | P1-1, P1-5, decisão sobre Calendar |
| 9 | P1-4 | P0-3, P1-3 |

## Verificações — resolvidas em 24/07/2026

As cinco hipóteses da primeira versão foram verificadas no código. Resultados:

| # | Hipótese | Resultado | Efeito |
|---|---|---|---|
| 1 | Granularidade do `ChangeNotifier` | **Global confirmado.** `notify()` chama todos os listeners; instância única compartilhada; cada `useReactiveQuery` assina 3 repositórios; `/hoje` tem 6 queries | **Corrigir antes de P1-1.** Sessões geram mutações frequentes |
| 2 | Schema de `notifications` | Existe com `type`, `title`, `body`, `entity_type`, `entity_id`, `read_at`. **Faltam `dedup_key` e `dismissed_until`** | Migration pequena e obrigatória em P1-4 |
| 3 | Proveniência de transcrição | Não há campo dedicado; o original é reconstruído do payload de `item.created` em `domain_events` | **P0-2 não precisa de mudança de dados** |
| 4 | Campo de duração | **`estimatedMinutes` já existe** em todas as camadas | P1-1(a) vira ajuste de fluxo, não criação |
| 5 | Tipos de `recurrence_rules` | Não verificado — **tornou-se irrelevante** | A correção de escopo eliminou os blocos de vida |

### Verificações que permanecem em aberto

1. **Cobertura de teste de `capacity.ts`** — confirmar quais testes existem antes de parametrizar `DAY_CAPACITY_MINUTES`
2. **Comportamento atual do Web Push em iOS Safari** — verificar antes de investir em P2-2
3. **Execuções reais de `automation_runs` em produção** — é o próprio objeto de P0-3

### Nota sobre o estado do repositório

`git status` mostra 89 arquivos modificados, mas `git diff --ignore-cr-at-eol` retorna vazio: são exclusivamente diferenças de fim de linha (CRLF), pré-existentes. Vale normalizar isso (`.gitattributes` com `* text=auto`) antes de começar qualquer implementação — caso contrário, todo diff futuro virá poluído e revisão de mudança fica impraticável.
