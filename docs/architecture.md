# Arquitetura do Painel Pessoal Lucas

O Painel Pessoal Lucas adota a arquitetura de **Monólito Modular**, o que significa que o sistema possui uma base de código unificada (para simplicidade de deploy e tipagem) mas separa claramente responsabilidades através de módulos independentes com fronteiras rigorosas.

## Camadas Arquiteturais

1. **Interface (UI)**: Componentes React e páginas Next.js. Nenhuma regra de negócio deve residir nesta camada. O acesso a dados ocorre indiretamente.
2. **Aplicação (Application)**: Contém **Commands** (operações de escrita) e **Queries** (operações de leitura). Toda ação do sistema passa por esta camada, garantindo validação, persistência e emissão de eventos.
3. **Domínio (Domain)**: Modelos de dados (Zod schemas), tipos essenciais e lógica pura. Não possui dependência de ferramentas externas ou persistência.
4. **Infraestrutura (Infrastructure)**: Implementa as interfaces definidas na aplicação (ex: `LocalStorageItemRepository`). A única camada que interage com tecnologias específicas de persistência (localStorage hoje, Supabase no futuro).

## Commands, Queries, Repositories e Adapters

- **Commands e Queries**: Casos de uso do sistema. Um Command altera estado (ex: `createItem`), uma Query lê estado (ex: `listItems`).
- **Repositories**: Interfaces que definem *como* a aplicação acessa dados (ex: `ItemRepository`).
- **Adapters**: Implementações concretas dos Repositories (ex: `LocalStorageItemRepository`). A UI consome esses repositórios tipicamente via React Context ou stores observáveis (`useSyncExternalStore`) para refletir as mudanças em tempo real.

## Eventos e Outbox

Eventos de domínio (`item.created`, `project.updated`) são emitidos pela camada de Aplicação logo após um Command ser bem-sucedido. Na fase atual, são armazenados temporariamente na persistência local. Futuramente, utilizarão o padrão **Outbox**: salvos de forma transacional junto com a entidade no Supabase para garantir consistência antes do processamento assíncrono.

## Preparações Futuras

- **Supabase**: Novos adaptadores (`SupabaseItemRepository`) substituirão os de `localStorage` sem alterar Commands/Queries ou componentes de UI.
- **OpenAI / IA**: Interfaces tipadas (ex: `AIProvider`) e contratos de triagem estão definidos para integrar análise sem reescrever a base.
- **Workflows**: Preparado para integração com Vercel Workflows ou filas (via processamento assíncrono dos eventos registrados na Outbox).
