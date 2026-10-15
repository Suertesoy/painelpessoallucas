import { addMonths, type CardId, type MonthKey } from './month';
import { normalizeText } from '@/modules/finance/domain/normalize-text';

/**
 * Parcelas futuras ESTIMADAS a partir de itens importados. Nunca entram nos
 * totais: são informação. Uma parcela prevista some assim que a fatura do
 * mês futuro traz o item real com a mesma compra e o mesmo número de
 * parcela — projeção e CSV real nunca se somam.
 */

export interface InstallmentItem {
  card: CardId;
  invoiceMonth: MonthKey;
  baseDescription: string;
  installmentNo: number | null;
  installmentTotal: number | null;
  amountCents: number;
  status: 'active' | 'missing' | 'removed';
}

export interface ProjectedInstallment {
  card: CardId;
  month: MonthKey;
  baseDescription: string;
  installmentNo: number;
  installmentTotal: number;
  /** Último valor conhecido da série — estimativa, não promessa. */
  amountCents: number;
}

export function projectFutureInstallments(
  items: readonly InstallmentItem[],
  fromMonth: MonthKey,
  toMonth: MonthKey
): ProjectedInstallment[] {
  const live = items.filter(
    (i) => i.status !== 'removed' && i.installmentNo !== null && i.installmentTotal !== null
  );
  const serie = (i: InstallmentItem) => `${i.card}|${normalizeText(i.baseDescription)}|${i.installmentTotal}`;

  // Quantas parcelas reais (série + número) existem em cada fatura.
  const real = new Map<string, number>();
  for (const i of live) {
    const k = `${serie(i)}|${i.installmentNo}|${i.invoiceMonth}`;
    real.set(k, (real.get(k) ?? 0) + 1);
  }

  // Âncoras: itens da fatura mais recente de cada série. Projetar a partir de
  // todas as parcelas conhecidas geraria a mesma parcela futura várias vezes.
  const latestMonth = new Map<string, MonthKey>();
  for (const i of live) {
    const s = serie(i);
    if ((latestMonth.get(s) ?? '') < i.invoiceMonth) latestMonth.set(s, i.invoiceMonth);
  }
  const anchors = live.filter((i) => latestMonth.get(serie(i)) === i.invoiceMonth);

  const out: ProjectedInstallment[] = [];
  for (const i of anchors) {
    const total = i.installmentTotal as number;
    const no = i.installmentNo as number;
    for (let step = 1; no + step <= total; step += 1) {
      const month = addMonths(i.invoiceMonth, step);
      if (month < fromMonth || month > toMonth) continue;
      const k = `${serie(i)}|${no + step}|${month}`;
      const confirmed = real.get(k) ?? 0;
      if (confirmed > 0) {
        // Consome uma confirmação por série projetada (multiplicidade).
        real.set(k, confirmed - 1);
        continue;
      }
      out.push({
        card: i.card,
        month,
        baseDescription: i.baseDescription,
        installmentNo: no + step,
        installmentTotal: total,
        amountCents: i.amountCents,
      });
    }
  }
  return out.sort((a, b) => a.month.localeCompare(b.month) || a.baseDescription.localeCompare(b.baseDescription));
}
