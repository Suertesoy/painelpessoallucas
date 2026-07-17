# Integrações

O Painel Pessoal Lucas opera como um hub. Nenhuma integração modifica
repositórios diretamente: tudo passa por Commands/rotas do servidor validando
sessão + workspace.

## Implementadas (Fase 2)

### Google OAuth (separado do login)
- Authorization Code no servidor, `access_type=offline`, `prompt=consent`.
- Conexões por serviço em `integration_accounts`; tokens **criptografados**
  (AES-256-GCM, `GOOGLE_TOKEN_ENCRYPTION_KEY`) em `integration_tokens` —
  tabela sem policy de cliente (somente o servidor lê). Rotação automática de
  access token; `invalid_grant` marca a conta como `revoked` e a UI pede
  reconexão em Configurações → Integrações.

### Google Calendar (scopes mínimos)
- `calendar.app.created` (administra apenas o calendário criado pela app —
  "Painel Lucas") + `calendar.freebusy` (disponibilidade, sem ler eventos).
- O painel é a fonte principal. Nada é enviado sem escolha explícita:
  `calendar_sync` por item (`none | sync | sync_reminder`) e
  `calendar_sync_scope` por plano (`none | milestones | timed | all | manual`).
- `calendar_event_links` guarda vínculo, etag, status e erro; eventos levam
  `extendedProperties.private.painelItemId` (anti-loop).
- Consequência dos scopes mínimos: compromissos da agenda principal aparecem
  como blocos ocupados (freebusy), sem título.

### Gmail (somente envio)
- Scope único `gmail.send`. Resumos diário/semanal e alertas em português,
  desativados por padrão (`workspace_settings`). Leitura de e-mail fica
  documentada como fase posterior (scopes e requisitos adicionais).

## Futuras
Google Drive, GitHub, Vercel — via Commands/Queries, nunca banco direto.

## Tratamento de Webhooks (quando existirem)
1. Validar origem (assinaturas/secrets). 2. Registrar a intenção.
3. Idempotência. 4. Converter em Command interno antes de alterar dados.
