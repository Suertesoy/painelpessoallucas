# Plano de Evolução Técnica — Painel Pessoal Lucas

Complemento de [`MASTER_STRATEGIC_AUDIT.md`](./MASTER_STRATEGIC_AUDIT.md) §10.

---

## 0. Premissa

O produto está em produção, funciona, passa em lint, typecheck, 216 testes e build `[EXECUÇÃO]`. A arquitetura está correta para o que vem a seguir.

**Não há nenhuma evidência no dossiê que justifique reescrita arquitetural.** Este plano é sobre extensão, correção pontual e observabilidade — não sobre reconstrução.

---

## 1. O que não deve ser reescrito

Explicitado primeiro, para eliminar ambiguidade:

| Componente | Por que manter |
|---|---|
| **Commands / Queries / Repositories** | Separação limpa, injetável, testada. É a fundação sobre a qual `work_sessions` será construída sem atrito `[CÓDIGO: Diagrama 3]` |
| **Schemas Zod de domínio** | Fonte única de verdade para Item, Project, DailyPlan, Plan. Validação na escrita é o que impede dados corrompidos `[CÓDIGO]` |
| **Motor de recorrências** | Determinístico, testado, idempotente via constraint única, correto no fuso `America/Sao_Paulo` `[CÓDIGO]` |
| **RLS por workspace** | `is_workspace_member` como `SECURITY DEFINER` para evitar recursão é a solução certa `[CÓDIGO]` |
| **Criptografia de tokens** | AES-256-GCM na aplicação + `integration_tokens` sem policy para `authenticated` `[DOSSIÊ]` |
| **Proxy de autenticação** | `src/proxy.ts` validando sessão no servidor e renovando cookies `[CÓDIGO]` |
| **Eventos de domínio** | `domain_events` como trilha auditável é exatamente o que um sistema pessoal de confiança precisa `[CÓDIGO]` |
| **Structured outputs de IA** | Zod + `safeParse` elimina uma classe inteira de erro `[CÓDIGO]` |

---

## 2. Correções essenciais

### 2.1 Homologar a sincronização mobile já corrigida — P0-1

`[DOSSIÊ]` Ver `PRIORITIZED_RECOMMENDATIONS.md` P0-1 para o roteiro completo.

> **Correção de 25/07/2026.** O projeto já passou por correções de sincronização, sessão, workspace e parsing dos timestamps do Supabase, e a verificação no código já refutou a hipótese de ausência de sincronização entre dispositivos: o `ChangeNotifier` **já** revalida ao ganhar foco de janela e ao voltar de segundo plano — a solução "barata" abaixo já está implementada. A etapa imediata é homologar os fluxos principais (desktop e mobile, captura texto/áudio, criação e edição nos dois sentidos), não redescobrir a causa de um bug do zero.

**Roteiro de homologação**, usando os diagnósticos que já existem só como instrumento de verificação:

1. Homologar os fluxos principais no computador e no celular
2. Confirmar revalidação ao retornar à aba (a correção do `ChangeNotifier` já implementada)
3. Confirmar criação e edição nos dois dispositivos, nos dois sentidos
4. Confirmar captura por texto e por áudio no celular
5. Se, e só se, algum caso não sincronizar: abrir `/configuracoes` no dispositivo mobile e comparar sessão do servidor vs. navegador via `SyncDiagnosticsCard` (testa cookie/sessão em Safari iOS) e, na sequência, verificar se o workspace foi resolvido a tempo
6. **Só então** remover os diagnósticos temporários

**Não recomendado por padrão nesta etapa:** alterar atributos de cookie, alterar RLS, alterar autenticação, ou implementar Supabase Realtime. Essas só entram como hipótese condicional se o passo 5 encontrar um caso real e reproduzível — e, mesmo assim, a saída barata (revalidação por foco, já implementada) é preferível a Realtime, que resolve colaboração simultânea, um cenário que não se aplica a um usuário único.

