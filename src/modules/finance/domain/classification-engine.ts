import type { FinanceNature } from './finance-transaction.schema';
import { FALLBACK_FINANCE_CATEGORY_SLUG } from './finance-category.schema';

/**
 * Classificador local, determinístico e explicável (seção 6 do pedido).
 * Regras aprendidas (por workspace) têm prioridade sobre um conjunto
 * pequeno de regras seed conservadoras. Sem correspondência segura, a
 * transação permanece "Não classificado" — nunca força uma categoria.
 */

export interface LearnedClassificationRule {
  matchType: 'exact' | 'contains';
  matchText: string; // já normalizado
  categorySlug: string;
  nature: FinanceNature | null;
}

export interface ClassificationSuggestion {
  categorySlug: string;
  nature: FinanceNature | null;
  reason: string;
  matchedRule: 'learned' | 'seed' | 'none';
}

const SEED_CATEGORY_RULES: ReadonlyArray<{ keywords: string[]; categorySlug: string }> = [
  {
    categorySlug: 'mercado',
    keywords: ['supermercado', 'mercado', 'atacadao', 'assai', 'carrefour', 'pao de acucar', 'extra hiper', 'dia supermercado', 'hortifruti'],
  },
  {
    categorySlug: 'alimentacao',
    keywords: ['ifood', 'restaurante', 'lanchonete', 'padaria', 'pizzaria', 'hamburgueria', 'cafeteria'],
  },
  {
    categorySlug: 'transporte',
    keywords: ['uber', '99app', 'posto ', 'combustivel', 'estacionamento', 'pedagio'],
  },
  {
    categorySlug: 'saude',
    keywords: ['farmacia', 'drogaria', 'drogasil', 'droga raia', 'pague menos', 'laboratorio'],
  },
  {
    categorySlug: 'assinaturas',
    keywords: ['netflix', 'spotify', 'amazon prime', 'disney plus', 'hbo max', 'youtube premium', 'icloud'],
  },
  {
    categorySlug: 'servicos-e-tarifas',
    keywords: ['tarifa', 'anuidade', 'iof', 'juros rotativo', 'juros de mora'],
  },
];

const SEED_NATURE_RULES: ReadonlyArray<{ keywords: string[]; nature: FinanceNature }> = [
  {
    nature: 'invoice_payment',
    keywords: ['pagamento de fatura', 'pagto fatura', 'pagamento fatura cartao'],
  },
  {
    // Pix é propositalmente excluído daqui: pode ser tanto uma transferência
    // (repasse entre Lucas e Matheus) quanto uma despesa (Pix para
    // estabelecimento) — nenhum dos dois é uma suposição segura só pelo
    // texto "pix enviado", então a natureza padrão (compra, pelo sinal do
    // valor) prevalece e a revisão manual decide. TED/DOC entre contas são
    // movimentações não ambíguas.
    nature: 'transfer',
    keywords: ['transferencia', 'ted ', 'doc '],
  },
];

function findMatch(normalizedDescription: string, keywords: string[]): string | undefined {
  return keywords.find((keyword) => normalizedDescription.includes(keyword));
}

export function classifyTransaction(
  normalizedDescription: string,
  learnedRules: readonly LearnedClassificationRule[]
): ClassificationSuggestion {
  const exactRule = learnedRules.find((rule) => rule.matchType === 'exact' && rule.matchText === normalizedDescription);
  if (exactRule) {
    return {
      categorySlug: exactRule.categorySlug,
      nature: exactRule.nature,
      reason: `Regra aprendida: igual a "${exactRule.matchText}"`,
      matchedRule: 'learned',
    };
  }
  const containsRule = learnedRules.find(
    (rule) => rule.matchType === 'contains' && normalizedDescription.includes(rule.matchText)
  );
  if (containsRule) {
    return {
      categorySlug: containsRule.categorySlug,
      nature: containsRule.nature,
      reason: `Regra aprendida: contém "${containsRule.matchText}"`,
      matchedRule: 'learned',
    };
  }

  let natureHit: { nature: FinanceNature; keyword: string } | undefined;
  for (const rule of SEED_NATURE_RULES) {
    const keyword = findMatch(normalizedDescription, rule.keywords);
    if (keyword) {
      natureHit = { nature: rule.nature, keyword: keyword.trim() };
      break;
    }
  }

  for (const rule of SEED_CATEGORY_RULES) {
    const keyword = findMatch(normalizedDescription, rule.keywords);
    if (keyword) {
      const reason = natureHit
        ? `Contém "${keyword.trim()}" (categoria) e "${natureHit.keyword}" (natureza)`
        : `Contém "${keyword.trim()}"`;
      return { categorySlug: rule.categorySlug, nature: natureHit?.nature ?? null, reason, matchedRule: 'seed' };
    }
  }

  if (natureHit) {
    return {
      categorySlug: FALLBACK_FINANCE_CATEGORY_SLUG,
      nature: natureHit.nature,
      reason: `Contém "${natureHit.keyword}"`,
      matchedRule: 'seed',
    };
  }

  return {
    categorySlug: FALLBACK_FINANCE_CATEGORY_SLUG,
    nature: null,
    reason: 'Nenhuma regra correspondente',
    matchedRule: 'none',
  };
}

/** Natureza padrão quando nenhuma regra sugere uma: sinal do valor decide. */
export function defaultNatureForAmount(amountCents: number): FinanceNature {
  return amountCents < 0 ? 'purchase' : 'unidentified_credit';
}
