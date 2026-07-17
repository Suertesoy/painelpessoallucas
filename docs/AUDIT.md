# Auditoria — Painel Pessoal Lucas

Data: 2026-07-16 · Base auditada: commit `0cf8458` (main)

## 1. Estado encontrado

- Next.js 16.2.10 (App Router, Turbopack), React 19.2.4, TypeScript 5 estrito, Tailwind 4, Zod 4, Vitest 4.
- Monólito modular real: `src/modules/{items,projects,planning,global}` com camadas `domain / application / infrastructure`; `src/platform` com storage, eventos e contratos futuros (IA, integrações, MCP).
- Commands validam com Zod, persistem via repositórios e emitem eventos de domínio. Queries separadas. UI consome via React Context (`RepositoryProvider`).
- Persistência em `localStorage` com adaptador observável (subscribe/notify) e fallback seguro em SSR.
- 10 testes unitários passando, cobrindo regras reais (limite de 3 focos, persistência, reatividade, eventos, resiliência SSR).
- Páginas Hoje, Entrada, Projetos, Projeto (detalhe), Ideias, Agenda e Revisão implementadas de verdade (não eram stubs).

## 2. Problemas encontrados

### Deploy (crítico) — CAUSA DO 404
O projeto Vercel `painelpessoallucas` estava com **Framework Preset = "Other" (`framework: null`)**, herdado do primeiro deploy feito quando o repositório continha apenas um README (`bdf48b8`). Com esse preset, a Vercel executa `npm run build`, ignora a saída do Next.js e publica **somente a pasta `public/` como site estático**.

Evidência: `painelpessoallucas.vercel.app/vercel.svg` → **200**; `/` e `/api/health` → **404 NOT_FOUND** da plataforma, mesmo com os deployments `READY` e o alias apontando corretamente.

Observação adicional: o commit `0cf8458` **tinha** deployment de produção (criado via CLI pelo Antigravity), mas o push correspondente **não** disparou deploy automático via integração GitHub — o único deploy git-triggered foi o do commit `e52311f`.

**Correção aplicada:** `vercel.json` com `"framework": "nextjs"` (override por deployment, sem criar novo projeto e sem tocar em domínios).

### Funcionais (críticos)
1. **`/projetos/[projectId]` quebrado**: no Next.js 15+/16, `params` é `Promise`. A página lia `params.projectId` sincronamente → `undefined` → todo projeto renderizava "Projeto Inexistente" em produção. Corrigido com `React.use(params)`.
2. **`next.config.ts` mascarava erros**: `typescript.ignoreBuildErrors: true` + chave `eslint` inválida no Next 16 (gerava warning no build). Removidos; typecheck e lint agora fazem parte do build de verdade.
3. **Fuso horário**: "hoje" era calculado com `toISOString()` (UTC) — após ~21h no Brasil o painel virava o dia errado. Inputs `type="date"` eram interpretados como meia-noite UTC, deslocando agendamentos/prazos em -1 dia. Corrigido com `src/lib/dates.ts` (dia local + round-trip estável), com testes.
4. **Hidratação**: o cabeçalho de "Hoje" pré-renderizava a data do build → mismatch na hidratação. Corrigido com `useMounted()` via `useSyncExternalStore`.

### Qualidade de código
- 18 erros de lint: `any` espalhado pelas páginas, escrita em ref durante render (`useReactiveQuery`), `setState` síncrono em effect (`[projectId]`), imports não usados. **Zerados.**
- Casts desnecessários (`as { subscribe... }`) no hook reativo — as interfaces de repositório já declaram `subscribe`. Removidos.
- `workspaceId: 'ws-1'` hardcoded na UI → centralizado em `src/lib/constants.ts`.
- `package.json` com nome de template (`next-temp`) → `painel-pessoal-lucas`.
- `.gitignore` com entradas duplicadas → limpo.

### UX (críticos para uso diário)
1. **Mobile inutilizável**: sidebar fixa de 256px sem colapso; sem menu; captura rápida acessível apenas por `Ctrl+Shift+Espaço`. Corrigido: barra superior mobile + drawer, botão flutuante de captura, botão "Capturar" na sidebar desktop.
2. **Botão de busca da sidebar sem função** (sem `onClick`). Corrigido via eventos de UI (`src/lib/ui-events.ts`) que abrem os modais de busca/captura de qualquer lugar.
3. **Ações somente no hover** (`opacity-0 group-hover`): invisíveis em touch e teclado. Agora sempre visíveis.
4. `alert()` para erro de limite de foco → mensagem inline com `role="alert"`.
5. Sem estado ativo na navegação → link atual destacado (`aria-current="page"`).
6. Linha do tempo de "Hoje" com layout alternado quebrado em coluna estreita → lista simples e legível.
7. Acessibilidade: labels associados (`htmlFor`/`id`), `aria-label` em botões de ícone, `role="dialog"`/`aria-modal` nos modais.

### Documentação
- `docs/architecture.md` e `docs/roadmap.md` afirmavam uso de `useSyncExternalStore` nos adaptadores — não era verdade (o hook real é effect + subscribe). Documentação reescrita a partir do código real.
- `README.md` descrevia pastas inexistentes (`src/types/`, `modules/review`). Corrigido.
- `README_NEXT.md` (resíduo do template create-next-app) removido.

## 3. Riscos remanescentes

- **Persistência local**: dados vivem no navegador; limpeza de dados do navegador apaga tudo. Mitigação real apenas na Fase 2 (Supabase). Exportação manual (JSON) é candidata a curto prazo.
- **Eventos crescem sem limite** no `localStorage` (`painelpessoal_events` é append-only). Aceitável na Fase 1; na migração, tratar como outbox com expurgo.
- **Integração GitHub→Vercel**: o push deste trabalho serve de teste; se não disparar deploy automático, reconectar o repositório no dashboard da Vercel (Settings → Git).
- `confirm()` nativo ainda é usado para arquivamento (funcional e acessível, porém rústico). Troca por diálogo próprio com "desfazer" fica para a próxima fase.
- Edição por `defaultValue`+`onBlur` não é colaborativa nem reflete mudanças externas ao campo em foco — suficiente para single-user local.

## 4. O que foi corrigido nesta auditoria

Ver seções acima. Resumo: deploy (vercel.json + next.config limpo), rota de detalhe de projeto, fuso horário, hidratação, lint/typecheck zerados, navegação mobile, captura/busca acionáveis por botão, ações visíveis, acessibilidade básica, documentação verdadeira, testes novos de data (14 testes no total).

## 5. Pendências conscientes (não corrigidas agora)

- Página de detalhe do item (hoje a edição acontece inline na Entrada/Ideias).
- Áreas "Aguardando" e bloqueios com motivo (roadmap: Fase 1.5).
- Estimativa de duração e capacidade do dia (roadmap).
- Supabase, IA, automações e MCP: apenas contratos/documentação, por decisão explícita de escopo.
