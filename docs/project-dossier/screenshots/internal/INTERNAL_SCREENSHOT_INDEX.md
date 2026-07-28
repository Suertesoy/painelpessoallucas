# Índice do baseline visual interno

Baseline de screenshots das telas autenticadas do Painel Pessoal Lucas, capturado
como parte da homologação de sincronização entre computador e celular
(2026-07-28). As capturas foram feitas manualmente pelo usuário (não por
automação — este ambiente de execução não tem ferramenta de navegador
disponível) em produção, com a conta real do usuário.

Convenção de dados: `[TESTE SYNC] ...` foi usado para os testes funcionais de
sincronização (não aparece necessariamente nestas telas). O conteúdo visível
nas capturas é dado real de uso do painel.

## Tratamento de dados sensíveis

Por decisão explícita do usuário (dono dos dados), os seguintes itens foram
autorizados a permanecer visíveis, divergindo da regra padrão de "nenhum dado
pessoal":
- E-mail pessoal `lac.lucascabral@gmail.com`.
- Nomes de projetos próprios: "Sartec Papelaria", "Sartec Digital" (públicos).
- O nome da empresa-cliente "Almeida Ambiental" / "Grupo Almeida" (só o nome;
  nenhuma proposta, valor, contato ou documento interno aparece nas capturas).
- O primeiro nome "Priscila" (contato pessoal, sem sobrenome/telefone/e-mail,
  sem projeto associado), presente em uma nota de exemplo.

Todas as imagens foram revisadas manualmente e não contêm tokens, IDs
técnicos (UUIDs), telefones, documentos, valores monetários ou mensagens de
erro técnicas.

Uma captura mobile de Configurações que mostrava o card temporário
"Diagnóstico de sincronização" foi **excluída** deste baseline (não copiada
para esta pasta) por representar um estado que deixa de existir após a
remoção dos diagnósticos nesta mesma tarefa.

## Desktop

| Arquivo | Rota | Viewport real | Ambiente | Data | Estado representado |
|---|---|---|---|---|---|
| `01-hoje-desktop.png` | `/` (Hoje) | 1893×898 | Produção | 2026-07-28 | Dia sem foco/agenda definidos, com 1 próxima ação real |
| `02-entrada-desktop.png` | `/` (Caixa de Entrada) | 1889×901 | Produção | 2026-07-28 | Lista de itens capturados (notas e tarefas) |
| `03-projetos-desktop.png` | `/projetos` | 1904×902 | Produção | 2026-07-28 | Aba "Ativos" com 5 projetos reais |
| `05-agenda-desktop.png` | `/` (Agenda) | 1896×903 | Produção | 2026-07-28 | Semana atual, dia sem compromissos |
| `06-planos-desktop.png` | `/planos` | 1874×891 | Produção | 2026-07-28 | Estado vazio ("Nenhum plano ainda") |
| `07-revisao-desktop.png` | `/` (Revisão) | 1891×903 | Produção | 2026-07-28 | Painel de revisão do sistema, 5 projetos sem marco |
| `08-configuracoes-desktop.png` | `/configuracoes` | 1876×880 | Produção | 2026-07-28 | Conta + integrações (não conectadas) + Automações, sem diagnósticos visíveis |
| `09-captura-texto-desktop.png` | Modal Captura Rápida (aba Texto) | 1882×890 | Produção | 2026-07-28 | Modal aberto, campo de texto vazio |
| `12-ideias-insights-desktop.png` | `/` (Ideias e Insights) | 1876×894 | Produção | 2026-07-28 | Extra (fora da lista original); itens capturados por áudio |
| `13-captura-audio-desktop.png` | Modal Captura Rápida (aba Áudio) | 1884×892 | Produção | 2026-07-28 | Extra; estado "Gravar áudio" antes de gravar (não é a tela de revisão de transcrição) |

## Mobile

