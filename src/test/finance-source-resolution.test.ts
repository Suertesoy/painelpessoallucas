// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { importSourceProfileForCsv, importSourceProfileForOfx, genericImportSource } from '@/modules/finance/domain/source-resolution';
import { detectOfxAccountKind } from '@/modules/finance/domain/ofx-parser';

/**
 * Resolução da origem interna a partir do perfil detectado — nunca por
 * escolha do usuário (seção 6 do pedido). Nomes estáveis e determinísticos.
 */
describe('source-resolution: perfil CSV -> origem interna', () => {
  it('fatura Nubank resolve para a origem automática "Nubank • Cartão"', () => {
    const profile = importSourceProfileForCsv('nubank_credit_card_statement', undefined);
    expect(profile).toEqual({ name: 'Nubank • Cartão', kind: 'card', provider: 'nubank' });
  });

  it('extrato Nubank resolve para a origem automática "Nubank • Conta"', () => {
    const profile = importSourceProfileForCsv('nubank_account_statement', undefined);
    expect(profile).toEqual({ name: 'Nubank • Conta', kind: 'account', provider: 'nubank' });
  });

  it('CSV genérico com amountMode card_positive_purchase resolve para origem genérica de cartão', () => {
    const profile = importSourceProfileForCsv('generic', 'card_positive_purchase');
    expect(profile.kind).toBe('card');
    expect(profile.provider).toBe('generic');
  });

  it('CSV genérico com amountMode signed (ou colunas separadas) resolve para origem genérica de conta', () => {
    const profile = importSourceProfileForCsv('generic', 'signed');
    expect(profile.kind).toBe('account');
    expect(profile.provider).toBe('generic');
  });

  it('nunca declara um provedor específico (ex.: C6) para formato não validado', () => {
    const profile = importSourceProfileForCsv('generic', undefined);
    expect(profile.provider).toBe('generic');
    expect(profile.name).not.toMatch(/c6/i);
  });
});

describe('source-resolution: OFX -> origem interna', () => {
  it('OFX de cartão (CREDITCARDMSGSRSV1) resolve para origem genérica de cartão', () => {
    const ofx = '<OFX><CREDITCARDMSGSRSV1><CCSTMTTRNRS></CCSTMTTRNRS></CREDITCARDMSGSRSV1></OFX>';
    expect(detectOfxAccountKind(ofx)).toBe('card');
    expect(importSourceProfileForOfx('card')).toEqual(genericImportSource('card'));
  });

  it('OFX de conta (BANKMSGSRSV1) resolve para origem genérica de conta', () => {
    const ofx = '<OFX><BANKMSGSRSV1><STMTTRNRS></STMTTRNRS></BANKMSGSRSV1></OFX>';
    expect(detectOfxAccountKind(ofx)).toBe('account');
    expect(importSourceProfileForOfx('account')).toEqual(genericImportSource('account'));
  });
});
