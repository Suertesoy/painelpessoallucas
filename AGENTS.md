<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Regras do projeto — Painel Pessoal Lucas

## Escopo
- Este repositório é o **Painel Pessoal Lucas**. Não acessar nem modificar projetos vizinhos na pasta PROJETOS.
- Projeto Vercel: `painelpessoallucas` (não criar outro projeto, não remover domínios, não usar force push).

## Armadilhas conhecidas do Next.js 16 (já causaram bugs reais aqui)
- `params` de páginas é **Promise**: em client components use `React.use(params)`; nunca acesse `params.x` sincronamente.
- Não existe chave `eslint` em `next.config.ts`.
- Não reative `typescript.ignoreBuildErrors` — corrija os erros.

## Regras de data/fuso
- "Hoje", agendamentos e prazos são o **dia local** do usuário. Use `src/lib/dates.ts` (`todayDateStr`, `dateInputToISO`, `isoToDateInput`).
- Proibido `new Date().toISOString().split('T')[0]` e `new Date('YYYY-MM-DD')`.

## Arquitetura (ver docs/ARCHITECTURE.md)
- UI nunca acessa `localStorage` diretamente: sempre Commands/Queries via `useCommands()`/`useQueries()`.
- Commands validam com Zod e emitem eventos de domínio; não pular essas etapas.
- `workspaceId` vem de `src/lib/constants.ts` (`WORKSPACE_ID`), não hardcoded.
- Contratos em `platform/{ai,integrations,mcp}` são para fases futuras — não implementar antes da fase correspondente (docs/ROADMAP.md).

## Validação obrigatória antes de commit/push
`npm run lint && npm run typecheck && npm run test && npm run build` — tudo verde, sem exceções mascaradas.

## Segurança
- Nunca commitar `.env*` nem credenciais; nunca criar `NEXT_PUBLIC_OPENAI_API_KEY`; chaves só no servidor.
- Não registrar tokens em logs ou arquivos.
