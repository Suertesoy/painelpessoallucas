import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSessionContext } from '@/platform/supabase/session';
import { applyImport } from '@/modules/finance/cash/infrastructure/invoice-import-service';
import { errorResponse, handleError, readUpload } from '../_shared';

const PayloadSchema = z.object({
  requestId: z.string().uuid(),
  expectedRev: z.number().int().min(0),
  newStatus: z.enum(['open', 'closed']).nullable(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  decisions: z.object({
    divergences: z.record(z.string(), z.enum(['same', 'different'])),
    missing: z.record(z.string(), z.enum(['keep', 'remove'])),
  }),
  links: z.array(z.object({ ref: z.string().max(80), commitmentId: z.string().uuid() })).max(200),
  payInvoiceIds: z.array(z.string().uuid()).max(12),
});

/**
 * Confirma a importação: refaz a conciliação no servidor com o estado atual
 * do banco (nunca confia no preview do cliente) e aplica tudo em UMA
 * transação (`finance_apply_invoice_import`), idempotente por `requestId`.
 */
export async function POST(request: Request) {
  const session = await getSessionContext();
  if (!session) return errorResponse(401, 'unauthenticated', 'Sessão expirada. Faça login novamente.');
  const upload = await readUpload(request);
  if (upload instanceof NextResponse) return upload;

  let payload;
  try {
    const raw = upload.form.get('payload');
    if (typeof raw !== 'string') throw new Error('payload');
    payload = PayloadSchema.parse(JSON.parse(raw));
  } catch {
    return errorResponse(400, 'invalid_request', 'Dados da confirmação inválidos.');
  }

  try {
    const result = await applyImport(session.supabase, session.workspaceId, {
      card: upload.card, month: upload.month, fileName: upload.file.name, buffer: upload.buffer, payload,
    });
    return NextResponse.json({ result });
  } catch (e) {
    return handleError(e);
  }
}