### 2.2 Homologação e observabilidade das automações — P0-3

`[DOSSIÊ]` O cron nunca foi homologado em produção.

**Passo 1 — verificar.** Logs da Vercel + consulta direta a `automation_runs`: contagem por status nos últimos 7 dias, última execução bem-sucedida por tipo de automação.

**Passo 2 — card de saúde permanente** em `/configuracoes`:

```
Automações
  Última execução     hoje, 14:00        ✓
  Últimas 24h         24 execuções, 0 falhas
  Recorrências        3 itens materializados hoje
  Sync Calendar       última: 14:00
  Resumo diário       enviado hoje, 07:00
```

Isso substitui os cards de diagnóstico temporários por algo permanente e legítimo — em vez de expor `snake_case` de debug, expõe o estado de uma parte do sistema que o usuário precisa confiar.

**Passo 3 — alerta de falha.** O evento `digest.automation_failure_sent` já existe na lista de eventos de domínio `[DOSSIÊ]`. Garantir que uma falha o dispare de fato.

### 2.3 Transcrição sem auditoria — P2-9

`[DOSSIÊ]` `/api/audio/transcribe` não grava em `ai_runs`. Com P1-6 multiplicando o volume de áudio, a maior fonte de custo do sistema fica invisível.

Registrar operação, modelo, duração do áudio, latência, custo estimado, status.

---

## 3. Dívida que impacta UX

Prioridade acima da dívida "limpa" porque afeta o que Lucas sente ao usar.

### 3.1 Padrão de card não extraído

`[DOSSIÊ]` `bg-white rounded-xl shadow-sm border p-4 md:p-6` *"repetido manualmente em dezenas de arquivos"*.

**Impacto real:** qualquer mudança de design system vira um trabalho de dezenas de arquivos. Isso torna P2-1 caro e, por consequência, adiável indefinidamente. É dívida que **bloqueia melhoria futura**, que é a pior categoria.

**Correção:** extrair `Surface` com variantes de contenção. Ver `APPLE_LIKE_EXPERIENCE_PRINCIPLES.md` §10.

### 3.2 Três modais reimplementando o mesmo comportamento

`[DOSSIÊ]` Overlay, `role="dialog"`, gestão de foco e Escape em triplicata. Três sombras diferentes sem critério.

**Impacto real:** corrigir um bug de foco exige três lugares, e o comportamento pode divergir sem ninguém notar. Consistência de comportamento importa mais que de aparência.

**Correção:** componente `Modal` compartilhado com variantes desktop (diálogo) e mobile (folha).

### 3.3 Erro renderizado de duas formas

`[DOSSIÊ]` `DataErrorNotice` convive com blocos `role="alert"` ad-hoc em pelo menos 6 telas.

**Correção:** unificar, e aproveitar para inserir a camada de tradução de erro técnico (`APPLE_LIKE_EXPERIENCE_PRINCIPLES.md` §9).

### 3.4 Áreas de toque abaixo de 44px

`[DOSSIÊ]` Disseminado em botões só-ícone.

**Correção:** mecânica, de baixo risco, alto retorno no mobile. `ItemCompleteButton` já é o modelo.

### 3.5 Larguras de container sem critério

`[DOSSIÊ]` `max-w-4xl`, `max-w-5xl`, `max-w-6xl` concorrendo. Reduzir a dois, com critério documentado.

---

## 4. Dívida que pode esperar

Nenhum destes afeta o uso. Fazer quando conveniente, nunca antes de P0/P1.

