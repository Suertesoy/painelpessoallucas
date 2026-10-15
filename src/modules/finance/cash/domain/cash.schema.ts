import { z } from 'zod';
import { isMonthKey, CARD_IDS } from './month';
import { isCategoryId, isPurposeId } from './categories';

/** Entradas validadas pelos Commands. Dinheiro sempre em centavos inteiros. */

const cents = z.number().int().safe();
const positiveCents = cents.positive('O valor deve ser maior que zero.');
const monthKey = z.string().refine(isMonthKey, 'Mês inválido (AAAA-MM).');
const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida (AAAA-MM-DD).');
const cardId = z.enum(CARD_IDS as unknown as [string, ...string[]]);

export const SetBalanceInput = z
  .object({ availableCents: cents.optional(), reserveCents: cents.min(0, 'A reserva não pode ser negativa.').optional() })
  .refine((v) => v.availableCents !== undefined || v.reserveCents !== undefined, 'Informe o saldo ou a reserva.');

export const TransferInput = z.object({
  direction: z.enum(['reserve_to_available', 'available_to_reserve']),
  amountCents: positiveCents,
  note: z.string().trim().max(200).optional(),
  requestId: z.string().uuid(),
});

export const ReceivableInput = z.object({
  description: z.string().trim().min(1, 'Informe a descrição.').max(200),
  amountCents: positiveCents,
  expectedDate: dateStr,
  status: z.enum(['confirmed', 'uncertain']),
  notes: z.string().trim().max(1000).optional(),
});

export const CommitmentInput = z
  .object({
    description: z.string().trim().min(1, 'Informe a descrição.').max(200),
    amountCents: positiveCents,
    recurrence: z.enum(['none', 'monthly']),
    dueDate: dateStr.nullable(),
    dayOfMonth: z.number().int().min(1).max(31).nullable(),
    startMonth: monthKey,
    endMonth: monthKey.nullable(),
    billing: z.enum(['direct', 'card']),
    card: cardId.nullable(),
    category: z.string().trim().max(60).nullable().optional(),
  })
  .superRefine((v, ctx) => {
    if (v.recurrence === 'none' && !v.dueDate) ctx.addIssue({ code: 'custom', message: 'Informe o vencimento.', path: ['dueDate'] });
    if (v.recurrence === 'monthly' && !v.dayOfMonth) ctx.addIssue({ code: 'custom', message: 'Informe o dia do mês.', path: ['dayOfMonth'] });
    if (v.billing === 'card' && !v.card) ctx.addIssue({ code: 'custom', message: 'Escolha o cartão.', path: ['card'] });
    if (v.billing === 'direct' && v.card) ctx.addIssue({ code: 'custom', message: 'Cobrança direta não tem cartão.', path: ['card'] });
    if (v.endMonth && v.endMonth < v.startMonth) ctx.addIssue({ code: 'custom', message: 'O fim não pode ser antes do início.', path: ['endMonth'] });
  });

export const InvoiceManualInput = z.object({
  card: cardId,
  month: monthKey,
  amountCents: cents.min(0, 'O valor não pode ser negativo.').nullable(),
  dueDate: dateStr.nullable(),
  status: z.enum(['open', 'closed']).optional(),
});

export const FixedIncomeInput = z
  .object({
    description: z.string().trim().min(1, 'Informe a descrição.').max(200),
    amountCents: positiveCents,
    dayOfMonth: z.number().int().min(1, 'Dia entre 1 e 31.').max(31, 'Dia entre 1 e 31.'),
    startMonth: monthKey,
    endMonth: monthKey.nullable(),
    notes: z.string().trim().max(1000).nullable().optional(),
  })
  .superRefine((v, ctx) => {
    if (v.endMonth && v.endMonth < v.startMonth) {
      ctx.addIssue({ code: 'custom', message: 'O término não pode ser antes do início.', path: ['endMonth'] });
    }
  });

export const ClassifyInput = z
  .object({
    itemIds: z.array(z.string().uuid()).min(1).max(500),
    category: z.string().refine(isCategoryId, 'Categoria inválida.').nullable().optional(),
    purpose: z.string().refine(isPurposeId, 'Finalidade inválida.').nullable().optional(),
  })
  .refine((v) => v.category !== undefined || v.purpose !== undefined, 'Nada a alterar.');

export type FixedIncomeInputT = z.infer<typeof FixedIncomeInput>;
/** Entrada aberta (strings); a validação de categoria/finalidade acontece no Zod. */
export type ClassifyInputT = { itemIds: string[]; category?: string | null; purpose?: string | null };
export type SetBalanceInputT = z.infer<typeof SetBalanceInput>;
export type TransferInputT = z.infer<typeof TransferInput>;
export type ReceivableInputT = z.infer<typeof ReceivableInput>;
export type CommitmentInputT = z.infer<typeof CommitmentInput>;
export type InvoiceManualInputT = z.infer<typeof InvoiceManualInput>;
