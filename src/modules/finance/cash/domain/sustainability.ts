import { CARD_IDS, CARD_FULL_LABELS, addMonths, compareMonths, monthOf, type CardId, type MonthKey } from './month';
import type { CardEstimate, CardEstimateCell, CardMonthKind } from './card-estimate';
import {
  expandIncome, expandOccurrences, occurrenceKey,
  type CommitmentInput, type FixedIncomeInput, type IncomeOccurrenceInput, type InvoiceInput, type MonthProjection,
  type OccurrenceInput, type ReceivableInput,
} from './projection';

/**
 * Sustentabilidade mensal — função pura.
 *
 * Responde, MÊS A MÊS e de forma INDEPENDENTE: "as entradas cadastradas deste
 * mês cobrem o que está combinado e o que gastamos no cartão?".
 *
 *   resultado do mês = entradas do mês − compromissos diretos do mês
 *                      − cartões (fatura real ou média hipotética)
 *
 * Diferenças para o caixa real (`projectCash`):
 *  - NENHUM déficit (muito menos um hipotético) é levado de um mês para o
 *    seguinte: novembro negativo não contamina dezembro.
 *  - Considera o mês inteiro (itens já pagos/recebidos também contam), então o
 *    resultado não "melhora" só porque uma conta já foi quitada.
 *  - Só pertence ao mês o que vence nele; pendências de meses anteriores (caixa
 *    real) ficam na área do caixa acumulado e no aviso de fatura antiga.
 *  - A reserva nunca é usada. Nenhuma entrada é inventada: o resultado depende
 *    só das entradas que estão CADASTRADAS.
 *
 * Três leituras:
 *  1. conhecido — só o que está cadastrado (faturas lançadas + gastos fixos no cartão);
 *  2. média — o conhecido + a hipótese "mantendo a média dos cartões";
 *  3. limite — quanto os cartões poderiam somar para o mês fechar em zero sem
 *     tocar na reserva.
 */

export interface SustainabilityLine {
  label: string;
  amountCents: number;
  /** Já recebido/pago (continua contando: é o mês inteiro). */
  done: boolean;
}

export interface SustainabilityCardRow {
  card: CardId;
  kind: CardMonthKind;
  invoiceStatus: InvoiceInput['status'] | null;
  invoiceCents: number;
  cardFixedCents: number;
  averageCents: number | null;
  gapCents: number;
  /** Fatura existe mas ainda sem valor informado. */
  invoiceWithoutAmount: boolean;
}

export interface CardLimit {
  /** Entradas − compromissos diretos: o teto de TUDO que os cartões podem somar no mês. */
  combinedCents: number;
  /** Entradas cadastradas não cobrem nem os compromissos diretos. */
  incomeBelowDirect: boolean;
  /** Já conhecido nos cartões (faturas lançadas + gastos fixos). */
  knownCardsCents: number;
  /** combinedCents − knownCardsCents (negativo = o conhecido já passou do limite). */
  remainingCents: number;
  /** Divisão sugerida por cartão (proporcional à média); null se não houver médias para dividir. */
  byCard: { card: CardId; cents: number }[] | null;
}

export interface MonthSustainability {
  month: MonthKey;
  isCurrent: boolean;
  incomeLines: SustainabilityLine[];
  incomeCents: number;
  /** Recebimentos marcados como incertos: fora da conta. */
  uncertainIncomeCents: number;
  directLines: SustainabilityLine[];
  directCents: number;
  cards: SustainabilityCardRow[];
  /** Faturas lançadas (valor real, qualquer situação). */
  invoicesCents: number;
  /** Gastos fixos no cartão que ainda não aparecem em fatura. */
  cardFixedCents: number;
  /** Leitura 1: só o cadastrado. */
  knownResultCents: number;
  /** Hipótese de gasto adicional nos cartões (soma das lacunas). */
  estimatedGapCents: number;
  /** Leitura 2: null quando algum cartão não tem média confiável nem fatura definitiva. */
  averageResultCents: number | null;
  /** Cartões que impedem a leitura 2. */
  unavailableCards: CardId[];
  /** Leitura 3. */
  limit: CardLimit;
  /** Não há nenhuma entrada cadastrada para o mês. */
  noIncomeRegistered: boolean;
  /** Avisos de possível contagem em dobro. */
  duplicateWarnings: string[];
}

export interface SustainabilityInput {
  today: string;
  months: number;
  receivables: readonly ReceivableInput[];
  fixedIncomes: readonly FixedIncomeInput[];
  incomeOccurrences: readonly IncomeOccurrenceInput[];
  commitments: readonly CommitmentInput[];
  occurrences: readonly OccurrenceInput[];
  invoices: readonly InvoiceInput[];
  projection: readonly MonthProjection[];
  estimate: CardEstimate;
}

const CARD_LIKE = /fatura|cart[aã]o|nubank/i;

/** Fatura de mês anterior ao atual que continua marcada como não paga (aberta/fechada). */
export function staleUnpaidInvoices(invoices: readonly InvoiceInput[], currentMonth: MonthKey): InvoiceInput[] {
  return invoices
    .filter((i) => i.status !== 'paid' && compareMonths(i.month, currentMonth) < 0)
    .sort((a, b) => compareMonths(a.month, b.month));
}

/** Divide `total` proporcionalmente aos pesos, em centavos exatos (o resto vai ao último). */
function splitProportional(total: number, weights: { card: CardId; weight: number }[]): { card: CardId; cents: number }[] {
  const sum = weights.reduce((s, w) => s + w.weight, 0);
  if (sum <= 0) return weights.map((w) => ({ card: w.card, cents: 0 }));
  let used = 0;
  return weights.map((w, idx) => {
    const cents = idx === weights.length - 1 ? total - used : Math.floor((total * w.weight) / sum);
    used += cents;
    return { card: w.card, cents };
  });
}

