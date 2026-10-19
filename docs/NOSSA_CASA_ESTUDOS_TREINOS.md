# Nossa Casa — navegação, Estudos e Treinos

Rodada iniciada a partir do commit `b11c118`. Este documento registra decisões, migrations pendentes, ambiguidades da planilha e o diagnóstico de integrações futuras.

## 1. Navegação

- A Home (`src/app/page.tsx`) é o centro: cinco ambientes (Compras, Finanças, Notas, Estudos, Treinos) em composição assimétrica.
- Não há mais sidebar nem barra inferior globais. Fora da Home, `HomeBar` mostra **um** caminho de volta (“‹ Nossa casa · Ambiente”) e atalhos de cronômetros ativos.
- Rotas antigas continuam válidas (`/aprendizado/*` segue como rota do módulo de Estudos; `/ideias`, `/hoje`, `/projetos` etc. por URL).
- Configurações e Sair ficam na Home (ícones discretos).
- Atmosferas: `data-area` no shell redefine a escala `blue` (e `--accent`) só dentro de Estudos (violeta) e Treinos (laranja) — sem JS, sem biblioteca.
- Cronômetros vivem no banco com timestamps; navegar não os encerra. `ActiveTimerChips` mostra estudo/descanso em andamento.

## 2. Migrations (NÃO aplicadas em produção)

Ordem (todas aditivas; RLS, GRANTs explícitos e Realtime):

1. `20261015090000_workspace_invites.sql` — convite seguro e workspace padrão (vinda da branch `feat/compartilhamento-convite`, renomeada para ficar DEPOIS das migrations já aplicadas; o conteúdo é o revisado).
2. `20261015100000_estudos_sessions_practice.sql` — pausas da sessão e prática espaçada.
3. `20261015110000_workouts.sql` — Treinos (inclui `hidden_at`).
4. `20261015120000_learning_course_owner.sql` — dono do curso e uma sessão ativa por curso.
5. `20261015130000_realtime_finance_categories_expenses.sql` — publica categorias, regras e gastos no Realtime.
6. `20261015140000_finance_balance_concurrency.sql` — `finance_set_balance_checked`: ajuste de saldo atômico (bloqueio de linha + versão `updated_at`). A função antiga não é alterada.

Validadas por `supabase/tests/validate-round-migrations.mjs` (PGlite). Sem `supabase db push --include-all` nada fica fora de ordem, pois todas têm data posterior à última migration existente.

**Risco de publicar o código antes das migrations:** `/treinos` e `/aprendizado/praticar` falham com mensagem tratada (padrão `useReactiveQuery`); pausar/encerrar sessão de estudo falha ao gravar `paused_at`/`active_seconds`, e **iniciar** sessão também (o upsert passa a enviar as novas colunas). Aplique as migrations antes do deploy.

## 3. Estudos

- Sessão: `started_at`, `paused_at`, `paused_total_seconds`, `active_seconds`. Tempo = fim − início − pausas, sempre por timestamps.
- Prática: tabela `learning_practice_items` (Leitner 1/3/7/14 dias, por habilidade: ler, reconhecer, escrever, completar palavra). Acerto avança no máximo uma caixa por dia local; erro volta à caixa 0 e reforça na mesma rodada.
- Só entram símbolos de lições **abertas** (existe progresso). Palavras só com kana já ensinados.
- Escrita: área SVG com desfazer/refazer/apagar, guia, comparação sobreposta e autoavaliação. Sem reconhecimento.
- Ordem dos traços: **KanjiVG** (CC BY-SA 3.0) tem SVGs com traços numerados para kana. Não embutido: exige atribuição e compartilhamento sob a mesma licença. Próximo passo possível: importar só os kana, com página de créditos.
- Áudio: Web Speech API (`ja-JP`). iPhone costuma ter a voz Kyoko; só fala após um toque; sem voz instalada os botões ficam desativados. Kana isolado pode ser lido de forma estranha.

