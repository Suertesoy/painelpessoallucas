import { normalizeText } from '@/modules/finance/domain/normalize-text';

/**
 * Categoria (natureza do gasto) dos lançamentos de fatura e das despesas
 * pontuais. Cada lançamento tem UMA categoria; classificar é só rotular e
 * nunca altera valores nem a conciliação.
 *
 * A fonte de verdade das categorias é a lista do workspace
 * (`finance_item_categories`): ids estáveis + nomes editáveis. As categorias
 * abaixo são apenas a LISTA INICIAL semeada uma vez; depois disso o usuário
 * cria, renomeia e exclui. Esta lista é do domínio de FATURAS e não se mistura
 * com a tabela do módulo antigo de transações (`finance_categories`).
 *
 * "Finalidade" (pessoal/doméstico/profissional) não faz mais parte da
 * experiência: o campo `purpose` e os dados históricos são preservados, mas
 * nada novo o exige.
 */

export interface Category {
  id: string;
  label: string;
}

export const DEFAULT_CATEGORIES: readonly Category[] = [
  { id: 'groceries', label: 'Mercado' },
  { id: 'restaurants', label: 'Restaurantes e delivery' },
  { id: 'shopping', label: 'Compras online' },
  { id: 'streaming', label: 'Streaming' },
  { id: 'subscriptions', label: 'Assinaturas e aplicativos' },
  { id: 'leisure', label: 'Lazer' },
  { id: 'housing', label: 'Moradia e contas' },
  { id: 'transport', label: 'Transporte' },
  { id: 'health', label: 'Saúde' },
  { id: 'travel', label: 'Viagens' },
  { id: 'other', label: 'Outros' },
];

/**
 * Ids antigos que não existem mais como categoria própria. Valem como o id da
 * direita quando ele existe no workspace (só para leitura e sugestões; nada é regravado).
 */
export const LEGACY_CATEGORY_ALIAS: Readonly<Record<string, string>> = {
  ai: 'subscriptions',
  infrastructure: 'subscriptions',
  software: 'subscriptions',
};

export const PURPOSES = [
  { id: 'personal', label: 'Pessoal' },
  { id: 'household', label: 'Doméstico' },
  { id: 'professional', label: 'Profissional' },
] as const;

export type PurposeId = (typeof PURPOSES)[number]['id'];

const PURPOSE_IDS: readonly string[] = PURPOSES.map((p) => p.id);

export const isPurposeId = (v: unknown): v is PurposeId => typeof v === 'string' && PURPOSE_IDS.includes(v);

/** Nome exibido de uma categoria na lista do workspace (padrão: a lista inicial). */
export function categoryLabel(id: string | null, categories: readonly Category[] = DEFAULT_CATEGORIES): string {
  if (!id) return 'Sem categoria';
  const resolved = resolveCategoryId(id, categories);
  return categories.find((c) => c.id === resolved)?.label ?? 'Sem categoria';
}

/** Id efetivo: o próprio, se existir na lista; senão o alias de um id antigo; senão null. */
export function resolveCategoryId(id: string | null, categories: readonly Category[]): string | null {
  if (!id) return null;
  if (categories.some((c) => c.id === id)) return id;
  const alias = LEGACY_CATEGORY_ALIAS[id];
  return alias && categories.some((c) => c.id === alias) ? alias : null;
}

export function purposeLabel(id: string | null): string {
  if (!id) return 'Não classificada';
  return PURPOSES.find((p) => p.id === id)?.label ?? id;
}

const TECH_IDS: readonly string[] = ['ai', 'infrastructure', 'software'];
const DEFAULT_IDS: readonly string[] = DEFAULT_CATEGORIES.map((c) => c.id);

/** Id conhecido pelo código: da lista inicial ou legado (as palavras-chave ainda sugerem ids legados). */
export const isKnownCategoryId = (v: unknown): v is string => typeof v === 'string' && (DEFAULT_IDS.includes(v) || TECH_IDS.includes(v));

/** Compatibilidade com consultas antigas: categoria de tecnologia (ids legados). */
export function isTechCategory(id: string | null): boolean {
  return id !== null && TECH_IDS.includes(id);
}

/** Compatibilidade: categoria de tecnologia (legada) OU finalidade profissional. Não usado na interface. */
export function isTechOrProfessional(item: { category: string | null; purpose: string | null }): boolean {
  return isTechCategory(item.category) || item.purpose === 'professional';
}

/** Serviços de streaming (vídeo, música): base das sugestões para a categoria Streaming. */
export const STREAMING_KEYWORDS = ['netflix', 'spotify', 'amazonprime', 'amazon prime', 'prime video', 'disney', 'hbo', 'youtube', 'globoplay', 'deezer', 'paramount', 'max.com', 'apple tv', 'crunchyroll'];

/**
 * Palavras-chave por categoria. São apenas SUGESTÕES (o usuário aceita ou
 * altera); nunca definem a classificação sozinhas. Estabelecimentos sem
 * regra clara (ex.: "Apple.Com/Bill") ficam sem sugestão — "a confirmar".
 */