| Arquivo | Rota | Viewport real | Ambiente | Data | Estado representado |
|---|---|---|---|---|---|
| `01-hoje-mobile.png` | `/` (Hoje) | 738×1600 (device físico) | Produção | 2026-07-28 | Mesmo estado do Hoje, layout mobile |
| `02-entrada-mobile.png` | `/` (Caixa de Entrada) | 738×1600 | Produção | 2026-07-28 | Lista de itens em layout mobile |
| `03-projetos-mobile.png` | `/projetos` | 738×1600 | Produção | 2026-07-28 | Aba "Ativos", cards empilhados |
| `04-agenda-mobile.png` | `/` (Agenda) | 738×1600 | Produção | 2026-07-28 | Semana com dias abreviados, sem compromissos |
| `05-configuracoes-mobile.png` | `/configuracoes` | 738×1600 | Produção | 2026-07-28 | Conta + integrações no topo, sem diagnósticos visíveis |
| `09-menu-mobile.png` | Menu mobile (drawer) | 738×1600 | Produção | 2026-07-28 | Drawer de navegação aberto sobre a tela Hoje |
| `10-ideias-insights-mobile.png` | `/` (Ideias e Insights) | 738×1600 | Produção | 2026-07-28 | Extra; mesma lista da versão desktop |
| `11-revisao-mobile.png` | `/` (Revisão) | 738×1600 | Produção | 2026-07-28 | Extra; painel de revisão em layout mobile |
| `12-configuracoes-integracoes-mobile.png` | `/configuracoes` | 738×1600 | Produção | 2026-07-28 | Extra; integrações no estado "Conectado" |
| `13-planos-mobile.png` | `/planos` | 738×1600 | Produção | 2026-07-28 | Extra; estado vazio ("Nenhum plano ainda") |

## Limitações do baseline

- **Navegador emulado vs. dispositivo real**: as capturas desktop foram
  feitas em navegador (viewport real ~1890×900, próximo mas não idêntico ao
  1440×1000 sugerido). As capturas mobile foram feitas em **celular físico
  real** (738×1600, resolução de dispositivo, enviadas via WhatsApp) — não
  são viewport emulado de 390×844. Isso é mais forte como evidência do que um
  viewport de navegador, mas o enquadramento exato pode variar por causa da
  UI do próprio navegador do aparelho (barra de endereço visível no rodapé).
- **Telas não capturadas**: `04-projeto-detalhe-desktop.png` (detalhe de um
  projeto específico), `10-revisar-transcricao-desktop.png` /
  `07-revisar-transcricao-mobile.png` (tela de revisão de transcrição de
  áudio, após a gravação), `11-detalhe-item-desktop.png` /
  `08-detalhe-item-mobile.png` (modal de detalhe de item) e
  `06-captura-texto-mobile.png` (captura rápida por texto em mobile) **não
  foram capturadas** nesta rodada. O que existe em seu lugar: uma captura
  desktop do modal de Captura Rápida vazio (aba Texto) e uma do estado
  inicial da aba Áudio (antes de gravar), que não são equivalentes às telas
  pedidas.
- **Estados não reproduzidos**: no momento da captura, Google Calendar e
  Gmail não estavam conectados (capturas desktop mostram os botões
  "Conectar"; uma captura mobile extra mostra o estado "Conectado"). Não há
  captura com compromissos reais na Agenda, nem com itens em "Aguardando"
  diferentes de zero.
- **Teclado mobile**: não foi capturado nenhuma tela com o teclado do
  celular aberto (ex.: digitando na Captura Rápida).
- **Diagnósticos temporários**: as capturas foram feitas antes da remoção de
  `SyncDiagnosticsCard` e `DataFlowDiagnosticsCard`. A maioria das capturas de
  Configurações não rolou até esses cards (portanto não aparecem), exceto uma
  captura mobile que foi excluída deste baseline por esse motivo.
- **Integrações**: nenhuma integração (Google Calendar, Gmail) estava
  conectada com dados reais durante a captura — o card "Compromissos do
  Google Calendar" e o de resumo por e-mail aparecem em estado vazio/carregando
  em vez de populados.
