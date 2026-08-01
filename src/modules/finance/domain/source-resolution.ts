import type { FinanceSourceKind, FinanceSourceProvider } from './finance-source.schema';
import type { CsvAmountMode, CsvProfile } from './csv-parser';

/**
 * Perfil de origem resolvido automaticamente pelo CONTEÚDO do arquivo (seção
 * 6 do pedido) — nunca pergunta ao usuário. Nome estável e determinístico:
 * o mesmo perfil sempre resolve para o mesmo nome, usado como chave de
 * busca/criação idempotente da origem interna (`resolveImportSource`).
 */
export interface ImportSourceProfile {
  name: string;
  kind: FinanceSourceKind;
  provider: FinanceSourceProvider;
}

const NUBANK_CARD_SOURCE: ImportSourceProfile = { name: 'Nubank • Cartão', kind: 'card', provider: 'nubank' };
const NUBANK_ACCOUNT_SOURCE: ImportSourceProfile = { name: 'Nubank • Conta', kind: 'account', provider: 'nubank' };

/**
 * Origem genérica de compatibilidade futura (seção 6.3 do pedido) — usada
 * quando o formato não é um dos dois perfis Nubank validados. Nunca declara
 * um banco específico (ex.: C6) sem fixture/arquivo real validado.
 */
export function genericImportSource(kind: FinanceSourceKind): ImportSourceProfile {
  return {
    name: kind === 'card' ? 'Cartão (formato genérico)' : 'Conta (formato genérico)',
    kind,
    provider: 'generic',
  };
}

/**
 * Resolve a origem interna a partir do perfil CSV já detectado. Fora dos
 * dois perfis Nubank, `kind` vem do modo de valor (mapeamento manual,
 * confirmado explicitamente pelo usuário só para as COLUNAS — nunca para
 * "de quem" é o arquivo) ou, com colunas separadas de débito/crédito
 * (padrão típico de extrato), assume `account`.
 */
export function importSourceProfileForCsv(profile: CsvProfile, amountMode: CsvAmountMode | undefined): ImportSourceProfile {
  if (profile === 'nubank_credit_card_statement') return NUBANK_CARD_SOURCE;
  if (profile === 'nubank_account_statement') return NUBANK_ACCOUNT_SOURCE;
  const kind: FinanceSourceKind = amountMode === 'card_positive_purchase' ? 'card' : 'account';
  return genericImportSource(kind);
}

/** OFX não tem perfil de banco reconhecido nesta versão — só a estrutura (cartão x conta) já é conhecida pela tag OFX. */
export function importSourceProfileForOfx(kind: FinanceSourceKind): ImportSourceProfile {
  return genericImportSource(kind);
}