### ElevenLabs (proposta, nada integrado)

Geração **única** e armazenamento: um script/rota administrativa (servidor, chave só no servidor, nunca `NEXT_PUBLIC_*`) gera MP3 para cada kana, palavra e frase do conteúdo, grava no Supabase Storage (bucket público de leitura) com chave `hash(texto+voz)` e o app toca por `<audio>`. Custo ≈ caracteres do conteúdo (poucos milhares) — uma vez. Re-gerar só o que mudar. Pré-requisito: configurar a API e aprovar o consumo de créditos.

## 4. Treinos

- Rotina compartilhada (`workout_days`, `workout_exercises`); desempenho individual (`workout_athletes`; cargas, sessões, séries e peso referenciam `athlete_id`).
- **Modelo temporário:** Lucas e Matheus são atletas dentro do workspace de quem usa o app. `workout_athletes.user_id` fica nulo e será preenchido quando o convite/associação existir; nenhuma outra tabela muda. Enquanto cada um tiver seu próprio workspace, os dados dos dois não se encontram entre contas.
- Remoção de exercício é lógica (`removed_at`); histórico preservado.
- Descanso: `rest_ends_at`/`rest_duration_seconds`/`rest_paused_remaining_seconds` na sessão. Fim do descanso: aviso visual + bipe (WebAudio, liberado pelo toque em “Concluir”) + vibração onde houver.
- Concluir o treino atualiza a carga atual de quem treinou para a última carga usada em cada exercício.
- Referências: imagem/vídeo por **link** + instruções curtas. Upload exigiria bucket do Supabase Storage com política por workspace — não existe hoje; proposta fica para aprovação. Nenhum material de terceiros foi embutido.

### Planilha “Treino Marcio Seco 2.xlsx” — ambiguidades

Fonte: Google Drive de Lucas (cópia em Google Sheets de Matheus com o mesmo conteúdo). 38 exercícios (A 7, B 8, C 7, D 9, E 7). O importador (`src/modules/workouts/import/`) só converte o inequívoco; o resto entra com `needs_review` e o texto original em `source_note`:

1. **Dia D:** cabeçalho das colunas de carga é apenas “Carga” (nos outros dias é Mat/Lu). Cargas **não** importadas; ficam na observação do exercício.
2. **Marcador “X”**: decidido pelo Lucas — **ignorado por completo** (não gera alerta nem afeta disponibilidade/conclusão).
3. **Stiff, carga “20x20”** (E): não é número simples — guardado como texto.
4. **Flexão nórdica (E), descanso “2”**: sem unidade — não convertido.
5. **Abdominal (B), “10min”**: mantido como exercício por duração (sem alerta).
6. Decisões de conversão (não ambíguas, mas editáveis): faixas de descanso viram o **limite superior** (“45-60” → 60 s; “2-3min” → 180 s), texto original mantido; “2 mim” lido como minutos; “90”/“60” como segundos (as outras células do dia usam “seg”).
7. Observação: Flexão nórdica (E) com carga 50 na coluna Mat e “Serrote polia baixo” com Lucas 40 × Matheus 20 parecem atípicos — importados como estão.
8. Unidade assumida: kg; para halteres, o número é o da planilha (por mão ou total não está dito).

## 5. Integração futura: Dynamic Island e Tela Bloqueada

Diagnóstico objetivo:

