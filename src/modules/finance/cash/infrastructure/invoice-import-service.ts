import type { SupabaseClient } from '@supabase/supabase-js';
import { CARD_FULL_LABELS, isMonthKey, monthLabel, type CardId, type MonthKey } from '../domain/month';
import {
  invoiceAmountCents, parseNubankInvoiceBuffer, type InvoiceItemKind, type ParsedInvoiceRow,
} from '../domain/nubank-invoice-csv';
import { reconcileInvoice, type ExistingInvoiceItem } from '../domain/reconcile';
import { buildImportPlan, MissingDecisionError, type ImportDecisions } from '../domain/import-plan';
import { matchPaymentToInvoice, suggestCommitmentLinks } from '../domain/commitment-links';
import { applyCategoryRules } from './category-learning';
import type { ConfirmPayload, ConfirmResult, ImportPreview, PreviewItem } from '../domain/import-preview';

/**
 * Serviço SERVER-SIDE da importação de fatura. Recebe o cliente Supabase da
 * sessão do usuário (RLS vale) e o workspace já validado. O arquivo bruto só
 * existe em memória durante a requisição; nada do conteúdo é logado.
 */

export class ImportError extends Error {
  constructor(public status: number, public category: string, message: string) {
    super(message);
  }
}

/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = Record<string, any>;

