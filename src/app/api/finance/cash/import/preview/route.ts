import { NextResponse } from 'next/server';
import { getSessionContext } from '@/platform/supabase/session';
import { buildPreview } from '@/modules/finance/cash/infrastructure/invoice-import-service';
import { errorResponse, handleError, readUpload } from '../_shared';

/**
 * Pré-visualização da importação de fatura: lê o CSV, concilia com a fatura
 * (cartão + mês) já conhecida e devolve o que seria incluído, reconhecido,
 * alterado ou precisa de revisão. NADA é gravado aqui.
 */
export async function POST(request: Request) {
  const session = await getSessionContext();
  if (!session) return errorResponse(401, 'unauthenticated', 'Sessão expirada. Faça login novamente.');
  const upload = await readUpload(request);
  if (upload instanceof NextResponse) return upload;
  try {
    const preview = await buildPreview(session.supabase, session.workspaceId, {
      card: upload.card, month: upload.month, fileName: upload.file.name, buffer: upload.buffer,
    });
    return NextResponse.json({ preview });
  } catch (e) {
    return handleError(e);
  }
}
