# Treinos — cronômetro de descanso na tela bloqueada e Dynamic Island (iOS)

**Situação: NÃO implementado. Pendente de autorização para desenvolvimento nativo.**
Esta rodada entregou só o que um PWA consegue fazer de verdade (prazo por timestamp, aviso ao voltar ao app). Nada aqui simula a Dynamic Island na web.

## O que existe hoje (web, funciona e está testado)
- O descanso é um **prazo gravado na sessão** (`rest_ends_at`, `rest_duration_seconds`, `rest_paused_remaining_seconds`). O tempo restante é sempre calculado a partir do relógio, nunca de um contador em memória (`src/lib/timer.ts`).
- Voltar ao app com a tela bloqueada por minutos mostra o estado correto (terminou / quanto falta). Trocar de treino A→B→A, renomear exercícios ou editar a ficha não mexe nesse prazo.
- O **cronômetro geral da academia** (`started_at`) é independente do descanso: iniciar, pausar, ajustar ou limpar o descanso nunca o altera.
- Ao terminar com o app aberto: aviso visual + bipe (+ vibração onde existir). Se a aba estiver oculta mas ainda viva e houver permissão de notificação, uma notificação local simples.

## Limite honesto do PWA no iPhone
- Com a **tela bloqueada** ou o app em segundo plano, o JavaScript é suspenso. Nenhum timer, `setTimeout`, service worker ou áudio da página roda de forma garantida. **Não há bipe confiável com a tela bloqueada num PWA.**
- **Web Push** existe no iOS (PWA instalado na Tela de Início, iOS 16.4+, com permissão) e o projeto já tem a infraestrutura (`web-push`, `/api/push/*`). Mas:
  - só funciona se um **servidor mandar a push no instante certo**; o projeto só tem o cron `push-tick` a cada 5 minutos (e a Vercel não agenda por segundos). Um timer de servidor preciso exigiria um agendador externo (fila com atraso, função de longa duração) — dependência nova, possivelmente paga, e ainda sem garantia de segundos;
  - mostra uma **notificação comum** (sem contagem regressiva), sujeita a modo silencioso, Foco, volume e à permissão do usuário;
  - **não equivale** a uma Live Activity. Não foi implementado.

## O que uma solução genuína exige
Uma **Live Activity** (tela bloqueada + Dynamic Island) só pode ser criada por um **app iOS nativo** com **ActivityKit** e uma **Widget Extension** (WidgetKit/SwiftUI). Um PWA não consegue iniciá-la nem atualizá-la.

### Arquitetura recomendada
1. **Casca nativa mínima** (Capacitor ou SwiftUI + `WKWebView`) que abre o Lutheus publicado. O PWA continua sendo a fonte da verdade.
2. **Plugin Swift** com três chamadas, acionadas pelo JavaScript quando `Capacitor.isNativePlatform()`:
   - `startRest({ endsAt, durationSeconds, exerciseName })` → inicia a Live Activity e **agenda uma notificação local** (`UNTimeIntervalNotificationTrigger`) para o fim, com som;
   - `updateRest({ endsAt | pausedRemainingSeconds })` → ajusta (+/−15 s), pausa e retoma (reagenda a notificação);
   - `endRest()` → encerra a atividade e cancela a notificação (descanso pulado ou sessão encerrada).
3. **Widget Extension** com `Text(timerInterval:countsDown:)`: o sistema desenha a contagem regressiva por data, **sem o app rodando e sem pushes**. Layouts: tela bloqueada, Dynamic Island compacta, expandida e mínima.
4. **Gancho no app web:** `startRest/adjustRest/pauseRest/resumeRest/clearRest` (já centralizados em `WorkoutCommands`) chamam o plugin com o mesmo prazo que gravam no banco. Fora do app nativo, nada muda.
5. **Fim do descanso com som:** a Live Activity em si **não toca som**; o aviso confiável é a **notificação local agendada** pelo app nativo (funciona com a tela bloqueada). Em iOS 26+ o **AlarmKit** permite alarmes/timers que tocam mesmo no silencioso/Foco, com apresentação na tela bloqueada e Dynamic Island — avaliar no aparelho se vale trocar a notificação por ele.
6. Atualizações remotas por **APNs** só são necessárias se quisermos mudar a atividade com o app morto (ex.: ajustar o descanso por outro aparelho). Para o caso principal (descanso iniciado no próprio iPhone) não são.

### Requisitos
- **macOS + Xcode** para compilar a extensão em Swift (o ambiente atual é Windows). Alternativas: Mac emprestado/alugado ou CI macOS na nuvem (custo/limites a avaliar).
- **Apple Developer Program** (conta paga) para distribuir via TestFlight sem expirar em 7 dias e para Push/APNs. Com conta gratuita é possível instalar um build de desenvolvimento no próprio aparelho, que **expira em 7 dias** (não validado aqui).
- Aparelho com **Dynamic Island** (iPhone 14 Pro ou mais novo) para ver a ilha; a tela bloqueada funciona nos iPhones com iOS 16.1+.
- Permissão de notificações concedida; Live Activities ativas nos Ajustes do app.
- Esforço estimado: cerca de **2 a 4 dias de desenvolvimento** (projeto, plugin, extensão, ponte JS, ícones/assinatura) mais validação em aparelho real.

## Limitações que continuam no iOS mesmo com a solução nativa
- Modo silencioso, Foco, volume e roteamento de áudio (fones/alto-falante) afetam o som da notificação; **o comportamento com fones precisa ser validado no aparelho**.
- Uma Live Activity tem prazo máximo de vida definido pelo sistema (horas) e o usuário pode desativá-la.
- A Live Activity só é iniciada com o app em primeiro plano (toque do usuário) ou por push-to-start (iOS 17.2+, com APNs).

## O que dá para testar automaticamente × só em aparelho real
| Automatizável (já coberto) | Só em iPhone real |
|---|---|
| Prazo por timestamp: restante após minutos, descanso terminado, pausa/retomada | Contagem na tela bloqueada e na Dynamic Island |
| Cronômetro geral independente do descanso | Som do aviso com tela bloqueada, silencioso, Foco, fones |
| Troca de treino/renomeação não perde o prazo | Permissões de notificação e de Live Activity |
| (futuro) mapeamento do estado do descanso → payload do plugin | Instalação, assinatura e expiração do build |

## Decisão pendente
Autorizar (ou não) o desenvolvimento do app nativo com Live Activity, e escolher como obter o Mac/Xcode e a conta Apple Developer. Enquanto isso, a experiência na tela bloqueada continua sendo: o tempo certo ao voltar ao app, sem aviso sonoro garantido.
