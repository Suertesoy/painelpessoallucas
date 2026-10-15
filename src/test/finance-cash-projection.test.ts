// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
  projectCash,
  linkedKey,
  type CommitmentInput,
  type InvoiceInput,
  type ProjectionInput,
  type ReceivableInput,
} from '@/modules/finance/cash/domain/projection';
import { projectFutureInstallments } from '@/modules/finance/cash/domain/installments';
import { suggestCommitmentLinks, matchPaymentToInvoice } from '@/modules/finance/cash/domain/commitment-links';

const TODAY = '2026-10-15';

function base(overrides: Partial<ProjectionInput> = {}): ProjectionInput {
  return {
    today: TODAY,
    months: 3,
    availableCents: 100000,
    receivables: [],
    commitments: [],
    occurrences: [],
    invoices: [],
    linkedCommitmentMonths: new Set(),
    ...overrides,
  };
}

const rent: CommitmentInput = {
  id: 'rent', description: 'Aluguel', amountCents: 150000, recurrence: 'monthly', dueDate: null,
  dayOfMonth: 20, startMonth: '2026-10', endMonth: null, billing: 'direct', card: null, active: true,
};
const streaming: CommitmentInput = {
  id: 'stream', description: 'Assinatura Streaming', amountCents: 15000, recurrence: 'monthly', dueDate: null,
  dayOfMonth: 9, startMonth: '2026-10', endMonth: null, billing: 'card', card: 'nubank_1', active: true,
};
const receivable = (over: Partial<ReceivableInput>): ReceivableInput => ({
  id: 'r1', description: 'Cliente', amountCents: 200000, expectedDate: '2026-10-25', status: 'confirmed', ...over,
});
const invoice = (over: Partial<InvoiceInput>): InvoiceInput => ({
  id: 'i1', card: 'nubank_1', month: '2026-10', status: 'open', amountCents: 80000, dueDate: '2026-10-28', ...over,
});

describe('projeção do mês atual', () => {
  it('resultado = saldo + recebimentos confirmados − obrigações pendentes, em centavos exatos', () => {
    const [m] = projectCash(base({
      receivables: [receivable({})],
      commitments: [rent],
      invoices: [invoice({}), invoice({ id: 'i2', card: 'nubank_2', amountCents: 25050 })],
    }));
    expect(m.openingCents).toBe(100000);
    expect(m.receiptsCents).toBe(200000);
    expect(m.directCents).toBe(150000);
    expect(m.invoicesCents).toBe(105050);
    expect(m.committedCents).toBe(255050);
    expect(m.resultCents).toBe(100000 + 200000 - 255050);
    expect(m.needCents).toBe(0);
  });

  it('necessidade adicional = falta quando o resultado é negativo', () => {
    const [m] = projectCash(base({ availableCents: 10000, commitments: [rent], invoices: [invoice({})] }));
    expect(m.resultCents).toBe(10000 - 150000 - 80000);
    expect(m.needCents).toBe(220000);
  });

  it('recebimento incerto fica fora dos totais; recebido e cancelado não contam', () => {
    const [m] = projectCash(base({
      receivables: [
        receivable({ id: 'a', status: 'uncertain', amountCents: 50000 }),
        receivable({ id: 'b', status: 'received', amountCents: 70000 }),
        receivable({ id: 'c', status: 'cancelled', amountCents: 90000 }),
      ],
    }));
    expect(m.receiptsCents).toBe(0);
    expect(m.uncertainReceiptsCents).toBe(50000);
    expect(m.resultCents).toBe(100000);
  });

  it('recebimento já recebido não é somado de novo (sem contagem dupla com o saldo manual)', () => {
    const pending = projectCash(base({ receivables: [receivable({})] }))[0];
    const received = projectCash(base({ receivables: [receivable({ status: 'received' })] }))[0];
    expect(pending.resultCents).toBe(300000);
    expect(received.resultCents).toBe(100000);
  });

  it('conta paga e fatura paga saem das obrigações', () => {
    const [m] = projectCash(base({
      commitments: [rent],
      occurrences: [{ commitmentId: 'rent', month: '2026-10', amountCents: null, status: 'paid' }],
      invoices: [invoice({ status: 'paid' })],
    }));
    expect(m.committedCents).toBe(0);
  });

  it('valor editado de uma ocorrência vale só para aquele mês', () => {
    const p = projectCash(base({
      commitments: [rent],
      occurrences: [{ commitmentId: 'rent', month: '2026-10', amountCents: 160000, status: 'pending' }],
    }));
    expect(p[0].directCents).toBe(160000);
    expect(p[1].directCents).toBe(150000);
  });

  it('pendências de meses anteriores entram como atrasadas no mês atual', () => {
    const [m] = projectCash(base({
      receivables: [receivable({ expectedDate: '2026-10-01' })],
      invoices: [invoice({ id: 'old', month: '2026-09', amountCents: 30000, dueDate: '2026-09-28' })],
    }));
    expect(m.invoicesCents).toBe(30000);
    expect(m.invoiceLines[0].overdue).toBe(true);
    expect(m.receipts[0].overdue).toBe(true);
  });
});

