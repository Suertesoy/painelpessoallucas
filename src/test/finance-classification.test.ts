// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { classifyTransaction, defaultNatureForAmount } from '@/modules/finance/domain/classification-engine';
import { normalizeText } from '@/modules/finance/domain/normalize-text';

describe('classification-engine: sugestão conhecida', () => {
  it('sugere Mercado para um supermercado conhecido', () => {
    const suggestion = classifyTransaction(normalizeText('SUPERMERCADO CARREFOUR LTDA'), []);
    expect(suggestion.categorySlug).toBe('mercado');
    expect(suggestion.matchedRule).toBe('seed');
    expect(suggestion.reason).toMatch(/supermercado/);
  });

  it('sugere natureza invoice_payment para pagamento de fatura', () => {
    const suggestion = classifyTransaction(normalizeText('PAGAMENTO DE FATURA CARTAO'), []);
    expect(suggestion.nature).toBe('invoice_payment');
  });
});

describe('classification-engine: descrição desconhecida', () => {
  it('permanece não classificada sem forçar categoria', () => {
    const suggestion = classifyTransaction(normalizeText('XPTO COMERCIO LTDA 99887766'), []);
    expect(suggestion.categorySlug).toBe('nao-classificado');
    expect(suggestion.matchedRule).toBe('none');
    expect(suggestion.nature).toBeNull();
  });
});

describe('classification-engine: regras aprendidas têm prioridade', () => {
  it('regra aprendida "contains" sobrepõe regra seed', () => {
    const suggestion = classifyTransaction(normalizeText('IFOOD DELIVERY LTDA'), [
      { matchType: 'contains', matchText: 'ifood', categorySlug: 'lazer', nature: null },
    ]);
    expect(suggestion.categorySlug).toBe('lazer');
    expect(suggestion.matchedRule).toBe('learned');
  });

  it('regra aprendida "exact" só combina com correspondência exata', () => {
    const rules = [{ matchType: 'exact' as const, matchText: 'loja abc 123', categorySlug: 'compras', nature: null }];
    expect(classifyTransaction('loja abc 123', rules).categorySlug).toBe('compras');
    expect(classifyTransaction('loja abc 123 filial 2', rules).matchedRule).not.toBe('learned');
  });

  it('regra criada é aplicada em importação futura (mesma normalização)', () => {
    const learnedFromReview = [
      { matchType: 'contains' as const, matchText: normalizeText('Academia Corpo & Cia'), categorySlug: 'saude', nature: null },
    ];
    const futureImportSuggestion = classifyTransaction(normalizeText('ACADEMIA CORPO & CIA MENSALIDADE'), learnedFromReview);
    expect(futureImportSuggestion.categorySlug).toBe('saude');
    expect(futureImportSuggestion.matchedRule).toBe('learned');
  });
});

describe('classification-engine: Pix não é forçado a nenhuma natureza', () => {
  it('Pix enviado não é classificado automaticamente como transferência (pode ser despesa)', () => {
    const suggestion = classifyTransaction(normalizeText('PIX ENVIADO PADARIA DO BAIRRO'), []);
    expect(suggestion.nature).not.toBe('transfer');
  });

  it('Pix enviado para estabelecimento, sem regra, assume natureza padrão de compra pelo sinal do valor', () => {
    const suggestion = classifyTransaction(normalizeText('PIX ENVIADO PADARIA DO BAIRRO'), []);
    expect(suggestion.nature).toBeNull();
    expect(defaultNatureForAmount(-1550)).toBe('purchase');
  });

  it('TED/DOC entre contas continua sugerindo transferência (movimentação não ambígua)', () => {
    const suggestion = classifyTransaction(normalizeText('TED PARA CONTA CONJUNTA'), []);
    expect(suggestion.nature).toBe('transfer');
  });
});

describe('classification-engine: natureza padrão pelo sinal do valor', () => {
  it('valor negativo (saída) tem natureza padrão purchase', () => {
    expect(defaultNatureForAmount(-1000)).toBe('purchase');
  });

  it('valor positivo (entrada) tem natureza padrão unidentified_credit (nunca renda automática)', () => {
    expect(defaultNatureForAmount(1000)).toBe('unidentified_credit');
  });
});
