// Este arquivo contém contratos para a Fase 2,
// demonstrando como integrações externas (Google Calendar, Gmail, Github) se comunicarão com o painel.

export interface WebhookEvent {
  source: string; // ex: 'github', 'gmail'
  type: string;   // ex: 'pr_opened', 'email_received'
  payload: unknown;
  timestamp: string;
}

export interface IntegrationAdapter {
  /**
   * Identificador único da integração (ex: 'google-calendar')
   */
  readonly id: string;

  /**
   * Método chamado quando um webhook externo atinge o sistema.
   * Deve retornar verdadeiro se o evento foi consumido/processado com sucesso.
   */
  handleWebhook(event: WebhookEvent): Promise<boolean>;

  /**
   * Método opcional para sincronização ativa (polling).
   */
  sync?(): Promise<void>;
}