- **Live Activities** usam **ActivityKit** + uma **Widget Extension** (WidgetKit/SwiftUI). Um PWA não consegue iniciar nem atualizar uma Live Activity; é preciso um app iOS nativo (mesmo mínimo, só como “casca”) com a extensão.
- Cronômetros combinam bem: SwiftUI mostra contagem por data com `Text(timerInterval:)` sem precisar de atualizações por push — exatamente o que nossos timestamps (`started_at`/`paused_at`/`paused_total_seconds` em estudo; `rest_ends_at` em treino) permitem.
- Início: pelo app em primeiro plano (toque do usuário) ou remoto via push-to-start (iOS 17.2+) com APNs. Atualizações/encerramento: localmente pelo app ou por push APNs (token da atividade).
- Requisitos: Apple Developer Program (pago), assinatura/provisionamento, Widget Extension em Swift. **Compilar normalmente exige Xcode/Mac**; sem Mac é possível usar build na nuvem (ex.: serviços de CI para iOS) ou frameworks que geram o projeto nativo, mas o código da extensão continua sendo Swift.
- Caminho sugerido, em ordem: (1) decidir se vale um app nativo mínimo (Capacitor/SwiftUI) que abre o PWA e carrega só a Live Activity; (2) expor uma rota autenticada que devolve o estado do cronômetro (timestamps) ou usar o Supabase direto; (3) extensão com `Text(timerInterval:)` para estudo (progressivo) e descanso (regressivo); (4) APNs só se quiser atualizar sem abrir o app; (5) manter o PWA como fonte da verdade.
- Nesta rodada nada disso foi implementado.

### Segundo plano no PWA do iPhone

Com a tela bloqueada ou o app suspenso, o JavaScript para: o bipe/vibração do fim do descanso **não toca**. Ao voltar, o cronômetro mostra o tempo correto (vem de timestamps) e o aviso aparece. Web Push existe no iOS (PWA instalado, 16.4+), mas o cron atual de push (`push-tick`) não tem resolução de segundos; um alerta de fim de descanso exigiria um agendamento preciso no servidor — não prometido.

## 6. Validação no celular depois do deploy (e depois de aplicar as migrations)

1. Abrir pelo ícone da Home: ver cinco cartões; tocar em cada um e voltar por “‹ Nossa casa” e pelo gesto de voltar.
2. Estudos: iniciar, pausar 1 min, retomar, ir à Home (o atalho do cronômetro aparece), voltar, recarregar, encerrar: conferir o tempo sem a pausa e o histórico.
3. Praticar: rodada mista, errar de propósito, ver o reforço; “Revisões do dia” no dia seguinte.
4. Escrever: desenhar com o dedo, desfazer/refazer, comparar, autoavaliar.
5. Ouvir: se houver voz japonesa, tocar kana/palavras; senão ver o aviso.
6. Treinos: importar planilha (conferir os “a confirmar”); escolher pessoa → treino → registrar séries; ver descanso iniciar, ajustar ±15 s, pausar, recarregar a página (prazo mantido), deixar terminar (bipe + aviso); bloquear a tela e voltar (aviso tardio esperado).
7. Concluir treino; abrir Evolução (gráfico) e registrar o peso; alternar entre Lucas e Matheus e conferir históricos separados.

## 7. Segunda rodada: edição de treinos, categorias, Finanças e casa compartilhada

- **Treinos:** ocultar/reexibir exercício (`hidden_at`, reversível; fora da execução, dentro da rotina; histórico intacto), renomear treino, pré-visualizador de importação editável (descanso sem unidade e cargas ambíguas; cargas do dia D só entram se confirmadas).
- **Categorias:** a tela de gerenciamento existia, mas só dentro de um bloco recolhido no fim de `/financas/gastos`. Agora há a página `/financas/categorias` (link em Finanças). Lista em ordem alfabética pt-BR, substituta sugerida ao excluir (ex.: “Delivery” → “Restaurantes e delivery”), possibilidade de excluir sem substituta. Corrigido um defeito real: compromissos (`finance_commitments.category`) não eram migrados nem contados ao excluir.
- **Finanças:** ordem Reserva (recolhida) → saldo → Registrar movimentação (4 tipos, formulários existentes) → Entradas do mês → Resumo/projeção → Faturas → Análises. Olho oculta valores só na tela (preferência do aparelho).
- **Casa compartilhada:** convite por e-mail confirmado, token só em hash, uso único, 7 dias, limite de 2 pessoas; Matheus mantém o workspace pessoal (não é apagado nem mesclado) e passa a ter a casa como padrão. Cartão em Configurações → “Quem usa a casa”; link `/convite/<token>`.
- **Edição simultânea:** saldo, recebimentos e compromissos recusam a gravação (e avisam) se outra pessoa alterou depois que a tela abriu; marcar recebido/pago já era idempotente no banco.
- **Estudos individuais:** `learning_courses.owner_user_id`. Curso sem dono = do administrador (lido assim, sem reescrever nada). Quem não é o administrador não recebe o Japonês. **Limites:** a separação é de progresso, não de sigilo (RLS é por workspace); a meta diária (`learning_preferences`) continua uma por workspace; reatribuir progresso existente exige aprovação.

