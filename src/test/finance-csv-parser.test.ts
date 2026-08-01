// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
  detectCsv,
  parseCsv,
  parseAmountToCents,
  parseFlexibleDate,
  tokenizeCsv,
  decodeCsvBuffer,
} from '@/modules/finance/domain/csv-parser';

describe('csv-parser: valores brasileiros e ISO', () => {
  it('interpreta vírgula decimal brasileira', () => {
    expect(parseAmountToCents('1.234,56')).toBe(123456);
    expect(parseAmountToCents('-45,90')).toBe(-4590);
  });

  it('interpreta valor com ponto decimal (ISO)', () => {
    expect(parseAmountToCents('1234.56')).toBe(123456);
    expect(parseAmountToCents('-45.90')).toBe(-4590);
  });

  it('interpreta datas brasileiras e ISO', () => {
    expect(parseFlexibleDate('05/01/2026')).toBe('2026-01-05');
    expect(parseFlexibleDate('2026-01-05')).toBe('2026-01-05');
  });
});

describe('csv-parser: tokenização com aspas', () => {
  it('respeita campos entre aspas com delimitador embutido', () => {
    const csv = 'data,descricao,valor\n05/01/2026,"Compra, com virgula",-45,90';
    const rows = tokenizeCsv(csv, ',');
    expect(rows[1]).toEqual(['05/01/2026', 'Compra, com virgula', '-45', '90']);
  });

  it('trata aspas duplas literais ("")', () => {
    const csv = 'a,b\n1,"ele disse ""oi"""';
    const rows = tokenizeCsv(csv, ',');
    expect(rows[1][1]).toBe('ele disse "oi"');
  });
});

describe('csv-parser: mapeamento automático e manual', () => {
  it('reconhece colunas de valor único com confiança', () => {
    const csv = 'Data;Descricao;Valor\n05/01/2026;Padaria Sao Jorge;-12,50';
    const detection = detectCsv(csv);
    expect(detection.confident).toBe(true);
    expect(detection.suggestedMapping.dateColumn).toBe('Data');
    expect(detection.suggestedMapping.descriptionColumn).toBe('Descricao');
    expect(detection.suggestedMapping.amountColumn).toBe('Valor');
  });

  it('reconhece colunas separadas de crédito e débito', () => {
    const csv = 'Data,Descricao,Debito,Credito\n10/02/2026,Supermercado ABC,150,00,\n11/02/2026,Estorno Loja XYZ,,30,00';
    const detection = detectCsv(csv);
    expect(detection.suggestedMapping.debitColumn).toBe('Debito');
    expect(detection.suggestedMapping.creditColumn).toBe('Credito');
  });

  it('marca confiança baixa quando não há coluna de valor reconhecível', () => {
    const csv = 'Coluna1,Coluna2,Coluna3\nabc,def,ghi';
    const detection = detectCsv(csv);
    expect(detection.confident).toBe(false);
  });

  it('processa CSV usando mapeamento manual explícito (cabeçalho não reconhecido)', () => {
    const csv = 'F1;F2;F3\n05/01/2026;Loja Desconhecida;-99,90';
    const parsed = parseCsv(csv, ';', {
      dateColumn: 'F1',
      descriptionColumn: 'F2',
      amountColumn: 'F3',
      amountMode: 'signed',
    });
    expect(parsed).toHaveLength(1);
    expect(parsed[0].amountCents).toBe(-9990);
    expect(parsed[0].date).toBe('2026-01-05');
  });
});

describe('csv-parser: colunas separadas de crédito e débito', () => {
  it('débito vira saída negativa e crédito vira entrada positiva', () => {
    const csv = 'Data,Descricao,Debito,Credito\n10/02/2026,Supermercado ABC,"150,00",\n11/02/2026,Estorno Loja XYZ,,"30,00"';
    const parsed = parseCsv(csv, ',', {
      dateColumn: 'Data',
      descriptionColumn: 'Descricao',
      debitColumn: 'Debito',
      creditColumn: 'Credito',
    });
    expect(parsed[0].amountCents).toBe(-15000);
    expect(parsed[1].amountCents).toBe(3000);
  });
});

describe('csv-parser: convenção de sinal para fatura de cartão', () => {
  it('inverte compra positiva de cartão para saída negativa (amountMode card_positive_purchase)', () => {
    const csv = 'Data;Descricao;Valor\n05/01/2026;Compra no cartao;45,90';
    const parsed = parseCsv(csv, ';', {
      dateColumn: 'Data',
      descriptionColumn: 'Descricao',
      amountColumn: 'Valor',
      amountMode: 'card_positive_purchase',
    });
    expect(parsed[0].amountCents).toBe(-4590);
  });

  it('mantém débito de conta corrente já negativo (amountMode signed)', () => {
    const csv = 'Data;Descricao;Valor\n05/01/2026;Debito em conta;-45,90';
    const parsed = parseCsv(csv, ';', {
      dateColumn: 'Data',
      descriptionColumn: 'Descricao',
      amountColumn: 'Valor',
      amountMode: 'signed',
    });
    expect(parsed[0].amountCents).toBe(-4590);
  });

  it('estorno positivo permanece entrada positiva (redução de gasto é decidida pela natureza, não pelo parser)', () => {
    const csv = 'Data;Descricao;Valor\n06/01/2026;Estorno Loja ABC;30,00';
    const parsed = parseCsv(csv, ';', {
      dateColumn: 'Data',
      descriptionColumn: 'Descricao',
      amountColumn: 'Valor',
      amountMode: 'signed',
    });
    expect(parsed[0].amountCents).toBe(3000);
  });
});

describe('csv-parser: duas compras legítimas idênticas preservadas', () => {
  it('não deduplica linhas com mesma data/descrição/valor', () => {
    const csv = 'Data,Descricao,Valor\n05/01/2026,Padaria,-10,00\n05/01/2026,Padaria,-10,00';
    const parsed = parseCsv(csv, ',', {
      dateColumn: 'Data',
      descriptionColumn: 'Descricao',
      amountColumn: 'Valor',
      amountMode: 'signed',
    });
    expect(parsed).toHaveLength(2);
  });
});

describe('csv-parser: encoding', () => {
  it('decodifica UTF-8 (com e sem BOM)', () => {
    const text = 'Data,Descrição\n05/01/2026,Açaí';
    const withBom = new Uint8Array([0xef, 0xbb, 0xbf, ...Buffer.from(text, 'utf-8')]);
    const result = decodeCsvBuffer(withBom.buffer);
    expect(result.encoding).toBe('utf-8');
    expect(result.text).toContain('Açaí');
  });

  it('recorre a Windows-1252 quando a decodificação UTF-8 estrita falha', () => {
    // "Descrição" em Windows-1252: 'ç' = 0xE7, 'ã' = 0xE3 — inválido como UTF-8 solto.
    const bytes = Buffer.from([0x44, 0x65, 0x73, 0x63, 0x72, 0x69, 0xe7, 0xe3, 0x6f]);
    const result = decodeCsvBuffer(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
    expect(result.encoding).toBe('windows-1252');
    expect(result.text).toBe('Descrição');
  });
});
