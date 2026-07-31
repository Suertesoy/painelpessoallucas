/**
 * Compartilhamento da lista de compras por WhatsApp. Puro e sem I/O — testável
 * isoladamente. Só gera a URL oficial `https://wa.me/`; nunca envia nada
 * automaticamente (a mensagem só é enviada se o usuário concluir o envio
 * dentro do WhatsApp, depois de clicar no link).
 */

/** Remove tudo que não é dígito (espaços, parênteses, hífen, '+'). */
export function normalizePhoneDigits(input: string): string {
  return input.replace(/\D+/g, '');
}

/**
 * Tamanho plausível de um número internacional em E.164 (código do país +
 * DDD/área + linha), sem o '+': mínimo 10 (evita números claramente
 * incompletos), máximo 15 (limite do próprio padrão E.164).
 */
export function isValidWhatsAppNumber(input: string): boolean {
  const digits = normalizePhoneDigits(input);
  return digits.length >= 10 && digits.length <= 15;
}

/**
 * Texto legível: nome da lista + um item pendente por linha, com marcador
 * "☐". Nunca inclui itens já comprados.
 */
export function buildWhatsAppShareText(listName: string, pendingTitles: string[]): string {
  const lines = pendingTitles.map((title) => `☐ ${title}`);
  return [`Lista de compras — ${listName}`, '', ...lines].join('\n');
}

/**
 * URL oficial do WhatsApp (`https://wa.me/<dígitos>?text=<mensagem>`) — nunca
 * monta uma URL a partir de domínio arbitrário. `phoneRaw` é normalizado para
 * dígitos aqui (o valor salvo em Configurações pode estar formatado para
 * leitura humana); `text` é codificado com `encodeURIComponent`.
 */
export function buildWhatsAppShareUrl(phoneRaw: string, text: string): string {
  const digits = normalizePhoneDigits(phoneRaw);
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}