## 8. Concorrência financeira (atômica)

- **Saldo:** RPC `finance_set_balance_checked` (`SELECT … FOR UPDATE` + comparação da versão dentro da mesma transação; erro `40001`). A versão é o `updated_at` da linha, que muda também quando um recebimento é somado ou um pagamento é descontado.
- **Recebimentos e compromissos:** `UPDATE … WHERE updated_at = <versão lida>` em uma única instrução; 0 linhas = conflito, o app avisa e não grava.
- **Compatibilidade:** app novo + banco sem a migration 6 usa o caminho anterior (checagem no cliente); app publicado hoje + banco novo funciona (função antiga intacta). Marcar recebido/pago/transferir seguem idempotentes.
- **Teste:** o PGlite tem uma só conexão; o pior intercalamento (duas telas com a mesma versão gravando em sequência) é provado, mas a espera real do `FOR UPDATE` entre duas conexões simultâneas é garantia do Postgres, não exercitada localmente.

## 9. Conferência read-only em produção

`supabase/tests/consultas-producao-somente-leitura.sql` (8 consultas curtas, nenhuma altera dados).

## 7. Treinos — fichas em cards, ficha compartilhada e contador (rodada de refinamento)
- **Cards expansíveis** na sessão: recolhido mostra nome, `n/N séries · Não iniciado | Em andamento | Concluído` e o chevron; expandido mostra carga, descanso, séries e "Como fazer". Um card aberto por vez; concluir série não recolhe, concluir a última recolhe. A escolha do card aberto sobrevive a navegar (sessionStorage da aba). O progresso vem das séries registradas (`workout-progress.ts`), nunca de contador visual.
- **Indicador no topo:** "Treino A · 4 de 7 exercícios concluídos", ao lado do cronômetro geral.
- **Editar nome:** `WorkoutCommands.renameExercise` altera só a coluna `name` (atualização de uma coluna): id, cargas, séries, descanso e ordem permanecem; funciona para os dois porque a ficha é do workspace.
- **Ficha compartilhada (auditoria):** `workout_days`/`workout_exercises` pertencem ao **workspace**; Lucas e Matheus são linhas de `workout_athletes` dentro dele. Cargas (`workout_exercise_loads`), sessões, séries e peso corporal referenciam o **atleta**. No banco de produção a casa compartilhada tem os dois membros no mesmo workspace e a ficha de 38 exercícios é única; o outro workspace (pessoal, 1 membro) tem a estrutura A–E vazia — nada foi mesclado nem migrado.
- **Contador de treinos concluídos:** derivado do histórico (`countCompletedDays`): sessão com status concluído em que pelo menos metade dos exercícios do treino tiveram séries. Em andamento e canceladas nunca contam; cada sessão conta uma vez por treino; sessão concluída sem séries do treino não é adivinhada. Exibido como "Última execução: dd/mm/aaaa · N×" (e "Última conclusão" quando difere).
- **Live Activity / Dynamic Island:** auditoria e plano em `docs/TREINOS_LIVE_ACTIVITY_IOS.md` (pendente de autorização nativa).