describe('projeção de meses futuros', () => {
  it('cada mês começa com o resultado do anterior, sem reutilizar o saldo atual', () => {
    const p = projectCash(base({
      availableCents: 100000,
      commitments: [{ ...rent, amountCents: 60000 }],
    }));
    expect(p[0].openingCents).toBe(100000);
    expect(p[0].resultCents).toBe(40000);
    expect(p[1].openingCents).toBe(40000);
    expect(p[1].resultCents).toBe(-20000);
    expect(p[1].needCents).toBe(20000);
    // O déficit NÃO some: o mês 3 começa em −20.000 e a falta acumula.
    expect(p[2].openingCents).toBe(-20000);
    expect(p[2].resultCents).toBe(-80000);
    expect(p[2].needCents).toBe(80000);
  });

  it('o déficit só deixa de pesar quando um recebimento o cobre', () => {
    const p = projectCash(base({
      availableCents: 0,
      commitments: [{ ...rent, amountCents: 50000 }],
      receivables: [receivable({ expectedDate: '2026-11-05', amountCents: 80000 })],
    }));
    expect(p[0].resultCents).toBe(-50000);
    expect(p[1].openingCents).toBe(-50000);
    expect(p[1].resultCents).toBe(-50000 + 80000 - 50000);
    expect(p[1].needCents).toBe(20000);
  });

  it('ajuste explícito do saldo atual recalcula o déficit acumulado', () => {
    const input = { commitments: [{ ...rent, amountCents: 60000 }] };
    const before = projectCash(base({ ...input, availableCents: 10000 }));
    const after = projectCash(base({ ...input, availableCents: 70000 }));
    expect(before[2].needCents).toBeGreaterThan(after[2].needCents);
    expect(after[1].resultCents).toBe(70000 - 60000 - 60000);
  });

  it('fatura futura pequena não cria sobra além do que é sabido: só obrigações conhecidas', () => {
    const p = projectCash(base({ invoices: [invoice({ id: 'f', month: '2026-11', amountCents: 39704 })] }));
    expect(p[0].invoicesCents).toBe(0);
    expect(p[1].invoicesCents).toBe(39704);
    expect(p[1].resultCents).toBe(100000 - 39704);
  });

  it('a reserva nunca entra no cálculo (não há campo de reserva na entrada)', () => {
    expect(Object.keys(base())).not.toContain('reserveCents');
  });
});

describe('lançamentos ausentes do último CSV', () => {
  it('continuam somados na fatura e geram aviso visível de revisão', () => {
    const [m] = projectCash(base({ invoices: [invoice({ missingItemsCount: 2, amountCents: 80000 })] }));
    expect(m.invoicesCents).toBe(80000);
    expect(m.warnings.join(' ')).toContain('2 lançamento(s) sumiram do último CSV');
  });
  it('sem ausentes, nenhum aviso', () => {
    const [m] = projectCash(base({ invoices: [invoice({ missingItemsCount: 0 })] }));
    expect(m.warnings).toEqual([]);
  });
});