export async function sha256Hex(buffer: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function hintsFromFileName(name: string): { month: MonthKey | null; dueDate: string | null } {
  const m = name.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return { month: null, dueDate: null };
  const month = `${m[1]}-${m[2]}`;
  return { month: isMonthKey(month) ? month : null, dueDate: isMonthKey(month) ? `${m[1]}-${m[2]}-${m[3]}` : null };
}

function toPreviewItem(row: { date: string; description: string; amountCents: number; kind: InvoiceItemKind }): PreviewItem {
  return { date: row.date, description: row.description, amountCents: row.amountCents, kind: row.kind };
}

const toExisting = (r: Row): ExistingInvoiceItem => ({
  id: r.id, date: r.purchase_date, normalizedDescription: r.normalized_description, amountCents: Number(r.amount_cents),
  kind: r.kind, occurrenceIndex: r.occurrence_index, status: r.status,
});

interface LoadedContext {
  invoice: Row | null;
  existingAll: Row[];
  incoming: ParsedInvoiceRow[];
  parseErrors: { line: number; message: string }[];
}

async function loadContext(
  supabase: SupabaseClient, workspaceId: string, card: CardId, month: MonthKey, buffer: ArrayBuffer
): Promise<LoadedContext> {
  const parsed = parseNubankInvoiceBuffer(buffer);
  if (parsed.rows.length === 0 && parsed.errors.length > 0) {
    throw new ImportError(400, 'invalid_format', parsed.errors[0].message);
  }
  if (parsed.rows.length === 0) throw new ImportError(400, 'invalid_format', 'O arquivo não tem lançamentos.');

  const { data: invoice, error } = await supabase.from('finance_card_invoices').select('*')
    .eq('workspace_id', workspaceId).eq('card', card).eq('month', month).maybeSingle();
  if (error) throw new ImportError(500, 'server_error', 'Não foi possível consultar a fatura.');

  let existingAll: Row[] = [];
  if (invoice) {
    const { data, error: itemsError } = await supabase.from('finance_invoice_items').select('*')
      .eq('workspace_id', workspaceId).eq('invoice_id', invoice.id);
    if (itemsError) throw new ImportError(500, 'server_error', 'Não foi possível consultar os lançamentos da fatura.');
    existingAll = data ?? [];
  }
  return { invoice, existingAll, incoming: parsed.rows, parseErrors: parsed.errors };
}

async function loadCardCommitments(supabase: SupabaseClient, workspaceId: string, card: CardId) {
  const { data, error } = await supabase.from('finance_commitments').select('id, description, amount_cents, card')
    .eq('workspace_id', workspaceId).eq('billing', 'card').eq('card', card).eq('active', true);
  if (error) throw new ImportError(500, 'server_error', 'Não foi possível consultar os compromissos.');
  return (data ?? []).map((c) => ({ id: c.id as string, description: c.description as string, amountCents: Number(c.amount_cents), card: c.card as CardId }));
}

async function loadOtherInvoices(supabase: SupabaseClient, workspaceId: string, card: CardId) {
  const { data, error } = await supabase.from('finance_card_invoices').select('*')
    .eq('workspace_id', workspaceId).eq('card', card);
  if (error) throw new ImportError(500, 'server_error', 'Não foi possível consultar as faturas.');
  return data ?? [];
}

export async function buildPreview(
  supabase: SupabaseClient, workspaceId: string,
  args: { card: CardId; month: MonthKey; fileName: string; buffer: ArrayBuffer }
): Promise<ImportPreview> {
  const { card, month, fileName, buffer } = args;
  const ctx = await loadContext(supabase, workspaceId, card, month, buffer);
  const existing = ctx.existingAll.map(toExisting);
  const result = reconcileInvoice(existing, ctx.incoming);
  const hints = hintsFromFileName(fileName);

  const liveExisting = existing.filter((e) => e.status !== 'removed');
  const amountBefore = ctx.invoice
    ? (ctx.invoice.imported_amount_cents !== null ? Number(ctx.invoice.imported_amount_cents) : null)
    : null;

  // Valor da fatura após aplicar o arquivo, com divergências = "mesmo lançamento".
  const afterItems: { kind: InvoiceItemKind; amountCents: number }[] = [
    ...result.recognized.map((r) => ({ kind: r.existing.kind, amountCents: r.existing.amountCents })),
    ...result.newRows.map((n) => ({ kind: n.row.kind, amountCents: n.row.amountCents })),
    ...result.divergences.map((d) => ({ kind: d.incoming.kind, amountCents: d.incoming.amountCents })),
    ...result.missing.map((m) => ({ kind: m.kind, amountCents: m.amountCents })),
  ];

  const otherInvoices = (await loadOtherInvoices(supabase, workspaceId, card)).filter((i) => i.month !== month);
  const paymentMatches: ImportPreview['paymentMatches'] = [];
  const existingKeys = new Set(liveExisting.map((e) => `${e.date}|${e.normalizedDescription}|${e.amountCents}|${e.occurrenceIndex}`));
  for (const n of result.newRows) {
    if (n.row.kind !== 'payment') continue;
    if (existingKeys.has(`${n.row.date}|${n.row.normalizedDescription}|${n.row.amountCents}|${n.occurrenceIndex}`)) continue;
    const matchId = matchPaymentToInvoice(
      n.row.amountCents,
      otherInvoices.map((i) => ({
        id: i.id,
        amountCents: i.imported_amount_cents !== null ? Number(i.imported_amount_cents) : i.manual_amount_cents !== null ? Number(i.manual_amount_cents) : null,
        status: i.status,
      }))
    );
    if (matchId) {
      const inv = otherInvoices.find((i) => i.id === matchId)!;
      paymentMatches.push({
        description: n.row.description, amountCents: n.row.amountCents, invoiceId: matchId,
        invoiceLabel: `${CARD_FULL_LABELS[card]} — vencimento em ${monthLabel(inv.month)}`,
      });
    }
  }

  const commitments = await loadCardCommitments(supabase, workspaceId, card);
  const linkableItems = [
    ...liveExisting.filter((e) => e.kind === 'purchase').map((e) => {
      const raw = ctx.existingAll.find((r) => r.id === e.id)!;
      return { id: `existing:${e.id}`, normalizedDescription: e.normalizedDescription, amountCents: e.amountCents, kind: e.kind, commitmentId: (raw.commitment_id as string | null) ?? null };
    }),
    ...result.newRows.map((n) => ({
      id: `new:${n.row.rowIndex}`, normalizedDescription: n.row.normalizedDescription, amountCents: n.row.amountCents,
      kind: n.row.kind, commitmentId: null as string | null,
    })),
  ];
  const descriptionByRef = new Map<string, PreviewItem>([
    ...liveExisting.map((e) => [`existing:${e.id}`, toPreviewItem({ date: e.date, description: ctx.existingAll.find((r) => r.id === e.id)!.description, amountCents: e.amountCents, kind: e.kind })] as const),
    ...result.newRows.map((n) => [`new:${n.row.rowIndex}`, toPreviewItem(n.row)] as const),
  ]);
  const linkSuggestions: ImportPreview['linkSuggestions'] = suggestCommitmentLinks(linkableItems, commitments, card).map((s) => ({
    ref: s.itemId,
    item: descriptionByRef.get(s.itemId)!,
    commitmentId: s.commitmentId,
    commitmentDescription: commitments.find((c) => c.id === s.commitmentId)!.description,
    confidence: s.confidence,
    reason: s.reason,
  }));

  const noChanges =
    result.newRows.length === 0 && result.divergences.length === 0 && result.missing.length === 0 && paymentMatches.length === 0;

  return {
    fileName,
    fileSha256: await sha256Hex(buffer),
    card,
    month,
    suggestedMonth: hints.month,
    suggestedDueDate: hints.dueDate,
    parseErrors: ctx.parseErrors,
    invoice: {
      id: ctx.invoice?.id ?? null,
      status: ctx.invoice?.status ?? 'open',
      rev: ctx.invoice?.rev ?? 0,
      amountBeforeCents: amountBefore,
      manualAmountCents: ctx.invoice?.manual_amount_cents !== null && ctx.invoice?.manual_amount_cents !== undefined ? Number(ctx.invoice.manual_amount_cents) : null,
      lastImportedAt: ctx.invoice?.last_imported_at ?? null,
    },
    counts: {
      rows: ctx.incoming.length,
      recognized: result.recognized.length,
      new: result.newRows.length,
      divergences: result.divergences.length,
      missing: result.missing.length,
    },
    amountAfterCents: invoiceAmountCents(afterItems),
    paymentsInFileCents: ctx.incoming.filter((r) => r.kind === 'payment').reduce((s, r) => s + Math.abs(r.amountCents), 0),
    newItems: result.newRows.map((n) => toPreviewItem(n.row)),
    divergences: result.divergences.map((d) => ({
      key: d.key,
      reason: d.reason,
      existing: toPreviewItem({ date: d.existing.date, description: ctx.existingAll.find((r) => r.id === d.existing.id)!.description, amountCents: d.existing.amountCents, kind: d.existing.kind }),
      incoming: toPreviewItem(d.incoming),
    })),
    missing: result.missing.map((m) => ({
      id: m.id,
      item: toPreviewItem({ date: m.date, description: ctx.existingAll.find((r) => r.id === m.id)!.description, amountCents: m.amountCents, kind: m.kind }),
    })),
    paymentMatches,
    linkSuggestions,
    noChanges,
  };
}

export async function applyImport(
  supabase: SupabaseClient, workspaceId: string,
  args: { card: CardId; month: MonthKey; fileName: string; buffer: ArrayBuffer; payload: ConfirmPayload }
): Promise<ConfirmResult> {
  const { card, month, fileName, buffer, payload } = args;
  const ctx = await loadContext(supabase, workspaceId, card, month, buffer);
  if (ctx.parseErrors.length > 0) {
    throw new ImportError(400, 'invalid_format', 'O arquivo tem linhas inválidas. Corrija-as e envie de novo.');
  }
  if ((ctx.invoice?.rev ?? 0) !== payload.expectedRev) {
    throw new ImportError(409, 'stale', 'A fatura mudou desde a pré-visualização. Envie o arquivo de novo para revisar.');
  }
  if (ctx.invoice?.status === 'paid') {
    throw new ImportError(409, 'invoice_paid', 'Esta fatura já está paga. Reabra-a antes de importar.');
  }

  const existing = ctx.existingAll.map(toExisting);
  const result = reconcileInvoice(existing, ctx.incoming);
  const decisions: ImportDecisions = payload.decisions;

  // Vínculos: só compromissos ativos DESTE cartão e itens que existem neste contexto.
  const commitments = await loadCardCommitments(supabase, workspaceId, card);
  const validCommitmentIds = new Set(commitments.map((c) => c.id));
  const validRefs = new Set<string>([
    ...existing.filter((e) => e.status !== 'removed').map((e) => `existing:${e.id}`),
    ...result.newRows.map((n) => `new:${n.row.rowIndex}`),
    ...result.divergences.map((d) => `new:${d.incoming.rowIndex}`),
  ]);
  for (const link of payload.links) {
    if (!validCommitmentIds.has(link.commitmentId) || !validRefs.has(link.ref)) {
      throw new ImportError(400, 'invalid_request', 'Vínculo com compromisso inválido.');
    }
  }

  // Pagamentos reconhecidos: só faturas não pagas do mesmo cartão/workspace.
  if (payload.payInvoiceIds.length > 0) {
    const others = await loadOtherInvoices(supabase, workspaceId, card);
    const allowed = new Set(others.filter((i) => i.status !== 'paid' && i.month !== month).map((i) => i.id as string));
    if (!payload.payInvoiceIds.every((id) => allowed.has(id))) {
      throw new ImportError(400, 'invalid_request', 'Fatura para baixa de pagamento inválida.');
    }
  }

  let plan;
  try {
    plan = buildImportPlan(result, existing, ctx.incoming.length, decisions, payload.links, payload.payInvoiceIds);
  } catch (e) {
    if (e instanceof MissingDecisionError) throw new ImportError(400, 'decision_required', e.message);
    throw e;
  }

  const { data, error } = await supabase.rpc('finance_apply_invoice_import', {
    p_workspace_id: workspaceId,
    p_card: card,
    p_month: month,
    p_due_date: payload.dueDate,
    p_new_status: payload.newStatus,
    p_request_id: payload.requestId,
    p_expected_rev: payload.expectedRev,
    p_file_name: fileName.slice(0, 200),
    p_file_sha256: await sha256Hex(buffer),
    p_plan: plan,
  });
  if (error) {
    if (error.message.includes('STALE_INVOICE')) {
      throw new ImportError(409, 'stale', 'A fatura mudou desde a pré-visualização. Envie o arquivo de novo para revisar.');
    }
    console.error('[finance-cash] falha ao aplicar importação', error.code ?? '');
    throw new ImportError(500, 'server_error', 'Não foi possível salvar a importação. Nada foi alterado.');
  }
  const row = Array.isArray(data) ? data[0] : data;
  // Regras aprendidas: só preenchem lançamentos SEM categoria, nunca sobrescrevem e são
  // idempotentes. Melhor esforço: uma falha aqui não desfaz nem invalida a importação.
  let categorizedByRules = 0;
  try {
    categorizedByRules = await applyCategoryRules(supabase, workspaceId);
  } catch {
    categorizedByRules = 0;
  }
  return {
    invoiceId: row.out_invoice_id,
    alreadyApplied: Boolean(row.out_already_applied),
    counts: plan.counts,
    categorizedByRules,
  };
}
