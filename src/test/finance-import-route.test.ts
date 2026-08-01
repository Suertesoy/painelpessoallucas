// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getSessionContext } from '@/platform/supabase/session';
import { POST } from '@/app/api/finance/import/route';
import { DEFAULT_FINANCE_CATEGORIES } from '@/modules/finance/domain/finance-category.schema';

vi.mock('server-only', () => ({}));
vi.mock('@/platform/supabase/session', () => ({
  getSessionContext: vi.fn(),
}));

/**
 * POST /api/finance/import — validação de sessão/workspace/tamanho/formato,
 * hash SHA-256, reimportação idempotente (confirmada bloqueia, pendente
 * reabre, corrida não duplica), classificação automática e sinais de
 * possível duplicidade (FITID e impressão digital). Sem chamadas reais ao
 * Supabase (fake client em memória) nem a serviços externos.
 */

type Row = Record<string, unknown>;

function makeFakeSupabase(initial: Record<string, Row[]> = {}) {
  const state: Record<string, Row[]> = Object.fromEntries(Object.entries(initial).map(([k, v]) => [k, [...v]]));
  const table = (name: string) => (state[name] ??= []);
  const matches = (row: Row, filters: { col: string; op: 'eq' | 'in'; val: unknown }[]) =>
    filters.every((f) => (f.op === 'eq' ? row[f.col] === f.val : (f.val as unknown[]).includes(row[f.col])));

  let forceImportInsertConflictOnce = false;

  return {
    state,
    forceImportInsertConflictOnce(v: boolean) {
      forceImportInsertConflictOnce = v;
    },
    from(name: string) {
      const rows = table(name);
      return {
        select() {
          const filters: { col: string; op: 'eq' | 'in'; val: unknown }[] = [];
          const builder = {
            eq(col: string, val: unknown) {
              filters.push({ col, op: 'eq', val });
              return builder;
            },
            in(col: string, val: unknown[]) {
              filters.push({ col, op: 'in', val });
              return builder;
            },
            order() {
              return builder;
            },
            maybeSingle: async () => {
              const found = rows.filter((r) => matches(r, filters));
              return { data: found[0] ?? null, error: null };
            },
            then(resolve: (v: { data: Row[]; error: null }) => void) {
              resolve({ data: rows.filter((r) => matches(r, filters)), error: null });
            },
          };
          return builder;
        },
        insert(payload: Row | Row[]) {
          if (name === 'finance_imports' && forceImportInsertConflictOnce) {
            forceImportInsertConflictOnce = false;
            return { select: () => ({ single: async () => ({ data: null, error: { code: '23505', message: 'duplicate key' } }) }) };
          }
          const items = Array.isArray(payload) ? payload : [payload];
          const inserted = items.map((item) => ({
            id: (item.id as string) ?? crypto.randomUUID(),
            created_at: '2026-07-31T10:00:00.000Z',
            updated_at: '2026-07-31T10:00:00.000Z',
            ...item,
          }));
          rows.push(...inserted);
          if (Array.isArray(payload)) return Promise.resolve({ error: null });
          return { select: () => ({ single: async () => ({ data: inserted[0], error: null }) }) };
        },
        upsert(payload: Row[], opts: { onConflict: string }) {
          const conflictCols = opts.onConflict.split(',');
          const created: Row[] = [];
          for (const item of payload) {
            const exists = rows.some((r) => conflictCols.every((c) => r[c] === item[c]));
            if (!exists) {
              const newRow: Row = {
                id: crypto.randomUUID(),
                created_at: '2026-07-31T10:00:00.000Z',
                updated_at: '2026-07-31T10:00:00.000Z',
                ...item,
              };
              rows.push(newRow);
              created.push(newRow);
            }
          }
          return { select: async () => ({ data: created, error: null }) };
        },
      };
    },
  };
}

