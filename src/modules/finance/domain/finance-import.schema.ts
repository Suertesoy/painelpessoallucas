import { z } from 'zod';
import { isoDateTimeSchema } from '@/lib/zod-datetime';
import { financeDateSchema, FinanceNatureSchema } from './finance-transaction.schema';

export const FinanceImportFormatSchema = z.enum(['csv', 'ofx']);
export type FinanceImportFormat = z.infer<typeof FinanceImportFormatSchema>;

export const FinanceImportStatusSchema = z.enum(['pending_review', 'confirmed']);
export type FinanceImportStatus = z.infer<typeof FinanceImportStatusSchema>;

export const FinanceImportSchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string(),
  sourceId: z.string().uuid(),
  fileName: z.string().min(1),
  fileSha256: z.string().length(64),
  format: FinanceImportFormatSchema,
  status: FinanceImportStatusSchema,
  rowCount: z.number().int().min(0),
  statementStart: financeDateSchema.nullable(),
  statementEnd: financeDateSchema.nullable(),
  confirmedAt: isoDateTimeSchema.nullable(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export type FinanceImport = z.infer<typeof FinanceImportSchema>;

export const FinanceImportRowStatusSchema = z.enum(['pending_review', 'confirmed', 'ignored']);
export type FinanceImportRowStatus = z.infer<typeof FinanceImportRowStatusSchema>;

export const FinanceImportRowSchema = z
  .object({
    id: z.string().uuid(),
    workspaceId: z.string(),
    importId: z.string().uuid(),
    rowIndex: z.number().int().min(0),
    transactionDate: financeDateSchema,
    description: z.string().min(1),
    originalDescription: z.string().min(1),
    amountCents: z.number().int(),
    /** Valor bruto antes da normalização de sinal do perfil — auditoria (seção 5 do pedido). */
    sourceAmountCents: z.number().int().nullable(),
    fitid: z.string().nullable(),
    fingerprint: z.string().nullable(),
    categoryId: z.string().uuid(),
    nature: FinanceNatureSchema,
    suggestedCategoryId: z.string().uuid().nullable(),
    suggestedNature: FinanceNatureSchema.nullable(),
    classificationReason: z.string().nullable(),
    possibleDuplicateTransactionId: z.string().uuid().nullable(),
    possibleDuplicateImportRowId: z.string().uuid().nullable(),
    status: FinanceImportRowStatusSchema,
    createdAt: isoDateTimeSchema,
    updatedAt: isoDateTimeSchema,
  })
  .refine(
    (row) => !(row.possibleDuplicateTransactionId && row.possibleDuplicateImportRowId),
    'Uma linha não pode apontar para dois tipos de possível duplicidade ao mesmo tempo'
  );

export type FinanceImportRow = z.infer<typeof FinanceImportRowSchema>;