const KEYWORD_RULES: { category: string; keywords: string[] }[] = [
  { category: 'infrastructure', keywords: ['vercel', 'github', 'cloudflare', 'supabase', 'digitalocean', 'hostinger', 'godaddy', 'namecheap', 'railway', 'netlify', 'amazon web', 'aws', 'registro br', 'hostgator'] },
  { category: 'ai', keywords: ['openai', 'chatgpt', 'anthropic', 'claude', 'magnific', 'midjourney', 'cursor', 'runway', 'elevenlabs', 'perplexity', 'gemini', 'copilot', 'g1ai'] },
  { category: 'software', keywords: ['google one', 'workana', 'adobe', 'figma', 'notion', 'canva', 'dropbox', 'microsoft', 'zoom', 'slack', 'jetbrains', 'icloud'] },
  { category: 'streaming', keywords: STREAMING_KEYWORDS },
  { category: 'leisure', keywords: ['cinema', 'cinemark', 'ingresso', 'ticketmaster', 'sympla', 'steam', 'playstation', 'xbox', 'nintendo', 'boliche', 'teatro'] },
  // Compras online vem antes de Mercado: "mercadolivre" contém "mercado".
  { category: 'shopping', keywords: ['mercadolivre', 'mercado livre', 'amazonmktplc', 'magalu', 'shopee', 'havan', 'americanas', 'kabum', 'aliexpress', 'shein'] },
  { category: 'restaurants', keywords: ['ifood', 'restaurante', 'lanchonete', 'pizzaria', 'hamburgueria', 'mcdonald', 'burger', 'cafeteria', 'sorveteria', 'rappi'] },
  { category: 'groceries', keywords: ['mercado', 'supermercado', 'padaria', 'atacad', 'hortifruti', 'acougue', 'carrefour', 'assai', 'saralua', 'imperatr'] },
  { category: 'transport', keywords: ['uber', '99app', '99 ', 'posto', 'shell', 'ipiranga', 'estacionamento', 'pedagio', 'sem parar', 'conectcar'] },
  { category: 'travel', keywords: ['hotel', 'airbnb', 'booking', 'latam', 'azul linhas', 'gol linhas', 'aeroporto', 'decolar', 'cvc'] },
  { category: 'health', keywords: ['drogaria', 'farmacia', 'drogasil', 'raia', 'pague menos', 'hospital', 'clinica', 'laboratorio', 'odonto'] },
  { category: 'housing', keywords: ['enel', 'sabesp', 'condominio', 'aluguel', 'seguro', 'claro', 'vivo', 'tim ', 'internet'] },
];

export type SuggestionSource = 'history' | 'rule';

export interface ClassificationSuggestion {
  /** Id nativo ou, via histórico, de uma categoria personalizada. */
  category: string | null;
  purpose: PurposeId | null;
  source: SuggestionSource;
}

export interface ClassifiableItem {
  id: string;
  /** Descrição normalizada da COMPRA (sem sufixo de parcela). */
  key: string;
  category: string | null;
  purpose: string | null;
}

/** Chave de comparação do estabelecimento: descrição-base normalizada. */
export function merchantKey(baseDescription: string): string {
  return normalizeText(baseDescription);
}

function ruleCategory(key: string): string | null {
  const padded = ` ${key} `;
  for (const rule of KEYWORD_RULES) {
    if (rule.keywords.some((k) => padded.includes(k.length <= 3 ? ` ${k.trim()} ` : k.trim()))) return rule.category;
  }
  return null;
}

/**
 * Sugestão para um lançamento ainda sem classificação:
 *  1. HISTÓRICO — o que você já confirmou para o mesmo estabelecimento (só
 *     se for consistente; se houver conflito, não sugere).
 *  2. REGRA — palavra-chave da descrição (só categoria; finalidade nunca é
 *     presumida por regra).
 */
export function suggestClassification(
  item: Pick<ClassifiableItem, 'key' | 'category' | 'purpose'>,
  all: readonly ClassifiableItem[],
  /** Ids de categorias criadas pelo usuário: também valem como histórico confirmado. */
  extraCategoryIds: readonly string[] = []
): ClassificationSuggestion | null {
  const missingCategory = item.category === null;
  const missingPurpose = item.purpose === null;
  if (!missingCategory && !missingPurpose) return null;

  const peers = all.filter((o) => o.key === item.key && (o.category !== null || o.purpose !== null));
  const categories = new Set(peers.map((p) => p.category).filter((c): c is string => c !== null));
  const purposes = new Set(peers.map((p) => p.purpose).filter((c): c is string => c !== null));
  const histCategory = missingCategory && categories.size === 1 ? [...categories][0] : null;
  const histPurpose = missingPurpose && purposes.size === 1 ? [...purposes][0] : null;

  const histCategoryOk = histCategory !== null && (isKnownCategoryId(histCategory) || extraCategoryIds.includes(histCategory));
  if (histCategoryOk || isPurposeId(histPurpose)) {
    return {
      category: histCategoryOk ? (histCategory as string) : null,
      purpose: isPurposeId(histPurpose) ? histPurpose : null,
      source: 'history',
    };
  }
  if (missingCategory) {
    const rule = ruleCategory(item.key);
    if (rule) return { category: rule, purpose: null, source: 'rule' };
  }
  return null;
}