const WS = 'ws-1';
const SOURCE_ID = '11111111-1111-4111-8111-111111111111';
// Ids fixos das origens internas automáticas (mesmo nome que `resolveImportSource`
// procura por perfil) — presentes para que os testes que checam `source_id`
// específico não dependam da ordem de criação em tempo de execução.
const GENERIC_ACCOUNT_SOURCE_ID = '22222222-2222-4222-8222-222222222222';
const GENERIC_CARD_SOURCE_ID = '33333333-3333-4333-8333-333333333333';
const NUBANK_CARD_SOURCE_ID = '44444444-4444-4444-8444-444444444444';
const NUBANK_ACCOUNT_SOURCE_ID = '55555555-5555-4555-8555-555555555555';

function baseState(): Record<string, Row[]> {
  return {
    finance_sources: [
      { id: GENERIC_ACCOUNT_SOURCE_ID, workspace_id: WS, kind: 'account', name: 'Conta (formato genérico)', provider: 'generic', status: 'active' },
      { id: GENERIC_CARD_SOURCE_ID, workspace_id: WS, kind: 'card', name: 'Cartão (formato genérico)', provider: 'generic', status: 'active' },
      { id: NUBANK_CARD_SOURCE_ID, workspace_id: WS, kind: 'card', name: 'Nubank • Cartão', provider: 'nubank', status: 'active' },
      { id: NUBANK_ACCOUNT_SOURCE_ID, workspace_id: WS, kind: 'account', name: 'Nubank • Conta', provider: 'nubank', status: 'active' },
    ],
    finance_categories: DEFAULT_FINANCE_CATEGORIES.map((c) => ({
      id: crypto.randomUUID(),
      workspace_id: WS,
      slug: c.slug,
      name: c.name,
      position: c.position,
    })),
    finance_settings: [{ id: crypto.randomUUID(), workspace_id: WS, default_matheus_income_cents: 0 }],
  };
}

function mockSession(supabase: ReturnType<typeof makeFakeSupabase>) {
  vi.mocked(getSessionContext).mockResolvedValue({
    supabase: supabase as never,
    user: { id: 'user-1' } as never,
    workspaceId: WS,
  });
}

function csvFile(content: string, name = 'extrato.csv'): File {
  return new File([content], name, { type: 'text/csv' });
}

function ofxFile(content: string, name = 'extrato.ofx'): File {
  return new File([content], name, { type: 'application/octet-stream' });
}