| Item | Evidência | Ação |
|---|---|---|
| Diretórios de scaffolding vazios | `[DOSSIÊ]` — `src/types/`, `src/platform/outbox/`, `src/platform/workflows/`, `src/modules/review/*` | Remover. `src/modules/review/*` está vazio enquanto a lógica vive em `item.queries.ts` — isso é confuso para agentes de IA lendo o repositório, o que é um custo real neste contexto |
| `LEGACY_LOCAL_WORKSPACE_ID` | `[DOSSIÊ]` — exportado, nunca importado | Remover |
| Contratos não conectados | `[DOSSIÊ]` — `AIProvider`, `MCPRegistry`, `IntegrationAdapter` | Remover `MCPRegistry` e `IntegrationAdapter`. Sobre `AIProvider`, ver §4.1 |
| Duplicação entre estruturadores OpenAI | `[DOSSIÊ]` | Extrair quando a quarta operação for adicionada, não antes |
| Bypass do `EventRepository` | `[DOSSIÊ]` — 3 fluxos gravam direto em `domain_events` | Unificar. Baixo risco, baixa urgência |
| Entidades sem schema Zod | `[DOSSIÊ]` — 7 tabelas de infraestrutura | Adicionar conforme cada uma ganhar UI |
| `OPENAI_MODEL` fora do `.env.example` | `[DOSSIÊ]` | Documentar |
| `AGENTS.md` desatualizado | `[DOSSIÊ]` — cita constante que não existe mais | Atualizar. Custo real: agentes de IA leem esse arquivo e agem sobre informação errada |

### 4.1 Sobre `AIProvider`

`[DOSSIÊ]` Interface com `triage`, `summarizeProject`, `semanticSearch` — nenhuma das três operações reais a usa.

**Decisão:** manter o arquivo, mas **não** forçar as operações existentes a implementá-lo. A abstração foi desenhada antes de existirem três operações reais, e as três divergiram do contrato — o que é sinal de que o contrato estava errado, não as implementações.

Se, ao adicionar a camada 3 de recomendação (P2-3), surgir um padrão comum genuíno entre operações, extrair a abstração **a partir do código real**. Abstração derivada de implementação funciona; abstração antecipada raramente.

`summarizeProject` e `semanticSearch` nunca implementados são evidência disso.

### 4.2 Campos fora do ciclo de validação

`[DOSSIÊ]` `items.calendar_sync` e `execution_plans.calendar_sync_scope` existem no banco mas não nos schemas Zod.

Risco: podem receber valores inválidos sem barreira. **Corrigir antes de P2-12**, que é quando esses campos ganharão UI e passarão a ser gravados com frequência.

---

## 5. Mudanças de dados propostas

Todas aditivas. Nenhuma quebra dados existentes.

### 5.1 P1-1 — Tempo

**Alteração em `items`:**
```
estimated_minutes    integer, nulo
```

**Nova tabela `work_sessions`:**
```
id                      uuid, pk
workspace_id            uuid, fk, RLS
item_id                 uuid, fk, nulo
project_id              uuid, fk, nulo
area                    text
work_type               text
started_at              timestamptz
ended_at                timestamptz, nulo
source                  text (timer | manual)
resume_note             text, nulo
interrupted_by_item_id  uuid, fk, nulo
needs_confirmation      boolean, default false
created_at / updated_at
```

**Índices necessários:**
- `(workspace_id, started_at desc)` — consulta de sessões recentes
- `(workspace_id) where ended_at is null` — parcial, para localizar a sessão ativa em O(1). Esta é a consulta mais frequente do sistema depois da carga de Hoje

**Restrição:** no máximo uma sessão sem `ended_at` por workspace. Implementável com índice único parcial — o banco garante o invariante, não a aplicação.

**RLS:** mesma política das demais tabelas, via `is_workspace_member(workspace_id)`.

**Eventos:** `work_session.started`, `.paused`, `.resumed`, `.ended`, `.corrected` — através do `EventRepository`, não por gravação direta (não repetir o bypass documentado).

### 5.2 P1-5 — Áreas

**Alteração em `items` e `projects`:**
```
area    text, nulo inicialmente
```

Enum validado no Zod, não como tipo do Postgres — mais fácil de evoluir. `[INFERÊNCIA]` O produto já usa esse padrão para status e prioridade.

