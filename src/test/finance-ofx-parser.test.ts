// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { parseOfx, extractOfxDate, parseOfxAmountToCents } from '@/modules/finance/domain/ofx-parser';

const SGML_FIXTURE = `OFXHEADER:100
DATA:OFXSGML
VERSION:102
SECURITY:NONE
ENCODING:USASCII
CHARSET:1252
COMPRESSION:NONE
OLDFILEUID:NONE
NEWFILEUID:NONE

<OFX>
<SIGNONMSGSRSV1>
<SONRS>
<STATUS>
<CODE>0
<SEVERITY>INFO
</STATUS>
</SONRS>
</SIGNONMSGSRSV1>
<BANKMSGSRSV1>
<STMTTRNRS>
<STMTRS>
<BANKTRANLIST>
<DTSTART>20260101000000
<DTEND>20260131235959
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20260105120000[-3:BRT]
<TRNAMT>-45.90
<FITID>2026010500001
<NAME>SUPERMERCADO ABC
<MEMO>COMPRA CARTAO
</STMTTRN>
<STMTTRN>
<TRNTYPE>CREDIT
<DTPOSTED>20260110080000[-3:BRT]
<TRNAMT>1500.00
<FITID>2026011000002
<NAME>TRANSFERENCIA RECEBIDA
</STMTTRN>
</BANKTRANLIST>
</STMTRS>
</STMTTRNRS>
</BANKMSGSRSV1>
</OFX>
`;

const SGML_FIXTURE_CREDIT_CARD = `OFXHEADER:100
DATA:OFXSGML
VERSION:102
SECURITY:NONE
ENCODING:USASCII
CHARSET:1252

<OFX>
<CREDITCARDMSGSRSV1>
<CCSTMTTRNRS>
<CCSTMTRS>
<BANKTRANLIST>
<DTSTART>20260201000000
<DTEND>20260228235959
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20260215093000
<TRNAMT>-120.00
<FITID>CC-001
<NAME>LOJA XYZ
</STMTTRN>
</BANKTRANLIST>
</CCSTMTRS>
</CCSTMTRNRS>
</CREDITCARDMSGSRSV1>
</OFX>
`;

const XML_FIXTURE = `<?xml version="1.0" encoding="UTF-8"?>
<?OFX OFXHEADER="200" VERSION="211" SECURITY="NONE" OLDFILEUID="NONE" NEWFILEUID="NONE"?>
<OFX>
  <SIGNONMSGSRSV1>
    <SONRS>
      <STATUS><CODE>0</CODE><SEVERITY>INFO</SEVERITY></STATUS>
    </SONRS>
  </SIGNONMSGSRSV1>
  <BANKMSGSRSV1>
    <STMTTRNRS>
      <STMTRS>
        <BANKTRANLIST>
          <DTSTART>20260301000000</DTSTART>
          <DTEND>20260331235959</DTEND>
          <STMTTRN>
            <TRNTYPE>DEBIT</TRNTYPE>
            <DTPOSTED>20260305120000[-3:BRT]</DTPOSTED>
            <TRNAMT>-89.90</TRNAMT>
            <FITID>XML-0001</FITID>
            <NAME>FARMACIA DROGARIA</NAME>
          </STMTTRN>
        </BANKTRANLIST>
      </STMTRS>
    </STMTTRNRS>
  </BANKMSGSRSV1>
</OFX>
`;

describe('ofx-parser: extração de data sem deslocamento de fuso', () => {
  it('extrai o dia bancário por fatiamento de string, mesmo com sufixo de fuso que mudaria o dia se fosse convertido para UTC', () => {
    // 23:59 local (-3:BRT) em 31/01 equivale a 02:59 UTC do dia 01/02 — a
    // conversão via Date/UTC deslocaria o dia; o fatiamento de string não.
    expect(extractOfxDate('20260131235900[-3:BRT]')).toBe('2026-01-31');
  });

  it('extrai data sem hora nem sufixo', () => {
    expect(extractOfxDate('20260105')).toBe('2026-01-05');
  });

  it('extrai data com hora mas sem fuso', () => {
    expect(extractOfxDate('20260215093000')).toBe('2026-02-15');
  });
});

describe('ofx-parser: valor', () => {
  it('converte TRNAMT para centavos preservando o sinal', () => {
    expect(parseOfxAmountToCents('-45.90')).toBe(-4590);
    expect(parseOfxAmountToCents('1500.00')).toBe(150000);
  });
});

describe('ofx-parser: SGML (OFX 1.x)', () => {
  it('extrai transações com FITID de um extrato bancário sintético', () => {
    const result = parseOfx(SGML_FIXTURE);
    expect(result.transactions).toHaveLength(2);
    expect(result.transactions[0]).toMatchObject({
      fitid: '2026010500001',
      date: '2026-01-05',
      amountCents: -4590,
      name: 'SUPERMERCADO ABC',
    });
    expect(result.transactions[1]).toMatchObject({
      fitid: '2026011000002',
      date: '2026-01-10',
      amountCents: 150000,
    });
    expect(result.statementStart).toBe('2026-01-01');
    expect(result.statementEnd).toBe('2026-01-31');
  });

  it('extrai transações de uma variação sintética de fatura de cartão (CREDITCARDMSGSRSV1)', () => {
    const result = parseOfx(SGML_FIXTURE_CREDIT_CARD);
    expect(result.transactions).toHaveLength(1);
    expect(result.transactions[0]).toMatchObject({ fitid: 'CC-001', date: '2026-02-15', amountCents: -12000 });
  });
});

describe('ofx-parser: XML (OFX 2.x)', () => {
  it('extrai transações com FITID de um extrato XML sintético', () => {
    const result = parseOfx(XML_FIXTURE);
    expect(result.transactions).toHaveLength(1);
    expect(result.transactions[0]).toMatchObject({
      fitid: 'XML-0001',
      date: '2026-03-05',
      amountCents: -8990,
      name: 'FARMACIA DROGARIA',
    });
    expect(result.statementStart).toBe('2026-03-01');
    expect(result.statementEnd).toBe('2026-03-31');
  });
});

describe('ofx-parser: sobreposição sem duplicar FITID', () => {
  it('duas importações do mesmo extrato produzem os mesmos FITIDs (deduplicação é responsabilidade da camada de persistência)', () => {
    const first = parseOfx(SGML_FIXTURE);
    const second = parseOfx(SGML_FIXTURE);
    expect(first.transactions.map((t) => t.fitid)).toEqual(second.transactions.map((t) => t.fitid));
  });
});
