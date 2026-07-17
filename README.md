# Painel Pessoal Lucas

Central operacional pessoal do Lucas: capturar primeiro, organizar depois. Um cockpit para tarefas, ideias, insights, decisões, projetos, foco diário e revisão — desenhado para reduzir carga mental, não para virar mais uma ferramenta que exige organização prévia.

**Produção:** https://painelpessoallucas.vercel.app

## Estado atual (Fase 2 — persistência remota, IA e automações)

Aplicação sincronizada: os dados vivem no Supabase (Postgres + RLS), com login
Google via Supabase Auth (SSR por cookies). Desktop, celular e navegadores
diferentes compartilham o mesmo workspace. Dados da Fase 1 (localStorage) são
migrados por um assistente idempotente em `/migracao`, com backup JSON.

Novidades da fase:
- **Planos** (`/planos`): importar documento (.md/.txt ou texto colado),
  estruturar com OpenAI (Responses API + saída estruturada validada por Zod),
  revisar fatos × hipóteses × sugestões × perguntas, aprovar e ativar.
- **Recorrências determinísticas** materializadas como tarefas idempotentes
  (chave única regra + ocorrência).
- **Google Calendar** (scopes mínimos): calendário secundário "Painel Lucas",
  disponibilidade via freebusy, sincronização opcional por item/plano.
- **Gmail** (somente envio): resumos diário/semanal e alertas, opt-in.
- **Cron horário** (`/api/cron/automation-tick`, protegido por CRON_SECRET)
  com execuções idempotentes registradas em `automation_runs`.
- **Hoje**: capacidade do dia (sem contar sobreposições duas vezes),
  compromissos do Calendar, fonte de cada item, aguardando e próxima revisão.

### Funcionalidades
- **Captura rápida** de qualquer lugar: `Ctrl/Cmd+Shift+Espaço`, botão "Capturar" na sidebar ou botão flutuante no celular.
- **Busca global**: `Ctrl/Cmd+K` ou ícone de busca.
- **Hoje**: foco diário (máx. 3 itens), próximas ações, agendados, alertas e pulso dos projetos.
- **Caixa de Entrada**: processamento de capturas (tipo, projeto, próxima ação, agendamento).
- **Projetos**: lista com filtros por status e página de detalhe (tarefas, decisões, ideias, referências).
- **Ideias e Insights**: base de conhecimento e banco de decisões, com edição inline.
- **Agenda**: semana navegável separando *agendamentos* de *prazos* (fuso horário local correto).
- **Revisão**: prazos estourados, bloqueados, inbox estagnada, itens sem projeto e projetos sem marco.
- Interface responsiva (mobile com menu e captura por botão flutuante) e reativa (sem refresh).

## Stack

Next.js 16 (App Router) · TypeScript estrito · Tailwind CSS 4 · Zod · Vitest · ESLint

## Estrutura

```
docs/           # AUDIT, PRODUCT_DIRECTION, ARCHITECTURE, ROADMAP, events, integrations, mcp
src/
  app/          # Rotas (hoje, entrada, projetos, ideias, agenda, revisao, api/health)
  components/   # Modais de captura/busca e navegação
  lib/          # Hooks reativos, utilitários de data (fuso local), constantes, eventos de UI
  modules/      # items, projects, planning, global — camadas domain/application/infrastructure
  platform/     # storage, events e contratos futuros (ai, integrations, mcp)
  providers/    # Injeção de dependência (RepositoryProvider)
  test/         # Testes unitários (Vitest)
```

Detalhes em `docs/ARCHITECTURE.md`.

## Executar localmente

```bash
npm install
npm run dev
```

Abra http://localhost:3000 (redireciona para `/hoje`).

Variáveis de ambiente: ver `.env.example` (nomes vazios). `.env*` reais não são
commitados. Nunca exponha `OPENAI_API_KEY`, `SUPABASE_SECRET_KEY`,
`GOOGLE_CLIENT_SECRET`, `GOOGLE_TOKEN_ENCRYPTION_KEY` ou `CRON_SECRET` ao
navegador. Migrations SQL versionadas em `supabase/migrations/`.

## Validação (obrigatória antes de push)

```bash
npm run lint      # ESLint — deve terminar sem erros
npm run typecheck # tsc --noEmit — deve terminar sem erros
npm run test      # Vitest — todos os testes devem passar
npm run build     # Build de produção (valida tipos; nada é ignorado)
```

## Deploy

Deploy na Vercel (projeto `painelpessoallucas`) a cada push na branch `main`. O arquivo `vercel.json` fixa `"framework": "nextjs"` — não remova: o Framework Preset do projeto na Vercel ficou como "Other" no primeiro deploy e, sem esse override, a plataforma publica apenas a pasta `public/`, retornando 404 em todas as rotas (histórico completo em `docs/AUDIT.md`).
