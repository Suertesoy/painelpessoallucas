import { sha256Hex } from './text-hash';

/**
 * UUID determinístico (mesma seed → sempre o mesmo id), formatado como v5
 * (nibble de versão/variante ajustado para passar em validação `.uuid()`
 * comum). Usado para tornar `create_item` idempotente: uma confirmação de
 * triagem retentada (rede instável, duplo clique) com a mesma
 * `${aiRunId}:${actionIndex}` sempre produz o mesmo id de item — a segunda
 * tentativa colide com a chave primária (23505) em vez de duplicar o item.
 */
export async function deterministicUuid(seed: string): Promise<string> {
  const hex = (await sha256Hex(seed)).slice(0, 32).split('');
  hex[12] = '5';
  const variantChars = ['8', '9', 'a', 'b'];
  hex[16] = variantChars[parseInt(hex[16], 16) % 4];
  const joined = hex.join('');
  return `${joined.slice(0, 8)}-${joined.slice(8, 12)}-${joined.slice(12, 16)}-${joined.slice(16, 20)}-${joined.slice(20, 32)}`;
}
