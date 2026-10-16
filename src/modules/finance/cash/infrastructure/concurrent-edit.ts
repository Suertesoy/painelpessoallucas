/**
 * Edição simultânea: outra pessoa alterou o mesmo registro depois que esta
 * tela foi aberta. A gravação é recusada em vez de sobrescrever em silêncio;
 * a mensagem é exibida como está (ver `useAction`).
 */
export class ConcurrentEditError extends Error {
  constructor(message = 'Outra pessoa alterou este item enquanto você editava. Feche e abra de novo para ver a versão atual.') {
    super(message);
    this.name = 'ConcurrentEditError';
  }
}