export function buildSustainability(input: SustainabilityInput): MonthSustainability[] {
  const currentMonth = monthOf(input.today);
  const lastMonth = addMonths(currentMonth, input.months - 1);
  const incomeOverrides = new Map(input.incomeOccurrences.map((o) => [occurrenceKey(o.incomeId, o.month), o]));
  const occOverrides = new Map(input.occurrences.map((o) => [occurrenceKey(o.commitmentId, o.month), o]));
  const fixedOccurrences = input.fixedIncomes.flatMap((i) => expandIncome(i, lastMonth, incomeOverrides));
  const commitmentOccurrences = input.commitments.flatMap((c) => expandOccurrences(c, lastMonth, occOverrides));

  return input.projection.map((proj, k) => {
    const month = proj.month;

    // Entradas CADASTRADAS do mês: entradas fixas (previstas ou já recebidas) e
    // recebimentos pontuais confirmados/recebidos. Incertos e cancelados ficam fora.
    const incomeLines: SustainabilityLine[] = [];
    for (const o of fixedOccurrences) {
      if (o.month !== month || o.status === 'cancelled') continue;
      incomeLines.push({ label: o.income.description, amountCents: o.amountCents, done: o.status === 'received' });
    }
    let uncertainIncomeCents = 0;
    for (const r of input.receivables) {
      if (monthOf(r.expectedDate) !== month) continue;
      if (r.status === 'uncertain') uncertainIncomeCents += r.amountCents;
      if (r.status === 'confirmed' || r.status === 'received') {
        incomeLines.push({ label: r.description, amountCents: r.amountCents, done: r.status === 'received' });
      }
    }
    const incomeCents = incomeLines.reduce((s, l) => s + l.amountCents, 0);

    // Compromissos diretos (saem da conta) que vencem no mês, pagos ou não.
    const directLines: SustainabilityLine[] = [];
    for (const occ of commitmentOccurrences) {
      if (occ.month !== month || occ.commitment.billing !== 'direct') continue;
      if (occ.status === 'skipped' || occ.status === 'included_in_invoice') continue;
      directLines.push({ label: occ.commitment.description, amountCents: occ.amountCents, done: occ.status === 'paid' });
    }
    const directCents = directLines.reduce((s, l) => s + l.amountCents, 0);

    // Cartões: fatura real quando existe; senão a hipótese da média (cells).
    const cards: SustainabilityCardRow[] = CARD_IDS.map((card) => {
      const cell: CardEstimateCell | undefined = input.estimate.cells.find((c) => c.card === card && c.month === month);
      const invoice = input.invoices.find((i) => i.card === card && i.month === month) ?? null;
      return {
        card,
        kind: cell?.kind ?? 'unavailable',
        invoiceStatus: invoice?.status ?? null,
        invoiceCents: invoice?.amountCents ?? 0,
        cardFixedCents: cell?.cardFixedCents ?? 0,
        averageCents: cell?.averageCents ?? null,
        gapCents: cell?.gapCents ?? 0,
        invoiceWithoutAmount: invoice !== null && invoice.amountCents === null,
      };
    });
    const invoicesCents = cards.reduce((s, c) => s + c.invoiceCents, 0);
    const cardFixedCents = cards.reduce((s, c) => s + c.cardFixedCents, 0);
    const knownCardsCents = invoicesCents + cardFixedCents;
    const estimatedGapCents = cards.reduce((s, c) => s + c.gapCents, 0);
    const unavailableCards = cards.filter((c) => c.kind === 'unavailable').map((c) => c.card);

    const knownResultCents = incomeCents - directCents - knownCardsCents;
    const averageResultCents = unavailableCards.length === 0 ? knownResultCents - estimatedGapCents : null;

    const combinedCents = Math.max(0, incomeCents - directCents);
    const withAverage = cards.filter((c) => c.averageCents !== null);
    const limit: CardLimit = {
      combinedCents,
      incomeBelowDirect: incomeCents < directCents,
      knownCardsCents,
      remainingCents: combinedCents - knownCardsCents,
      byCard:
        withAverage.length === CARD_IDS.length && combinedCents > 0
          ? splitProportional(combinedCents, withAverage.map((c) => ({ card: c.card, weight: c.averageCents ?? 0 })))
          : null,
    };

    const duplicateWarnings: string[] = [];
    for (const l of directLines) {
      if (CARD_LIKE.test(l.label)) {
        duplicateWarnings.push(`"${l.label}" é um compromisso direto, mas o nome lembra a fatura do cartão. Se for a própria fatura, ela já está em Faturas e estaria contada duas vezes.`);
      }
    }
    for (const w of proj.warnings) {
      if (w.includes('parece repetir a entrada fixa')) duplicateWarnings.push(w);
    }

    return {
      month, isCurrent: k === 0,
      incomeLines, incomeCents, uncertainIncomeCents,
      directLines, directCents,
      cards, invoicesCents, cardFixedCents,
      knownResultCents, estimatedGapCents, averageResultCents, unavailableCards, limit,
      noIncomeRegistered: incomeLines.length === 0,
      duplicateWarnings,
    };
  });
}

/** Texto curto de por que a leitura "mantendo a média" não existe para o mês. */
export function averageUnavailableReason(s: MonthSustainability): string | null {
  if (s.unavailableCards.length === 0) return null;
  const names = s.unavailableCards.map((c) => CARD_FULL_LABELS[c]).join(' e ');
  return `Sem média confiável para ${names}: precisa de 3 faturas fechadas ou pagas. Nada foi estimado.`;
}