function formDataWith(fields: Record<string, string | File>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

async function postImport(body: FormData, headers?: Record<string, string>) {
  return POST(new Request('http://x/api/finance/import', { method: 'POST', body, headers }));
}

const SIMPLE_CSV = 'Data;Descricao;Valor\n05/07/2026;Supermercado Carrefour;-45,90\n';

// Fixtures sintéticas reproduzindo só as CARACTERÍSTICAS ESTRUTURAIS dos
// layouts reais do Nubank (seção 3 do pedido) — nenhum dado financeiro real.
const NUBANK_CREDIT_CARD_CSV = [
  'date,title,amount',
  '2026-06-17,Uber Trip,"25,90"',
  '2026-05-21,Supermercado Extra,"120,00"',
].join('\n');

const NUBANK_ACCOUNT_CSV = [
  'Data,Valor,Identificador,Descrição',
  '01/06/2026,-89.90,11111111-1111-4111-8111-111111111111,Compra no débito - Mercado Bom Preço',
  '20/06/2026,-150.00,55555555-5555-4555-8555-555555555555,Transferência enviada pelo Pix',
].join('\n');

const SGML_OFX = `OFXHEADER:100
DATA:OFXSGML
VERSION:102

<OFX>
<BANKMSGSRSV1>
<STMTTRNRS>
<STMTRS>
<BANKTRANLIST>
<DTSTART>20260701000000
<DTEND>20260731235959
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20260705120000
<TRNAMT>-45.90
<FITID>FIT-001
<NAME>SUPERMERCADO CARREFOUR
</STMTTRN>
</BANKTRANLIST>
</STMTRS>
</STMTTRNRS>
</BANKMSGSRSV1>
</OFX>
`;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('POST /api/finance/import — sessão, validação e formato', () => {
  it('rejeita sem sessão (401)', async () => {
    vi.mocked(getSessionContext).mockResolvedValue(null);
    const res = await postImport(formDataWith({ file: csvFile(SIMPLE_CSV), sourceId: SOURCE_ID }));
    expect(res.status).toBe(401);
    expect((await res.json()).errorCategory).toBe('unauthenticated');
  });

  it('rejeita arquivo ausente', async () => {
    mockSession(makeFakeSupabase(baseState()));
    const res = await postImport(formDataWith({ sourceId: SOURCE_ID }));
    expect(res.status).toBe(400);
    expect((await res.json()).errorCategory).toBe('invalid_request');
  });

  it('nunca exige nem lê um sourceId do cliente — a origem é sempre resolvida automaticamente pelo conteúdo', async () => {
    // Um `sourceId` arbitrário/inválido enviado pelo cliente é simplesmente
    // ignorado — a rota nunca confia nele para decidir a origem (seção 6 do
    // pedido: usuário nunca escolhe origem).
    const supabase = makeFakeSupabase(baseState());
    mockSession(supabase);
    const mapping = { dateColumn: 'Data', descriptionColumn: 'Descricao', amountColumn: 'Valor', amountMode: 'signed' };
    const res = await postImport(
      formDataWith({ file: csvFile(SIMPLE_CSV), sourceId: 'not-a-uuid-or-anything-else', mapping: JSON.stringify(mapping) })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.needsMapping).toBeUndefined();
    expect(body.sourceName).toBe('Conta (formato genérico)');
  });

  it('workspace sem nenhuma origem pré-existente cria a origem interna automaticamente (nunca 404)', async () => {
    const supabase = makeFakeSupabase({ ...baseState(), finance_sources: [] });
    mockSession(supabase);
    const mapping = { dateColumn: 'Data', descriptionColumn: 'Descricao', amountColumn: 'Valor', amountMode: 'signed' };
    const res = await postImport(formDataWith({ file: csvFile(SIMPLE_CSV), mapping: JSON.stringify(mapping) }));
    expect(res.status).toBe(200);
    expect(supabase.state.finance_sources.some((s) => s.name === 'Conta (formato genérico)')).toBe(true);
  });

  it('rejeita formato não reconhecido (extensão inválida)', async () => {
    mockSession(makeFakeSupabase(baseState()));
    const res = await postImport(formDataWith({ file: new File(['x'], 'fatura.txt'), sourceId: SOURCE_ID }));
    expect(res.status).toBe(415);
    expect((await res.json()).errorCategory).toBe('invalid_format');
  });

  it('rejeita arquivo vazio', async () => {
    mockSession(makeFakeSupabase(baseState()));
    const res = await postImport(formDataWith({ file: csvFile(''), sourceId: SOURCE_ID }));
    expect(res.status).toBe(400);
  });

  it('rejeita OFX cujo conteúdo não parece um OFX válido (não confia só na extensão)', async () => {
    mockSession(makeFakeSupabase(baseState()));
    const res = await postImport(formDataWith({ file: ofxFile('isto nao e um ofx de verdade'), sourceId: SOURCE_ID }));
    expect(res.status).toBe(400);
    expect((await res.json()).errorCategory).toBe('invalid_format');
  });

  it('rejeita arquivo acima do limite de 10 MB pelo tamanho real', async () => {
    mockSession(makeFakeSupabase(baseState()));
    const bigContent = 'a'.repeat(10 * 1024 * 1024 + 1);
    const res = await postImport(formDataWith({ file: csvFile(bigContent), sourceId: SOURCE_ID }));
    expect(res.status).toBe(413);
    expect((await res.json()).errorCategory).toBe('file_too_large');
  });

  it('rejeita antecipadamente pelo cabeçalho Content-Length, antes de ler o corpo', async () => {
    mockSession(makeFakeSupabase(baseState()));
    const res = await postImport(formDataWith({ file: csvFile(SIMPLE_CSV), sourceId: SOURCE_ID }), {
      'content-length': String(11 * 1024 * 1024),
    });
    expect(res.status).toBe(413);
    expect((await res.json()).errorCategory).toBe('file_too_large');
  });
});

describe('POST /api/finance/import — mapeamento manual de CSV', () => {
  it('pede mapeamento quando o cabeçalho não é reconhecido com segurança', async () => {
    mockSession(makeFakeSupabase(baseState()));
    const csv = 'F1;F2;F3\n05/07/2026;Loja Desconhecida;-99,90\n';
    const res = await postImport(formDataWith({ file: csvFile(csv), sourceId: SOURCE_ID }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.needsMapping).toBe(true);
    expect(body.detection.headers).toEqual(['F1', 'F2', 'F3']);
  });

  it('pede mapeamento (convenção de sinal) quando há só uma coluna de valor, mesmo com cabeçalho reconhecido', async () => {
    mockSession(makeFakeSupabase(baseState()));
    const res = await postImport(formDataWith({ file: csvFile(SIMPLE_CSV), sourceId: SOURCE_ID }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.needsMapping).toBe(true);
  });

  it('processa com sucesso quando o mapeamento manual é enviado', async () => {
    const supabase = makeFakeSupabase(baseState());
    mockSession(supabase);
    const mapping = { dateColumn: 'F1', descriptionColumn: 'F2', amountColumn: 'F3', amountMode: 'card_positive_purchase' };
    const csv = 'F1;F2;F3\n05/07/2026;Loja Desconhecida;99,90\n';
    const res = await postImport(formDataWith({ file: csvFile(csv), sourceId: SOURCE_ID, mapping: JSON.stringify(mapping) }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.needsMapping).toBeUndefined();
    expect(body.rowCount).toBe(1);
    const insertedRow = supabase.state.finance_import_rows[0];
    expect(insertedRow.amount_cents).toBe(-9990);
  });

  it('processa colunas separadas de crédito e débito sem pedir mapeamento adicional', async () => {
    const supabase = makeFakeSupabase(baseState());
    mockSession(supabase);
    const csv = 'Data;Descricao;Debito;Credito\n05/07/2026;Supermercado Carrefour;"45,90";\n';
    const res = await postImport(formDataWith({ file: csvFile(csv), sourceId: SOURCE_ID }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.needsMapping).toBeUndefined();
    expect(supabase.state.finance_import_rows[0].amount_cents).toBe(-4590);
  });
});

describe('POST /api/finance/import — classificação automática', () => {
  it('sugere categoria conhecida com base no texto normalizado', async () => {
    const supabase = makeFakeSupabase(baseState());
    mockSession(supabase);
    const mapping = { dateColumn: 'Data', descriptionColumn: 'Descricao', amountColumn: 'Valor', amountMode: 'signed' };
    const res = await postImport(
      formDataWith({ file: csvFile(SIMPLE_CSV), sourceId: SOURCE_ID, mapping: JSON.stringify(mapping) })
    );
    expect(res.status).toBe(200);
    const row = supabase.state.finance_import_rows[0];
    const mercado = supabase.state.finance_categories.find((c) => c.slug === 'mercado')!;
    expect(row.suggested_category_id).toBe(mercado.id);
    expect(row.category_id).toBe(mercado.id);
    expect(row.classification_reason).toContain('supermercado');
  });

  it('descrição desconhecida permanece Não classificado, sem forçar categoria', async () => {
    const supabase = makeFakeSupabase(baseState());
    mockSession(supabase);
    const mapping = { dateColumn: 'Data', descriptionColumn: 'Descricao', amountColumn: 'Valor', amountMode: 'signed' };
    const csv = 'Data;Descricao;Valor\n05/07/2026;XPTO COMERCIO 998877;-10,00\n';
    const res = await postImport(formDataWith({ file: csvFile(csv), sourceId: SOURCE_ID, mapping: JSON.stringify(mapping) }));
    expect(res.status).toBe(200);
    const row = supabase.state.finance_import_rows[0];
    const naoClassificado = supabase.state.finance_categories.find((c) => c.slug === 'nao-classificado')!;
    expect(row.category_id).toBe(naoClassificado.id);
  });

  it('aplica regra aprendida do workspace em importação futura', async () => {
    const state = baseState();
    const alimentacao = state.finance_categories.find((c) => c.slug === 'alimentacao')!;
    state.finance_classification_rules = [
      { id: crypto.randomUUID(), workspace_id: WS, match_type: 'contains', match_text: 'xpto comercio', category_id: alimentacao.id, nature: null },
    ];
    const supabase = makeFakeSupabase(state);
    mockSession(supabase);
    const mapping = { dateColumn: 'Data', descriptionColumn: 'Descricao', amountColumn: 'Valor', amountMode: 'signed' };
    const csv = 'Data;Descricao;Valor\n05/07/2026;XPTO COMERCIO 998877;-10,00\n';
    const res = await postImport(formDataWith({ file: csvFile(csv), sourceId: SOURCE_ID, mapping: JSON.stringify(mapping) }));
    expect(res.status).toBe(200);
    const row = supabase.state.finance_import_rows[0];
    expect(row.category_id).toBe(alimentacao.id);
  });
});

describe('POST /api/finance/import — OFX', () => {
  it('processa um OFX SGML sintético com FITID', async () => {
    const supabase = makeFakeSupabase(baseState());
    mockSession(supabase);
    const res = await postImport(formDataWith({ file: ofxFile(SGML_OFX), sourceId: SOURCE_ID }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.rowCount).toBe(1);
    expect(supabase.state.finance_import_rows[0].fitid).toBe('FIT-001');
  });

  it('marca possível duplicidade quando o FITID já existe numa transação confirmada da mesma origem', async () => {
    const state = baseState();
    // SGML_OFX é um extrato de conta (sem CREDITCARDMSGSRSV1) — resolve para
    // a origem genérica de conta, com o id fixo já presente em baseState().
    state.finance_transactions = [
      { id: 'tx-existing', workspace_id: WS, source_id: GENERIC_ACCOUNT_SOURCE_ID, fitid: 'FIT-001', fingerprint: null },
    ];
    const supabase = makeFakeSupabase(state);
    mockSession(supabase);
    const res = await postImport(formDataWith({ file: ofxFile(SGML_OFX), sourceId: SOURCE_ID }));
    expect(res.status).toBe(200);
    expect(supabase.state.finance_import_rows[0].possible_duplicate_transaction_id).toBe('tx-existing');
  });
});

describe('POST /api/finance/import — reimportação idempotente', () => {
  it('mesmo arquivo (mesmo SHA-256) na mesma origem reabre a importação pendente existente em vez de criar outra', async () => {
    const supabase = makeFakeSupabase(baseState());
    mockSession(supabase);
    const mapping = { dateColumn: 'Data', descriptionColumn: 'Descricao', amountColumn: 'Valor', amountMode: 'signed' };
    const fd = () => formDataWith({ file: csvFile(SIMPLE_CSV), sourceId: SOURCE_ID, mapping: JSON.stringify(mapping) });

    const first = await postImport(fd());
    const firstBody = await first.json();
    expect(firstBody.reopened).toBe(false);

    const second = await postImport(fd());
    const secondBody = await second.json();
    expect(secondBody.reopened).toBe(true);
    expect(secondBody.importId).toBe(firstBody.importId);
    expect(supabase.state.finance_imports).toHaveLength(1);
    expect(supabase.state.finance_import_rows).toHaveLength(1);
  });

  it('arquivo já CONFIRMADO na mesma origem é rejeitado (409), nunca cria outra importação', async () => {
    const state = baseState();
    const supabase = makeFakeSupabase(state);
    mockSession(supabase);
    const mapping = { dateColumn: 'Data', descriptionColumn: 'Descricao', amountColumn: 'Valor', amountMode: 'signed' };
    const fd = () => formDataWith({ file: csvFile(SIMPLE_CSV), sourceId: SOURCE_ID, mapping: JSON.stringify(mapping) });

    const first = await postImport(fd());
    const firstBody = await first.json();
    // Simula confirmação (feita normalmente pela RPC confirm_finance_import).
    supabase.state.finance_imports.find((i) => i.id === firstBody.importId)!.status = 'confirmed';

    const second = await postImport(fd());
    expect(second.status).toBe(409);
    expect((await second.json()).errorCategory).toBe('duplicate_import');
    expect(supabase.state.finance_imports).toHaveLength(1);
  });

  it('corrida entre duas requisições simultâneas não duplica a importação (colisão de índice único tratada)', async () => {
    // Força o SHA a bater manipulando o hash esperado: como calculamos o
    // SHA-256 real do conteúdo, pré-inserimos o "vencedor" (outra requisição
    // concorrente que já inseriu o import) com o hash real do mesmo conteúdo.
    const content = SIMPLE_CSV;
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(content));
    const sha256 = Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
    const existing = {
      id: 'winner-import',
      workspace_id: WS,
      // Mesma origem que a requisição perdedora vai resolver para este CSV
      // (mapeamento amountMode 'signed', perfil genérico -> conta genérica).
      source_id: GENERIC_ACCOUNT_SOURCE_ID,
      file_name: 'extrato.csv',
      file_sha256: sha256,
      format: 'csv',
      status: 'pending_review',
      row_count: 1,
    };
    const state = { ...baseState(), finance_imports: [existing] };
    const supabase = makeFakeSupabase(state);
    mockSession(supabase);
    // Simula que a corrida faz o INSERT desta requisição colidir no índice único.
    supabase.forceImportInsertConflictOnce(true);

    const mapping = { dateColumn: 'Data', descriptionColumn: 'Descricao', amountColumn: 'Valor', amountMode: 'signed' };
    const res = await postImport(formDataWith({ file: csvFile(content), sourceId: SOURCE_ID, mapping: JSON.stringify(mapping) }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.reopened).toBe(true);
    expect(body.importId).toBe('winner-import');
    expect(supabase.state.finance_imports).toHaveLength(1);
  });
});

describe('POST /api/finance/import — duas compras legítimas idênticas', () => {
  it('preserva as duas linhas e marca a segunda como possível duplicidade da primeira (por impressão digital)', async () => {
    const supabase = makeFakeSupabase(baseState());
    mockSession(supabase);
    const mapping = { dateColumn: 'Data', descriptionColumn: 'Descricao', amountColumn: 'Valor', amountMode: 'signed' };
    const csv = 'Data;Descricao;Valor\n05/07/2026;Padaria;-10,00\n05/07/2026;Padaria;-10,00\n';
    const res = await postImport(formDataWith({ file: csvFile(csv), sourceId: SOURCE_ID, mapping: JSON.stringify(mapping) }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.rowCount).toBe(2);
    expect(supabase.state.finance_import_rows).toHaveLength(2);
    const [first, second] = supabase.state.finance_import_rows;
    expect(second.possible_duplicate_import_row_id).toBe(first.id);
    expect(first.possible_duplicate_import_row_id).toBeNull();
  });
});

describe('POST /api/finance/import — privacidade e dados sensíveis', () => {
  it('a resposta nunca contém o conteúdo bruto do arquivo', async () => {
    const supabase = makeFakeSupabase(baseState());
    mockSession(supabase);
    const mapping = { dateColumn: 'Data', descriptionColumn: 'Descricao', amountColumn: 'Valor', amountMode: 'signed' };
    const res = await postImport(formDataWith({ file: csvFile(SIMPLE_CSV), sourceId: SOURCE_ID, mapping: JSON.stringify(mapping) }));
    const bodyText = await res.text();
    expect(bodyText).not.toContain(SIMPLE_CSV);
    expect(bodyText).not.toContain('Data;Descricao;Valor');
  });

  it('o nome original do arquivo (pode carregar identificador de conta) nunca é persistido nem retornado — só um nome seguro derivado do perfil e do intervalo de datas', async () => {
    const supabase = makeFakeSupabase(baseState());
    mockSession(supabase);
    const sensitiveFileName = 'NU_584626107_01JUN2026_30JUN2026.csv';
    const res = await postImport(formDataWith({ file: csvFile(NUBANK_ACCOUNT_CSV, sensitiveFileName) }));
    const body = await res.json();

    expect(res.status).toBe(200);
    const bodyText = JSON.stringify(body);
    expect(bodyText).not.toContain('584626107');
    expect(bodyText).not.toContain(sensitiveFileName);

    const storedImport = supabase.state.finance_imports.find((i) => i.id === body.importId)!;
    expect(storedImport.file_name).not.toContain('584626107');
    expect(storedImport.file_name).not.toContain(sensitiveFileName);
    expect(storedImport.file_name).toBe('Extrato Nubank • 01/06/2026 a 20/06/2026');
  });
});

describe('POST /api/finance/import — origem interna automática (seção 6/4 do pedido)', () => {
  it('fatura Nubank (date,title,amount) é reconhecida automaticamente e recebe a origem interna "Nubank • Cartão", sem pedir mapeamento', async () => {
    const supabase = makeFakeSupabase(baseState());
    mockSession(supabase);
    const res = await postImport(formDataWith({ file: csvFile(NUBANK_CREDIT_CARD_CSV, 'fatura.csv') }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.needsMapping).toBeUndefined();
    expect(body.profile).toBe('nubank_credit_card_statement');
    expect(body.sourceName).toBe('Nubank • Cartão');
    expect(supabase.state.finance_import_rows[0].source_amount_cents).not.toBeNull();
  });

  it('extrato Nubank (Data,Valor,Identificador,Descrição) é reconhecido automaticamente e recebe a origem interna "Nubank • Conta", sem pedir mapeamento', async () => {
    const supabase = makeFakeSupabase(baseState());
    mockSession(supabase);
    const res = await postImport(formDataWith({ file: csvFile(NUBANK_ACCOUNT_CSV, 'extrato.csv') }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.needsMapping).toBeUndefined();
    expect(body.profile).toBe('nubank_account_statement');
    expect(body.sourceName).toBe('Nubank • Conta');
  });

  it('nunca resolve uma origem antiga vinculada a pessoa para os perfis automáticos', async () => {
    const state = {
      ...baseState(),
      // Mesmo com uma origem legada presente no workspace, o novo fluxo
      // nunca a seleciona — a resolução é só por perfil detectado.
      finance_sources: [
        ...baseState().finance_sources,
        { id: 'legacy-1', workspace_id: WS, kind: 'card', name: 'Cartão Nubank Lucas', provider: null, status: 'legacy' },
      ],
    };
    const supabase = makeFakeSupabase(state);
    mockSession(supabase);
    const res = await postImport(formDataWith({ file: csvFile(NUBANK_CREDIT_CARD_CSV, 'fatura.csv') }));
    const body = await res.json();
    expect(body.sourceName).toBe('Nubank • Cartão');
    expect(body.sourceName).not.toBe('Cartão Nubank Lucas');
  });

  it('dois perfis Nubank diferentes no mesmo lote (duas requisições sequenciais) são reconhecidos e recebem origens internas distintas', async () => {
    const supabase = makeFakeSupabase(baseState());
    mockSession(supabase);

    const cardRes = await postImport(formDataWith({ file: csvFile(NUBANK_CREDIT_CARD_CSV, 'fatura.csv') }));
    const cardBody = await cardRes.json();
    const accountRes = await postImport(formDataWith({ file: csvFile(NUBANK_ACCOUNT_CSV, 'extrato.csv') }));
    const accountBody = await accountRes.json();

    expect(cardBody.profile).toBe('nubank_credit_card_statement');
    expect(accountBody.profile).toBe('nubank_account_statement');
    expect(cardBody.importId).not.toBe(accountBody.importId);

    const cardImport = supabase.state.finance_imports.find((i) => i.id === cardBody.importId)!;
    const accountImport = supabase.state.finance_imports.find((i) => i.id === accountBody.importId)!;
    expect(cardImport.source_id).not.toBe(accountImport.source_id);
  });

  it('um arquivo inválido no lote não impede o processamento dos demais (chamadas independentes)', async () => {
    const supabase = makeFakeSupabase(baseState());
    mockSession(supabase);

    const invalidRes = await postImport(formDataWith({ file: new File(['x'], 'nota.txt') }));
    const validRes = await postImport(formDataWith({ file: csvFile(NUBANK_CREDIT_CARD_CSV, 'fatura.csv') }));

    expect(invalidRes.status).toBe(415);
    expect(validRes.status).toBe(200);
    expect((await validRes.json()).profile).toBe('nubank_credit_card_statement');
  });
});
