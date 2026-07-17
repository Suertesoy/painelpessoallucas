/**
 * Contrato de envio de e-mail (injetável para testes com mock).
 * Implementação real: GmailSender (server-only, scope gmail.send).
 */

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
}

export interface EmailSender {
  send(message: EmailMessage): Promise<void>;
}

let senderFactory: (() => EmailSender) | null = null;

export function setEmailSenderFactory(factory: () => EmailSender): void {
  senderFactory = factory;
}

export function resolveEmailSender(defaultFactory: () => EmailSender): EmailSender {
  return (senderFactory ?? defaultFactory)();
}
