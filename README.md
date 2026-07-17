# Painel Pessoal Lucas

Central operacional pessoal do Lucas: capturar primeiro, organizar depois. Um cockpit para tarefas, ideias, insights, decisões, projetos, foco diário e revisão — desenhado para reduzir carga mental, não para virar mais uma ferramenta que exige organização prévia.

**Produção:** https://painelpessoallucas.vercel.app

## Estado atual (Fase 1 — fundação local)

O sistema funciona 100% no navegador, com persistência em `localStorage`.

**Aviso sobre persistência:**
- Os dados não sincronizam entre navegadores ou dispositivos.
- Limpar os dados do navegador apaga as informações.
- A Vercel hospeda apenas a interface; cada navegador tem seu próprio banco local. A migração para banco real (Supabase) é a Fase 2 (ver `docs/ROADMAP.md`).

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

Variáveis de ambiente: nenhuma é necessária na Fase 1. `.env*` não é commitado. Nunca exponha `OPENAI_API_KEY` ou `SUPABASE_SERVICE_ROLE_KEY` ao navegador.

## Validação (obrigatória antes de push)

```bash
npm run lint      # ESLint — deve terminar sem erros
npm run typecheck # tsc --noEmit — deve terminar sem erros
npm run test      # Vitest — todos os testes devem passar
npm run build     # Build de produção (valida tipos; nada é ignorado)
```

## Deploy

Deploy na Vercel (projeto `painelpessoallucas`) a cada push na branch `main`. O arquivo `vercel.json` fixa `"framework": "nextjs"` — não remova: o Framework Preset do projeto na Vercel ficou como "Other" no primeiro deploy e, sem esse override, a plataforma publica apenas a pasta `public/`, retornando 404 em todas as rotas (histórico completo em `docs/AUDIT.md`).
