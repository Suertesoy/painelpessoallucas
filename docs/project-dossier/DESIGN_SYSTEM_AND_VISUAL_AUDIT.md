# Sistema Visual e Auditoria de Design — Painel Pessoal Lucas

Este documento apresenta a auditoria estática e factual do sistema visual, biblioteca de componentes, tokens de estilo, acessibilidade e inconsistências do **Painel Pessoal Lucas**.

---

## 1. Arquitetura e Configuração Base do Estilo

- **Framework de Estilo**: **Tailwind CSS 4.3.3**, configurado via arquivo PostCSS (`postcss.config.mjs`) usando o plugin `@tailwindcss/postcss`.
- **Ausência de `tailwind.config`**: Não existe arquivo `tailwind.config.js/ts` na raiz do projeto. Toda a estilização é baseada nos tokens utilitários padrão do Tailwind 4 e em diretivas CSS nativas.
- **Folha de Estilo Global (`src/app/globals.css`)**:
  ```css
  @import "tailwindcss";

  :root {
    --background: #f9fafb;
    --foreground: #171717;
  }

  body {
    background: var(--background);
    color: var(--foreground);
  }
  ```
  Comentário explícito no CSS: *"Fase 1: tema claro único. As variáveis abaixo são a base do futuro design system (tema escuro entra como evolução consciente, não como resíduo de template)."*
- **Tipografia**: **Inter** via `next/font/google` (`src/app/layout.tsx`), aplicada a `<body>` via `inter.className`. Nenhuma fonte secundária ou customizada foi configurada.
- **Tema**: **Tema Claro Único**. Não existe suporte a dark mode ativado no código atual.

---

## 2. Paleta de Cores e Papel Semântico

Sem cores hexadecimais customizadas em variáveis de tema (exceto o logo oficial do Google em SVG inline), a aplicação utiliza a paleta padrão do Tailwind:

| Família | Exemplos de Uso no Código | Papel Semântico Observado |
|---|---|---|
| **Gray (Cinza)** | `bg-gray-50`, `bg-gray-100`, `text-gray-900`, `border-gray-200` | Fundos neutros, cards base, bordas, textos secundários e estados desabilitados. |
| **Blue (Azul)** | `bg-blue-600`, `hover:bg-blue-700`, `bg-blue-50`, `text-blue-600` | Ação primária (botões), estado ativo de navegação, links e propostas/sugestões da IA. |
| **Red (Vermelho)** | `bg-red-50`, `text-red-700`, `border-red-200` | Mensagens de erro, alertas de prazos estourados, ações destrutivas (excluir/arquivar) e Decisões. |
| **Amber (Âmbar)** | `bg-amber-50`, `text-amber-800`, `border-amber-200` | Avisos de sobrecarga de capacidade, estados offline, hipóteses da IA na revisão de planos. |
| **Green / Emerald** | `bg-green-50`, `text-green-700`, `bg-emerald-100` | Estados de sucesso, tarefas concluídas, planos ativos e decisões aprovadas. |
| **Orange (Laranja)** | `bg-orange-100`, `text-orange-800` | Prioridade Alta, itens bloqueados na Inbox e avisos intermediários. |
| **Yellow (Amarelo)** | `bg-yellow-50`, `text-yellow-800` | Destaque para "Inbox Antiga (>30 dias)" e ícones de ideia (`Lightbulb`). |
| **Purple (Roxo)** | `bg-purple-50`, `text-purple-700`, `border-purple-200` | Linha do tempo de agendamentos e perguntas em aberto na revisão de planos. |
| **Teal (Verde-Água)**| `text-teal-500`, `bg-teal-500` | Uso exclusivo na barra de capacidade diária do `<TodayCalendarCard />`. |

---

## 3. Escala Tipográfica e Espaçamento

### Escala de Texto
- `text-[10px]`: Badges minúsculos (ex: prioridade "Crítica"/"Alta" em `hoje/page.tsx`). *Nota: valor arbitrário fora da escala nomeada do Tailwind.*
- `text-xs` (12px): Metadados, badges, timestamps, sub-rótulos e rodapés.
- `text-sm` (14px): **Tamanho padrão de corpo da aplicação**: inputs, botões, parágrafos, tabelas.
- `text-lg` (18px): Títulos de seções (`h2` / `h3`) dentro dos cards.
- `text-xl` (20px): Subtítulos de páginas ou modais.
- `text-2xl` (24px): Título H1 das páginas internas (Entrada, Ideias, Configurações, Migração).
- `text-3xl` (30px): Título H1 das páginas principais (Hoje, Projetos, Agenda, Revisão).