describe('compromisso recorrente dentro do cartão', () => {
  it('conciliado com item da fatura: aparece, mas não soma de novo', () => {
    const [m] = projectCash(base({
      commitments: [streaming],
      invoices: [invoice({ amountCents: 80000 })],
      linkedCommitmentMonths: new Set([linkedKey('stream', 'nubank_1', '2026-10')]),
    }));
    expect(m.cardFixedLines[0].state).toBe('reconciled');
    expect(m.committedCents).toBe(80000);
  });

  it('sem fatura/vínculo: conta como estimativa explícita (nem omite nem duplica em silêncio)', () => {
    const [m] = projectCash(base({ commitments: [streaming] }));
    expect(m.cardFixedLines[0].state).toBe('awaiting_invoice');
    expect(m.cardFixedEstimatedCents).toBe(15000);
    expect(m.committedCents).toBe(15000);
  });

  it('marcado como já incluído na fatura: não soma', () => {
    const [m] = projectCash(base({
      commitments: [streaming],
      invoices: [invoice({})],
      occurrences: [{ commitmentId: 'stream', month: '2026-10', amountCents: null, status: 'included_in_invoice' }],
    }));
    expect(m.cardFixedLines[0].state).toBe('manual_included');
    expect(m.committedCents).toBe(80000);
  });

  it('fatura fechada sem o item: sinaliza revisão e não soma', () => {
    const [m] = projectCash(base({ commitments: [streaming], invoices: [invoice({ status: 'closed' })] }));
    expect(m.cardFixedLines[0].state).toBe('not_found_in_invoice');
    expect(m.committedCents).toBe(80000);
    expect(m.warnings.join(' ')).toMatch(/fatura fechada/);
  });

  it('compromisso fora do cartão soma normalmente', () => {
    const [m] = projectCash(base({ commitments: [rent] }));
    expect(m.directCents).toBe(150000);
  });
});

describe('pagamento de fatura sem duplicação', () => {
  it('fatura paga + compromisso conciliado: obrigação zero', () => {
    const [m] = projectCash(base({
      commitments: [streaming],
      invoices: [invoice({ status: 'paid' })],
      linkedCommitmentMonths: new Set([linkedKey('stream', 'nubank_1', '2026-10')]),
    }));
    expect(m.committedCents).toBe(0);
  });
  it('casa o pagamento do CSV com a fatura de mesmo valor e ignora ambiguidade', () => {
    expect(matchPaymentToInvoice(-256537, [{ id: 'a', amountCents: 256537, status: 'closed' }])).toBe('a');
    expect(matchPaymentToInvoice(-256537, [
      { id: 'a', amountCents: 256537, status: 'closed' },
      { id: 'b', amountCents: 256537, status: 'open' },
    ])).toBeNull();
    expect(matchPaymentToInvoice(-256537, [{ id: 'a', amountCents: 256537, status: 'paid' }])).toBeNull();
  });
});

describe('sugestão de vínculo com compromisso', () => {
  const items = [
    { id: 'x1', normalizedDescription: 'assinatura streaming', amountCents: 15000, kind: 'purchase', commitmentId: null },
    { id: 'x2', normalizedDescription: 'padaria', amountCents: 15000, kind: 'purchase', commitmentId: null },
  ];
  it('nome + valor = alta confiança', () => {
    const s = suggestCommitmentLinks(items, [{ id: 'c', description: 'Streaming', amountCents: 15000, card: 'nubank_1' }], 'nubank_1');
    expect(s).toEqual([{ itemId: 'x1', commitmentId: 'c', confidence: 'high', reason: 'name_and_amount' }]);
  });
  it('valor sozinho com candidatos ambíguos não gera sugestão', () => {
    const s = suggestCommitmentLinks(items, [{ id: 'c', description: 'Outra coisa', amountCents: 15000, card: 'nubank_1' }], 'nubank_1');
    expect(s).toEqual([]);
  });
  it('ignora compromissos de outro cartão', () => {
    expect(suggestCommitmentLinks(items, [{ id: 'c', description: 'Streaming', amountCents: 15000, card: 'nubank_2' }], 'nubank_1')).toEqual([]);
  });
});

describe('parcelas previstas x confirmadas', () => {
  const item = (month: string, no: number) => ({
    card: 'nubank_1' as const, invoiceMonth: month, baseDescription: 'Loja Passaro', installmentNo: no,
    installmentTotal: 3, amountCents: 2909, status: 'active' as const,
  });
  it('projeta as parcelas restantes sem somá-las a nada', () => {
    const p = projectFutureInstallments([item('2026-10', 1)], '2026-11', '2027-03');
    expect(p.map((x) => `${x.month}#${x.installmentNo}`)).toEqual(['2026-11#2', '2026-12#3']);
  });
  it('parcela confirmada por CSV posterior substitui a projeção (não soma)', () => {
    const p = projectFutureInstallments([item('2026-10', 1), item('2026-11', 2)], '2026-11', '2027-03');
    expect(p.map((x) => `${x.month}#${x.installmentNo}`)).toEqual(['2026-12#3']);
  });
  it('não presume valor igual: usa o último valor conhecido só como estimativa', () => {
    const p = projectFutureInstallments([{ ...item('2026-10', 1), amountCents: 2909 }, { ...item('2026-11', 2), amountCents: 2908 }], '2026-12', '2026-12');
    expect(p[0].amountCents).toBe(2908);
  });
});