**Migração de dados existentes:** deixar nulo. `/revisao` passa a listar itens sem área como pendência de triagem, e Lucas classifica gradualmente. Tentar inferir automaticamente produziria classificações erradas em silêncio.

### 5.3 P1-3 — Blocos de vida

**Sem tabela nova.** Reutilizar `recurrence_rules`, que já existe e é determinístico `[CÓDIGO]`, com um novo tipo de regra que gera bloco de tempo em vez de item.

**Nova tabela `workspace_schedule`** (ou colunas em `workspace_settings`, que já existe):
```
workday_start           time
workday_end             time
buffer_percentage       integer
```

Preferir estender `workspace_settings` a criar tabela nova — é uma linha por workspace.

### 5.4 P1-4 — Notificações

`[DOSSIÊ]` A tabela `notifications` **já existe** com schema Zod em `plan.schema.ts`.

`[HIPÓTESE — exige leitura do schema]` Verificar se ela contém: tipo, payload, estado (não lida / lida / dispensada), `dedup_key`, `dismissed_until`. Se faltar `dedup_key`, é uma migration pequena — e é o campo mais importante de todos, porque é o que impede o sistema de virar ruído.

---

## 6. Performance

### 6.1 Granularidade do `ChangeNotifier`

`[INFERÊNCIA a partir do Diagrama 2]` O notificador dispara e `useReactiveQuery` *"re-executa fetch automaticamente"*.

**Risco:** se a notificação for global, cada mutação re-executa todas as queries ativas. Em Hoje, com múltiplas seções, isso é um re-fetch amplo por clique. Com sessões de trabalho gerando mutações a cada início/pausa/fim, piora.

**Verificar antes de P1-1.** Se a invalidação for global, torná-la por chave de entidade.

`[HIPÓTESE — exige leitura do código do hook]`

### 6.2 O cronômetro não deve tocar o banco

A sessão ativa é gravada uma vez ao iniciar e uma vez ao encerrar. **O tempo decorrido é calculado no cliente** a partir de `started_at`.

Erro a evitar: atualizar a duração no banco a cada segundo ou minuto. Isso geraria milhares de escritas por dia sem nenhum benefício — `started_at` mais o relógio local dá a mesma resposta.

### 6.3 Consultas de agregação

"Onde gastei meu tempo" agrega `work_sessions` por área, projeto e tipo. Para um usuário único, o volume é trivial (~1.500 sessões/ano). Índice em `(workspace_id, started_at)` resolve. **Não pré-agregar.** Otimização prematura para um volume que não existe.

---

## 7. Confiabilidade e observabilidade

### 7.1 Teste de fumaça em produção

`[DOSSIÊ]` 216 testes passando, todos com mocks ou `LocalStorageAdapter`. Nenhum contra Supabase, Google ou OpenAI reais.

**Recomendação deliberada: não construir uma suíte E2E completa de UI.**

Justificativa: para um produto de usuário único que Lucas usa todo dia, ele *é* o teste E2E. Uma suíte de Playwright cobrindo fluxos de interface seria cara de escrever, frágil, e detectaria mais tarde do que Lucas detectaria sozinho.

O que falta não é cobertura de teste — é **verificação de que a infraestrutura real funciona**. Um teste de fumaça cobrindo quatro caminhos vale mais que cem testes E2E de UI:

| Caminho | Verifica |
|---|---|
| Login → workspace resolvido | Auth, RPC `ensure_personal_workspace`, RLS |
| Criar item → ler de volta | Escrita real, mapeamento, RLS |
| Disparar cron manualmente | Idempotência, execução de automações |
| Buscar `freebusy` do Calendar | Token, descriptografia, renovação, API externa |

Rodando uma vez por dia contra produção, com alerta em caso de falha. Isso é a diferença entre saber e supor.

### 7.2 O que registrar em log

