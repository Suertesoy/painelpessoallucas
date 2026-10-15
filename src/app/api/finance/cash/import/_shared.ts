import { NextResponse } from 'next/server';
import { CARD_IDS, isMonthKey, type CardId, type MonthKey } from '@/modules/finance/cash/domain/month';
import { ImportError } from '@/modules/finance/cash/infrastructure/invoice-import-service';

export const MAX_FILE_BYTES = 2 * 1024 * 1024; // faturas de cartão são pequenas

export function errorResponse(status: number, errorCategory: string, message: string) {
  return NextResponse.json({ error: message, errorCategory }, { status });
}

export function handleError(e: unknown) {
  if (e instanceof ImportError) return errorResponse(e.status, e.category, e.message);
  // Nunca registra conteúdo do arquivo nem valores: só o fato da falha.
  console.error('[finance-cash] erro inesperado na importação');
  return errorResponse(500, 'server_error', 'Erro inesperado ao processar o arquivo.');
}

export async function readUpload(request: Request): Promise<{
  form: FormData; file: File; buffer: ArrayBuffer; card: CardId; month: MonthKey;
} | NextResponse> {
  const declared = request.headers.get('content-length');
  if (declared && Number(declared) > MAX_FILE_BYTES + 64 * 1024) {
    return errorResponse(413, 'file_too_large', 'Arquivo maior que o limite de 2 MB.');
  }
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return errorResponse(400, 'invalid_request', 'Corpo da requisição inválido.');
  }
  const file = form.get('file');
  const card = form.get('card');
  const month = form.get('month');
  if (!(file instanceof File)) return errorResponse(400, 'invalid_request', 'Arquivo ausente.');
  if (file.size === 0) return errorResponse(400, 'invalid_request', 'O arquivo está vazio.');
  if (file.size > MAX_FILE_BYTES) return errorResponse(413, 'file_too_large', 'Arquivo maior que o limite de 2 MB.');
  if (!(file.name || '').toLowerCase().endsWith('.csv')) return errorResponse(415, 'invalid_format', 'Envie um arquivo .csv.');
  if (typeof card !== 'string' || !(CARD_IDS as readonly string[]).includes(card)) return errorResponse(400, 'invalid_request', 'Escolha o cartão.');
  if (typeof month !== 'string' || !isMonthKey(month)) return errorResponse(400, 'invalid_request', 'Escolha o mês de vencimento da fatura.');
  return { form, file, buffer: await file.arrayBuffer(), card: card as CardId, month };
}
