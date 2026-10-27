# Treinos — aviso Web Push de fim de descanso

"Avisar quando o descanso terminar": quando o cronômetro de descanso acaba, o
Lutheus manda uma notificação ao iPhone, mesmo com a tela bloqueada.

> Título: **Lutheus 🏡** — Mensagem: **Descanso concluído! 💪 Hora da próxima série.**

## Fluxo

```
App (Commands)                       Servidor                         Upstash QStash
──────────────                       ────────                         ──────────────
startRest/adjust/resume/restart
  └─ grava rest_ends_at na sessão ─► trigger carimba rest_nonce (geração)
  └─ POST /api/workouts/rest-schedule { sessionId }
                                     lê sessão (RLS do usuário)
                                     confere destinatário + aparelho ligado
                                     publishJSON(notBefore = prazo,
                                       body = {v, sessionId, restNonce},
                                       deduplicationId = sessão+geração) ──► guarda a mensagem
                                                                              …
                                     POST /api/workouts/rest-callback ◄────── no prazo, assinado
                                     verifica assinatura (SDK oficial)
                                     relê sessão: mesma geração? em andamento?
                                       dentro da janela de horário?
                                     sessão → atleta → user_id → membro do workspace
                                     → dispositivos DELE com o aviso ligado
                                     reivindica (sessão, geração, aparelho)
                                     envia Web Push
```

- Peças: `src/platform/workouts/rest-alert.ts` (toda a regra),
  `src/app/api/workouts/rest-schedule/route.ts`, `src/app/api/workouts/rest-callback/route.ts`,
  `src/platform/qstash/client.ts`, migration `20261026120000_workout_rest_push.sql`.
- Nada fica esperando: nenhuma função serverless faz `setTimeout` de 90 s e não há cron.

## Geração do descanso (invalidação)

`workout_sessions.rest_nonce` é gerado **pelo banco** (trigger), nunca pelo cliente:

| Ação                         | rest_ends_at        | rest_nonce          |
|------------------------------|---------------------|---------------------|
| iniciar / concluir série     | novo prazo          | novo                |
| ±15 s, reiniciar, retomar    | novo prazo          | novo                |
| trocar de ficha A–E          | igual               | igual (preservado)  |
| pausar, pular                | nulo                | nulo                |
| concluir / cancelar sessão   | —                   | nulo                |

O callback só envia se a geração do payload for a geração atual. Por isso não é
preciso cancelar mensagens na fila do QStash: a mensagem antiga chega e é
descartada (`rest_superseded`). Recarregar ou fechar a PWA não afeta nada — o
agendamento já está no QStash e a verdade está no banco.

## Destinatário e isolamento Lucas/Matheus

- O destinatário é `workout_athletes.user_id` do atleta da sessão — nunca quem
  tocou no botão e nunca algo vindo do payload.
- O payload assinado só contém `{ v, sessionId, restNonce }` (schema estrito);
  endpoint, chaves e usuário vêm do banco.
- O usuário precisa continuar membro do workspace da sessão.
- O navegador **não consegue** alterar `user_id` (trigger); só o servidor/SQL
  administrativo. Um usuário é dono de no máximo um atleta por workspace.
- Atleta sem vínculo não recebe aviso (o app mostra isso no card).

## Preferência

`push_subscriptions.workout_rest_enabled` — por aparelho, opt-in (começa
desligada), dentro da assinatura Web Push que já existia. O card fica em
Treinos (atleta e sessão) e também em Configurações › Notificações.

## Duplicidade e idempotência

- **Na fila:** `deduplicationId = workout-rest-<sessão>-<geração>` — duplo toque,
  retry do app ou dois aparelhos abertos viram uma mensagem só.
- **No envio:** tabela `workout_rest_push_deliveries` com chave única
  `(session_id, rest_nonce, subscription_id)`. Só quem insere a linha envia;
  retries do QStash e callbacks concorrentes batem no `23505` e param.
- `status = 'accepted'` significa que o serviço de push **aceitou** a mensagem.
  Não há como saber, pelo servidor, que o iPhone exibiu a notificação.

## Janela de horário

- Adiantado: aceita até **2 s** antes do prazo (arredondamento do `notBefore` em segundos).
- Atrasado: acima de **45 s** depois do prazo o aviso é **suprimido** (`stale`) —
  para descansos de 30–180 s, um "descanso concluído" tão atrasado mais atrapalha.
  Constante: `REST_ALERT_MAX_LATE_MS`.

## Falhas e recuperação

| Falha                                       | Comportamento |
|---------------------------------------------|---------------|
| QStash/rede fora ao agendar                 | O app tenta 2x; depois desiste em silêncio para não travar o treino. Ao recarregar a tela ou voltar ao app com o descanso ainda correndo, reagenda (idempotente). O cronômetro e o bipe na tela funcionam sempre. |
| Credenciais ausentes                        | `503 not_configured`; o card avisa "ainda não configurados no servidor". |
| Banco fora no callback                      | `500` → o QStash tenta **1** vez de novo, 2 s depois; a janela de 45 s continua valendo. |
| Web Push falhou num aparelho                | Registrado como `failed`; **não** reenvia (aviso velho é pior que nenhum). 404/410 desativa a assinatura. |
| Decisão "não enviar" (cancelado, pausado…)  | `200` — o QStash não repete. |

## App aberto (bipe + notificação)

Com o Lutheus visível, o cronômetro já bipa. O service worker continua exibindo
a notificação (o iOS revoga assinaturas que recebem push sem notificação), mas,
se houver uma janela do Lutheus **visível e em foco**, ela sai com
`silent: true`. Limitações: o suporte a `silent` depende do navegador/iOS; num
segundo aparelho aberto o bipe dele toca normalmente. A sobreposição perceptual
não é eliminada 100%.

## Limites do iPhone

- Só funciona com o Lutheus instalado na Tela de Início (iOS 16.4+), com
  notificações permitidas, e respeita Foco/Não Perturbe e o volume de alertas.
- A entrega final depende do serviço de push da Apple; o servidor não controla
  o atraso depois que entrega a mensagem.

## Custo (Upstash QStash Free, conferido em 26/10/2026)

1.000 mensagens/dia (limite "soft"), cada tentativa de entrega conta como uma
mensagem, atraso máximo de 7 dias, sem cartão de crédito. Dois atletas com
~25 descansos por treino ≈ 50–60 mensagens/dia (+ raros retries) — menos de 10% da cota.
Aparelhos sem o aviso ligado ou atletas sem vínculo não consomem mensagens.