- Toda execução de automação — já registrado em `automation_runs` `[CÓDIGO]`
- Toda chamada de IA — `ai_runs`, incluindo transcrição (hoje ausente)
- Toda falha de integração externa, com contexto
- **Nunca:** conteúdo de itens, transcrições, tokens ou dados pessoais `[DOSSIÊ — princípio já estabelecido, manter]`

### 7.3 Estados parciais

Princípio já declarado pelo produto: *"falhas em integrações externas nunca impedem o usuário de salvar suas capturas locais"* `[DOSSIÊ §1.4]`.

Estender explicitamente à leitura:

| Falha | Comportamento correto |
|---|---|
| Calendar indisponível | Linha do tempo mostra trabalho planejado + nota discreta |
| OpenAI indisponível | Transcrição falha, mas a captura já foi salva. Botão "tentar novamente sem regravar" — já existe `[DOSSIÊ]` |
| Cron não executou | Card de saúde mostra; recorrências materializam no próximo tick por idempotência |
| Supabase indisponível | Última versão em cache com marca de horário |

---

## 8. Custos

| Item | Situação | Ação |
|---|---|---|
| Vercel | Cron horário, dentro do plano | Nenhuma |
| Supabase | Volume trivial para usuário único | Nenhuma |
| OpenAI — transcrição | **Maior fonte de custo**, crescerá com P1-6, hoje não auditada | Auditar (P2-9), teto configurável |
| OpenAI — triagem | Contexto pequeno | Nenhuma |
| OpenAI — recomendação diária | 1×/dia cacheada | Nenhuma |
| Web Push | Gratuito | Nenhuma |

Não há risco de custo estrutural. O risco é de **custo invisível** — a transcrição não auditada.

---

## 9. Sequência técnica

**Fase imediata**
1. Diagnóstico e correção do sync mobile (P0-1)
2. Verificação do cron em produção (P0-3)
3. Correção de transcrição antes da triagem (P0-2)
4. Card de saúde das automações (P0-3)
5. Remover diagnósticos temporários

**Duas semanas**
6. Verificar granularidade do `ChangeNotifier`
7. Migration: `estimated_minutes` + `work_sessions`
8. Commands, Queries e eventos de sessão
9. Zona Agora em Hoje (P1-2)
10. Teste de fumaça em produção
11. Captura mobile de um gesto (P1-6)

**Um mês**
12. Migration: `area` (P1-5)
13. Capacidade habitual configurável — substituir `DAY_CAPACITY_MINUTES` (P1-3)
14. Motor de regras (P1-4)
15. Auditoria de transcrição e módulo de custo (P2-9)
16. Áreas de toque e anel de foco

**Três meses**
17. Componentes base e design system (P2-1)
18. PWA (P2-2)
19. Camada 3 de IA (P2-3)
20. Unificação de rotas (P2-4)
21. Limpeza de dívida sem impacto de uso

---

## 10. Riscos técnicos

| Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|
| Sync mobile é falta de funcionalidade, não bug | Média | Alto — escopo cresce | Revalidação ao focar como solução barata antes de considerar Realtime |
| `ChangeNotifier` global degrada com sessões | Média | Médio | Verificar antes de P1-1, não depois |
| Time tracking é abandonado por atrito | **Alta** | **Alto** — dados parciais envenenam recomendações | Registro retroativo de primeira classe; medir adoção na semana 2 |
| Enum de área mal escolhido | Média | Médio | Poucas e genéricas; nulo permitido |
| Notificações viram ruído | Alta | Médio | Deduplicação e auto-desativação desde o dia 1, não depois |
| Sessões esquecidas corrompem estatística | Alta | Alto | Confirmação obrigatória para sessões > 4h |
| Escopo cresce e nada é concluído | Média | Alto | P0 e P1 contidos em 9 itens; resistir a adicionar |

O terceiro risco é o mais provável e o mais consequente de toda a auditoria. Ele é de produto, não de engenharia — e a única mitigação real é reduzir atrito obsessivamente e medir adoção cedo, não confiar em disciplina.