### Padrão de Espaçamento e Grids
- **Padding de Cards**: O padrão mais repetido no sistema é `p-4 md:p-6`.
- **Gap Padrão**: `gap-2` para elementos internos (ícone + texto) e `gap-4` / `gap-6` para grids de página.
- **Largura Máxima de Conteúdo**: Variabilidade entre `max-w-3xl` (formulários/configurações), `max-w-5xl` (listagens) e `max-w-6xl` (dashboard Hoje).

---

## 4. Bordas, Sombras e Elevacões Visual

- **Border Radius**:
  - `rounded-lg`: Utilizado em botões de ação, inputs de formulário e cards secundários.
  - `rounded-xl`: Utilizado na maioria dos cards de seção principais (`bg-white rounded-xl shadow-sm border`).
  - `rounded-full`: Avatares, badges redondos, botões circulares (FAB mobile) e `ItemCompleteButton`.
- **Sombras (Elevações)**:
  - `shadow-sm`: Sombra padrão para quase todos os cards da aplicação.
  - `shadow-md`: Efeito hover em cards de projeto e ideias.
  - `shadow-lg`: Drawer do menu mobile e `QuickCaptureModal`.
  - `shadow-xl`: `ItemDetailModal`.
  - `shadow-2xl`: Aplicado exclusivamente ao `GlobalSearchModal` (`Ctrl+K`).

---

## 5. Acessibilidade e Comportamento Responsivo

- **Acessibilidade (`aria-*`)**: Uso consistente de `role="dialog"`, `aria-modal="true"`, `aria-label`, `aria-expanded` nos componentes interativos e modais.
- **Áreas de Toque**:
  - O componente `ItemCompleteButton` foi corrigido para **44×44px** (`h-11 w-11`), atendendo às diretrizes de acessibilidade mobile.
  - **Ocorrência de Áreas Reduzidas**: Outros botões de ícone único (como remover foco em Hoje, arquivar item e fechar modais) utilizam `p-1` ou `p-1.5` sobre ícones de 16-20px, resultando em áreas de toque reais abaixo de 44px.
- **Comportamento Responsivo (Breakpoints `sm`, `md`, `lg`)**:
  - `md:` (768px) é a fronteira principal entre a experiência mobile (barra superior + drawer + FAB) e desktop (sidebar fixa de 256px).
  - O `ItemDetailModal` transiciona de **bottom sheet em tela cheia** (mobile) para **dialog centralizado** (`sm:max-w-lg`).

---

## 6. Auditoria de Inconsistências Visuais Identificadas

1. **Variabilidade no Border Radius de Cards**: Convivência não padronizada de `rounded-xl` e `rounded-lg` para elementos visualmente equivalentes (cards de seção vs. itens de lista).
2. **Duplicidade na Escala de Badges**: Uso de `text-xs` padronizado vs. `text-[10px]` arbitrário sem justificativa de hierarquia.
3. **Inconsistência nas Larguras Máximas de Tela**: Três valores de container (`max-w-4xl`, `max-w-5xl`, `max-w-6xl`) concorrendo entre telas de mesmo propósito.
4. **Duplicação no Tratamento Visual de Erros**: O componente padrão `DataErrorNotice` convive com a reimplementação manual de blocos de erro (`<p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">`) em pelo menos 6 telas.
5. **Falta de Abstração para Modais**: Os 3 modais globais reimplementam individualmente overlay, `role="dialog"`, gerenciamento de foco e escuta da tecla `Escape`.
6. **Inputs Inline com Anel de Foco Reduzido**: Formulários normais usam `focus:ring-2 focus:ring-blue-500`, enquanto edições inline usam apenas `focus:border-blue-500` sem anel visível.
7. **Exposição de Cards de Diagnóstico Técnico**: Os cards temporários de debug em `/configuracoes` utilizam o mesmo estilo de card de produto, confundindo a interface de usuário final.
