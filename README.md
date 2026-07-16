# 📊 Painel Pessoal Lucas

O **Painel Pessoal Lucas** é uma central operacional pessoal construída para organizar tarefas, ideias, insights, decisões, projetos, agenda, prioridades e futuras automações. Esta aplicação foi desenhada com uma arquitetura de Monólito Modular, preparada para evoluir futuramente com Supabase, inteligência artificial (OpenAI), Webhooks, ferramentas MCP e outras integrações externas sem a necessidade de reescrever a camada de aplicação principal.

## Estado Atual da Implementação (Fase 1)
O sistema atualmente opera com uma **fundação local funcional**, permitindo criar e organizar itens, vinculá-los a projetos e manter o foco diário.
**Aviso importante sobre persistência:** Nesta etapa, o armazenamento de dados é feito através da API `localStorage` do navegador. 
* Os dados **não serão sincronizados** entre diferentes navegadores ou dispositivos.
* A limpeza de dados do navegador (limpar cache/cookies) apagará suas informações.
* O deploy na Vercel não transforma o `localStorage` num banco remoto; a Vercel hospedará a interface e cada usuário que acessar terá seu próprio banco em branco.
A migração para um banco de dados real (Supabase) ocorrerá na Fase 2.

### Funcionalidades Implementadas
- Navegação entre Hoje, Caixa de Entrada, Projetos, Ideias, Agenda e Revisão.
- Captura rápida acessível por toda a aplicação.
- Criação e edição de Itens (task, idea, insight, decision, etc.) e Projetos.
- Gerenciamento de Foco Diário (limite de 3 itens).
- Adaptação reativa para alterações de estado sem atualizar a página.

### Funcionalidades Futuras (Ainda não implementadas)
- Integração com Supabase (Persistência real na nuvem).
- Autenticação de Usuários.
- Inteligência Artificial via OpenAI (triagem e sumários).
- Integrações com Google Calendar, Gmail, GitHub e Google Drive.
- Servidor MCP para interação com Agentes.
- Eventos assíncronos processados via Vercel Workflows ou Webhooks.

---

## 🛠️ Stack Tecnológica (Atual)
- **Framework:** Next.js (App Router)
- **Linguagem:** TypeScript
- **Estilos:** Tailwind CSS com Design System via variáveis CSS
- **Validação:** Zod
- **Testes:** Vitest
- **Qualidade de Código:** ESLint

---

## 📂 Estrutura de Diretórios
```
docs/           # Documentação arquitetural do projeto
src/
  app/          # Rotas Next.js (hoje, entrada, projetos, ideias, agenda, revisao, api)
  components/   # Componentes React (layout, forms, feedback)
  modules/      # Camadas da aplicação (items, projects, planning, review) separadas por domínio, aplicação, infra, ui
  platform/     # Interfaces para serviços e contratos de infraestrutura global (events, ai, storage, mcp)
  providers/    # Provedores de injeção de dependência e React Context
  lib/          # Utilitários compartilhados
  types/        # Tipagens globais e configurações
  test/         # Arquivos globais e utilitários para testes unitários
```

---

## 🚀 Como Executar o Projeto Localmente

### 1. Instalação
Clone este repositório e certifique-se de que está usando uma versão recente do Node.js.
```bash
npm install
```

### 2. Variáveis de Ambiente
Crie um arquivo `.env` baseado no arquivo de exemplo (`.env.example`).
**Regra:** Arquivos como `.env`, `.env.local`, `.env.development.local` não serão commitados.
Nesta fase, nenhuma variável de ambiente requer credenciais reais. 
Não exponha `OPENAI_API_KEY` ou `SUPABASE_SERVICE_ROLE_KEY` ao navegador em hipótese alguma.

### 3. Rodando o Servidor de Desenvolvimento
```bash
npm run dev
```
Abra [http://localhost:3000](http://localhost:3000) no seu navegador para ver a aplicação.

---

## ✅ Como Validar o Código
Para assegurar a qualidade do projeto e garantir que tudo funcionará corretamente na Vercel, utilize os seguintes comandos antes de realizar push para a branch `main`:
```bash
npm run lint      # Analisa erros e qualidade de código com ESLint
npm run typecheck # Valida se todas as tipagens TypeScript estão corretas
npm run test      # Roda os testes unitários da lógica e repositórios usando Vitest
npm run build     # Simula a build de produção no Next.js
```
Nenhum push deve ocorrer se a etapa de build apresentar erros.

---

## 🚀 Deploy na Vercel
O repositório já está estruturado para deploy simplificado na **Vercel** usando a detecção automática do Next.js.
Toda vez que você realizar um push para a branch `main`:
```bash
git push -u origin main
```
A Vercel importará as alterações, rodará o comando `npm run build` e publicará a aplicação. O sistema dispensa um arquivo `vercel.json` nesta etapa pois aproveita as configurações de zero-config da plataforma.
