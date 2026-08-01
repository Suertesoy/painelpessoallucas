import type { CsvProfile } from './csv-parser';
import type { FinanceSourceKind } from './finance-source.schema';
import { formatDateRangeLabel } from './date-range';

/**
 * Nome seguro e exibível de uma importação — nunca o nome original do
 * arquivo (seção 11 do pedido: o nome de extratos Nubank carrega um
 * identificador de conta, ex.: `NU_584626107_...csv`). Derivado só do
 * PERFIL detectado e do intervalo de datas já calculado a partir do
 * conteúdo, nunca de texto do arquivo enviado pelo usuário.
 */
export type ImportKind = CsvProfile | 'ofx';

function labelForKind(kind: ImportKind, sourceKind: FinanceSourceKind): string {
  if (kind === 'nubank_credit_card_statement') return 'Fatura Nubank';
  if (kind === 'nubank_account_statement') return 'Extrato Nubank';
  return sourceKind === 'card' ? 'Fatura importada' : 'Extrato importado';
}

export function buildSafeImportName(
  kind: ImportKind,
  sourceKind: FinanceSourceKind,
  statementStart: string | null,
  statementEnd: string | null
): string {
  const label = labelForKind(kind, sourceKind);
  if (!statementStart || !statementEnd) return `${label} • data não identificada`;
  return `${label} • ${formatDateRangeLabel(statementStart)} a ${formatDateRangeLabel(statementEnd)}`;
}
